import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
const url=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const load=async file=>import(url(stripTypeScriptTypes(fs.readFileSync(file,'utf8'),{mode:'transform'})));
const storeModule=await load('mobile/src/api/practiceCheckpointStore.ts');
const cache=await load('mobile/src/api/cachePolicy.ts');
const q=i=>({id:'q-'+i,type:'single_choice',question:'Question '+i,options:{A:'right',B:'wrong'},answer:['A'],analysis:'explanation',chapter:'A',attempted:false});
async function fixture(t,{bank=Array.from({length:100},(_,i)=>q(i)),modern=false}={}){
  const data=new Map(),storage={async getItem(k){return data.get(k)||null},async setItem(k,v){data.set(k,v)},async removeItem(k){data.delete(k)}};
  const checkpoint=storeModule.createPracticeCheckpointStore(storage),calls=[];let revision=1;
  const modules={
    './client':{API_BASE_URL:'http://fixture/api',mobileSessionSnapshot:()=>({token:'user',revision}),mobileApi:{
      async questionPage(offset,filters,seed){calls.push({offset,filters,seed});let rows=bank.filter(x=>(!filters.chapter||x.chapter===filters.chapter)&&(!filters.knowledgePoint||x.knowledgePoint===filters.knowledgePoint));if(modern&&filters.review==='answered')rows=rows.filter(x=>x.answered);if(modern&&filters.excludeCorrect)rows=rows.filter(x=>!x.mastered);const items=rows.slice(offset,offset+40);return{items,total:rows.length,offset,nextOffset:offset+40<rows.length?offset+40:null,...(modern?{practiceStateVersion:1}:{})}},
      async practiceQuestion(id){const row=bank.find(q=>q.id===id);if(!row)throw Object.assign(Error('missing'),{status:404});return row},
    }},
    './resourceCache':{CacheCancelledError:class extends Error{}},'./cachePolicy':cache,
    './practiceCheckpoint.android':{practiceCheckpoint:checkpoint},'./practiceCheckpointStore':storeModule,
  };
  const key='owned_'+crypto.randomUUID();globalThis[key]=modules;t.after(()=>delete globalThis[key]);
  const source=stripTypeScriptTypes(fs.readFileSync('mobile/src/api/ownedPractice.android.ts','utf8'),{mode:'transform'}).replace(/from ['"]([^'"]+)['"]/g,(_,name)=>{
    assert.ok(modules[name],name);return'from '+JSON.stringify(url(Object.keys(modules[name]).map(exp=>`export const ${exp}=globalThis[${JSON.stringify(key)}][${JSON.stringify(name)}][${JSON.stringify(exp)}];`).join('\n')));
  });
  return{api:await import(url(source)),checkpoint,storage,data,calls,bank,changeSession(){revision++}};
}
const owner=JSON.stringify(['http://fixture/api','user','network']);
const standard={session:'standard',mode:'sequential',chapter:'A'};
const daily={session:'daily',mode:'random'};
const state=(questions,index=0)=>({questions,index,base:0,total:questions.length,nextOffset:null,seed:'stable-seed',before:'2026-10-28T00:00:00.000Z',selected:['B'],draft:'',submitted:false,completed:false});
test('Today resumes the exact unanswered question and ordered group after a real storage restart without an explicit resume link',async t=>{
  const f=await fixture(t);await f.api.saveOwnedPractice(owner,daily,state(f.bank.slice(0,30),7));
  const restarted=storeModule.createPracticeCheckpointStore(f.storage),row=await restarted.read(owner,'daily');assert.equal(row.questionId,'q-7');
  const a=await f.api.loadOwnedPractice(owner,daily),b=await f.api.loadOwnedPractice(owner,daily);
  assert.equal(a.items[a.index].id,'q-7');assert.equal(b.items[b.index].id,'q-7');assert.deepEqual(a.items.map(q=>q.id),row.snapshot.map(q=>q.id));assert.equal(a.seed,'stable-seed');assert.equal(f.calls.length,0);
  assert.deepEqual(a.saved.selected,['B']);
});
test('daily, sequential chapters and review keep independent cursors and never overwrite a new-question session',async t=>{
  const f=await fixture(t),B={...standard,chapter:'B'},review={...standard,session:'review'};
  await f.api.saveOwnedPractice(owner,standard,state(f.bank,3));await f.api.saveOwnedPractice(owner,B,state(f.bank.map(q=>({...q,chapter:'B'})),9));
  await f.api.saveOwnedPractice(owner,daily,state(f.bank.slice(0,30),4));await f.api.saveOwnedPractice(owner,review,state(f.bank,12));
  assert.equal((await f.api.loadOwnedPractice(owner,standard)).items[3].id,'q-3');
  assert.equal((await f.api.loadOwnedPractice(owner,B)).items[9].id,'q-9');
  assert.equal((await f.api.loadOwnedPractice(owner,daily)).items[4].id,'q-4');
  assert.equal((await f.checkpoint.read(owner)).chapter,'B');
  assert.equal(await f.checkpoint.read(JSON.stringify(['http://fixture/api','other','network'])),null);
  assert.equal(await f.checkpoint.read(JSON.stringify(['http://fixture/api','user','other-cert'])),null);
});
test('all ordinary entries skip a correct cursor, while explicit answered review still includes it',async t=>{
  const bank=Array.from({length:4},(_,i)=>({...q(i),answered:i<2,attempted:i<2,mastered:i===0}));
  const f=await fixture(t,{bank,modern:true});await f.api.saveOwnedPractice(owner,standard,state(bank));
  await f.checkpoint.record(owner,{questionId:'q-0',correct:true,confirmed:false,attemptId:'pending'});
  const resumed=await f.api.loadOwnedPractice(owner,standard);assert.equal(resumed.items[resumed.index].id,'q-1');
  const review=await f.api.loadOwnedPractice(owner,{...standard,session:'review'});assert.deepEqual(review.items.map(q=>q.id),['q-0','q-1']);
  assert.equal((await f.checkpoint.read(owner,storeModule.practiceScope(standard))).questionId,'q-0','opening review must not replace the ordinary cursor');
});
test('old servers cannot reset a session: empty filtered pages drain until the first unmastered question',async t=>{
  const f=await fixture(t);for(let i=0;i<80;i++)await f.checkpoint.record(owner,{questionId:'q-'+i,correct:true,confirmed:true});
  const page=await f.api.loadOwnedPractice(owner,standard);assert.equal(page.items[0].id,'q-80');assert.deepEqual(f.calls.map(c=>c.offset),[0,40,80]);assert.equal(page.nextOffset,null);
});
test('server-owned mastery skips historical correct answers after a fresh local install; unsubmitted exam rows are not review answers',async t=>{
  const bank=[{...q(0),mastered:true,answered:true,attempted:true},{...q(1),answered:false,attempted:true},q(2)];
  const f=await fixture(t,{bank,modern:true}),page=await f.api.loadOwnedPractice(owner,standard);
  assert.deepEqual(page.items.map(q=>q.id),['q-1','q-2']);
  const review=await f.api.loadOwnedPractice(owner,{...standard,session:'review'});assert.deepEqual(review.items.map(q=>q.id),['q-0']);
});
test('a corrected authoritative grade releases a provisional correct flag but never forgets an older confirmed correct answer',async t=>{
  const f=await fixture(t);await f.checkpoint.record(owner,{questionId:'q-0',correct:true,confirmed:false,attemptId:'attempt'});
  await f.checkpoint.record(owner,{questionId:'q-0',correct:false,confirmed:true,attemptId:'attempt'});
  assert.equal(storeModule.masteredQuestion((await f.checkpoint.history(owner))['q-0']),false);
  await f.checkpoint.record(owner,{questionId:'q-0',correct:true,confirmed:true});await f.checkpoint.record(owner,{questionId:'q-0',correct:false,confirmed:true});
  assert.equal(storeModule.masteredQuestion((await f.checkpoint.history(owner))['q-0']),true);
});
test('daily wrapper forwards the authenticated owner and flushes the child on close; all question sources share the canonical backend flags',()=>{
  const panel=fs.readFileSync('mobile/src/screens/DailyPracticePanel.android.tsx','utf8');assert.match(panel,/user=\{user\}/);assert.match(panel,/visible && <PracticeScreen/);
  const shell=fs.readFileSync('mobile/src/navigation/AppShell.android.tsx','utf8');assert.match(shell,/user=\{session\?\.user\} certificates=\{session\?\.certificates\}/);
  const home=fs.readFileSync('mobile/src/screens/StudyOverviewScreens.android.tsx','utf8'),hub=fs.readFileSync('mobile/src/screens/PracticeHubScreen.android.tsx','utf8');
  assert.match(home,/hasDailyResume\?'继续今日学习'/);assert.doesNotMatch(home,/today\?'继续今日学习'/);assert.match(hub,/lastPractice\?\.chapter/);
  const screen=fs.readFileSync('mobile/src/screens/TabScreens.android.tsx','utf8');assert.match(screen,/loadOwnedPractice\(owner,selection,practiceQuestionId\)/);assert.doesNotMatch(screen,/owner && practiceQuestionId && practiceSource/);
});

