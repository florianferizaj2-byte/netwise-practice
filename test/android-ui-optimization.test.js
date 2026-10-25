import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from '../mobile/node_modules/typescript/lib/typescript.js';

const read = file => fs.readFileSync(new URL('../mobile/src/' + file, import.meta.url), 'utf8');
const source = read('screens/TabScreens.android.tsx');
const parsed = ts.createSourceFile('native.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let exitSource;
const visit = node => {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'requestPracticeExit') exitSource = node.getText(parsed);
  ts.forEachChild(node, visit);
};
visit(parsed);

test('Android save-in-progress blocks navigation; AI-in-progress requires explicit informed exit', () => {
  assert.ok(exitSource);
  const navigations = [], alerts = [];
  const context = vm.createContext({ practiceSaving: true, aiBusy: '', practiceMode: 'sequential', practiceSession: 'standard',
    onNavigate: (...args) => navigations.push(JSON.parse(JSON.stringify(args))), Alert: { alert: (...args) => alerts.push(args) } });
  const exit = vm.runInContext('(' + exitSource + ')', context);
  exit(); assert.equal(navigations.length, 0); assert.equal(alerts.length, 0);
  context.practiceSaving = false; exit();
  assert.deepEqual(navigations.pop(), ['practice', { practiceMode: 'sequential', practiceSession: 'standard' }]);
  context.aiBusy = 'teacher'; exit();
  assert.equal(navigations.length, 0); assert.equal(alerts.length, 1);
  const [title, message, buttons] = alerts[0];
  assert.equal(title, 'AI 仍在处理中'); assert.match(message, /不会自动取消/);
  assert.equal(buttons[0].style, 'cancel'); buttons[1].onPress();
  assert.equal(navigations.length, 1);
  assert.doesNotMatch(exitSource, /mobileApi|androidPointsFlow|abort\(|cancel\(/);
});

test('Android question header reflows its title between balanced action columns', () => {
  assert.match(source, /nativeHeaderLeading:\{width:96\}/);
  assert.match(source, /nativeCenteredTitle:\{flex:1,minWidth:0,alignItems:'center'\}/);
  assert.doesNotMatch(source, /nativeCenteredTitle:\{position:'absolute'/);
  assert.match(source, /nativeQuestionFooterBody:.*maxWidth:760/);
  assert.match(source, /disabled=\{practiceSaving\}/);
  assert.match(source, /practiceSession,practiceSaving,aiBusy/);
});

test('Android compact wallet exposes owned holds, retry and accessible balance without altering billing', () => {
  const ui = read('components/AndroidUi.android.tsx');
  assert.match(ui, /const wallet = owned \? state.wallet : null, error = owned \? state.error : ''/);
  assert.match(ui, /accessibilityValue=\{\{text:wallet/);
  assert.match(ui, /wallet\?\.heldUnits/);
  assert.match(ui, /重新同步积分余额/);
  assert.match(ui, /积分未同步，点击重试/);
  assert.match(ui, /预扣中 \{held\} 积分 · 以最终结算为准/);
  assert.doesNotMatch(ui, /reserveCall|availableUnits\s*[-+]=|chargedUnits\s*=/);
  assert.match(read('components/Motion.android.tsx'), /accessibilityValue/);
  assert.doesNotMatch(read('components/Motion.tsx'), /accessibilityValue/);
});
