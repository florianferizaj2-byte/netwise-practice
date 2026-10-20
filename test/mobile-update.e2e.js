// Runs against the actual built mobile shell and a temporary local database.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createApp } from '../server/index.js';
import { createStore } from '../server/store.js';

const policy = JSON.parse(fs.readFileSync(new URL('../server/mobile-release.json', import.meta.url), 'utf8'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aceexam-optional-update-'));
const store = createStore(dir);
const backend = await createApp({ store, withFrontend: true, production: true, authRequired: true });
const app = express();
let mode = 'optional';
let checks = 0;
app.get('/api/mobile/version', (_req, res) => {
  checks++;
  if (mode === 'failure') return res.status(503).json({ error: '测试网络故障' });
  res.json({ ...policy, currentVersion: mode === 'forced' ? '0.4.2' : '0.4.7',
    forceUpdate: mode === 'forced', updateAvailable: mode !== 'current' });
});
app.get('/api/mobile/announcement', (_req, res) => res.json({ schemaVersion: 1, id: 'update-test', enabled: false, title: '更新验证', body: '测试时停用公告', updatedAt: '2026-10-20T00:00:00.000Z' }));
app.use(backend);
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const out = path.resolve('test-output/mobile-update'); fs.mkdirSync(out, { recursive: true });
let browser;
try {
  browser = await chromium.launch({ headless: true, proxy: { server: 'http://127.0.0.1:9', bypass: '127.0.0.1,localhost' } });
  const page = await browser.newPage({ viewport: { width: 360, height: 640 }, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  const open = () => page.goto(`${base}/app/`);
  const continueButton = page.getByRole('button', { name: '继续使用旧版本', exact: true });
  await open();
  await expect(page.getByText('发现新版本', { exact: true })).toBeVisible();
  await expect(continueButton).toBeVisible();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(out, 'optional-update.png'), fullPage: true });
  await continueButton.click();
  await expect(page.getByText('欢迎回来', { exact: true })).toBeVisible();
  await page.reload();
  await expect(continueButton).toBeVisible(); // No permanent dismissal flag.
  await continueButton.click();
  await page.getByPlaceholder('输入账号', { exact: true }).fill('preserved-startup-input');
  const beforeResume = checks;
  for (const visibility of ['hidden', 'visible']) {
    await page.evaluate((value) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value });
      document.dispatchEvent(new Event('visibilitychange'));
    }, visibility);
  }
  await expect(continueButton).toBeVisible();
  assert.ok(checks > beforeResume);
  await continueButton.click();
  await expect(page.getByPlaceholder('输入账号', { exact: true })).toHaveValue('preserved-startup-input');

  mode = 'forced';
  await page.reload();
  await expect(page.getByText('请更新到最新版', { exact: true })).toBeVisible();
  await expect(continueButton).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByText('请更新到最新版', { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(out, 'required-update.png'), fullPage: true });
  mode = 'failure';
  await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/mobile/version') && response.status() === 503),
    page.getByRole('button', { name: '重新检查版本', exact: true }).click(),
  ]);
  await expect(page.getByText('请更新到最新版', { exact: true })).toBeVisible();
  mode = 'current';
  await page.getByRole('button', { name: '重新检查版本', exact: true }).click();
  await expect(page.getByText('请更新到最新版', { exact: true })).toHaveCount(0);

  mode = 'failure';
  await page.reload();
  await expect(page.getByText('欢迎回来', { exact: true })).toBeVisible();
  await expect(continueButton).toHaveCount(0);
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ optionalDismiss: true, repeatAfterReload: true,
    repeatAfterResume: true, underlyingScreenPreserved: true, requiredNotDismissible: true, retry: true,
    networkFailOpen: true, viewport: '360x640', nativeInstaller: 'not device tested' }, null, 2));
  console.log('Optional update dismissal, next launch/resume reminders, required update, retry and network fallback passed.');
} finally {
  await browser?.close(); await backend.locals.stop();
  await new Promise((resolve) => server.close(resolve)); store.db.close();
  assert.equal(path.dirname(dir), path.resolve(os.tmpdir())); assert.ok(path.basename(dir).startsWith('aceexam-optional-update-'));
  fs.rmSync(dir, { recursive: true, force: true });
}