test('a parent chapter without a separate cursor can continue its last active point without changing the saved point scope',async t=>{
 const f=await fixture(t),point={...standard,point:'Subpoint'};const rows=f.bank.map(q=>({...q,knowledgePoint:'Subpoint'}));
 await f.api.saveOwnedPractice(owner,point,state(rows,17));
 const loaded=await f.api.loadOwnedPractice(owner,standard);assert.equal(loaded.items[loaded.index].id,'q-17');assert.equal(loaded.selection.point,'Subpoint');
 assert.equal(await f.checkpoint.read(owner,storeModule.practiceScope(standard)),null);
});

test('legacy v1.0.9 cursor migration preserves its real position and skips a formerly submitted correct item',async t=>{
 const f=await fixture(t),q=f.bank[2];
 const row={version:1,questionId:q.id,fingerprint:storeModule.practiceFingerprint(q),index:2,mode:'sequential',chapter:'A',seed:'old-seed',before:'2026-10-28T00:00:00.000Z',selected:['A'],draft:'',submitted:true,updatedAt:'2026-10-28T00:00:00.000Z'};
 await f.storage.setItem('kaojiang-practice-checkpoint-v1:'+encodeURIComponent(owner),JSON.stringify(row));
 const loaded=await f.api.loadOwnedPractice(owner,standard);assert.equal(loaded.items[loaded.index].id,'q-3');
 assert.equal(storeModule.masteredQuestion((await f.checkpoint.history(owner))['q-2']),true);
});

