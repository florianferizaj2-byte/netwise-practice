import { integer, pointsError } from './money.js';

export function pointWalletSnapshot(store,userId,wallet=store.points.wallet(userId)) {
  const revision=store.db.prepare('SELECT COALESCE(MAX(rowid),0) AS revision FROM ai_points_journal WHERE user_id=?').get(userId).revision;
  return {...wallet,ledgerRevision:integer(revision,'账本版本'),snapshotAt:Date.now()};
}

// Receipts are correlated by the caller-generated HTTP UUID (also used by SSE)
// or by an owned background job's existing billing key. Never infer a task's
// charge from a wallet delta: gifts, other devices and parallel tasks can race.
export function userPointReceipt(store, userId, {requestId, jobId}) {
  return store.points.transaction(()=>{
  const rows = jobId
    ? store.db.prepare('SELECT id,feature,state,held_units AS heldUnits,charged_units AS chargedUnits,error,created_at AS createdAt FROM ai_points_operations WHERE user_id=? AND logical_key=? ORDER BY created_at,rowid LIMIT 101').all(userId, `question-job:${jobId}`)
    : store.db.prepare('SELECT id,feature,state,held_units AS heldUnits,charged_units AS chargedUnits,error,created_at AS createdAt FROM ai_points_operations WHERE user_id=? AND logical_key LIKE ? ORDER BY created_at,rowid LIMIT 101').all(userId, `http:${requestId}:%`);
  if (rows.length > 100) throw pointsError('这次请求的账单较多，请到积分记录核对', 'AI_POINTS_RECEIPT_TOO_LARGE');
  const calls = rows.length ? store.db.prepare(`SELECT operation_id AS operationId,model,task_type AS taskType FROM ai_points_calls WHERE user_id=? AND operation_id IN(${rows.map(()=>'?').join(',')}) ORDER BY created_at,rowid`).all(userId,...rows.map(row=>row.id)) : [];
  const sum = (pick) => rows.reduce((total,row)=>integer(total+pick(row),'积分汇总'),0);
  return { found: rows.length>0, operations: rows, calls, wallet: pointWalletSnapshot(store,userId),
    chargedUnits: sum(row=>row.state==='settled'?row.chargedUnits:0),
    heldUnits: sum(row=>row.state==='pending'?row.heldUnits:0),
    refundedUnits: sum(row=>row.state==='refunded'?row.heldUnits:0),
    releasedUnits: sum(row=>row.state==='settled'?Math.max(0,row.heldUnits-row.chargedUnits):0),
    pending: rows.some(row=>row.state==='pending'),
  };
  });
}

