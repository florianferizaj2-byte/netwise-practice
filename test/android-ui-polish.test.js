import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from '../mobile/node_modules/typescript/lib/typescript.js';

const read = p => fs.readFileSync(new URL('../mobile/src/' + p, import.meta.url), 'utf8');
const tokensSource = read('android-design-tokens.ts');
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(tokensSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module, exports: module.exports });
const { androidFontSize, androidRadius, androidAccent, androidMotion } = module.exports;
const contrast = (a, b) => {
  const luminance = hex => hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0);
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
};

test('Android readable typography raises legacy small copy without reducing headings', () => {
  for (const old of [10, 11, 12, 13]) assert.ok(androidFontSize(old) >= 14);
  assert.equal(androidFontSize(14), 16);
  assert.equal(androidFontSize(15), 16);
  assert.equal(androidFontSize(26), 26);
  const theme = read('theme.android.ts');
  assert.match(theme, /androidFontSize\(style.fontSize\)/);
  assert.doesNotMatch(theme, /allowFontScaling:\s*false|maxFontSizeMultiplier:\s*1\b/);
});

test('Android rounded geometry preserves circles and progress pills', () => {
  assert.equal(androidRadius(12), 18);
  assert.equal(androidRadius(16), 22);
  assert.equal(androidRadius(21, 42, 42), 21);
  assert.equal(androidRadius(999), 999);
  assert.equal(androidRadius(0), 0);
});

test('Android semantic accents meet small-text contrast in light and dark mode', () => {
  for (const background of ['#F6F8FC', '#101722']) {
    const colors = new Set();
    for (const name of ['primary', 'practice', 'exam', 'review', 'ai', 'member', 'progress']) {
      const tone = androidAccent({ background }, name);
      assert.ok(contrast(tone.ink, tone.soft) >= 4.5, background + ': ' + name);
      colors.add(tone.ink);
    }
    assert.equal(colors.size, 7);
  }
});

test('Android toolbar no longer repeats certificate switching on every page', () => {
  const ui = read('components/AndroidUi.android.tsx');
  const header = ui.slice(ui.indexOf('export function AndroidPageHeader'), ui.indexOf('export function AndroidPointsLink'));
  assert.match(header, /title = '今日'/);
  assert.match(header, /android-page-header/);
  assert.doesNotMatch(header, /当前证书：|切换证书|certificates\?\.find/);
  assert.match(read('screens/TabScreens.android.tsx'), /考试与题库，切换证书/);
});

test('Android motion uses bounded native transforms and respects inactive screens', () => {
  const motion = read('components/Motion.android.tsx');
  const progress = motion.slice(motion.indexOf('export function AnimatedProgressBar'), motion.indexOf('export function FloatingSparkles'));
  assert.match(progress, /useNativeDriver: true/);
  assert.match(progress, /scaleX: progress/);
  assert.match(progress, /reduceMotion \|\| !active/);
  assert.match(progress, /animation.stop\(\)/);
  assert.match(motion, /transformOrigin: 'left center'/);
  assert.doesNotMatch(motion, /useNativeDriver: false/);
  assert.match(motion, /Math.max\(48,/);
  assert.ok(androidMotion.pressScale >= .98);
  assert.ok(androidMotion.progressMs <= 400);
});

test('Android floating progress gesture does not re-render React on every move', () => {
  const shell = read('navigation/AppShell.android.tsx');
  const start = shell.indexOf('onPanResponderMove:');
  const move = shell.slice(start, shell.indexOf('onPanResponderRelease:', start));
  assert.match(move, /motionPosition.setValue\(next\)/);
  assert.doesNotMatch(move, /setPosition\(/);
  assert.match(shell, /onPanResponderTerminate: \(\) => setPosition\(positionRef.current\)/);
});
