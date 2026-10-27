import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createStore} from '../server/store.js';
import {createPointsStore} from '../server/ai-points/store.js';
import {createApp} from '../server/index.js';

test('native ledger filters before pagination, excludes legacy usage, and isolates accounts without mutating points',async t=>{
  const parent=fs.realpathSync(os.tmpdir()),dir=fs.mkdtempSync(path.join(parent,'points-filter-'));
  const store=createStore(dir),owner=store.register('filter_owner','fixture-password-123'),user=store.register('filter_user','fixture-password-123'),other=store.register('filter_other','fixture-password-123');
  store.points=createPointsStore(store.db,{now:()=>Date.parse('2026-10-26T03:00:00Z')});
  const settings={baseUrl:'https://api.deepseek.com',model:'deepseek-flash'};
  const make=(who,key,state)=>{const op=store.points.begin({userId:who.id,requestKey:key,signature:key,feature:'test:'+key}).operation;
    const call=store.points.reserveCall(op.id,{settings,inputLimit:1000,outputLimit:1000,taskType:'question-explanation'});
    if(state!=='pending'){store.points.finishCall(call.id,{success:true,usage:{hasUsage:true,prompt_tokens:100,completion_tokens:50,total_tokens:150}});store.points.finish(op.id,{success:state==='settled',error:state==='refunded'?'synthetic validation failed':null});}return op.id;};
  for(const u of [user,other])store.points.grant({userId:u.id,sourceKey:'test:'+u.id,kind:'test',units:1000000});
  const settled=[make(user,'settled-one','settled'),make(user,'settled-two','settled')],refunded=[make(user,'refund-one','refunded'),make(user,'refund-two','refunded')];
  const pending=make(user,'pending-one','pending'),foreign=make(other,'other-user','settled');
  for(let i=0;i<25;i++)store.saveUsage({model:'legacy-test',taskType:'legacy',hasUsage:false},user.id);
  const app=await createApp({store,withFrontend:false,accountSecurity:{enabled:false}}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(async()=>{await app.locals.stop();server.closeAllConnections();await new Promise(r=>server.close(r));store.db.close();assert.equal(path.dirname(fs.realpathSync(dir)),parent);fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
  const token=store.createAuthSession(user.id),before=store.points.wallet(user.id),journal=store.db.prepare('SELECT count(*) n FROM ai_points_journal').get().n;
  const get=async(query)=>{const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/account/points/operations?'+query,{headers:{Authorization:'Bearer '+token}});return {status:response.status,body:await response.json()};};
  const first=await get('state=settled&limit=1');assert.equal(first.status,200);assert.equal(first.body.total,2);assert.equal(first.body.nextOffset,1);assert.equal(first.body.rows.length,1);assert.equal(first.body.rows[0].state,'settled');
  const second=await get('state=settled&limit=1&offset=1');assert.equal(second.body.nextOffset,null);assert.deepEqual(new Set([...first.body.rows,...second.body.rows].map(r=>r.id)),new Set(settled));
  for(const body of [first.body,second.body]){assert.equal(body.legacyTotal,0);assert.deepEqual(body.legacyRows,[]);assert(body.calls.every(c=>body.rows.some(r=>r.id===c.operationId)));assert(!body.rows.some(r=>r.id===foreign));}
  const refunds=await get('state=refunded');assert.deepEqual(new Set(refunds.body.rows.map(r=>r.id)),new Set(refunded));assert(refunds.body.rows.every(r=>r.chargedUnits===0));
  const holds=await get('state=pending');assert.deepEqual(holds.body.rows.map(r=>r.id),[pending]);
  const all=await get('state=all');assert.equal(all.body.total,5);assert.equal(all.body.nextOffset,null);
  const old=await get('limit=20');assert.equal(old.body.legacyTotal,25);assert.equal(old.body.nextOffset,20,'Old administrative consumers retain historical usage paging');
  assert.equal((await get('state=invalid')).status,400);assert.equal((await get('state=all&userId='+other.id)).status,400);
  assert.deepEqual(store.points.wallet(user.id),before);assert.equal(store.db.prepare('SELECT count(*) n FROM ai_points_journal').get().n,journal);assert.equal(store.points.audit().passed,true);
});
