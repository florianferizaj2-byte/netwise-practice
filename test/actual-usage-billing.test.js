import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createPointsStore} from '../server/ai-points/store.js';
import {createStore} from '../server/store.js';
import {createApp} from '../server/index.js';
import {OpenAICompatibleProvider} from '../server/ai.js';
import {deepSeekPriceBand,resolveRateCard,officialRateCards} from '../server/ai-points/pricing.js';
import {membershipCostForecast,modelPointExamples} from '../server/ai-points/service-prices.js';
const settings={baseUrl:'https://api.deepseek.com',model:'deepseek-flash'};
test('official CNY rates follow Beijing peak boundaries, weekends and verified holidays',()=>{
  for(const [date,band] of [
    ['2026-10-26T08:59:59+08:00','off-peak'],['2026-10-26T09:00:00+08:00','peak'],
    ['2026-10-26T11:59:59+08:00','peak'],['2026-10-26T12:00:00+08:00','off-peak'],
    ['2026-10-26T13:59:59+08:00','off-peak'],['2026-10-26T14:00:00+08:00','peak'],
    ['2026-10-26T17:59:59+08:00','peak'],['2026-10-26T18:00:00+08:00','off-peak'],
    ['2026-10-24T10:00:00+08:00','off-peak'],['2026-10-25T15:00:00+08:00','off-peak'],
    ['2026-10-01T10:00:00+08:00','off-peak'],['2026-10-10T10:00:00+08:00','off-peak']])
    assert.equal(deepSeekPriceBand(Date.parse(date)),band,date);
  assert.throws(()=>deepSeekPriceBand(Date.parse('2027-01-01T01:00:00Z')),{code:'AI_POINTS_PRICING_UNAVAILABLE'});
  assert.throws(()=>deepSeekPriceBand(NaN),{code:'AI_POINTS_PRICING_UNAVAILABLE'});
});
test('current aliases share official time prices; explicit administrator rates stay fixed',()=>{
  const peakAt=Date.parse('2026-10-26T03:00:00Z'),offAt=Date.parse('2026-10-26T04:00:00Z');
  for(const model of ['deepseek-flash','deepseek-v4-flash','deepseek-v4-flash-vision-exp']) {
    const peak=resolveRateCard({...settings,model},[],peakAt),off=resolveRateCard({...settings,model},[],offAt);
    assert.equal(peak.inputMicrosPerMillion,2000000);assert.equal(peak.outputMicrosPerMillion,8000000);
    assert.equal(off.inputMicrosPerMillion,1000000);assert.equal(off.outputMicrosPerMillion,4000000);
    assert.equal(off.cachedMicrosPerMillion,20000);assert.equal(off.priceBand,'off-peak');
  }
  const custom={...officialRateCards[0],schedule:undefined,inputMicrosPerMillion:3000000,source:'synthetic administrator confirmation'};
  assert.equal(resolveRateCard(settings,[custom],offAt).inputMicrosPerMillion,3000000);
  assert.throws(()=>resolveRateCard({...settings,model:'unpriced'},[],peakAt),{code:'AI_POINTS_PRICING_UNAVAILABLE'});
});
test('cost references state explicit output allowances and both thirty/31-sign-in scenarios',t=>{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());const store={db,points:createPointsStore(db)};
  const prices=modelPointExamples(officialRateCards[0]),byId=Object.fromEntries(prices.services.map(p=>[p.id,p]));
  assert.equal(byId.explanation.sampleCostMicros,9200);assert.equal(byId.explanation.sampleUnits,3680);
  assert.equal(byId['questions-10'].sampleCostMicros,134048);assert.equal(byId['questions-10'].sampleUnits,53620);
  const forecast=membershipCostForecast(store);
  assert.deepEqual(forecast.plans.map(p=>p.scenarios[0].aiCostCeilingMicros),[2475000,4950000,9975000]);
  assert.deepEqual(forecast.plans.map(p=>p.scenarios[1].aiCostCeilingMicros),[2557500,5115000,10307500]);
  assert.equal(forecast.free.cost30DaysMicros,75000);
  assert.equal(forecast.plans[0].scenarios[1].remainingMarginBps,6917);
  assert.equal(db.prepare('SELECT count(*) n FROM ai_points_finance').get().n,0);
});

