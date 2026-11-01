import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from '../mobile/node_modules/typescript/lib/typescript.js';
const read = (f) =>
  fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
function load(file, deps = {}) {
  const exports = {};
  const module = { exports };
  vm.runInNewContext(
    ts.transpileModule(read(file), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      module,
      Error,
      AbortController,
      URL,
      setTimeout,
      clearTimeout,
      Map,
      Set,
      Date,
      Math,
      require: (n) => {
        if (n in deps) return deps[n];
        throw Error('Unexpected dependency ' + n);
      },
    },
  );
  return module.exports;
}
const protocol = load('mobile/src/api/voicePacks.ts'),
  model = load('mobile/src/practiceVoiceEngine.ts', {
    './api/voicePacks': protocol,
  }),
  policy = load('mobile/src/api/versionPolicy.ts');
const asset = (n) => ({
  id: String(n).repeat(64),
  sha256: String(n).repeat(64),
  url: '/voice-packs/assets/' + String(n).repeat(64),
  bytes: 120,
  format: 'mp3',
  durationMs: 200,
  mimeType: 'audio/mpeg',
});
const manifest = () => ({
  id: 'test',
  name: 'Test',
  schemaVersion: 1,
  revision: 1,
  enabled: true,
  updatedAt: 'now',
  cues: {
    'practice.enter': ['1'.repeat(64)],
    'answer.correct': ['2'.repeat(64)],
    'answer.streak': [{ count: 2, clips: ['3'.repeat(64)] }],
  },
  playback: { maxDurationMs: 2500, minIntervalMs: 150 },
  assets: [1, 2, 3].map(asset),
  fallback: 'builtin',
});
function fixture() {
  const pack = manifest(),
    local = new Map(),
    events = [],
    calls = { catalog: 0, manifest: 0, download: 0 };
  let now = 0,
    online = true,
    blocked = false,
    fail = false;
  const settings = { soundEnabled: true, volume: 0.32 };
  const deps = {
    async catalog() {
      calls.catalog++;
      if (!online) throw Error('offline');
      return { packs: [pack], defaultPackId: pack.id };
    },
    async manifest() {
      calls.manifest++;
      return pack;
    },
    async read(id) {
      return local.get(id) ?? null;
    },
    async save(p) {
      local.set(p.id, p);
    },
    async list() {
      return [...local.values()].map((p) => ({
        id: p.id,
        name: p.name,
        revision: p.revision,
        bytes: 360,
      }));
    },
    async remove(id) {
      local.delete(id);
    },
    async prepare(a, download, signal) {
      if (download) calls.download++;
      if (fail) throw Error('hash mismatch');
      if (signal.aborted) throw Error('cancelled');
      return {
        ready: () => true,
        play: (volume, max, current) => {
          if (!current()) return false;
          events.push([a.id[0], volume, max]);
          return true;
        },
        stop() {},
        release() {},
      };
    },
    settings: () => settings,
    active: () => !blocked,
    now: () => now,
    random: () => 0,
  };
  return {
    api: model.createVoiceEngine(deps),
    pack,
    local,
    events,
    calls,
    settings,
    deps,
    time: () => {
      now += 200;
    },
    offline: () => (online = false),
    background: () => (blocked = true),
    fail: () => (fail = true),
  };
}

