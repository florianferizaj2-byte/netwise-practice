import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from '../mobile/node_modules/typescript/lib/typescript.js';
const read = (file) =>
  fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const tick = () => new Promise((resolve) => setImmediate(resolve));
function evaluate(file, dependencies, globals = {}) {
  const exports = {};
  const context = {
    exports,
    module: { exports },
    require: (name) => {
      if (name in dependencies) return dependencies[name];
      if (name.endsWith('.wav')) return name;
      throw Error('Unexpected module: ' + name);
    },
    ...globals,
  };
  vm.runInNewContext(
    ts.transpileModule(read(file), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    context,
  );
  return context.module.exports;
}
const model = evaluate('mobile/src/answerFeedbackSettings.ts', {});
const replayState = evaluate('mobile/src/audioPlaybackState.ts', {});
const plain = (value) => JSON.parse(JSON.stringify(value));
function fixture({
  loaded = true,
  failPreload = false,
  failVibration = false,
  seek,
} = {}) {
  const events = [],
    players = [],
    state = { currentState: 'active' },
    clock = { time: 0 };
  const api = evaluate(
    'mobile/src/answerFeedback.native.ts',
    {
      'react-native': {
        AppState: state,
        Platform: { OS: 'android' },
        Vibration: {
          vibrate: (...args) => {
            if (failVibration) throw Error('unavailable');
            events.push(['vibrate', ...args]);
          },
        },
      },
      'expo-audio': {
        async preload() {
          if (failPreload) throw Error('decoder unavailable');
        },
        createAudioPlayer(source) {
          const p = {
            isLoaded: loaded,
            volume: 0,
            pause: () => events.push(['pause']),
            seekTo: () => {
              events.push(['seek']);
              return seek ? seek() : Promise.resolve();
            },
            play: () => events.push(['play', p.volume]),
          };
          players.push(p);
          return p;
        },
      },
      './answerFeedbackSettings': model,
      './audioPlaybackState': replayState,
      './practiceVoice': {
        practiceVoice: {
          stop() {},
          answer() {
            return false;
          },
          preview() {
            return false;
          },
        },
        configurePracticeVoice() {},
      },
    },
    { Date: { now: () => clock.time } },
  );
  return {
    api,
    events,
    players,
    state,
    clock,
    configure: (patch) =>
      api.configureAnswerFeedback({
        ...model.DEFAULT_ANSWER_FEEDBACK,
        ...patch,
      }),
    clear: () => events.splice(0),
  };
}

test('answer feedback preferences validate corrupt values, clamp volume and retain independent switches', () => {
  assert.deepEqual(
    plain(model.normalizeAnswerFeedback(null)),
    plain(model.DEFAULT_ANSWER_FEEDBACK),
  );
  assert.deepEqual(
    plain(
      model.normalizeAnswerFeedback({
        soundEnabled: false,
        hapticsEnabled: false,
        volume: 0,
        style: 'warm',
        hapticStrength: 'strong',
        injected: true,
      }),
    ),
    {
      soundEnabled: false,
      hapticsEnabled: false,
      volume: 0,
      style: 'warm',
      hapticStrength: 'strong',
      voicePackId: 'default',
    },
  );
  assert.equal(model.normalizeAnswerFeedback({ volume: NaN }).volume, 0.32);
  assert.equal(model.normalizeAnswerFeedback({ volume: 20 }).volume, 1);
  assert.equal(model.normalizeAnswerFeedback({ volume: -20 }).volume, 0);
  assert.equal(
    model.normalizeAnswerFeedback({
      soundEnabled: 'false',
      style: 'unknown',
      hapticStrength: 'unknown',
    }).style,
    'soft',
  );
});
test('original confirmation assets are short mono PCM, not network sound sources', () => {
  for (const style of ['soft', 'crisp', 'warm']) {
    const b = fs.readFileSync(
      new URL(
        `../mobile/assets/sounds/answer-correct-${style}.wav`,
        import.meta.url,
      ),
    );
    assert.equal(b.toString('ascii', 0, 4), 'RIFF');
    assert.equal(b.toString('ascii', 8, 12), 'WAVE');
    assert.equal(b.readUInt16LE(20), 1);
    assert.equal(b.readUInt16LE(22), 1);
    assert.equal(b.readUInt32LE(24), 24000);
    assert.equal(b.readUInt16LE(34), 16);
    assert.equal(b.readUInt32LE(40) / 2 / 24000, 0.24);
    let peak = 0;
    for (let i = 44; i < b.length; i += 2)
      peak = Math.max(peak, Math.abs(b.readInt16LE(i)));
    assert.ok(peak > 1000 && peak < 28000);
    assert.ok(Math.abs(b.readInt16LE(b.length - 2)) < 100);
  }
  assert.ok(
    JSON.parse(read('mobile/app.json')).expo.android.permissions.includes(
      'VIBRATE',
    ),
  );
});
test('preloading is silent; a new correct answer vibrates immediately and plays one prepared tone', async () => {
  const f = fixture();
  await f.api.prepareAnswerFeedback();
  await f.api.prepareAnswerFeedback();
  assert.equal(f.players.length, 3);
  assert.equal(f.events.length, 0);
  f.api.playCorrectAnswerFeedback(true);
  assert.equal(f.events.length, 0, 'wait for device settings hydration');
  f.configure({});
  f.clear();
  f.api.playCorrectAnswerFeedback(false);
  assert.equal(f.events.length, 0);
  f.api.playCorrectAnswerFeedback(true);
  assert.deepEqual(f.events, [['vibrate', 16, false], ['seek']]);
  await tick();
  assert.deepEqual(f.events.at(-1), ['play', 0.32]);
});
test('correct-answer sound, vibration, strength, style and exact zero volume are independent', async () => {
  const f = fixture();
  await f.api.prepareAnswerFeedback();
  f.configure({ soundEnabled: false, hapticStrength: 'strong' });
  f.clear();
  f.api.playCorrectAnswerFeedback(true);
  await tick();
  assert.deepEqual(f.events, [['vibrate', 42, false]]);
  f.configure({ hapticsEnabled: false, style: 'warm', volume: 0.16 });
  f.clear();
  f.api.playCorrectAnswerFeedback(true);
  await tick();
  assert.deepEqual(f.events, [['seek'], ['play', 0.16]]);
  assert.equal(f.players[2].volume, 0.16);
  f.configure({ volume: 0, hapticStrength: 'normal' });
  f.clear();
  f.api.playCorrectAnswerFeedback(true);
  await tick();
  assert.deepEqual(f.events, [['vibrate', 28, false]]);
  f.configure({ hapticsEnabled: false, soundEnabled: false });
  f.clear();
  f.api.playCorrectAnswerFeedback(true);
  assert.equal(f.events.length, 0);
});
test('background, disabled, stale and cancelled native seeks never emit late sounds', async () => {
  let resolve;
  const f = fixture({ seek: () => new Promise((r) => (resolve = r)) });
  await f.api.prepareAnswerFeedback();
  f.configure({});
  for (const state of ['background', 'inactive', null]) {
    f.state.currentState = state;
    f.clear();
    f.api.playCorrectAnswerFeedback(true);
    assert.equal(f.events.length, 0);
  }
  f.state.currentState = 'active';
  f.api.playCorrectAnswerFeedback(true);
  f.api.stopAnswerFeedback();
  resolve();
  await tick();
  assert.equal(f.events.filter((e) => e[0] === 'play').length, 0);
  f.api.playCorrectAnswerFeedback(true);
  f.configure({ soundEnabled: false });
  resolve();
  await tick();
  assert.equal(f.events.filter((e) => e[0] === 'play').length, 0);
  f.configure({});
  f.api.playCorrectAnswerFeedback(true);
  f.clock.time = 251;
  resolve();
  await tick();
  assert.equal(f.events.filter((e) => e[0] === 'play').length, 0);
});
test('a pending native seek cannot play after changing question or leaving the practice screen', async () => {
  let resolve,
    visible = true;
  const f = fixture({ seek: () => new Promise((r) => (resolve = r)) });
  await f.api.prepareAnswerFeedback();
  f.configure({});
  f.clear();
  f.api.playCorrectAnswerFeedback(true, () => visible);
  visible = false;
  resolve();
  await tick();
  assert.equal(f.events.filter((e) => e[0] === 'play').length, 0);
  f.clear();
  f.api.playCorrectAnswerFeedback(true, () => false);
  assert.equal(f.events.length, 0);
});
test('missing native sound/vibration capability cannot delay or reject answer submission', async () => {
  const f = fixture({ failPreload: true, failVibration: true });
  f.configure({});
  await f.api.prepareAnswerFeedback();
  assert.doesNotThrow(() => f.api.playCorrectAnswerFeedback(true));
  assert.equal(f.players.length, 0);
  const g = fixture({ loaded: false });
  g.configure({});
  await g.api.prepareAnswerFeedback();
  g.api.playCorrectAnswerFeedback(true);
  await tick();
  assert.deepEqual(
    g.events.filter((e) => e[0] !== 'pause'),
    [['vibrate', 16, false]],
    'never play an old success after later loading',
  );
});
test('guided practice only acknowledges a fresh visible submission once, not history or polling duplicates', () => {
  const source = read('mobile/src/screens/subjective-study/PracticePanel.tsx');
  const file = ts.createSourceFile(
    'p.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let arrow;
  function visit(n) {
    if (ts.isVariableDeclaration(n) && n.name.getText(file) === 'updateAttempt')
      arrow = n.initializer;
    ts.forEachChild(n, visit);
  }
  visit(file);
  assert.ok(arrow);
  const printed = ts
    .createPrinter()
    .printNode(ts.EmitHint.Expression, arrow, file);
  const events = [],
    ctx = {
      module: { exports: {} },
      feedbackSubmission: { current: null },
      voiceScope: { current: 'guided' },
      visibleQuestion: { current: 'q' },
      setSession: () => {},
      onProgress: () => {},
      playCorrectAnswerFeedback: (value) => {
        if (value === true) events.push(value);
      },
    };
  vm.runInNewContext(
    ts.transpileModule('module.exports=' + printed, {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    ctx,
  );
  const update = ctx.module.exports,
    graded = { questionId: 'q', status: 'graded', correct: true };
  update(graded);
  assert.equal(events.length, 0);
  ctx.feedbackSubmission.current = 'q';
  update({ ...graded, status: 'processing', processing: true });
  assert.equal(events.length, 0);
  update(graded);
  update(graded);
  assert.equal(events.length, 1);
  ctx.feedbackSubmission.current = 'q';
  ctx.visibleQuestion.current = null;
  update(graded);
  assert.equal(events.length, 1);
  ctx.feedbackSubmission.current = 'q';
  ctx.visibleQuestion.current = 'q';
  update({ ...graded, correct: false });
  assert.equal(events.length, 1);
  assert.doesNotMatch(
    read('mobile/src/screens/ExamScreen.android.tsx'),
    /playCorrectAnswerFeedback/,
  );
  const native = read('mobile/src/screens/TabScreens.android.tsx');
  assert.match(
    native,
    /if \(feedbackVisible.current\) playCorrectAnswerFeedback\(next.correct,/,
  );
  const syncEffect = native.slice(
    native.indexOf("if(currentSync?.status==='saved'"),
    native.indexOf("if(currentSync?.status==='saved'") + 700,
  );
  assert.doesNotMatch(syncEffect, /playCorrectAnswerFeedback/);
});
function hookFixture(storage) {
  const effects = [],
    configs = [],
    states = [],
    handlers = [];
  const api = evaluate('mobile/src/useAnswerFeedbackSettings.ts', {
    '@react-native-async-storage/async-storage': {
      __esModule: true,
      default: storage,
    },
    'react-native': {
      AppState: {
        addEventListener: (_, fn) => {
          handlers.push(fn);
          return { remove() {} };
        },
      },
    },
    react: {
      useState: (value) => {
        const i = states.length;
        states.push(value);
        return [value, (next) => (states[i] = next)];
      },
      useRef: (value) => ({ current: value }),
      useCallback: (fn) => fn,
      useEffect: (fn) => effects.push(fn),
    },
    './answerFeedbackSettings': model,
    './audioPlaybackState': replayState,
    './practiceVoice': {
      practiceVoice: {
        stop() {},
        answer() {
          return false;
        },
        preview() {
          return false;
        },
      },
      configurePracticeVoice() {},
    },
    './answerFeedback': {
      prepareAnswerFeedback: async () => {},
      configureAnswerFeedback: (s) => configs.push(plain(s)),
      stopAnswerFeedback: () => {},
    },
  });
  const hook = api.useAnswerFeedbackSettings();
  effects.forEach((fn) => fn());
  return { hook, configs, states };
}
test('saved mute/volume preferences hydrate before feedback; corrupt storage safely recovers', async () => {
  const f = hookFixture({
    async getItem() {
      return JSON.stringify({
        soundEnabled: false,
        hapticsEnabled: false,
        volume: 0,
      });
    },
    async setItem() {},
  });
  assert.equal(f.configs.length, 0);
  await tick();
  assert.equal(f.configs.at(-1).soundEnabled, false);
  assert.equal(f.configs.at(-1).volume, 0);
  assert.equal(f.states[1], true);
  const g = hookFixture({
    async getItem() {
      return '{broken';
    },
    async setItem() {},
  });
  await tick();
  assert.deepEqual(g.configs.at(-1), plain(model.DEFAULT_ANSWER_FEEDBACK));
  assert.equal(g.states[1], true);
});
test('a late storage read cannot override a user change, and rapid writes preserve order', async () => {
  let finishRead, finishWrite;
  const writes = [];
  const f = hookFixture({
    getItem: () => new Promise((r) => (finishRead = r)),
    setItem: async (_, raw) => {
      writes.push(JSON.parse(raw));
      if (writes.length === 1) await new Promise((r) => (finishWrite = r));
    },
  });
  f.hook.setAnswerFeedbackSettings({ soundEnabled: false });
  f.hook.setAnswerFeedbackSettings({ volume: 0.16 });
  await tick();
  assert.equal(writes.length, 1);
  finishRead(JSON.stringify({ soundEnabled: true, volume: 1 }));
  await tick();
  assert.equal(f.configs.at(-1).soundEnabled, false);
  assert.equal(f.configs.at(-1).volume, 0.16);
  finishWrite();
  await tick();
  assert.equal(writes.length, 2);
  assert.equal(writes[1].soundEnabled, false);
  assert.equal(writes[1].volume, 0.16);
});

test('a completed Android tone replays for every fresh correct answer, including correct-wrong-correct', async () => {
  const f = fixture();
  await f.api.prepareAnswerFeedback();
  f.configure({ hapticsEnabled: false });
  f.clear();
  f.api.playCorrectAnswerFeedback(true);
  await tick();
  assert.equal(f.events.filter((e) => e[0] === 'play').length, 1);
  const player = f.players[0];
  for (let i = 2; i <= 4; i++) {
    player.isLoaded = false;
    player.currentStatus = {
      isLoaded: true,
      playbackState: 'ended',
      error: null,
    };
    f.clock.time += 500;
    f.api.playCorrectAnswerFeedback(false);
    f.api.playCorrectAnswerFeedback(true);
    await tick();
    assert.equal(
      f.events.filter((e) => e[0] === 'play').length,
      i,
      'STATE_ENDED is replayable, not an unloaded audio source',
    );
  }
});


test('per-pack scene preferences are bounded, migrated without changing legacy defaults and reject malformed choices',()=>{
 const a='a'.repeat(64),b='b'.repeat(64);
 const value=model.normalizeAnswerFeedback({voiceScenes:{test:{'practice.enter':{mode:'fixed',clips:[a,b]},'answer.correct':{mode:'random',clips:[a,a,b,'bad']},'wrong:5':{mode:'off',clips:[a]},'wrong:6':{mode:'off',clips:[]},'streak:1':{mode:'off',clips:[]},arbitrary:{mode:'random',clips:[a]}}}});
 assert.deepEqual(plain(value.voiceScenes),{test:{'practice.enter':{mode:'fixed',clips:[a]},'answer.correct':{mode:'random',clips:[a,b]},'wrong:5':{mode:'off',clips:[]}}});
 assert.equal(model.normalizeAnswerFeedback({voiceScenes:[]}).voiceScenes,undefined);
 assert.equal(model.normalizeAnswerFeedback({voiceScenes:{test:{'practice.enter':{mode:'fixed',clips:[]}}}}).voiceScenes,undefined);
});
test('sound-only builtin audition never vibrates or changes practice voice events',async()=>{
 const f=fixture();await f.api.prepareAnswerFeedback();f.api.configureAnswerFeedback({...model.DEFAULT_ANSWER_FEEDBACK,hapticsEnabled:true});f.api.previewAnswerSound(()=>true);await tick();
 assert.equal(f.events.filter(e=>e[0]==='play').length,1);assert.equal(f.events.filter(e=>e[0]==='vibrate').length,0);
});
