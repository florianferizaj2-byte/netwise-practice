import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from '../mobile/node_modules/typescript/lib/typescript.js';
const read=p=>fs.readFileSync(new URL('../mobile/src/'+p,import.meta.url),'utf8');
function styles(file,legacy){
  const source=read(file),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let factory;
  const visit=n=>{if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='createStyles')factory=n.initializer.getText(ast);ts.forEachChild(n,visit)};visit(ast);assert.ok(factory);
  const module={exports:{}};const code=ts.transpileModule('module.exports='+factory,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(code,{module,StyleSheet:{create:x=>x,hairlineWidth:.5},[legacy]:()=>({}),androidAccent:()=>({soft:'#fff',ink:'#000',border:'#ddd'})});
  return module.exports({surface:'#fff',text:'#000',textMuted:'#555',border:'#ddd',brand:'#255FDF'});
}
test('profile utility cells have one centered row, not a wrapped line stranded at the top',()=>{
  const s=styles('screens/TabScreens.android.tsx','legacyProfileStyles');
  assert.equal(s.nativeAboutButton.flexWrap,undefined);assert.equal(s.nativeAboutButton.alignItems,'center');assert.equal(s.nativeAboutButton.justifyContent,'center');
  assert.equal(s.nativeAboutButton.minHeight,64);assert.equal(s.nativeAboutButtonStack.flex,0);assert.equal(s.nativeAboutStack.flexDirection,'column');
  const source=read('screens/TabScreens.android.tsx');const utilities=source.slice(source.indexOf('testID="profile-utilities"'),source.indexOf('{onLogout&&',source.indexOf('testID="profile-utilities"')));
  assert.doesNotMatch(utilities,/APP_VERSION|nativeVersion/);assert.match(utilities,/name="heart"/);assert.match(source,/移动端 v\{APP_VERSION\}/);
});
test('membership page owns focused navigation and uses explicit, unbroken plan information',()=>{
  const source=read('screens/VipScreen.android.tsx');assert.match(source,/useAndroidFocusMode\(!!onBack, onBack\)/);
  assert.match(source,/每日 \{item.points \?\? '—'\} 积分<\/Text><Text[^>]+>30 天<\/Text>/);assert.doesNotMatch(source,/\{item.points\} 积分 \/ 30 天/);
  const footer=source.slice(source.indexOf('testID="vip-purchase-footer"'),source.indexOf('{studyVisited'));
  assert.match(footer,/购买后返回兑换/);assert.doesNotMatch(footer,/价格与时长以购买页为准/);
});
test('membership narrow and large-text layouts have intrinsic height, not vertical flex fillers',()=>{
  const s=styles('screens/VipScreen.android.tsx','legacyVipStyles');
  assert.equal(s.planCompact.flex,0);assert.equal(s.balanceGroupStack.flex,0);assert.equal(s.purchaseSummaryStack.flex,0);
  assert.equal(s.planRowStack.flexDirection,'column');assert.equal(s.nativePurchaseStack.flexDirection,'column');
  assert.equal(s.purchaseHint.minWidth,0);assert.equal(s.nativePurchaseLine.flexWrap,undefined);
});

test('membership uses backend plan values and owns hardware-back dismissal',()=>{const vip=read('screens/VipScreen.android.tsx'),focus=read('navigation/AndroidFocusMode.android.ts');assert.match(vip,/account\?\.pointsPlans/);assert.match(vip,/remote.priceCents/);assert.match(vip,/remote.dailyPoints/);assert.doesNotMatch(vip,/remote.monthlyPoints/);assert.match(focus,/hardwareBackPress/);assert.match(focus,/back\?\.remove\(\)/);});