test('download is explicit and verified before activation; answering never fetches or downloads', async () => {
  const f = fixture();
  await f.api.setAccount('a');
  assert.equal(f.calls.download, 0);
  assert.equal(f.api.enter('round'), false);
  assert.equal(await f.api.download('test'), true);
  f.api.select('test');
  await f.api.refresh();
  assert.equal(f.api.getStatus().state, 'ready');
  const before = { ...f.calls };
  f.time();
  assert.equal(f.api.enter('next'), true);
  f.time();
  f.api.answer('next', 'a', true, () => true);
  f.time();
  f.api.answer('next', 'b', true, () => true);
  assert.deepEqual(
    f.events.map((e) => e[0]),
    ['1', '2', '3'],
  );
  assert.deepEqual(f.calls, before);
  f.time();
  f.api.answer('next', 'b', true, () => true);
  assert.equal(f.events.length, 3);
  f.api.answer('next', 'wrong', false, () => true);
  f.time();
  f.api.answer('next', 'c', true, () => true);
  assert.equal(f.events.at(-1)[0], '2');
});
test('downloaded selection works offline and respects mute, background and visibility', async () => {
  const f = fixture();
  await f.api.setAccount('a');
  await f.api.download('test');
  f.api.select('test');
  f.offline();
  await f.api.refresh();
  assert.equal(f.api.getStatus().state, 'ready');
  f.settings.soundEnabled = false;
  assert.equal(f.api.preview(), false);
  f.settings.soundEnabled = true;
  assert.equal(
    f.api.preview(() => false),
    false,
  );
  f.background();
  assert.equal(f.api.preview(), false);
});
test('failed download is not marked downloaded; logout releases and cancels stale playback', async () => {
  const f = fixture();
  await f.api.setAccount('a');
  f.fail();
  assert.equal(await f.api.download('test'), false);
  assert.equal(f.local.size, 0);
  assert.equal(f.api.getStatus().downloadId, null);
  assert.match(f.api.getStatus().message, /hash/);
  await f.api.setAccount(null);
  assert.equal(f.api.preview(), false);
  assert.equal(f.api.getStatus().downloads.length, 0);
});
test('malformed manifests cannot request arbitrary files or exceed the local pack budget', () => {
  for (const change of [
    (p) => (p.assets[0].url = 'https://example.invalid/sound'),
    (p) => (p.assets[0].bytes = 4194305),
    (p) => (p.playback.maxDurationMs = 20000),
    (p) => (p.cues['answer.correct'] = ['f'.repeat(64)]),
  ]) {
    const p = manifest();
    change(p);
    assert.throws(() => model.validateVoiceManifest(p));
  }
});
test('same/newer installed versions never force-update even if server flags/currentVersion are stale', () => {
  const release = {
    currentVersion: '1.0.3',
    latestVersion: '1.0.5',
    minimumVersion: '1.0.1',
    forceUpdate: true,
    updateAvailable: true,
  };
  for (const current of ['1.0.5', '1.0.6']) {
    const p = policy.normalizeReleasePolicy(release, current);
    assert.equal(p.currentVersion, current);
    assert.equal(p.forceUpdate, false);
    assert.equal(p.updateAvailable, false);
  }
  assert.equal(
    policy.normalizeReleasePolicy(
      { ...release, minimumVersion: '1.0.5' },
      '1.0.4',
    ).forceUpdate,
    true,
  );
  assert.throws(() =>
    policy.normalizeReleasePolicy(
      { ...release, minimumVersion: '9.0.0' },
      '1.0.5',
    ),
  );
});
test('native displayed and requested identity prefers PackageManager to the JavaScript label', () => {
  const p = load('mobile/src/version.native.ts', {
    '../package.json': { version: '1.0.5' },
    '../modules/app-runtime': {
      appRuntime: { installedVersion: '1.0.4', installedBuild: '37' },
    },
  });
  assert.equal(p.APP_VERSION, '1.0.4');
  assert.equal(p.BUNDLE_VERSION, '1.0.5');
  assert.equal(p.APP_BUILD_NUMBER, '37');
});

