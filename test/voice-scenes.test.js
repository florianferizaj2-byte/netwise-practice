import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { createStore } from '../server/store.js';
import { createApp } from '../server/index.js';
import {
  emptyDraft,
  updateCue,
  setCueMode,
  cueMode,
  cueClips,
  usedAssetIds,
} from '../src/features/admin/voice-library-model.js';
const source = fs.readFileSync(
    new URL('../mobile/src/api/voicePacks.ts', import.meta.url),
    'utf8',
  ),
  sdk = await import(
    'data:text/javascript;base64,' +
      Buffer.from(stripTypeScriptTypes(source, { mode: 'transform' })).toString(
        'base64',
      )
  );
const id = () => crypto.randomUUID();
test('wrong tiers are consecutive, reset on correct, replay-safe and exact through fifth-or-later', () => {
  const round = sdk.createPracticeVoiceSession();
  round.enter('r');
  for (let n = 1; n <= 7; n++) {
    const cue = round.answer('w' + n, false);
    assert.equal(cue.event, 'answer.wrong');
    assert.equal(cue.streak, n);
    assert.equal(
      sdk.voiceCueScene({ cues: {} }, cue),
      'wrong:' + Math.min(n, 5),
    );
    assert.equal(round.answer('w' + n, false), null);
  }
  assert.equal(round.answer('ok', true).streak, 1);
  assert.equal(round.answer('again', false).streak, 1);
  round.enter('new');
  assert.equal(round.answer('again', false).streak, 1);
});
test('admin candidate pools preserve only selected IDs, fixed mode is single-valued and legacy drafts work', () => {
  let d = emptyDraft('x', 'X');
  d = updateCue(d, 'wrong:1', ['a', 'b']);
  assert.deepEqual(cueClips(d, 'wrong:1'), ['a', 'b']);
  assert.ok(usedAssetIds(d).includes('b'));
  d = setCueMode(d, 'wrong:1', 'fixed');
  assert.equal(cueMode(d, 'wrong:1'), 'fixed');
  assert.deepEqual(cueClips(d, 'wrong:1'), ['a']);
  assert.throws(() => updateCue(d, 'wrong:1', ['a', 'b']));
  d = setCueMode(d, 'wrong:1', 'random');
  d = updateCue(d, 'wrong:1', ['a', 'b']);
  assert.deepEqual(cueClips(d, 'wrong:1'), ['a', 'b']);
  assert.throws(() => updateCue(d, 'wrong:6', ['a']));
});
test('server publishes wrong-only voices, persists fixed/random choices, rejects bad tiers and enforces the same draft validation', async (t) => {
  const parent = fs.realpathSync(os.tmpdir()),
    dir = fs.mkdtempSync(path.join(parent, 'wrong-voice-test-'));
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
    assert.ok(path.basename(dir).startsWith('wrong-voice-test-'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const user = store.register('wrong_voice_admin', 'fixture-password-123');
  store.db.prepare('UPDATE users SET is_admin=1 WHERE id=?').run(user.id);
  const token = store.createAuthSession(user.id);
  const call = async (url, method = 'GET', body, raw) => {
    const response = await fetch(base + url, {
      method,
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': raw ? 'application/octet-stream' : 'application/json',
      },
      ...(raw ? { body: raw } : body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  };
  const assets = [];
  for (const tone of ['soft', 'warm']) {
    const bytes = fs.readFileSync(
      new URL(
        '../mobile/assets/sounds/answer-correct-' + tone + '.wav',
        import.meta.url,
      ),
    );
    const r = await call(
      '/api/admin/voice-packs/assets?name=' + tone + '.wav',
      'POST',
      undefined,
      bytes,
    );
    assert.equal(r.status, 200);
    assets.push(r.data.asset.id);
  }
  await call('/api/admin/voice-packs/assets', 'PATCH', {
    requestId: id(),
    items: assets.map((asset) => ({
      id: asset,
      expectedRevision: 0,
      state: 'ready',
    })),
  });
  const cues = {
      'practice.enter': [],
      'answer.correct': [],
      'answer.streak': [],
      'answer.wrong': [1, 2, 3, 4, 5].map((count) => ({
        count,
        clips: assets,
      })),
    },
    playback = {
      maxDurationMs: 2500,
      minIntervalMs: 150,
      selectionModes: { 'wrong:1': 'random' },
    },
    body = {
      requestId: id(),
      expectedRevision: 0,
      name: 'Wrong voices',
      enabled: true,
      cues,
      playback,
    };
  let r = await call('/api/admin/voice-packs/wrong', 'PUT', body);
  assert.equal(r.status, 200);
  assert.equal(r.data.pack.assets.length, 2);
  const uri = r.data.pack.assets[0].url;
  assert.equal(
    (await fetch(base + uri)).status,
    200,
    'wrong-only references expose exactly the approved published media',
  );
  const duplicate = {
    ...body,
    requestId: id(),
    expectedRevision: 1,
    cues: {
      ...cues,
      'answer.wrong': [
        { count: 1, clips: assets },
        { count: 1, clips: assets },
      ],
    },
  };
  assert.equal(
    (await call('/api/admin/voice-packs/wrong', 'PUT', duplicate)).status,
    400,
  );
  assert.equal(
    (
      await call('/api/admin/voice-packs/wrong', 'PUT', {
        ...body,
        requestId: id(),
        expectedRevision: 1,
        cues: { ...cues, 'answer.wrong': [{ count: 6, clips: assets }] },
      })
    ).status,
    400,
  );
  const invalidPlayback = {
    ...playback,
    selectionModes: { 'wrong:1': 'fixed' },
  };
  assert.equal(
    (
      await call('/api/admin/voice-packs/wrong', 'PUT', {
        ...body,
        requestId: id(),
        expectedRevision: 1,
        playback: invalidPlayback,
      })
    ).status,
    400,
  );
  const { enabled, ...draft } = body;
  assert.equal(
    (
      await call('/api/admin/voice-packs/wrong/draft', 'PUT', {
        ...draft,
        requestId: id(),
        basedOnRevision: 1,
        playback: invalidPlayback,
      })
    ).status,
    400,
  );
  await close();
  await boot();
  r = await call('/api/voice-packs/wrong/manifest');
  assert.equal(r.status, 200);
  assert.equal(r.data.cues['answer.wrong'].length, 5);
  assert.equal(r.data.playback.selectionModes['wrong:1'], 'random');
  const catalog = await call('/api/voice-packs');
  assert.ok(catalog.data.contract.events.includes('answer.wrong'));
});
