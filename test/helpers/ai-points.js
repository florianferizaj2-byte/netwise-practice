// Explicit synthetic funding and provider metering for legacy tests whose
// subject is question quality, authentication or transport, rather than price.
// Billing invariant tests instantiate the production provider directly.
import {after} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {OpenAICompatibleProvider} from '../../server/ai.js';
import {createPointsStore} from '../../server/ai-points/store.js';
import {authorAiSettings} from '../../server/ai-service.js';
import {currentPointsTask} from '../../server/ai-points/runtime.js';
import {cnyMicros} from '../../server/ai-points/money.js';
const databases=new Set(),storeDatabases=new WeakMap(),prepared=Symbol('prepared-fixture-points'),metered=Symbol('metered-fixture-fetch');
after(()=>{for(const db of databases)if(db.isOpen)db.close();});
const syntheticUsage={prompt_tokens:2,completion_tokens:3,total_tokens:5};
export function fundAiFixture(store,userId='local') {
  if(!store.points){const db=new DatabaseSync(':memory:');databases.add(db);storeDatabases.set(store,db);store.points=createPointsStore(db);}
  store.points.recordFinance({key:'fixture-income:'+userId,kind:'revenue',amountMicros:1000000000,userId,reference:'synthetic-fixture-income:'+userId,createdBy:'synthetic-fixture'});
  store.points.grant({userId,sourceKey:'synthetic-fixture-funding',units:10000000,kind:'test-only',requireFunded:true});
}
function prepare(store){
  fundAiFixture(store);
  for(const user of store.allUsers?.()||[])fundAiFixture(store,user.id);
  if(store[prepared])return;store[prepared]=true;
  for(const method of ['register','registerAsync'])if(typeof store[method]==='function'){
    const original=store[method].bind(store);
    store[method]=method.endsWith('Async')?async(...args)=>{const user=await original(...args);fundAiFixture(store,user.id);return user;}
      :(...args)=>{const user=original(...args);fundAiFixture(store,user.id);return user;};
  }
}
function meteredFetch(original){
  if(original[metered])return original;
  const fetch=async(url,options)=>{
    if(original===globalThis.fetch&&!['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname))
      throw new TypeError('External upstream access is disabled in test fixtures');
    const response=await original(url,options);
    if(!response.ok)return response;
    const text=await response.text(),headers=new Headers(response.headers);
    headers.delete('content-length');
    if((headers.get('content-type')||'').includes('text/event-stream')){
      const value=/"usage"\s*:\s*\{/.test(text)?text:text.replace(/data:\s*\[DONE\]/,
        'data: '+JSON.stringify({choices:[],usage:syntheticUsage})+'\n\ndata: [DONE]');
      return new Response(value,{status:response.status,headers});
    }
    try{
      const body=JSON.parse(text);if(body&&typeof body==='object'&&!body.usage)body.usage=syntheticUsage;
      return new Response(JSON.stringify(body),{status:response.status,headers});
    }catch{return new Response(text,{status:response.status,headers});}
  };
  fetch[metered]=true;return fetch;
}
export class FundedTestAIProvider extends OpenAICompatibleProvider {
  constructor(store,options={}){prepare(store);super(store,options);}
  async call(messages,settings,options={}){
    const userId=options.userId||'local';fundAiFixture(this.store,userId);
    const billedUserId=currentPointsTask(this.store,userId)?.userId||userId;
    const configured=settings||authorAiSettings(this.store);
    const explicit=configured?.model===process.env.AI_USAGE_PRICING_MODEL;
    const card=configured?.baseUrl&&configured?.model?{provider:configured.baseUrl,model:configured.model,
      inputMicrosPerMillion:explicit?cnyMicros(process.env.AI_USAGE_INPUT_CNY_PER_MILLION):2000000,
      outputMicrosPerMillion:explicit?cnyMicros(process.env.AI_USAGE_OUTPUT_CNY_PER_MILLION):8000000,
      cachedMicrosPerMillion:explicit?cnyMicros(process.env.AI_USAGE_CACHED_INPUT_CNY_PER_MILLION):40000,
      source:'synthetic-test-only-price',verifiedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()}:null;
    if(card)this.store.points.saveRateCard(card,'synthetic-fixture');
    this.fetch=meteredFetch(this.fetch);
    try{return await super.call(messages,settings,options);}
    finally{
      // Mock outages do not incur a real provider bill. This keeps independent
      // transport cases independent; production unknown-cost tests use the
      // production provider and assert the pause/reconciliation workflow.
      if(card){
        const db=this.store.db||storeDatabases.get(this.store);
        if(db)for(const row of db.prepare("SELECT id FROM ai_points_calls WHERE user_id=? AND state='finished' AND needs_review=1").all(billedUserId))
          this.store.points.reconcileCall(row.id,{costMicros:0,requestKey:'fixture-unbilled:'+row.id,reference:'synthetic fixture has no upstream invoice',actor:'synthetic-fixture'});
        this.store.points.saveRateCard(card,'synthetic-fixture');
      }
    }
  }
}
