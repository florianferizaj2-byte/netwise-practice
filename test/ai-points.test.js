import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import {createPointsStore} from '../server/ai-points/store.js';
import {chargeUnits,cnyMicros,tokenCost} from '../server/ai-points/money.js';
import {resolveRateCard,inputTokenCeiling} from '../server/ai-points/pricing.js';

const fixed=Date.parse('2026-10-23T08:00:00.000Z');
const settings={baseUrl:'https://api.deepseek.com',model:'deepseek-flash'};
const fixture=()=>{
  const db=new DatabaseSync(':memory:');let clock=fixed;
  const points=createPointsStore(db,{now:()=>clock});
  return {db,points,advance:ms=>{clock+=ms;}};
};
const funding=points=>{
  points.recordFinance({key:'receipt-1',kind:'revenue',amountMicros:9_900_000,userId:'alice',reference:'合成测试实收凭据',createdBy:'test-admin'});
  points.grant({userId:'alice',sourceKey:'paid-1',kind:'paid',units:990_000});
};
const operation=(points,key='job-1',userId='alice')=>points.begin({userId,requestKey:key,signature:'synthetic-input-signature',feature:'question-generation'}).operation;
const call=(points,id,extra={})=>points.reserveCall(id,{settings,inputLimit:2000,outputLimit:1000,taskType:'question-generation',...extra});
const measured=(points,id,input=1000,output=100)=>points.finishCall(id,{success:true,usage:{hasUsage:true,prompt_tokens:input,completion_tokens:output,total_tokens:input+output,cached_prompt_tokens:0}});

test('integer point prices enforce the 70 percent margin boundary without floating point drift',()=>{
  for(const cost of [0,1,2,3,4,999,1000,1001,999999,123456789,90071992547]){
    const units=chargeUnits(cost);
    assert.ok(BigInt(units)*10n*3000n>=BigInt(cost)*10000n);
    if(units)assert.ok(BigInt(units-1)*10n*3000n<BigInt(cost)*10000n);
  }
  assert.equal(cnyMicros('9.9'),9900000);
  assert.equal(cnyMicros('0.000001'),1);
  for(const value of [-1,NaN,Infinity,'1e6','0.0000001','-0.01'])assert.throws(()=>cnyMicros(value));
  assert.throws(()=>chargeUnits(0.1));assert.throws(()=>chargeUnits(1,10000));
  const price=resolveRateCard(settings,[],fixed);
  assert.equal(tokenCost({prompt_tokens:1000,completion_tokens:100,cached_prompt_tokens:500},price),1820);
});

test('prices bind the exact provider and model, expire, and reject unbounded input',()=>{
  assert.equal(resolveRateCard({...settings,baseUrl:'https://api.deepseek.com/v1'},[],fixed).inputMicrosPerMillion,2000000);
  for(const altered of [{...settings,model:'deepseek-chat'},{...settings,baseUrl:'https://another-provider.invalid'},{...settings,baseUrl:'https://api.deepseek.com/private'}])
    assert.throws(()=>resolveRateCard(altered,[],fixed),{code:'AI_POINTS_PRICING_UNAVAILABLE'});
  assert.throws(()=>resolveRateCard(settings,[],Date.parse('2026-12-01')),{code:'AI_POINTS_PRICING_UNAVAILABLE'});
  assert.ok(inputTokenCeiling([{role:'user',content:'中文与英文🙂'}])>Buffer.byteLength('中文与英文🙂'));
  assert.throws(()=>inputTokenCeiling([{role:'user',content:[{type:'image_url'}]}]),{code:'AI_POINTS_UNBOUNDED_INPUT'});
});

test('gifts and membership labels never manufacture cash revenue; no budget means no upstream reservation',t=>{
  const {db,points}=fixture();t.after(()=>db.close());
  points.grant({userId:'alice',sourceKey:'gift-1',units:990000});
  const op=operation(points);
  assert.throws(()=>call(points,op.id),{code:'AI_POINTS_COST_BUDGET_EXHAUSTED'});
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ai_points_calls').get().n,0);
  assert.equal(points.wallet('alice').heldUnits,0);
  assert.equal(points.finance().revenueMicros,0);
});

