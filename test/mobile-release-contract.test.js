import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { createStore } from '../server/store.js';
import { createApp } from '../server/index.js';
import { mobileBackendContract } from '../server/mobile-contract.js';

const loadPure = async file => import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(fs.readFileSync(new URL('../mobile/src/' + file, import.meta.url), 'utf8'))).toString('base64'));

test('v1 clients identify missing backend capabilities without inventing a successful connection', async () => {
  const { backendConnectionNotice } = await loadPure('api/backendContract.ts');
  assert.match(backendConnectionNotice({}), /服务端尚未/);
  assert.match(backendConnectionNotice({ backend: { version: '1.0.0', apiRevision: 1, capabilities: ['points-v1'] } }), /服务端尚未/);
  const app = { router: { stack: [] } };
  assert.deepEqual(mobileBackendContract(app).capabilities, []);
});

test('the real public version endpoint advertises only mounted v1 capabilities', async t => {
  const parent = fs.realpathSync(os.tmpdir()), directory = fs.mkdtempSync(path.join(parent, 'v1-contract-'));
  const store = createStore(directory), app = await createApp({ store, withFrontend: false, authRequired: true });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await app.locals.stop(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); store.db.close();
    assert.equal(path.dirname(fs.realpathSync(directory)), parent); assert.ok(path.basename(directory).startsWith('v1-contract-')); fs.rmSync(directory, { recursive: true, force: true }); });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/mobile/version?version=1.0.1`);
  assert.equal(response.status, 200); const release = await response.json();
  assert.equal(release.latestVersion, '1.0.1'); assert.equal(release.forceUpdate, false);
  assert.equal(release.backend.version, '1.0.1'); assert.equal(release.backend.apiRevision, 1);
  const { backendConnectionNotice } = await loadPure('api/backendContract.ts'); assert.equal(backendConnectionNotice(release), '');
  assert.deepEqual(release.backend.capabilities.sort(), ['account-security-v1', 'learning-gate-v1', 'points-v1']);
});

test('APK install preflight rejects errors, HTML, empty/truncated files and corrupted downloads', async () => {
  const { validateApkDownload } = await loadPure('updateIntegrity.ts');
  const digest = 'a'.repeat(32), file = { status: 200, mimeType: 'application/vnd.android.package-archive', size: 4096, md5: digest };
  assert.doesNotThrow(() => validateApkDownload(file, { bytes: 4096, md5: digest.toUpperCase() }));
  assert.throws(() => validateApkDownload({ ...file, status: 404 }), /下载失败/);
  assert.throws(() => validateApkDownload({ ...file, mimeType: 'text/html; charset=utf-8' }), /不是 Android/);
  assert.throws(() => validateApkDownload({ ...file, size: 0 }), /不完整/);
  assert.throws(() => validateApkDownload(file, { bytes: 8192 }), /不完整/);
  assert.throws(() => validateApkDownload(file, { md5: 'b'.repeat(32) }), /校验未通过/);
});
