import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createApp } from '../server/index.js';
import { createStore } from '../server/store.js';
import {
  emptyDraft,
  updateCue,
  cueClips,
  draftIssues,
  filterVoiceAssets,
  validateVoiceFile,
  importCollection,
  editDraft,
} from '../src/features/admin/voice-library-model.js';
const uuid = () => crypto.randomUUID();
const wav = fs.readFileSync(
  new URL('../mobile/assets/sounds/answer-correct-soft.wav', import.meta.url),
);
test('voice editor and filters preserve unique scene references and distinguish unknown durations', () => {
  let draft = emptyDraft('test', '测试');
  draft = updateCue(draft, 'answer.correct', ['a', 'a']);
  assert.deepEqual(cueClips(draft, 'answer.correct'), ['a']);
  draft = updateCue(draft, 'streak:3', ['b']);
  assert.equal(draft.cues['answer.streak'][0].count, 3);
  draft = updateCue(draft, 'streak:3', []);
  assert.equal(draft.cues['answer.streak'].length, 0);
  assert.throws(() => updateCue(draft, 'streak:0', ['a']));
  assert.throws(() =>
    updateCue(
      draft,
      'answer.correct',
      Array.from({ length: 9 }, (_, i) => String(i)),
    ),
  );
  const assets = [
    {
      id: 'a',
      name: '你好',
      tags: ['入场'],
      collection: '卢音',
      state: 'ready',
      durationMs: 1000,
      bytes: 10,
    },
    {
      id: 'b',
      name: '鼓励',
      tags: [],
      collection: '嘎子',
      state: 'pending',
      durationMs: null,
      bytes: 10,
    },
  ];
  assert.equal(filterVoiceAssets(assets, { search: '入场' }).length, 1);
  assert.equal(filterVoiceAssets(assets, { short: true }).length, 1);
  assert.equal(
    filterVoiceAssets(assets, { collection: '嘎子', state: 'pending' }).length,
    1,
  );
  assert.equal(draftIssues(draft, assets).length, 0);
  assert.ok(draftIssues(draft, []).length);
  assert.equal(
    importCollection({ webkitRelativePath: '卢音盒音效/你好.mp3' }),
    '卢音盒音效',
  );
  assert.ok(validateVoiceFile({ name: 'bad.exe', size: 100 }));
  assert.ok(validateVoiceFile({ name: 'large.mp3', size: 5 * 1024 * 1024 }));
  assert.equal(validateVoiceFile({ name: '正常.mp3', size: 100 }), '');
  const { basedOnRevision, ...published } = draft;
  assert.equal(
    editDraft({ ...published, revision: 5 }, null).basedOnRevision,
    5,
  );
  assert.equal(editDraft({ ...published, revision: 5 }, null).revision, 0);
  assert.equal(
    editDraft({ ...draft, revision: 5 }, null).basedOnRevision,
    0,
    'a saved draft keeps its original publication base',
  );
});
test('voice library metadata, independent drafts and review-gated publication survive restart safely', async (t) => {
  const parent = fs.realpathSync(os.tmpdir()),
    dir = fs.mkdtempSync(path.join(parent, 'voice-library-test-'));
  let store, app, server, base;
  const boot = async () => {
    store = createStore(dir);
    app = await createApp({ store, withFrontend: false, authRequired: true });
    server = app.listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    base = 'http://127.0.0.1:' + server.address().port;
  };
  const close = async () => {
    await app.locals.stop();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    store.db.close();
  };
  await boot();
  t.after(async () => {
    await close();
    assert.equal(path.dirname(fs.realpathSync(dir)), parent);
    assert.ok(path.basename(dir).startsWith('voice-library-test-'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const user = store.register('voice_library_admin', 'fixture-password-123');
  store.db.prepare('UPDATE users SET is_admin=1 WHERE id=?').run(user.id);
  const token = store.createAuthSession(user.id);
  const ordinary = store.register(
      'voice_library_reader',
      'fixture-password-123',
    ),
    otherToken = store.createAuthSession(ordinary.id);
  async function call(url, method = 'GET', body, auth = token, raw) {
    const r = await fetch(base + url, {
      method,
      headers: {
        Authorization: 'Bearer ' + auth,
        'Content-Type': raw ? 'application/octet-stream' : 'application/json',
      },
      ...(raw ? { body: raw } : body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, data: await r.json() };
  }
  let r = await call(
    '/api/admin/voice-packs/assets?name=hello.mp3&collection=' +
      encodeURIComponent('卢音') +
      '&durationMs=1200',
    'POST',
    undefined,
    token,
    wav,
  );
  assert.equal(r.status, 200);
  const asset = r.data.asset;
  assert.equal(asset.state, 'pending');
  assert.equal(asset.collection, '卢音');
  assert.equal(
    asset.durationMs,
    240,
    'header-derived WAV duration remains authoritative',
  );
  const cues = {
    'practice.enter': [asset.id],
    'answer.correct': [asset.id],
    'answer.streak': [{ count: 2, clips: [asset.id] }],
  };
  const save = {
    requestId: uuid(),
    expectedRevision: 0,
    basedOnRevision: 0,
    name: '卢音包',
    cues,
    playback: { maxDurationMs: 2500, minIntervalMs: 150 },
  };
  r = await call('/api/admin/voice-packs/lu-voice/draft', 'PUT', save);
  assert.equal(r.status, 200);
  assert.equal(r.data.draft.revision, 1);
  assert.equal((await call('/api/voice-packs')).data.packs.length, 0);
  assert.equal((await call('/api/voice-packs/lu-voice/manifest')).status, 404);
  let command = { requestId: uuid(), expectedRevision: 0, draftRevision: 1 };
  assert.equal(
    (await call('/api/admin/voice-packs/lu-voice/publish', 'POST', command))
      .status,
    409,
    'pending material cannot be published',
  );
  r = await call('/api/admin/voice-packs/assets', 'PATCH', {
    requestId: uuid(),
    items: [
      {
        id: asset.id,
        expectedRevision: 0,
        name: '你好',
        collection: '卢音',
        tags: ['入场', '鼓励'],
        state: 'ready',
      },
    ],
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.assets[0].revision, 1);
  assert.equal(
    (
      await call(
        '/api/admin/voice-packs/assets',
        'PATCH',
        {
          requestId: uuid(),
          items: [{ id: asset.id, expectedRevision: 1, state: 'disabled' }],
        },
        otherToken,
      )
    ).status,
    403,
  );
  assert.equal(
    (await call('/api/admin/voice-packs/lu-voice/publish', 'POST', command))
      .status,
    200,
    'rejected requests do not consume their idempotency key',
  );
  const published = (await call('/api/voice-packs/lu-voice/manifest')).data;
  assert.equal(published.name, '卢音包');
  assert.equal(published.revision, 1);
  // Saving a replacement draft must not mutate, unpublish or silently change live cues.
  const replacement = {
    ...save,
    requestId: uuid(),
    expectedRevision: 0,
    basedOnRevision: 1,
    name: '下一版卢音包',
  };
  r = await call('/api/admin/voice-packs/lu-voice/draft', 'PUT', replacement);
  assert.equal(r.status, 200);
  assert.equal(
    (await call('/api/voice-packs/lu-voice/manifest')).data.name,
    '卢音包',
  );
  r = await call('/api/admin/voice-packs');
  assert.equal(r.data.drafts.length, 1);
  assert.equal(r.data.assets[0].usedBy.length, 2);
  const stale = await call('/api/admin/voice-packs/lu-voice/draft', 'PUT', {
    ...replacement,
    requestId: uuid(),
  });
  assert.equal(stale.status, 409);
  const disabled = await call('/api/admin/voice-packs/assets', 'PATCH', {
    requestId: uuid(),
    items: [{ id: asset.id, expectedRevision: 1, state: 'disabled' }],
  });
  assert.equal(disabled.status, 409);
  assert.equal(disabled.data.code, 'VOICE_ASSET_IN_USE');
  const bulk = await call('/api/admin/voice-packs/assets', 'PATCH', {
    requestId: uuid(),
    items: [
      { id: asset.id, expectedRevision: 1, name: 'should-roll-back' },
      { id: 'f'.repeat(64), expectedRevision: 0, name: 'missing' },
    ],
  });
  assert.equal(bulk.status, 404);
  assert.equal(
    (await call('/api/admin/voice-packs')).data.assets[0].name,
    '你好',
  );
  await close();
  await boot();
  r = await call('/api/admin/voice-packs');
  assert.equal(r.data.drafts[0].name, '下一版卢音包');
  assert.deepEqual(r.data.assets[0].tags, ['入场', '鼓励']);
  command = { requestId: uuid(), expectedRevision: 1, draftRevision: 1 };
  r = await call('/api/admin/voice-packs/lu-voice/publish', 'POST', command);
  assert.equal(r.status, 200);
  assert.equal(r.data.pack.revision, 2);
  assert.equal((await call('/api/admin/voice-packs')).data.drafts.length, 0);
  assert.equal(
    (await call('/api/voice-packs/lu-voice/manifest')).data.name,
    '下一版卢音包',
  );
  const replay = await call(
    '/api/admin/voice-packs/lu-voice/publish',
    'POST',
    command,
  );
  assert.equal(replay.data.replayed, true);
  assert.equal(replay.data.pack.revision, 2);
  const settings = (await call('/api/admin/voice-packs')).data.configuration;
  await call('/api/admin/voice-packs/default', 'PUT', {
    requestId: uuid(),
    expectedRevision: settings.revision,
    packId: 'lu-voice',
  });
  r = await call('/api/admin/voice-packs/lu-voice', 'PUT', {
    requestId: uuid(),
    expectedRevision: 2,
    name: '下一版卢音包',
    enabled: false,
    cues,
    playback: save.playback,
  });
  assert.equal(r.status, 200);
  r = await call('/api/admin/voice-packs/assets', 'PATCH', {
    requestId: uuid(),
    items: [{ id: asset.id, expectedRevision: 1, state: 'disabled' }],
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.assets[0].state, 'disabled');
  assert.equal((await call('/api/voice-packs')).data.defaultPackId, null);

  // Both entry points count the same union; publishing an existing draft does not consume another slot.
  const insertDraft = store.db.prepare(
    'INSERT INTO voice_pack_drafts VALUES(?,?,?,?,?)',
  );
  for (let i = 0; i < 99; i++)
    insertDraft.run(
      'limit-' + i,
      1,
      0,
      JSON.stringify({
        name: 'Slot',
        cues: {
          'practice.enter': [],
          'answer.correct': [],
          'answer.streak': [],
        },
        playback: save.playback,
      }),
      new Date().toISOString(),
    );
  const emptyPack = {
    requestId: uuid(),
    expectedRevision: 0,
    name: 'Slot',
    enabled: false,
    cues: { 'practice.enter': [], 'answer.correct': [], 'answer.streak': [] },
    playback: save.playback,
  };
  assert.equal(
    (await call('/api/admin/voice-packs/overflow', 'PUT', emptyPack)).status,
    409,
  );
  assert.equal(
    (
      await call('/api/admin/voice-packs/limit-0', 'PUT', {
        ...emptyPack,
        requestId: uuid(),
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call('/api/admin/voice-packs/overflow/draft', 'PUT', {
        ...save,
        requestId: uuid(),
      })
    ).status,
    409,
  );
});
