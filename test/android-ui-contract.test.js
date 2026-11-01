import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from '../mobile/node_modules/typescript/lib/typescript.js';

const root = new URL('../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8').replace(/\r\n/g, '\n');
const native = name => read('mobile/src/' + name + '.android.tsx');
const functions = source => {
  const file = ts.createSourceFile('screen.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const printer = ts.createPrinter({ removeComments: true });
  const found = new Map();
  const visit = node => {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) found.set(node.name.text, printer.printNode(ts.EmitHint.Unspecified, node.body, file));
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.equal(file.parseDiagnostics.length, 0, 'screen syntax is valid');
  return found;
};

test('Android screen variants retain their practice and exam business handlers', () => {
  for (const name of ['screens/TabScreens', 'screens/ExamScreen', 'screens/AccountSecurityScreen', 'screens/ProfileSetupScreen', 'components/RedeemCodeModal']) {
    const base = functions(read('mobile/src/' + name + '.tsx'));
    const next = functions(native(name));
    let compared = 0;
    for (const [key, body] of base) {
      // Exported screen composition and pure display helpers are intentionally new.
      if (/Screen$|Modal$|^Screen|^SettingRow$|^GuideStep$|^Quota$|^Benefit$|^PrimaryAction$/.test(key)) continue;
      assert.equal(next.get(key), body, name + ': ' + key + ' business handler changed');
      compared++;
    }
    assert.ok(compared >= 1, name + ': no business handlers checked');
  }
});

test('Noto fonts are offline, Android-only and distributed with their full OFL', () => {
  const config = JSON.parse(read('mobile/app.json')).expo;
  const options = config.plugins.find(p => Array.isArray(p) && p[0] === 'expo-font')?.[1];
  assert.ok(options?.android);
  assert.equal(options.fonts, undefined);
  assert.equal(options.ios, undefined);
  const family = options.android.fonts[0];
  assert.equal(family.fontFamily, 'KaojiangSans');
  assert.deepEqual(family.fontDefinitions.map(f => f.weight), [400, 500, 700]);
  for (const font of family.fontDefinitions) {
    assert.doesNotMatch(font.path, /^https?:/);
    const bytes = fs.readFileSync(new URL('mobile/' + font.path.replace(/^\.\//, ''), root));
    assert.equal(bytes.readUInt32BE(0), 0x00010000, 'must be a real TrueType font');
  }
  const license = read('mobile/assets/fonts/OFL-NotoSansSC.txt');
  assert.match(license, /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(license, /Copyright 2014-2021 Adobe/);
  assert.match(license, /TERMINATION/);
  assert.ok(config.plugins.includes('./plugins/withAndroidFontLicense'));
});

test('Android theme keeps persisted settings and semantic success separate from blue actions', () => {
  const theme = read('mobile/src/theme.android.ts');
  assert.match(theme, /ThemeProvider.*from '\.\/theme\.ts'/);
  assert.match(theme, /useBaseTheme\(\)/);
  assert.match(theme, /fontFamily \?\?= systemFont/);
  assert.match(theme, /brand: '#255FDF'/);
  assert.match(theme, /success: '#177B57'/);
  assert.doesNotMatch(theme, /allowFontScaling:\s*false|setDefaultProps|fetch\(/);
  assert.match(native('components/AppIcon'), /react-native-svg/);
  assert.doesNotMatch(native('components/AppIcon'), /<Text/);
});

test('Android small text and semantic badges meet 4.5:1 contrast in both themes', () => {
  const source = read('mobile/src/theme.android.ts');
  const luminance = hex => {
    const [r, g, b] = hex.slice(1).match(/../g).map(s => parseInt(s, 16) / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  for (const name of ['lightColors', 'darkColors']) {
    const block = source.split('export const ' + name)[1].split('};')[0];
    const c = Object.fromEntries([...block.matchAll(/(\w+): '(#[\da-fA-F]{6})'/g)].map(m => [m[1], m[2]]));
    for (const [ink, background] of [['text', 'background'], ['textMuted', 'background'], ['textFaint', 'background'], ['brand', 'brandSoft'], ['gold', 'goldSoft'], ['success', 'successSoft'], ['warning', 'warningSoft'], ['white', 'action']]) {
      const a = luminance(c[ink]), b = luminance(c[background]);
      assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5, name + ': ' + ink + '/' + background);
    }
  }
});

test('new navigation and points entry points remain reachable without a global banner', () => {
  const shell = native('navigation/AppShell');
  assert.match(shell, /<AndroidPointsBar headless/);
  assert.match(shell, /case 'vip'/);
  assert.match(shell, /onBack=\{\(\) => onNavigate\('profile'\)\}/);
  const points = native('components/AndroidPointsBar');
  assert.match(points, /registerMobileRequestHooks\(androidPointsFlow.hooks\)/);
  assert.match(points, /state.presentationHost==='root'/);
  const profile = native('screens/TabScreens');
  for (const label of ['会员与 AI 积分', '签到领积分', '兑换码', '积分记录', '已生成题目', '账号与安全', '考匠社区']) assert.ok(profile.includes(label));
  assert.match(profile, /androidPointsFlow.showDetails/);
});

test('the practice directory does not pretend coverage is a saved session or mastery', () => {
  const hub = native('screens/PracticeHubScreen');
  assert.match(hub, /suggestedChapter\.attemptedCount/);
  assert.match(hub, /suggestedChapter\.questionCount/);
  assert.doesNotMatch(hub, /继续上次练习|已掌握.*suggestedChapter/);
  assert.match(hub, /RoutePlayerChapter search=\{search\}/);
  const cert = native('screens/CertificateScreen');
  assert.match(cert, /setSelectedId\(certificate.id\)/);
  assert.match(cert, /choose\(selectedId\)/);
  assert.match(cert, /已有学习进度和错题会保留/);
});

test('focused Android question screens release navigation ownership and preserve local review only', () => {
  const focus = read('mobile/src/navigation/AndroidFocusMode.android.ts');
  assert.match(focus, /useScreenActive\(\)/);
  assert.match(focus, /owners\.delete\(id\)/);
  assert.doesNotMatch(focus, /mobileApi|fetch\(/);
  const practice = native('screens/TabScreens');
  assert.match(practice, /viewedAnswers\.current\.generation!==pageGeneration\.current/);
  assert.match(practice, /restorePracticeView\(questionIndex-1\)/);
  assert.match(practice, /practiceReviewHistory\(\)\.has\(next\.id\)/);
  assert.match(practice, /onPress=\{result\?continuePracticeQuestion:submitAnswer\}/);
  assert.match(native('screens/ExamScreen'), /useAndroidFocusMode\(!!exam&&!result\)/);
  const motion = native('components/Motion');
  assert.match(motion, /aria-checked=\{accessibilityProps\.accessibilityState\?\.checked\}/);
  assert.match(motion, /if\(reduceMotion\)return/);
  assert.equal(functions(motion).get('handlePress'), functions(read('mobile/src/components/Motion.tsx')).get('handlePress'), 'native accessibility styling preserves the original press action');
});
