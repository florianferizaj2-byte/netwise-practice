import crypto from 'node:crypto';
import {initializeCheckInSchema} from './check-in-policy.js';
import { integer, chargeUnits, costAllowance, tokenCost, pointsError, POINT_SCALE, SERVICE_MARGIN_BPS, pointLiabilityMicros } from './money.js';
import { normalizeProvider, resolveRateCard, validRateCard } from './pricing.js';

const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const uuid = () => crypto.randomUUID();
const fail = (message, code, status) => { throw pointsError(message, code, status); };

export function createPointsStore(db, { now = Date.now } = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_points_controls (
      id INTEGER PRIMARY KEY CHECK(id=1), margin_bps INTEGER NOT NULL CHECK(margin_bps BETWEEN 0 AND 9500),
      revision INTEGER NOT NULL DEFAULT 0);
    INSERT OR IGNORE INTO ai_points_controls VALUES(1,7000,0);
    CREATE TABLE IF NOT EXISTS ai_points_grants (
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL,source_key TEXT NOT NULL,kind TEXT NOT NULL,
      units INTEGER NOT NULL CHECK(units>0),remaining_units INTEGER NOT NULL CHECK(remaining_units>=0),
      held_units INTEGER NOT NULL DEFAULT 0 CHECK(held_units>=0 AND held_units<=remaining_units),
      expires_at TEXT,created_at TEXT NOT NULL, UNIQUE(user_id,source_key));
    CREATE INDEX IF NOT EXISTS ai_points_grants_user ON ai_points_grants(user_id,expires_at);
    CREATE TABLE IF NOT EXISTS ai_points_operations (
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL,request_key TEXT NOT NULL,signature TEXT NOT NULL,
      logical_key TEXT NOT NULL,attempt INTEGER NOT NULL DEFAULT 0,
      feature TEXT NOT NULL,certificate_id TEXT,state TEXT NOT NULL CHECK(state IN('pending','settled','refunded')),
      held_units INTEGER NOT NULL DEFAULT 0 CHECK(held_units>=0),charged_units INTEGER NOT NULL DEFAULT 0 CHECK(charged_units>=0),
      cost_micros INTEGER NOT NULL DEFAULT 0 CHECK(cost_micros>=0),margin_bps INTEGER NOT NULL,
      lease_until TEXT NOT NULL,result TEXT,error TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
      UNIQUE(user_id,request_key));
    CREATE INDEX IF NOT EXISTS ai_points_operations_user ON ai_points_operations(user_id,created_at);
    CREATE TABLE IF NOT EXISTS ai_points_allocations (
      operation_id TEXT NOT NULL,grant_id TEXT NOT NULL,held_units INTEGER NOT NULL CHECK(held_units>=0),
      PRIMARY KEY(operation_id,grant_id));
    CREATE TABLE IF NOT EXISTS ai_points_calls (
      id TEXT PRIMARY KEY,operation_id TEXT NOT NULL,user_id TEXT NOT NULL,task_type TEXT NOT NULL,
      provider TEXT NOT NULL,model TEXT NOT NULL,rate_card TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN('pending','finished')),upper_cost_micros INTEGER NOT NULL CHECK(upper_cost_micros>=0),
      input_limit INTEGER NOT NULL,output_limit INTEGER NOT NULL,cost_micros INTEGER CHECK(cost_micros>=0),
      usage TEXT,measured INTEGER NOT NULL DEFAULT 0,success INTEGER NOT NULL DEFAULT 0,
      needs_review INTEGER NOT NULL DEFAULT 0,cost_verified INTEGER NOT NULL DEFAULT 0,
      reconciliation TEXT,created_at TEXT NOT NULL,finished_at TEXT);
    CREATE INDEX IF NOT EXISTS ai_points_calls_user ON ai_points_calls(user_id,created_at);
    CREATE INDEX IF NOT EXISTS ai_points_calls_operation ON ai_points_calls(operation_id);
    CREATE TABLE IF NOT EXISTS ai_points_journal (
      id TEXT PRIMARY KEY,entry_key TEXT UNIQUE NOT NULL,user_id TEXT NOT NULL,operation_id TEXT,
      kind TEXT NOT NULL,delta_units INTEGER NOT NULL,held_units INTEGER NOT NULL DEFAULT 0,
      released_units INTEGER NOT NULL DEFAULT 0,description TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ai_points_finance (
      id TEXT PRIMARY KEY,entry_key TEXT UNIQUE NOT NULL,kind TEXT NOT NULL CHECK(kind IN('revenue','expense')),
      amount_micros INTEGER NOT NULL CHECK(amount_micros>0),user_id TEXT,reference TEXT NOT NULL,
      created_by TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS ai_points_finance_receipt ON ai_points_finance(kind,reference);
    CREATE TABLE IF NOT EXISTS ai_points_rates (
      provider TEXT NOT NULL,model TEXT NOT NULL,data TEXT NOT NULL,paused INTEGER NOT NULL DEFAULT 0,
      updated_by TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(provider,model));
  `);
  initializeCheckInSchema(db,now);
  const operationColumns=new Set(db.prepare('PRAGMA table_info(ai_points_operations)').all().map(row=>row.name));
  if(!operationColumns.has('logical_key')){
    db.exec('ALTER TABLE ai_points_operations ADD COLUMN logical_key TEXT');
    db.exec('UPDATE ai_points_operations SET logical_key=request_key');
  }
  if(!operationColumns.has('attempt'))db.exec('ALTER TABLE ai_points_operations ADD COLUMN attempt INTEGER NOT NULL DEFAULT 0');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ai_points_attempt_identity ON ai_points_operations(user_id,logical_key,attempt)');
  const callColumns=new Set(db.prepare('PRAGMA table_info(ai_points_calls)').all().map(row=>row.name));
  if(!callColumns.has('cost_verified')) {
    db.exec('ALTER TABLE ai_points_calls ADD COLUMN cost_verified INTEGER NOT NULL DEFAULT 0');
    db.exec('UPDATE ai_points_calls SET cost_verified=measured');
  }
  if(!callColumns.has('reconciliation'))db.exec('ALTER TABLE ai_points_calls ADD COLUMN reconciliation TEXT');
  const stamp = () => new Date(now()).toISOString();
  // Acquire the SQLite write lock before reading balances. SAVEPOINT also works
  // when membership redemption already owns a surrounding transaction.
  const transaction = run => {
    const savepoint = 'points_' + crypto.randomBytes(8).toString('hex');
    db.exec(`SAVEPOINT ${savepoint}`);
    try {
      db.prepare('UPDATE ai_points_controls SET revision=revision WHERE id=1').run();
      const result = run();db.exec(`RELEASE ${savepoint}`);return result;
    } catch (error) {
      db.exec(`ROLLBACK TO ${savepoint}`);db.exec(`RELEASE ${savepoint}`);throw error;
    }
  };
  const margin = () => db.prepare('SELECT margin_bps AS n FROM ai_points_controls WHERE id=1').get().n;
  const rowOperation = id => db.prepare('SELECT * FROM ai_points_operations WHERE id=?').get(id);
  const assertPending = id => {
    const operation = rowOperation(id);
    if (!operation || operation.state!=='pending' || operation.lease_until<=stamp())
      fail('积分预扣已失效，请重新发起任务','AI_POINTS_OPERATION_EXPIRED',409);
    return operation;
  };
  const journal = (key,userId,operationId,kind,delta,held,released,description) =>
    db.prepare('INSERT INTO ai_points_journal VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(uuid(),key,userId,operationId,kind,delta,held,released,description,stamp());
  const finance = () => {
    const rows=db.prepare('SELECT kind,SUM(amount_micros) AS n FROM ai_points_finance GROUP BY kind').all();
    const revenue=rows.find(row=>row.kind==='revenue')?.n||0,expenses=rows.find(row=>row.kind==='expense')?.n||0;
    const calls=db.prepare("SELECT COALESCE(SUM(CASE WHEN state='finished' THEN cost_micros ELSE 0 END),0) AS spent,COALESCE(SUM(CASE WHEN state='pending' THEN upper_cost_micros ELSE 0 END),0) AS held,COALESCE(SUM(needs_review),0) AS uncertain FROM ai_points_calls").get();
    const allowance=costAllowance(revenue,margin());
    const outstanding=db.prepare('SELECT COALESCE(SUM(CASE WHEN expires_at IS NULL OR expires_at>? THEN remaining_units ELSE held_units END),0) AS units FROM ai_points_grants').get(stamp()).units;
    const liability=pointLiabilityMicros(outstanding);
    return {revenueMicros:revenue,otherExpenseMicros:expenses,aiSpentMicros:calls.spent,aiHeldMicros:calls.held,
      allowanceMicros:allowance,availableCostMicros:Math.max(0,allowance-expenses-calls.spent-calls.held-liability),
      outstandingPointUnits:outstanding,pointLiabilityMicros:liability,serviceMarginBps:SERVICE_MARGIN_BPS,
      overBudgetMicros:Math.max(0,expenses+calls.spent+calls.held+liability-allowance),unknownCostCalls:calls.uncertain,targetMarginBps:margin()};
  };
  const wallet = userId => {
    const row=db.prepare('SELECT COALESCE(SUM(CASE WHEN expires_at IS NULL OR expires_at>? THEN remaining_units-held_units ELSE 0 END),0) AS available,COALESCE(SUM(held_units),0) AS held,COALESCE(SUM(CASE WHEN expires_at<=? THEN remaining_units-held_units ELSE 0 END),0) AS expired FROM ai_points_grants WHERE user_id=?').get(stamp(),stamp(),userId);
    return {availableUnits:row.available,heldUnits:row.held,expiredUnits:row.expired,scale:POINT_SCALE,pointsPerCny:100};
  };
  const allocate = (operation, units) => {
    const grants=db.prepare('SELECT * FROM ai_points_grants WHERE user_id=? AND (expires_at IS NULL OR expires_at>?) AND remaining_units>held_units ORDER BY expires_at IS NULL,expires_at,created_at,id').all(operation.user_id,stamp());
    if (grants.reduce((sum,row)=>sum+row.remaining_units-row.held_units,0)<units)
      fail('积分不足，请在 VIP 中心查看余额或补充积分','AI_POINTS_INSUFFICIENT',402);
    let remaining=units;
    for (const row of grants) {
      const amount=Math.min(remaining,row.remaining_units-row.held_units);
      if (!amount)continue;
      db.prepare('UPDATE ai_points_grants SET held_units=held_units+? WHERE id=?').run(amount,row.id);
      db.prepare('INSERT INTO ai_points_allocations VALUES(?,?,?) ON CONFLICT(operation_id,grant_id) DO UPDATE SET held_units=held_units+excluded.held_units').run(operation.id,row.id,amount);
      remaining-=amount;if(!remaining)break;
    }
  };
  const api={
    wallet,finance,transaction,now:()=>now(),
    ensurePeriodicGrant({userId,sourceKey,targetUnits,expiresAt}) {
      integer(targetUnits,'周期积分');
      if(!targetUnits)return wallet(userId);
      if(!Number.isFinite(Date.parse(expiresAt))||Date.parse(expiresAt)<=now())
        fail('积分到期时间无效','AI_POINTS_INVALID_EXPIRY',400);
      return transaction(()=>{
        const old=db.prepare('SELECT * FROM ai_points_grants WHERE user_id=? AND source_key=?').get(userId,sourceKey);
        if(!old)return api.grant({userId,sourceKey,units:targetUnits,kind:'membership',expiresAt,requireFunded:true});
        if(old.kind!=='membership')fail('周期积分来源冲突','AI_POINTS_IDEMPOTENCY_CONFLICT',409);
        const delta=Math.max(0,targetUnits-old.units);
        const revived=old.expires_at&&old.expires_at<=stamp()?old.remaining_units-old.held_units:0;
        if(finance().availableCostMicros<pointLiabilityMicros(delta+revived))
          throw Object.assign(pointsError('本期积分待核对实收收入，请联系管理员','AI_POINTS_GRANT_FUNDING_REQUIRED',503),{pendingUnits:delta+revived});
        const expiry=old.expires_at&&old.expires_at>expiresAt?old.expires_at:expiresAt;
        if(delta||expiry!==old.expires_at){
          db.prepare('UPDATE ai_points_grants SET units=units+?,remaining_units=remaining_units+?,expires_at=? WHERE id=?').run(delta,delta,expiry,old.id);
          journal(`membership:${old.id}:${targetUnits}:${expiry}`,userId,null,'membership-renewal',delta,0,0,'同周期续期只补差额，不重置已用积分');
        }
        return wallet(userId);
      });
    },
    grant({userId,sourceKey,units,kind='gift',expiresAt=null,requireFunded=false}) {
      integer(units,'发放积分',{min:1});
      if(!userId||!sourceKey||sourceKey.length>300)fail('积分来源无效','AI_POINTS_INVALID_SOURCE',400);
      if(expiresAt && (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt)<=now()))
        fail('积分到期时间无效','AI_POINTS_INVALID_EXPIRY',400);
      return transaction(()=>{
        const old=db.prepare('SELECT * FROM ai_points_grants WHERE user_id=? AND source_key=?').get(userId,sourceKey);
        if(old){
          if(old.units!==units||old.kind!==kind||old.expires_at!==expiresAt)fail('积分发放编号已用于其他金额','AI_POINTS_IDEMPOTENCY_CONFLICT',409);
          return {created:false,id:old.id,...wallet(userId)};
        }
        if(requireFunded&&finance().availableCostMicros<pointLiabilityMicros(units))
          fail('积分赠送或发放预算不足，请管理员先核对实收收入','AI_POINTS_GRANT_FUNDING_REQUIRED',503);
        const id=uuid();db.prepare('INSERT INTO ai_points_grants VALUES(?,?,?,?,?,?,0,?,?)').run(id,userId,sourceKey,kind,units,units,expiresAt,stamp());
        journal('grant:'+id,userId,null,'grant',units,0,0,kind);
        return {created:true,id,...wallet(userId)};
      });
    },
    recordFinance({key,kind,amountMicros,userId=null,reference,createdBy}) {
      integer(amountMicros,'实收收入或支出',{min:1});
      if(!['revenue','expense'].includes(kind)||!key||!createdBy||typeof reference!=='string'||reference.trim().length<2)
        fail('请填写真实金额及凭据说明','AI_POINTS_INVALID_FINANCE',400);
      reference=reference.trim();
      return transaction(()=>{
        const old=db.prepare('SELECT * FROM ai_points_finance WHERE entry_key=?').get(key);
        if(old){
          if(old.kind!==kind||old.amount_micros!==amountMicros||old.user_id!==userId||old.reference!==reference)
            fail('收入或支出登记编号已用于其他记录','AI_POINTS_IDEMPOTENCY_CONFLICT',409);
          return {created:false,...finance()};
        }
        if(db.prepare('SELECT 1 FROM ai_points_finance WHERE kind=? AND reference=?').get(kind,reference))
          fail('该收支凭据已登记，请勿重复入账','AI_POINTS_DUPLICATE_RECEIPT',409);
        db.prepare('INSERT INTO ai_points_finance VALUES(?,?,?,?,?,?,?,?)').run(uuid(),key,kind,amountMicros,userId,reference,createdBy,stamp());
        return {created:true,...finance()};
      });
    },
    rateCard(settings) {
      const provider=normalizeProvider(settings.baseUrl);
      const row=db.prepare('SELECT * FROM ai_points_rates WHERE provider=? AND model=?').get(provider,settings.model);
      if(row?.paused)fail('该模型的成本用量待核对，已暂停新请求','AI_POINTS_PRICING_PAUSED',503);
      return resolveRateCard(settings,row?[JSON.parse(row.data)]:[],now());
    },
    saveRateCard(card,actor) {
      validRateCard(card,now());const provider=normalizeProvider(card.provider);
      return transaction(()=>{
        if(db.prepare('SELECT 1 FROM ai_points_calls WHERE provider=? AND model=? AND needs_review=1 LIMIT 1').get(provider,card.model))
          fail('请先核对该模型待确认的调用成本，再恢复调用','AI_POINTS_REVIEW_REQUIRED',409);
        db.prepare('INSERT INTO ai_points_rates VALUES(?,?,?,0,?,?) ON CONFLICT(provider,model) DO UPDATE SET data=excluded.data,paused=0,updated_by=excluded.updated_by,updated_at=excluded.updated_at')
          .run(provider,card.model,JSON.stringify({...card,provider}),actor,stamp());
        return {...card,provider};
      });
    },
    begin({userId,requestKey,signature,feature='ai',certificateId=null,leaseMs=300000,retryFailed=false}) {
      if(!userId||!requestKey||!signature)fail('任务计费标识缺失','AI_POINTS_INVALID_OPERATION',400);
      return transaction(()=>{
        const old=db.prepare('SELECT * FROM ai_points_operations WHERE user_id=? AND logical_key=? ORDER BY attempt DESC LIMIT 1').get(userId,requestKey);
        if(old){
          if(old.signature!==signature||old.feature!==feature||old.certificate_id!==certificateId)
            fail('任务编号已用于其他内容','AI_POINTS_IDEMPOTENCY_CONFLICT',409);
          if(old.state!=='refunded'||!retryFailed)return {created:false,operation:old};
        }
        const id=uuid(),time=stamp();
        db.prepare("INSERT INTO ai_points_operations (id,user_id,request_key,signature,logical_key,attempt,feature,certificate_id,state,margin_bps,lease_until,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,'pending',?,?,?,?)")
          .run(id,userId,old?'retry:'+id:requestKey,signature,requestKey,old?old.attempt+1:0,feature,certificateId,SERVICE_MARGIN_BPS,new Date(now()+leaseMs).toISOString(),time,time);
        return {created:true,operation:rowOperation(id)};
      });
    },
    operation:rowOperation,
    reserveCall(operationId,{settings,inputLimit,outputLimit,taskType='unknown'}) {
      integer(inputLimit,'输入上限');integer(outputLimit,'输出上限',{min:1});
      return transaction(()=>{
        const operation=assertPending(operationId),card=api.rateCard(settings);
        const upper=tokenCost({prompt_tokens:inputLimit,completion_tokens:outputLimit,cached_prompt_tokens:0},
          {...card,inputMicrosPerMillion:Math.max(card.inputMicrosPerMillion,card.cachedMicrosPerMillion)});
        if(finance().availableCostMicros<upper)
          fail('AI 服务成本预算不足，积分未扣除；请联系管理员核对收入与预算','AI_POINTS_COST_BUDGET_EXHAUSTED',503);
        const units=chargeUnits(upper,operation.margin_bps);allocate(operation,units);
        const id=uuid();
        db.prepare("INSERT INTO ai_points_calls (id,operation_id,user_id,task_type,provider,model,rate_card,state,upper_cost_micros,input_limit,output_limit,created_at) VALUES(?,?,?,?,?,?,?,'pending',?,?,?,?)")
          .run(id,operation.id,operation.user_id,taskType,normalizeProvider(settings.baseUrl),settings.model,JSON.stringify(card),upper,inputLimit,outputLimit,stamp());
        db.prepare('UPDATE ai_points_operations SET held_units=held_units+?,lease_until=?,updated_at=? WHERE id=?').run(units,new Date(now()+300000).toISOString(),stamp(),operationId);
        journal('hold:'+id,operation.user_id,operationId,'hold',0,units,0,taskType);
        return {id,upperCostMicros:upper,heldUnits:units,rateCard:card};
      });
    },
    finishCall(callId,{usage={},success=false}) {
      return transaction(()=>{
        const call=db.prepare('SELECT * FROM ai_points_calls WHERE id=?').get(callId);
        if(!call)fail('模型调用账单不存在','AI_POINTS_CALL_NOT_FOUND',404);
        if(call.state==='finished')return call;
        let measured=!!usage.hasUsage,cost=call.upper_cost_micros,overrun=false;
        try {
          if(!measured||!Number.isSafeInteger(usage.total_tokens)||usage.total_tokens!==usage.prompt_tokens+usage.completion_tokens)
            throw new Error('Missing or inconsistent token usage');
          if(success&&(!usage.prompt_tokens||!usage.completion_tokens))
            throw new Error('Nonempty model output cannot have zero token usage');
          cost=tokenCost(usage,JSON.parse(call.rate_card));
          overrun=cost>call.upper_cost_micros||usage.prompt_tokens>call.input_limit||usage.completion_tokens>call.output_limit;
        } catch { measured=false; }
        const review=!measured||overrun;
        db.prepare("UPDATE ai_points_calls SET state='finished',cost_micros=?,usage=?,measured=?,cost_verified=?,success=?,needs_review=?,finished_at=? WHERE id=?")
          .run(cost,JSON.stringify(usage),measured?1:0,measured?1:0,success?1:0,review?1:0,stamp(),callId);
        if(review){
          db.prepare('INSERT INTO ai_points_rates VALUES(?,?,?,1,?,?) ON CONFLICT(provider,model) DO UPDATE SET paused=1,updated_by=excluded.updated_by,updated_at=excluded.updated_at')
            .run(call.provider,call.model,call.rate_card,'system:cost-review',stamp());
        }
        return db.prepare('SELECT * FROM ai_points_calls WHERE id=?').get(callId);
      });
    },
    reconcileCall(callId,{costMicros,reference,requestKey,actor}) {
      integer(costMicros,'上游账单成本');
      if(!actor||!requestKey||typeof reference!=='string'||reference.trim().length<8)
        fail('请填写上游账单依据','AI_POINTS_RECONCILIATION_REQUIRED',400);
      return transaction(()=>{
        const row=db.prepare('SELECT * FROM ai_points_calls WHERE id=?').get(callId);
        if(!row||row.state!=='finished')fail('该调用尚不可核对','AI_POINTS_CALL_NOT_FOUND',404);
        if(row.reconciliation){
          const saved=JSON.parse(row.reconciliation);
          if(saved.requestKey!==requestKey||saved.costMicros!==costMicros||saved.reference!==reference)
            fail('该调用已完成核对，请刷新账单','AI_POINTS_IDEMPOTENCY_CONFLICT',409);
          return row;
        }
        const evidence={requestKey,actor,costMicros,reference,previousConservativeMicros:row.cost_micros,at:stamp()};
        db.prepare('UPDATE ai_points_calls SET cost_micros=?,cost_verified=1,needs_review=0,reconciliation=? WHERE id=?')
          .run(costMicros,JSON.stringify(evidence),callId);
        db.prepare("UPDATE ai_points_operations SET cost_micros=(SELECT COALESCE(SUM(cost_micros),0) FROM ai_points_calls WHERE operation_id=?) WHERE id=? AND state<>'pending'")
          .run(row.operation_id,row.operation_id);
        if(db.prepare("SELECT 1 FROM sqlite_master WHERE name='user_usage' AND type='table'").get())
          db.prepare("UPDATE user_usage SET data=json_set(data,'$.estimatedCostCny',?,'$.costReconciled',json('true')) WHERE json_extract(data,'$.pointsCallId')=?")
            .run(costMicros/1000000,callId);
        return db.prepare('SELECT * FROM ai_points_calls WHERE id=?').get(callId);
      });
    },
    finish(operationId,{success,result=null,error=null}) {
      return transaction(()=>{
        const operation=rowOperation(operationId);
        if(!operation)fail('任务账单不存在','AI_POINTS_OPERATION_NOT_FOUND',404);
        if(operation.state!=='pending')return operation;
        // A crash or cancelled request may leave an unmeasured call. Its upper
        // cost remains in the business budget even when all user points return.
        for(const row of db.prepare("SELECT id FROM ai_points_calls WHERE operation_id=? AND state='pending'").all(operationId))
          api.finishCall(row.id,{success:false});
        const calls=db.prepare('SELECT * FROM ai_points_calls WHERE operation_id=?').all(operationId);
        const cost=calls.reduce((sum,row)=>sum+row.cost_micros,0);
        const accepted=!!success&&!calls.some(row=>row.needs_review);
        const charge=accepted?chargeUnits(cost,operation.margin_bps):0;
        if(charge>operation.held_units)fail('结算超过预扣上限，需核对账单','AI_POINTS_SETTLEMENT_OVERRUN',503);
        let remaining=charge;
        const allocations=db.prepare('SELECT a.*,g.expires_at,g.created_at FROM ai_points_allocations a JOIN ai_points_grants g ON g.id=a.grant_id WHERE a.operation_id=? ORDER BY g.expires_at IS NULL,g.expires_at,g.created_at,g.id').all(operationId);
        for(const row of allocations){
          const used=Math.min(remaining,row.held_units);
          db.prepare('UPDATE ai_points_grants SET remaining_units=remaining_units-?,held_units=held_units-? WHERE id=?').run(used,row.held_units,row.grant_id);
          remaining-=used;
        }
        const state=accepted?'settled':'refunded';
        db.prepare('UPDATE ai_points_operations SET state=?,charged_units=?,cost_micros=?,result=?,error=?,updated_at=? WHERE id=?')
          .run(state,charge,cost,accepted?JSON.stringify(result):null,accepted?null:String(error||'任务失败或上游用量待核对').slice(0,500),stamp(),operationId);
        journal('finish:'+operationId,operation.user_id,operationId,state,-charge,0,operation.held_units-charge,operation.feature);
        return rowOperation(operationId);
      });
    },
    recoverExpired() {
      return transaction(()=>{
        const rows=db.prepare("SELECT id FROM ai_points_operations WHERE state='pending' AND lease_until<=?").all(stamp());
        for(const row of rows)api.finish(row.id,{success:false,error:'服务中断后积分已退还；上游成本待核对'});
        return rows.length;
      });
    },
    journal(userId,{limit=30,offset=0}={}) {
      integer(limit,'分页大小',{min:1,max:100});integer(offset,'分页位置',{max:1000000});
      return db.prepare('SELECT * FROM ai_points_journal WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT ? OFFSET ?').all(userId,limit,offset);
    },
    audit() {
      const errors=[];
      for(const row of db.prepare('SELECT g.user_id,SUM(g.remaining_units) AS remaining,(SELECT COALESCE(SUM(delta_units),0) FROM ai_points_journal j WHERE j.user_id=g.user_id) AS journal FROM ai_points_grants g GROUP BY g.user_id').all())
        if(row.remaining!==row.journal)errors.push({userId:row.user_id,error:'journal-balance-mismatch'});
      const pending=db.prepare("SELECT COALESCE(SUM(held_units),0) AS units FROM ai_points_operations WHERE state='pending'").get().units;
      const held=db.prepare('SELECT COALESCE(SUM(held_units),0) AS units FROM ai_points_grants').get().units;
      if(pending!==held)errors.push({error:'reservation-balance-mismatch'});
      return {passed:!errors.length,errors,finance:finance()};
    },
    signature:hash,
  };
  return api;
}
