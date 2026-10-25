import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createStore } from '../server/store.js';
import { createApp } from '../server/index.js';
import { checkDeployment } from '../scripts/check-v1-deployment.mjs';

const parent = fs.realpathSync(os.tmpdir()), directory = fs.mkdtempSync(path.join(parent, 'v1-deploy-check-'));
const store = createStore(directory), user = store.register('deployment_fixture', 'synthetic-password-123');
store.selectCertificate(user.id, 'network-engineer');
const app = await createApp({ store, withFrontend: true, production: true, authRequired: true });
const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
try {
  const version = JSON.parse(fs.readFileSync('server/mobile-release.json', 'utf8')).latestVersion;
  const result = await checkDeployment({ baseUrl: `http://127.0.0.1:${server.address().port}`, sessionToken: store.createAuthSession(user.id),
    apk: path.resolve(`public/downloads/kaojiang-v${version}.apk`) });
  assert.equal(result.authenticatedApis, 'passed'); assert.equal(result.authenticatedChecks, 8);
  assert.equal(result.wholeApkHashChecked, true); assert.equal(result.externalModelCalls, 0);
  assert.equal(result.learningQuestionCount,10); assert.equal(result.mutationRequests,0);
  fs.mkdirSync('test-output', { recursive: true }); fs.writeFileSync('test-output/deployment-check-local.json', JSON.stringify(result, null, 2) + '\n');
  console.log('Deployment self-check: version contract, complete APK checksum, range download and 8 authenticated APIs passed locally; no external model calls.');
} finally {
  await app.locals.stop(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); store.db.close();
  assert.equal(path.dirname(fs.realpathSync(directory)), parent); assert.ok(path.basename(directory).startsWith('v1-deploy-check-'));
  fs.rmSync(directory, { recursive: true, force: true });
}
