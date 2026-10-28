import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { resolve } = require('../mobile/node_modules/metro-resolver');
test('the real Metro Android resolver selects native insets and does not resolve the checkpoint adapter into itself', () => {
  const context = originModulePath => ({ originModulePath:path.resolve(originModulePath),
    sourceExts:['js','jsx','json','ts','tsx'], assetExts:new Set(), preferNativePlatform:true,
    mainFields:['react-native','browser','main'], nodeModulesPaths:[], getPackageForModule:()=>null,
    doesFileExist:fs.existsSync, fileSystemLookup(file){try{const stat=fs.statSync(file);return{exists:true,type:stat.isDirectory()?'d':'f',realPath:fs.realpathSync(file)}}catch{return{exists:false}}},
  });
  const area=resolve(context('mobile/src/navigation/AppShell.android.tsx'),'../components/SafeArea','android');
  assert.equal(area.filePath,path.resolve('mobile/src/components/SafeArea.android.ts'));
  const checkpoint=resolve(context('mobile/src/api/practiceCheckpoint.android.ts'),'./practiceCheckpointStore','android');
  assert.equal(checkpoint.filePath,path.resolve('mobile/src/api/practiceCheckpointStore.ts'));
});
const read = p => fs.readFileSync(p, 'utf8');
test('Android page and modal boundaries use measured four-edge insets, not a fixed status-bar guess', () => {
  const boundary = read('mobile/src/components/SafeArea.android.ts');
  assert.match(boundary, /SafeAreaProvider/);
  assert.match(boundary, /SafeAreaInsetsContext/);
  assert.match(boundary, /parentInsets \? undefined : initialWindowMetrics/);
  assert.match(boundary, /edges: \['top', 'right', 'bottom', 'left'\]/);
  const shell = read('mobile/src/navigation/AppShell.android.tsx');
  assert.doesNotMatch(shell, /paddingTop: Platform\.OS === 'android' \? NativeStatusBar\.currentHeight/);
  for (const file of ['AuthScreen.tsx', 'CertificateScreen.android.tsx', 'AccountSecurityScreen.android.tsx', 'ProfileSetupScreen.android.tsx', 'ExamScreen.android.tsx', 'TabScreens.android.tsx']) {
    const screen = read('mobile/src/screens/' + file);
    assert.match(screen, /import \{ SafeAreaView \} from ['"]\.\.\/components\/SafeArea['"]/);
    assert.match(screen, /<SafeAreaView/);
  }
  assert.match(read('mobile/src/components/AnnouncementDialog.tsx'), /<SafeAreaView style=\{s.backdrop\}/);
  assert.match(read('mobile/src/components/AndroidModalSafeArea.android.tsx'), /SafeAreaProvider initialMetrics=\{initialWindowMetrics\}/);
  const native = read('mobile/modules/route-player/android/src/main/java/com/kaojiang/routeplayer/ui/MinimalActivity.kt');
  assert.match(native, /systemBars\(\) or WindowInsetsCompat.Type.displayCutout\(\)/);
  assert.match(native, /left \+ bars.left, top \+ bars.top, right \+ bars.right, bottom \+ bars.bottom/);
});
test('location learning reuses the actual exam renderer and scopes entry/answer audio to the visible question', () => {
  for (const file of ['ExamScreen', 'LocationLearningGate']) {
    const screen = read('mobile/src/screens/' + file + '.android.tsx');
    assert.match(screen, /import \{ ExamQuestionCard, ExamAnswerGrid \}/);
    assert.match(screen, /<ExamQuestionCard/); assert.match(screen, /<ExamAnswerGrid/);
  }
  const gate = read('mobile/src/screens/LocationLearningGate.android.tsx');
  assert.match(gate, /!cardOpen && reviewIndex===null && visible && appActive/);
  assert.match(gate, /practiceVoice.enter\(voiceScope/);
  assert.match(gate, /playCorrectAnswerFeedback\(correct,/);
  assert.match(gate, /sounded.current.has\(id\)/);
});
