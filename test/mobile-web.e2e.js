// npm run build, then node test/mobile-web.e2e.js. Uses only a temporary local database.
import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.js';
import { createStore } from '../server/store.js';
import express from 'express';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aceexam-apple-web-'));
const store = createStore(dir);
const template = store.allQ().find((q) => q.type === 'single_choice' && q.certificates?.includes('hcia-datacom'));
for (let i = 0; i < 12; i++) store.addQ({ ...template, id: `apple-fixture-${i}`, question: `苹果端核对题目 ${i + 1}`, chapter: '苹果端核对', knowledgeSection: '基础', knowledgePoint: '同步学习', options: { A: '核对选项甲', B: '核对选项乙', C: '核对选项丙', D: '核对选项丁' }, answer: ['A'], analysis: '测试题解析', certificates: ['hcia-datacom'] });
const backend = await createApp({ store, withFrontend: true, production: true, authRequired: true });
const app = express();
let forceUpdate = false;
// Server fixtures also work when a service worker controls the page.
app.post('/api/ai/teacher', (_req, res) => res.json({ text: '苹果端讲解联通核对' }));
app.post('/api/ai/train/stream', (_req, res) => {
  res.type('text/event-stream');
  res.write(`data: ${JSON.stringify({ type: 'progress', stage: 'generating', message: '正在核对变式题' })}\n\n`);
  setTimeout(() => res.end(`data: ${JSON.stringify({ type: 'done', result: { cached: false, questions: [{ id: 'ai-web-fixture', type: 'single_choice', question: 'AI 流式变式核对', options: { A: '甲', B: '乙' } }] } })}\n\n`), 100);
});
app.get('/api/mobile/version', (req, res, next) => {
  if (!forceUpdate) return next();
  res.json({ currentVersion: '0.1.0', latestVersion: '0.3.5', minimumVersion: '0.3.5', downloadUrl: '/downloads/test.apk', releaseNotes: '', updateAvailable: true, forceUpdate: true });
});
app.use(backend);
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const out = path.resolve('test-output/apple-web');
fs.mkdirSync(out, { recursive: true });
const mobileContext = {
  viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
};
let browser;
try {
  const manifest = await fetch(`${base}/app/manifest.webmanifest`).then((r) => r.json());
  assert.equal(manifest.start_url, '/app/');
  assert.equal(manifest.display, 'standalone');
  assert.equal((await fetch(`${base}/app/sw.js`)).headers.get('cache-control'), 'no-cache');
  assert.equal((await fetch(`${base}/app/does-not-exist.js`)).status, 404);

  for (const [engine, type] of [['webkit', webkit], ['chromium', chromium]]) {
    browser = await type.launch({ headless: true, proxy: { server: 'http://127.0.0.1:9', bypass: '127.0.0.1,localhost' } });
    const context = await browser.newContext(mobileContext);
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    const apiOrigins = new Set();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') console.log(`${engine} console: ${message.text()}`); });
    page.on('requestfailed', (request) => console.log(`${engine} failed: ${new URL(request.url()).pathname} ${request.failure()?.errorText}`));
    page.on('request', (request) => { if (request.url().includes('/api/')) apiOrigins.add(new URL(request.url()).origin); });
    const text = (value) => page.getByText(value, { exact: true }).filter({ visible: true });
    const tab = (value) => page.getByRole('button', { name: `${value}导航`, exact: true }).click();
    const shot = (name) => page.screenshot({ path: path.join(out, `${engine}-${name}.png`) });
    try {
      await page.goto(base);
      await page.waitForURL(`${base}/app/`);
      await text('欢迎回来').waitFor();
      await page.getByRole('button', { name: '添加考匠到主屏幕', exact: true }).click();
      await text('把考匠放到主屏幕').waitFor();
      await shot('install');
      await page.getByRole('button', { name: '知道了', exact: true }).click();
      console.log(`${engine}: Apple entry and installation guide`);

      await text('注册').click();
      await page.getByPlaceholder('输入账号', { exact: true }).fill(`apple_fixture_${engine}`);
      await page.getByPlaceholder('至少 8 位密码', { exact: true }).fill('fixture-password-123');
      const registered = page.waitForResponse((r) => r.url().endsWith('/api/auth/register') && r.request().method() === 'POST');
      await text('注册').last().click();
      const response = await registered;
      assert.equal(response.status(), 200);
      const session = await response.json();
      const cert = session.certificates.find((item) => item.id === 'hcia-datacom');
      await text(cert.name).click();
      await text('每一步，都有进度').waitFor();
      for (const label of ['今日', '练习', '错题', '考试', 'VIP', '我的']) await expect(page.getByRole('button', { name: `${label}导航`, exact: true })).toBeVisible();
      await shot('today');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      console.log(`${engine}: registration, certificate and six shared tabs`);

      await text('每一步，都有进度').evaluate((target) => {
        for (const [type, y] of [['touchstart', 100], ['touchmove', 190]]) {
          const touch = { identifier: 1, target, clientX: 40, clientY: y, pageX: 40, pageY: y };
          const event = new Event(type, { bubbles: true });
          Object.assign(event, { touches: [touch], targetTouches: [touch], changedTouches: [touch] });
          target.dispatchEvent(event);
        }
      });
      await text('松开刷新').waitFor();
      const [refreshed] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('/api/dashboard?summary=1')),
        text('每一步，都有进度').evaluate((target) => {
          const event = new Event('touchend', { bubbles: true });
          const touch = { identifier: 1, target, clientX: 40, clientY: 190, pageX: 40, pageY: 190, force: 0 };
          Object.assign(event, { touches: [], targetTouches: [], changedTouches: [touch] });
          target.dispatchEvent(event);
        }),
      ]);
      assert.equal(refreshed.status(), 200);
      console.log(`${engine}: pull-to-refresh gesture`);

      await tab('练习');
      const [questionResponse] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('/api/questions?page=1')),
        page.getByRole('button', { name: '练习整个大知识点 苹果端核对', exact: true }).click(),
      ]);
      const questions = await questionResponse.json();
      await text(questions.items[0].question).waitFor();
      await text('核对选项乙').click();
      await tab('我的');
      await tab('练习');
      const attempt = page.waitForResponse((r) => r.url().endsWith('/api/attempts') && r.request().method() === 'POST');
      await text('确认答案').click();
      assert.equal((await attempt).status(), 200);
      await text('下一题').waitFor();
      await text('AI 详细讲解').click();
      await text('苹果端讲解联通核对').waitFor();
      await text('生成 3 道变式题').click();
      await text('AI 已准备 1 道变式题，完成当前题后继续练习。').waitFor();
      await shot('practice');
      await tab('错题');
      await text('错题清单').waitFor();
      await expect(text('开始错题复习 · 1 题')).toBeVisible();
      console.log(`${engine}: answer survives navigation; attempt and wrong book sync`);
      console.log(`${engine}: AI explanation and streamed variations (fixture responses)`);

      await tab('今日');
      await page.getByText(/^(开始|继续)今日学习$/).filter({ visible: true }).click();
      await page.getByLabel('切换到普通练习和AI出题', { exact: true }).waitFor();
      await text('‹ 返回今日').click();
      await text('每一步，都有进度').waitFor();

      await tab('VIP');
      await text('签到').click();
      await text('签到成功').waitFor();
      await page.getByRole('button', { name: '知道了', exact: true }).click();
      await text('已签到').waitFor();
      await text('使用兑换码开通会员').click();
      await expect(page.getByLabel('会员兑换码', { exact: true })).toBeVisible();
      const code = store.generateMembershipCodes({ plan: 'vip', quantity: 1, durationDays: 30 }).codes[0].code;
      await page.getByLabel('会员兑换码', { exact: true }).fill(code);
      await page.getByRole('button', { name: '确认兑换', exact: true }).click();
      await text('VIP 兑换成功').waitFor();
      assert.equal(store.accountEntitlement(session.user.id).plan, 'vip');
      await page.getByRole('button', { name: '完成', exact: true }).click();
      await tab('我的');
      const [aiEntitlementResponse] = await Promise.all([
        page.waitForResponse((r) => r.url().endsWith('/api/account/entitlements') && r.request().method() === 'GET'),
        text('AI 学习助手').click(),
      ]);
      const aiEntitlement = await aiEntitlementResponse.json();
      if (aiEntitlement.canManageAiService) {
        await text('服务配置').waitFor();
        await page.getByRole('button', { name: '关闭 AI 配置', exact: true }).click();
        await tab('VIP');
      } else {
        await page.getByText('无需填写个人 API。', { exact: false }).filter({ visible: true }).waitFor();
        await page.getByRole('button', { name: '查看 AI 额度', exact: true }).click();
      }
      await text('使用兑换码开通会员').waitFor();
      await shot('vip');
      console.log(`${engine}: membership, check-in and web dialog callbacks`);

      await tab('我的');
      await text('考匠社区').click();
      await page.getByPlaceholder('说点什么…').fill('苹果与安卓共用社区');
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: '选择社区图片', exact: true }).click();
      await (await chooser).setFiles(path.resolve('public/kaojiang-logo-192.png'));
      await text('已选择图片，发送后会保存到社区').waitFor();
      const sent = page.waitForResponse((r) => r.url().endsWith('/api/community/messages') && r.request().method() === 'POST');
      await page.getByRole('button', { name: '发送消息', exact: true }).click();
      assert.equal((await sent).status(), 200);
      await text('苹果与安卓共用社区').last().waitFor();
      await expect(page.getByLabel('社区图片', { exact: true }).last()).toBeVisible();
      await shot('community');
      await page.getByRole('button', { name: '返回我的', exact: true }).click();
      console.log(`${engine}: community text and photo upload`);

      await tab('考试');
      await page.getByRole('button', { name: '10 题', exact: true }).click();
      await page.getByRole('checkbox', { name: /苹果端核对/ }).click();
      const created = page.waitForResponse((r) => r.url().endsWith('/api/exams') && r.request().method() === 'POST');
      await text('组合试卷，开始考试 →').click();
      const exam = await (await created).json();
      const saved = page.waitForResponse((r) => r.url().includes(`/api/exams/${exam.id}`) && r.request().method() === 'PUT');
      await page.getByRole('radio', { name: /核对选项甲/ }).click();
      assert.equal((await saved).status(), 200);
      await page.reload();
      await text('每一步，都有进度').waitFor();
      await tab('考试');
      const resumed = page.waitForResponse((r) => new URL(r.url()).pathname === `/api/exams/${exam.id}` && r.request().method() === 'GET');
      await text('继续 ›').first().click();
      const restoredExam = await (await resumed).json();
      assert.ok(Object.values(restoredExam.answers).some((answer) => answer.includes('A')));
      const firstQuestion = restoredExam.questions[0].id;
      const nextQuestion = restoredExam.questions.find((question) => !restoredExam.answers[question.id]?.length).id;
      const otherDevice = await page.request.put(`${base}/api/exams/${exam.id}/answers`, {
        headers: { Authorization: `Bearer ${session.sessionToken}` },
        data: { answers: { [firstQuestion]: ['B'] }, expectedVersion: restoredExam.answersVersion },
      });
      assert.equal(otherDevice.status(), 200);
      await page.getByRole('radio', { name: /核对选项甲/ }).click();
      await text('答案已在其他页面更新').waitFor();
      const merged = page.waitForResponse((r) => r.url().endsWith(`/api/exams/${exam.id}/answers`) && r.request().method() === 'PUT' && r.status() === 200);
      await page.getByRole('button', { name: '合并本机作答', exact: true }).click();
      await merged;
      assert.deepEqual(store.session(exam.id).answers[firstQuestion], ['B']);
      assert.deepEqual(store.session(exam.id).answers[nextQuestion], ['A']);
      await text('交卷').click();
      await page.getByRole('button', { name: '确认交卷', exact: true }).click();
      await text('‹ 返回考试').waitFor();
      await shot('exam');
      console.log(`${engine}: exam autosave, reload, resume, cross-device conflict merge and submit`);

      await tab('我的');
      await text('外观、动画与音效').click();
      await text('深色模式').click();
      await page.getByRole('button', { name: '关闭设置', exact: true }).click();
      await expect(page.getByRole('button', { name: '关闭设置', exact: true })).toBeHidden();
      await shot('profile-dark');
      await page.reload();
      await text('每一步，都有进度').waitFor();
      await page.waitForFunction(() => document.documentElement.style.colorScheme === 'dark');

      if (engine === 'chromium') {
        await page.evaluate(async () => { await navigator.serviceWorker.ready; });
        await page.reload();
        await text('每一步，都有进度').waitFor();
        const cachedUrls = await page.evaluate(async () => {
          const names = await caches.keys();
          const requests = await Promise.all(names.filter((name) => name.startsWith('kaojiang-shell-')).map(async (name) => (await caches.open(name)).keys()));
          return requests.flat().map((request) => new URL(request.url).pathname);
        });
        assert.ok(cachedUrls.includes('/app/index.html'));
        assert.ok(cachedUrls.every((url) => url.startsWith('/app/') && !url.includes('/api/')));
        await context.setOffline(true);
        await page.reload();
        await text('每一步，都有进度').waitFor();
        await context.setOffline(false);
        console.log('chromium: offline app shell and public-file-only service worker cache');
      }

      await tab('我的');
      await text('退出登录').click();
      await text('欢迎回来').waitFor();
      await page.reload();
      await text('欢迎回来').waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem('kaojiang-session-token')), null);
      forceUpdate = true;
      await page.reload();
      await text('请更新到最新版').waitFor();
      await expect(page.getByRole('button', { name: '刷新到最新版本', exact: true })).toBeVisible();
      assert.equal(await page.locator('a[href$=".apk"]').count(), 0);
      forceUpdate = false;
      await page.getByRole('button', { name: '刷新到最新版本', exact: true }).click();
      await text('欢迎回来').waitFor();
      await page.getByPlaceholder('输入账号', { exact: true }).fill(`apple_fixture_${engine}`);
      await page.getByPlaceholder('至少 8 位密码', { exact: true }).fill('fixture-password-123');
      await text('登录').last().click();
      await text('每一步，都有进度').waitFor();

      const ipad = await browser.newContext({ ...mobileContext, viewport: { width: 1024, height: 768 }, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15' });
      await ipad.addInitScript(() => {
        Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
        Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 });
      });
      const tablet = await ipad.newPage();
      await tablet.goto(base);
      await tablet.waitForURL(`${base}/app/`);
      await expect(tablet.getByText('欢迎回来', { exact: true })).toBeVisible();
      await ipad.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
      await tablet.reload();
      await expect(tablet.getByText('欢迎回来', { exact: true })).toBeVisible();
      assert.equal(await tablet.getByRole('button', { name: '添加考匠到主屏幕', exact: true }).count(), 0);
      await ipad.close();
      assert.deepEqual([...apiOrigins], [base], 'Web requests must use this deployment, never production');
      assert.deepEqual(errors, []);
      console.log(`${engine}: theme, logout, web refresh and iPad entry; no uncaught errors`);
    } catch (error) {
      console.log(`${engine} stopped at ${page.url()}: ${errors.join('; ')}`);
      await shot('failure').catch(() => undefined);
      fs.writeFileSync(path.join(out, `${engine}-failure.txt`), await page.locator('body').innerText().catch(() => ''));
      throw error;
    } finally { await context.close(); await browser.close(); browser = null; }
  }
} finally {
  await browser?.close();
  await backend.locals.stop();
  await new Promise((resolve) => server.close(resolve));
  store.db.close();
  assert.equal(path.dirname(dir), path.resolve(os.tmpdir()));
  assert.ok(path.basename(dir).startsWith('aceexam-apple-web-'));
  fs.rmSync(dir, { recursive: true, force: true });
}
