import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../server/store.js';
import { createApp } from '../server/index.js';
import { FundedTestAIProvider as OpenAICompatibleProvider } from "./helpers/ai-points.js";
import { authorAiSettings } from '../server/ai-service.js';
import { encrypt } from '../server/security.js';

function isolatedStore(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aceexam-author-ai-'));
  const store = createStore(directory);
  t.after(() => {
    store.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return store;
}

test('ordinary users use the author key even when an old personal key is saved', async (t) => {
  const names = ['AI_MASTER_KEY', 'AI_SERVICE_API_KEY', 'AI_SERVICE_BASE_URL',
    'AI_SERVICE_MODEL', 'AI_SERVICE_OWNER_ID', 'AUTHOR_API_KEY',
    'AUTHOR_API_BASE_URL', 'AUTHOR_API_MODEL', 'ADMIN_USERNAME'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  t.after(() => {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  });
  for (const name of names) delete process.env[name];
  process.env.AI_MASTER_KEY = crypto.randomBytes(32).toString('base64');
  process.env.ADMIN_USERNAME = 'service_owner';
  const store = isolatedStore(t);
  const owner = store.register('service_owner', 'safe-password-123');
  const learner = store.register('service_learner', 'safe-password-123');
  store.saveSettings(owner.id, {
    baseUrl: 'https://author.example/v1', model: 'author-model',
    keyCipher: encrypt('author-only-key'), temperature: 0.3,
  });
  store.saveSettings(learner.id, {
    baseUrl: 'https://personal.example/v1', model: 'personal-model',
    keyCipher: encrypt('old-personal-key'), temperature: 0.3,
  });
  const calls = [];
  const provider = new OpenAICompatibleProvider(store, {
    fetch: async (url, options) => {
      calls.push({ url, auth: options.headers.Authorization,
        model: JSON.parse(options.body).model });
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });
  await provider.call([{ role: 'user', content: 'Reply with OK' }], undefined,
    { userId: learner.id });
  assert.equal(calls[0].url, 'https://author.example/v1/chat/completions');
  assert.equal(calls[0].auth, 'Bearer author-only-key');
  assert.equal(calls[0].model, 'author-model');
  assert.equal(JSON.stringify(calls).includes('old-personal-key'), false);

  const environment = authorAiSettings(store, {
    AI_SERVICE_API_KEY: 'environment-key',
    AI_SERVICE_BASE_URL: 'https://service.example/v1',
    AI_SERVICE_MODEL: 'service-model',
    AUTHOR_API_BASE_URL: 'https://legacy.example/v1',
  });
  assert.equal(environment.apiKey, 'environment-key');
  assert.equal(environment.baseUrl, 'https://service.example/v1');
  assert.equal(environment.model, 'service-model');
  assert.equal(authorAiSettings(store, { AI_SERVICE_OWNER_ID: 'missing-admin' }), null);
});

test('every AI service spends unified account points and refunds the complete failed task', async (t) => {
  const store = isolatedStore(t);
  store.register('credit_owner', 'safe-password-123');
  const learner = store.register('credit_learner', 'safe-password-123');
  const peer = store.register('credit_peer', 'safe-password-123');
  for (const user of [learner, peer]) store.selectCertificate(user.id, 'network-engineer');
  const learnerToken = store.createAuthSession(learner.id);
  const peerToken = store.createAuthSession(peer.id);
  let explanationCalls = 0;
  let generationCalls = 0;
  let failExplanation = false;
  let failGeneration = false;
  let planCalls = 0;
  const metered = new OpenAICompatibleProvider(store,{fetch:async()=>new Response(JSON.stringify({
    choices:[{message:{content:'fixture response'}}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5},
  }),{headers:{'Content-Type':'application/json'}})});
  const settings={baseUrl:'https://fixture.example/v1',model:'fixture',apiKey:'fixture'};
  const provider = {
    async explainQuestion(_question,_action,_selected,_hint,userId) {
      explanationCalls += 1;
      await metered.call([{role:'user',content:'fixture explanation'}],settings,{userId,taskType:'question-explanation'});
      if (failExplanation) throw new Error('fixture explanation failure');
      return { text: 'fixture explanation' };
    },
    async generatePracticeSet(_question,_count,_harder,_progress,options) {
      generationCalls += 1;
      await metered.call([{role:'user',content:'fixture generation'}],settings,{userId:options.userId,taskType:'question-generation'});
      if (failGeneration) throw new Error('fixture generation failure');
      return { questions: [] };
    },
    async dailyPlan(_questions,userId) {
      planCalls += 1;
      await metered.call([{role:'user',content:'fixture plan'}],settings,{userId,taskType:'daily-plan'});
      return { summary: 'fixture plan', tasks: [] };
    },
  };
  const app = await createApp({ store, provider, withFrontend: false, authRequired: true });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await app.locals.stop();
    await new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (route, token, body) => {
    const response = await fetch(base + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json() };
  };
  const balance = async (token) => (await request('/account/entitlements', token)).data.points.availableUnits;
  const question = store.allQ().find((item) => item.certificates?.includes('network-engineer'));
  const explanation = { questionId: question.id, action: '详细讲解' };
  const initial=await balance(learnerToken),peerInitial=await balance(peerToken);
  assert.equal((await request('/ai/teacher', learnerToken, explanation)).status, 200);
  assert.equal(explanationCalls, 1);
  assert.equal(await balance(learnerToken),initial-12);
  const gift=await request('/account/check-in',learnerToken,{});
  assert.equal(gift.status,200);
  const expected=initial-12+gift.data.checkIn.grants.points*1000;
  assert.equal((await request('/ai/teacher', learnerToken, explanation)).status, 200);
  assert.equal(await balance(learnerToken),expected-12);
  failExplanation = true;
  assert.notEqual((await request('/ai/teacher', learnerToken, explanation)).status, 200);
  assert.equal(await balance(learnerToken),expected-12);
  failExplanation = false;
  assert.equal((await request('/ai/teacher', learnerToken, explanation)).status, 200);
  assert.equal(await balance(learnerToken),expected-24);

  const training = { questionId: question.id, count: 1 };
  assert.equal((await request('/ai/train', learnerToken, training)).status, 200);
  assert.equal(await balance(learnerToken),expected-36);
  assert.equal((await request('/ai/train', learnerToken, training)).status, 200);
  assert.equal(generationCalls, 2);
  assert.equal(await balance(learnerToken),expected-48);
  assert.equal(await balance(peerToken),peerInitial);
  failGeneration = true;
  assert.notEqual((await request('/ai/train', peerToken, training)).status, 200);
  assert.equal(await balance(peerToken),peerInitial);
  assert.equal(await balance(learnerToken),expected-48);

  assert.equal((await request('/ai/daily', learnerToken, {})).status, 200);
  const analysisAfterPlan = await balance(learnerToken);
  assert.equal(analysisAfterPlan,expected-60);
  assert.equal((await request('/ai/daily', learnerToken, {})).status, 200);
  assert.equal(planCalls, 1);
  assert.equal(await balance(learnerToken),analysisAfterPlan);
  assert.equal(store.points.audit().passed,true);
});
