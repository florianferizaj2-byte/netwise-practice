import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import {createStore} from '../server/store.js';
import {createApp} from '../server/index.js';
import {inspectVoiceAudio,VOICE_PACK_CONTRACT} from '../server/voice-packs.js';
const wav=fs.readFileSync(new URL('../mobile/assets/sounds/answer-correct-soft.wav',import.meta.url));
const source=stripTypeScriptTypes(fs.readFileSync(new URL('../mobile/src/api/voicePacks.ts',import.meta.url),'utf8'));
const sdk=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const sha=crypto.createHash('sha256').update(wav).digest('hex');
const id=()=>crypto.randomUUID();
const cues=(asset=sha)=>({'practice.enter':[asset],'answer.correct':[asset],'answer.streak':[{count:2,clips:[asset]},{count:3,clips:[asset]},{count:5,clips:[asset]},{count:10,clips:[asset]}]});

test('voice audio identifies bytes rather than suffix/MIME and rejects malformed containers',()=>{
  assert.deepEqual(inspectVoiceAudio(wav),{ext:'wav',mimeType:'audio/wav',durationMs:240});
  assert.throws(()=>inspectVoiceAudio(Buffer.from('<html>audio.wav</html>')),{code:'VOICE_AUDIO_INVALID'});
  assert.throws(()=>inspectVoiceAudio(wav.subarray(0,50)),{code:'VOICE_AUDIO_INVALID'});
  assert.throws(()=>inspectVoiceAudio(Buffer.alloc(VOICE_PACK_CONTRACT.maxAssetBytes+1)),{code:'VOICE_AUDIO_TOO_LARGE'});
  assert.equal(inspectVoiceAudio(Buffer.concat([Buffer.from('fLaC'),Buffer.alloc(20)])).ext,'flac');
  const ogg=Buffer.concat([Buffer.from('OggS'),Buffer.alloc(32)]);assert.equal(inspectVoiceAudio(ogg).ext,'ogg');
  const m4a=Buffer.alloc(24);m4a.writeUInt32BE(24);m4a.write('ftypM4A ',4);assert.equal(inspectVoiceAudio(m4a).ext,'m4a');
  const mp3=Buffer.alloc(40);mp3.set([255,251,144,0]);assert.equal(inspectVoiceAudio(mp3).ext,'mp3');
  const aac=Buffer.alloc(40);aac.set([255,241,80,128]);assert.equal(inspectVoiceAudio(aac).ext,'aac');
});
test('client protocol counts only fresh answers in one scope and chooses exact streak milestones',()=>{
  const round=sdk.createPracticeVoiceSession();assert.equal(round.answer('old',true),null);
  assert.equal(round.enter('api:alice:cert:round1').event,'practice.enter');assert.equal(round.enter('api:alice:cert:round1'),null);
  const first=round.answer('one',true);assert.equal(first.event,'answer.correct');assert.equal(first.streak,1);assert.equal(round.answer('one',true),null);
  const second=round.answer('two',true);assert.equal(second.event,'answer.streak');assert.equal(second.streak,2);
  assert.equal(round.answer('wrong',false),null);assert.equal(round.answer('three',true).streak,1);
  round.enter('api:bob:cert:round1');assert.equal(round.answer('one',true).streak,1);
  const base={id:'a'.repeat(64),sha256:'a'.repeat(64),url:'/voice-packs/assets/'+'a'.repeat(64)},bonus={id:'b'.repeat(64),sha256:'b'.repeat(64),url:'/voice-packs/assets/'+'b'.repeat(64)};
  const manifest={schemaVersion:1,enabled:true,cues:{'practice.enter':[base.id],'answer.correct':[base.id],'answer.streak':[{count:2,clips:[bonus.id]}]},assets:[base,bonus]};
  assert.equal(sdk.selectVoiceClip(manifest,second).id,bonus.id);
  assert.equal(sdk.selectVoiceClip(manifest,{...second,streak:3}).id,base.id,'three consecutive answers never repeat a voice claiming two');
  assert.equal(sdk.selectVoiceClip(null,first),null);assert.equal(sdk.selectVoiceClip({schemaVersion:1,enabled:true},first),null);
  assert.equal(sdk.voiceAssetUrl('https://example.test/api',base),'https://example.test'+base.url);
  assert.throws(()=>sdk.voiceAssetUrl('https://example.test/api',{...base,url:'https://evil.test/voice.mp3'}));
});

