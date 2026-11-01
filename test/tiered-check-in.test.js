import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {createStore} from '../server/store.js';
import {createApp} from '../server/index.js';

test('tiered check-in APIs are authenticated, configurable, durable, atomic and compatible with native clients',async t=>{
  const parent=path.resolve('tmp'),dir=fs.mkdtempSync(path.join(parent,'tiered-checkin-api-'));
  let store=createStore(dir),server,app;
  const owner=store.register('checkin_owner','fixture-password-123');
  const users=[owner,...['free','vip','svip','ssvip'].map(p=>store.register('checkin_'+p,'fixture-password-123'))];
  users.forEach(u=>store.selectCertificate(u.id,'network-engineer'));
  for(let i=2;i<users.length;i++)store.saveAccountEntitlement(users[i].id,{plan:['vip','svip','ssvip'][i-2],expiresAt:new Date(Date.now()+30*86400000).toISOString()});
  const tokens=users.map(u=>store.createAuthSession(u.id));
  async function start(){app=await createApp({store,production:true});server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));return 'http://127.0.0.1:'+server.address().port;}
  let base=await start();
  const req=async(index,url,body,method)=>{
    const response=await fetch(base+'/api'+url,{method:method||(body?'POST':'GET'),headers:{
      'Content-Type':'application/json','X-Client':'mobile','X-App-Platform':'android','X-App-Version':'1.0.1',
      ...(index===null?{}:{Authorization:'Bearer '+tokens[index]})},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,body:await response.json(),changed:response.headers.get('X-AI-Points-Changed')};
  };
  t.after(async()=>{
    await app?.locals.stop();
    if(server?.listening)await new Promise(r=>server.close(r));
    if(store.db.isOpen)store.db.close();
    if(path.dirname(fs.realpathSync(dir))!==parent||!path.basename(dir).startsWith('tiered-checkin-api-'))throw Error('Invalid fixture cleanup target');
    fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  });
  await t.test('authentication, tier spoofing and admin access are enforced',async()=>{
    assert.equal((await req(null,'/account/check-in')).status,401);
    assert.equal((await req(1,'/admin/points/check-in-policy')).status,403);
    assert.equal((await req(1,'/account/check-in',{plan:'ssvip',day:'2099-01-01',points:9999})).status,400);
    assert.equal(store.db.prepare('SELECT count(*) n FROM ai_points_grants').get().n,0);
  });
  await t.test('each native client receives the real server entitlement and exact daily points',async()=>{
    for(const [index,points] of [[1,1],[2,33],[3,66],[4,133]]) {
      const before=await req(index,'/account/check-in');assert.equal(before.status,200);
      assert.equal(before.body.points.availableUnits,0);assert.equal(before.body.checkIn.grants.points,points);
      const claim=await req(index,'/account/check-in',{});
      assert.equal(claim.status,200);assert.equal(claim.body.claimed,true);assert.equal(claim.changed,'1');
      assert.equal(claim.body.points.availableUnits,points*1000);assert.equal(claim.body.checkIn.grants.points,points);
      const repeat=await req(index,'/account/check-in',{});assert.equal(repeat.body.claimed,false);assert.equal(repeat.body.checkIn.claimed,true);
    }
    assert.equal(store.db.prepare('SELECT count(*) n FROM ai_points_finance').get().n,0);
  });
  await t.test('parallel clicks, certificate switching and refresh never create another claim',async()=>{
    const all=await Promise.all(Array.from({length:16},()=>req(0,'/account/check-in',{})));
    assert(all.every(r=>r.status===200));assert.equal(all.filter(r=>r.body.claimed).length,1);
    store.selectCertificate(owner.id,'ncre-ms-office');
    assert.equal((await req(0,'/account/check-in',{})).body.claimed,false);
    assert.equal(store.db.prepare('SELECT count(*) n FROM ai_points_check_ins WHERE user_id=?').get(owner.id).n,1);
  });
  await t.test('admin updates persist, produce one audit entry and reject stale editors',async()=>{
    const policy=(await req(0,'/admin/points/check-in-policy')).body.policy;
    const body={requestId:crypto.randomUUID(),revision:policy.revision,enabled:true,requireFunded:false,
      dailyPoints:{free:2,vip:34,svip:68,ssvip:136},reason:'Synthetic browser/API policy adjustment'};
    const first=await req(0,'/admin/points/check-in-policy',body,'PUT');assert.equal(first.status,200);assert.equal(first.body.policy.revision,1);
    const repeat=await req(0,'/admin/points/check-in-policy',body,'PUT');assert.equal(repeat.body.replayed,true);
    assert.equal((await req(0,'/admin/points/check-in-policy',{...body,requestId:crypto.randomUUID()},'PUT')).status,409);
    assert.equal((await req(1,'/admin/points/check-in-policy',{...body,revision:1,requestId:crypto.randomUUID()},'PUT')).status,403);
    assert.equal(store.db.prepare("SELECT count(*) n FROM admin_audit WHERE action='points_check_in_policy_updated'").get().n,1);
    assert.equal((await req(2,'/account/check-in')).body.checkIn.grants.points,33);
    assert.equal((await req(2,'/account/check-in')).body.checkIn.configuredPoints,34);
    await app.locals.stop();await new Promise(r=>server.close(r));if(store.db.isOpen)store.db.close();store=createStore(dir);base=await start();
    assert.equal((await req(0,'/admin/points/check-in-policy')).body.policy.dailyPoints.ssvip,136);
    assert.equal((await req(2,'/account/check-in',{})).body.claimed,false);
    assert.equal(store.db.prepare('SELECT count(*) n FROM ai_points_check_ins').get().n,5);
  });
});
