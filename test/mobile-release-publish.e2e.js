import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createApp } from '../server/index.js';
import { createStore } from '../server/store.js';
import { getReleaseTarget } from '../scripts/release-checks.mjs';

const policy = JSON.parse(fs.readFileSync(new URL('../server/mobile-release.json', import.meta.url), 'utf8'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aceexam-publish-check-'));
const store = createStore(dir);
const app = await createApp({ store, withFrontend: true, production: true, authRequired: true });
const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const out = path.resolve('test-output/publish'); fs.mkdirSync(out, { recursive: true });
let browser;
try {
  const file = await fetch(base + policy.downloadUrl);
  assert.equal(file.status, 200);
  assert.match(file.headers.get('content-type'), /android|octet-stream/);
  const apk = Buffer.from(await file.arrayBuffer());
  assert.equal(apk.length, fs.statSync(path.resolve('public', '.' + policy.downloadUrl)).size);
  assert.equal(crypto.createHash('sha256').update(apk).digest('hex'), policy.apkSha256);
  const range = await fetch(base + policy.downloadUrl, { headers: { Range: 'bytes=0-1023' } });
  assert.equal(range.status, 206);
  assert.equal((await range.arrayBuffer()).byteLength, 1024);
  const old = await fetch(`${base}/api/mobile/version?version=0.4.5`).then((response) => response.json());
  assert.equal(old.forceUpdate, true); assert.equal(old.minimumVersion, policy.minimumVersion);
  assert.equal((await fetch(`${base}/api/mobile/version?version=${policy.latestVersion}`).then((response) => response.json())).forceUpdate, false);
  if (getReleaseTarget(process.cwd()) !== 'android')
    assert.equal((await fetch(`${base}/app/version.json`).then((response) => response.json())).version, policy.latestVersion);
  else assert.equal(fs.existsSync(path.resolve('dist/app')), false, 'Deferred mobile website must not be bundled');
  browser = await chromium.launch({ headless: true, proxy: { server: 'http://127.0.0.1:9', bypass: '127.0.0.1,localhost' } });
  const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/?desktop=1#downloads`);
  const dismiss = page.getByRole('button', { name: '知道了，开始学习', exact: true });
  if (await dismiss.isVisible()) await dismiss.click();
  const link = page.locator(`a[href$="${policy.downloadUrl}"]`).first();
  await expect(link).toBeVisible();
  await expect(page.getByText(`当前版本 v${policy.latestVersion} · APK 安装包`, { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(out, 'download-page.png'), fullPage: true });
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ version: policy.latestVersion, minimumVersion: policy.minimumVersion,
    apkBytes: apk.length, apkSha256: policy.apkSha256, downloadPage: 'passed', rangeDownload: 'passed', forcedUpdate: 'passed' }, null, 2));
  console.log('Website download link, complete APK bytes/hash, range downloads and forced-update metadata passed.');
} finally {
  await browser?.close(); await app.locals.stop(); await new Promise((resolve) => server.close(resolve)); store.db.close();
  assert.equal(path.dirname(dir), path.resolve(os.tmpdir())); assert.ok(path.basename(dir).startsWith('aceexam-publish-check-'));
  fs.rmSync(dir, { recursive: true, force: true });
}
