import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.js';
import { createStore } from '../server/store.js';
import { avatarBytes, avatarImage } from './helpers/mobile-profile.js';

test('profile saves to the server, admin shows nickname/avatar and account isolation survives restart', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aceexam-profile-'));
  let store = createStore(directory), app, server;
  async function start() { app = await createApp({ store, withFrontend: false, authRequired: true }); server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve)); }
  async function stop() { await app.locals.stop(); await new Promise((resolve) => server.close(resolve)); store.db.close(); }
  const admin = store.register('profile_admin_fixture', 'fixture-password-123');
  const learner = store.register('profile_learner_fixture', 'fixture-password-123');
  const adminToken = store.createAuthSession(admin.id), token = store.createAuthSession(learner.id);
  const request = async (url, { auth = token, body, method = body ? 'PUT' : 'GET' } = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${url}`, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  await start();
  try {
    assert.equal((await request('/api/auth/me')).body.user.profileComplete, false);
    const profile = '/api/auth/profile';
    assert.equal((await request(profile, { body: { name: '名字' }, auth: null })).status, 401);
    assert.equal((await request(profile, { body: { name: '名字' } })).status, 400);
    assert.equal((await request(profile, { body: { name: '', image: avatarImage } })).status, 400);
    assert.equal((await request(profile, { body: { name: '名字', image: { mimeType: 'image/png', data: Buffer.from('<svg/>').toString('base64') } } })).status, 400);
    assert.equal((await request(profile, { body: { name: '名字', image: avatarImage, userId: admin.id } })).status, 400);
    const saved = await request(profile, { body: { name: '测试昵称', image: avatarImage } });
    assert.equal(saved.status, 200); assert.equal(saved.body.user.profileComplete, true);
    const avatar = await fetch(`http://127.0.0.1:${server.address().port}${saved.body.user.avatarUrl}`);
    assert.equal(avatar.headers.get('content-type'), 'image/png'); assert.deepEqual(Buffer.from(await avatar.arrayBuffer()), avatarBytes);
    assert.equal((await request('/api/auth/me', { auth: adminToken })).body.user.profileComplete, false);
    assert.equal((await request('/api/admin/users')).status, 403);
    const users = (await request('/api/admin/users?search=' + encodeURIComponent('测试昵称'), { auth: adminToken })).body.users;
    assert.equal(users.length, 1); assert.equal(users[0].id, learner.id); assert.equal(users[0].avatarUrl, saved.body.user.avatarUrl);
    const renamed = await request(profile, { body: { name: '新昵称' } });
    assert.equal(renamed.body.user.avatarUrl, saved.body.user.avatarUrl);
    await stop(); store = createStore(directory); await start();
    const restored = (await request('/api/auth/me')).body.user;
    assert.equal(restored.profileComplete, true); assert.equal(restored.communityName, '新昵称'); assert.equal(restored.avatarUrl, saved.body.user.avatarUrl);
    assert.deepEqual(Buffer.from(await (await fetch(`http://127.0.0.1:${server.address().port}${restored.avatarUrl}`)).arrayBuffer()), avatarBytes);
    assert.equal((await request('/api/account/device-backups')).status, 404);
  } finally {
    await stop();
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir())); assert.ok(path.basename(directory).startsWith('aceexam-profile-'));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('leaderboards expose uploaded avatars to visitors and signed-in learners through the API', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aceexam-leaderboard-avatar-'));
  const store = createStore(dir);
  let app, server;
  try {
    const ranked = store.register('ranking_avatar_fixture', 'fixture-password-123');
    const uncustomized = store.register('ranking_no_avatar_fixture', 'fixture-password-123');
    const token = store.createAuthSession(ranked.id);
    store.addQ({ id: 'ranking-avatar-qa', type: 'single_choice', question: 'Which option is correct?',
      options: { A: 'Correct', B: 'Incorrect' }, answer: ['A'] });
    store.recordAttempt('ranking-avatar-qa', ['A'], 1000, 'practice', ranked.id);
    store.recordAttempt('ranking-avatar-qa', ['B'], 1000, 'practice', uncustomized.id);
    app = await createApp({ store, withFrontend: false, authRequired: true });
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const auth = { Authorization: `Bearer ${token}` };
    const uploaded = await fetch(base + '/api/auth/profile', {
      method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '排行榜头像测试', image: avatarImage }),
    });
    assert.equal(uploaded.status, 200);
    const { user } = await uploaded.json();
    assert.match(user.avatarUrl, /^\/avatars\/[a-f0-9-]+\.png$/);
    const expectedUrl = `/api/community${user.avatarUrl}`;
    const getBoard = (headers) => fetch(base + '/api/community/leaderboards', { headers });
    const publicResult = await getBoard();
    assert.equal(publicResult.status, 200);
    assert.match(publicResult.headers.get('cache-control'), /no-store/);
    const { answered: visitors } = await publicResult.json();
    assert.equal(visitors.me, null);
    assert.equal(visitors.top.find((row) => row.name === user.communityName)?.avatarUrl, expectedUrl);
    assert.ok(visitors.top.every((row) => !('userId' in row) && !('avatarFile' in row)));
    assert.equal(visitors.top.find((row) => row.name !== user.communityName)?.avatarUrl, null);

    const signedResult = await getBoard(auth);
    assert.equal(signedResult.status, 200);
    const { answered: signed } = await signedResult.json();
    assert.equal(signed.me.userId, ranked.id);
    assert.equal(signed.me.avatarUrl, expectedUrl);
    assert.equal(signed.top.find((row) => row.userId === ranked.id)?.avatarUrl, expectedUrl);

    for (const url of [expectedUrl, user.avatarUrl]) {
      const image = await fetch(base + url);
      assert.equal(image.status, 200);
      assert.equal(image.headers.get('content-type'), 'image/png');
      assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
      assert.deepEqual(Buffer.from(await image.arrayBuffer()), avatarBytes);
    }
    for (const file of ['not-an-avatar.png', '00000000-0000-0000-0000-000000000000.png', '..%2Fnetwise.sqlite']) {
      const missing = await fetch(`${base}/api/community/avatars/${file}`);
      assert.equal(missing.status, 404);
    }
  } finally {
    if (app) await app.locals.stop();
    if (server) await new Promise((resolve) => server.close(resolve));
    store.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