test('generation and review calls aggregate before one settlement, releasing unused holds',t=>{
  const {db,points}=fixture();t.after(()=>db.close());funding(points);
  const op=operation(points),first=call(points,op.id),second=call(points,op.id,{taskType:'question-review'});
  measured(points,first.id);measured(points,second.id,300,80);
  assert.equal(points.wallet('alice').heldUnits,9600);
  const settled=points.finish(op.id,{success:true,result:{questions:['synthetic']}});
  assert.equal(settled.cost_micros,4040);assert.equal(settled.charged_units,1616);
  assert.equal(points.wallet('alice').availableUnits,990000-1616);
  assert.equal(points.wallet('alice').heldUnits,0);
  assert.equal(points.finish(op.id,{success:false}).state,'settled');
  assert.equal(points.audit().passed,true);
});

test('a final generation or review failure refunds all points, keeps real costs, and cannot refund twice',t=>{
  const {db,points}=fixture();t.after(()=>db.close());funding(points);
  const op=operation(points),first=call(points,op.id),second=call(points,op.id);
  measured(points,first.id);measured(points,second.id,300,80);
  const refunded=points.finish(op.id,{success:false,error:'合成审核失败'});
  assert.equal(refunded.charged_units,0);assert.equal(refunded.state,'refunded');
  assert.equal(points.wallet('alice').availableUnits,990000);
  assert.equal(points.finance().aiSpentMicros,4040);
  points.finish(op.id,{success:false});assert.equal(points.wallet('alice').availableUnits,990000);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ai_points_journal WHERE kind='refunded'").get().n,1);
  assert.equal(points.audit().passed,true);
});

test('request identities, receipts and grants are idempotent and isolated between accounts',t=>{
  const {db,points}=fixture();t.after(()=>db.close());funding(points);
  assert.equal(points.grant({userId:'alice',sourceKey:'paid-1',kind:'paid',units:990000}).created,false);
  assert.throws(()=>points.grant({userId:'alice',sourceKey:'paid-1',kind:'paid',units:990001}),{code:'AI_POINTS_IDEMPOTENCY_CONFLICT'});
  const alice=operation(points),same=operation(points),bob=operation(points,'job-1','bob');
  assert.equal(alice.id,same.id);assert.notEqual(alice.id,bob.id);
  assert.throws(()=>points.begin({userId:'alice',requestKey:'job-1',signature:'changed',feature:'question-generation'}),{code:'AI_POINTS_IDEMPOTENCY_CONFLICT'});
  assert.equal(points.wallet('bob').availableUnits,0);
  assert.deepEqual(points.journal('bob'),[]);
  assert.equal(points.recordFinance({key:'receipt-1',kind:'revenue',amountMicros:9900000,userId:'alice',reference:'合成测试实收凭据',createdBy:'test-admin'}).created,false);
  assert.equal(points.finance().revenueMicros,9900000);
});

test('expiring points are held first, and a failed task never extends the original expiry',t=>{
  const {db,points,advance}=fixture();t.after(()=>db.close());
  points.recordFinance({key:'fund',kind:'revenue',amountMicros:1000000,reference:'合成测试实收',createdBy:'admin'});
  const early=points.grant({userId:'alice',sourceKey:'first',units:4800,expiresAt:new Date(fixed+1000).toISOString()});
  const later=points.grant({userId:'alice',sourceKey:'second',units:5200,expiresAt:new Date(fixed+100000).toISOString()});
  const op=operation(points);call(points,op.id);
  assert.equal(db.prepare('SELECT held_units FROM ai_points_grants WHERE id=?').get(early.id).held_units,4800);
  assert.equal(db.prepare('SELECT held_units FROM ai_points_grants WHERE id=?').get(later.id).held_units,0);
  advance(2000);points.finish(op.id,{success:false});
  assert.equal(points.wallet('alice').availableUnits,5200);
  assert.equal(points.wallet('alice').expiredUnits,4800);
  assert.equal(points.audit().passed,true);
});

