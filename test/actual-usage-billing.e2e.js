import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {expect} from '@playwright/test';
import {createStore} from '../server/store.js';
import {createApp} from '../server/index.js';
import {launchTestBrowser} from './helpers/browser.js';
const parent=fs.realpathSync(os.tmpdir()),dir=fs.mkdtempSync(path.join(parent,'actual-billing-ui-'));
const store=createStore(dir),owner=store.register('billing_ui_owner','fixture-password-123'),learner=store.register('billing_ui_learner','fixture-password-123');
for(const u of [owner,learner])store.selectCertificate(u.id,'network-engineer');
store.points.grant({userId:learner.id,sourceKey:'synthetic-unfunded-gift',units:1000000,kind:'test'});
let upstreamCalls=0;
const app=await createApp({store,production:true,provider:{async call(){upstreamCalls++;throw Error('External AI disabled');}}});
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base='http://127.0.0.1:'+server.address().port,version=JSON.parse(fs.readFileSync('mobile/package.json','utf8')).version;
const out='tmp/actual-usage-billing-20261026';let browser,admin;const report={passed:false,checks:[],errors:[]};
async function pageFor(user,route) {
 const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
 await context.addCookies([{name:'netwise_session',value:store.createAuthSession(user.id),url:base,httpOnly:true,sameSite:'Lax'}]);
 await context.addInitScript(v=>localStorage.setItem('netwise-announcement-v'+v,'seen'),version);
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(base+route,{waitUntil:'domcontentloaded'});return page;
}
try {
 browser=await launchTestBrowser();const member=await pageFor(learner,'/#vip');
 const prices=member.locator('.ai-points-pricing');await expect(prices).toBeVisible();assert.equal(await prices.getAttribute('open'),null);
 assert.equal(await member.getByRole('heading',{name:/DeepSeek Flash/}).count(),0);
 report.checks.push('VIP prices start collapsed and do not expose a wall of cost text');
 const wallet=store.points.wallet(learner.id).availableUnits;
 await prices.locator('summary').click();await expect(prices).toContainText('高峰 53.62 / 空闲 26.81 积分');
 await expect(prices).toContainText('不是固定价格');await expect(prices).toContainText('每 1000 Token');
 await prices.getByRole('button',{name:'刷新价目'}).click();await expect(prices).toContainText('高峰 3.68 / 空闲 1.84 积分');
 assert.equal(upstreamCalls,0);assert.equal(store.points.wallet(learner.id).availableUnits,wallet);
 report.checks.push('Price disclosure and refresh show exact dual-band examples without model calls or wallet mutations');
 admin=await pageFor(owner,'/#admin/usage');
 const configuration=await admin.request.get(base+'/api/admin/points/configuration');assert.equal(configuration.status(),200,await configuration.text());
 assert.equal((await configuration.json()).costForecast.plans.length,3);
 await expect(admin.getByRole('heading',{name:'会员签到成本测算',exact:true})).toBeVisible();
 await expect(admin.getByText('¥ 2.475 / ¥ 2.5575',{exact:true})).toBeVisible();
 await expect(admin.getByText(/这只是收支提示，不会因此阻止/)).toBeVisible();
 await expect(admin.getByText('新 AI 调用已受成本保护限制。',{exact:false})).toHaveCount(0);
 await admin.getByRole('button',{name:'刷新测算',exact:true}).click();await expect(admin.getByText('69.17%',{exact:false}).first()).toBeVisible();
 assert.equal(store.points.finance().revenueMicros,0);assert.deepEqual(report.errors,[]);
 report.checks.push('Admin shows 30/31-day forecasts and truthful deficit reporting without a revenue gate');
 await prices.scrollIntoViewIfNeeded();await member.screenshot({path:path.join(out,'web-pricing.png')});report.passed=true;
} catch(e) {report.failure=e.stack;if(admin)report.adminText=(await admin.locator('body').innerText()).slice(0,3500);process.exitCode=1;}
finally {
 await browser?.close();await app.locals.stop();server.closeAllConnections();await new Promise(r=>server.close(r));if(store.db.isOpen)store.db.close();
 if(path.dirname(fs.realpathSync(dir))!==parent||!path.basename(dir).startsWith('actual-billing-ui-'))throw Error('Unsafe fixture cleanup');
 fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
