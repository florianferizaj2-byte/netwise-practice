import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.js';
import { createStore } from '../server/store.js';
import { questionPage } from '../server/question-paging.js';
import { studySummary } from '../server/study-summary.js';

test('seeded question pagination covers the complete set once and preserves stable order', () => {
  const questions = Array.from({ length: 123 }, (_, i) => ({ id: `q${i}` }));
  const ids = [];
  let offset = 0;
  while (offset !== null) {
    const page = questionPage(questions, {
      offset,
      limit: 40,
      seed: 'practice-session',
    });
    assert.ok(page.items.length <= 40);
    ids.push(...page.items.map((question) => question.id));
    offset = page.nextOffset;
  }
  assert.equal(new Set(ids).size, questions.length);
  assert.deepEqual(
    ids.slice(0, 40),
    questionPage(questions, { seed: 'practice-session' }).items.map(
      (question) => question.id,
    ),
  );
  assert.notDeepEqual(
    ids.slice(0, 40),
    questionPage(questions, { seed: 'another-session' }).items.map(
      (question) => question.id,
    ),
  );
  assert.deepEqual(questionPage(questions, { offset: 150 }).items, []);
});

test('study summary counts actual consecutive Shanghai dates and calculates recent activity once', () => {
  const attempts = [
    { createdAt: '2026-09-24T16:30:00Z', timeMs: 60000, correct: true },
    { createdAt: '2026-09-24T01:00:00Z', timeMs: 60000, correct: false },
    { createdAt: '2026-09-22T01:00:00Z', timeMs: 60000, correct: true },
  ];
  const summary = studySummary(attempts, [], new Date('2026-09-25T04:00:00Z'));
  assert.equal(summary.streakDays, 2);
  assert.equal(summary.todayCount, 1);
  assert.equal(summary.minutes, 1);
  assert.equal(summary.totalCount, 3);
  assert.equal(summary.accuracy, 2 / 3);
  assert.equal(
    studySummary(attempts, [], new Date('2026-09-26T04:00:00Z')).streakDays,
    2,
  );
  assert.equal(
    studySummary(attempts, [], new Date('2026-09-27T04:00:00Z')).streakDays,
    0,
  );
});

test('mobile API pagination, summary, catalog isolation and same-timestamp community cursors', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aceexam-mobile-api-'));
  const store = createStore(dir);
  const app = await createApp({
    store,
    withFrontend: false,
    authRequired: false,
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  t.after(async () => {
    app.locals.stop();
    await new Promise((resolve) => server.close(resolve));
    store.db.close();
    assert.equal(path.dirname(dir), path.resolve(os.tmpdir()));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const get = async (route) => {
    const response = await fetch(base + route);
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return data;
  };
  await t.test(
    'bounded pages match legacy order and stable random pages never overlap',
    async () => {
      const legacy = await get('/questions?limit=40');
      const page = await get('/questions?page=1&limit=40');
      assert.equal(page.items.length, 40);
      assert.deepEqual(page.items, legacy);
      assert.equal(page.nextOffset, 40);
      assert.ok(page.total > 40);
      assert.ok(
        page.items.every(
          (question) => !('answer' in question) && !('analysis' in question),
        ),
      );
      const first = await get(
        '/questions?page=1&random=1&seed=session&limit=40',
      );
      const second = await get(
        '/questions?page=1&random=1&seed=session&limit=40&offset=40',
      );
      assert.ok(
        second.items.every(
          (question) => !first.items.some((other) => other.id === question.id),
        ),
      );
      assert.deepEqual(
        (await get('/questions?page=1&random=1&seed=session&limit=40')).items,
        first.items,
      );
    },
  );
  await t.test(
    'summary matches full dashboard without the expensive unused fields',
    async () => {
      const full = await get('/dashboard');
      const summary = await get('/dashboard?summary=1');
      for (const [key, value] of Object.entries(summary))
        assert.deepEqual(value, full[key]);
      assert.ok(!('chapters' in summary));
      assert.ok(!('user' in summary));
      assert.ok(JSON.stringify(summary).length < 1500);
    },
  );
  await t.test(
    'same-named points in separate sections keep separate totals',
    async () => {
      const original = store
        .allQ()
        .find((question) => question.type === 'single_choice');
      for (const section of ['第一节', '第二节']) {
        store.addQ({
          ...original,
          id: `catalog-${section}`,
          question: `独立目录核验 ${section}`,
          chapter: '目录隔离测试',
          knowledgeSection: section,
          knowledgePoint: '同名知识点',
          targetKnowledgePoint: '同名知识点',
        });
      }
      const catalog = await get('/practice/catalog');
      const chapter = catalog.chapters.find(
        (item) => item.name === '目录隔离测试',
      );
      assert.equal(chapter.questionCount, 2);
      assert.equal(chapter.sections.length, 2);
      assert.ok(
        chapter.sections.every(
          (section) => section.knowledgePoints[0].questionCount === 1,
        ),
      );
    },
  );
  await t.test(
    'history pagination does not skip messages sent in the same millisecond',
    async () => {
      const timestamp = '2026-09-25T00:00:00.000Z';
      for (let i = 0; i < 7; i++)
        store.db
          .prepare(
            'INSERT INTO community_messages (id,user_id,text,created_at) VALUES (?,?,?,?)',
          )
          .run(`same-time-${i}`, 'local', `消息 ${i}`, timestamp);
      const ids = [];
      let before = '';
      do {
        const page = await get(
          `/community/messages?limit=3${before ? `&before=${encodeURIComponent(before)}` : ''}`,
        );
        ids.push(...page.messages.map((message) => message.id));
        before = page.hasMore ? page.nextBefore : '';
      } while (before);
      assert.equal(ids.length, 7);
      assert.equal(new Set(ids).size, 7);
    },
  );
});
