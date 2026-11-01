import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { mobileModules, memoryStorage, deferred } from './mobile-fixture.js';

async function fixture(t) {
  const storage = memoryStorage(), load = await mobileModules(t, storage);
  const client = await load('client');
  const modules = { './client': client, './transport': await load('transport'),
    './resourceCache': await load('resourceCache'), '../version': await load('version') };
  const key = '__androidPoints_' + crypto.randomUUID(); globalThis[key] = modules;
  const original = globalThis.fetch;
  t.after(async () => { await client.clearSessionToken(); globalThis.fetch = original; delete globalThis[key]; });
  const url = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  const source = stripTypeScriptTypes(fs.readFileSync(new URL('../mobile/src/api/points.android.ts', import.meta.url), 'utf8'), { mode: 'transform' })
    .replace(/from ['"]([^'"]+)['"]/g, (_, name) => {
      assert.ok(modules[name]);
      const stub = Object.keys(modules[name]).map(n => `export const ${n}=globalThis[${JSON.stringify(key)}][${JSON.stringify(name)}][${JSON.stringify(n)}];`).join('\n');
      return `from ${JSON.stringify(url(stub))}`;
    });
  await client.setSessionToken('points-learner');
  return { client, storage, ...await import(url(source)) };
}
const response = data => new Response(JSON.stringify(data));

test('Android prices and operations send the current identity and use the authoritative service endpoints', async t => {
  const { androidPointsApi: api } = await fixture(t), requests = [];
  globalThis.fetch = async (url, init) => { requests.push({ url, init }); return response({ rows: [], models: [] }); };
  await api.services(); await api.operations(); await api.operations(undefined,40,'refunded');
  assert.ok(requests[0].url.endsWith('/account/points/services'));
  assert.ok(requests[1].url.endsWith('/account/points/operations?limit=20&state=all'));
  assert.ok(requests[2].url.endsWith('/account/points/operations?limit=20&state=refunded&offset=40'));
  assert.equal(requests[2].init.headers.Authorization, 'Bearer points-learner');
  assert.equal(requests[0].init.headers.Authorization, 'Bearer points-learner');
  assert.equal(requests[0].init.credentials, 'omit');
});

test('late points responses and 401 cannot leak the old account into a new session', async t => {
  const { androidPointsApi: api, client, storage } = await fixture(t);
  for (const status of [200, 401]) {
    const delayed = deferred(); globalThis.fetch = async () => delayed.promise;
    const pending = api.services(); const rejected = assert.rejects(pending, { name: 'CacheCancelledError' });
    await client.setSessionToken('new-account-' + status);
    delayed.resolve(new Response(JSON.stringify({ error: 'old data' }), { status })); await rejected;
    assert.equal(storage.values.get('kaojiang-session-token'), 'new-account-' + status);
  }
});

test('Android points network failure and cancellation remain retryable, and task labels are human-readable', async t => {
  const { androidPointsApi: api, pointUsageLabel } = await fixture(t);
  globalThis.fetch = async () => { throw new TypeError('offline'); };
  await assert.rejects(api.services(), /无法连接服务器/);
  globalThis.fetch = async (_url, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true });
  });
  const controller = new AbortController(), pending = api.services(controller.signal);
  controller.abort(); await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(pointUsageLabel('POST /api/ai/teacher', [{ taskType: 'question-hint' }, { taskType: 'hint-review' }]), '分步提示 + 提示审核');
});

test('the shared VIP screen and shared API never import the Android points UI or adapter', () => {
  for (const file of ['screens/VipScreen.tsx', 'api/client.ts']) {
    const source = fs.readFileSync(new URL('../mobile/src/' + file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /AiPointsPricing|points\.android/);
  }
});
