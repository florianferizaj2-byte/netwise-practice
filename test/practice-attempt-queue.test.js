import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=stripTypeScriptTypes(fs.readFileSync(new URL('../mobile/src/api/practiceAttemptQueue.ts',import.meta.url),'utf8'));
const {createPracticeAttemptQueue}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const tick=()=>new Promise(r=>setImmediate(r));
async function until(check){for(let i=0;i<200;i++){if(check())return;await tick();}assert.ok(check(),'expected asynchronous queue state');}
function fixture(send){const data=new Map(),timers=[];let revision=1,token='alice',sequence=0;const context=()=>({token,revision});const deps={storage:{async getItem(k){return data.get(k)||null},async setItem(k,v){data.set(k,v)}},session:context,id:()=>`00000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`,send,schedule:fn=>{timers.push(fn);return timers.length},cancel:()=>{}};return {data,timers,deps,queue:createPracticeAttemptQueue(deps),switch:(next)=>{token=next;revision++},context};}
const payload=n=>({questionId:'q'+n,selected:['B'],timeMs:1000});const result=p=>({questionId:p.questionId,selected:p.selected,correct:false,timeMs:p.timeMs,answer:['A'],analysis:'server grade'});

test('enqueue and send share one durable write for the same payload without weakening write-before-send',async()=>{
 let writes=0,resolve;
 const f=fixture(async p=>{assert.equal(writes,1);await new Promise(r=>resolve=r);return result(p)});
 const original=f.deps.storage.setItem;f.deps.storage.setItem=async(k,v)=>{writes++;return original(k,v)};
 f.queue.activate('alice:cert');await until(()=>f.queue.getSnapshot().ready);
 f.queue.enqueue(payload(1));await until(()=>!!resolve);assert.equal(writes,1);
 resolve();await until(()=>f.queue.getSnapshot().entries[0].status==='saved');
 await until(()=>writes===2);f.queue.activate(null);
});
test('multiple rapid answers are durable before transport and do not wait for a slow previous acknowledgement',async()=>{
 let resolve;const sends=[];const f=fixture(async p=>{sends.push(p);if(sends.length===1)await new Promise(r=>resolve=r);return result(p)});f.queue.activate('alice:cert');await until(()=>f.queue.getSnapshot().ready);
 const first=f.queue.enqueue(payload(1)),second=f.queue.enqueue(payload(2));await until(()=>sends.length===1&&[...f.data.values()].some(raw=>JSON.parse(raw).length===2));
 assert.notEqual(first,second);assert.equal(f.queue.getSnapshot().entries.length,2);assert.equal(sends[0].clientAttemptId,first);resolve();await until(()=>f.queue.getSnapshot().entries.every(e=>e.status==='saved'));assert.equal(sends.length,2);assert.equal([...f.data.values()].some(raw=>JSON.parse(raw).length===0),true);f.queue.activate(null);
});
test('a lost acknowledgement and process restart reuse attempt identities and never duplicate a recorded answer',async()=>{
 const graded=new Map();let lose=true,transports=0;const f=fixture(async p=>{transports++;if(!graded.has(p.clientAttemptId))graded.set(p.clientAttemptId,result(p));if(lose){lose=false;throw Error('lost acknowledgement')}return graded.get(p.clientAttemptId)});f.queue.activate('alice:cert');await until(()=>f.queue.getSnapshot().ready);const id=f.queue.enqueue(payload(1));await until(()=>f.timers.length===1);f.queue.activate(null);
 const restarted=createPracticeAttemptQueue(f.deps);restarted.activate('alice:cert');await until(()=>restarted.getSnapshot().entries[0]?.status==='saved');assert.equal(graded.size,1);assert.equal(transports,2);assert.equal(restarted.getSnapshot().entries[0].id,id);restarted.activate(null);
});
test('account/certificate changes neither display nor transport the previous owner queue',async()=>{
 const sent=[];const f=fixture(async p=>{sent.push([f.context().token,p.questionId]);return result(p)});f.queue.setActive(false);f.queue.activate('alice:certA');await until(()=>f.queue.getSnapshot().ready);f.queue.enqueue(payload(1));await tick();await tick();f.switch('bob');assert.throws(()=>f.queue.enqueue(payload(2)));f.queue.activate('bob:certB');await until(()=>f.queue.getSnapshot().ready);assert.deepEqual(f.queue.getSnapshot().entries,[]);f.queue.setActive(true);await tick();assert.deepEqual(sent,[]);
 f.switch('alice');f.queue.activate('alice:certA');await until(()=>f.queue.getSnapshot().entries[0]?.status==='saved');assert.deepEqual(sent,[['alice','q1']]);f.queue.activate(null);
});
test('validation failures remain visible and manually retry with the same id',async()=>{
 let fail=true;const ids=[];const f=fixture(async p=>{ids.push(p.clientAttemptId);if(fail)throw Object.assign(Error('question changed'),{status:400});return result(p)});f.queue.activate('alice:cert');await until(()=>f.queue.getSnapshot().ready);const id=f.queue.enqueue(payload(1));await until(()=>f.queue.getSnapshot().entries[0]?.status==='failed');assert.equal(f.timers.length,0);assert.ok(f.queue.getSnapshot().entries[0].error);fail=false;f.queue.retry(id);await until(()=>f.queue.getSnapshot().entries[0]?.status==='saved');assert.deepEqual(ids,[id,id]);f.queue.activate(null);
});
test('retries are bounded and background state pauses draining without deleting pending answers',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;throw Error('offline')});f.queue.activate('alice:cert');await until(()=>f.queue.getSnapshot().ready);f.queue.enqueue(payload(1));await until(()=>f.timers.length===1);f.queue.setActive(false);f.timers.shift()();await tick();assert.equal(calls,1);f.queue.setActive(true);await until(()=>f.timers.length===1);f.timers.shift()();await until(()=>f.queue.getSnapshot().entries[0]?.status==='failed');assert.equal(calls,3);assert.ok([...f.data.values()].some(raw=>JSON.parse(raw).length===1));f.queue.activate(null);
});
test('temporary local storage read failure is recoverable without overwriting the stored queue',async()=>{
 const f=fixture(async p=>result(p));let fail=true;f.deps.storage.getItem=async()=>{if(fail)throw Error('temporary disk error');return null};const q=createPracticeAttemptQueue(f.deps);q.activate('alice:cert');await until(()=>q.getSnapshot().entries[0]?.status==='failed');assert.equal(q.getSnapshot().ready,false);assert.throws(()=>q.enqueue(payload(1)));fail=false;q.retry();await until(()=>q.getSnapshot().ready);assert.deepEqual(q.getSnapshot().entries,[]);q.activate(null);
});
