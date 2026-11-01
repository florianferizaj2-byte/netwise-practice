// Retains the former daily-quota entry point, testing the unified point contract.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {webkit,expect} from '@playwright/test';
import {createStore} from '../server/store.js';
import {createApp} from '../server/index.js';
import {OpenAICompatibleProvider} from '../server/ai.js';
import {ensureAccountPoints} from '../server/ai-points/account.js';
import {completeFixtureProfile,dismissLaunchAnnouncement} from './helpers/mobile-profile.js';
import {launchTestBrowser} from './helpers/browser.js';
Object.assign(process.env,{ALLOWED_HOSTS:'localhost,127.0.0.1',COOKIE_SECURE:'0',AI_SERVICE_API_KEY:'synthetic-mobile-fixture-only',AI_SERVICE_MODEL:'deepseek-flash',AI_SERVICE_BASE_URL:'https://api.deepseek.com'});
const parent=path.resolve('tmp'),directory=fs.mkdtempSync(path.join(parent,'ai-points-mobile-'));
const out=path.resolve('tmp/ai-points-20261023/mobile-browser');fs.mkdirSync(out,{recursive:true});
const store=createStore(directory),admin=store.register('point_mobile_admin','fixture-password-123'),users={};
store.points.recordFinance({key:'synthetic-income',kind:'revenue',amountMicros:99000000,reference:'synthetic-mobile-browser-receipt',createdBy:admin.id});
for(const tier of ['free','vip','svip','ssvip']){
  const user=store.register('point_mobile_'+tier,'fixture-password-123');users[tier]=user;
  store.selectCertificate(user.id,'network-engineer');completeFixtureProfile(store,user);
  if(tier!=='free')store.saveAccountEntitlement(user.id,{plan:tier,expiresAt:new Date(Date.now()+31*86400000).toISOString()});
}
store.points.saveRateCard({provider:'https://api.deepseek.com',model:'deepseek-flash',inputMicrosPerMillion:2000000,outputMicrosPerMillion:8000000,cachedMicrosPerMillion:40000,source:'synthetic-mobile-browser-price',verifiedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()},admin.id);
const provider=new OpenAICompatibleProvider(store,{fetch:async()=>new Response(JSON.stringify({choices:[{message:{content:'{"text":"合成积分验收回答。"}'},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}}),{headers:{'Content-Type':'application/json'}})});
ensureAccountPoints(store,users.vip.id);
await provider.call([{role:'user',content:'synthetic usage'}],undefined,{userId:users.vip.id,taskType:'question-explanation'});
const app=await createApp({store,provider,production:true,accountSecurity:{enabled:false}}),server=app.listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;
const version=JSON.parse(fs.readFileSync('mobile/package.json','utf8')).version,errors=[],checks=[];let browser;
try{
  for(const surface of ['desktop-chromium','mobile-chromium','mobile-webkit']){
    const mobile=surface.startsWith('mobile');
    browser=surface.endsWith('webkit')?await webkit.launch({headless:true}):await launchTestBrowser();
    for(const [tier,points] of [['free',0],['vip',990],['svip',1990],['ssvip',3990]]){
      const context=await browser.newContext({viewport:{width:mobile?390:1280,height:844},...(mobile?{isMobile:true,hasTouch:true}: {})});
      await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
      const token=store.createAuthSession(users[tier].id);
      await context.addCookies([{name:'netwise_session',value:token,url:base,httpOnly:true}]);
      await context.addInitScript(({token,version})=>{localStorage.setItem('kaojiang-session-token',token);localStorage.setItem('netwise-announcement-v'+version,'seen');},{token,version});
      const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(surface+': '+error.message));
      await page.goto(base+(mobile?'/app/':'/#vip'),{waitUntil:'networkidle'});
      const expected=tier==='vip'?989.96:points,formatted=expected.toLocaleString('zh-CN',{maximumFractionDigits:3});
      const balancePattern=new RegExp('^'+formatted.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*积分');
      if(mobile){
        await dismissLaunchAnnouncement(page);await page.getByRole('button',{name:'VIP导航',exact:true}).click();
        await expect(page.getByTestId('vip-points-balance')).toContainText(balancePattern);
        await expect(page.getByTestId('vip-points-monthly')).toContainText(String(points));
        await expect(page.getByTestId('vip-points-held')).toContainText('0');
        await expect(page.getByText('所有 AI 功能通用',{exact:true})).toBeVisible();
        if(tier==='vip'){
          await page.getByRole('button',{name:'查看 / 刷新积分记录',exact:true}).click();
          await expect(page.getByText('扣除 0.04 积分',{exact:true})).toBeVisible();
        }
      }else{
        await expect(page.locator('.vip-quota').filter({hasText:'可用积分'}).locator('strong')).toContainText(balancePattern);
        await expect(page.locator('.vip-quota').filter({hasText:'每 30 天套餐'}).locator('strong')).toContainText(String(points));
        if(tier==='free'){
          const code=store.generateMembershipCodes({plan:'vip',quantity:1,durationDays:30}).codes[0].code;
          await page.getByLabel('会员兑换码',{exact:true}).fill(code);await page.getByRole('button',{name:'确认兑换',exact:true}).click();
          await expect(page.getByText('VIP 兑换成功',{exact:true})).toBeVisible();
          await expect(page.locator('.vip-quota').filter({hasText:'每 30 天套餐'}).locator('strong')).toContainText('990');
          const fresh=store.register('point_mobile_free_unredeemed','fixture-password-123');store.selectCertificate(fresh.id,'network-engineer');completeFixtureProfile(store,fresh);users.free=fresh;
        }
      }
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);
      checks.push(`${surface}/${tier}: funded points, monthly allowance and isolated account balance`);
      if(tier==='vip')await page.screenshot({path:path.join(out,surface+'.png'),fullPage:false});
      await context.close();
    }
    await browser.close();browser=undefined;
  }
  assert.deepEqual(errors,[]);assert.equal(store.points.audit().passed,true);
  fs.writeFileSync(path.join(out,'result.json.new'),JSON.stringify({passed:true,checks,errors,syntheticTransport:true,paidCalls:0},null,2));fs.renameSync(path.join(out,'result.json.new'),path.join(out,'result.json'));
  console.log('Mobile browser acceptance passed: '+checks.length+' checks across Chromium and WebKit; no paid calls.');
}catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({checks,errors,error:error.message},null,2));throw error;}
finally{await browser?.close();await app.locals.stop();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));store.db.close();assert.equal(path.dirname(directory),parent);assert.ok(path.basename(directory).startsWith('ai-points-mobile-'));fs.rmSync(directory,{recursive:true,force:true});}