test('missing usage retains a conservative cost, refunds the user and pauses further calls',t=>{
  const {db,points}=fixture();t.after(()=>db.close());funding(points);
  const op=operation(points),reserved=call(points,op.id);
  points.finishCall(reserved.id,{success:true,usage:{hasUsage:false}});
  const result=points.finish(op.id,{success:true,result:'synthetic'});
  assert.equal(result.state,'refunded');assert.equal(points.wallet('alice').availableUnits,990000);
  assert.equal(points.finance().aiSpentMicros,reserved.upperCostMicros);
  assert.equal(points.finance().unknownCostCalls,1);
  assert.throws(()=>call(points,operation(points,'second').id),{code:'AI_POINTS_PRICING_PAUSED'});
});

test('interrupted reservations survive restart and refund exactly once after their lease expires',t=>{
  const {db,points,advance}=fixture();t.after(()=>db.close());funding(points);
  const op=operation(points),reserved=call(points,op.id);
  assert.equal(points.recoverExpired(),0);advance(300001);
  const restarted=createPointsStore(db,{now:()=>fixed+300001});
  assert.equal(restarted.recoverExpired(),1);assert.equal(restarted.recoverExpired(),0);
  assert.equal(restarted.wallet('alice').availableUnits,990000);
  assert.equal(restarted.finance().aiSpentMicros,reserved.upperCostMicros);
  assert.equal(restarted.audit().passed,true);
});

test('concurrent processes cannot reserve the same points twice or make a wallet negative',async t=>{
  const parent=path.resolve('tmp'),directory=fs.mkdtempSync(path.join(parent,'ai-points-concurrency-'));
  const file=path.join(directory,'points.sqlite');
  let db=new DatabaseSync(file);db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000');
  let points=createPointsStore(db,{now:()=>fixed});
  points.recordFinance({key:'fund',kind:'revenue',amountMicros:100000000,reference:'合成测试实收',createdBy:'admin'});
  points.grant({userId:'alice',sourceKey:'limited',units:1000});db.close();db=undefined;
  t.after(()=>{db?.close();assert.equal(path.dirname(directory),parent);assert.ok(path.basename(directory).startsWith('ai-points-concurrency-'));fs.rmSync(directory,{recursive:true,force:true});});
  const moduleUrl=pathToFileURL(path.resolve('server/ai-points/store.js')).href;
  const execute=promisify(execFile);
  const results=await Promise.all(Array.from({length:10},(_,index)=>execute(process.execPath,['--input-type=module','-e',`
    import {DatabaseSync} from 'node:sqlite';import {createPointsStore} from ${JSON.stringify(moduleUrl)};
    const db=new DatabaseSync(${JSON.stringify(file)});db.exec('PRAGMA busy_timeout=10000');
    try{const points=createPointsStore(db,{now:()=>${fixed}}),op=points.begin({userId:'alice',requestKey:'parallel-${index}',signature:'fixture'}).operation;
      try{points.reserveCall(op.id,{settings:${JSON.stringify(settings)},inputLimit:50,outputLimit:50});console.log('reserved');}
      catch(error){if(error.code!=='AI_POINTS_INSUFFICIENT')throw error;points.finish(op.id,{success:false});console.log('insufficient');}
    }finally{db.close();}`],{encoding:'utf8',windowsHide:true})));
  assert.equal(results.filter(result=>result.stdout.trim()==='reserved').length,5);
  db=new DatabaseSync(file);points=createPointsStore(db,{now:()=>fixed});
  assert.equal(points.wallet('alice').availableUnits,0);assert.equal(points.wallet('alice').heldUnits,1000);
  assert.equal(points.audit().passed,true);
});

