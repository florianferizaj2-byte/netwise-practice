import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {z} from 'zod';
import {createPointsStore} from '../server/ai-points/store.js';
import {withPointsTask} from '../server/ai-points/runtime.js';
import {OpenAICompatibleProvider} from '../server/ai.js';

const settings={baseUrl:'https://api.deepseek.com',model:'deepseek-flash',apiKey:'synthetic-test-key',temperature:0};
function fixture(t,{funded=true,credits=true,reply}={}){
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  const points=createPointsStore(db,{now:()=>Date.parse('2026-10-23T08:00:00Z')}),usage=[],requests=[];
  if(funded)points.recordFinance({key:'receipt',kind:'revenue',amountMicros:9900000,userId:'learner',reference:'合成测试实收',createdBy:'fixture-admin'});
  if(credits)points.grant({userId:'learner',sourceKey:'fixture',units:990000});
  const store={points,saveUsage:(row,userId)=>usage.push({...row,userId})};
  const provider=new OpenAICompatibleProvider(store,{fetch:async(_url,options)=>{
    const body=JSON.parse(options.body);requests.push(body);
    return reply?reply(body,requests.length):new Response(JSON.stringify({choices:[{message:{content:'{"text":"完整合成测试答案"}'},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}}),{headers:{'Content-Type':'application/json'}});
  }});
  return {db,points,provider,store,usage,requests};
}

test('all real provider calls require both points and funded cost budget before accessing upstream',async t=>{
  for(const options of [{funded:false},{credits:false}]){
    const f=fixture(t,options);
    await assert.rejects(f.provider.call([{role:'user',content:'test'}],settings,{userId:'learner'}),error=>['AI_POINTS_COST_BUDGET_EXHAUSTED','AI_POINTS_INSUFFICIENT'].includes(error.code));
    assert.equal(f.requests.length,0);assert.equal(f.points.wallet('learner').heldUnits,0);
  }
});

test('direct connection tests are billed and correlate measured user usage with the point ledger',async t=>{
  const f=fixture(t);
  await f.provider.call([{role:'user',content:'test'}],settings,{userId:'learner',taskType:'connection-test'});
  assert.equal(f.requests.length,1);assert.equal(f.usage.length,1);
  assert.equal(f.usage[0].estimatedCostCny,0.0001);
  assert.ok(f.usage[0].pointsOperationId);assert.ok(f.usage[0].pointsCallId);
  assert.equal(f.points.wallet('learner').availableUnits,990000-40);
  assert.equal(f.points.audit().passed,true);
});

test('a multi-call generation rejected by its final independent review refunds the whole task',async t=>{
  const f=fixture(t);
  await assert.rejects(withPointsTask(f.store,'learner',async()=>{
    await f.provider.call([{role:'user',content:'generate'}],settings,{userId:'learner',taskType:'question-generation'});
    await f.provider.call([{role:'user',content:'review'}],settings,{userId:'learner',taskType:'question-review'});
    throw new Error('合成测试：最终独立审核不通过');
  },{feature:'question-generation'}),/最终独立审核不通过/);
  assert.equal(f.requests.length,2);assert.equal(f.points.wallet('learner').availableUnits,990000);
  assert.equal(f.points.finance().aiSpentMicros,200);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM ai_points_operations').get().n,1);
  assert.equal(f.points.audit().passed,true);
});

test('structured retries remain in one task and schema failure returns every preheld point',async t=>{
  const f=fixture(t);
  await assert.rejects(withPointsTask(f.store,'learner',()=>f.provider.structured('合成测试',{},z.object({missing:z.string()}).strict(),undefined,settings,undefined,'learner',{taskType:'study-content-review'})),/AI/);
  assert.equal(f.requests.length,3);assert.equal(f.points.wallet('learner').availableUnits,990000);
  assert.equal(f.points.finance().aiSpentMicros,300);
});

test('a lost response can replay a settled task without another call or another debit',async t=>{
  const f=fixture(t),options={requestKey:'stable-client-request',signature:'same-input',feature:'teacher'};
  const run=()=>f.provider.structured('test',{},z.object({text:z.string()}),undefined,settings,undefined,'learner',{taskType:'study-teacher'});
  const first=await withPointsTask(f.store,'learner',run,options);
  const after=f.points.wallet('learner').availableUnits;
  assert.deepEqual(await withPointsTask(f.store,'learner',run,options),first);
  assert.equal(f.requests.length,1);assert.equal(f.points.wallet('learner').availableUnits,after);
});

test('concurrent duplicate task requests execute at most once',async t=>{
  let finish;
  const f=fixture(t,{reply:()=>new Promise(resolve=>{finish=resolve;})});
  const options={requestKey:'same-in-flight-request',signature:'same-input',feature:'teacher'};
  const first=withPointsTask(f.store,'learner',()=>f.provider.call([{role:'user',content:'test'}],settings,{userId:'learner'}),options);
  await assert.rejects(withPointsTask(f.store,'learner',()=>{throw new Error('duplicate executed');},options),{code:'AI_POINTS_REQUEST_IN_PROGRESS'});
  finish(new Response(JSON.stringify({choices:[{message:{content:'OK'}}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}})));
  assert.equal(await first,'OK');assert.equal(f.requests.length,1);assert.equal(f.points.audit().passed,true);
});

test('account identity cannot change inside a billed task',async t=>{
  const f=fixture(t);
  await assert.rejects(withPointsTask(f.store,'learner',()=>f.provider.call([{role:'user',content:'test'}],settings,{userId:'other-user'})),{code:'AI_POINTS_ACCOUNT_MISMATCH'});
  assert.equal(f.requests.length,0);assert.equal(f.points.wallet('learner').availableUnits,990000);
});

test('HTTP failures refund points while unmeasured upstream exposure remains visible',async t=>{
  const f=fixture(t,{reply:()=>new Response('upstream error',{status:500})});
  await assert.rejects(f.provider.call([{role:'user',content:'test'}],settings,{userId:'learner'}));
  assert.equal(f.points.wallet('learner').availableUnits,990000);
  assert.ok(f.points.finance().aiSpentMicros>0);assert.equal(f.points.finance().unknownCostCalls,1);
});

test('streamed truncation still reads the final usage chunk and bills one successful retry task',async t=>{
  const f=fixture(t,{reply:(body,index)=>{
    assert.equal(body.stream_options.include_usage,true);
    const text=index===1?'{"text":"partial':'{"text":"完整合成测试答案"}';
    const events=[{choices:[{delta:{content:text}}]},{choices:[{delta:{},finish_reason:index===1?'length':'stop'}]},{choices:[],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}}];
    return new Response(events.map(event=>'data: '+JSON.stringify(event)+'\n\n').join('')+'data: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
  }});
  const result=await f.provider.structured('test',{},z.object({text:z.string()}),undefined,settings,()=>{},'learner',{taskType:'question-explanation'});
  assert.equal(result.text,'完整合成测试答案');assert.equal(f.requests.length,2);
  assert.equal(f.points.wallet('learner').availableUnits,990000-80);
  assert.equal(f.points.finance().unknownCostCalls,0);assert.equal(f.points.audit().passed,true);
});

test('a failed request can retry under the same logical identity without erasing its prior refund',async t=>{
  const f=fixture(t),options={requestKey:'retryable-question',signature:'same-input',feature:'teacher',retryFailed:true};
  await assert.rejects(withPointsTask(f.store,'learner',async()=>{
    await f.provider.call([{role:'user',content:'first attempt'}],settings,{userId:'learner'});
    throw new Error('synthetic validation failed');
  },options));
  assert.equal(f.points.wallet('learner').availableUnits,990000);
  await withPointsTask(f.store,'learner',()=>f.provider.call([{role:'user',content:'second attempt'}],settings,{userId:'learner'}),options);
  const rows=f.db.prepare('SELECT state,attempt,charged_units FROM ai_points_operations ORDER BY attempt').all();
  assert.deepEqual(rows.map(row=>row.state),['refunded','settled']);
  assert.deepEqual(rows.map(row=>row.attempt),[0,1]);assert.equal(rows[0].charged_units,0);assert.equal(rows[1].charged_units,40);
  assert.equal(f.requests.length,2);assert.equal(f.points.finance().aiSpentMicros,200);assert.equal(f.points.audit().passed,true);
});

test('non-stop provider finish reasons are failures, not billable successful answers',async t=>{
  for(const reason of ['content_filter','insufficient_system_resource','tool_calls','aborted']){
    const f=fixture(t,{reply:()=>new Response(JSON.stringify({choices:[{message:{content:'discarded partial response'},finish_reason:reason}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}}))});
    await assert.rejects(f.provider.call([{role:'user',content:'test'}],settings,{userId:'learner'}),{code:'AI_OUTPUT_INCOMPLETE'});
    assert.equal(f.points.wallet('learner').availableUnits,990000);assert.equal(f.points.wallet('learner').heldUnits,0);
    assert.equal(f.points.finance().aiSpentMicros,100);assert.equal(f.points.finance().unknownCostCalls,0);
  }
});
