import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { modelPointExamples, pointServicePrices, pointServices } from '../server/ai-points/service-prices.js';
import { officialRateCards } from '../server/ai-points/pricing.js';
import { chargeUnits, tokenCost, SERVICE_MARGIN_BPS } from '../server/ai-points/money.js';
import { aiOutputBudget } from '../server/ai-output-policy.js';
import { createStore } from '../server/store.js';
import { createApp } from '../server/index.js';

const now = Date.parse('2026-10-24T06:00:00Z');
const flash = officialRateCards.find(card => card.model === 'deepseek-flash');
const pro = officialRateCards.find(card => card.model === 'deepseek-v4-pro');
const emptyStore = () => ({ allUsers: () => [], settings: () => ({}), points: {} });

test('service examples use the production token allowances, margin and integer settlement calculation', () => {
  const prices = modelPointExamples(flash);
  assert.equal(prices.inputUnitsPer1000, 800);
  assert.equal(prices.outputUnitsPer1000, 3200);
  assert.equal(prices.cachedInputUnitsPer1000, 16);
  assert.equal(prices.services.length, 13);
  for (const [index, service] of prices.services.entries()) {
    const spec = pointServices[index];
    const actualCost = service.steps.reduce((total, step) => {
      assert.equal(step.inputTokens, 1000);
      assert.equal(step.outputTokens, aiOutputBudget({ taskType: step.taskType, outputItemCount: spec.count }).maxTokens);
      return total + tokenCost({ prompt_tokens: step.inputTokens, completion_tokens: step.outputTokens }, flash);
    }, 0);
    assert.equal(service.sampleUnits, chargeUnits(actualCost, SERVICE_MARGIN_BPS));
  }
  const byId = Object.fromEntries(prices.services.map(service => [service.id, service]));
  assert.equal(byId.hint.sampleUnits, 2829); // Round once for the complete logical task.
  assert.equal(byId.explanation.sampleUnits, 3680);
  assert.equal(byId['questions-3'].sampleUnits, 19572);
  assert.equal(byId['tutor-teacher'].steps.length, 2);
});

test('managed priorities and per-model prices mirror active routing without exposing API secrets or URLs', () => {
  const settings = [
    { id: 'primary', model: pro.model, keyCipher: 'SYNTHETIC_SECRET', enabled: true, priority: 1 },
    { id: 'fallback', model: flash.model, keyCipher: 'SYNTHETIC_SECRET', enabled: true, priority: 9 },
    { id: 'disabled', model: flash.model, keyCipher: 'SYNTHETIC_SECRET', enabled: false, priority: 10 },
  ];
  const store = { aiServices: { policy: () => ({ managed: true }), channels: () => settings },
    points: { rateCard: s => s.model === pro.model ? pro : flash } };
  const catalog = pointServicePrices(store, now);
  assert.equal(catalog.available, true);
  assert.equal(catalog.primaryModelId, 'primary');
  assert.deepEqual(catalog.models.map(model => model.id), ['primary', 'fallback']);
  assert.equal(catalog.models[0].inputUnitsPer1000, 3600);
  assert.equal(catalog.models[1].inputUnitsPer1000, 800);
  assert.doesNotMatch(JSON.stringify(catalog), /SYNTHETIC_SECRET|keyCipher|apiKey|baseUrl/);
  assert.equal(catalog.assumptions.includesRetries, false);
  assert.match(catalog.assumptions.notice, /不是固定价格/);
});

test('unconfigured or expired pricing is explicitly unavailable, never a false free AI service', () => {
  const reference = pointServicePrices(emptyStore(), now);
  assert.equal(reference.available, false);
  assert.equal(reference.primaryModelId, null);
  assert.equal(reference.models[0].kind, 'reference');
  assert.ok(reference.models[0].services.every(service => service.sampleUnits > 0));
  const expired = pointServicePrices(emptyStore(), Date.parse('2026-12-01T00:00:00Z'));
  assert.equal(expired.available, false);
  assert.deepEqual(expired.models, []);
  assert.ok(expired.freeServices.every(service => service.units === 0));
  assert.ok(expired.freeServices.some(service => service.id === 'location-study'));
});

test('pricing-pending channels are excluded just as in production candidate routing', () => {
  const store = { aiServices: { policy: () => ({ managed: true }), channels: () => [
    { id: 'unknown', enabled: true, keyCipher: 'fixture', model: 'unpriced' },
    { id: 'ready', enabled: true, keyCipher: 'fixture', model: flash.model },
  ] }, points: { rateCard: s => {
    if (s.model === 'unpriced') throw Object.assign(new Error('price pending'), { code: 'AI_POINTS_PRICING_UNAVAILABLE' });
    return flash;
  } } };
  assert.equal(pointServicePrices(store, now).primaryModelId, 'ready');
});

test('the service price API is authenticated, read-only and makes no model requests', async t => {
  const parent = path.resolve('tmp'), dir = fs.mkdtempSync(path.join(parent, 'points-services-api-'));
  const store = createStore(dir), user = store.register('price_fixture', 'fixture-password-123');
  const app = await createApp({ store, withFrontend: false, authRequired: true, accountSecurity: { enabled: false } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await app.locals.stop(); await new Promise(resolve => server.close(resolve)); store.db.close();
    assert.equal(path.dirname(dir), parent); assert.ok(path.basename(dir).startsWith('points-services-api-'));
    fs.rmSync(dir, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${server.address().port}/api/account/points/services`;
  const count = () => store.db.prepare('SELECT COUNT(*) AS n FROM ai_points_operations').get().n;
  assert.equal((await fetch(url)).status, 401);
  const before = count(), wallet = store.points.wallet(user.id);
  const result = await fetch(url, { headers: { Authorization: `Bearer ${store.createAuthSession(user.id)}` } });
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.billingMode, 'actual-usage');
  assert.ok(body.assumptions.notice);
  assert.equal(count(), before);
  assert.deepEqual(store.points.wallet(user.id), wallet);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM ai_points_calls').get().n, 0);
});
