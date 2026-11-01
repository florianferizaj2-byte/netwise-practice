// Local browser acceptance with the production provider and synthetic transport.
// It never reads production credentials, writes real accounts, or calls an API.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {expect} from '@playwright/test';
import {createStore} from '../server/store.js';
import {createApp} from '../server/index.js';
import {OpenAICompatibleProvider} from '../server/ai.js';
import {launchTestBrowser} from './helpers/browser.js';

Object.assign(process.env,{ALLOWED_HOSTS:'localhost,127.0.0.1',COOKIE_SECURE:'0',
  AI_SERVICE_API_KEY:'synthetic-browser-fixture-only',AI_SERVICE_MODEL:'deepseek-flash',AI_SERVICE_BASE_URL:'https://api.deepseek.com'});
const parent=path.resolve('tmp'),directory=fs.mkdtempSync(path.join(parent,'ai-points-browser-'));
const out=path.resolve('tmp/ai-points-20261023/browser');fs.mkdirSync(out,{recursive:true});
const store=createStore(directory),owner=store.register('points_browser_owner','fixture-password-123'),learner=store.register('points_browser_learner','fixture-password-123'),peer=store.register('points_browser_peer','fixture-password-123');
store.db.prepare('UPDATE users SET is_admin=1 WHERE id=?').run(owner.id);
for(const user of [owner,learner,peer])store.selectCertificate(user.id,'network-engineer');
store.saveAccountEntitlement(learner.id,{plan:'vip',expiresAt:new Date(Date.now()+31*86400000).toISOString()});
store.points.saveRateCard({provider:'https://api.deepseek.com',model:'deepseek-flash',inputMicrosPerMillion:2000000,outputMicrosPerMillion:8000000,cachedMicrosPerMillion:40000,source:'synthetic-browser-price',verifiedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()},owner.id);
store.saveUsage({model:'historical-fixture',taskType:'legacy-test',hasUsage:true,prompt_tokens:5,completion_tokens:7,total_tokens:12},peer.id);
let calls=0,fail=false;
const provider=new OpenAICompatibleProvider(store,{fetch:async()=>{
  calls++;
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(fail?{invalid:true}:{text:'合成验收解析：先核对题干条件，再比较各个选项。'})},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}}),{headers:{'Content-Type':'application/json'}});
}});
const app=await createApp({store,provider,production:true,accountSecurity:{enabled:false}}),server=app.listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;
const version=JSON.parse(fs.readFileSync('mobile/package.json','utf8')).version;
const errors=[],checks=[],headers=[];let browser,admin,page;
async function context(user){
  const context=await browser.newContext({viewport:{width:1280,height:860}});
  await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
  await context.addCookies([{name:'netwise_session',value:store.createAuthSession(user.id),url:base,httpOnly:true}]);
  await context.addInitScript(v=>localStorage.setItem('netwise-announcement-v'+v,'seen'),version);
  const page=await context.newPage();page.setDefaultTimeout(20000);
  page.on('pageerror',error=>errors.push(error.message));return page;
}
const available=()=>page.locator('.vip-quota').filter({has:page.getByText('可用积分',{exact:true})}).locator('strong');
async function screenshot(page,name){await page.screenshot({path:path.join(out,name+'.png'),fullPage:false});}
try{
  browser=await launchTestBrowser();admin=await context(owner);page=await context(learner);
  page.on('request',request=>{if(request.url().endsWith('/api/ai/teacher'))headers.push(request.headers()['x-ai-request-id']);});
  await page.goto(base+'/#vip',{waitUntil:'networkidle'});
  await expect(available()).toContainText('0');await expect(page.getByText('本期积分待到账，请联系管理员核对发放记录',{exact:true})).toBeVisible();
  await expect(page.locator('.vip-plan')).toHaveCount(3);
  for(const [tier,points] of [['vip','990'],['svip','1990'],['ssvip','3990']])await expect(page.locator('.vip-plan.vip-tone-'+tier)).toContainText(points);
  checks.push('all three plans use points; unfunded membership shows pending credit, not invented cash');

  await admin.goto(base+'/#admin/usage',{waitUntil:'networkidle'});
  await expect(admin.getByRole('heading',{name:'所有用户的积分与用量',exact:true})).toBeVisible();
  const finance=admin.locator('details').filter({has:admin.locator('summary',{hasText:'登记实收收入或经营支出'})});
  await finance.locator('summary').click();
  await finance.getByLabel('实际金额（元）',{exact:true}).fill('99');
  await finance.getByLabel('唯一收款或支出凭据编号',{exact:true}).fill('synthetic-browser-receipt-001');
  await finance.getByRole('button',{name:'登记金额',exact:true}).click();
  await expect(admin.getByRole('status').filter({hasText:'已保存。余额、收支与成本预算已重新计算。'})).toBeVisible();
  assert.equal(store.points.finance().revenueMicros,99000000);
  await page.reload({waitUntil:'networkidle'});await expect(available()).toContainText('990');
  checks.push('administrator records a unique synthetic receipt through the real form and funded membership issues exactly 990 points');

  await page.goto(base+'/#home',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'开始 10 题练习',exact:true}).click();
  await expect(page.locator('.question-text')).toBeVisible();
  await page.locator('.option').first().click();await page.getByRole('button',{name:'提交答案',exact:true}).click();
  await expect(page.locator('.result-block')).toBeVisible();
  await page.locator('.teacher-open').click();
  await page.getByRole('button',{name:'详细讲解',exact:true}).click();
  await expect(page.locator('.teacher-response')).toContainText('合成验收解析');
  assert.equal(calls,1);assert.equal(store.points.wallet(learner.id).availableUnits,989960);
  assert.match(headers[0],/^[a-zA-Z0-9:_-]{8,150}$/);
  await page.getByRole('button',{name:'详细讲解',exact:true}).click();
  await expect.poll(()=>calls).toBe(1);
  assert.equal(store.points.wallet(learner.id).availableUnits,989960);
  fail=true;await page.getByRole('button',{name:'换一种方法解释',exact:true}).click();
  await expect.poll(()=>store.db.prepare("SELECT count(*) AS n FROM ai_points_operations WHERE user_id=? AND state='refunded'").get(learner.id).n).toBeGreaterThan(0);
  assert.equal(store.points.wallet(learner.id).availableUnits,989960);assert.equal(store.points.wallet(learner.id).heldUnits,0);
  fail=false;
  await page.goto(base+'/#vip',{waitUntil:'networkidle'});await expect(available()).toContainText('989.96');
  await expect(page.locator('.points-activity')).toContainText('失败 · 预扣已退还');
  await expect(page.locator('.points-activity')).toContainText('已结算');
  await page.getByRole('button',{name:'签到领取积分',exact:true}).click();
  await expect(page.getByRole('button',{name:'今日已签到',exact:true})).toBeDisabled();
  await expect(available()).toContainText('994.96');
  checks.push('real practice UI adds a request identity; success charges actual usage, cache is free, final schema failure refunds and VIP balance/history refresh');

  await admin.getByRole('button',{name:'刷新',exact:true}).click();
  await admin.getByRole('button',{name:learner.username,exact:true}).click();
  const detail=admin.locator('.ac-panel').filter({has:admin.getByRole('heading',{name:learner.username+' · 任务明细',exact:true})});
  await expect(detail).toContainText('已退款');await expect(detail).toContainText('deepseek-flash');
  await admin.getByRole('button',{name:peer.username,exact:true}).click();
  await expect(admin.getByRole('heading',{name:'历史调用记录 · 共 1 次',exact:true})).toBeVisible();
  await expect(admin.getByText('未知，待核对',{exact:true})).toBeVisible();
  checks.push('all users, token/cost/refund details and unknown historical costs are visible to the administrator');
  await screenshot(admin,'admin-desktop');await screenshot(page,'vip-desktop');
  for(const width of [320,390,768,1280]){
    for(const current of [page,admin]){
      await current.setViewportSize({width,height:860});
      await expect.poll(()=>current.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
    }
  }
  await page.setViewportSize({width:390,height:844});await screenshot(page,'vip-mobile');
  await page.emulateMedia({reducedMotion:'reduce',colorScheme:'dark'});
  assert.equal(store.points.audit().passed,true);assert.deepEqual(errors,[]);
  checks.push('VIP and admin pages fit 320/390/768/1280px; no browser exceptions; point journal balances');
  const result={passed:true,syntheticTransport:true,paidCalls:0,providerFixtureCalls:calls,checks,errors};
  fs.writeFileSync(path.join(out,'result.json.new'),JSON.stringify(result,null,2));fs.renameSync(path.join(out,'result.json.new'),path.join(out,'result.json'));
  console.log('Browser acceptance passed: '+checks.length+' gates; synthetic upstream, no paid calls.');
}catch(error){
  fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:error.message,checks,errors},null,2));
  if(page)await screenshot(page,'failure-user').catch(()=>{});if(admin)await screenshot(admin,'failure-admin').catch(()=>{});
  throw error;
}finally{
  await browser?.close();await app.locals.stop();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));store.db.close();
  assert.equal(path.dirname(directory),parent);assert.ok(path.basename(directory).startsWith('ai-points-browser-'));fs.rmSync(directory,{recursive:true,force:true});
}
