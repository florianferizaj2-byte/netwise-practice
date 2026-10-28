import vm from 'node:vm';
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


// Exercise the approved changed handler instead of pretending it is still a
// byte-identical renderer: validation, instant preview, synchronous duplicate
// protection and the authoritative fallback all remain release requirements.
function verifyInstantSubmission(body){
  function fixture(overrides={}){
    const observed={result:null,error:null,submitting:false,ids:{},queued:[],network:[],feedback:[]};
    const q={id:'q',type:'single_choice',answer:['A'],analysis:'prefetched solution'};
    const ctx={module:{exports:null},currentQuestion:q,result:null,submitting:false,selected:['B'],responseDraft:'',preview:false,user:{id:'learner',certificateId:'cert'},API_BASE_URL:'https://example.test/api',sync:{ready:true,owner:JSON.stringify(['https://example.test/api','learner','cert'])},feedbackById:{},submissionGuard:{current:''},fallbackIds:{current:new Map()},pageGeneration:{current:1},elapsedTime:()=>1234,studyRequestId:()=> '00000000-0000-4000-8000-000000000001',sameAnswers:(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort()),setError:x=>observed.error=x,setSubmitting:x=>observed.submitting=x,setResult:x=>observed.result=x,publishSubmittedResult:x=>{observed.result=x;observed.feedback.push(x.correct)},setSyncIds:fn=>observed.ids=fn(observed.ids),practiceAttemptSync:{enqueue:p=>{observed.queued.push(p);return 'queued-id'}},mobileApi:{async recordAttempt(...args){observed.network.push(args);return {questionId:'q',selected:args[1],correct:true,timeMs:1234,answer:['B'],analysis:'authoritative'}}},...overrides};
    const js=ts.transpileModule('module.exports=async function()'+body,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;vm.runInNewContext(js,ctx);return {run:ctx.module.exports,observed};
  }
  // The handler is async, but its prefetched branch must synchronously publish
  // feedback and enqueue before returning, without entering a network await.
  const f=fixture();void f.run();assert.equal(f.observed.result.correct,false);assert.equal(f.observed.result.analysis,'prefetched solution');assert.equal(f.observed.queued.length,1);assert.equal(f.observed.network.length,0);assert.equal(f.observed.submitting,false);assert.deepEqual(f.observed.feedback,[false]);void f.run();assert.equal(f.observed.queued.length,1,'double tap is one submission');assert.equal(f.observed.feedback.length,1,'double tap cannot replay feedback');
  const correct=fixture({selected:['A']});void correct.run();assert.deepEqual(correct.observed.feedback,[true]);
  const empty=fixture({selected:[]});void empty.run();assert.equal(empty.observed.queued.length,0);assert.ok(empty.observed.error);
  const short=fixture({currentQuestion:{id:'short',type:'short_answer',answer:['A']},responseDraft:''});void short.run();assert.equal(short.observed.queued.length,0);assert.ok(short.observed.error);
  const oldServer=fixture({currentQuestion:{id:'q',type:'single_choice'}});void oldServer.run();assert.equal(oldServer.observed.queued.length,0);assert.equal(oldServer.observed.network.length,1);assert.match(oldServer.observed.network[0][4],/^[0-9a-f-]{36}$/);
}

test('Android screen variants retain their practice and exam business handlers', () => {
  for (const name of ['screens/TabScreens', 'screens/ExamScreen', 'screens/AccountSecurityScreen', 'screens/ProfileSetupScreen', 'components/RedeemCodeModal']) {
    const base = functions(read('mobile/src/' + name + '.tsx'));
    const next = functions(native(name));
    let compared = 0;
    for (const [key, body] of base) {
      // Exported screen composition and pure display helpers are intentionally new.
      if (/Screen$|Modal$|^Screen|^SettingRow$|^GuideStep$|^Quota$|^Benefit$|^PrimaryAction$/.test(key)) continue;
      let actual=next.get(key);
      if(name==='screens/TabScreens'&&key==='loadDailyPracticeQuestions'){
        assert.match(actual,/feedback: 'instant'/);
        actual=actual.replace(", feedback: 'instant' as const",'').replace('true, filters)','true, hasSelection ? filters : undefined)').replace(", { feedback: 'instant' })",')');
      }
      if(name==='screens/TabScreens'&&key==='loadMoreQuestions'){
        assert.match(actual,/ownedPracticePage/);
        actual=actual.replace("(managedPractice && user ? ownedPracticePage(practiceOwner(user), ownedSelection.current, nextOffset, pageSeed.current, randomBefore.current) : ",'').replace('undefined)).then','undefined).then');
        assert.match(actual,/feedback: 'instant'/);
        assert.match(actual,/excludeCorrect: '1' as const, before: randomBefore.current/);
        // HTTP continuity tests cover the new owned random filter; the rest of
        // paging, cancellation, deduplication and error handling stays compared.
        actual=actual.replace("feedback: 'instant', ",'').replace("...(practiceMode === 'random' ? { excludeCorrect: '1' as const, before: randomBefore.current } : {}), ",'');
      }
      if(name==='screens/TabScreens'&&['askAiTeacher','analyzeWithAi','generateAiPractice'].includes(key)){
        assert.match(actual,/recordSyncPending/);actual=actual.replace(' || recordSyncPending','');
      }
      if(name==='screens/TabScreens'&&key==='removeCurrentWrong'){
        // User-approved explicit delete+advance is exercised with the real
        // compiled handler in practice-actions.test.js, including failures.
        assert.match(actual,/wrongDeleteLock.current/);assert.match(actual,/recordSyncPending/);
        assert.match(actual,/mobileApi.removeWrong/);assert.match(actual,/setTotalQuestions/);compared++;continue;
      }
      if(name==='screens/TabScreens'&&['previousPracticeQuestion','continuePracticeQuestion'].includes(key))actual=actual.replace(' || wrongDeleteBusy','');
      if(name==='screens/TabScreens'&&key==='requestPracticeExit'){
        assert.match(actual,/saveLatest.current\(\).then/);assert.match(actual,/续刷进度未保存/);compared++;continue;
      }
      if(name==='screens/TabScreens'&&key==='submitAnswer'){
        assert.match(actual,/practiceAttemptSync\.enqueue/);assert.match(actual,/clientAttemptId/);
        assert.match(next.get('publishSubmittedResult'),/playCorrectAnswerFeedback\(next.correct,/);
        verifyInstantSubmission(actual);compared++;continue;
      }
      assert.equal(actual, body, name + ': ' + key + ' business handler changed');
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
