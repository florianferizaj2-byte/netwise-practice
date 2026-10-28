import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { questionPage } from '../server/question-paging.js';
import { createStore } from '../server/store.js';
import { createApp } from '../server/index.js';
import { completeFixtureProfile } from './helpers/mobile-profile.js';

const source = stripTypeScriptTypes(fs.readFileSync('mobile/src/api/practiceCheckpointStore.ts', 'utf8'), {mode:'transform'});
const { createPracticeCheckpointStore } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const row = { version:1, questionId:'q-2', fingerprint:'unchanged', index:43, mode:'random', chapter:'Chapter', seed:'stable', before:'2026-10-28T00:00:00.000Z', selected:['B'], draft:'', submitted:true, updatedAt:'2026-10-28T01:00:00.000Z' };
test('native checkpoint restores the real cursor and isolates API/account/certificate without storing answers', async()=>{
  const data=new Map(), storage={async getItem(k){return data.get(k)||null},async setItem(k,v){data.set(k,v)},async removeItem(k){data.delete(k)}};
  const checkpoints=createPracticeCheckpointStore(storage), owner=JSON.stringify(['api','one','cert']);
  await checkpoints.save(owner,row);
  assert.deepEqual(await createPracticeCheckpointStore(storage).read(owner),row);
  for(const other of [['api','two','cert'],['api','one','other'],['other','one','cert']])assert.equal(await checkpoints.read(JSON.stringify(other)),null);
  assert.ok(![...data.values()][0].includes('analysis'));
  await Promise.all([checkpoints.save(owner,{...row,index:44}),checkpoints.save(owner,{...row,index:45})]);
  assert.equal((await checkpoints.read(owner)).index,45);
  await checkpoints.save(owner,null);assert.equal(await checkpoints.read(owner),null);
});
test('corrupt checkpoint does not crash or navigate and disk errors remain observable',async()=>{
  const checkpoints=createPracticeCheckpointStore({async getItem(){return '{invalid'},async setItem(){throw Error('disk full')},async removeItem(){}});
  assert.equal(await checkpoints.read('owner'),null);
  await assert.rejects(checkpoints.save('owner',row),/损坏/);
  const full=createPracticeCheckpointStore({async getItem(){return null},async setItem(){throw Error('disk full')},async removeItem(){}});
  await assert.rejects(full.save('owner',row),/disk full/);
});
test('anchored pages restore the requested question after a bank reorder without an all-bank download',()=>{
  const items=Array.from({length:100},(_,i)=>({id:'q-'+i}));
  const page=questionPage(items,{offset:0,limit:40,anchor:'q-87'});
  assert.equal(page.offset,80);assert.ok(page.items.some(q=>q.id==='q-87'));assert.equal(page.nextOffset,null);
});
test('random practice excludes correct history, preserves a stable round across pages and keeps accounts separate',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ace-continuity-')),store=createStore(directory);
  const user=store.register('continuity_owner','fixture-password-123');
  completeFixtureProfile(store,user);store.selectCertificate(user.id,'network-engineer');
  const other=store.register('continuity_other','fixture-password-123');
  completeFixtureProfile(store,other);store.selectCertificate(other.id,'network-engineer');
  const token=store.createAuthSession(user.id),otherToken=store.createAuthSession(other.id);
  const app=await createApp({store,withFrontend:false,authRequired:true,accountSecurity:{enabled:false}}),server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await app.locals.stop();await new Promise(resolve=>server.close(resolve));store.db.close();assert.equal(path.dirname(directory),path.resolve(os.tmpdir()));assert.ok(path.basename(directory).startsWith('ace-continuity-'));fs.rmSync(directory,{recursive:true,force:true})});
  const url=`http://127.0.0.1:${server.address().port}/api/questions?page=1&bankOnly=1&random=1&seed=continuity&limit=40&excludeCorrect=1`;
  const get=async(extra='',session=token)=>{const response=await fetch(url+extra,{headers:{Authorization:'Bearer '+session,'X-Client':'mobile','X-App-Version':'99.0.0'}});assert.equal(response.status,200);return response.json()};
  const first=await get(),q=store.getQ(first.items[0].id),before=new Date(Date.now()-100).toISOString();
  store.recordAttempt(q.id,q.answer,1000,'practice',user.id);
  assert.ok(!(await get()).items.some(item=>item.id===q.id),'fresh random round removes a correctly answered question');
  assert.ok((await get('&before='+encodeURIComponent(before))).items.some(item=>item.id===q.id),'active random round uses a frozen history boundary');
  assert.ok((await get('',otherToken)).items.some(item=>item.id===q.id),'another account has an independent mastered set');
  const second=await get('&offset=40&before='+encodeURIComponent(before));
  assert.equal(new Set([...first.items,...second.items].map(item=>item.id)).size,first.items.length+second.items.length,'stable pages have neither duplicate nor skipped offsets');
  const chapter='Scoped history fixture';
  const items=Array.from({length:4},(_,i)=>({...q,id:'history-fixture-'+i,question:'Synthetic history '+i,chapter,options:{A:'right',B:'wrong'},answer:['A'],analysis:'Synthetic explanation',certificates:['network-engineer']}));
  items.forEach(row=>store.addQ(row));
  store.recordAttempt(items[0].id,['A'],100,'practice',user.id);
  store.recordAttempt(items[1].id,['B'],100,'practice',user.id);
  store.recordAttempt(items[2].id,['A'],100,'practice',other.id);
  store.recordAttempt(items[3].id,[],100,'exam',user.id);
  const scoped=async(query,session=token)=>{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/questions?page=1&bankOnly=1&feedback=instant&chapter=${encodeURIComponent(chapter)}&${query}`,{headers:{Authorization:'Bearer '+session,'X-Client':'mobile','X-App-Version':'99.0.0'}});
    assert.equal(response.status,200);return response.json();
  };
  const sequential=await scoped('excludeCorrect=1');assert.equal(sequential.practiceStateVersion,1);assert.deepEqual(sequential.items.map(q=>q.id),items.slice(1).map(q=>q.id));
  const review=await scoped('review=answered');assert.deepEqual(review.items.map(q=>q.id),items.slice(0,2).map(q=>q.id));assert.equal(review.items[0].mastered,true);assert.equal(review.items[1].mastered,false);
  assert.deepEqual((await scoped('review=answered',otherToken)).items.map(q=>q.id),[items[2].id]);

});
