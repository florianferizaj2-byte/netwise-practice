import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mobileModules, memoryStorage } from './mobile-fixture.js';
import { checkMobileVersion } from '../scripts/check-mobile-version.mjs';

const root = new URL('../', import.meta.url);
const packageInfo = JSON.parse(fs.readFileSync(new URL('mobile/package.json', root), 'utf8'));

test('mobile display and update requests report the packaged release version', async (t) => {
  const load = await mobileModules(t, memoryStorage());
  const { APP_VERSION } = await load('version');
  assert.equal(APP_VERSION, packageInfo.version);
  const { mobileApi } = await load('client');
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    const endpoint = new URL(url);
    assert.equal(endpoint.pathname, '/api/mobile/version');
    assert.equal(endpoint.searchParams.get('version'), packageInfo.version);
    assert.equal(init.headers['X-App-Version'], packageInfo.version);
    return new Response(JSON.stringify({ currentVersion: packageInfo.version, latestVersion: packageInfo.version, minimumVersion: '0.2.8', updateAvailable: false, forceUpdate: false }), { headers: { 'Content-Type': 'application/json' } });
  };
  const release = await mobileApi.appVersion(APP_VERSION);
  assert.equal(release.currentVersion, packageInfo.version);
  assert.equal(release.updateAvailable, false);
  assert.equal(calls, 1);
});

test('release check rejects a stale native configuration or lockfile', (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'aceexam-mobile-version-'));
  const mobile = path.join(temporary, 'mobile');
  fs.mkdirSync(mobile);
  t.after(() => {
    assert.equal(path.dirname(temporary), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temporary).startsWith('aceexam-mobile-version-'));
    fs.rmSync(temporary, { recursive: true, force: true });
  });
  for (const name of ['app.json', 'app.config.js', 'package.json', 'package-lock.json']) {
    fs.copyFileSync(new URL(`mobile/${name}`, root), path.join(mobile, name));
  }
  assert.equal(checkMobileVersion(temporary).version, packageInfo.version);
  const app = JSON.parse(fs.readFileSync(path.join(mobile, 'app.json'), 'utf8'));
  const originalVersion = app.expo.version;
  app.expo.version = '0.0.0';
  fs.writeFileSync(path.join(mobile, 'app.json'), JSON.stringify(app));
  assert.throws(() => checkMobileVersion(temporary), /app.json.*不一致/);
  app.expo.version = originalVersion;
  fs.writeFileSync(path.join(mobile, 'app.json'), JSON.stringify(app));
  const lock = JSON.parse(fs.readFileSync(path.join(mobile, 'package-lock.json'), 'utf8'));
  lock.packages[''].version = '0.0.0';
  fs.writeFileSync(path.join(mobile, 'package-lock.json'), JSON.stringify(lock));
  assert.throws(() => checkMobileVersion(temporary), /lock root.*不一致/);
});
