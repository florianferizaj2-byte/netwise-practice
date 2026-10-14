// Local, disposable accounts only. Requires build:mobile-web.
import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.js';
import { createStore } from '../server/store.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aceexam-admin-e2e-'));
const store = createStore(dir);
const admin = store.register('mobile_admin_fixture', 'fixture-password-123');
const learner = store.register('mobile_member_fixture', 'fixture-password-123');
store.selectCertificate(admin.id, 'hcia-datacom');
store.selectCertificate(learner.id, 'hcia-datacom');
const app = await createApp({ store, withFrontend: true, production: true, authRequired: true });
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const output = path.resolve('test-output/mobile-admin');
fs.mkdirSync(output, { recursive: true });
const results = [];
let browser;
try {
  for (const [engine, launcher] of [['chromium', chromium], ['webkit', webkit]]) {
    store.setUserBanned(learner.id, false);
    store.updateCommunityName(learner.id, null);
    store.saveAccountEntitlement(learner.id, { plan: 'free', expiresAt: null });
    const adminToken = store.createAuthSession(admin.id);
    const learnerToken = store.createAuthSession(learner.id);
    browser = await launcher.launch({ headless: true, proxy: { server: 'http://127.0.0.1:9', bypass: '127.0.0.1,localhost' } });
    const options = { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1' };
    const adminContext = await browser.newContext(options);
    const learnerContext = await browser.newContext(options);
    await adminContext.addInitScript((token) => localStorage.setItem('kaojiang-session-token', token), adminToken);
    await learnerContext.addInitScript((token) => localStorage.setItem('kaojiang-session-token', token), learnerToken);
    const page = await adminContext.newPage();
    const student = await learnerContext.newPage();
    page.setDefaultTimeout(15000); student.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    student.on('pageerror', (error) => errors.push(error.message));
    const button = (label) => page.getByRole('button', { name: label, exact: true });
    const shot = async (name) => {
      await page.waitForTimeout(350);
      await page.screenshot({ path: path.join(output, `${engine}-${name}.png`), animations: 'disabled' });
    };
    try {
      await student.goto(`${base}/app/`);
      await expect(student.getByTestId('today-screen')).toBeVisible();
      await student.getByRole('button', { name: '我的导航', exact: true }).click();
      await expect(student.getByText('管理中心', { exact: true })).toHaveCount(0);
      const blocked = await fetch(`${base}/api/admin/mobile/users`, { headers: { Authorization: `Bearer ${learnerToken}` } });
      assert.equal(blocked.status, 403);
      await page.goto(`${base}/app/`);
      await expect(page.getByTestId('today-screen')).toBeVisible();
      await page.getByRole('button', { name: '我的导航', exact: true }).click();
      await page.getByText('管理中心', { exact: true }).click();
      await expect(page.getByRole('heading', { name: '管理中心', exact: true })).toBeVisible();
      await expect(button(`查看账号 ${learner.username}`)).toBeVisible();
      await shot('accounts');

      await page.getByRole('textbox', { name: '搜索账号或昵称', exact: true }).fill(learner.username);
      await button('搜索').click();
      await expect(page.getByText('共 1 个注册账号', { exact: true })).toBeVisible();
      await button(`查看账号 ${learner.username}`).click();
      await page.getByRole('textbox', { name: '社区昵称', exact: true }).fill('手机管理新昵称');
      await button('VIP').click();
      await page.getByRole('textbox', { name: '会员到期日期', exact: true }).fill('2090-12-31');
      await button('保存账号设置').click();
      await expect(page.getByText('账号设置已保存', { exact: true })).toBeVisible();
      assert.equal(store.userById(learner.id).communityName, '手机管理新昵称');
      assert.equal(store.accountEntitlement(learner.id).plan, 'vip');
      await shot('account-edit');
      await button('返回账号列表').click();
      await expect(button(`查看账号 ${learner.username}`)).toBeVisible();
      await expect(page.getByText('昵称：手机管理新昵称', { exact: true })).toBeVisible();

      await button('公告管理').click();
      const title = `手机端公告${engine}`;
      await expect(button('保存公告')).toBeEnabled();
      await page.getByRole('textbox', { name: '公告标题', exact: true }).fill(title);
      await page.getByRole('textbox', { name: '公告正文', exact: true }).fill('在手机管理页面保存，其他账号直接读取新的公告。');
      const toggle = page.getByRole('switch', { name: '在首页显示公告', exact: true });
      if (!(await toggle.isChecked())) await toggle.check();
      await button('保存公告').click();
      await expect(page.getByText('公告已保存，首页将显示最新内容', { exact: true })).toBeVisible();
      await shot('announcement-edit');
      await student.getByRole('button', { name: '今日导航', exact: true }).click();
      await expect(student.getByRole('button', { name: `查看公告：${title}`, exact: true })).toBeVisible();
      await toggle.uncheck();
      await button('保存公告').click();
      await expect(page.getByText('公告已隐藏', { exact: true })).toBeVisible();
      await student.getByRole('button', { name: '我的导航', exact: true }).click();
      await student.getByRole('button', { name: '今日导航', exact: true }).click();
      await expect(student.getByRole('button', { name: `查看公告：${title}`, exact: true })).toHaveCount(0);

      await button('账号管理').click();
      await button(`查看账号 ${learner.username}`).click();
      await page.getByRole('textbox', { name: '封禁原因', exact: true }).fill('测试用途');
      await button('封禁账号').click();
      await button('确认封禁').click();
      await expect(page.getByText('账号已封禁', { exact: true })).toBeVisible();
      assert.ok(store.userById(learner.id).bannedAt);
      assert.equal(store.authUser(learnerToken), null);
      await button('解除封禁').click();
      await button('确认解封').click();
      await expect(page.getByText('账号已解封', { exact: true })).toBeVisible();
      assert.equal(store.userById(learner.id).bannedAt, null);

      await page.setViewportSize({ width: 320, height: 740 });
      await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await shot('narrow-dark');
      assert.deepEqual(errors, []);
      results.push({ engine, result: 'passed', adminOnlyEntry: true, ordinaryUser403: true, accountSearch: true,
        nicknameAndMembershipPersisted: true, announcementPublishedAndHiddenForOtherAccount: true, banUnbanAndSessionRevocation: true,
        narrowDarkLayout: true });
      console.log(`${engine}: admin-only entry, accounts, save, announcement cross-account refresh, ban/unban passed`);
    } catch (error) {
      await shot('failure').catch(() => undefined);
      fs.writeFileSync(path.join(output, `${engine}-failure.txt`), await page.locator('body').innerText().catch(() => ''));
      throw error;
    } finally { await adminContext.close(); await learnerContext.close(); await browser.close(); browser = null; }
  }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ results }, null, 2));
} finally {
  await browser?.close(); await app.locals.stop(); await new Promise((resolve) => server.close(resolve)); store.db.close();
  assert.equal(path.dirname(dir), path.resolve(os.tmpdir()));
  assert.ok(path.basename(dir).startsWith('aceexam-admin-e2e-'));
  fs.rmSync(dir, { recursive: true, force: true });
}
