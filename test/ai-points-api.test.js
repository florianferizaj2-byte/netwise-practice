import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createStore} from '../server/store.js';
import {createApp} from '../server/index.js';
import {OpenAICompatibleProvider} from '../server/ai.js';
import {studyNodes} from '../server/study-content.js';

test('point billing APIs enforce ownership, complete task refunds, and observable operator accounting',async t=>{
  const parent=path.resolve('tmp'),directory=fs.mkdtempSync(path.join(parent,'ai-points-api-'));
  const store=createStore(directory),owner=store.register('points_owner','fixture-password-123'),learner=store.register('points_learner','fixture-password-123');
  store.points.saveRateCard({provider:'https://api.deepseek.com',model:'deepseek-flash',inputMicrosPerMillion:2000000,outputMicrosPerMillion:8000000,cachedMicrosPerMillion:40000,source:'synthetic-fixture-pricing',verifiedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()},owner.id);
  store.selectCertificate(owner.id,'network-engineer');store.selectCertificate(learner.id,'network-engineer');
  const tokens={[owner.id]:store.createAuthSession(owner.id),[learner.id]:store.createAuthSession(learner.id)};
  let calls=0,schemaFails=false,httpFails=false,modelPayload=null;
  const provider=new OpenAICompatibleProvider(store,{fetch:async()=>{
    calls++;
    return httpFails?new Response('fixture outage',{status:500}):new Response(JSON.stringify({
      choices:[{message:{content:JSON.stringify(modelPayload||(schemaFails?{invalid:true}:{text:'合成测试解析：按题干已知条件逐步判断正确选项。'}))},finish_reason:'stop'}],
      usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20},
    }),{headers:{'Content-Type':'application/json'}});
  }});
  const rawCall=provider.call.bind(provider);
  provider.call=(messages,settings,options)=>rawCall(messages,{baseUrl:'https://api.deepseek.com',model:'deepseek-flash',apiKey:'fixture-only-no-network',temperature:0,...settings},options);
  const app=await createApp({store,provider,withFrontend:false,accountSecurity:{enabled:false}}),server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await app.locals.stop();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));store.db.close();assert.equal(path.dirname(directory),parent);assert.ok(path.basename(directory).startsWith('ai-points-api-'));fs.rmSync(directory,{recursive:true,force:true});});
  const request=async(userId,url,body,requestId)=>{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api${url}`,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+tokens[userId],'Content-Type':'application/json',...(requestId?{'X-AI-Request-Id':requestId}:{})},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,body:await response.json()};
  };
  await t.test('membership without a cash record does not invent spendable funded points',async()=>{
    store.saveAccountEntitlement(learner.id,{plan:'vip',expiresAt:new Date(Date.now()+30*86400000).toISOString()});
    const result=await request(learner.id,'/account/entitlements');
    assert.equal(result.status,200);assert.equal(result.body.billingMode,'points');
    assert.equal(result.body.points.availableUnits,0);assert.ok(result.body.points.pendingUnits>980000);
    assert.equal(store.points.finance().revenueMicros,0);
    assert.equal((await request(learner.id,'/admin/points/usage')).status,403);
  });
  await t.test('actual revenue is recorded once, monthly grants migrate once, and every account is visible',async()=>{
    const body={requestId:crypto.randomUUID(),kind:'revenue',amountCny:'99',reference:'fixture-cash-receipt-001'};
    assert.equal((await request(owner.id,'/admin/points/finance',body)).status,200);
    assert.equal((await request(owner.id,'/admin/points/finance',body)).status,200);
    assert.equal(store.points.finance().revenueMicros,99000000);
    const first=await request(learner.id,'/account/entitlements'),second=await request(learner.id,'/account/entitlements');
    assert.ok(first.body.points.availableUnits>=980000);assert.equal(first.body.points.availableUnits,second.body.points.availableUnits);
    const all=await request(owner.id,'/admin/points/usage');
    assert.equal(all.status,200);assert.ok(all.body.rows.some(row=>row.userId===owner.id));assert.ok(all.body.rows.some(row=>row.userId===learner.id));
    assert.equal(all.body.audit.passed,true);
  });
  await t.test('successful AI usage debits points, cached and duplicate requests do not debit again',async()=>{
    const body={questionId:'practice-1',action:'详细讲解',selected:[]},key=crypto.randomUUID(),before=store.points.wallet(learner.id).availableUnits;
    const first=await request(learner.id,'/ai/teacher',body,key);
    assert.equal(first.status,200,JSON.stringify(first.body));assert.equal(calls,1);
    const after=store.points.wallet(learner.id).availableUnits;assert.equal(before-after,40);
    const replay=await request(learner.id,'/ai/teacher',body,key);
    assert.equal(replay.status,200);assert.equal(calls,1);assert.equal(store.points.wallet(learner.id).availableUnits,after);
    assert.equal((await request(learner.id,'/ai/teacher',body,crypto.randomUUID())).status,200);
    assert.equal(calls,1);assert.equal(store.points.wallet(learner.id).availableUnits,after);
    const own=await request(learner.id,'/account/points/operations');
    assert.ok(own.body.calls.every(row=>row.operationId!==owner.id));
    assert.equal(own.body.rows.filter(row=>row.chargedUnits>0).length,1);
    assert.equal((await request(learner.id,'/admin/points/users/'+owner.id)).status,403);
  });
  await t.test('final schema failure returns all preheld points and retains paid upstream attempts',async()=>{
    schemaFails=true;const before=store.points.wallet(learner.id).availableUnits,cost=store.points.finance().aiSpentMicros;
    const result=await request(learner.id,'/ai/teacher',{questionId:'practice-1',action:'换一种方法解释',selected:[]},crypto.randomUUID());
    assert.ok(result.status>=400);assert.equal(store.points.wallet(learner.id).availableUnits,before);assert.equal(store.points.wallet(learner.id).heldUnits,0);
    assert.ok(store.points.finance().aiSpentMicros>cost);assert.equal(store.points.audit().passed,true);schemaFails=false;
  });
  await t.test('legacy unknown costs remain unknown in the all-user report',async()=>{
    store.saveUsage({model:'legacy-unknown-price',taskType:'legacy-test',hasUsage:true,prompt_tokens:10,completion_tokens:10,total_tokens:20},learner.id);
    const report=await request(owner.id,'/admin/points/usage');
    assert.equal(report.status,200);assert.equal(report.body.history.unknownCostCalls,1);
    assert.equal(report.body.rows.find(row=>row.userId===learner.id).legacyUnknownCostCalls,1);
    const learnerRow=report.body.rows.find(row=>row.userId===learner.id);
    const measuredInput=store.db.prepare('SELECT SUM(json_extract(usage,\'$.prompt_tokens\')) AS n FROM ai_points_calls WHERE user_id=?').get(learner.id).n;
    assert.equal(learnerRow.inputTokens,measuredInput+10);
    const detail=await request(owner.id,'/admin/points/users/'+learner.id);
    assert.equal(detail.body.legacyTotal,1);assert.equal(detail.body.legacyRows[0].inputTokens,10);
    assert.equal(detail.body.legacyRows[0].estimatedCostCny,null);
    assert.ok(report.body.breakdown.some(row=>row.taskType==='question-explanation'));
    assert.equal((await request(owner.id,'/admin/points/usage?search='+encodeURIComponent('%'))).body.total,0);
  });
  await t.test('unmeasured failures refund; reconciliation changes cost without charging the user again',async()=>{
    httpFails=true;const before=store.points.wallet(learner.id).availableUnits;
    const result=await request(learner.id,'/ai/teacher',{questionId:'practice-1',action:'举一个实际例子',selected:[]},crypto.randomUUID());
    assert.ok(result.status>=400);assert.equal(store.points.wallet(learner.id).availableUnits,before);
    const detail=await request(owner.id,'/admin/points/users/'+learner.id),unmeasured=detail.body.calls.find(row=>row.needsReview);
    assert.ok(unmeasured);assert.equal(unmeasured.costVerified,0);
    const reconcile={requestId:crypto.randomUUID(),costCny:'0',reference:'fixture-upstream-invoice-no-charge'};
    assert.equal((await request(owner.id,`/admin/points/calls/${unmeasured.id}/reconcile`,reconcile)).status,200);
    assert.equal(store.points.wallet(learner.id).availableUnits,before);
    assert.equal((await request(owner.id,'/admin/points/rates',{provider:'https://api.deepseek.com',model:'deepseek-flash',inputCnyPerMillion:'2',outputCnyPerMillion:'8',cachedCnyPerMillion:'0.04',source:'fixture-confirmed-provider-invoice',verifiedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()})).status,200);
    httpFails=false;assert.equal(store.points.audit().passed,true);
  });
  await t.test('a paid teacher answer rejected for leaking a pending answer refunds instead of charging for a free hint',async()=>{
    const node=studyNodes.find(row=>row.certificateId==='network-engineer'),item=app.locals.study.published(node);
    assert.ok(item);
    assert.equal((await request(learner.id,`/study/lessons/${encodeURIComponent(node.id)}/complete`,{version:0})).status,200);
    const session=await request(learner.id,'/study/practice-sessions',{nodeId:node.id});
    assert.equal(session.status,200,JSON.stringify(session.body));
    const question=item.data.bundle.questions.find(row=>session.body.questions.some(q=>q.id===row.id));
    modelPayload={conclusion:'这个填空的答案是'+question.blanks[0].answer,points:[],example:''};
    const before=store.points.wallet(learner.id).availableUnits,cost=store.points.finance().aiSpentMicros;
    const result=await request(learner.id,'/study/teacher',{nodeId:node.id,sessionId:session.body.id,questionId:question.id,requestId:crypto.randomUUID(),message:'请解释这个概念'});
    assert.equal(result.status,503,JSON.stringify(result.body));assert.equal(result.body.code,'STUDY_TEACHER_UNSAFE');
    assert.equal(store.points.wallet(learner.id).availableUnits,before);assert.ok(store.points.finance().aiSpentMicros>cost);
    const hint=await request(learner.id,'/study/teacher',{nodeId:node.id,sessionId:session.body.id,questionId:question.id,requestId:crypto.randomUUID(),message:'给我一点提示',action:'hint'});
    assert.equal(hint.status,200);assert.equal(hint.body.cached,true);assert.equal(store.points.wallet(learner.id).availableUnits,before);
    modelPayload=null;assert.equal(store.points.audit().passed,true);
  });
  await t.test('inconclusive AI grading is refunded; a confirmed retry charges once and exact grading stays free',async()=>{
    const node=studyNodes.find(row=>row.certificateId==='network-engineer'),item=app.locals.study.published(node);
    const session=(await request(learner.id,'/study/practice-sessions',{nodeId:node.id})).body;
    const question=item.data.bundle.questions.find(row=>session.questions.some(q=>q.id===row.id));
    const blankId=question.blanks[0].id,answers=Object.fromEntries(question.blanks.map(blank=>[blank.id,blank.answer]));
    answers[blankId]=' '+answers[blankId];
    modelPayload={results:[{blankId,verdict:'uncertain',reason:'合成测试：依据暂不足'}]};
    const before=store.points.wallet(learner.id).availableUnits,cost=store.points.finance().aiSpentMicros;
    const pending=await request(learner.id,`/study/practice-sessions/${session.id}/attempts`,{questionId:question.id,requestId:crypto.randomUUID(),answers});
    assert.equal(pending.status,200);assert.equal(pending.body.status,'pending_review');
    assert.equal(store.points.wallet(learner.id).availableUnits,before);assert.ok(store.points.finance().aiSpentMicros>cost,JSON.stringify(pending.body));
    modelPayload={results:[{blankId,verdict:'correct',reason:'合成测试：按评分依据确认等价'}]};
    const confirmed=await request(learner.id,`/study/attempts/${pending.body.id}/retry`,{});
    assert.equal(confirmed.status,200);assert.equal(confirmed.body.status,'graded');
    assert.equal(store.points.wallet(learner.id).availableUnits,before-40);
    const other=item.data.bundle.questions.find(row=>row.id!==question.id&&session.questions.some(q=>q.id===row.id)),priorCalls=calls;
    const exact=await request(learner.id,`/study/practice-sessions/${session.id}/attempts`,{questionId:other.id,requestId:crypto.randomUUID(),answers:Object.fromEntries(other.blanks.map(blank=>[blank.id,blank.answer]))});
    assert.equal(exact.status,200);assert.equal(exact.body.status,'graded');assert.equal(calls,priorCalls);
    assert.equal(store.points.wallet(learner.id).availableUnits,before-40);modelPayload=null;
  });
});
