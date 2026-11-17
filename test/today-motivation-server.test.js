import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../server/index.js';
import { createStore } from '../server/store.js';
import { classifyTodayMotivation, selectTodayMotivation, todayMotivationCatalog } from '../server/today-motivation.js';

const now = Date.parse('2026-11-17T09:00:00+08:00');
const day = 86_400_000;
const certificateId = 'network-engineer';
let nextId = 0;
function answer(questionId, { correct = true, timeMs = 12000, at = now - 1000, ...other } = {}) {
  return { id: String(++nextId), questionId, correct, selected: ['A'], mode: 'practice', timeMs,
    certificateId, createdAt: new Date(at).toISOString(), ...other };
}
function batch(count, correct, { ago = 0, timeMs, ...other } = {}) {
  return Array.from({ length: count }, (_, i) => answer(`same-bank-${i}`, {
    correct: i < correct, timeMs, at: now - ago * day - (i + 1) * 60_000, ...other,
  }));
}
const classify = (attempts, options) => classifyTodayMotivation(attempts, { now, certificateId, ...options });

test('the server catalog contains 56 short lines, with no duplicates even after punctuation removal', () => {
  assert.equal(Object.keys(todayMotivationCatalog).length, 7);
  assert.ok(Object.values(todayMotivationCatalog).every(group => group.length === 8));
  const lines = Object.values(todayMotivationCatalog).flat();
  assert.equal(lines.length, 56);
  assert.ok(lines.every(line => Array.from(line).length <= 9));
  assert.equal(new Set(lines.map(line => line.normalize('NFKC').replace(/[\p{P}\s]/gu, ''))).size, 56);
});

test('a repeated wrong answer takes priority, but a later correction and duplicate deliveries clear false flags', () => {
  const old = answer('same', { correct: false, at: now - 3000 });
  const recent = answer('same', { correct: false, at: now - 2000 });
  assert.equal(classify([recent, old]), 'repeat_wrong');
  assert.equal(classify([old, recent, answer('same')]), 'starting');
  assert.equal(classify([old, { ...old }]), 'starting');
  assert.equal(classify([
    answer('skip', { correct: false, selected: [], mode: 'exam' }),
    answer('skip', { correct: false, selected: [], mode: 'exam' }),
    answer('wrong-bank', { correct: false, certificateId: 'other-certificate' }),
    answer('wrong-bank', { correct: false, certificateId: 'other-certificate' }),
  ]), 'starting');
});

test('fast-and-wrong requires a real timing sample, not just fast or incorrect answers', () => {
  const isSingleChoice = () => true;
  const rapid = batch(12, 7, { timeMs: 1500 });
  assert.equal(classify(rapid, { isSingleChoice }), 'fast_wrong');
  assert.equal(classify(rapid), 'steady');
  assert.equal(classify(batch(12, 7, { timeMs: 0 }), { isSingleChoice }), 'steady');
  assert.equal(classify(batch(12, 7, { timeMs: 1500, mode: 'exam' }), { isSingleChoice }), 'steady');
  assert.equal(classify(batch(12, 12, { timeMs: 1000 }), { isSingleChoice }), 'stable');
  assert.equal(classify(batch(9, 5, { timeMs: 1000 }), { isSingleChoice }), 'starting');
});

test('recent volume, recent improvement and stable accuracy choose separate categories', () => {
  assert.equal(classify(batch(20, 7)), 'volume_low_accuracy');
  assert.equal(classify(batch(20, 18)), 'stable');
  assert.equal(classify(batch(12, 8)), 'steady');
  assert.equal(classify([...batch(20, 8, { ago: 8 }), ...batch(20, 15)]), 'improving');
  assert.equal(classify(batch(20, 7, { ago: 15 })), 'starting');
  const capped = [...batch(20, 18), ...Array.from({ length: 16 }, (_, i) => answer(`extra-${i}`, { correct: false, at: now - day }))];
  assert.equal(classify(capped), 'stable');
});

test('one account/certificate gets a stable line per day, cycling all same-category lines before repeating', () => {
  const scope = { userId: 'fixture-user', certificateId };
  const times = Array.from({ length: 8 }, (_, i) => now + i * day);
  const lines = times.map(time => selectTodayMotivation([], { ...scope, now: time }).text);
  assert.equal(new Set(lines).size, 8);
  assert.equal(selectTodayMotivation([], { ...scope, now: now + 1000 }).text, lines[0]);
  assert.equal(selectTodayMotivation([], { ...scope, now: now + 8 * day }).text, lines[0]);
  assert.equal(selectTodayMotivation([], { ...scope, now: Date.parse('2026-11-16T16:00:00Z') }).day, '2026-11-17');
});

test('authenticated dashboard serves the selected line and isolates answers between users', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aceexam-today-motivation-'));
  const store = createStore(directory);
  const app = await createApp({ store, withFrontend: false, authRequired: true });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await app.locals.stop();
    await new Promise(resolve => server.close(resolve));
    store.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const owner = store.register('motivation_fixture_owner', 'fixture-password-123');
  const peer = store.register('motivation_fixture_peer', 'fixture-password-123');
  for (const user of [owner, peer]) store.selectCertificate(user.id, certificateId);
  const ownerToken = store.createAuthSession(owner.id);
  const peerToken = store.createAuthSession(peer.id);
  const dashboard = `http://127.0.0.1:${server.address().port}/api/dashboard`;
  const get = async (token, summary = true) => {
    const response = await fetch(dashboard + (summary ? '?summary=1' : ''), { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200);
    return response.json();
  };
  const notSigned = await fetch(dashboard + '?summary=1');
  assert.equal(notSigned.status, 401);
  await notSigned.body?.cancel();
  assert.equal((await get(ownerToken)).todayMotivation.category, 'starting');
  const question = store.allQ().find(q => q.type === 'single_choice' && q.certificates?.includes(certificateId) &&
    Object.keys(q.options ?? {}).some(option => !q.answer.includes(option)));
  assert.ok(question, 'need a real fixture question');
  const wrong = Object.keys(question.options).find(option => !question.answer.includes(option));
  store.recordAttempt(question.id, [wrong], 10000, 'practice', owner.id);
  store.recordAttempt(question.id, [wrong], 13000, 'practice', owner.id);
  const summary = await get(ownerToken);
  assert.equal(summary.todayMotivation.category, 'repeat_wrong');
  assert.ok(todayMotivationCatalog.repeat_wrong.includes(summary.todayMotivation.text));
  assert.deepEqual(Object.keys(summary.todayMotivation).sort(), ['category', 'day', 'text']);
  assert.deepEqual((await get(ownerToken)).todayMotivation, summary.todayMotivation);
  assert.deepEqual((await get(ownerToken, false)).todayMotivation, summary.todayMotivation);
  assert.equal((await get(peerToken)).todayMotivation.category, 'starting');
});
