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
  assert.equal(bundled.minimumVersion, '1.0.1');
  assert.ok(compare(bundled.minimumVersion,current)<=0);
  const release = resolveMobileRelease({ MOBILE_LATEST_VERSION: '0.4.3', MOBILE_MINIMUM_VERSION: '0.4.3', MOBILE_DOWNLOAD_URL: '/downloads/kaojiang-v0.4.3.apk', MOBILE_RELEASE_NOTES: '旧公告' }, compare);
  assert.equal(release.latestVersion, current); assert.equal(release.minimumVersion, bundled.minimumVersion);
  assert.equal(release.downloadUrl, `/downloads/kaojiang-v${current}.apk`); assert.notEqual(release.releaseNotes, '旧公告');
  const newer = resolveMobileRelease({ MOBILE_LATEST_VERSION: '9.0.0', MOBILE_MINIMUM_VERSION: '8.0.0', MOBILE_DOWNLOAD_URL: '/downloads/newer.apk' }, compare);
  assert.equal(newer.latestVersion, '9.0.0'); assert.equal(newer.minimumVersion, '8.0.0'); assert.equal(newer.downloadUrl, '/downloads/newer.apk');
});

test('clients below the minimum receive 426; supported v1.0.1 is optional and the current app and website remain available', async (t) => {
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
  for (const version of ['0.0.1', '0.4.2', '0.4.3', '0.4.4', '0.4.5', '1.0.0']) {
    const info = await fetch(`${base}/mobile/version?version=${version}`).then((response) => response.json());
    assert.equal(info.forceUpdate, true); assert.equal(info.minimumVersion, bundled.minimumVersion);
    const rejected = await fetch(`${base}/auth/me`, { headers: { 'X-Client': 'mobile', 'X-App-Version': version } });
    assert.equal(rejected.status, 426); assert.equal((await rejected.json()).downloadUrl, `/downloads/kaojiang-v${current}.apk`);
  }
  const supported = await fetch(`${base}/mobile/version?version=1.0.1`).then(response=>response.json());
  assert.equal(supported.forceUpdate,false);assert.equal(supported.updateAvailable,true);assert.equal(supported.latestVersion,current);
  assert.equal((await fetch(`${base}/auth/me`,{headers:{'X-Client':'mobile','X-App-Version':'1.0.1'}})).status,200);
  const info = await fetch(`${base}/mobile/version?version=${current}`).then((response) => response.json());
  assert.equal(info.forceUpdate, false);
  assert.equal((await fetch(`${base}/auth/me`, { headers: { 'X-Client': 'mobile', 'X-App-Version': current } })).status, 200);
  assert.equal((await fetch(`${base}/auth/me`)).status, 200);
  const browserHeaders = { 'X-Client':'mobile', 'X-App-Version':'0.4.5', 'User-Agent':'Mozilla/5.0 (Linux; Android)', 'Sec-Fetch-Dest':'empty' };
  assert.equal((await fetch(`${base}/auth/me`, {headers:browserHeaders})).status, 200);
  const browserInfo = await fetch(`${base}/mobile/version?version=0.4.5`, {headers:browserHeaders}).then(r=>r.json());
  assert.equal(browserInfo.forceUpdate, false); assert.equal(browserInfo.updateAvailable, false);
  // Explicit native transport in the Android browser harness keeps the APK gate.
  const nativeHeaders = {...browserHeaders, 'X-App-Platform':'android'};
  assert.equal((await fetch(`${base}/auth/me`, {headers:nativeHeaders})).status, 426);
  assert.equal((await fetch(`${base}/mobile/version?version=0.4.5`, {headers:nativeHeaders}).then(r=>r.json())).forceUpdate, true);
  assert.equal((await fetch(`${base}/account/points/wallet`, {headers:browserHeaders})).status, 401,
    'Browser compatibility must not bypass authentication');
});


test('a matching latest-version override cannot silently retain an older named APK download',()=>{
 const release=resolveMobileRelease({MOBILE_LATEST_VERSION:current,MOBILE_DOWNLOAD_URL:'/downloads/kaojiang-v1.0.3.apk',MOBILE_RELEASE_NOTES:'stale notes'},compare);
 assert.equal(release.downloadUrl,`/downloads/kaojiang-v${current}.apk`);assert.notEqual(release.releaseNotes,'stale notes');assert.equal(release.apkSha256,bundled.apkSha256);
});
