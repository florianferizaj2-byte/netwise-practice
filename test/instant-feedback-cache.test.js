import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const load=async file=>import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(fs.readFileSync(new URL('../mobile/src/api/'+file,import.meta.url),'utf8'),{mode:'transform'})).toString('base64'));
const {persistentStudyData,studyCachePolicy}=await load('cachePolicy.ts');const {ResourceCache}=await load('resourceCache.ts');
test('only explicitly opted-in bank practice persists preloaded feedback; normal/exam/private/generated content does not leak',()=>{
 const q={id:'q',type:'single_choice',question:'题',options:{A:'1'},answer:['A'],analysis:'解',expectedAnswer:'参考',ownerUserId:'private'};const page={items:[q],total:1,nextOffset:null};
 const normal=persistentStudyData('/questions?page=1',page);assert.equal(normal.items[0].answer,undefined);
 const opted=persistentStudyData('/questions?page=1&feedback=instant',page);assert.deepEqual(opted.items[0].answer,['A']);assert.equal(opted.items[0].analysis,'解');assert.equal(opted.items[0].ownerUserId,undefined);
 assert.equal(persistentStudyData('/exams/example',page),undefined);assert.equal(persistentStudyData('/questions?feedback=instant&random=1',page),undefined);assert.equal(persistentStudyData('/questions?feedback=instant',{...page,items:[{...q,source:'ai_generated'}]}),undefined);
});
test('a background attempt invalidation leaves opted-in next-page prefetch alive while ordinary invalidation remains cancellable',async()=>{
 const data=new Map();const storage={async getItem(k){return data.get(k)||null},async setItem(k,v){data.set(k,v)},async removeItem(k){data.delete(k)}};const cache=new ResourceCache(storage,studyCachePolicy,persistentStudyData);await cache.setScope('owned-account-cert');let release,signal;
 const pending=cache.read('/questions?page=1&feedback=instant&offset=40',s=>{signal=s;return new Promise(r=>release=r)});await new Promise(r=>setImmediate(r));cache.invalidate(['/questions?'],key=>new URLSearchParams(key.split('?')[1]).get('feedback')!=='instant');assert.equal(signal.aborted,false);release({items:[],total:40,nextOffset:null});await pending;
 let finish;const normal=cache.read('/questions?page=1&offset=40',s=>new Promise(r=>finish=r));await new Promise(r=>setImmediate(r));cache.invalidate(['/questions?']);finish({items:[],total:40,nextOffset:null});await assert.rejects(normal);await cache.flush();await cache.setScope(null);
});