test('future point fulfilment and repeated refunded failures together stay inside the 30 percent cost budget',t=>{
  const {db,points}=fixture();t.after(()=>db.close());
  points.recordFinance({key:'fund',kind:'revenue',amountMicros:1000000,reference:'fixture-unique-receipt-001',createdBy:'admin'});
  points.grant({userId:'alice',sourceKey:'paid',units:100000,kind:'paid',requireFunded:true});
  assert.equal(points.finance().pointLiabilityMicros,250000);
  assert.equal(points.finance().availableCostMicros,50000);
  for(let index=0;index<2;index++){
    const op=operation(points,'failed-'+index),reservation=call(points,op.id,{inputLimit:1000,outputLimit:2250});
    points.finishCall(reservation.id,{success:false,usage:{hasUsage:true,prompt_tokens:1000,completion_tokens:2250,total_tokens:3250,cached_prompt_tokens:0}});
    points.finish(op.id,{success:false});
  }
  assert.equal(points.wallet('alice').availableUnits,100000);
  const finance=points.finance();assert.equal(finance.aiSpentMicros,40000);assert.equal(finance.pointLiabilityMicros,250000);
  assert.ok(finance.aiSpentMicros+finance.pointLiabilityMicros<=300000);
  assert.throws(()=>call(points,operation(points,'blocked-before-upstream').id,{inputLimit:1000,outputLimit:2250}),{code:'AI_POINTS_COST_BUDGET_EXHAUSTED'});
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ai_points_calls').get().n,2);
  assert.equal(points.audit().passed,true);
});

test('the same external cash receipt cannot be booked again using a different request id',t=>{
  const {db,points}=fixture();t.after(()=>db.close());
  points.recordFinance({key:'first',kind:'revenue',amountMicros:1000000,reference:'fixture-receipt-unique',createdBy:'admin'});
  assert.throws(()=>points.recordFinance({key:'different-client-retry',kind:'revenue',amountMicros:1000000,reference:'fixture-receipt-unique',createdBy:'admin'}),{code:'AI_POINTS_DUPLICATE_RECEIPT'});
  assert.equal(points.finance().revenueMicros,1000000);
});

test('custom cache input rates above uncached rates remain covered by the worst-case hold',t=>{
  const {db,points}=fixture();t.after(()=>db.close());funding(points);
  const base=resolveRateCard(settings,[],fixed),card={...base,cachedMicrosPerMillion:20000000,source:'synthetic-expensive-cache-price'};
  points.saveRateCard(card,'admin');
  const op=operation(points),reserved=call(points,op.id,{inputLimit:100,outputLimit:10});
  assert.equal(reserved.upperCostMicros,2080);
  points.finishCall(reserved.id,{success:true,usage:{hasUsage:true,prompt_tokens:100,completion_tokens:10,total_tokens:110,cached_prompt_tokens:100}});
  assert.equal(points.finish(op.id,{success:true}).state,'settled');assert.equal(points.finance().unknownCostCalls,0);
});

test('official endpoint aliases share a pause and long-lived unverified prices are rejected',t=>{
  const {db,points}=fixture();t.after(()=>db.close());funding(points);
  const card=resolveRateCard(settings,[],fixed);
  assert.throws(()=>points.saveRateCard({...card,expiresAt:new Date(fixed+60*86400000).toISOString()},'admin'),{code:'AI_POINTS_PRICING_UNAVAILABLE'});
  const op=operation(points),reserved=call(points,op.id,{settings:{...settings,baseUrl:'https://api.deepseek.com/v1'}});
  points.finishCall(reserved.id,{success:false});points.finish(op.id,{success:false});
  for(const baseUrl of ['https://api.deepseek.com','https://api.deepseek.com/v1'])
    assert.throws(()=>points.rateCard({...settings,baseUrl}),{code:'AI_POINTS_PRICING_PAUSED'});
  assert.throws(()=>points.saveRateCard(card,'admin'),{code:'AI_POINTS_REVIEW_REQUIRED'});
  points.reconcileCall(reserved.id,{costMicros:0,reference:'synthetic-invoice-zero-charge',requestKey:'reconcile-1',actor:'admin'});
  assert.equal(points.operation(op.id).cost_micros,0);
  points.saveRateCard(card,'admin');assert.equal(points.finance().unknownCostCalls,0);
});
