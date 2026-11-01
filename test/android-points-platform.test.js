import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const read=file=>fs.readFileSync(new URL('../mobile/src/'+file,import.meta.url),'utf8').replace(/\r\n/g,'\n');
test('Android shell and teacher variants preserve business logic with bounded Android-only chrome changes',()=>{
  const shared=read('navigation/AppShell.tsx');
  const native=read('navigation/AppShell.android.tsx');
  // The approved Android redesign changes only presentation/navigation chrome.
  // Normalize those bounded sections, then still compare all account, cache,
  // app-lifecycle, request and route-handling code byte for byte.
  const tabsBlock=source=>source.slice(source.indexOf('const tabs:'),source.indexOf('export function AppShell'));
  const chromeBlock=source=>source.slice(source.indexOf('function TabBar('),source.indexOf('function AiGenerationProgressPill('));
  const shell=native
    .replace("import { useAndroidFocusModeState } from './AndroidFocusMode.android';\n",'')
    .replace('  const focusMode=useAndroidFocusModeState();\n','')
    .replace('{!focusMode&&<TabBar activeTab={activeTab} onChange={handleNavigate} hidden={dailyPracticeOpen} />}', '<TabBar activeTab={activeTab} onChange={handleNavigate} hidden={dailyPracticeOpen} />')
    .replace("import { AndroidPointsBar } from '../components/AndroidPointsBar.android';\n",'')
    .replace("        {!isPreview&&session?.user&&<AndroidPointsBar headless userId={session.user.id} certificateId={session.user.certificateId} appActive={appActive}/>}\n",'')
    .replace("from '../screens/VipScreen.android';","from '../screens/VipScreen';")
    .replace(" onBack={() => onNavigate('profile')}",'')
    .replace(tabsBlock(native),tabsBlock(shared))
    .replace(chromeBlock(native),chromeBlock(shared));
  assert.equal(shell,shared);
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
