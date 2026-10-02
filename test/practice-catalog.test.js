import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.js';
import { createStore } from '../server/store.js';
import { mobileModules, memoryStorage } from './mobile-fixture.js';

test('ordinary practice stays consistent with the web bank when an account owns legacy AI questions', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aceexam-catalog-parity-'));
  const store = createStore(directory);
  const app = await createApp({ store, withFrontend: false, authRequired: true });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await app.locals.stop();
    await new Promise((resolve) => server.close(resolve));
    store.db.close();
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('aceexam-catalog-parity-'));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const nativeHeaders = { 'X-Client': 'mobile', 'X-App-Version': '99.0.0' };
  const request = async (route, { token, native = false, method = 'GET', body } = {}) => {
    const response = await fetch(`${origin}/api${route}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(native ? nativeHeaders : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    return data;
  };
  const register = async (username) => {
    const session = await request('/auth/register', {
      native: true, method: 'POST', body: { username, password: 'catalog-parity-test' },
    });
    await request('/auth/certificate', {
      token: session.sessionToken, method: 'PUT', body: { certificateId: 'network-engineer' },
    });
    return session;
  };
  const owner = await register('catalog_owner');
  const stranger = await register('catalog_stranger');
  const bank = store.allQ().filter((q) => q.certificates.includes('network-engineer'));
  const seed = bank.find((q) => q.id === 'practice-1');
  const managementSeed = bank.find((q) => q.chapter === '网络管理');
  const aiQuestion = (base, id, fields = {}) => ({
    ...base, id, question: `目录回归题 ${id}`, source: 'ai_generated',
    ownerUserId: owner.user.id, ...fields,
  });
  const legacy = Array.from({ length: 3 }, (_, i) => aiQuestion(seed, `legacy-ipv4-${i}`, {
    chapter: '网络层协议', knowledgeSection: undefined,
    knowledgePoint: 'IPv4', targetKnowledgePoint: 'IPv4',
  }));
  const generated = Array.from({ length: 10 }, (_, i) =>
    aiQuestion(managementSeed, `generated-management-${i}`));
  const legacyGroup = store.addAiQuestionGroup(legacy, 'IPv4', {
    userId: owner.user.id, certificateId: 'network-engineer',
  });
  const managementGroup = store.addAiQuestionGroup(generated, '网络管理', {
    userId: owner.user.id, certificateId: 'network-engineer',
  });
  const strangerGroup = store.addAiQuestionGroup([
    aiQuestion(seed, 'other-owner-ai', { ownerUserId: stranger.user.id }),
  ], 'OSI', { userId: stranger.user.id, certificateId: 'network-engineer' });
  store.recordAttempt(seed.id, seed.answer, 1800, 'practice', owner.user.id);
  const wrongAnswer = Object.keys(legacy[0].options).find((key) => !legacy[0].answer.includes(key));
  store.recordAttempt(legacy[0].id, [wrongAnswer], 1800, 'practice', owner.user.id);
  store.setQuestionFavorite(owner.user.id, seed.id, true);
  store.setQuestionFavorite(owner.user.id, legacy[0].id, true);
  const asOwner = { token: owner.sessionToken };

  await t.test('the normal catalog has no AI-only chapter or inflated question and progress counts', async () => {
    const all = await request('/questions', asOwner);
    // This is the existing web questionsForChapter source rule.
    const webBank = all.filter((q) => q.source !== 'ai_generated');
    const mobile = await request('/practice/catalog', { ...asOwner, native: true });
    assert.deepEqual({
      ghostQuestions: mobile.chapters.find((c) => c.name === '网络层协议')?.questionCount || 0,
      managementQuestions: mobile.chapters.find((c) => c.name === '网络管理').questionCount,
      total: mobile.total,
    }, {
      ghostQuestions: 0,
      managementQuestions: webBank.filter((q) => q.chapter === '网络管理').length,
      total: webBank.length,
    });
    assert.equal(mobile.chapters.length, 10);
    assert.equal(mobile.attemptedCount, 1);
    assert.equal(mobile.favoriteCount, 2, 'AI favorites stay accessible from the favorites entry');
    for (const chapter of mobile.chapters) {
      const expected = webBank.filter((q) => q.chapter === chapter.name);
      assert.equal(chapter.questionCount, expected.length);
      assert.equal(chapter.attemptedCount, expected.filter((q) => q.attempted).length);
      assert.equal(chapter.sections.reduce((sum, section) => sum + section.questionCount, 0), expected.length);
    }
    const dashboard = await request('/dashboard', asOwner);
    assert.deepEqual(dashboard.chapters.map((c) => [c.name, c.total, c.attempted]),
      mobile.chapters.map((c) => [c.name, c.questionCount, c.attemptedCount]));
    assert.equal(dashboard.totalCount, 2, 'overall study history still includes AI practice');
  });

  await t.test('ordinary mobile lists, pagination, random practice and filters use the same bank', async () => {
    const native = { ...asOwner, native: true };
    const list = await request('/questions', native);
    assert.deepEqual(list.map((q) => q.id), bank.map((q) => q.id));
    const explicit = await request('/questions?bankOnly=1', asOwner);
    assert.deepEqual(explicit, list);
    for (const random of [false, true]) {
      const ids = [];
      let offset = 0;
      while (offset !== null) {
        const query = new URLSearchParams({ page: '1', limit: '100', offset: String(offset),
          chapter: '网络管理', ...(random ? { random: '1', seed: 'catalog-parity' } : {}) });
        const page = await request(`/questions?${query}`, native);
        assert.equal(page.total, bank.filter((q) => q.chapter === '网络管理').length);
        assert.ok(page.items.every((q) => q.source !== 'ai_generated'));
        ids.push(...page.items.map((q) => q.id));
        offset = page.nextOffset;
      }
      assert.deepEqual([...ids].sort(), bank.filter((q) => q.chapter === '网络管理').map((q) => q.id).sort());
    }
    const ghost = await request(`/questions?chapter=${encodeURIComponent('网络层协议')}`, native);
    assert.deepEqual(ghost, []);
    const all = await request('/questions', asOwner);
    assert.equal(all.length, bank.length + 13, 'legacy web access still includes owned AI questions');
    const explicitAi = await request('/questions?source=ai_generated', native);
    assert.equal(explicitAi.length, 13);
    assert.ok(explicitAi.every((q) => q.id !== 'other-owner-ai'));
    const otherAi = await request('/questions?bankOnly=1&source=ai_generated', native);
    assert.deepEqual(otherAi, []);
  });

  await t.test('AI groups, favorites, wrong answers and account ownership survive the catalog fix', async () => {
    const detail = await request(`/ai/groups/${legacyGroup}`, asOwner);
    assert.deepEqual(detail.questions.map((q) => q.id), legacy.map((q) => q.id));
    const favorites = await request('/favorites', { ...asOwner, native: true });
    assert.deepEqual(favorites.map((q) => q.id).sort(), [seed.id, legacy[0].id].sort());
    const wrong = await request('/wrong', { ...asOwner, native: true });
    assert.ok(wrong.some((q) => q.id === legacy[0].id));
    const strangerAi = await request('/questions?source=ai_generated', {
      token: stranger.sessionToken, native: true,
    });
    assert.deepEqual(strangerAi.map((q) => q.id), ['other-owner-ai']);
    assert.equal(store.allA(owner.user.id).length, 2);
    assert.equal(store.allQ().filter((q) => q.source === 'ai_generated').length, 14);
  });

  await t.test('the other-user shared counter excludes my uploads while my contribution counts them', async () => {
    for (const groupId of [legacyGroup, managementGroup]) {
      const result = await request(`/ai/groups/${groupId}/share`, {
        ...asOwner, native: true, method: 'PUT', body: { shared: true },
      });
      assert.equal(result.shared, true);
    }
    await request(`/ai/groups/${strangerGroup}/share`, {
      token: stranger.sessionToken, native: true, method: 'PUT', body: { shared: true },
    });
    const othersForOwner = await request('/questions/shared-ai', asOwner);
    assert.deepEqual(othersForOwner.map((q) => q.id), ['other-owner-ai']);
    const othersForStranger = await request('/questions/shared-ai', { token: stranger.sessionToken });
    assert.equal(othersForStranger.length, 13);
    const dashboard = await request('/dashboard', asOwner);
    assert.equal(dashboard.community.myQuestionCount, 13);
    assert.equal(dashboard.community.sharedQuestionCount, 14);
    const groups = await request('/ai/groups', asOwner);
    assert.ok(groups.every((group) => group.shared));
    assert.equal(groups.reduce((sum, group) => sum + group.questionCount, 0), 13);
    const catalog = await request('/practice/catalog', { ...asOwner, native: true });
    assert.equal(catalog.total, bank.length, 'sharing AI groups does not add them to the ordinary bank');
  });

  await t.test('updated mobile readers bypass pages cached with the old mixed question scope', async (subtest) => {
    const load = await mobileModules(subtest, memoryStorage());
    const { mobileApi, studyCache } = await load('client');
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (url, init) => {
      const { pathname, search } = new URL(url);
      return originalFetch(`${origin}${pathname}${search}`, init);
    };
    subtest.after(async () => {
      await studyCache.setScope(null);
      globalThis.fetch = originalFetch;
    });
    await mobileApi.login('catalog_owner', 'catalog-parity-test');
    await studyCache.read('/questions?page=1&limit=40&offset=0', async () => ({
      items: [legacy[0]], total: bank.length + 13, nextOffset: 40,
    }));
    await studyCache.read('/questions?limit=40', async () => [legacy[0]]);
    const page = await mobileApi.questionPage();
    assert.equal(page.total, bank.length);
    assert.ok(page.items.every((q) => q.source !== 'ai_generated'));
    const questions = await mobileApi.questions(40);
    assert.equal(questions.length, 40);
    assert.ok(questions.every((q) => q.source !== 'ai_generated'));
    const daily = await mobileApi.questions(10, 0, true, { chapter: '网络管理' });
    assert.equal(daily.length, 10);
    assert.ok(daily.every((q) => q.chapter === '网络管理' && q.source !== 'ai_generated'));
  });
});
