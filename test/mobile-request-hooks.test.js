import test from 'node:test';
import assert from 'node:assert/strict';
import {mobileModules,memoryStorage,deferred,tick} from './mobile-fixture.js';
async function fixture(t){const load=await mobileModules(t,memoryStorage()),client=await load('client');const original=globalThis.fetch;
  t.after(async()=>{await client.clearSessionToken();globalThis.fetch=original;});await client.setSessionToken('hooks-fixture');return client;}
test('an installed Android confirmation blocks transport until accepted and cancellation sends no request',async t=>{
  const client=await fixture(t),before=deferred();let calls=0;globalThis.fetch=async()=>{calls++;return new Response('{"text":"fixture"}');};
  const off=client.registerMobileRequestHooks({handles:()=>true,before:()=>before.promise,after:()=>{throw Error('must not observe unsent request');}});t.after(off);
  const pending=client.mobileApi.teacher('q','详细讲解',[]),rejected=assert.rejects(pending,/cancel fixture/);await tick();assert.equal(calls,0);
  before.reject(new Error('cancel fixture'));await rejected;assert.equal(calls,0);
});
test('JSON receipt correlation uses the same request ID as the actual transport, and missing observers preserve existing Web behavior',async t=>{
  const client=await fixture(t),events=[],requests=[];globalThis.fetch=async(_url,init)=>{requests.push(init);return new Response('{"text":"fixture"}');};
  const off=client.registerMobileRequestHooks({handles:c=>c.path==='/ai/teacher',before:async c=>events.push(['before',c]),after:(c,result)=>events.push(['after',c,result])});
  await client.mobileApi.teacher('q','详细讲解',[]);assert.equal(events[0][1].requestId,requests[0].headers['X-AI-Request-Id']);assert.equal(events[1][2].ok,true);
  off();await client.mobileApi.teacher('q','详细讲解',[]);assert.equal(events.length,2);assert.equal(requests.length,2);
});
test('streaming requests also wait for consent and correlate to their own UUID without breaking progress or results',async t=>{
  const client=await fixture(t),gate=deferred(),events=[];let init,calls=0,progress=0;
  globalThis.fetch=async(_url,options)=>{init=options;calls++;return new Response('data: {"type":"progress","message":"fixture"}\n\ndata: {"type":"done","result":{"questions":[],"cached":true}}\n\n');};
  const off=client.registerMobileRequestHooks({handles:()=>true,before:()=>gate.promise,after:(c,o)=>events.push([c,o])});t.after(off);
  const pending=client.mobileApi.trainStream('q',3,()=>progress++);await tick();assert.equal(calls,0);gate.resolve();const result=await pending;
  assert.equal(result.cached,true);assert.equal(progress,1);assert.equal(events[0][0].requestId,init.headers['X-AI-Request-Id']);
});
test('an account change while waiting prevents a paid request and a failed display observer cannot break successful results',async t=>{
  const client=await fixture(t),gate=deferred();let calls=0;globalThis.fetch=async()=>{calls++;return new Response('{"text":"fixture"}');};
  let off=client.registerMobileRequestHooks({handles:()=>true,before:()=>gate.promise,after:()=>{}});
  const pending=client.mobileApi.teacher('q','详细讲解',[]),rejected=assert.rejects(pending,{name:'CacheCancelledError'});
  await client.setSessionToken('other');gate.resolve();await rejected;assert.equal(calls,0);off();
  off=client.registerMobileRequestHooks({handles:()=>true,after:()=>{throw Error('display failed');}});t.after(off);
  assert.equal((await client.mobileApi.teacher('q','详细讲解',[])).text,'fixture');assert.equal(calls,1);
});
