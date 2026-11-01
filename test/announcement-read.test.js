import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from '../mobile/node_modules/typescript/lib/typescript.js';
const source=fs.readFileSync(new URL('../mobile/src/announcements/client.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {AnnouncementClient,DEFAULT_ANNOUNCEMENT,ANNOUNCEMENT_READ_KEY}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const notice=(extra={})=>({...DEFAULT_ANNOUNCEMENT,title:'学习通知',body:'请查看本周学习安排',...extra});
const memory=()=>{const map=new Map();return{map,getItem:async k=>map.get(k)??null,setItem:async(k,v)=>map.set(k,v)}};

test('dismissed announcement stays read across process restart and offline launches',async()=>{
 const store=memory(),a=notice();const first=new AnnouncementClient(store,async()=>a);await first.refresh(true);
 assert.equal(first.needsDisplay(),true);await first.markRead(a);assert.equal(first.needsDisplay(),false);assert.ok(store.map.has(ANNOUNCEMENT_READ_KEY));
 const reopened=new AnnouncementClient(store,async()=>{throw Error('offline')});await reopened.refresh(true);assert.equal(reopened.needsDisplay(),false);assert.deepEqual(reopened.snapshot(),a);
});
test('actual title or body changes reappear, even under unchanged id and timestamp',async()=>{
 const store=memory();let remote=notice();const client=new AnnouncementClient(store,async()=>remote);await client.refresh(true);await client.markRead();
 for(const update of [{body:'改后的正文'},{title:'改后的标题'}]){remote={...remote,...update};await client.refresh(true);assert.equal(client.needsDisplay(),true);await client.markRead();assert.equal(client.needsDisplay(),false)}
});
test('id/date-only resave and hide/show with identical text do not nag again',async()=>{
 const store=memory();let remote=notice();const client=new AnnouncementClient(store,async()=>remote);await client.refresh(true);await client.markRead();
 for(const update of [{id:'new-server-id',updatedAt:'2026-10-28T01:00:00Z'},{enabled:false},{enabled:true}]){remote={...remote,...update};await client.refresh(true);assert.equal(client.needsDisplay(),false)}
});
test('closing an older visible notice never marks a newer network notice read',async()=>{
 const store=memory(),old=notice();let remote=old;const client=new AnnouncementClient(store,async()=>remote);await client.refresh(true);remote=notice({body:'network update arrived after modal opened'});await client.refresh(true);await client.markRead(old);assert.equal(client.needsDisplay(),true);assert.equal(client.needsDisplay(old),false);
});
test('corrupt/unavailable read storage does not trap launch; memory receipt survives within session',async()=>{
 const store={getItem:async()=>'{broken',setItem:async()=>{throw Error('full')}};const client=new AnnouncementClient(store,async()=>notice());await client.refresh(true);assert.equal(client.needsDisplay(),true);await client.markRead();assert.equal(client.needsDisplay(),false);assert.equal(client.needsDisplay(notice({enabled:false})),false);
});
test('late storage hydration cannot overwrite a newly acknowledged receipt',async()=>{
 let finish;const store={getItem:k=>k===ANNOUNCEMENT_READ_KEY?new Promise(r=>finish=r):Promise.resolve(null),setItem:async()=>{}};const client=new AnnouncementClient(store,async()=>notice());const hydration=client.hydrate();await client.markRead();finish(null);await hydration;assert.equal(client.needsDisplay(),false);
});