function nativeFixture({
  corrupt = false,
  hold = false,
  delayInfo = false,
} = {}) {
  const bytes = Buffer.from('ID3-real-test-fixture-only-abcdefghijkl'),
    id = crypto.createHash('sha256').update(bytes).digest('hex'),
    files = new Map(),
    players = [],
    requests = [];
  const pack = manifest();
  pack.assets = [
    {
      ...asset(1),
      id,
      sha256: id,
      url: '/voice-packs/assets/' + id,
      bytes: bytes.length,
    },
  ];
  pack.cues = {
    'practice.enter': [id],
    'answer.correct': [id],
    'answer.streak': [],
  };
  const dir = 'file:///app/files/practice-voice-v1/';
  let release,
    infoRelease,
    infoWaiting = false;
  const fsMock = {
    documentDirectory: 'file:///app/files/',
    async makeDirectoryAsync() {},
    async readDirectoryAsync() {
      return [...files.keys()]
        .filter((n) => n.startsWith(dir))
        .map((n) => n.slice(dir.length));
    },
    async readAsStringAsync(n) {
      if (!files.has(n)) throw Error('missing');
      return files.get(n).toString();
    },
    async writeAsStringAsync(n, text) {
      files.set(n, Buffer.from(text));
    },
    async getInfoAsync(n) {
      if (delayInfo) {
        delayInfo = false;
        infoWaiting = true;
        await new Promise((r) => (infoRelease = r));
      }
      return files.has(n)
        ? { exists: true, size: files.get(n).length, isDirectory: false }
        : { exists: false };
    },
    async moveAsync({ from, to }) {
      if (!files.has(from)) throw Error('missing');
      files.set(to, files.get(from));
      files.delete(from);
    },
    async deleteAsync(n) {
      files.delete(n);
    },
    createDownloadResumable(url, target) {
      requests.push(url);
      let resolve;
      return {
        async downloadAsync() {
          if (hold)
            await new Promise((r) => {
              resolve = r;
              release = r;
            });
          files.set(target, corrupt ? Buffer.from('corrupt') : bytes);
          return { status: 200, uri: target };
        },
        async pauseAsync() {
          resolve?.();
          return {};
        },
      };
    },
  };
  const deps = {
    'react-native': { AppState: { currentState: 'active' } },
    'expo-file-system/legacy': fsMock,
    'expo-audio': {
      createAudioPlayer() {
        const p = {
          isLoaded: true,
          volume: 0,
          playing: false,
          seekTo: async () => {},
          play() {
            p.playing = true;
            p.plays = (p.plays ?? 0) + 1;
          },
          pause() {
            p.playing = false;
          },
          remove() {
            p.removed = true;
          },
        };
        players.push(p);
        return p;
      },
    },
    '../modules/app-runtime': {
      appRuntime: {
        async sha256File(uri) {
          return crypto
            .createHash('sha256')
            .update(files.get(uri))
            .digest('hex');
        },
      },
    },
    './api/client': {
      API_BASE_URL: 'https://example.invalid/api',
      mobileApi: {
        voicePacks: async () => ({ packs: [pack], defaultPackId: pack.id }),
        voicePackManifest: async () => pack,
      },
    },
    './api/voicePacks': protocol,
    './practiceVoiceEngine': model,
    './audioPlaybackState': load('mobile/src/audioPlaybackState.ts'),
    './answerFeedbackSettings': load('mobile/src/answerFeedbackSettings.ts'),
  };
  const native = load('mobile/src/practiceVoice.native.ts', deps);
  return {
    native,
    files,
    players,
    requests,
    id,
    dir,
    release: () => release?.(),
    infoWaiting: () => infoWaiting,
    releaseInfo: () => infoRelease?.(),
  };
}

test('native download verifies actual bytes before persisting; playback uses local URI without another HTTP request', async () => {
  const f = nativeFixture();
  await f.native.practiceVoice.setAccount('a');
  assert.equal(await f.native.practiceVoice.download('test'), true);
  assert.ok(f.files.has(f.dir + 'pack-test.json'));
  f.native.configurePracticeVoice({
    ...load('mobile/src/answerFeedbackSettings.ts').DEFAULT_ANSWER_FEEDBACK,
    voicePackId: 'test',
  });
  await f.native.practiceVoice.refresh();
  const n = f.requests.length;
  assert.equal(f.native.practiceVoice.getStatus().state, 'ready');
  assert.equal(f.native.practiceVoice.preview(), true);
  await new Promise((r) => setImmediate(r));
  assert.equal(f.requests.length, n);
  await f.native.practiceVoice.setAccount(null);
  assert.ok(f.players.every((p) => p.removed));
});
test('native corrupt or cancelled files cannot become an enabled downloaded pack', async () => {
  const f = nativeFixture({ corrupt: true });
  await f.native.practiceVoice.setAccount('a');
  assert.equal(await f.native.practiceVoice.download('test'), false);
  assert.equal(f.files.has(f.dir + 'pack-test.json'), false);
  assert.ok([...f.files.keys()].every((p) => !p.includes('.part')));
  const g = nativeFixture({ hold: true });
  await g.native.practiceVoice.setAccount('b');
  const pending = g.native.practiceVoice.download('test');
  for (let i = 0; i < 20 && !g.requests.length; i++)
    await new Promise((r) => setImmediate(r));
  g.native.practiceVoice.cancelDownload();
  assert.equal(await pending, false);
  assert.equal(g.files.has(g.dir + 'pack-test.json'), false);
  assert.ok([...g.files.keys()].every((p) => !p.includes('.part')));
});

test('cancelling while local verification is pending never starts a later audio download', async () => {
  const f = nativeFixture({ delayInfo: true });
  await f.native.practiceVoice.setAccount('a');
  const pending = f.native.practiceVoice.download('test');
  for (let i = 0; i < 20 && !f.infoWaiting(); i++)
    await new Promise((r) => setImmediate(r));
  assert.equal(f.infoWaiting(), true);
  f.native.practiceVoice.cancelDownload();
  f.releaseInfo();
  assert.equal(await pending, false);
  assert.equal(f.requests.length, 0);
});

