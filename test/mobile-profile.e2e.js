// Real photo selection and profile flow; only disposable accounts/data.
import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.js';
import { createStore } from '../server/store.js';
import { completeFixtureProfile, dismissLaunchAnnouncement, finishProfileForm } from './helpers/mobile-profile.js';

process.env.ALLOWED_HOSTS = '127.0.0.1,localhost'; process.env.COOKIE_SECURE = '0';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aceexam-profile-e2e-'));
const file = path.join(directory, 'notice.json');
const announcement = { schemaVersion: 1, id: 'entry-notice', enabled: true, title: '进入考匠前的公告', body: '请先阅读这条公告。\n<b>这是普通文字</b>', updatedAt: '2026-10-14T12:00:00+08:00' };
const write = (fields = {}) => fs.writeFileSync(file, JSON.stringify({ ...announcement, ...fields }));
write();
const store = createStore(directory);
const admin = store.register('web_profile_admin', 'fixture-password-123');
completeFixtureProfile(store, admin); store.selectCertificate(admin.id, 'hcia-datacom');
const app = await createApp({ store, withFrontend: true, production: true, authRequired: true, announcementFile: file });
const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`, output = path.resolve('test-output/profile');
fs.mkdirSync(output, { recursive: true });
const results = []; let browser;
try {
  for (const [engine, launcher] of [['chromium', chromium], ['webkit', webkit]]) {
    write();
    browser = await launcher.launch({ headless: true, proxy: { server: 'http://127.0.0.1:9', bypass: '127.0.0.1,localhost' } });
    const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1' });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    const shot = (name) => page.screenshot({ path: path.join(output, `${engine}-${name}.png`), animations: 'disabled' });
    try {
      // Guests see the notice before login; signing in does not pop it up again.
      await page.goto(`${base}/app/`);
      const launch = page.getByTestId('launch-announcement');
      await expect(launch).toBeVisible(); await expect(launch.getByTestId('announcement-body')).toHaveText(announcement.body);
      await expect(page.getByText('欢迎回来', { exact: true })).toHaveCount(0);
      await shot('launch-notice'); await dismissLaunchAnnouncement(page);
      await expect(page.getByText('欢迎回来', { exact: true })).toBeVisible();
      const learner = store.register(`old_profile_${engine}`, 'fixture-password-123');
      store.updateCommunityName(learner.id, '已有昵称'); store.selectCertificate(learner.id, 'hcia-datacom');
      await page.getByPlaceholder('输入账号', { exact: true }).fill(learner.username);
      await page.getByPlaceholder('至少 8 位密码', { exact: true }).fill('fixture-password-123');
      await page.getByRole('button', { name: '登录', exact: true }).last().click();
      await expect(page.getByRole('heading', { name: '完善个人资料', exact: true })).toBeVisible();
      await expect(launch).toHaveCount(0); await expect(page.getByTestId('today-screen')).toHaveCount(0);
      await page.getByRole('textbox', { name: '名字', exact: true }).fill('');
      await page.getByRole('button', { name: '保存并继续', exact: true }).click();
      await expect(page.getByRole('alert')).toHaveText('请填写名字');
      await page.getByRole('textbox', { name: '名字', exact: true }).fill(`用户昵称${engine}`);
      await page.getByRole('button', { name: '保存并继续', exact: true }).click();
      await expect(page.getByRole('alert')).toHaveText('请选择头像');
      await finishProfileForm(page, `用户昵称${engine}`);
      await expect(page.getByTestId('today-screen')).toBeVisible();
      await page.getByRole('button', { name: '我的导航', exact: true }).click();
      await expect(page.getByText(`用户昵称${engine}`, { exact: true }).first()).toBeVisible();
      await page.getByRole('button', { name: '个人资料设置', exact: true }).click();
      await page.getByRole('textbox', { name: '名字', exact: true }).fill(`更新昵称${engine}`);
      await page.getByRole('button', { name: '保存资料', exact: true }).click();
      await expect(page.getByText(`更新昵称${engine}`, { exact: true }).first()).toBeVisible();
      await expect(page.getByText('云端备份', { exact: true })).toHaveCount(0);
      await shot('profile');
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('kaojiang-session-profile') || '{}').user?.profileComplete === true);
      // A new launch shows the latest notice, then restores the completed profile.
      write({ title: '实时调整后的公告' });
      await page.reload(); await expect(launch.getByRole('heading', { name: '实时调整后的公告', exact: true })).toBeVisible();
      await dismissLaunchAnnouncement(page); await expect(page.getByTestId('today-screen')).toBeVisible();
      await expect(page.getByText('完善个人资料', { exact: true })).toHaveCount(0);
      write({ enabled: false });
      await page.reload(); await dismissLaunchAnnouncement(page);
      await expect(page.getByTestId('today-screen')).toBeVisible(); await expect(launch).toHaveCount(0);
      // The Web administrator sees only profile fields, with a usable avatar.
      const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await desktop.addCookies([{ name: 'netwise_session', value: store.createAuthSession(admin.id), url: base }]);
      const version = JSON.parse(fs.readFileSync('mobile/package.json', 'utf8')).version;
      await desktop.addInitScript((key) => localStorage.setItem(key, 'seen'), `netwise-announcement-v${version}`);
      const desk = await desktop.newPage(); desk.setDefaultTimeout(15000); desk.on('pageerror', (error) => errors.push(error.message));
      await desk.goto(`${base}/?desktop=1#admin`);
      const dismiss = desk.getByRole('button', { name: '知道了，开始学习', exact: true });
      if (await dismiss.isVisible()) await dismiss.click();
      await desk.getByRole('tab', { name: '用户管理', exact: true }).click();
      const row = desk.locator('.admin-users-table tbody tr').filter({ hasText: learner.username });
      await expect(row).toContainText(`更新昵称${engine}`);
      const image = row.getByRole('img', { name: `更新昵称${engine}的头像`, exact: true });
      await expect(image).toBeVisible(); await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0)).toBe(true);
      await desk.getByRole('textbox', { name: '搜索用户', exact: true }).fill(`更新昵称${engine}`);
      await desk.getByRole('button', { name: '搜索', exact: true }).click();
      await expect(desk.locator('.admin-users-table tbody tr')).toHaveCount(1);
      await expect(desk.getByText('通讯录', { exact: true })).toHaveCount(0);
      await desk.screenshot({ path: path.join(output, `${engine}-web-admin.png`), fullPage: true });
      await desktop.close();
      assert.deepEqual(errors, []);
      results.push({ engine, guestAndExistingAccountNotice: true, profileRequiredForOldAccount: true, realPhotoPicker: true, serverProfilePersistence: true, webAdminAvatarNicknameSearch: true, noticeHotUpdateAndDisable: true });
      console.log(`${engine}: launch notice, required old-account profile, photo picker, persisted profile and Web admin passed`);
    } catch (error) { await shot('failure').catch(() => undefined); fs.writeFileSync(path.join(output, `${engine}-failure.txt`), await page.locator('body').innerText().catch(() => '')); throw error; }
    finally { await context.close(); await browser.close(); browser = null; }
  }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ results }, null, 2));
} finally {
  await browser?.close(); await app.locals.stop(); await new Promise((resolve) => server.close(resolve)); store.db.close();
  assert.equal(path.dirname(directory), path.resolve(os.tmpdir())); assert.ok(path.basename(directory).startsWith('aceexam-profile-e2e-'));
  fs.rmSync(directory, { recursive: true, force: true });
}
