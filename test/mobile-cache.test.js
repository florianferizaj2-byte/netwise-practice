import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mobileModules,
  memoryStorage,
  deferred,
  tick,
} from './mobile-fixture.js';

async function fixture(t) {
  const storage = memoryStorage();
  const load = await mobileModules(t, storage);
  const { ResourceCache, CacheCancelledError } = await load('resourceCache');
  const { studyCachePolicy, persistentStudyData } = await load('cachePolicy');
  let now = 1_000_000;
  const cache = new ResourceCache(
    storage,
    studyCachePolicy,
    persistentStudyData,
    () => now,
  );
  await cache.setScope('server/account-a/certificate-a');
  t.after(() => cache.setScope(null));
  return {
    cache,
    storage,
    load,
    ResourceCache,
    CacheCancelledError,
    studyCachePolicy,
    persistentStudyData,
    advance: (ms) => {
      now += ms;
    },
  };
}

test('mobile cache deduplicates requests, serves fresh data, revalidates stale data without blanking the screen', async (t) => {
  const { cache, advance } = await fixture(t);
  let calls = 0;
  const pending = deferred();
  const loader = () => {
    calls++;
    return pending.promise;
  };
  const first = cache.read('/wrong', loader);
  const second = cache.read('/wrong', loader);
  await tick();
  assert.equal(calls, 1);
  pending.resolve([{ id: 'q1' }]);
  assert.deepEqual(await first, await second);
  await cache.read('/wrong', () => {
    throw new Error('must remain fresh');
  });
  advance(31_000);
  const refresh = deferred();
  assert.deepEqual(await cache.read('/wrong', () => refresh.promise), [
    { id: 'q1' },
  ]);
  assert.equal(cache.snapshot('/wrong').fetching, true);
  refresh.reject(new Error('offline'));
  await tick();
  assert.equal(cache.snapshot('/wrong').error.message, 'offline');
  assert.deepEqual(cache.snapshot('/wrong').data, [{ id: 'q1' }]);
  advance(10 * 60_000);
  await assert.rejects(
    cache.read('/wrong', () => Promise.reject(new Error('offline'))),
    /offline/,
  );
  assert.equal(cache.snapshot('/wrong').data, undefined);
});

test('mutations and scope changes cannot be overwritten by earlier responses', async (t) => {
  const { cache, CacheCancelledError } = await fixture(t);
  const old = deferred();
  const oldRead = cache.read('/wrong', () => old.promise, true);
  const rejected = assert.rejects(oldRead, CacheCancelledError);
  await tick();
  cache.invalidate(['/wrong']);
  assert.deepEqual(await cache.read('/wrong', async () => ['updated'], true), [
    'updated',
  ]);
  old.resolve(['stale']);
  await rejected;
  assert.deepEqual(cache.snapshot('/wrong').data, ['updated']);

  const previousAccount = deferred();
  const oldAccountRead = cache.read(
    '/favorites',
    () => previousAccount.promise,
  );
  const cancelled = assert.rejects(oldAccountRead, CacheCancelledError);
  await tick();
  await cache.setScope('server/account-b/certificate-a');
  previousAccount.resolve(['account-a-private-data']);
  await cancelled;
  assert.equal(cache.snapshot('/favorites').data, undefined);
  assert.equal(cache.snapshot('/wrong').data, undefined);
});

