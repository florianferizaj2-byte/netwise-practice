// Run after build:mobile-web. Only a disposable local server/database/file is changed.
import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.js';
import { createStore } from '../server/store.js';
import { completeFixtureProfile, dismissLaunchAnnouncement } from './helpers/mobile-profile.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aceexam-announcement-e2e-'));
const file = path.join(dir, 'announcement.json');
const version = JSON.parse(fs.readFileSync(new URL('../mobile/package.json', import.meta.url), 'utf8')).version;
const original = { schemaVersion: 1, id: 'e2e-notice', enabled: true, title: '公告联通验证',
  body: '这是一条测试公告。\n无需重新安装即可更新。\n<b>这里只显示普通文字</b>', updatedAt: '2026-10-14T08:00:00+08:00' };
const write = (value) => fs.writeFileSync(file, JSON.stringify(value));
write(original);
const store = createStore(dir);
const app = await createApp({ store, withFrontend: true, production: true, authRequired: true, announcementFile: file });
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const output = path.resolve('test-output/announcement');
fs.mkdirSync(output, { recursive: true });
const results = [];
let browser;
try {
  for (const [engine, launcher] of [['chromium', chromium], ['webkit', webkit]]) {
    write(original);
    browser = await launcher.launch({ headless: true, proxy: { server: 'http://127.0.0.1:9', bypass: '127.0.0.1,localhost' } });
    const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true,
      reducedMotion: 'reduce', colorScheme: 'light', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1' });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    const errors = [];
    const publicRequests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/mobile/announcement') publicRequests.push(request.headers());
    });
    const banner = (title) => page.getByRole('button', { name: `查看公告：${title}`, exact: true });
    const shot = async (name) => {
      await page.clock.runFor(400);
      return page.screenshot({ path: path.join(output, `${engine}-${name}.png`), animations: 'disabled' });
    };
    try {
      await page.clock.install();
      // Create an ordinary free account: no membership/admin gate is involved.
      const registered = await fetch(`${base}/api/auth/register`, { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Client': 'mobile', 'X-App-Version': version },
        body: JSON.stringify({ username: `announcement_${engine}`, password: 'announcement-fixture-123' }) });
      assert.equal(registered.status, 200);
      const session = await registered.json();
      completeFixtureProfile(store, session.user);
      const selected = await fetch(`${base}/api/auth/certificate`, { method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Client': 'mobile', 'X-App-Version': version, Authorization: `Bearer ${session.sessionToken}` },
        body: JSON.stringify({ certificateId: 'hcia-datacom' }) });
      assert.equal(selected.status, 200);
      await context.addInitScript((token) => localStorage.setItem('kaojiang-session-token', token), session.sessionToken);
      await page.goto(`${base}/app/`);
      await dismissLaunchAnnouncement(page);
      await expect(page.getByTestId('today-screen')).toBeVisible();
      await expect(page.getByText('每一步，都有进度', { exact: true })).toHaveCount(0);
      const today = page.getByTestId('today-screen');
      await expect(today).not.toContainText(new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }));
      await expect(banner(original.title)).toBeVisible();
      await shot('home');
      await banner(original.title).click();
      await expect(page.getByTestId('announcement-body')).toHaveText(original.body);
      assert.equal(await page.locator('script').filter({ hasText: '这里只显示普通文字' }).count(), 0);
      await shot('detail');
      await page.getByRole('button', { name: '关闭公告', exact: true }).click();

      const updated = { ...original, title: '第二版实时公告', body: '同一个安装包，新的公告内容。' };
      write(updated);
      await page.clock.fastForward(61_000);
      await expect(banner(updated.title)).toBeVisible();
      await banner(updated.title).click();
      await expect(page.getByTestId('announcement-body')).toHaveText(updated.body);
      await page.getByRole('button', { name: '关闭公告', exact: true }).click();

      fs.writeFileSync(file, '{invalid');
      await page.clock.fastForward(61_000);
      await expect(banner(updated.title)).toBeVisible();
      await page.reload();
      await dismissLaunchAnnouncement(page);
      await expect(banner(updated.title)).toBeVisible();
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('kaojiang-public-announcement-v1')).title), updated.title);

      write({ ...updated, enabled: false });
      await page.clock.fastForward(61_000);
      await expect(banner(updated.title)).toHaveCount(0);

      const long = { ...original, title: '考匠公告内容更新提醒'.repeat(6), body: '公告全文可上下滚动。\n'.repeat(100) };
      write(long);
      await page.setViewportSize({ width: 320, height: 740 });
      await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
      await page.clock.fastForward(61_000);
      await expect(banner(long.title)).toBeVisible();
      await banner(long.title).click();
      await expect(page.getByRole('heading', { name: long.title, exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: '关闭公告', exact: true })).toBeInViewport();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow on narrow screens');
      await shot('narrow-dark');
      await page.getByRole('button', { name: '关闭公告', exact: true }).click();
      assert.ok(publicRequests.length >= 4);
      assert.ok(publicRequests.every((headers) => !headers.authorization), 'public requests must not send account tokens');
      assert.deepEqual(errors, []);
      results.push({ engine, result: 'passed', freeAccount: true, liveRefreshWithoutReinstall: true,
        invalidContentCacheFallback: true, persistedCacheReload: true, remoteDisable: true,
        narrowScreenAndDarkMode: true, plainTextOnly: true, publicTokenFreeRequests: true });
      console.log(`${engine}: home/detail, live update, cached reload, remote disable, narrow dark layout passed`);
    } catch (error) {
      await shot('failure').catch(() => undefined);
      fs.writeFileSync(path.join(output, `${engine}-failure.txt`), await page.locator('body').innerText().catch(() => ''));
      throw error;
    } finally {
      await context.close();
      await browser.close();
      browser = null;
    }
  }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ version, results }, null, 2));
} finally {
  await browser?.close();
  await app.locals.stop();
  await new Promise((resolve) => server.close(resolve));
  store.db.close();
  assert.equal(path.dirname(dir), path.resolve(os.tmpdir()));
  assert.ok(path.basename(dir).startsWith('aceexam-announcement-e2e-'));
  fs.rmSync(dir, { recursive: true, force: true });
}
