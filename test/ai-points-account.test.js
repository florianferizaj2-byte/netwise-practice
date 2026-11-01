import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createPointsStore} from '../server/ai-points/store.js';
import {ensureAccountPoints,claimPointsCheckIn,pointsCheckInView} from '../server/ai-points/account.js';
const fixed=Date.parse('2026-10-23T08:00:00Z'),day=86400000;
function fixture(t,amount=100000000){
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());let now=fixed;
  const points=createPointsStore(db,{now:()=>now});
  if(amount)points.recordFinance({key:'synthetic',kind:'revenue',amountMicros:amount,reference:'synthetic-account-funding',createdBy:'fixture-admin'});
  return {db,points,advance:ms=>{now+=ms;}};
}
const entitlement=(plan='vip',days=30,remaining=100)=>({plan,generation:{periodStart:new Date(fixed).toISOString(),periodEnd:new Date(fixed+days*day).toISOString(),limit:100,remaining}});
test('every paid tier converts its full thirty day allowance once and does not reset spent points',t=>{
  for(const [plan,expected] of [['vip',990000],['svip',1990000],['ssvip',3990000]]){
    const store=fixture(t),period=entitlement(plan);
    assert.equal(ensureAccountPoints(store,'learner',period).availableUnits,expected);
    const op=store.points.begin({userId:'learner',requestKey:plan,signature:plan}).operation;
    const call=store.points.reserveCall(op.id,{settings:{baseUrl:'https://api.deepseek.com',model:'deepseek-flash'},inputLimit:10,outputLimit:10});
    store.points.finishCall(call.id,{success:true,usage:{hasUsage:true,prompt_tokens:10,completion_tokens:10,total_tokens:20}});
    store.points.finish(op.id,{success:true,result:'fixture'});
    for(let count=0;count<3;count++)assert.equal(ensureAccountPoints(store,'learner',period).availableUnits,expected-40);
    assert.equal(store.db.prepare("SELECT count(*) AS n FROM ai_points_grants WHERE kind='membership'").get().n,1);
    assert.equal(store.points.audit().passed,true);
  }
});
test('partial periods prorate time and old consumed quota, while zero remaining quota grants nothing',t=>{
  const store=fixture(t);
  assert.equal(ensureAccountPoints(store,'half',entitlement('vip',15,100)).availableUnits,495000);
  assert.equal(ensureAccountPoints(store,'legacy',entitlement('vip',30,25)).availableUnits,247500);
  assert.equal(ensureAccountPoints(store,'empty',entitlement('vip',30,0)).availableUnits,0);
  assert.equal(ensureAccountPoints(store,'free',{plan:'free'}).availableUnits,0);
});
test('same-period renewal tops up only the difference; a later period gets a separate grant',t=>{
  const store=fixture(t),short=entitlement('vip',15);
  ensureAccountPoints(store,'learner',short);
  const op=store.points.begin({userId:'learner',requestKey:'spend',signature:'fixture'}).operation;
  const call=store.points.reserveCall(op.id,{settings:{baseUrl:'https://api.deepseek.com',model:'deepseek-flash'},inputLimit:10,outputLimit:10});
  store.points.finishCall(call.id,{success:true,usage:{hasUsage:true,prompt_tokens:10,completion_tokens:10,total_tokens:20}});store.points.finish(op.id,{success:true});
  const full=entitlement();assert.equal(ensureAccountPoints(store,'learner',full).availableUnits,989960);
  assert.equal(ensureAccountPoints(store,'learner',full).availableUnits,989960);
  store.advance(30*day);
  const next={plan:'vip',generation:{...full.generation,periodStart:full.generation.periodEnd,periodEnd:new Date(fixed+60*day).toISOString()}};
  assert.equal(ensureAccountPoints(store,'learner',next).availableUnits,990000);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM ai_points_grants').get().n,2);
});
test('unfunded renewals show only the missing points and never issue credit without budget',t=>{
  const store=fixture(t,5000000);
  assert.equal(ensureAccountPoints(store,'learner',entitlement('vip',15)).availableUnits,495000);
  const pending=ensureAccountPoints(store,'learner',entitlement());
  assert.equal(pending.availableUnits,495000);assert.equal(pending.pendingUnits,495000);
  assert.equal(store.points.finance().overBudgetMicros,0);
});
test('extending an expired grant must fund the revived liability, even when its face amount is unchanged',t=>{
  const store=fixture(t,1000000),expiresAt=new Date(fixed+1000).toISOString();
  store.points.ensurePeriodicGrant({userId:'learner',sourceKey:'old-period',targetUnits:100000,expiresAt});
  store.advance(2000);
  store.points.grant({userId:'peer',sourceKey:'budget-used-elsewhere',units:120000,requireFunded:true});
  assert.throws(()=>store.points.ensurePeriodicGrant({userId:'learner',sourceKey:'old-period',targetUnits:100000,expiresAt:new Date(fixed+day).toISOString()}),{code:'AI_POINTS_GRANT_FUNDING_REQUIRED'});
  assert.equal(store.points.wallet('learner').availableUnits,0);assert.equal(store.points.finance().overBudgetMicros,0);
});
test('daily gifts are funded, idempotent, and expire at the original local day boundary',t=>{
  const store=fixture(t),date='2026-10-23';
  assert.equal(claimPointsCheckIn(store,'learner',date).claimed,true);
  assert.equal(claimPointsCheckIn(store,'learner',date).claimed,false);
  assert.equal(pointsCheckInView(store,'learner',date).claimed,true);
  assert.equal(store.points.wallet('learner').availableUnits,5000);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM ai_points_grants').get().n,1);
  store.advance(8*3600000+1);assert.equal(store.points.wallet('learner').availableUnits,0);
  const unfunded=fixture(t,0);
  assert.throws(()=>claimPointsCheckIn(unfunded,'learner',date),{code:'AI_POINTS_GRANT_FUNDING_REQUIRED'});
  assert.equal(pointsCheckInView(unfunded,'learner',date).claimed,false);
});
