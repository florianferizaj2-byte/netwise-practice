import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from '../mobile/node_modules/typescript/lib/typescript.js';
import { createApp } from '../server/index.js';
import { createStore } from '../server/store.js';

// Execute the same dependency-free client used by React Native.
const source = fs.readFileSync(new URL('../mobile/src/announcements/client.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { AnnouncementClient, DEFAULT_ANNOUNCEMENT, ANNOUNCEMENT_CACHE_KEY, parseAnnouncement } =
  await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const notice = (extra = {}) => ({ ...DEFAULT_ANNOUNCEMENT, id: 'notice-1', title: '学习安排', body: '第一版公告正文', ...extra });
const memory = (initial = null) => {
  let saved = initial;
  return { getItem: async () => saved, setItem: async (key, value) => {
    assert.equal(key, ANNOUNCEMENT_CACHE_KEY); saved = value;
  }, stored: () => saved };
};

test('public announcement is available without login and edits apply without restarting the server', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aceexam-announcement-'));
  const file = path.join(dir, 'announcement.json');
  fs.writeFileSync(file, JSON.stringify(notice()));
  const store = createStore(dir);
  const app = await createApp({ store, withFrontend: false, authRequired: true, announcementFile: file });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await app.locals.stop();
    await new Promise((resolve) => server.close(resolve));
    store.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = () => fetch(`${base}/api/mobile/announcement`, { headers: { 'X-Client': 'mobile', 'X-App-Version': '0.0.1' } });
  const first = await get();
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await first.json(), notice());
  assert.equal((await fetch(`${base}/api/dashboard`)).status, 401);
  const changed = notice({ body: '文件改完即为第二版', enabled: false });
  fs.writeFileSync(file, JSON.stringify(changed));
  assert.deepEqual(await (await get()).json(), changed);
  for (const invalid of ['{', JSON.stringify(notice({ schemaVersion: 2 })), JSON.stringify(notice({ html: '<script>1</script>' })), 'x'.repeat(33 * 1024)]) {
    fs.writeFileSync(file, invalid);
    const response = await get();
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: '公告暂时不可用，请稍后重试' });
  }
  fs.unlinkSync(file);
  assert.equal((await get()).status, 503);
});

test('client replaces and persists text changes even if the announcement id is unchanged', async () => {
  const storage = memory(JSON.stringify(notice()));
  let remote = notice({ body: '在线更新，无需重新安装' });
  const client = new AnnouncementClient(storage, async () => remote);
  await client.hydrate();
  assert.equal(client.snapshot().body, '第一版公告正文');
  await client.refresh(true);
  assert.equal(client.snapshot().body, remote.body);
  assert.deepEqual(JSON.parse(storage.stored()), remote);
  remote = notice({ title: '已修改标题', body: '再次更新' });
  await client.refresh(true);
  assert.deepEqual(client.snapshot(), remote);
});

test('offline relaunch and malformed responses keep the last valid content', async () => {
  const storage = memory(JSON.stringify(notice()));
  let response = () => { throw new Error('offline'); };
  const client = new AnnouncementClient(storage, async () => response());
  await client.refresh(true);
  assert.deepEqual(client.snapshot(), notice());
  for (const invalid of [null, [], {}, notice({ schemaVersion: 2 }), notice({ body: 'x'.repeat(8001) }), notice({ action: 'execute' }), notice({ updatedAt: 'yesterday' })]) {
    response = () => invalid;
    await client.refresh(true);
    assert.deepEqual(client.snapshot(), notice());
    assert.deepEqual(JSON.parse(storage.stored()), notice());
  }
});

test('disabled announcements stay disabled after offline relaunch', async () => {
  const storage = memory();
  const client = new AnnouncementClient(storage, async () => notice({ enabled: false }));
  await client.refresh(true);
  assert.equal(client.snapshot().enabled, false);
  const offline = new AnnouncementClient(storage, async () => { throw new Error('offline'); });
  await offline.refresh(true);
  assert.equal(offline.snapshot().enabled, false);
});

test('slow hydration cannot replace fresh content; concurrent requests are coalesced', async () => {
  let finishRead;
  let finishRequest;
  let calls = 0;
  const storage = { getItem: () => new Promise((resolve) => { finishRead = resolve; }), setItem: async () => {} };
  const client = new AnnouncementClient(storage, () => { calls += 1; return new Promise((resolve) => { finishRequest = resolve; }); });
  const hydration = client.hydrate();
  const refresh = client.refresh(true);
  assert.equal(client.refresh(true), refresh);
  finishRead(JSON.stringify(notice({ body: '旧缓存' })));
  await hydration;
  await Promise.resolve();
  assert.equal(calls, 1);
  finishRequest(notice({ body: '新的线上内容' }));
  await refresh;
  assert.equal(client.snapshot().body, '新的线上内容');
});

test('refresh throttles normal calls, allows explicit refresh and recovers from cache failure', async () => {
  let calls = 0;
  let now = 1000;
  const client = new AnnouncementClient({ getItem: async () => '{', setItem: async () => { throw new Error('storage full'); } },
    async () => { calls += 1; return notice(); }, () => now);
  await client.refresh();
  await client.refresh();
  assert.equal(calls, 1);
  await client.refresh(true);
  assert.equal(calls, 2);
  now += 60_001;
  await client.refresh();
  assert.equal(calls, 3);
  assert.deepEqual(client.snapshot(), notice());
});

test('bundled placeholder and checked-in announcement use the same supported plain text format', () => {
  const file = JSON.parse(fs.readFileSync(new URL('../server/mobile-announcement.json', import.meta.url), 'utf8'));
  assert.deepEqual(parseAnnouncement(file), DEFAULT_ANNOUNCEMENT);
  const inert = notice({ body: '<script>globalThis.changed = true</script>' });
  assert.equal(parseAnnouncement(inert).body, inert.body);
  assert.equal(globalThis.changed, undefined);
});