test('short selected daily ranges fill from the rest of the bank once, then retain a unique fixed thirty-question queue',async t=>{
 const bank=Array.from({length:60},(_,i)=>({...q(i),chapter:i<6?'Short':'Other'})),f=await fixture(t,{bank,modern:true});
 const loaded=await f.api.loadOwnedPractice(owner,{...daily,chapter:'Short'});assert.equal(loaded.items.length,30);assert.equal(new Set(loaded.items.map(q=>q.id)).size,30);assert.equal(loaded.total,30);assert.equal(loaded.nextOffset,null);
});
test('an exhausted correct cursor opens only remaining unmastered items, not the same mastered last question forever',async t=>{
 const bank=[q(0),q(1)],f=await fixture(t,{bank});await f.api.saveOwnedPractice(owner,standard,state(bank,1));await f.checkpoint.record(owner,{questionId:'q-1',correct:true,confirmed:true});
 const loaded=await f.api.loadOwnedPractice(owner,standard);assert.deepEqual(loaded.items.map(q=>q.id),['q-0']);
});
test('a broken question cache cannot destroy the valid saved cursor',async t=>{
 const f=await fixture(t);await f.api.saveOwnedPractice(owner,standard,state(f.bank,17));const key=[...f.data.keys()][0],book=JSON.parse(f.data.get(key));book.sessions[storeModule.practiceScope(standard)].snapshot=[{id:'bad',question:5}];f.data.set(key,JSON.stringify(book));
 assert.equal((await f.checkpoint.read(owner)).questionId,'q-17');const loaded=await f.api.loadOwnedPractice(owner,standard);assert.equal(loaded.items[loaded.index].id,'q-17');
});
