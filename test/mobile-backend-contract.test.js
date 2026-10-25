import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../server/store.js';
import { createApp } from '../server/index.js';

test('Android 0.4.8 account, points and learning APIs work over authenticated HTTP without external models', async t => {
  const parent = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(parent, 'ace-mobile-contract-'));
  const store = createStore(directory);
  const owner = store.register('mobile_contract_owner', 'synthetic-password-123');
  const learner = store.register('mobile_contract_learner', 'synthetic-password-123');
  for (const user of [owner, learner]) store.selectCertificate(user.id, 'network-engineer');
  // This money exists only in a disposable test database, never in user data.
  store.points.recordFinance({ key: 'synthetic-contract-income', kind: 'revenue', amountMicros: 1000000000,
    reference: 'synthetic contract fixture, no actual payment', createdBy: owner.id });
  for (const [user, units] of [[owner, 20000], [learner, 7000]])
    store.points.grant({ userId: user.id, sourceKey: 'synthetic-contract-grant', units, kind: 'test-only', requireFunded: true });
  const app = await createApp({ store, withFrontend: false, authRequired: true, accountSecurity: { enabled: false } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await app.locals.stop(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); store.db.close();
    assert.equal(path.dirname(fs.realpathSync(directory)), parent);
    assert.ok(path.basename(directory).startsWith('ace-mobile-contract-'));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const tokens = new Map([owner, learner].map(user => [user.id, store.createAuthSession(user.id)]));
  const request = async (url, user = owner, body) => {
    const response = await fetch(base + url, { method: body === undefined ? 'GET' : 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Client': 'mobile', 'X-App-Version': '0.4.8',
        ...(user ? { Authorization: 'Bearer ' + tokens.get(user.id) } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json(); return { status: response.status, data };
  };
  await t.test('wallet and entitlements match the current Android payload and isolate accounts', async () => {
    const entitlements = await request('/account/entitlements');
    assert.equal(entitlements.status, 200); assert.equal(entitlements.data.billingMode, 'points');
    const wallet = await request('/account/points/wallet');
    assert.equal(wallet.status, 200); assert.equal(wallet.data.wallet.scale, 1000);
    assert.equal(wallet.data.wallet.availableUnits, 20000);
    assert.equal(wallet.data.wallet.availableUnits, entitlements.data.points.availableUnits);
    assert.equal((await request('/account/points/wallet', learner)).data.wallet.availableUnits, 7000);
  });
  await t.test('service estimates, operations and receipts use their real server routes', async () => {
    const services = await request('/account/points/services');
    assert.equal(services.status, 200); assert.equal(services.data.billingMode, 'actual-usage');
    assert.equal(services.data.scale, 1000); assert.ok(Array.isArray(services.data.models));
    const operations = await request('/account/points/operations?limit=20');
    assert.equal(operations.status, 200); assert.ok(Array.isArray(operations.data.rows)); assert.ok(Array.isArray(operations.data.calls));
    const receipt = await request('/account/points/receipt?requestId=' + crypto.randomUUID());
    assert.equal(receipt.status, 200); assert.equal(receipt.data.found, false); assert.equal(receipt.data.chargedUnits, 0);
    assert.equal((await request('/account/points/receipt?requestId=invalid')).status, 400);
  });
  await t.test('check-in grants once, returns the wallet and never changes another account', async () => {
    const first = await request('/account/check-in', owner, {});
    assert.equal(first.status, 200); assert.equal(first.data.claimed, true); assert.equal(first.data.checkIn.claimed, true);
    assert.equal(first.data.points.availableUnits, 25000);
    const second = await request('/account/check-in', owner, {});
    assert.equal(second.status, 200); assert.equal(second.data.claimed, false); assert.equal(second.data.points.availableUnits, 25000);
    assert.equal((await request('/account/points/wallet', learner)).data.wallet.availableUnits, 7000);
    assert.equal((await request('/account/redeem', owner, { code: 'synthetic-invalid-code' })).status, 400);
  });
  await t.test('security and gated learning are mounted; administrative routes reject ordinary accounts', async () => {
    assert.equal((await request('/auth/security')).status, 200);
    assert.equal((await request('/location-learning')).status, 200);
    assert.equal((await request('/location-learning/permit', owner, {})).status, 403);
    assert.equal((await request('/admin/points/usage', learner)).status, 403);
    assert.equal((await request('/admin/ai-services', learner)).status, 403);
    assert.equal((await request('/admin/points/usage')).status, 200);
    assert.equal((await request('/admin/ai-services')).status, 200);
  });
  await t.test('missing or expired sessions never return a wallet', async () => {
    assert.equal((await request('/account/points/wallet', null)).status, 401);
    assert.equal((await request('/auth/logout', learner, {})).status, 200);
    assert.equal((await request('/account/points/wallet', learner)).status, 401);
    assert.equal(store.points.audit().passed, true);
  });
});
