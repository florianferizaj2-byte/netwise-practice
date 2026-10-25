import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { mobileModules, memoryStorage, deferred } from './mobile-fixture.js';

const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
const status = { userId: 'learner', certificateId: 'network-engineer', unlocked: true };

async function fixture(t) {
  const storage = memoryStorage();
  const load = await mobileModules(t, storage);
  const client = await load('client');
  const identities = [];
  const modules = {
    './client': client,
    './transport': await load('transport'),
    './resourceCache': await load('resourceCache'),
    './studyTypes': await load('studyTypes'),
    '../version': await load('version'),
    '../../modules/route-player/index.android': {
      async updateRoutePlayerIdentity(identity) { identities.push(identity); },
    },
  };
  const key = `__locationTest_${crypto.randomUUID()}`;
  globalThis[key] = modules;
  const originalFetch = globalThis.fetch;
  const originalInvalidate = client.studyCache.invalidate;
  t.after(async () => {
    await client.clearSessionToken();
    client.studyCache.invalidate = originalInvalidate;
    globalThis.fetch = originalFetch;
    delete globalThis[key];
  });
  const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  const source = stripTypeScriptTypes(fs.readFileSync(
    new URL('../mobile/src/api/locationLearning.android.ts', import.meta.url), 'utf8',
  ), { mode: 'transform' }).replace(/from ['"]([^'"]+)['"]/g, (_, name) => {
    assert.ok(modules[name], `Unexpected platform adapter dependency: ${name}`);
    const stub = Object.keys(modules[name]).map((exportName) =>
      `export const ${exportName}=globalThis[${JSON.stringify(key)}][${JSON.stringify(name)}][${JSON.stringify(exportName)}];`,
    ).join('\n');
    return `from ${JSON.stringify(moduleUrl(stub))}`;
  });
  const { locationLearningApi: api } = await import(moduleUrl(source));
  await client.setSessionToken('learner-token');
  return { api, client, identities, storage };
}

test('Android adapter requires a session and completed daily study before issuing native credentials', async (t) => {
  const { api, client, identities } = await fixture(t);
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(new URL(url).pathname);
    return response({ ...status, unlocked: false });
  };
  await assert.rejects(api.locationLearningOpenCredentials(), /30 道/);
  assert.deepEqual(requests, ['/api/location-learning']);
  assert.deepEqual(identities, []);
  await client.clearSessionToken();
  await assert.rejects(api.locationLearningStatus(), (error) => error.status === 401);
  assert.equal(requests.length, 1);
});

test('Android credentials carry the real bearer/version and logout immediately revokes the native identity', async (t) => {
  const { api, client, identities } = await fixture(t);
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ path: new URL(url).pathname, init });
    return response(url.endsWith('/permit') ? { permit: 'fixture-permit' } : status);
  };
  const credentials = await api.locationLearningOpenCredentials();
  assert.equal(credentials.sessionToken, 'learner-token');
  assert.equal(credentials.permit, 'fixture-permit');
  assert.ok(credentials.appVersion);
  assert.equal(requests[1].init.method, 'POST');
  assert.equal(requests[1].init.headers.Authorization, 'Bearer learner-token');
  assert.equal(requests[1].init.headers['X-App-Version'], credentials.appVersion);
  assert.deepEqual(identities, ['learner:network-engineer']);
  await client.clearSessionToken();
  assert.deepEqual(identities, ['learner:network-engineer', null]);
});

test('existing certificate switching revokes Android access without changing the shared auth flow', async (t) => {
  const { api, client, identities } = await fixture(t);
  globalThis.fetch = async (url) => {
    if (url.endsWith('/auth/certificate')) return response({ user: {
      id: 'learner', username: 'learner', certificateId: 'hcia-datacom',
    } });
    return response(url.endsWith('/permit') ? { permit: 'fixture-permit' } : status);
  };
  await api.locationLearningOpenCredentials();
  await client.mobileApi.selectCertificate('hcia-datacom');
  assert.deepEqual(identities, ['learner:network-engineer', null]);
});

test('a late old-session permit or 401 cannot grant access or clear a new account', async (t) => {
  const { api, client, identities, storage } = await fixture(t);
  const permit = deferred(), started = deferred();
  globalThis.fetch = async (url) => {
    if (url.endsWith('/permit')) { started.resolve(); return permit.promise; }
    return response(status);
  };
  const opening = api.locationLearningOpenCredentials();
  const rejected = assert.rejects(opening, { name: 'CacheCancelledError' });
  await started.promise;
  await client.setSessionToken('new-account-token');
  permit.resolve(response({ permit: 'old-permit' }));
  await rejected;
  assert.deepEqual(identities, []);
  const oldRequest = deferred();
  globalThis.fetch = async () => oldRequest.promise;
  const pending = api.locationLearningStatus();
  const cancelled = assert.rejects(pending, { name: 'CacheCancelledError' });
  await client.setSessionToken('newer-account-token');
  oldRequest.resolve(response({ error: 'expired' }, 401));
  await cancelled;
  assert.equal(storage.values.get('kaojiang-session-token'), 'newer-account-token');
});

test('Android answer responses and lost responses invalidate normal study statistics, not later-account caches', async (t) => {
  const { api, client } = await fixture(t);
  const invalidated = [];
  client.studyCache.invalidate = (paths) => invalidated.push(paths);
  globalThis.fetch = async () => response(status);
  await api.locationLearningAction('session', 'answer', { selected: ['B'] });
  assert.ok(invalidated[0].includes('/wrong'));
  assert.ok(invalidated[0].includes('/practice/catalog'));
  globalThis.fetch = async () => { throw new Error('connection lost'); };
  await assert.rejects(api.locationLearningAction('session', 'answer', {}), /connection lost/);
  assert.equal(invalidated.length, 2);
  const delayed = deferred();
  globalThis.fetch = async () => delayed.promise;
  const pending = api.locationLearningAction('session', 'answer', {});
  const cancelled = assert.rejects(pending, { name: 'CacheCancelledError' });
  await client.setSessionToken('another-account');
  delayed.resolve(response(status));
  await cancelled;
  assert.equal(invalidated.length, 2);
});

test('Web/shared entrypoints do not import the Android gate or adapter and the Web bridge remains unavailable', async () => {
  for (const file of [
    'src/components/RoutePlayerChapter.tsx', 'src/screens/PracticeHubScreen.tsx',
    'src/api/client.ts', 'modules/route-player/index.ts', 'modules/route-player/index.web.ts',
  ]) {
    const source = fs.readFileSync(new URL(`../mobile/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /(?:import|from).*?(?:LocationLearningGate|locationLearning\.android|index\.android)/);
    assert.doesNotMatch(source, /openAfterStudy|setLearningIdentity/);
  }
  const source = stripTypeScriptTypes(fs.readFileSync(
    new URL('../mobile/modules/route-player/index.web.ts', import.meta.url), 'utf8',
  ), { mode: 'transform' });
  const web = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  assert.equal(web.routePlayerAvailable(), false);
  await assert.rejects(web.openRoutePlayer(), /安卓版/);
});
