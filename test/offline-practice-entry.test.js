import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from '../mobile/node_modules/typescript/lib/typescript.js';
import * as format from '../mobile/src/offline/offlinePackFormat.ts';
import * as core from '../mobile/src/offline/offlineStudyCore.ts';

const user = { id: 'learner', certificateId: 'hcia-datacom' };
const apiBase = 'https://fixture.test/api';
const ownerKey = JSON.stringify([apiBase, user.id, user.certificateId]);
const sha = value => createHash('sha256').update(value).digest('hex');
const image = '/question-images/topology.png';
const imageBytes = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX5sAAAAASUVORK5CYII=';
const questions = Array.from({ length: 32 }, (_, i) => ({
  id: `q${i}`, type: 'single_choice', question: `Question ${i}`, options: { A: 'Yes', B: 'No' },
  answer: ['A'], analysis: 'Explanation', chapter: i === 0 ? 'VLAN' : 'IP routing',
  ...(i === 0 ? { images: [{ src: image }] } : {}),
}));
const packText = JSON.stringify({ schemaVersion: 1, certificate: { id: user.certificateId, name: 'Datacom' },
  questions, media: { [image]: { mimeType: 'image/png', base64: imageBytes } },
  exam: { catalog: { chapters: [] }, modules: [], blueprint: null, secondsPerQuestion: 120 } });
const manifest = { schemaVersion: 1, certificateId: user.certificateId, version: sha(packText), sha256: sha(packText),
  bytes: Buffer.byteLength(packText), questionCount: questions.length, mediaCount: 1 };
const index = { manifest, directory: '20101b7a-0000-4000-8000-000000000000' };
const unavailable = new Error('Network unavailable');

function loadModule(name, dependencies) {
  const source = readFileSync(new URL(`../mobile/src/offline/${name}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const module = { exports: {} };
  vm.runInNewContext(outputText, { module, exports: module.exports, require(key) {
    assert.ok(Object.hasOwn(dependencies, key), `Unexpected dependency ${key}`);
    return dependencies[key];
  } });
  return module.exports;
}

function fixture({ reachable = false, packFileExists = true, statsFail = false } = {}) {
  const endpoint = { API_BASE_URL: apiBase, canReachPracticeApi: async () => reachable };
  const packs = loadModule('offlinePacks.android.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async key =>
      key === 'kaojiang-offline-pack-v1:' + sha(ownerKey) ? JSON.stringify(index) : null } },
    'expo-crypto': { digestStringAsync: async (_, text) => sha(text), CryptoDigestAlgorithm: { SHA256: 'SHA256' } },
    'expo-file-system/legacy': { documentDirectory: 'file:///test/', getInfoAsync: async path =>
      path.endsWith('/pack.json') && packFileExists ? { exists: true, isDirectory: false, size: manifest.bytes } : { exists: false },
    readAsStringAsync: async () => packText },
    '../version': { APP_VERSION: '1.0.18' }, '../api/client': {}, '../api/endpoint': endpoint,
    '../api/transport': {}, './offlinePackFormat': format,
  });
  let onlineReads = 0;
  const practice = loadModule('offlinePractice.android.ts', {
    react: {}, '../navigation/ScreenActivity': {}, './offlineStudyCore': core, './offlinePacks.android': packs,
    '../api/endpoint': endpoint, '../api/transport': { isApiUnavailable: error => error === unavailable },
    '../api/ownedPractice.android': { practiceOwner: () => ownerKey, keepPracticeQuestion: () => true,
      loadOwnedPractice: async () => { onlineReads++; if (!reachable) throw unavailable; return { items: [{ id: 'server-only' }] }; } },
    '../api/practiceCheckpointStore': { practiceScope: () => 'daily' },
    '../api/practiceCheckpoint.android': { practiceCheckpoint: { read: async () => null, find: async () => null,
      history: async () => { if (statsFail) throw Error('history unavailable'); return {}; } } },
    './offlineStudyStore.android': { offlineStudyStore: { progress: async () => {
      if (statsFail) throw Error('progress unavailable');
      return { answered: new Set(), wrong: new Set(), favorites: new Set() };
    } } },
  });
  return { open: practice.openPracticeWithDownloadedBank, onlineReads: () => onlineReads };
}

test('daily and chapter practice open an installed bank without loading questions over the network', async () => {
  const f = fixture({ statsFail: true });
  const daily = await f.open(user, { session: 'daily', mode: 'random' });
  assert.equal(daily.source, 'download');
  assert.equal(new Set(daily.loaded.items.map(q => q.id)).size, 30);
  const chapter = await f.open(user, { session: 'standard', mode: 'sequential', chapter: 'VLAN' });
  assert.equal(chapter.loaded.items.length, 1);
  assert.equal(chapter.loaded.items[0].id, 'q0');
  assert.equal(chapter.installed.imageUri(image), 'data:image/png;base64,' + imageBytes);
  assert.equal(core.gradeOfflineAnswer(chapter.loaded.items[0], ['A']), true);
  assert.equal(f.onlineReads(), 0);
});

test('online practice still uses the server; an orphaned local index reports an incomplete download', async () => {
  const online = await fixture({ reachable: true }).open(user, { session: 'daily', mode: 'random' });
  assert.equal(online.source, 'online');
  assert.equal(online.loaded.items[0].id, 'server-only');
  await assert.rejects(fixture({ packFileExists: false }).open(user, { session: 'daily', mode: 'random' }), /本机学习包不完整/);
  await assert.rejects(fixture().open({ ...user, certificateId: 'another-certificate' }, { session: 'daily', mode: 'random' }), /当前备考证书没有可读取的本地题库/);
});
