import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveMobileRelease } from '../server/mobile-release.js';
import { createApp } from '../server/index.js';
import { createStore } from '../server/store.js';

const current = JSON.parse(fs.readFileSync(new URL('../mobile/package.json', import.meta.url), 'utf8')).version;
const bundled = JSON.parse(fs.readFileSync(new URL('../server/mobile-release.json', import.meta.url), 'utf8'));
const compare = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); return x.map((value, i) => value - y[i]).find((value) => value !== 0) || 0; };

test('shipped download policy matches the APK version and cannot be downgraded by a preserved environment', () => {
  assert.equal(bundled.latestVersion, current);
  assert.equal(bundled.minimumVersion, current);
  const release = resolveMobileRelease({ MOBILE_LATEST_VERSION: '0.4.3', MOBILE_MINIMUM_VERSION: '0.4.3', MOBILE_DOWNLOAD_URL: '/downloads/kaojiang-v0.4.3.apk', MOBILE_RELEASE_NOTES: '旧公告' }, compare);
  assert.equal(release.latestVersion, current); assert.equal(release.minimumVersion, current);
  assert.equal(release.downloadUrl, `/downloads/kaojiang-v${current}.apk`); assert.notEqual(release.releaseNotes, '旧公告');
  const newer = resolveMobileRelease({ MOBILE_LATEST_VERSION: '9.0.0', MOBILE_MINIMUM_VERSION: '8.0.0', MOBILE_DOWNLOAD_URL: '/downloads/newer.apk' }, compare);
  assert.equal(newer.latestVersion, '9.0.0'); assert.equal(newer.minimumVersion, '8.0.0'); assert.equal(newer.downloadUrl, '/downloads/newer.apk');
});

test('all older mobile clients receive a forced update and 426; the current app and website remain available', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aceexam-release-policy-'));
  const store = createStore(dir);
  const app = await createApp({ store, withFrontend: false, authRequired: true });
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await app.locals.stop(); await new Promise((resolve) => server.close(resolve)); store.db.close();
    assert.equal(path.dirname(dir), path.resolve(os.tmpdir())); assert.ok(path.basename(dir).startsWith('aceexam-release-policy-'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  for (const version of ['0.0.1', '0.4.2', '0.4.3', '0.4.4']) {
    const info = await fetch(`${base}/mobile/version?version=${version}`).then((response) => response.json());
    assert.equal(info.forceUpdate, true); assert.equal(info.minimumVersion, current);
    const rejected = await fetch(`${base}/auth/me`, { headers: { 'X-Client': 'mobile', 'X-App-Version': version } });
    assert.equal(rejected.status, 426); assert.equal((await rejected.json()).downloadUrl, `/downloads/kaojiang-v${current}.apk`);
  }
  const info = await fetch(`${base}/mobile/version?version=${current}`).then((response) => response.json());
  assert.equal(info.forceUpdate, false);
  assert.equal((await fetch(`${base}/auth/me`, { headers: { 'X-Client': 'mobile', 'X-App-Version': current } })).status, 200);
  assert.equal((await fetch(`${base}/auth/me`)).status, 200);
});
