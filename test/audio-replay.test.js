import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from '../mobile/node_modules/typescript/lib/typescript.js';
function load(file, deps = {}) {
  const exports = {},
    module = { exports };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    {
      module,
      exports,
      require: (name) => {
        if (name in deps) return deps[name];
        if (name.endsWith('.wav')) return name;
        throw Error('Unexpected dependency ' + name);
      },
    },
  );
  return module.exports;
}
const policy = load('mobile/src/audioPlaybackState.ts'),
  tick = () => new Promise((r) => setImmediate(r));
test('audio readiness treats completed Android sources as replayable but rejects loading, failed and released players', () => {
  assert.equal(policy.canReplayAudio({ isLoaded: true }), true);
  assert.equal(
    policy.canReplayAudio({
      isLoaded: false,
      currentStatus: { isLoaded: true, playbackState: 'ended', error: null },
    }),
    true,
  );
  assert.equal(
    policy.canReplayAudio({
      isLoaded: false,
      currentStatus: { isLoaded: false, playbackState: 'ended' },
    }),
    true,
  );
  for (const state of ['idle', 'loading', 'buffering'])
    assert.equal(
      policy.canReplayAudio({
        isLoaded: false,
        currentStatus: { isLoaded: false, playbackState: state },
      }),
      false,
    );
  assert.equal(
    policy.canReplayAudio({
      isLoaded: false,
      currentStatus: {
        isLoaded: true,
        playbackState: 'ended',
        error: 'decoder failed',
      },
    }),
    false,
  );
  assert.equal(
    policy.canReplayAudio({
      get isLoaded() {
        throw Error('removed');
      },
    }),
    false,
  );
});
test('button effects and their preview can replay after completion while mute remains respected', async () => {
  const players = [],
    events = [];
  const api = load('mobile/src/audioFeedback.ts', {
    './audioPlaybackState': policy,
    'expo-audio': {
      setAudioModeAsync: async () => {},
      preload: async () => {},
      createAudioPlayer() {
        const p = {
          isLoaded: true,
          currentStatus: { isLoaded: true, playbackState: 'ready' },
          playing: false,
          volume: 0,
          addListener() {
            return { remove() {} };
          },
          seekTo: async () => {
            events.push('seek');
          },
          play() {
            p.playing = true;
            events.push('play');
          },
        };
        players.push(p);
        return p;
      },
    },
  });
  await api.prepareUiSounds();
  api.playUiSound();
  await tick();
  assert.equal(events.filter((e) => e === 'play').length, 1);
  const p = players[0];
  for (let i = 2; i <= 4; i++) {
    p.isLoaded = false;
    p.playing = false;
    p.currentStatus = { isLoaded: true, playbackState: 'ended' };
    api.playUiSound();
    await tick();
    assert.equal(events.filter((e) => e === 'play').length, i);
  }
  p.playing = false;
  api.previewUiSound();
  await tick();
  assert.equal(events.filter((e) => e === 'play').length, 5);
  p.playing = false;
  api.setUiSoundSettings({ enabled: false, volume: 0.32, style: 'soft' });
  api.playUiSound();
  await tick();
  assert.equal(events.filter((e) => e === 'play').length, 5);
});