test('real HTTP AI billing accepts earned points with no revenue entries and settles frozen per-call rates',async t=>{
  const parent=path.resolve('tmp'),dir=fs.mkdtempSync(path.join(parent,'actual-billing-'));
  const store=createStore(dir),owner=store.register('billing_owner','fixture-password-123'),
    user=store.register('billing_user','fixture-password-123'),peer=store.register('billing_peer','fixture-password-123');
  for(const u of [owner,user,peer])store.selectCertificate(u.id,'network-engineer');
  let clock=Date.parse('2026-10-26T03:59:00Z'),calls=0,mode='ok';
  store.points=createPointsStore(store.db,{now:()=>clock});
  store.points.grant({userId:user.id,sourceKey:'synthetic-earned-points',units:1000000,kind:'daily-gift'});
  const provider=new OpenAICompatibleProvider(store,{fetch:async()=>{
    calls++;
    if(mode==='outage')return new Response('synthetic upstream outage',{status:503});
    if(calls===1)clock=Date.parse('2026-10-26T04:01:00Z');
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({text:'合成测试讲解：按已知条件逐步分析，不引入额外结论。'})},finish_reason:'stop'}],
      usage:{prompt_tokens:100,completion_tokens:50,total_tokens:150}}),{headers:{'Content-Type':'application/json'}});
  }});
  const raw=provider.call.bind(provider);
  provider.call=(messages,config,options)=>raw(messages,{...settings,apiKey:'synthetic-no-network-key',temperature:0,...config},options);
  const app=await createApp({store,provider,withFrontend:false,accountSecurity:{enabled:false}});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(async()=>{await app.locals.stop();server.closeAllConnections();await new Promise(r=>server.close(r));store.db.close();
    assert.equal(path.dirname(dir),parent);assert(path.basename(dir).startsWith('actual-billing-'));fs.rmSync(dir,{recursive:true,force:true});});
  const tokens=new Map([owner,user,peer].map(u=>[u.id,store.createAuthSession(u.id)]));
  const request=async(u,url,body,key)=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/api'+url,{method:body?'POST':'GET',headers:{
    Authorization:'Bearer '+tokens.get(u.id),'Content-Type':'application/json',...(key?{'X-AI-Request-Id':key}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};
  const body={questionId:'practice-1',action:'详细讲解',selected:[]},key=crypto.randomUUID(),before=store.points.wallet(user.id).availableUnits;
  const first=await request(user,'/ai/teacher',body,key);
  assert.equal(first.status,200,JSON.stringify(first.body));assert.equal(calls,1);
  assert.equal(before-store.points.wallet(user.id).availableUnits,240,'Peak-start request remains billed at its frozen peak rate after crossing noon');
  const firstCall=store.db.prepare('SELECT * FROM ai_points_calls').get();
  assert.equal(JSON.parse(firstCall.rate_card).priceBand,'peak');assert.equal(firstCall.cost_micros,600);
  await request(user,'/ai/teacher',body,key);await request(user,'/ai/teacher',body,crypto.randomUUID());
  assert.equal(calls,1);assert.equal(before-store.points.wallet(user.id).availableUnits,240);
  const second=await request(user,'/ai/teacher',{...body,action:'换一种方法解释'},crypto.randomUUID());
  assert.equal(second.status,200,JSON.stringify(second.body));assert.equal(calls,2);
  assert.equal(before-store.points.wallet(user.id).availableUnits,360);
  const off=store.db.prepare("SELECT * FROM ai_points_calls ORDER BY rowid DESC LIMIT 1").get();
  assert.equal(JSON.parse(off.rate_card).priceBand,'off-peak');assert.equal(off.cost_micros,300);
  const denied=await request(peer,'/ai/teacher',{questionId:'practice-2',action:'详细讲解',selected:[]},crypto.randomUUID());
  assert.equal(denied.status,402);assert.equal(calls,2);
  const cash=store.points.finance();assert.equal(cash.revenueMicros,0);assert.equal(cash.aiSpentMicros,900);assert(cash.overBudgetMicros>0);
  const unchanged=store.points.wallet(user.id).availableUnits;mode='outage';
  const failed=await request(user,'/ai/teacher',{...body,action:'举一个实际例子'},crypto.randomUUID());
  assert.equal(failed.status,400,JSON.stringify(failed.body));assert.match(failed.body.error,/AI 服务暂时不可用/);assert(calls>2,'The failure must actually reach the synthetic upstream');const last=store.db.prepare('SELECT state,charged_units FROM ai_points_operations ORDER BY rowid DESC LIMIT 1').get();assert.equal(last.state,'refunded');assert.equal(last.charged_units,0);assert.equal(store.points.wallet(user.id).availableUnits,unchanged);assert.equal(store.points.wallet(user.id).heldUnits,0);
  assert.equal(store.points.audit().passed,true);
});