test('only allowlisted study data survives a restart; secrets, private AI questions, chat and wrong answers never persist', async (t) => {
  const {
    cache,
    storage,
    ResourceCache,
    studyCachePolicy,
    persistentStudyData,
  } = await fixture(t);
  const key = '/questions?page=1&limit=40&offset=0';
  const question = {
    id: 'q1',
    type: 'single_choice',
    question: 'Question',
    options: { A: 'One' },
    source: 'original',
    apiKey: 'secret',
    answer: ['A'],
    analysis: 'private',
    expectedAnswer: 'private',
    ownerUserId: 'private',
  };
  await cache.read(key, async () => ({
    items: [question],
    total: 1,
    nextOffset: null,
  }));
  for (const path of [
    '/settings',
    '/community/messages',
    '/wrong',
    '/favorites',
    '/auth/me',
  ])
    await cache.read(path, async () => ({ secret: 'private-value' }));
  await cache.read('/questions?page=1&limit=40&offset=40', async () => ({
    items: [{ ...question, source: 'ai_generated' }],
    total: 1,
    nextOffset: null,
  }));
  await cache.flush();
  const disk = storage.values.get('kaojiang-study-cache-v1');
  assert.ok(disk.includes('Question'));
  assert.doesNotMatch(
    disk,
    /secret|private|apiKey|answer|analysis|ai_generated/,
  );
  const restored = new ResourceCache(
    storage,
    studyCachePolicy,
    persistentStudyData,
    () => 1_010_000,
  );
  await restored.setScope('server/account-a/certificate-a');
  assert.equal(restored.snapshot(key).data.items[0].id, 'q1');
  assert.equal(restored.snapshot('/wrong').data, undefined);
  await restored.setScope('server/account-a/certificate-b');
  assert.equal(restored.snapshot(key).data, undefined);
  assert.equal(storage.values.has('kaojiang-study-cache-v1'), false);
  await restored.setScope(null);
});

test('cache disk is bounded, handles corrupt and expired data, and clear wins over queued writes', async (t) => {
  const {
    cache,
    storage,
    ResourceCache,
    studyCachePolicy,
    persistentStudyData,
  } = await fixture(t);
  for (let i = 0; i < 100; i++) {
    await cache.read(`/questions?page=1&offset=${i}`, async () => ({
      items: [
        { id: `q${i}`, question: '题'.repeat(25_000), source: 'original' },
      ],
      total: 100,
      nextOffset: null,
    }));
  }
  await cache.flush();
  const raw = storage.values.get('kaojiang-study-cache-v1');
  assert.ok(raw.length * 3 <= 1536 * 1024);
  assert.ok(JSON.parse(raw).entries.length <= 24);
  const expired = new ResourceCache(
    storage,
    studyCachePolicy,
    persistentStudyData,
    () => 1_000_000 + 8 * 86400_000,
  );
  await expired.setScope('server/account-a/certificate-a');
  assert.equal(expired.snapshot('/questions?page=1&offset=99').data, undefined);
  await cache.clear();
  await cache.flush();
  assert.equal(
    JSON.parse(storage.values.get('kaojiang-study-cache-v1')).entries.length,
    0,
  );
  storage.values.set('kaojiang-study-cache-v1', 'not json');
  const corrupt = new ResourceCache(
    storage,
    studyCachePolicy,
    persistentStudyData,
  );
  await corrupt.setScope('server/account-a/certificate-a');
  assert.equal(storage.values.has('kaojiang-study-cache-v1'), false);
});

test('storage failures do not break network reads', async (t) => {
  const { load } = await fixture(t);
  const { ResourceCache } = await load('resourceCache');
  const failure = async () => {
    throw new Error('disk full');
  };
  const cache = new ResourceCache(
    { getItem: failure, setItem: failure, removeItem: failure },
    () => ({ freshMs: 100, retainMs: 1000, persist: true }),
    (_, data) => data,
  );
  await cache.setScope('account-a');
  assert.equal(await cache.read('/data', async () => 'online'), 'online');
  await cache.flush();
  await cache.setScope(null);
});

test('community merge deduplicates concurrent sends and polling with a stable cursor order', async (t) => {
  const { load } = await fixture(t);
  const { mergeMessages } = await load('communityMessages');
  const a = { id: 'a', createdAt: '2026-09-25T10:00:00Z', text: 'before' };
  const b = { ...a, id: 'b' };
  assert.deepEqual(
    mergeMessages([b, a], [{ ...a, text: 'after' }]).map((message) => [
      message.id,
      message.text,
    ]),
    [
      ['a', 'after'],
      ['b', 'before'],
    ],
  );
});
