import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.js';
import { createStore } from '../server/store.js';
import { createMobileAnnouncementService } from '../server/mobile-announcement.js';

async function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aceexam-mobile-admin-'));
  const store = createStore(directory);
  const admin = store.register('mobile_admin_fixture', 'fixture-password-123');
  const learner = store.register('mobile_member_fixture', 'fixture-password-123');
  const adminToken = store.createAuthSession(admin.id);
  const learnerToken = store.createAuthSession(learner.id);
  const app = await createApp({ store, withFrontend: false, authRequired: true });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await app.locals.stop(); await new Promise((resolve) => server.close(resolve)); store.db.close();
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('aceexam-mobile-admin-'));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const request = async (url, body, token = adminToken) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${url}`, {
      method: body === undefined ? 'GET' : 'PUT', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, cacheControl: response.headers.get('cache-control'), data: await response.json() };
  };
  return { store, admin, learner, adminToken, learnerToken, request, directory };
}
const edit = (user, extra = {}) => ({ revision: user.revision, communityName: user.communityName,
  certificateId: user.certificateId, membershipPlan: user.membershipPlan, membershipExpiresAt: user.membershipExpiresAt, ...extra });

test('mobile admin account and announcement reads/writes reject guests and ordinary users', async (t) => {
  const { request, learner, learnerToken } = await fixture(t);
  for (const token of [null, learnerToken]) {
    for (const [url, body] of [ ['/admin/mobile/users', undefined], [`/admin/mobile/users/${learner.id}`, undefined],
      [`/admin/mobile/users/${learner.id}`, {}], ['/admin/mobile/announcement', undefined], ['/admin/mobile/announcement', {}] ]) {
      const result = await request(url, body, token);
      assert.equal(result.status, token ? 403 : 401);
      assert.equal(result.data.users, undefined);
      assert.equal(result.data.announcement, undefined);
    }
  }
});

test('account list is bounded, searchable, filterable and contains no password or session secrets', async (t) => {
  const { request, store, learner } = await fixture(t);
  store.updateCommunityName(learner.id, '可搜索昵称');
  for (let index = 0; index < 35; index++) store.registerWithHash(`extra_mobile_${index}`, 'fixture-salt', 'fixture-hash');
  const first = await request('/admin/mobile/users?limit=10');
  assert.equal(first.status, 200); assert.equal(first.data.total, 37); assert.equal(first.data.users.length, 10); assert.equal(first.data.nextOffset, 10);
  assert.equal(first.cacheControl, 'no-store');
  const next = await request('/admin/mobile/users?limit=10&offset=10');
  assert.ok(next.data.users.every((user) => !first.data.users.some((previous) => previous.id === user.id)));
  const match = await request(`/admin/mobile/users?search=${encodeURIComponent('可搜索昵称')}`);
  assert.equal(match.data.users[0].id, learner.id);
  assert.equal((await request('/admin/mobile/users?search=%25')).data.total, 0, 'search wildcard must be treated as literal text');
  store.setUserBanned(learner.id, true, 'fixture reason');
  assert.equal((await request('/admin/mobile/users?status=banned')).data.total, 1);
  assert.equal((await request('/admin/mobile/users?status=active')).data.total, 36);
  const user = (await request(`/admin/mobile/users/${learner.id}`)).data.user;
  assert.ok(user.createdAt && user.revision);
  for (const key of ['password_hash', 'passwordHash', 'salt', 'sessionToken', 'apiKey', 'keyCipher']) assert.equal(user[key], undefined);
  assert.equal((await request('/admin/mobile/users?limit=1000')).status, 400);
});

test('account changes persist, affect the target account, are audited and protect against stale overwrites', async (t) => {
  const { request, store, learner, learnerToken } = await fixture(t);
  const before = (await request(`/admin/mobile/users/${learner.id}`)).data.user;
  const expiresAt = new Date(Date.now() + 90 * 86400000).toISOString();
  const changed = await request(`/admin/mobile/users/${learner.id}`, edit(before, { communityName: '新昵称', certificateId: 'hcia-datacom', membershipPlan: 'vip', membershipExpiresAt: expiresAt }));
  assert.equal(changed.status, 200); assert.equal(changed.data.user.membershipPlan, 'vip');
  assert.equal(store.userById(learner.id).communityName, '新昵称');
  assert.equal((await request('/auth/me', undefined, learnerToken)).data.user.certificateId, 'hcia-datacom');
  assert.equal((await request('/account/entitlements', undefined, learnerToken)).data.plan, 'vip');
  assert.ok(store.auditRows().some((row) => row.action === 'mobile_user_updated' && row.targetId === learner.id));
  assert.equal((await request(`/admin/mobile/users/${learner.id}`, edit(before))).status, 409);
  const current = changed.data.user;
  for (const extra of [{ isAdmin: true }, { username: 'stolen' }, { password: 'new-password' }, { apiConfigUnlocked: true }]) {
    assert.equal((await request(`/admin/mobile/users/${learner.id}`, edit(current, extra))).status, 400);
  }
  assert.equal((await request(`/admin/mobile/users/${learner.id}`, edit(current, { certificateId: 'unknown-certificate' }))).status, 400);
  assert.equal((await request(`/admin/mobile/users/${learner.id}`, edit(current, { membershipExpiresAt: '2000-01-01T00:00:00Z' }))).status, 400);
  assert.equal(store.userById(learner.id).isAdmin, false);
  const removed = await request(`/admin/mobile/users/${learner.id}`, edit(current, { membershipPlan: 'free', membershipExpiresAt: null }));
  assert.equal(removed.status, 200); assert.equal(store.accountEntitlement(learner.id).plan, 'free');
});

test('ban/unban invalidates target sessions and preserves administrator safeguards', async (t) => {
  const { request, admin, learner, learnerToken } = await fixture(t);
  const banned = await request(`/admin/users/${learner.id}/ban`, { banned: true, reason: '测试封禁' });
  assert.equal(banned.status, 200); assert.ok(banned.data.user.bannedAt);
  assert.equal((await request('/auth/me', undefined, learnerToken)).data.authenticated, false);
  assert.equal((await request(`/admin/users/${admin.id}/ban`, { banned: true })).status, 400);
  const unbanned = await request(`/admin/users/${learner.id}/ban`, { banned: false });
  assert.equal(unbanned.status, 200); assert.equal(unbanned.data.user.bannedAt, null);
});

test('admin announcement save updates the public endpoint immediately, survives restart and detects concurrent edits', async (t) => {
  const { request, store, directory } = await fixture(t);
  const first = (await request('/admin/mobile/announcement')).data;
  const fields = { revision: first.revision, title: '管理员新公告', body: '保存后无需安装新的 App', enabled: true };
  const saved = await request('/admin/mobile/announcement', fields);
  assert.equal(saved.status, 200);
  assert.equal((await request('/mobile/announcement', undefined, null)).data.body, fields.body);
  assert.equal((await request('/admin/mobile/announcement', fields)).status, 409);
  assert.ok(store.auditRows().some((row) => row.action === 'mobile_announcement_updated'));
  const restart = await createMobileAnnouncementService({ file: path.join(directory, 'mobile-announcement.json') });
  assert.equal((await restart.read()).title, fields.title);
  const concurrent = await Promise.all([request('/admin/mobile/announcement', { ...fields, revision: saved.data.revision, title: '甲公告' }),
    request('/admin/mobile/announcement', { ...fields, revision: saved.data.revision, title: '乙公告' })]);
  assert.deepEqual(concurrent.map((result) => result.status).sort(), [200, 409]);
  const last = (await request('/admin/mobile/announcement')).data;
  const hidden = await request('/admin/mobile/announcement', { ...fields, revision: last.revision, enabled: false });
  assert.equal(hidden.status, 200); assert.equal((await request('/mobile/announcement', undefined, null)).data.enabled, false);
  assert.equal((await request('/admin/mobile/announcement', { ...fields, revision: hidden.data.revision, script: 'execute' })).status, 400);
  assert.deepEqual(fs.readdirSync(directory).filter((file) => file.endsWith('.tmp')), []);
});
