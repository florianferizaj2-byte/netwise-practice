import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from '../mobile/node_modules/typescript/lib/typescript.js';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const screen=read('mobile/src/screens/TabScreens.android.tsx');
const tree=ts.createSourceFile('screen.tsx',screen,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),styles=new Map();
function walk(node){if(ts.isPropertyAssignment(node)&&ts.isObjectLiteralExpression(node.initializer))styles.set(node.name.getText(tree),node.initializer.getText(tree));ts.forEachChild(node,walk)}walk(tree);

test('Android option labels have a centered line box and a font-scale-aware round badge',()=>{
  assert.match(styles.get('optionLetterText'),/textAlign:'center'/);
  assert.match(styles.get('optionLetterText'),/textAlignVertical:'center'/);
  assert.match(styles.get('optionLetterText'),/height:'100%'/);
  assert.match(screen,/optionBadgeEdge = Math.ceil\(36 \* Math.max\(1, practiceFontScale\)\)/);
  assert.match(screen,/lineHeight:optionBadgeEdge\/Math.max\(0.5,practiceFontScale\)/);
});
test('Android feedback and AI actions reserve padding and wrap the collection instead of splitting labels',()=>{
  for(const key of ['feedbackGood','feedbackBad'])assert.match(styles.get(key),/padding:18/);
  assert.match(styles.get('aiToolWide'),/flexBasis:'100%'/);
  assert.match(screen,/practiceWidth < 360 \|\| practiceFontScale > 1.15/);
  for(const label of ['错因分析','详细讲解','生成 3 道变式题'])assert(screen.includes(label));
});
test('Android modal windows have their own safe-area provider and do not rely on RN SafeAreaView',()=>{
  const safe=read('mobile/src/components/AndroidModalSafeArea.android.tsx');
  assert.match(safe,/SafeAreaProvider initialMetrics=\{initialWindowMetrics\}/);
  assert.match(safe,/edges=\{\['top', 'right', 'bottom', 'left'\]\}/);
  for(const file of ['mobile/src/components/AndroidPointsBar.android.tsx','mobile/src/screens/LocationLearningGate.android.tsx']){
    const code=read(file);assert.match(code,/AndroidModalSafeArea/);assert.match(code,/statusBarTranslucent/);assert.match(code,/navigationBarTranslucent/);
  }
});
test('AI cost details start folded without removing explicit request consent or cancellation',()=>{
  const code=read('mobile/src/components/AndroidPointsBar.android.tsx');
  assert.doesNotMatch(code,/使用 AI 前确认积分/);
  assert.match(code,/const \[expanded,setExpanded\]=useState\(false\)/);
  assert.match(code,/expanded&&<View testID="android-ai-cost-details"/);
  assert.match(code,/onPress=\{androidPointsFlow.accept\}/);
  assert.match(code,/onPress=\{androidPointsFlow.cancel\}/);
  assert.match(code,/费用说明/);
});
test('profile membership card uses a neutral surface with a prominent grouped balance',()=>{
  assert.match(styles.get('nativeMembership'),/backgroundColor:c.surface/);
  assert.match(screen,/<AndroidPointsLink userId=\{user\?\.id\} membership\//);
  assert.match(screen,/fontScale>1.2&&styles.nativeMemberActionLarge/);
  const code=read('mobile/src/components/AndroidUi.android.tsx');
  assert.match(code,/memberBalance:\{fontSize:28/);
  assert.match(code,/testID="profile-points-value"/);
  assert.match(code,/fontScale>1.25&&s.memberBalanceStack/);
});