test('voice packs support authenticated uploads, publishing, manifests, default selection and restart without touching user points',async t=>{
  const parent=fs.realpathSync(os.tmpdir()),directory=fs.mkdtempSync(path.join(parent,'voice-packs-test-'));
  let store,app,server,base,adminToken,userToken;
  async function open(){store=createStore(directory);app=await createApp({store,withFrontend:false,authRequired:true});server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;}
  async function close(){await app.locals.stop();server.closeAllConnections();await new Promise(r=>server.close(r));store.db.close();}
  await open();
  t.after(async()=>{await close();assert.equal(path.dirname(fs.realpathSync(directory)),parent);assert.ok(path.basename(directory).startsWith('voice-packs-test-'));fs.rmSync(directory,{recursive:true,force:true});});
  const admin=store.register('voicepack_admin','fixture-password-123'),user=store.register('voicepack_user','fixture-password-123');store.db.prepare('UPDATE users SET is_admin=1 WHERE id=?').run(admin.id);adminToken=store.createAuthSession(admin.id);userToken=store.createAuthSession(user.id);
  const originalPoints=store.points.wallet(user.id).availableUnits;
  async function call(url,{method='GET',token=userToken,body,raw,headers={}}={}){
    const r=await fetch(base+url,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},body:raw??(body?JSON.stringify(body):undefined)});
    const bytes=Buffer.from(await r.arrayBuffer());let data;try{data=JSON.parse(bytes.toString())}catch{data=null}return {status:r.status,data,bytes,headers:r.headers};
  }
  const adminCall=(url,options={})=>call(url,{...options,token:adminToken});
  let current,configuration,uploaded;
  await t.test('empty catalog advertises the protocol honestly and routes reject unauthorized callers',async()=>{
    assert.equal((await call('/api/voice-packs',{token:null})).status,401);
    assert.equal((await call('/api/admin/voice-packs')).status,403);
    assert.equal((await call('/api/admin/voice-packs/assets',{method:'POST',raw:wav,headers:{'Content-Type':'audio/wav'}})).status,403);
    const catalog=await call('/api/voice-packs');assert.equal(catalog.status,200);assert.equal(catalog.data.defaultPackId,null);assert.deepEqual(catalog.data.packs,[]);assert.ok(catalog.data.contract.events.includes('answer.streak'));
    const contract=await call('/api/mobile/version?version=1.0.4',{token:null});assert.ok(contract.data.backend.capabilities.includes('voice-packs-v1'));
  });
  await t.test('audio upload is content-addressed, idempotent and private until referenced by a published pack',async()=>{
    uploaded=await adminCall('/api/admin/voice-packs/assets?name='+encodeURIComponent('答对语音.wav'),{method:'POST',raw:wav,headers:{'Content-Type':'application/octet-stream'}});assert.equal(uploaded.status,200);assert.equal(uploaded.data.asset.id,sha);assert.equal(uploaded.data.asset.durationMs,240);assert.equal(uploaded.data.created,true);
    const retry=await adminCall('/api/admin/voice-packs/assets',{method:'POST',raw:wav,headers:{'Content-Type':'audio/mpeg'}});assert.equal(retry.data.created,false);assert.equal(retry.data.asset.format,'wav');
    assert.equal((await call(uploaded.data.asset.url,{token:null})).status,404);
    const preview=await adminCall('/api/admin/voice-packs/assets/'+sha);assert.equal(preview.status,200);assert.deepEqual(preview.bytes,wav);assert.equal(preview.headers.get('cache-control'),'no-store');
    assert.equal((await call('/api/admin/voice-packs/assets/'+sha)).status,403);
    const bad=await adminCall('/api/admin/voice-packs/assets?name=fake.wav',{method:'POST',raw:Buffer.from('<html>not an audio track</html>'),headers:{'Content-Type':'audio/wav'}});assert.equal(bad.status,415);
    assert.equal((await adminCall('/api/admin/voice-packs/assets',{method:'POST',raw:Buffer.alloc(VOICE_PACK_CONTRACT.maxAssetBytes+1),headers:{'Content-Type':'audio/wav'}})).status,413);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM voice_pack_assets').get().n,1);
    assert.equal(uploaded.data.asset.state,'pending');
    const reviewed=await adminCall('/api/admin/voice-packs/assets',{method:'PATCH',body:{requestId:id(),items:[{id:sha,expectedRevision:0,state:'ready'}]}});assert.equal(reviewed.status,200);assert.equal(reviewed.data.assets[0].state,'ready');
  });
  await t.test('drafts remain invisible; writes have revision checks, replay protection and one audit record',async()=>{
    const body={requestId:id(),expectedRevision:0,name:'测试语音包',enabled:false,cues:cues()};
    const draft=await adminCall('/api/admin/voice-packs/test-pack',{method:'PUT',body});assert.equal(draft.status,200);current=draft.data.pack;configuration=draft.data.configuration;
    assert.equal((await call('/api/voice-packs/test-pack/manifest')).status,404);
    const count=store.db.prepare("SELECT COUNT(*) AS n FROM admin_audit WHERE action='voice_pack_updated'").get().n;
    const retry=await adminCall('/api/admin/voice-packs/test-pack',{method:'PUT',body});assert.equal(retry.data.replayed,true);assert.equal(retry.data.pack.revision,current.revision);assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM admin_audit WHERE action='voice_pack_updated'").get().n,count);
    assert.equal((await adminCall('/api/admin/voice-packs/test-pack',{method:'PUT',body:{...body,name:'篡改同一请求'}})).status,409);
    assert.equal((await adminCall('/api/admin/voice-packs/test-pack',{method:'PUT',body:{...body,requestId:id()}})).status,409);
    assert.equal((await adminCall('/api/admin/voice-packs/default',{method:'PUT',body:{requestId:id(),expectedRevision:configuration.revision,packId:'test-pack'}})).status,409);
  });
  await t.test('publishing validates cue references and streak uniqueness; public assets support byte ranges',async()=>{
    const body={requestId:id(),expectedRevision:current.revision,name:current.name,enabled:true,cues:cues()};
    assert.equal((await adminCall('/api/admin/voice-packs/test-pack',{method:'PUT',body:{...body,cues:cues('e'.repeat(64))}})).status,400);
    const repeated=cues();repeated['answer.streak'].push(repeated['answer.streak'][0]);assert.equal((await adminCall('/api/admin/voice-packs/test-pack',{method:'PUT',body:{...body,cues:repeated}})).status,400);
    assert.equal((await adminCall('/api/admin/voice-packs/test-pack',{method:'PUT',body:{...body,cues:{'practice.enter':[],'answer.correct':[],'answer.streak':[]}}})).status,400);
    const published=await adminCall('/api/admin/voice-packs/test-pack',{method:'PUT',body});assert.equal(published.status,200);current=published.data.pack;configuration=published.data.configuration;
    const manifest=await call('/api/voice-packs/test-pack/manifest');assert.equal(manifest.status,200);assert.equal(manifest.data.assets[0].sha256,sha);assert.equal(manifest.data.assets[0].url,'/voice-packs/assets/'+sha);assert.ok(!JSON.stringify(manifest.data).includes(directory));
    const asset=await call(uploaded.data.asset.url,{token:null});assert.equal(asset.status,200);assert.equal(crypto.createHash('sha256').update(asset.bytes).digest('hex'),sha);assert.match(asset.headers.get('content-type'),/audio\/wav/);assert.equal(asset.headers.get('x-content-type-options'),'nosniff');
    const range=await call(uploaded.data.asset.url,{token:null,headers:{Range:'bytes=0-31'}});assert.equal(range.status,206);assert.deepEqual(range.bytes,wav.subarray(0,32));
    assert.equal((await call('/voice-packs/assets/not-a-valid-id',{token:null})).status,404);
    const selected=await adminCall('/api/admin/voice-packs/default',{method:'PUT',body:{requestId:id(),expectedRevision:configuration.revision,packId:'test-pack'}});assert.equal(selected.status,200);configuration=selected.data.configuration;assert.equal((await call('/api/voice-packs')).data.defaultPackId,'test-pack');
  });
  await t.test('restarting preserves packs and assets; ordinary users cannot publish or change the default',async()=>{
    await close();await open();
    assert.equal((await call('/api/voice-packs')).data.defaultPackId,'test-pack');assert.deepEqual((await call('/voice-packs/assets/'+sha,{token:null})).bytes,wav);
    assert.equal((await call('/api/admin/voice-packs/test-pack',{method:'PUT',body:{requestId:id(),expectedRevision:current.revision,name:'not-admin',enabled:false,cues:cues()}})).status,403);
    assert.equal((await call('/api/admin/voice-packs/default',{method:'PUT',body:{requestId:id(),expectedRevision:configuration.revision,packId:null}})).status,403);
    assert.equal(store.points.wallet(user.id).availableUnits,originalPoints,'voice protocol never consumes AI points');
  });
  await t.test('unpublishing removes the default, hides manifests and denies unpublished asset downloads',async()=>{
    const result=await adminCall('/api/admin/voice-packs/test-pack',{method:'PUT',body:{requestId:id(),expectedRevision:current.revision,name:current.name,enabled:false,cues:cues()}});assert.equal(result.status,200);
    assert.equal((await call('/api/voice-packs')).data.defaultPackId,null);assert.equal((await call('/api/voice-packs/test-pack/manifest')).status,404);assert.equal((await call('/voice-packs/assets/'+sha,{token:null})).status,404);
    assert.equal((await adminCall('/api/admin/voice-packs/assets/'+sha)).status,200,'administrative preview and retained data remain available');
  });
});
