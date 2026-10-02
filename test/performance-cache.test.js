import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.js';
import { createStore } from '../server/store.js';

test('question memory and user-scoped home results refresh on writes and after 30 seconds', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aceexam-performance-cache-'));
  const store = createStore(directory);
  let now = 1_000_000;
  const app = await createApp({ store, withFrontend: false, now: () => now });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}/api`;
  t.after(async () => {
    await app.locals.stop();
    await new Promise((resolve) => server.close(resolve));
    store.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const owner = store.register('cache_owner', 'test-password-123');
  const peer = store.register('cache_peer', 'test-password-123');
  for (const user of [owner, peer]) store.selectCertificate(user.id, 'network-engineer');
  const ownerToken = store.createAuthSession(owner.id);
  const peerToken = store.createAuthSession(peer.id);
  const get = async (route, token) => {
    const response = await fetch(origin + route, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    return data;
  };

  const firstQuestions = store.allQ();
  assert.strictEqual(store.allQ(), firstQuestions);
  const seed = firstQuestions.find((question) => question.certificates?.includes('network-engineer'));
  const extra = { ...seed, id: 'memory-cache-extra', question: `缓存核验：${seed.question}` };
  const initialCatalog = await get('/practice/catalog?summary=1', ownerToken);
  const fullCatalog = await get('/practice/catalog', ownerToken);
  assert.deepEqual(initialCatalog.chapters, fullCatalog.chapters.slice(0, 4).map(
    ({ name, questionCount, attemptedCount, progress }) =>
      ({ name, questionCount, attemptedCount, progress }),
  ));
  assert.ok(JSON.stringify(initialCatalog).length < JSON.stringify(fullCatalog).length);

  store.addQ(extra);
  assert.notStrictEqual(store.allQ(), firstQuestions);
  assert.equal((await get('/practice/catalog?summary=1', ownerToken)).total, initialCatalog.total + 1);
  assert.equal((await get('/questions?page=1&chapter=' + encodeURIComponent(extra.chapter), ownerToken)).total,
    firstQuestions.filter((question) => question.chapter === extra.chapter &&
      question.certificates?.includes('network-engineer') && question.source !== 'ai_generated').length + 1);

  const wrongQuestions = store.wrongQuestions;
  let wrongReads = 0;
  store.wrongQuestions = (...args) => { wrongReads += 1; return wrongQuestions(...args); };
  const first = await get('/dashboard?summary=1', ownerToken);
  assert.equal(wrongReads, 1);
  assert.deepEqual(await get('/dashboard?summary=1', ownerToken), first);
  assert.equal(wrongReads, 1);
  await get('/dashboard?summary=1', peerToken);
  assert.equal(wrongReads, 2, 'another account must compute its own summary');
  const answer = seed.answer || ['A'];
  store.recordAttempt(seed.id, answer, 1000, 'practice', owner.id);
  assert.equal((await get('/dashboard?summary=1', ownerToken)).totalCount, first.totalCount + 1);
  assert.equal(wrongReads, 3, 'an attempt must invalidate its own home result');
  await get('/dashboard?summary=1', peerToken);
  assert.equal(wrongReads, 3, 'another account should retain its cached result');
  now += 30_000;
  await get('/dashboard?summary=1', peerToken);
  assert.equal(wrongReads, 4, 'home result expires at 30 seconds');

  const secondQuestions = store.allQ();
  store.updateQuestion(extra.id, { question: '缓存核验：题目已修改' });
  assert.notStrictEqual(store.allQ(), secondQuestions);
  store.deleteQuestion(extra.id, owner.id);
  assert.equal((await get('/practice/catalog?summary=1', ownerToken)).total, initialCatalog.total);
});