const since=days=>new Date(Date.now()-days*86400000).toISOString();
const like=value=>`%${value.replace(/[\\%_]/g,char=>'\\'+char)}%`;
export function pointsUsageReport(store,{days=30,search='',limit=30,offset=0}={}) {
  integer(days,'天数',{min:1,max:365});integer(limit,'分页',{min:1,max:100});integer(offset,'分页位置',{max:1000000});
  const db=store.db,start=since(days),pattern=like(search);
  const cte=`WITH identities AS (
    SELECT id AS user_id FROM users UNION SELECT user_id FROM ai_points_grants
    UNION SELECT user_id FROM ai_points_operations UNION SELECT user_id FROM user_usage
  ), calls AS (
    SELECT user_id,COUNT(*) AS calls,SUM(success) AS successfulCalls,
      COALESCE(SUM(json_extract(usage,'$.prompt_tokens')),0) AS inputTokens,
      COALESCE(SUM(json_extract(usage,'$.completion_tokens')),0) AS outputTokens,
      COALESCE(SUM(json_extract(usage,'$.cached_prompt_tokens')),0) AS cachedTokens,
      COALESCE(SUM(cost_micros),0) AS costMicros,SUM(needs_review) AS costReviewCalls,
      SUM(CASE WHEN measured=0 THEN 1 ELSE 0 END) AS unknownTokenCalls
    FROM ai_points_calls WHERE created_at>=? GROUP BY user_id
  ), legacy AS (
    SELECT user_id,COUNT(*) AS legacyCalls,
      COALESCE(SUM(json_extract(data,'$.prompt_tokens')),0) AS inputTokens,
      COALESCE(SUM(json_extract(data,'$.completion_tokens')),0) AS outputTokens,
      COALESCE(SUM(json_extract(data,'$.cached_prompt_tokens')),0) AS cachedTokens,
      SUM(CASE WHEN json_type(data,'$.estimatedCostCny') IN('integer','real') THEN 0 ELSE 1 END) AS legacyUnknownCostCalls
    FROM user_usage WHERE json_extract(data,'$.pointsCallId') IS NULL
      AND json_extract(data,'$.createdAt')>=? GROUP BY user_id
  ), operations AS (
    SELECT user_id,SUM(charged_units) AS chargedUnits,
      SUM(CASE WHEN state='refunded' THEN held_units ELSE 0 END) AS refundedUnits,
      SUM(CASE WHEN state='pending' THEN 1 ELSE 0 END) AS pendingTasks,
      SUM(CASE WHEN state='refunded' THEN 1 ELSE 0 END) AS failedTasks
    FROM ai_points_operations WHERE created_at>=? GROUP BY user_id
  )`;
  const where="WHERE (?='' OR i.user_id LIKE ? ESCAPE '\\' OR COALESCE(u.username,'') LIKE ? ESCAPE '\\')";
  const params=[start,start,start,search,pattern,pattern];
  const total=db.prepare(`${cte} SELECT COUNT(*) AS n FROM identities i LEFT JOIN users u ON u.id=i.user_id ${where}`).get(...params).n;
  const rows=db.prepare(`${cte} SELECT i.user_id AS userId,COALESCE(u.username,i.user_id) AS username,
    COALESCE(c.calls,0) AS calls,COALESCE(c.successfulCalls,0) AS successfulCalls,
    COALESCE(c.inputTokens,0)+COALESCE(l.inputTokens,0) AS inputTokens,COALESCE(c.outputTokens,0)+COALESCE(l.outputTokens,0) AS outputTokens,
    COALESCE(c.cachedTokens,0)+COALESCE(l.cachedTokens,0) AS cachedTokens,COALESCE(c.costMicros,0) AS costMicros,
    COALESCE(c.costReviewCalls,0) AS costReviewCalls,COALESCE(c.unknownTokenCalls,0) AS unknownTokenCalls,
    COALESCE(l.legacyCalls,0) AS legacyCalls,COALESCE(l.legacyUnknownCostCalls,0) AS legacyUnknownCostCalls,
    COALESCE(o.chargedUnits,0) AS chargedUnits,COALESCE(o.refundedUnits,0) AS refundedUnits,
    COALESCE(o.pendingTasks,0) AS pendingTasks,COALESCE(o.failedTasks,0) AS failedTasks
    FROM identities i LEFT JOIN users u ON u.id=i.user_id LEFT JOIN calls c ON c.user_id=i.user_id
    LEFT JOIN legacy l ON l.user_id=i.user_id LEFT JOIN operations o ON o.user_id=i.user_id ${where}
    ORDER BY COALESCE(c.costMicros,0) DESC,COALESCE(c.calls,0) DESC,i.user_id LIMIT ? OFFSET ?`).all(...params,limit,offset)
    .map(row=>({...row,wallet:store.points.wallet(row.userId)}));
  const totals=db.prepare(`SELECT COUNT(*) AS calls,COALESCE(SUM(json_extract(usage,'$.prompt_tokens')),0) AS inputTokens,COALESCE(SUM(json_extract(usage,'$.completion_tokens')),0) AS outputTokens,COALESCE(SUM(needs_review),0) AS reviewCalls FROM ai_points_calls WHERE created_at>=?`).get(start);
  const history=db.prepare("SELECT COUNT(*) AS calls,COALESCE(SUM(CASE WHEN json_type(data,'$.estimatedCostCny') IN('integer','real') THEN 0 ELSE 1 END),0) AS unknownCostCalls FROM user_usage WHERE json_extract(data,'$.pointsCallId') IS NULL").get();
  const breakdown=db.prepare('SELECT task_type AS taskType,model,COUNT(*) AS calls,COALESCE(SUM(cost_micros),0) AS costMicros,COALESCE(SUM(json_extract(usage,\'$.prompt_tokens\')),0) AS inputTokens,COALESCE(SUM(json_extract(usage,\'$.completion_tokens\')),0) AS outputTokens FROM ai_points_calls WHERE created_at>=? GROUP BY task_type,model ORDER BY costMicros DESC').all(start);
  return {rows,total,limit,offset,nextOffset:offset+rows.length<total?offset+rows.length:null,days,start,totals,history,breakdown,finance:store.points.finance(),audit:store.points.audit()};
}
export function userPointOperations(store,userId,{limit=30,offset=0,state}={}) {
  integer(limit,'分页',{min:1,max:100});integer(offset,'分页位置',{max:1000000});
  if(state!==undefined&&!['all','pending','settled','refunded'].includes(state))throw pointsError('积分记录状态无效','AI_POINTS_INVALID_STATE',400);
  // Explicit state (including "all") requests the actual points ledger, not
  // legacy unbilled usage. Filter BEFORE counting/paging, always by this user.
  const filtered=state&&state!=='all',where='user_id=?'+(filtered?' AND state=?':''),params=filtered?[userId,state]:[userId];
  const operationTotal=store.db.prepare('SELECT COUNT(*) AS n FROM ai_points_operations WHERE '+where).get(...params).n;
  const legacyTotal=state!==undefined?0:store.db.prepare("SELECT COUNT(*) AS n FROM user_usage WHERE user_id=? AND json_extract(data,'$.pointsCallId') IS NULL").get(userId).n;
  const total=Math.max(operationTotal,legacyTotal);
  const rows=store.db.prepare('SELECT id,feature,certificate_id AS certificateId,state,held_units AS heldUnits,charged_units AS chargedUnits,cost_micros AS costMicros,error,created_at AS createdAt,updated_at AS updatedAt FROM ai_points_operations WHERE '+where+' ORDER BY created_at DESC,rowid DESC LIMIT ? OFFSET ?').all(...params,limit,offset);
  const calls=store.db.prepare('SELECT c.id,c.operation_id AS operationId,c.task_type AS taskType,c.model,c.provider,c.state,c.upper_cost_micros AS upperCostMicros,c.cost_micros AS costMicros,c.usage,c.measured,c.cost_verified AS costVerified,c.success,c.needs_review AS needsReview,c.reconciliation,c.created_at AS createdAt FROM ai_points_calls c WHERE c.operation_id IN(SELECT id FROM ai_points_operations WHERE '+where+' ORDER BY created_at DESC,rowid DESC LIMIT ? OFFSET ?) ORDER BY c.created_at DESC,c.rowid DESC').all(...params,limit,offset)
    .map(row=>({...row,usage:row.usage?JSON.parse(row.usage):null,reconciliation:row.reconciliation?JSON.parse(row.reconciliation):null}));
  const legacyRows=state!==undefined?[]:store.db.prepare("SELECT id,json_extract(data,'$.createdAt') AS createdAt,json_extract(data,'$.model') AS model,json_extract(data,'$.taskType') AS taskType,json_extract(data,'$.prompt_tokens') AS inputTokens,json_extract(data,'$.completion_tokens') AS outputTokens,json_extract(data,'$.hasUsage') AS hasUsage,json_extract(data,'$.estimatedCostCny') AS estimatedCostCny FROM user_usage WHERE user_id=? AND json_extract(data,'$.pointsCallId') IS NULL ORDER BY rowid DESC LIMIT ? OFFSET ?").all(userId,limit,offset);
  return {rows,calls,legacyRows,legacyTotal,operationTotal,total,limit,offset,nextOffset:offset+limit<total?offset+limit:null,wallet:store.points.wallet(userId)};
}
