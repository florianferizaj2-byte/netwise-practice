import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(new URL('../mobile/src/' + file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
function block(source, start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `missing contract block: ${start}`);
  return source.slice(from, to);
}

test('Android-only points, offline study and community navigation do not replace shared account and practice logic', () => {
  const shared = read('navigation/AppShell.tsx');
  const native = read('navigation/AppShell.android.tsx');
  const tabs = block(native, 'const tabs:', 'export function AppShell');
  assert.deepEqual([...tabs.matchAll(/id: '([^']+)'/g)].map((match) => match[1]), ['today', 'practice', 'community', 'exam', 'profile']);
  assert.match(native, /case 'community':\s*return <CommunityScreen learning/);
  assert.match(native, /case 'vip':/);
  assert.match(native, /activeTab === 'vip' \? 'profile' : activeTab/);
  assert.match(native, /const tab = destination === 'ai' \? 'exam' : destination/);
  assert.match(native, /<AiLearningTaskNotice inline enabled=\{appActive && !!session && !focusMode && activeTab !== 'exam' && !dailyPracticeOpen\}/);
  assert.match(native, /enablePractice openAiKey=\{data.aiEntry.key\} openAiKind=\{data.aiEntry.kind\}/);
  assert.match(native, /visibleProgressJob && !inlineAiProgress/);
  assert.match(native, /const inlineAiProgress=inlineAiGenerationPage/);
  assert.doesNotMatch(block(native, 'function AiGenerationProgressPill(', 'const createStyles'), /mobileApi\.|studyCache\./);
  assert.match(native, /backendConnectionNotice\(release\)/);
  assert.match(native, /useOfflineStudySync\(isPreview \? undefined : session\?\.user, appActive\)/);
  assert.match(native, /usePracticeAttemptOwner\(isPreview\?undefined:session\?\.user,appActive\)/);
  assert.match(native, /<PracticeSyncNotice\/>/);
  assert.match(native, /<AndroidPointsBar headless userId=\{session.user.id\} certificateId=\{session.user.certificateId\} appActive=\{appActive\}/);
  assert.match(native, /practiceVoice\.setAccount\(String\(session.user.id\)\)/);
  assert.doesNotMatch(shared, /practiceAttemptSync|PracticeSyncNotice|practiceVoice|AndroidPoints|registerMobileRequestHooks/);

  // Keep exact parity for the shared business operations, not full-screen
  // equality now that Android intentionally uses different routes and launch UI.
  for (const [start, end] of [
    ['  function handleAuthenticated', '  function handleNavigate'],
    ["    if (tab === 'practice' && options?.practiceSession === 'daily')", '  function markAiJobNoticeSeen'],
    ['  function markAiJobNoticeSeen', '  const seenAiJobSet'],
  ]) {
    assert.equal(block(native, start, end), block(shared, start, end), start.trim());
  }

  const teacher = read('screens/subjective-study/TeacherSheet.android.tsx')
    .replace("import { AndroidPointsInline } from '../../components/AndroidPointsBar.android';\n", '')
    .replace('          <AndroidPointsInline active={open}/>\n', '');
  assert.equal(teacher, read('screens/subjective-study/TeacherSheet.tsx'));
  assert.doesNotMatch(read('api/client.ts'), /import.*(?:PointsBar|androidPointsRuntime|androidPointsFlow)/);
});
