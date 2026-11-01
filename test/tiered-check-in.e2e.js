import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {expect} from '@playwright/test';
import {createStore} from '../server/store.js';
import {createApp} from '../server/index.js';
import {launchTestBrowser} from './helpers/browser.js';
const parent=fs.realpathSync(os.tmpdir()),dir=fs.mkdtempSync(path.join(parent,'check-in-ui-'));
const store=createStore(dir),owner=store.register('checkin_ui_owner','fixture-password-123'),
  learner=store.register('checkin_ui_vip','fixture-password-123'),
  legacy=store.register('checkin_ui_legacy','fixture-password-123');
for(const user of [owner,learner,legacy])store.selectCertificate(user.id,'network-engineer');
for(const user of [learner,legacy])store.saveAccountEntitlement(user.id,{plan:'vip',expiresAt:new Date(Date.now()+30*86400000).toISOString()});
store.points.grant({userId:legacy.id,sourceKey:'membership:vip:synthetic-pre-upgrade-period',kind:'membership',units:990000,expiresAt:new Date(Date.now()+29*86400000).toISOString()});
const tokens=new Map([owner,learner,legacy].map(u=>[u.id,store.createAuthSession(u.id)]));
const app=await createApp({store,production:true,provider:{async call(){throw Error('External AI disabled in check-in test');}}});
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base='http://127.0.0.1:'+server.address().port,version=JSON.parse(fs.readFileSync('mobile/package.json','utf8')).version;
let browser;const report={passed:false,checks:[],errors:[]};
fs.mkdirSync('test-output',{recursive:true});
async function pageFor(user,route) {
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addCookies([{name:'netwise_session',value:tokens.get(user.id),url:base,httpOnly:true,sameSite:'Lax'}]);
  await context.addInitScript(v=>localStorage.setItem('netwise-announcement-v'+v,'seen'),version);
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(base+route,{waitUntil:'domcontentloaded'});return {page,context};
}
try {
  browser=await launchTestBrowser();
  const admin=await pageFor(owner,'/#admin/usage'),form=admin.page.getByRole('form',{name:'每日签到积分配置'});
  for(const [label,value] of [['免费',1],['VIP',33],['SVIP',66],['SSVIP',133]])
    await expect(form.getByLabel(label+'每日签到积分',{exact:true})).toHaveValue(String(value));
  await form.getByLabel('VIP每日签到积分',{exact:true}).fill('34');
  await form.getByLabel('SVIP每日签到积分',{exact:true}).fill('68');
  await form.getByLabel('SSVIP每日签到积分',{exact:true}).fill('136');
  let dropped=false;const requests=[];
  await admin.page.route('**/api/admin/points/check-in-policy',async route=>{
    if(route.request().method()!=='PUT')return route.continue();
    requests.push(route.request().postDataJSON());
    if(dropped)return route.continue();dropped=true;
    const response=await route.fetch();assert.equal(response.status(),200);
    await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic saved-policy acknowledgement lost'})});
  });
  await form.getByRole('button',{name:'保存签到配置',exact:true}).click();
  await expect(admin.page.getByRole('alert').filter({hasText:'acknowledgement lost'})).toBeVisible();
  await form.getByRole('button',{name:'保存签到配置',exact:true}).click();
  await expect(admin.page.getByText('签到配置已保存。已签到账号保留原领取记录，不会补发或重复发放。',{exact:true})).toBeVisible();
  assert.equal(requests[0].requestId,requests[1].requestId);
  assert.equal(store.db.prepare('SELECT count(*) n FROM ai_points_check_in_policy_changes').get().n,1);
  report.checks.push('Admin config edits all tiers and a lost committed reply retries the same update exactly once');
  const member=await pageFor(learner,'/#vip');
  const check=member.page.locator('.vip-checkin');
  await expect(check.locator('.vip-rewards')).toContainText('34');
  await check.getByRole('button',{name:'签到领取积分',exact:true}).click();
  await expect(check.getByRole('button',{name:'今日已签到',exact:true})).toBeDisabled();
  assert.equal(store.points.wallet(learner.id).availableUnits,34000);
  assert.equal(store.db.prepare("SELECT count(*) n FROM ai_points_grants WHERE user_id=? AND kind='membership'").get(learner.id).n,0);
  await member.page.reload({waitUntil:'domcontentloaded'});
  await expect(check.getByRole('button',{name:'今日已签到',exact:true})).toBeDisabled();
  assert.equal(store.db.prepare('SELECT count(*) n FROM ai_points_check_ins WHERE user_id=?').get(learner.id).n,1);
  report.checks.push('VIP Web uses configured daily points, reflects the real wallet and remains claimed after reload without monthly auto-grants');
  const old=await pageFor(legacy,'/#vip');
  await expect(old.page.locator('.vip-checkin').getByRole('button',{name:'暂不可领取',exact:true})).toBeDisabled();
  await expect(old.page.locator('.vip-checkin')).toContainText('本期会员积分已整笔发放');
  assert.equal(store.points.wallet(legacy.id).availableUnits,990000);
  report.checks.push('Prepaid legacy member sees an honest disabled state and keeps every old point');
  await admin.page.screenshot({path:'test-output/check-in-admin.png',fullPage:true});
  await member.page.screenshot({path:'test-output/check-in-vip.png',fullPage:true});
  assert.deepEqual(report.errors,[]);report.passed=true;
} catch(e) {report.failure=e.stack;report.wallet=store.points.wallet(learner.id);report.claims=store.db.prepare('SELECT count(*) n FROM ai_points_check_ins WHERE user_id=?').get(learner.id).n;process.exitCode=1;}
finally {
  await browser?.close();await app.locals.stop();await new Promise(r=>server.close(r));if(store.db.isOpen)store.db.close();
  if(path.dirname(fs.realpathSync(dir))!==parent||!path.basename(dir).startsWith('check-in-ui-'))throw Error('Unsafe fixture cleanup');
  fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  fs.writeFileSync('test-output/tiered-check-in-browser-report.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
}