test('local wrong voices count fresh consecutive errors, cap at five, reset on correct and never fetch while answering', async () => {
  const f = fixture();
  f.pack.cues['answer.wrong'] = [1, 2, 3, 4, 5].map((count, i) => ({
    count,
    clips: [String((i % 3) + 1).repeat(64)],
  }));
  await f.api.setAccount('a');
  await f.api.download('test');
  f.api.select('test');
  await f.api.refresh();
  const before = { ...f.calls };
  for (let i = 1; i <= 7; i++) {
    f.time();
    assert.equal(
      f.api.answer('wrong-round', 'w' + i, false, () => true),
      true,
    );
  }
  assert.deepEqual(
    f.events.map((e) => e[0]),
    ['1', '2', '3', '1', '2', '2', '2'],
  );
  const count = f.events.length;
  f.time();
  f.api.answer('wrong-round', 'w7', false, () => true);
  assert.equal(f.events.length, count);
  f.time();
  f.api.answer('wrong-round', 'correct', true, () => true);
  f.time();
  f.api.answer('wrong-round', 'again', false, () => true);
  assert.equal(f.events.at(-1)[0], '1');
  assert.deepEqual(f.calls, before);
});
test('native random pools never use unselected assets and fixed mode never rotates the chosen clip', async () => {
  const f = fixture();
  f.pack.cues['answer.streak'] = [];
  f.pack.cues['answer.correct'] = ['1'.repeat(64), '2'.repeat(64)];
  f.pack.playback.selectionModes = { 'answer.correct': 'random' };
  await f.api.setAccount('a');
  await f.api.download('test');
  f.api.select('test');
  await f.api.refresh();
  for (let i = 0; i < 8; i++) {
    f.time();
    f.api.answer('random', 'a' + i, true, () => true);
  }
  assert.ok(f.events.every((e) => ['1', '2'].includes(e[0])));
  assert.equal(new Set(f.events.map((e) => e[0])).size, 2);
  f.pack.cues['answer.correct'] = ['3'.repeat(64)];
  f.pack.cues['answer.streak'] = [];
  f.pack.playback.selectionModes['answer.correct'] = 'fixed';
  await f.api.download('test');
  await f.api.refresh();
  f.events.length = 0;
  for (let i = 0; i < 5; i++) {
    f.time();
    f.api.answer('fixed', 'f' + i, true, () => true);
  }
  assert.deepEqual(
    f.events.map((e) => e[0]),
    ['3', '3', '3', '3', '3'],
  );
});

test('completed downloaded audio replays after a wrong answer and on repeated correct answers', async () => {
  const f = nativeFixture();
  await f.native.practiceVoice.setAccount('a');
  await f.native.practiceVoice.download('test');
  f.native.configurePracticeVoice({
    ...load('mobile/src/answerFeedbackSettings.ts').DEFAULT_ANSWER_FEEDBACK,
    voicePackId: 'test',
  });
  await f.native.practiceVoice.refresh();
  const p = f.players.filter((p) => !p.removed).at(-1);
  assert.ok(p);
  assert.equal(
    f.native.practiceVoice.answer('repeat', 'first', true, () => true),
    true,
  );
  await new Promise((r) => setImmediate(r));
  assert.equal(p.plays, 1);
  for (let i = 2; i <= 4; i++) {
    p.isLoaded = false;
    p.playing = false;
    p.currentStatus = { isLoaded: true, playbackState: 'ended', error: null };
    f.native.practiceVoice.answer('repeat', 'wrong' + i, false, () => true);
    await new Promise((r) => setTimeout(r, 160));
    assert.equal(
      f.native.practiceVoice.answer('repeat', 'right' + i, true, () => true),
      true,
    );
    await new Promise((r) => setImmediate(r));
    assert.equal(p.plays, i);
  }
  await f.native.practiceVoice.setAccount(null);
});

test('fresh correct-wrong-correct answers are not swallowed by the configured minimum interval', async () => {
  const f = fixture();
  f.pack.playback.minIntervalMs = 5000;
  f.pack.cues['answer.wrong'] = [{ count: 1, clips: ['3'.repeat(64)] }];
  await f.api.setAccount('a');
  await f.api.download('test');
  f.api.select('test');
  await f.api.refresh();
  f.api.answer('fresh', 'one', true, () => true);
  f.api.answer('fresh', 'two', false, () => true);
  f.api.answer('fresh', 'three', true, () => true);
  assert.deepEqual(
    f.events.map((e) => e[0]),
    ['2', '3', '2'],
  );
  const before = f.events.length;
  f.api.answer('fresh', 'three', true, () => true);
  assert.equal(
    f.events.length,
    before,
    'the same receipt is still deduplicated',
  );
});


