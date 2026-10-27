import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const read=file=>fs.readFileSync(new URL('../mobile/src/'+file,import.meta.url),'utf8').replace(/\r\n/g,'\n');
test('Android shell and teacher variants preserve business logic with bounded Android-only chrome changes',()=>{
  const shared=read('navigation/AppShell.tsx');
  const native=read('navigation/AppShell.android.tsx');
  // Android has approved presentation plus an account-owned practice outbox.
  // Normalize those bounded sections, then still compare all account, cache,
  // app-lifecycle, request and route-handling code byte for byte.
  const tabsBlock=source=>source.slice(source.indexOf('const tabs:'),source.indexOf('export function AppShell'));
  const chromeBlock=source=>source.slice(source.indexOf('function TabBar('),source.indexOf('function AiGenerationProgressPill('));
  // Version diagnostics and native motion are approved bounded differences;
  // login restoration, account ownership, cached tabs and route handlers must
  // still match the shared implementation exactly.
  const motionBlock=s=>s.slice(s.indexOf('  useEffect(() => {\n    if (!isPreview && !session) return;'),s.indexOf('  function handleAuthenticated'));
  const versionBlock=s=>{const at=s.indexOf('.appVersion(APP_VERSION)');return s.slice(s.lastIndexOf('  useEffect(() => {',at),s.indexOf(motionBlock(s)));};
  const pillBlock=s=>s.slice(s.indexOf('function AiGenerationProgressPill('),s.lastIndexOf('const createStyles'));
  const stylesBlock=s=>s.slice(s.lastIndexOf('const createStyles'));
  const noticeAt=native.indexOf('        {!isPreview && !!backendNotice');
  const notice=native.slice(noticeAt,native.indexOf('        {!isPreview&&session?.user&&<AndroidPointsBar',noticeAt));
  assert.doesNotMatch(pillBlock(native),/mobileApi\.|studyCache\./);
  assert.match(native,/backendConnectionNotice\(release\)/);
  assert.match(native,/usePracticeAttemptOwner\(isPreview\?undefined:session\?\.user,appActive\)/);
  assert.match(native,/<PracticeSyncNotice\/>/);
  assert.doesNotMatch(shared,/practiceAttemptSync|PracticeSyncNotice/);
  let shell=native
    .replace("import {PracticeSyncNotice} from '../components/PracticeSyncNotice.android';\n",'')
    .replace("import {usePracticeAttemptOwner} from '../api/practiceAttemptSync.android';\n",'')
    .replace("  usePracticeAttemptOwner(isPreview?undefined:session?.user,appActive);\n",'')
    .replace("import { Easing } from 'react-native';\n",'')
    .replace("import { androidMotion } from '../android-design-tokens';\n",'')
    .replace("import { backendConnectionNotice } from '../api/backendContract';\n",'')
    .replace("  const [backendNotice, setBackendNotice] = useState('');\n",'')
    .replace('const { colors, animationScale, resolvedMode, reduceMotion }','const { animationScale, resolvedMode, reduceMotion }')
    .replace(versionBlock(native),versionBlock(shared))
    .replace(motionBlock(native),motionBlock(shared))
    .replace(pillBlock(native),pillBlock(shared))
    .replace(stylesBlock(native),stylesBlock(shared))
    .replace(notice,'')
    .replace('          { bytes: release.apkBytes, md5: release.apkMd5 },\n','')
    .replace("import { useAndroidFocusModeState } from './AndroidFocusMode.android';\n",'')
    .replace('  const focusMode=useAndroidFocusModeState();\n','')
    .replace('{!focusMode&&<TabBar activeTab={activeTab} onChange={handleNavigate} hidden={dailyPracticeOpen} />}', '<TabBar activeTab={activeTab} onChange={handleNavigate} hidden={dailyPracticeOpen} />')
    .replace("import { AndroidPointsBar } from '../components/AndroidPointsBar.android';\n",'')
    .replace("        {!isPreview&&session?.user&&<AndroidPointsBar headless userId={session.user.id} certificateId={session.user.certificateId} appActive={appActive}/>}\n",'')
    .replace("from '../screens/VipScreen.android';","from '../screens/VipScreen';")
    .replace(" onBack={() => onNavigate('profile')}",'')
    .replace(tabsBlock(native),tabsBlock(shared))
    .replace(chromeBlock(native),chromeBlock(shared));
  let at=0;while(at<shell.length&&shell[at]===shared[at])at++;
  assert.ok(shell===shared,'Business-code drift at '+at+': '+JSON.stringify(shell.slice(at,at+120))+' versus '+JSON.stringify(shared.slice(at,at+120)));
  assert.equal((tabsBlock(native).match(/id: '/g)||[]).length,5);
  assert.doesNotMatch(tabsBlock(native),/id: 'vip'/);
  assert.match(native,/case 'vip':/);
  assert.match(native,/activeTab === 'vip' \? 'profile' : activeTab/);
  const teacher=read('screens/subjective-study/TeacherSheet.android.tsx')
    .replace("import { AndroidPointsInline } from '../../components/AndroidPointsBar.android';\n",'')
    .replace('          <AndroidPointsInline active={open}/>\n','');
  assert.equal(teacher,read('screens/subjective-study/TeacherSheet.tsx'));
  assert.doesNotMatch(read('navigation/AppShell.tsx'),/AndroidPoints|registerMobileRequestHooks/);
  assert.doesNotMatch(read('api/client.ts'),/import.*(?:PointsBar|androidPointsRuntime|androidPointsFlow)/);
});
