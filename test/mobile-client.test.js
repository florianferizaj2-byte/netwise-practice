import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mobileModules,
  memoryStorage,
  deferred,
  tick,
} from './mobile-fixture.js';

test('request timeout and cancellation release the fetch, and invalid JSON cannot masquerade as success', async (t) => {
  const load = await mobileModules(t, memoryStorage());
  const { fetchJson, ApiError } = await load('transport');
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  let aborted = 0;
  globalThis.fetch = async (_, { signal }) =>
    new Promise((_, reject) => {
      const stop = () => {
        aborted++;
        reject(new DOMException('aborted', 'AbortError'));
      };
      if (signal.aborted) stop();
      else signal.addEventListener('abort', stop, { once: true });
    });
  await assert.rejects(fetchJson('/test', {}, 15), /请求超时/);
  const controller = new AbortController();
  const cancelled = fetchJson('/test', { signal: controller.signal });
  controller.abort();
  await assert.rejects(cancelled, { name: 'AbortError' });
  assert.equal(aborted, 2);
  globalThis.fetch = async () => new Response('<html>proxy error</html>');
  await assert.rejects(
    fetchJson('/test'),
    (error) => error instanceof ApiError && error.status === 502,
  );
});

test('late logout and expired responses cannot clear a newly logged-in account', async (t) => {
  const storage = memoryStorage();
  const load = await mobileModules(t, storage);
  const { mobileApi, studyCache } = await load('client');
  const original = globalThis.fetch;
  t.after(async () => {
    await studyCache.setScope(null);
    globalThis.fetch = original;
  });
  const logout = deferred();
  const staleSettings = deferred();
  const response = (body) =>
    new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json' },
    });
  globalThis.fetch = async (url, init) => {
    const path = new URL(url).pathname;
    if (path === '/api/auth/login') {
      const { username } = JSON.parse(init.body);
      return response({
        sessionToken: `${username}-token`,
        user: { id: username, username, certificateId: 'hcia-datacom' },
        certificates: [],
      });
    }
    if (path === '/api/auth/logout') return logout.promise;
    if (path === '/api/settings') return staleSettings.promise;
    if (path === '/api/dashboard')
      return response({ owner: init.headers.Authorization });
    throw new Error(`Unexpected request: ${url}`);
  };
  await mobileApi.login('account-a', 'test-password');
  const oldSettings = mobileApi.settings();
  const rejected = assert.rejects(oldSettings, { name: 'CacheCancelledError' });
  const loggingOut = mobileApi.logout();
  await tick();
  await mobileApi.login('account-b', 'test-password');
  staleSettings.resolve(
    new Response(JSON.stringify({ error: 'expired' }), { status: 401 }),
  );
  logout.resolve(response({ loggedOut: true }));
  await rejected;
  await loggingOut;
  assert.equal(storage.values.get('kaojiang-session-token'), 'account-b-token');
  assert.equal(
    JSON.parse(storage.values.get('kaojiang-session-profile')).user.id,
    'account-b',
  );
  assert.equal((await mobileApi.dashboard()).owner, 'Bearer account-b-token');
});