test('device scene preferences select only the published candidate pool and isolate each pack', async () => {
 const f=fixture(); f.pack.cues['practice.enter']=['1'.repeat(64),'2'.repeat(64),'3'.repeat(64)];
 f.settings.voiceScenes={test:{'practice.enter':{mode:'random',clips:['2'.repeat(64),'3'.repeat(64)]}},other:{'practice.enter':{mode:'fixed',clips:['1'.repeat(64)]}}};
 f.local.set('test',f.pack);await f.api.setAccount('a');const before={...f.calls};
 f.time();assert.equal(f.api.enter('one'),true);f.time();assert.equal(f.api.enter('two'),true);
 assert.deepEqual(f.events.map(e=>e[0]),['2','3']);assert.deepEqual(f.calls,before);
 assert.deepEqual(f.pack.cues['practice.enter'],['1'.repeat(64),'2'.repeat(64),'3'.repeat(64)],'downloaded manifest stays unchanged');
});
test('explicit scene silence suppresses builtin fallback while keeping answer identities and streaks',async()=>{
 const f=fixture();f.settings.voiceScenes={test:{'answer.correct':{mode:'off',clips:[]}}};f.local.set('test',f.pack);await f.api.setAccount('a');
 f.time();f.api.enter('round');const n=f.events.length;assert.equal(f.api.answer('round','a',true,()=>true),true);assert.equal(f.events.length,n);
 f.time();assert.equal(f.api.answer('round','b',true,()=>true),true);assert.equal(f.events.at(-1)[0],'3');
 assert.equal(f.api.answer('round','b',true,()=>true),false);
});
test('a removed candidate after pack update falls back to valid published audio',async()=>{
 const f=fixture();f.settings.voiceScenes={test:{'practice.enter':{mode:'fixed',clips:['f'.repeat(64)]}}};f.local.set('test',f.pack);await f.api.setAccount('a');f.time();assert.equal(f.api.enter('round'),true);assert.equal(f.events.at(-1)[0],'1');
});
test('local clip audition neither changes streaks nor fetches audio and respects guard, mute and volume',async()=>{
 const f=fixture();f.local.set('test',f.pack);await f.api.setAccount('a');const calls={...f.calls};f.time();f.api.enter('round');
 assert.equal(f.api.previewClip('3'.repeat(64),()=>true),true);assert.equal(f.api.getManifest().id,'test');
 f.time();f.api.answer('round','a',true,()=>true);assert.equal(f.events.at(-1)[0],'2');f.time();f.api.answer('round','b',true,()=>true);assert.equal(f.events.at(-1)[0],'3');
 const n=f.events.length;assert.equal(f.api.previewClip('f'.repeat(64)),false);assert.equal(f.api.previewClip('1'.repeat(64),()=>false),false);
 f.settings.soundEnabled=false;assert.equal(f.api.previewClip('1'.repeat(64)),false);f.settings.soundEnabled=true;f.settings.volume=0;assert.equal(f.api.previewClip('1'.repeat(64)),false);
 assert.equal(f.events.length,n);assert.deepEqual(f.calls,calls);
});
test('current-pack audition works for entry/wrong-only packs without synthesizing answer events',async()=>{
 const f=fixture();f.pack.cues['answer.correct']=[];f.pack.cues['answer.streak']=[];f.local.set('test',f.pack);await f.api.setAccount('a');assert.equal(f.api.preview(()=>true),true);assert.equal(f.events.at(-1)[0],'1');
});

test('updating the same selected voice pack immediately activates the new local revision',async()=>{
 const f=fixture();f.local.set('test',f.pack);await f.api.setAccount('a');assert.equal(f.api.getManifest().revision,1);
 const updated={...f.pack,revision:2,name:'Updated Test'};f.deps.manifest=async()=>updated;
 assert.equal(await f.api.download('test'),true);assert.equal(f.api.getManifest().revision,2);assert.equal(f.api.getStatus().currentName,'Updated Test');
});
test('an unchanged catalog refresh reuses prepared local players instead of interrupting them',async()=>{
 const f=fixture();let prepares=0;const prepare=f.deps.prepare;f.deps.prepare=async(...args)=>{prepares++;return prepare(...args)};
 f.local.set('test',f.pack);await f.api.setAccount('a');const loaded=prepares;await f.api.refresh();assert.equal(prepares,loaded);assert.equal(f.api.getStatus().state,'ready');
});
