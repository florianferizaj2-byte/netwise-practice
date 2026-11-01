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
