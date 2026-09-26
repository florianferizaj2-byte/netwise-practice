// Run after exporting mobile web with EXPO_PUBLIC_API_URL=http://127.0.0.1:5186/api.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.js';
import { createStore } from '../server/store.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aceexam-mobile-e2e-'));
const store = createStore(dir);
const template = store.allQ().find((question) => question.type === 'single_choice' && question.certificates?.includes('hcia-datacom'));
for (let index = 0; index < 85; index++) {
  store.addQ({ ...template, id: `mobile-cache-e2e-${index}`, question: `缓存分页核验 ${index + 1}：${template.question}`, chapter: '缓存分页核验', knowledgePoint: '分页练习', certificates: ['hcia-datacom'] });
}
const app = await createApp({ store, withFrontend: false, authRequired: true });
app.use(express.static('test-output/mobile-web'));
const server = app.listen(5186, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = 'http://127.0.0.1:5186';
const version = JSON.parse(
  fs.readFileSync(new URL('../mobile/package.json', import.meta.url)),
).version;
const headers = {
  'Content-Type': 'application/json',
  'X-Client': 'mobile',
  'X-App-Version': version,
};
let browser;
try {
  const registration = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      username: 'mobile_cache_fixture',
      password: 'fixture-password',
    }),
  });
  assert.equal(registration.status, 200);
  const session = await registration.json();
  const selected = await fetch(`${base}/api/auth/certificate`, {
    method: 'PUT',
    headers: { ...headers, Authorization: `Bearer ${session.sessionToken}` },
    body: JSON.stringify({ certificateId: 'hcia-datacom' }),
  });
  session.user = (await selected.json()).user;
  const catalog = await fetch(`${base}/api/practice/catalog`, {
    headers: { ...headers, Authorization: `Bearer ${session.sessionToken}` },
  }).then((response) => response.json());
  const largeChapter = catalog.chapters.find((chapter) => chapter.name === '缓存分页核验');
  assert.ok(largeChapter);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    deviceScaleFactor: 1,
  });
  await page.clock.install();
  const errors = [];
  const requests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().includes('/api/'))
      requests.push(
        new URL(request.url()).pathname + new URL(request.url()).search,
      );
  });
  await page.addInitScript((session) => {
    if (sessionStorage.getItem('fixture-started')) return;
    sessionStorage.setItem('fixture-started', '1');
    localStorage.setItem('kaojiang-session-token', session.sessionToken);
    localStorage.setItem(
      'kaojiang-session-profile',
      JSON.stringify({
        user: session.user,
        certificates: session.certificates,
      }),
    );
  }, session);
  await page.goto(base);
  await page.getByText('今天学什么？', { exact: true }).waitFor();
  await page.getByRole('button', { name: '练习导航', exact: true }).click();
  await page.getByText('题库练习', { exact: true }).waitFor();
  const chapter = page.getByRole('button', {
    name: `直接练习大知识点 ${largeChapter.name}`,
    exact: true,
  });
  await chapter.waitFor();
  const firstPageResponse = page.waitForResponse((response) =>
    response.url().includes('/questions?page=1'),
  );
  await chapter.click();
  const firstPage = await (await firstPageResponse).json();
  assert.equal(firstPage.items.length, 40);
  const question = firstPage.items[0];
  await page.getByText(question.question, { exact: true }).waitFor();
  const storedQuestion = store.getQ(question.id);
  const wrongOption = Object.keys(question.options).find(
    (key) => !storedQuestion.answer.includes(key),
  );
  await page.getByText(question.options[wrongOption], { exact: true }).click();
  const pageCount = requests.filter((url) =>
    url.startsWith('/api/questions?'),
  ).length;
  const catalogCount = requests.filter(
    (url) => url === '/api/practice/catalog',
  ).length;
  await page.getByRole('button', { name: '我的导航', exact: true }).click();
  await page.getByRole('button', { name: '练习导航', exact: true }).click();
  await page.getByText(question.question, { exact: true }).waitFor();
  assert.equal(
    requests.filter((url) => url.startsWith('/api/questions?')).length,
    pageCount,
  );
  assert.equal(
    requests.filter((url) => url === '/api/practice/catalog').length,
    catalogCount,
  );
  const attempt = page.waitForResponse((response) =>
    response.url().endsWith('/api/attempts'),
  );
  await page.getByText('确认答案', { exact: true }).click();
  assert.equal((await attempt).status(), 200); // Selection survived the tab switch.
  await page.getByText('下一题', { exact: true }).waitFor();
  await page.getByRole('button', { name: '今日导航', exact: true }).click();
  await page.getByText('1 / 30 题', { exact: true }).waitFor();
  await page.getByRole('button', { name: '错题导航', exact: true }).click();
  await page.getByText('全部错题 · 1 道', { exact: true }).waitFor();
  await page.getByRole('button', { name: '练习导航', exact: true }).click();
  await page.getByText('下一题', { exact: true }).waitFor();
  await page.getByRole('button', { name: '社区导航', exact: true }).click();
  await page.getByText('社区还很安静', { exact: true }).waitFor();
  await page.getByRole('button', { name: '练习导航', exact: true }).click();
  const communityRequests = requests.filter((url) =>
    url.startsWith('/api/community/messages'),
  ).length;
  await page.clock.fastForward(11_000);
  assert.equal(
    requests.filter((url) => url.startsWith('/api/community/messages')).length,
    communityRequests,
    'Hidden community must stop polling',
  );
  await page.screenshot({ path: 'test-output/mobile-practice-cache.png' });
  const dashboardRequests = requests.filter((url) =>
    url.startsWith('/api/dashboard'),
  ).length;
  // Cross the first page boundary through the real answer UI. Prefetch must
  // neither repeat nor omit a question while mutations invalidate cached pages.
  for (let index = 1; index <= 40; index++) {
    await page.getByText('下一题', { exact: true }).click();
    const nextQuestion = store.getQ(`mobile-cache-e2e-${index}`);
    await page.getByText(nextQuestion.question, { exact: true }).waitFor();
    if (index === 40) break;
    await page.getByText(nextQuestion.options.A, { exact: true }).click();
    const submitted = page.waitForResponse((response) => response.url().endsWith('/api/attempts'));
    await page.getByText('确认答案', { exact: true }).click();
    assert.equal((await submitted).status(), 200);
    await page.getByText('下一题', { exact: true }).waitFor();
  }
  assert.ok(requests.some((url) => url.includes('/api/questions?page=1') && url.includes('offset=40')));
  assert.equal(
    requests.filter((url) => url.startsWith('/api/dashboard')).length,
    dashboardRequests,
    'Hidden dashboard must defer invalidated statistics until it is visible',
  );
  await page.getByLabel('返回题库目录', { exact: true }).click();
  await page
    .getByRole('button', { name: /^直接练习大知识点 / })
    .first()
    .waitFor();
  await page.clock.fastForward(1000);
  await page.waitForFunction(
    () => !!localStorage.getItem('kaojiang-study-cache-v1'),
  );
  await page.route('**/api/**', (route) => route.abort('internetdisconnected'));
  await page.reload();
  await page.getByText('今天学什么？', { exact: true }).waitFor();
  await page.getByRole('button', { name: '练习导航', exact: true }).click();
  await page
    .getByRole('button', { name: /^直接练习大知识点 / })
    .first()
    .waitFor();
  await page.screenshot({ path: 'test-output/mobile-offline-catalog.png' });
  await page
    .getByRole('button', {
      name: `直接练习大知识点 ${largeChapter.name}`,
      exact: true,
    })
    .click();
  await page.getByText(question.question, { exact: true }).waitFor();
  await page.getByText(question.options[wrongOption], { exact: true }).click();
  await page.getByText('确认答案', { exact: true }).click();
  await page.getByText('确认答案', { exact: true }).waitFor();
  assert.equal(
    store.allA(session.user.id).length,
    40,
    'Offline submit must not report success or duplicate a record',
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      passed: true,
      pageSize: firstPage.items.length,
      extraQuestionRequestsOnTabReturn: 0,
      extraCatalogRequestsOnTabReturn: 0,
      hiddenCommunityPolling: false,
      hiddenDashboardRequests: 0,
      offlineCatalogAndQuestion: true,
      accountAttempts: 40,
      crossedPageBoundary: true,
      screenshots: ['mobile-practice-cache.png', 'mobile-offline-catalog.png'],
    }),
  );
} finally {
  await browser?.close();
  app.locals.stop();
  await new Promise((resolve) => server.close(resolve));
  store.db.close();
  assert.equal(path.dirname(dir), path.resolve(os.tmpdir()));
  fs.rmSync(dir, { recursive: true, force: true });
}
