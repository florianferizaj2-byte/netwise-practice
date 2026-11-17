import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source=stripTypeScriptTypes(fs.readFileSync(new URL('../mobile/src/api/androidPointsFlow.android.ts',import.meta.url),'utf8'),{mode:'transform'});
const {createAndroidPointsFlow,androidSpendService}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const ctx=(path='/ai/teacher',body={action:'详细讲解'})=>({path,method:'POST',body:JSON.stringify(body),requestId:'11111111-1111-4111-8111-111111111111',revision:1});
function fixture(overrides={}){
  const context={token:'first',revision:1},timers=new Map(),notices=[],lookups=[];let counter=0;
  const wallet={availableUnits:100000,heldUnits:0,scale:1000};
  let result={found:false,pending:false,chargedUnits:0,heldUnits:0,refundedUnits:0,releasedUnits:0,operations:[],calls:[],wallet};
  const flow=createAndroidPointsFlow({context:()=>context,wallet:async()=>({wallet:{...wallet}}),services:async()=>({models:[],available:false}),
    receipt:async lookup=>{lookups.push(lookup);if(result instanceof Error)throw result;return result;},
    notify:message=>notices.push(message),schedule:(fn,ms)=>{const id=++counter;timers.set(id,{fn,ms});return id;},clearSchedule:id=>timers.delete(id),...overrides});
  flow.activate('first:certificate');
  const poll=async()=>{for(const [id,t]of [...timers])if(t.ms===3000){timers.delete(id);t.fn();}await tick();};
  return {flow,context,wallet,timers,notices,lookups,poll,setReceipt:value=>{result=value;},receipt:patch=>({...result,...patch})};
}
test('Android classification covers text, streaming, jobs, grading and teachers, not free learning or credit grants',()=>{
  for(const path of ['/ai/teacher','/ai/analyze','/ai/daily','/ai/train','/ai/train/stream','/ai/questions/draft/stream','/ai/questions/generations','/study/practice-sessions/id/attempts','/study/attempts/id/retry','/study/teacher'])assert.ok(androidSpendService(ctx(path)));
  for(const path of ['/attempts','/location-learning/id/answer','/account/check-in','/account/redeem','/study/practice-sessions'])assert.equal(androidSpendService(ctx(path)),null);
  assert.equal(androidSpendService(ctx('/study/teacher',{action:'simple'})).knownFree,true);
  assert.equal(androidSpendService(ctx('/study/teacher',{action:'example'})).knownFree,true);
  assert.ok(androidSpendService(ctx('/study/teacher',{action:'simple',questionId:'q'})));
  assert.equal(androidSpendService({...ctx(),body:'null'}).name,'题目讲解');
});
test('one tap proceeds without confirmation or a client balance gate; zero balance still permits free results',async()=>{
  const f=fixture();await tick();f.wallet.availableUnits=0;
  await f.flow.refresh();
  const grading=ctx('/study/practice-sessions/id/attempts');await f.flow.hooks.before(grading);
  assert.equal(Object.hasOwn(f.flow.getSnapshot(),'prompt'),false);
  assert.equal(f.flow.getSnapshot().running,1);assert.equal(f.lookups.length,0);
  f.flow.hooks.after(grading,{ok:true,data:{cached:true}});await tick();
  assert.match(f.flow.getSnapshot().message,/本次 0 积分/);assert.equal(f.flow.getSnapshot().running,0);
  assert.equal(f.flow.getSnapshot().wallet.availableUnits,0);f.flow.deactivate();
});
test('actual receipt, not a changing wallet delta, determines charge and released reservation',async()=>{
  const f=fixture();await tick();f.setReceipt(f.receipt({found:true,chargedUnits:350,releasedUnits:1650,wallet:{...f.wallet,availableUnits:700000}}));
  const c=ctx();await f.flow.hooks.before(c);f.flow.hooks.after(c,{ok:true});await tick();
  assert.match(f.flow.getSnapshot().message,/实扣 0.35 积分/);assert.match(f.flow.getSnapshot().message,/1.65 已释放/);
  assert.equal(f.flow.getSnapshot().wallet.availableUnits,700000);assert.equal(f.notices.length,1);f.flow.deactivate();
});
test('complete refund is only shown after the server confirms it; lost response never fabricates a refund',async()=>{
  const f=fixture();await tick();f.setReceipt(new Error('offline'));
  const c=ctx();await f.flow.hooks.before(c);f.flow.hooks.after(c,{ok:false,error:new Error('lost')});await tick();
  assert.match(f.flow.getSnapshot().message,/尚不能确认扣费或退款/);assert.doesNotMatch(f.flow.getSnapshot().message,/已退回/);
  f.setReceipt({found:true,pending:false,chargedUnits:0,heldUnits:0,refundedUnits:6000,releasedUnits:0,wallet:f.wallet,operations:[],calls:[]});
  await f.poll();assert.match(f.flow.getSnapshot().message,/已退回 6 积分/);f.flow.deactivate();
});
test('queued generation polls the existing job billing key through pending and settlement, without another AI request',async()=>{
  const f=fixture();await tick();const c=ctx('/ai/questions/generations',{count:3});
  await f.flow.hooks.before(c);
  f.setReceipt(f.receipt({found:true,pending:true,heldUnits:1200}));
  f.flow.hooks.after(c,{ok:true,data:{job:{id:'22222222-2222-4222-8222-222222222222'}}});await tick();
  assert.deepEqual(f.lookups[0],{jobId:'22222222-2222-4222-8222-222222222222'});assert.match(f.flow.getSnapshot().message,/正在结算/);
  f.setReceipt(f.receipt({found:true,pending:false,chargedUnits:250,heldUnits:0}));await f.poll();
  assert.match(f.flow.getSnapshot().message,/实扣 0.25 积分/);assert.equal(f.lookups.length,2);f.flow.deactivate();
});
test('account changes block stale requests and ignore old in-flight receipts',async()=>{
  const f=fixture();await tick();const c=ctx(),old=f.receipt({found:true,chargedUnits:350,wallet:{...f.wallet}});
  let resolveReceipt;f.setReceipt(new Promise(resolve=>{resolveReceipt=resolve;}));
  await f.flow.hooks.before(c);f.flow.hooks.after(c,{ok:true});await tick();assert.equal(f.lookups.length,1);
  f.context.token='second';f.context.revision=2;f.wallet.availableUnits=1000;f.flow.activate('second:certificate');await tick();
  await assert.rejects(f.flow.hooks.before(c),{name:'AiPointsCancelledError'});
  resolveReceipt(old);await tick();
  assert.equal(f.flow.getSnapshot().wallet.availableUnits,1000);assert.equal(f.notices.length,0);
  f.flow.hooks.after(c,{ok:true});await tick();assert.equal(f.lookups.length,1);f.flow.deactivate();
});
test('check-in and redeem refresh points without a spend prompt and background polls pause until foreground',async()=>{
  const f=fixture();await tick();await f.flow.hooks.before(ctx('/account/check-in'));assert.equal(f.flow.getSnapshot().running,0);
  f.wallet.availableUnits=105000;f.flow.hooks.after(ctx('/account/check-in'),{ok:true});await tick();assert.equal(f.flow.getSnapshot().wallet.availableUnits,105000);
  f.setReceipt(f.receipt({found:true,pending:true,heldUnits:1000}));const c=ctx();await f.flow.hooks.before(c);f.flow.hooks.after(c,{ok:true});await tick();
  const count=f.lookups.length;f.flow.setAppActive(false);await f.poll();assert.equal(f.lookups.length,count);
  f.setReceipt(f.receipt({found:true,pending:false,chargedUnits:100}));f.flow.setAppActive(true);await tick();assert.equal(f.lookups.length,count+1);f.flow.deactivate();
});
test('older wallet snapshots cannot undo a newer receipt or resurrect an expired balance',async()=>{
  const f=fixture();await tick();Object.assign(f.wallet,{ledgerRevision:10,snapshotAt:10});await f.flow.refresh();
  f.setReceipt(f.receipt({found:true,chargedUnits:350,wallet:{...f.wallet,availableUnits:99650,ledgerRevision:11,snapshotAt:20}}));
  const c=ctx();await f.flow.hooks.before(c);f.flow.hooks.after(c,{ok:true});await tick();await f.flow.refresh();
  assert.equal(f.flow.getSnapshot().wallet.availableUnits,99650);
  Object.assign(f.wallet,{ledgerRevision:11,snapshotAt:30,availableUnits:0});await f.flow.refresh();
  Object.assign(f.wallet,{ledgerRevision:11,snapshotAt:20,availableUnits:99650});await f.flow.refresh();
  assert.equal(f.flow.getSnapshot().wallet.availableUnits,0);f.flow.deactivate();
});
test('presentation follows the active teacher modal and returns to the root without duplicate dialogs',()=>{
  const f=fixture(),off=f.flow.presentOn('teacher-modal');assert.equal(f.flow.getSnapshot().presentationHost,'teacher-modal');
  const off2=f.flow.presentOn('another-modal');assert.equal(f.flow.getSnapshot().presentationHost,'another-modal');off2();
  assert.equal(f.flow.getSnapshot().presentationHost,'teacher-modal');off();assert.equal(f.flow.getSnapshot().presentationHost,'root');f.flow.deactivate();
});
test('an expired session stays inactive without an activation-render loop',async()=>{
  const f=fixture();await tick();f.context.token=null;f.context.revision++;
  f.flow.activate('first:certificate');const snapshot=f.flow.getSnapshot();f.flow.activate('first:certificate');
  assert.equal(f.flow.getSnapshot(),snapshot);assert.equal(snapshot.ownerKey,null);assert.equal(snapshot.wallet,null);
});
test('prevalidated free teacher content still reports its zero receipt without showing a charging state',async()=>{
  const f=fixture();await tick();const c=ctx('/study/teacher',{action:'simple'});await f.flow.hooks.before(c);
  assert.equal(f.flow.getSnapshot().running,0);f.flow.hooks.after(c,{ok:true,data:{cached:true}});await tick();
  assert.match(f.flow.getSnapshot().message,/已有课程讲解：本次 0 积分/);f.flow.deactivate();
});
test('a rejected request with no owned bill stops reconciliation rather than claiming a refund or polling forever',async()=>{
  const f=fixture();await tick();const c=ctx();await f.flow.hooks.before(c);
  f.flow.hooks.after(c,{ok:false,error:{status:402}});await tick();assert.match(f.flow.getSnapshot().message,/未新增积分账单/);
  assert.doesNotMatch(f.flow.getSnapshot().message,/已退回/);assert.equal([...f.timers.values()].filter(t=>t.ms===3000).length,0);f.flow.deactivate();
});
test('a native toast failure cannot erase an already verified receipt',async()=>{
  const f=fixture({notify:()=>{throw Error('native toast unavailable');}});await tick();f.setReceipt(f.receipt({found:true,chargedUnits:350}));
  const c=ctx();await f.flow.hooks.before(c);f.flow.hooks.after(c,{ok:true});await tick();
  assert.match(f.flow.getSnapshot().message,/实扣 0.35 积分/);assert.equal(f.flow.getSnapshot().error,'');f.flow.deactivate();
});
