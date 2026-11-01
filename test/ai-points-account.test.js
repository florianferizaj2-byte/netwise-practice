import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createPointsStore} from '../server/ai-points/store.js';
import {ensureAccountPoints,claimPointsCheckIn,pointsCheckInView,accountPointsPlans} from '../server/ai-points/account.js';
import {readCheckInPolicy,updateCheckInPolicy} from '../server/ai-points/check-in-policy.js';
const fixed=Date.parse('2026-10-26T08:00:00Z'),dayMs=86400000;
function fixture(t,plan='free') {
  let now=fixed;const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  const store={db,points:createPointsStore(db,{now:()=>now}),plan,expiresAt:fixed+60*dayMs,
    accountEntitlement(){return {plan:now>=this.expiresAt?'free':this.plan,
      generation:{periodStart:new Date(fixed).toISOString(),periodEnd:new Date(this.expiresAt).toISOString(),limit:100,remaining:100}};},
    advance(ms){now+=ms;},day(){return new Date(now+8*3600000).toISOString().slice(0,10);}};
  return store;
}
function change(store,patch={}) {
  const p=readCheckInPolicy(store);
  return {requestId:crypto.randomUUID(),revision:p.revision,enabled:p.enabled,
    requireFunded:p.requireFunded,dailyPoints:p.dailyPoints,reason:'Synthetic fixture policy adjustment',...patch};
}
test('membership reads no longer issue monthly allowances or reset existing balances',t=>{
  for(const [plan,daily] of [['free',1],['vip',33],['svip',66],['ssvip',133]]) {
    const s=fixture(t,plan);
    for(let i=0;i<3;i++){const v=ensureAccountPoints(s,'learner');assert.equal(v.availableUnits,0);assert.equal(v.pendingUnits,0);assert.equal(v.dailyCheckInPoints,daily);assert.equal(v.membershipDistribution,'daily-check-in');}
    assert.equal(s.db.prepare('SELECT count(*) n FROM ai_points_grants').get().n,0);
  }
});
test('each tier claims the configured daily reward without creating fictional revenue',t=>{
  for(const [plan,reward] of [['free',1],['vip',33],['svip',66],['ssvip',133]]) {
    const s=fixture(t,plan),v=claimPointsCheckIn(s,'learner',s.day());
    assert.equal(v.claimed,true);assert.equal(v.grants.points,reward);assert.equal(v.rewardPlan,plan);
    assert.equal(s.points.wallet('learner').availableUnits,reward*1000);
    assert.equal(s.db.prepare('SELECT count(*) n FROM ai_points_finance').get().n,0);
    assert.equal(s.db.prepare('SELECT count(*) n FROM ai_points_check_ins').get().n,1);
    assert.equal(s.points.audit().passed,true);
  }
});
test('same account and day stays idempotent after an upgrade or policy change',t=>{
  const s=fixture(t);claimPointsCheckIn(s,'learner',s.day());s.plan='vip';
  updateCheckInPolicy(s,change(s,{dailyPoints:{free:2,vip:40,svip:80,ssvip:160}}),'admin');
  const v=pointsCheckInView(s,'learner',s.day());
  assert.equal(v.grants.points,1);assert.equal(v.rewardPlan,'free');assert.equal(v.policyRevision,0);
  assert.equal(v.configuredPoints,40);assert.equal(v.canClaim,false);
  assert.equal(claimPointsCheckIn(s,'learner',s.day()).claimed,false);
  assert.equal(s.points.wallet('learner').availableUnits,1000);
  assert.equal(s.db.prepare('SELECT count(*) n FROM ai_points_journal').get().n,1);
});
test('rewards expire at Beijing midnight and a later day may claim again',t=>{
  const s=fixture(t,'svip');const first=claimPointsCheckIn(s,'learner',s.day());
  assert.equal(first.expiresAt,'2026-10-26T15:59:59.999Z');
  s.advance(8*3600000+1);assert.equal(s.points.wallet('learner').availableUnits,0);
  assert.equal(pointsCheckInView(s,'learner',s.day()).claimed,false);
  assert.equal(claimPointsCheckIn(s,'learner',s.day()).grants.points,66);
  assert.equal(s.points.wallet('learner').availableUnits,66000);
});
test('expired membership receives the free reward determined by the server',t=>{
  const s=fixture(t,'ssvip');s.expiresAt=fixed+1000;s.advance(2000);
  assert.equal(pointsCheckInView(s,'learner',s.day()).plan,'free');
  assert.equal(claimPointsCheckIn(s,'learner',s.day()).grants.points,1);
});
test('old monthly balances are retained and cannot be paid twice during the prepaid period',t=>{
  const s=fixture(t,'vip'),expiry=new Date(fixed+30*dayMs).toISOString();
  s.points.grant({userId:'learner',sourceKey:'membership:vip:legacy-period',kind:'membership',units:990000,expiresAt:expiry});
  const before=s.db.prepare('SELECT * FROM ai_points_grants').all();
  assert.equal(ensureAccountPoints(s,'learner').availableUnits,990000);
  assert.deepEqual(s.db.prepare('SELECT * FROM ai_points_grants').all(),before);
  const view=pointsCheckInView(s,'learner',s.day());
  assert.equal(view.grants.points,0);assert.equal(view.canClaim,false);assert.equal(view.dailyStartsAt,expiry);
  assert.throws(()=>claimPointsCheckIn(s,'learner',s.day()),{code:'AI_POINTS_MEMBERSHIP_PREPAID'});
  s.advance(30*dayMs+1);
  assert.equal(claimPointsCheckIn(s,'learner',s.day()).grants.points,33);
  assert.equal(s.points.wallet('learner').availableUnits,33000);
  assert.equal(s.db.prepare("SELECT count(*) n FROM ai_points_grants WHERE kind='membership'").get().n,1);
});
test('an already spent prepaid monthly grant still prevents a duplicate daily allocation',t=>{
  const s=fixture(t,'vip');
  s.points.recordFinance({key:'synthetic-spent',kind:'revenue',amountMicros:1000000,reference:'synthetic-legacy-spend-income',createdBy:'fixture'});
  s.points.grant({userId:'learner',sourceKey:'membership:vip:used',kind:'membership',units:40,expiresAt:new Date(fixed+dayMs).toISOString()});
  const op=s.points.begin({userId:'learner',requestKey:'synthetic-legacy-use',signature:'fixture'}).operation;
  const call=s.points.reserveCall(op.id,{settings:{baseUrl:'https://api.deepseek.com',model:'deepseek-flash'},inputLimit:10,outputLimit:10});
  s.points.finishCall(call.id,{success:true,usage:{hasUsage:true,prompt_tokens:10,completion_tokens:10,total_tokens:20}});
  s.points.finish(op.id,{success:true});
  assert.equal(s.points.audit().passed,true);
  assert.equal(ensureAccountPoints(s,'learner').availableUnits,0);
  assert.equal(pointsCheckInView(s,'learner',s.day()).canClaim,false);
});
test('old five-point daily grants remain claimed without amount conflicts or replacement',t=>{
  const s=fixture(t);
  s.points.grant({userId:'learner',sourceKey:'check-in:'+s.day(),kind:'daily-gift',units:5000,expiresAt:'2026-10-26T15:59:59.999Z'});
  assert.equal(pointsCheckInView(s,'learner',s.day()).grants.points,5);
  assert.equal(claimPointsCheckIn(s,'learner',s.day()).claimed,false);
  assert.equal(s.points.wallet('learner').availableUnits,5000);
});
test('disabled check-in and optional funded mode reject without partial grants or fake income',t=>{
  const s=fixture(t);
  updateCheckInPolicy(s,change(s,{enabled:false}),'admin');
  assert.throws(()=>claimPointsCheckIn(s,'learner',s.day()),{code:'AI_POINTS_CHECK_IN_DISABLED'});
  updateCheckInPolicy(s,change(s,{enabled:true,requireFunded:true}),'admin');
  assert.throws(()=>claimPointsCheckIn(s,'learner',s.day()),{code:'AI_POINTS_GRANT_FUNDING_REQUIRED'});
  assert.equal(s.db.prepare('SELECT count(*) n FROM ai_points_grants').get().n,0);
  assert.equal(s.db.prepare('SELECT count(*) n FROM ai_points_check_ins').get().n,0);
  s.points.recordFinance({key:'synthetic-income',kind:'revenue',amountMicros:1000000,reference:'synthetic-fixture-income',createdBy:'fixture'});
  assert.equal(claimPointsCheckIn(s,'learner',s.day()).claimed,true);
});
test('policy updates validate tiers, reject stale writes and replay exactly once',t=>{
  const s=fixture(t),body=change(s,{dailyPoints:{free:2,vip:34,svip:67,ssvip:134}});
  const first=updateCheckInPolicy(s,body,'admin');assert.equal(first.policy.revision,1);
  assert.equal(updateCheckInPolicy(s,body,'admin').replayed,true);
  assert.equal(s.db.prepare('SELECT count(*) n FROM ai_points_check_in_policy_changes').get().n,1);
  assert.throws(()=>updateCheckInPolicy(s,{...body,requestId:crypto.randomUUID()},'admin'),{code:'AI_POINTS_CHECK_IN_POLICY_CONFLICT'});
  assert.throws(()=>updateCheckInPolicy(s,{...body,reason:'Different synthetic reason'},'admin'),{code:'AI_POINTS_IDEMPOTENCY_CONFLICT'});
  assert.throws(()=>updateCheckInPolicy(s,body,'other-admin'),{code:'AI_POINTS_IDEMPOTENCY_CONFLICT'});
  for(const amount of [-1,0,0.5,100001])assert.throws(()=>updateCheckInPolicy(s,change(s,{dailyPoints:{...body.dailyPoints,free:amount}}),'admin'));
  assert.equal(accountPointsPlans(s).ssvip.dailyPoints,134);
});
test('legacy periodic-grant budget protection remains unchanged outside daily check-in',t=>{
  const s=fixture(t),expiresAt=new Date(fixed+1000).toISOString();
  s.points.recordFinance({key:'synthetic',kind:'revenue',amountMicros:1000000,reference:'synthetic-legacy-funding',createdBy:'fixture'});
  s.points.ensurePeriodicGrant({userId:'learner',sourceKey:'old-period',targetUnits:100000,expiresAt});
  s.advance(2000);s.points.grant({userId:'peer',sourceKey:'budget-used-elsewhere',units:120000,requireFunded:true});
  assert.throws(()=>s.points.ensurePeriodicGrant({userId:'learner',sourceKey:'old-period',targetUnits:100000,expiresAt:new Date(fixed+dayMs).toISOString()}),{code:'AI_POINTS_GRANT_FUNDING_REQUIRED'});
  assert.equal(s.points.wallet('learner').availableUnits,0);assert.equal(s.points.finance().overBudgetMicros,0);
});
