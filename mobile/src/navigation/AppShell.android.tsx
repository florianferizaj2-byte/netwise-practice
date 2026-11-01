import { AiIcon } from '../screens/ai-learning/AiElements';
import { inlineAiGenerationPage } from '../aiGenerationPresentation';
import {PracticeSyncNotice} from '../components/PracticeSyncNotice.android';
import {usePracticeAttemptOwner} from '../api/practiceAttemptSync.android';
import { useAndroidFocusModeState } from './AndroidFocusMode.android';
import { AppIcon } from '../components/AppIcon';
import { Easing } from 'react-native';
import { androidMotion } from '../android-design-tokens';
import { ContentPlaceholder } from '../components/ContentPlaceholder';
import { iosStyles } from '../iosStyles';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  ActivityIndicator,
  Linking,
  Modal,
  PanResponder,
  Platform,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from '../components/SafeArea';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  mobileApi,
  studyCache,
  type AppVersionResponse,
  type AiQuestionGenerationJob,
  type AuthResponse,
  type DashboardResponse,
} from '../api/client';
import { useCachedQuery } from '../api/useCachedQuery';
import { ScreenActivityProvider, useAppActive } from './ScreenActivity';
import { AnimatedPressable, EntranceView } from '../components/Motion';
import { BrandMark } from '../components/BrandMark';
import { useLaunchStage } from '../launch/LaunchReadiness';
import { AuthScreen } from '../screens/AuthScreen';
import { ProfileSetupScreen } from '../screens/ProfileSetupScreen';
import { CertificateScreen } from '../screens/CertificateScreen';
import {
  ExamScreen,
  PracticeScreen,
  ProfileScreen,
  TodayScreen,
  WrongScreen,
} from '../screens/TabScreens';
import { VipScreen } from '../screens/VipScreen.android';
import { DailyPracticePanel } from '../screens/DailyPracticePanel';
import {
  radius,
  shadow,
  spacing,
  useThemedStyles,
  useTheme,
  isAppleWeb,
  type ThemeColors,
} from '../theme';
import { APP_VERSION } from '../version';
import {practiceVoice} from '../practiceVoice';
import { backendConnectionNotice } from '../api/backendContract';
import { AiLearningScreen } from '../screens/AiLearningScreen';
import { ExamWorkspaceScreen } from '../screens/ExamWorkspaceScreen';
import { AiLearningTaskNotice } from '../components/AiLearningTaskNotice';
import { AndroidPointsBar } from '../components/AndroidPointsBar.android';
import { downloadAndInstallUpdate } from '../update';
import type {
  AppTab,
  NavigationOptions,
  PracticeMode,
  PracticeSession,
  PracticeSource,
} from '../types';

const tabs: Array<{ id: AppTab; label: string; icon: string; symbol: string }> = [
  { id: 'today', label: '今日', icon: '⌂', symbol: 'home' },
  { id: 'practice', label: '练习', icon: '✦', symbol: 'book' },
  { id: 'ai', label: 'AI 生成', icon: '✦', symbol: 'sparkles' },
  { id: 'exam', label: '考试', icon: '□', symbol: 'exam' },
  { id: 'profile', label: '我的', icon: '◎', symbol: 'person' },
];

export function AppShell() {
  const focusMode=useAndroidFocusModeState();
  const { colors, animationScale, resolvedMode, reduceMotion } = useTheme();
  const styles = useThemedStyles(createStyles, iosStyles.shell);
  const [isPreview, setIsPreview] = useState(false);
  const [session, setSession] = useState<AuthResponse | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('today');
  const [dailyPracticeOpen, setDailyPracticeOpen] = useState(false);
  const [aiExamEntryKey, setAiExamEntryKey] = useState(0);
  const [dailyPracticeDay, setDailyPracticeDay] = useState<string | null>(null);
  const appActive = useAppActive();
  useEffect(()=>{if(!session)void practiceVoice.setAccount(null);else if(appActive)void practiceVoice.setAccount(String(session.user.id));else practiceVoice.stop();},[session?.user.id,appActive]);
  usePracticeAttemptOwner(isPreview?undefined:session?.user,appActive);
  const { data: dashboard } = useCachedQuery(
    '/dashboard?summary=1',
    mobileApi.dashboard,
    appActive && activeTab === 'today' && !dailyPracticeOpen && !!session?.user.certificateId && session?.user.profileComplete === true,
  );
  const [visitedTabs, setVisitedTabs] = useState<AppTab[]>(['today']);
  const [practiceMode, setPracticeMode] = useState<PracticeMode>('sequential');
  const [practiceRouteId, setPracticeRouteId] = useState(0);
  const [practiceSession, setPracticeSession] =
    useState<PracticeSession>('standard');
  const [practiceSource, setPracticeSource] = useState<PracticeSource>('all');
  const [practiceChapter, setPracticeChapter] = useState<string | undefined>();
  const [practiceKnowledgeSection, setPracticeKnowledgeSection] = useState<
    string | undefined
  >();
  const [practiceKnowledgePoint, setPracticeKnowledgePoint] = useState<
    string | undefined
  >();
  const [practiceSelectionComplete, setPracticeSelectionComplete] =
    useState(false);
  const [practiceAiLibrary, setPracticeAiLibrary] = useState(false);
  const [practiceQuestionId, setPracticeQuestionId] = useState<
    string | undefined
  >();
  const [practiceQuestionIds, setPracticeQuestionIds] = useState<string[] | undefined>();
  const [practiceAiGroupId, setPracticeAiGroupId] = useState<string | undefined>();
  const [aiQuestionGroupId, setAiQuestionGroupId] = useState<string | undefined>();
  const [aiQuestionJobs, setAiQuestionJobs] = useState<AiQuestionGenerationJob[]>([]);
  const [seenAiJobIds, setSeenAiJobIds] = useState<string[]>([]);
  const [seenAiJobOwner, setSeenAiJobOwner] = useState<string | null>(null);
  const [shownAiJobId, setShownAiJobId] = useState<string | null>(null);
  const seenAiJobIdsRef = useRef(new Set<string>());
  const knownAiJobStatuses = useRef(new Map<string, AiQuestionGenerationJob['status']>());
  const [certificatePickerOpen, setCertificatePickerOpen] = useState(false);
  const [sessionRestored, setSessionRestored] = useState(false);
  useLaunchStage('route', sessionRestored);
  const [updateRelease, setUpdateRelease] = useState<AppVersionResponse | null>(
    null,
  );
  const [versionCheckKey, setVersionCheckKey] = useState(0);
  const [backendNotice, setBackendNotice] = useState('');
  const aiJobSeenStorageKey = session?.user.id
    ? `kaojiang-ai-job-notices:${session.user.id}`
    : null;
  const screenOpacity = useRef(new Animated.Value(1)).current;
  const screenOffset = useRef(new Animated.Value(0)).current;

  useEffect(
    () =>
      mobileApi.onStatus((status) => {
        if (status === 'expired') {
          setSession(null);
          setVisitedTabs(['today']);
        } else setVersionCheckKey((current) => current + 1);
      }),
    [],
  );

  useEffect(() => {
    setVisitedTabs(['today']);
    setActiveTab('today');
    setDailyPracticeOpen(false);
    setDailyPracticeDay(null);
  }, [session?.user.id, session?.user.certificateId, isPreview]);

  useEffect(() => {
    if (!appActive) void studyCache.flush();
  }, [appActive]);

  useEffect(() => {
    let mounted = true;
    setSeenAiJobIds([]);
    seenAiJobIdsRef.current = new Set();
    setSeenAiJobOwner(null);
    setShownAiJobId(null);
    if (!aiJobSeenStorageKey) {
      setSeenAiJobOwner('preview');
      return () => { mounted = false; };
    }
    void AsyncStorage.getItem(aiJobSeenStorageKey)
      .then((stored) => {
        if (!mounted) return;
        const parsed: unknown = stored ? JSON.parse(stored) : [];
        const ids = Array.isArray(parsed)
          ? parsed.filter((id): id is string => typeof id === 'string').slice(-200)
          : [];
        seenAiJobIdsRef.current = new Set(ids);
        setSeenAiJobIds(ids);
        setSeenAiJobOwner(aiJobSeenStorageKey);
      })
      .catch(() => {
        if (mounted) setSeenAiJobOwner(aiJobSeenStorageKey);
      });
    return () => { mounted = false; };
  }, [aiJobSeenStorageKey]);
  useEffect(() => {
    if (appActive && activeTab === 'today' && !dailyPracticeOpen && session?.user.certificateId && session.user.profileComplete)
      void mobileApi.dashboard().catch(() => undefined);
  }, [appActive, activeTab, dailyPracticeOpen, session?.user.id, session?.user.certificateId, session?.user.profileComplete]);

  useEffect(() => {
    if (!session?.user.certificateId || !session.user.profileComplete || isPreview) {
      setAiQuestionJobs([]);
      knownAiJobStatuses.current.clear();
      return;
    }
    if (!appActive) return;
    let mounted = true;
    const refreshJobs = async () => {
      try {
        const result = await mobileApi.aiQuestionGenerationJobs();
        if (!mounted) return;
        for (const job of result.jobs) {
          const previous = knownAiJobStatuses.current.get(job.id);
          if (job.status === 'completed' && previous !== 'completed')
            mobileApi.invalidateGeneratedQuestionData();
          knownAiJobStatuses.current.set(job.id, job.status);
        }
        setAiQuestionJobs(result.jobs);
      } catch {
        // The task itself keeps running in the server if progress is offline.
      }
    };
    void refreshJobs();
    const timer = setInterval(() => void refreshJobs(), 2500);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [appActive, isPreview, session?.user.id, session?.user.certificateId, session?.user.profileComplete]);

  useEffect(() => {
    let mounted = true;
    void mobileApi
      .restoreSession()
      .then(({ session: restoredSession, shouldValidate }) => {
        if (!mounted) return;
        if (restoredSession) {
          setSession(restoredSession);
          setIsPreview(false);
          setSessionRestored(true);
        }
        if (!shouldValidate) {
          setSessionRestored(true);
          return;
        }

        const refreshSession = () =>
          mobileApi
            .refreshSession()
            .then((currentSession) => {
              if (!mounted) return;
              if (currentSession) setSession(currentSession);
              else setSession(null);
              setSessionRestored(true);
            })
            .catch(() => {
              // Keep the cached session visible if this was only a network failure.
              if (mounted) setSessionRestored(true);
            });

        void refreshSession();
      })
      .catch(() => {
        // Keep the saved token for a later launch if this was only a network failure.
        if (mounted) setSessionRestored(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!appActive) return;
    void mobileApi
      .appVersion(APP_VERSION)
      .then((release) => {
        if (!mounted) return;
        setUpdateRelease(release.forceUpdate ? release : null);
        setBackendNotice(backendConnectionNotice(release));
      })
      .catch(() => {
        if (mounted) setBackendNotice('暂未连接到服务器，可先查看已缓存内容。网络恢复后请重新连接。');
        // A temporary network failure should not brick the app; normal API requests
        // will still report their own connection state after the check completes.
      });

    return () => {
      mounted = false;
    };
  }, [versionCheckKey, appActive]);

  useEffect(() => {
    if (!isPreview && !session) return;
    if (isAppleWeb || reduceMotion) {
      screenOpacity.setValue(1);
      screenOffset.setValue(0);
      return;
    }

    screenOpacity.setValue(0.98);
    screenOffset.setValue(5);
    const animation = Animated.parallel([
      Animated.timing(screenOpacity, {
        duration: Math.max(1, Math.round(androidMotion.enterMs * animationScale)),
        easing: Easing.out(Easing.cubic),
        isInteraction: false,
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(screenOffset, {
        duration: Math.max(1, Math.round(androidMotion.enterMs * animationScale)),
        easing: Easing.out(Easing.cubic),
        isInteraction: false,
        toValue: 0,
        useNativeDriver: true,
      }),
    ]);

    animation.start();
    return () => animation.stop();
  }, [
    activeTab,
    animationScale,
    reduceMotion,
    isPreview,
    screenOffset,
    screenOpacity,
    session?.user.id,
  ]);

  function handleAuthenticated(response: AuthResponse) {
    setSession(response);
    setIsPreview(false);
    setCertificatePickerOpen(false);
    resetPracticeNavigation();
    setActiveTab('today');
  }

  function handleCertificateSelected(user: AuthResponse['user']) {
    if (session) {
      const updatedSession = { ...session, user };
      setSession(updatedSession);
      void mobileApi.cacheSession(updatedSession).catch(() => undefined);
    }
    setCertificatePickerOpen(false);
    resetPracticeNavigation();
    setActiveTab('today');
  }

  function handleUserUpdated(user: AuthResponse['user']) {
    if (session) {
      const updatedSession = { ...session, user };
      setSession(updatedSession);
      void mobileApi.cacheSession(updatedSession).catch(() => undefined);
    }
  }

  function handleLogout() {
    if (session) void mobileApi.logout().catch(() => undefined);
    setSession(null);
    setIsPreview(false);
    setCertificatePickerOpen(false);
    resetPracticeNavigation();
  }

  function resetPracticeNavigation() {
    setPracticeSession('standard');
    setPracticeMode('sequential');
    setPracticeSource('all');
    setPracticeChapter(undefined);
    setPracticeKnowledgeSection(undefined);
    setPracticeKnowledgePoint(undefined);
    setPracticeSelectionComplete(false);
    setPracticeAiLibrary(false);
    setPracticeQuestionId(undefined);
    setPracticeQuestionIds(undefined);
    setPracticeAiGroupId(undefined);
    setAiQuestionGroupId(undefined);
  }

  function handleOpenCertificatePicker() {
    if (session?.certificates.length) setCertificatePickerOpen(true);
  }

  function handleNavigate(tab: AppTab, options?: NavigationOptions) {
    if (tab === 'exam' && options?.openAiExam) setAiExamEntryKey(key => key + 1);
    if (tab === 'practice' && options?.practiceSession === 'daily') {
      setDailyPracticeDay(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }));
      setDailyPracticeOpen(true);
      return;
    }
    setDailyPracticeOpen(false);
    if (tab === 'practice') {
      setPracticeAiLibrary(options?.practiceAiLibrary ?? false);
      if (options) {
        setPracticeRouteId((value) => value + 1);
        const nextSession = options.practiceSession ?? 'standard';
        setPracticeSession(nextSession);
        setPracticeSource(options.practiceSource ?? 'all');
        setPracticeChapter(options.practiceChapter);
        setPracticeKnowledgeSection(options.practiceKnowledgeSection);
        setPracticeKnowledgePoint(options.practiceKnowledgePoint);
        setPracticeSelectionComplete(options.practiceSelectionComplete ?? false);
        setPracticeQuestionId(options.practiceQuestionId);
        setPracticeQuestionIds(options.practiceQuestionIds);
        setPracticeAiGroupId(options.practiceAiGroupId);
        setAiQuestionGroupId(options.aiQuestionGroupId);
        setPracticeMode(
          options.practiceMode ??
            (nextSession === 'daily' ? 'random' : 'sequential'),
        );
      }
    }
    setVisitedTabs((current) =>
      current.includes(tab) ? current : [...current, tab],
    );
    setActiveTab(tab);
  }

  function markAiJobNoticeSeen(id: string) {
    if (seenAiJobIdsRef.current.has(id)) return;
    const next = [...seenAiJobIdsRef.current, id].slice(-200);
    seenAiJobIdsRef.current = new Set(next);
    setSeenAiJobIds(next);
    if (aiJobSeenStorageKey)
      void AsyncStorage.setItem(aiJobSeenStorageKey, JSON.stringify(next)).catch(() => undefined);
  }

  const seenAiJobSet = new Set(seenAiJobIds);
  const inlineAiProgress=inlineAiGenerationPage({tab:activeTab,mode:practiceMode,chapter:practiceChapter,point:practiceKnowledgePoint,library:practiceAiLibrary,daily:dailyPracticeOpen});
  const visibleProgressJob = aiQuestionJobs.find((item) => item.id === shownAiJobId) ?? null;
  const newestJob = aiQuestionJobs.find((item) => item.status === 'queued' || item.status === 'running')
    ?? aiQuestionJobs[0]
    ?? null;
  useEffect(() => {
    if (shownAiJobId || seenAiJobOwner !== (aiJobSeenStorageKey ?? 'preview') || !newestJob) return;
    if (!seenAiJobSet.has(newestJob.id)) setShownAiJobId(newestJob.id);
  }, [seenAiJobOwner, aiJobSeenStorageKey, newestJob?.id, seenAiJobIds, shownAiJobId]);
  useEffect(() => {
    if (visibleProgressJob) markAiJobNoticeSeen(visibleProgressJob.id);
  }, [visibleProgressJob?.id, aiJobSeenStorageKey]);

  function retryVersionCheck() {
    setVersionCheckKey((current) => current + 1);
  }

  if (!sessionRestored) {
    return <VersionCheckingScreen />;
  }

  if (updateRelease) {
    return (
      <UpdateRequiredScreen
        release={updateRelease}
        onRetry={retryVersionCheck}
      />
    );
  }

  if (!isPreview && !session) {
    return (
      <>
        <StatusBar style={resolvedMode === 'dark' ? 'light' : 'dark'} />
        <AuthScreen
          onAuthenticated={handleAuthenticated}
          onPreview={() => setIsPreview(true)}
        />
      </>
    );
  }

  if (session && session.user.profileComplete !== true) {
    return <><StatusBar style={resolvedMode === 'dark' ? 'light' : 'dark'} /><ProfileSetupScreen user={session.user} onSaved={handleUserUpdated} onLogout={handleLogout} /></>;
  }

  if (session && !session.user.certificateId) {
    return (
      <>
        <StatusBar style={resolvedMode === 'dark' ? 'light' : 'dark'} />
        <CertificateScreen
          certificates={session.certificates}
          onSelected={handleCertificateSelected}
        />
      </>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style={resolvedMode === 'dark' ? 'light' : 'dark'} />
      <Modal
        visible={!!session && certificatePickerOpen}
        onRequestClose={() => setCertificatePickerOpen(false)}
        animationType="slide"
      >
        <SafeAreaView style={styles.safeArea}>
          <CertificateScreen
            certificates={session?.certificates ?? []}
            currentCertificateId={session?.user.certificateId}
            onCancel={() => setCertificatePickerOpen(false)}
            onSelected={handleCertificateSelected}
          />
        </SafeAreaView>
      </Modal>
      <View style={styles.screen}>
        {!isPreview && !!backendNotice && <View testID="backend-connection-notice" accessibilityRole="alert" style={{ paddingHorizontal: spacing.md, paddingVertical: 12, gap: 8, backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text style={{ color: colors.text, fontSize: 14, lineHeight: 21 }}>{backendNotice}</Text>
          <AnimatedPressable accessibilityRole="button" onPress={() => setVersionCheckKey(key => key + 1)} style={{ alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12 }}>
            <Text style={{ color: colors.brand, fontSize: 14, fontWeight: '500' }}>重新连接</Text>
          </AnimatedPressable>
        </View>}
        {!isPreview&&session?.user&&<PracticeSyncNotice/>}
        {!isPreview&&session?.user&&<AndroidPointsBar headless userId={session.user.id} certificateId={session.user.certificateId} appActive={appActive}/>}
        <Animated.View
          accessibilityElementsHidden={dailyPracticeOpen}
          importantForAccessibility={dailyPracticeOpen ? 'no-hide-descendants' : 'auto'}
          style={[
            styles.content,
            {
              opacity: screenOpacity,
              transform: [{ translateY: screenOffset }],
            },
          ]}
        >
          {visitedTabs.map((tab) => (
            <View
              key={`${session?.user.id ?? 'preview'}:${session?.user.certificateId ?? ''}:${tab}`}
              style={[styles.content, tab !== activeTab && styles.hiddenScreen]}
              accessibilityElementsHidden={tab !== activeTab}
              importantForAccessibility={
                tab === activeTab ? 'auto' : 'no-hide-descendants'
              }
            >
              <ScreenActivityProvider
                active={
                  appActive && tab === activeTab && !certificatePickerOpen && !dailyPracticeOpen
                }
              >
                {renderScreen(tab, handleNavigate, {
                  dashboard: dashboard ?? null,
                  onLogout: handleLogout,
                  preview: isPreview,
                  practiceMode,
                  practiceRouteId,
                  practiceSession,
                  practiceSource,
                  practiceChapter,
                  practiceKnowledgeSection,
                  practiceKnowledgePoint,
                  practiceSelectionComplete,
                  practiceAiLibrary,
                  practiceQuestionId,
                  practiceQuestionIds,
                  practiceAiGroupId,
                  aiQuestionGroupId,
                  aiExamEntryKey,
                  onPracticeModeChange: setPracticeMode,
                  onOpenCertificatePicker: handleOpenCertificatePicker,
                  onUserUpdated: handleUserUpdated,
                  user: session?.user,
                  certificates: session?.certificates ?? [],
                })}
              </ScreenActivityProvider>
            </View>
          ))}
        </Animated.View>
        {visibleProgressJob && !inlineAiProgress && (
          <AiGenerationProgressPill
            job={visibleProgressJob}
            onClose={() => {
              markAiJobNoticeSeen(visibleProgressJob.id);
              setShownAiJobId(null);
            }}
            onPress={() => {
              markAiJobNoticeSeen(visibleProgressJob.id);
              setShownAiJobId(null);
              handleNavigate('practice', {
                practiceMode: 'ai',
                practiceChapter: visibleProgressJob.selection.chapter,
                practiceKnowledgeSection: visibleProgressJob.selection.knowledgeSection,
                practiceKnowledgePoint: visibleProgressJob.selection.knowledgePoint,
                practiceSelectionComplete: true,
                aiQuestionGroupId: visibleProgressJob.groupId || undefined,
              });
            }}
          />
        )}
        <AiLearningTaskNotice enabled={appActive && !!session && !focusMode && activeTab !== 'ai' && activeTab !== 'exam' && !dailyPracticeOpen}
          scope={String(session?.user.id) + ':' + session?.user.certificateId}
          onOpen={kind => handleNavigate(kind === 'exam' ? 'exam' : 'ai', {openAiExam: kind === 'exam'})} />
        {!focusMode&&<TabBar activeTab={activeTab} onChange={handleNavigate} hidden={dailyPracticeOpen} />}
        {dailyPracticeDay && <DailyPracticePanel
          key={`${session?.user.id ?? 'preview'}:${session?.user.certificateId ?? ''}:${dailyPracticeDay}`}
          user={session?.user} certificates={session?.certificates} onOpenCertificatePicker={handleOpenCertificatePicker}
          visible={dailyPracticeOpen}
          active={appActive && !certificatePickerOpen}
          preview={isPreview}
          onClose={() => { setDailyPracticeOpen(false); handleNavigate('today'); }}
          onNavigate={handleNavigate}
        />}
      </View>
    </SafeAreaView>
  );
}

function VersionCheckingScreen() {
  const { resolvedMode } = useTheme();
  const styles = useThemedStyles(createStyles, iosStyles.shell);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style={resolvedMode === 'dark' ? 'light' : 'dark'} />
      <View style={styles.sessionPlaceholder}>
        <BrandMark />
        <ContentPlaceholder rows={6} />
      </View>
    </SafeAreaView>
  );
}

function UpdateRequiredScreen({
  onRetry,
  release,
}: {
  onRetry: () => void;
  release: AppVersionResponse;
}) {
  const { resolvedMode } = useTheme();
  const styles = useThemedStyles(createStyles, iosStyles.shell);
  const web = Platform.OS === 'web';
  const downloadUrl = mobileApi.resolveDownloadUrl(release.downloadUrl);
  const [downloadState, setDownloadState] = useState<
    'idle' | 'downloading' | 'installing' | 'error'
  >('idle');
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState('');

  async function handleInAppUpdate() {
    if (downloadState === 'downloading' || downloadState === 'installing')
      return;

    setDownloadState('downloading');
    setDownloadProgress(0);
    setDownloadError('');
    try {
      await downloadAndInstallUpdate(
        downloadUrl,
        release.latestVersion,
        setDownloadProgress,
        () => setDownloadState('installing'),
          { bytes: release.apkBytes, md5: release.apkMd5 },
      );
      setDownloadState('idle');
      setDownloadProgress(null);
    } catch (error) {
      setDownloadState('error');
      setDownloadError(
        error instanceof Error
          ? error.message
          : web ? '刷新失败，请检查网络后重试。' : '应用内更新失败，请改用浏览器下载。',
      );
    }
  }

  const inAppButtonLabel =
    web ? (downloadState === 'downloading' || downloadState === 'installing' ? '正在刷新…' : '刷新到最新版本') :
    downloadState === 'downloading'
      ? downloadProgress === null
        ? '正在下载新版…'
        : `正在下载 ${downloadProgress}%`
      : downloadState === 'installing'
        ? '请在系统页面确认安装'
        : '应用内下载并安装';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style={resolvedMode === 'dark' ? 'light' : 'dark'} />
      <View style={styles.updateScreen}>
        <EntranceView distance={18} style={styles.updateCard}>
          <BrandMark />
          <Text style={styles.updateKicker}>版本更新</Text>
          <Text style={styles.updateTitle}>请更新到最新版</Text>
          <Text style={styles.updateText}>
            {web ? '当前版本需要更新。刷新后继续学习，已提交的学习记录会保留。' : '当前 App 版本已停止服务。你可以直接在 App 内下载并安装，也可以改用浏览器下载新版。'}
          </Text>
          <View style={styles.updateVersionRow}>
            <Text style={styles.updateVersionLabel}>当前版本</Text>
            <Text style={styles.updateVersionValue}>
              v{release.currentVersion}
            </Text>
            <AppIcon style={styles.updateVersionArrow}>→</AppIcon>
            <Text style={styles.updateVersionValue}>
              v{release.latestVersion}
            </Text>
          </View>
          {!!release.releaseNotes && (
            <Text style={styles.updateNotes}>
              本次更新：{release.releaseNotes}
            </Text>
          )}
          <AnimatedPressable
            accessibilityLabel={web ? '刷新到最新版本' : '在应用内下载并安装最新版 App'}
            accessibilityRole="button"
            disabled={
              downloadState === 'downloading' || downloadState === 'installing'
            }
            onPress={() => void handleInAppUpdate()}
            style={[
              styles.updateButton,
              (downloadState === 'downloading' ||
                downloadState === 'installing') &&
                styles.updateButtonDisabled,
            ]}
          >
            {downloadState === 'downloading' && (
              <ActivityIndicator
                color={styles.updateButtonText.color}
                size="small"
              />
            )}
            <Text style={styles.updateButtonText}>{inAppButtonLabel}</Text>
            {downloadState === 'downloading' && downloadProgress !== null && (
              <Text style={styles.updateButtonProgress}>
                {downloadProgress}%
              </Text>
            )}
          </AnimatedPressable>
          {downloadError && (
            <Text style={styles.updateError}>{downloadError}</Text>
          )}
          {!web && <AnimatedPressable
            accessibilityLabel="改用浏览器下载最新版 App"
            accessibilityRole="button"
            onPress={() =>
              void Linking.openURL(downloadUrl).catch(() => undefined)
            }
            style={styles.updateBrowserButton}
          >
            <Text style={styles.updateBrowserButtonText}>
              改用浏览器下载新版
            </Text>
            <AppIcon style={styles.updateBrowserButtonArrow}>→</AppIcon>
          </AnimatedPressable>}
          <AnimatedPressable
            accessibilityLabel="重新检查版本"
            accessibilityRole="button"
            onPress={onRetry}
            style={styles.updateRetryButton}
          >
            <Text style={styles.updateRetryText}>{web ? '重新检查版本' : '已安装，重新检查'}</Text>
          </AnimatedPressable>
        </EntranceView>
      </View>
    </SafeAreaView>
  );
}

function renderScreen(
  activeTab: AppTab,
  onNavigate: (tab: AppTab, options?: NavigationOptions) => void,
  data: {
    dashboard: DashboardResponse | null;
    onLogout: () => void;
    preview: boolean;
    practiceMode: PracticeMode;
    practiceRouteId: number;
    practiceSession: PracticeSession;
    practiceSource: PracticeSource;
    practiceChapter?: string;
    practiceKnowledgeSection?: string;
    practiceKnowledgePoint?: string;
    practiceSelectionComplete: boolean;
    practiceAiLibrary: boolean;
    practiceQuestionId?: string;
    practiceQuestionIds?: string[];
    practiceAiGroupId?: string;
    aiQuestionGroupId?: string;
    aiExamEntryKey?: number;
    onPracticeModeChange: (mode: PracticeMode) => void;
    onOpenCertificatePicker: () => void;
    onUserUpdated: (user: AuthResponse['user']) => void;
    user: AuthResponse['user'] | undefined;
    certificates: AuthResponse['certificates'];
  },
) {
  switch (activeTab) {
    case 'practice':
      return (
        <PracticeScreen
          key={data.practiceRouteId}
          onNavigate={onNavigate}
          {...data}
        />
      );
    case 'wrong':
      return <WrongScreen onNavigate={onNavigate} {...data} />;
    case 'ai':
      return <AiLearningScreen key={data.user?.id + ':' + data.user?.certificateId} user={data.user} preview={data.preview}
        certificateName={data.certificates.find(item => item.id === data.user?.certificateId)?.name || '当前证书'} onNavigate={onNavigate} />;
    case 'exam':
      return <ExamWorkspaceScreen key={data.user?.id + ':' + data.user?.certificateId} normal={<ExamScreen onNavigate={onNavigate} {...data} />}
        user={data.user} preview={data.preview} openAiKey={data.aiExamEntryKey}
        certificateName={data.certificates.find(item => item.id === data.user?.certificateId)?.name || '当前证书'} onNavigate={onNavigate} />;
    case 'vip':
      return <VipScreen preview={data.preview} user={data.user}
        certificateName={data.certificates.find((item) => item.id === data.user?.certificateId)?.name || '当前备考目标'}
        onOpenCertificates={data.onOpenCertificatePicker} onOpenPractice={() => onNavigate('practice')} onBack={() => onNavigate('profile')} />;
    case 'profile':
      return <ProfileScreen onNavigate={onNavigate} {...data} />;
    case 'today':
    default:
      return <TodayScreen onNavigate={onNavigate} {...data} />;
  }
}

function TabBar({
  activeTab,
  onChange,
  hidden = false,
}: {
  activeTab: AppTab;
  onChange: (tab: AppTab) => void;
  hidden?: boolean;
}) {
  const styles = useThemedStyles(createStyles, iosStyles.shell);
  return (
    <View nativeID="app-tab-bar" style={styles.tabBar} accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}>
      {tabs.map((tab) => (
        <TabBarItem
          active={(activeTab === 'vip' ? 'profile' : activeTab) === tab.id}
          key={tab.id}
          onPress={() => onChange(tab.id)}
          tab={tab}
        />
      ))}
    </View>
  );
}

function TabBarItem({
  active,
  onPress,
  tab,
}: {
  active: boolean;
  onPress: () => void;
  tab: (typeof tabs)[number];
}) {
  const { animationScale, reduceMotion } = useTheme();
  const styles = useThemedStyles(createStyles, iosStyles.shell);
  const iconScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if(reduceMotion){iconScale.setValue(1);return;}
    const animation = Animated.timing(iconScale, {
      duration: Math.max(1, Math.round(androidMotion.pressOutMs * animationScale)),
      easing: Easing.out(Easing.cubic),
      toValue: active ? 1.06 : 1,
      useNativeDriver: true,
      isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [active, animationScale, iconScale, reduceMotion]);

  return (
    <AnimatedPressable
      accessibilityLabel={`${tab.label}导航`}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.tab, active && tab.id !== "ai" && styles.activeTab]}
    >
      <Animated.View style={{ transform: [{ scale: iconScale }] }}>{tab.id === "ai" ?
        <View style={{width:34,height:34,borderRadius:10,backgroundColor:"#2962F4",alignItems:"center",justifyContent:"center"}}><AiIcon name="sparkle" color="#FFF" size={23}/></View> :
        <AppIcon name={tab.symbol} selected={active} size={23} style={[styles.tabIcon, active && styles.activeTabIcon]} />}</Animated.View>
      <Text style={[styles.tabLabel, active && styles.activeTabLabel]}>
        {tab.label}
      </Text>
    </AnimatedPressable>
  );
}

function AiGenerationProgressPill({
  job,
  onPress,
  onClose,
}: {
  job: AiQuestionGenerationJob;
  onPress: () => void;
  onClose: () => void;
}) {
  const styles = useThemedStyles(createStyles, iosStyles.shell);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const complete = job.status === 'completed';
  const failed = job.status === 'failed';
  const expandedWidth = Math.min(328, screenWidth - 24);
  const collapsedWidth = 54;
  const maxX = Math.max(8, screenWidth - expandedWidth - 8);
  const maxY = Math.max(56, screenHeight - 200);
  const [position, setPosition] = useState(() => ({
    x: maxX,
    y: Math.max(72, Math.min(Math.round(screenHeight * 0.34), maxY)),
  }));
  const motionPosition = useRef(new Animated.ValueXY(position)).current;
  const positionRef = useRef(position);
  const dragOrigin = useRef(position);
  const [collapsed, setCollapsed] = useState(false);
  const [edge, setEdge] = useState<'left' | 'right'>('right');
  const progress = Math.max(
    0,
    Math.min(100, Math.round(((job.progress.completed ?? 0) / 10) * 100)),
  );
  useEffect(() => {
    positionRef.current = position;
    motionPosition.setValue(position);
  }, [motionPosition, position]);

  useEffect(() => {
    setPosition((current) => ({
      x: Math.max(8, Math.min(current.x, maxX)),
      y: Math.max(56, Math.min(current.y, maxY)),
    }));
  }, [maxX, maxY]);

  const dragResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      dragOrigin.current = positionRef.current;
    },
    onPanResponderMove: (_event, gesture) => {
      const next = {
        x: Math.max(8, Math.min(dragOrigin.current.x + gesture.dx, maxX)),
        y: Math.max(56, Math.min(dragOrigin.current.y + gesture.dy, maxY)),
      };
      positionRef.current = next;
      // Move the native-backed view, not the React subtree, for every gesture sample.
      motionPosition.setValue(next);
    },
    onPanResponderRelease: (_event, gesture) => {
      const next = {
        x: Math.max(8, Math.min(dragOrigin.current.x + gesture.dx, maxX)),
        y: Math.max(56, Math.min(dragOrigin.current.y + gesture.dy, maxY)),
      };
      positionRef.current = next;
      setPosition(next);
      setEdge(next.x + expandedWidth / 2 < screenWidth / 2 ? 'left' : 'right');
    },
    onPanResponderTerminate: () => setPosition(positionRef.current),
  }), [expandedWidth, maxX, maxY, motionPosition, screenWidth]);

  function collapseToEdge() {
    const nextEdge = position.x + expandedWidth / 2 < screenWidth / 2 ? 'left' : 'right';
    setEdge(nextEdge);
    setCollapsed(true);
  }

  function expandFromEdge() {
    setPosition((current) => ({
      ...current,
      x: edge === 'left' ? 8 : maxX,
    }));
    setCollapsed(false);
  }

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.aiProgressPosition,
        {
          left: collapsed ? (edge === 'left' ? 0 : screenWidth - collapsedWidth) : 0,
          top: 0,
          transform: [{ translateX: collapsed ? 0 : motionPosition.x }, { translateY: motionPosition.y }],
          width: collapsed ? collapsedWidth : expandedWidth,
        },
      ]}
    >
      {collapsed ? (
        <View style={styles.aiProgressCollapsedWrap}>
          <AnimatedPressable
            accessibilityLabel="展开 AI 出题进度窗"
            accessibilityRole="button"
            onPress={expandFromEdge}
            style={styles.aiProgressCollapsed}
          >
            <AppIcon style={styles.aiProgressMarkText}>✦</AppIcon>
            <Text style={styles.aiProgressCollapsedCount}>
              {complete ? '✓' : failed ? '!' : `${job.progress.completed ?? 0}/10`}
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            accessibilityLabel="关闭 AI 出题进度窗"
            accessibilityRole="button"
            onPress={onClose}
            style={styles.aiProgressCollapsedClose}
          >
            <AppIcon style={styles.aiProgressCollapsedCloseText}>×</AppIcon>
          </AnimatedPressable>
        </View>
      ) : (
        <View style={styles.aiProgressCard}>
          <View style={styles.aiProgressTools}>
            <View {...dragResponder.panHandlers} style={styles.aiProgressDragHandle}>
              <Text style={styles.aiProgressDragText}>⠿ 拖动窗口</Text>
            </View>
            <AnimatedPressable
              accessibilityLabel="把进度窗收至屏幕边缘"
              onPress={collapseToEdge}
              style={styles.aiProgressCollapseButton}
            >
              <Text style={styles.aiProgressCollapseText}>收至边缘</Text>
            </AnimatedPressable>
            <AnimatedPressable
              accessibilityLabel="关闭 AI 出题进度窗"
              accessibilityRole="button"
              onPress={onClose}
              style={styles.aiProgressCloseButton}
            >
              <AppIcon style={styles.aiProgressCloseText}>×</AppIcon>
            </AnimatedPressable>
          </View>
          <AnimatedPressable
            accessibilityLabel={complete ? '查看已生成的 AI 题组' : '查看 AI 出题进度'}
            accessibilityRole="button"
            onPress={onPress}
            style={styles.aiProgressCardBody}
          >
            <View style={styles.aiProgressMark}><AppIcon style={styles.aiProgressMarkText}>✦</AppIcon></View>
            <View style={styles.aiProgressCopy}>
              <View style={styles.aiProgressHeading}>
                <Text style={styles.aiProgressTitle}>
                  {complete ? '10 道新题已备好' : failed ? 'AI 出题遇到问题' : 'AI 正在后台出题'}
                </Text>
                <Text style={styles.aiProgressCount}>
                  {complete ? '完成' : failed ? '查看' : `${job.progress.completed ?? 0}/10`}
                </Text>
              </View>
              <Text numberOfLines={1} style={styles.aiProgressMessage}>
                {complete ? '点击打开题组，可上传或开始刷题' : job.progress.message}
              </Text>
              {!complete && !failed && (
                <View style={styles.aiProgressTrack}>
                  <View style={[styles.aiProgressFill, { width: `${progress}%` }]} />
                </View>
              )}
            </View>
            <AppIcon style={styles.aiProgressArrow}>›</AppIcon>
          </AnimatedPressable>
        </View>
      )}
    </Animated.View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safeArea: {
      backgroundColor: colors.background,
      flex: 1,
    },
    screen: {
      flex: 1,
      minHeight: 0,
      minWidth: 0,
    },
    content: {
      flex: 1,
      minHeight: 0,
      minWidth: 0,
    },
    aiProgressPosition: {
      position: 'absolute',
      zIndex: 20,
    },
    aiProgressCard: {
      backgroundColor: colors.surface,
      borderColor: colors.brandSoft,
      borderRadius: radius.lg,
      borderWidth: 1,
      overflow: 'hidden',
      ...shadow.card,
    },
    aiProgressTools: {
      alignItems: 'center',
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 30,
      paddingHorizontal: spacing.sm,
    },
    aiProgressDragHandle: {
      alignItems: 'center',
      flex: 1,
      flexDirection: 'row',
      minHeight: 32,
      paddingRight: spacing.sm,
    },
    aiProgressDragText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
    aiProgressCollapseButton: { minHeight: 30, justifyContent: 'center', paddingHorizontal: spacing.xs },
    aiProgressCollapseText: { color: colors.brand, fontSize: 11, fontWeight: '800' },
    aiProgressCloseButton: { alignItems: 'center', height: 30, justifyContent: 'center', marginLeft: 2, width: 25 },
    aiProgressCloseText: { color: colors.textMuted, fontSize: 21, fontWeight: '700', lineHeight: 23 },
    aiProgressCardBody: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
      minHeight: 68,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    aiProgressCollapsed: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.brandSoft,
      borderRadius: radius.lg,
      borderWidth: 1,
      gap: 4,
      justifyContent: 'center',
      minHeight: 76,
      paddingHorizontal: 4,
      ...shadow.card,
    },
    aiProgressCollapsedWrap: { position: 'relative' },
    aiProgressCollapsedClose: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radius.pill,
      borderWidth: 1,
      height: 22,
      justifyContent: 'center',
      position: 'absolute',
      right: -2,
      top: -7,
      width: 22,
      zIndex: 2,
    },
    aiProgressCollapsedCloseText: { color: colors.textMuted, fontSize: 17, fontWeight: '700', lineHeight: 19 },
    aiProgressCollapsedCount: { color: colors.brand, fontSize: 10, fontWeight: '900' },
    aiProgressMark: {
      alignItems: 'center',
      backgroundColor: colors.brandSoft,
      borderRadius: radius.md,
      height: 38,
      justifyContent: 'center',
      width: 38,
    },
    aiProgressMarkText: { color: colors.brand, fontSize: 18, fontWeight: '800' },
    aiProgressCopy: { flex: 1, gap: 3 },
    aiProgressHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    aiProgressTitle: { color: colors.text, flex: 1, fontSize: 13, fontWeight: '800' },
    aiProgressCount: { color: colors.brand, fontSize: 12, fontWeight: '800' },
    aiProgressMessage: { color: colors.textMuted, fontSize: 11 },
    aiProgressTrack: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radius.pill,
      height: 4,
      marginTop: 3,
      overflow: 'hidden',
    },
    aiProgressFill: { backgroundColor: colors.brand, borderRadius: radius.pill, height: '100%' },
    aiProgressArrow: { color: colors.brand, fontSize: 24, fontWeight: '700' },
    hiddenScreen: { display: 'none' },
    sessionPlaceholder: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 24, paddingTop: 24, gap: 26 },
    updateScreen: {
      alignItems: 'center',
      backgroundColor: colors.background,
      flex: 1,
      justifyContent: 'center',
      padding: spacing.lg,
    },
    updateLoadingText: {
      color: colors.textMuted,
      fontSize: 14,
      marginTop: spacing.md,
    },
    updateCard: {
      backgroundColor: colors.surface,
      borderRadius: 24,
      gap: spacing.md,
      padding: spacing.xl,
      width: '100%',
      ...shadow.card,
    },
    updateKicker: {
      color: colors.brand,
      fontSize: 13,
      fontWeight: '800',
    },
    updateTitle: {
      color: colors.text,
      fontSize: 28,
      fontWeight: '800',
    },
    updateText: {
      color: colors.textMuted,
      fontSize: 15,
      lineHeight: 23,
    },
    updateVersionRow: {
      alignItems: 'center',
      backgroundColor: colors.surfaceMuted,
      borderRadius: spacing.sm,
      flexDirection: 'row',
      gap: spacing.sm,
      padding: spacing.md,
    },
    updateVersionLabel: {
      color: colors.textMuted,
      flex: 1,
      fontSize: 13,
    },
    updateVersionValue: {
      color: colors.brandDark,
      fontSize: 14,
      fontWeight: '800',
    },
    updateVersionArrow: {
      color: colors.brand,
      fontSize: 18,
      fontWeight: '800',
    },
    updateNotes: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 20,
    },
    updateButton: {
      alignItems: 'center',
      backgroundColor: colors.brand,
      borderRadius: radius.md,
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 54,
      paddingHorizontal: spacing.md,
    },
    updateButtonDisabled: {
      opacity: 0.72,
    },
    updateButtonText: {
      color: colors.white,
      fontSize: 16,
      fontWeight: '800',
    },
    updateButtonProgress: {
      color: colors.white,
      fontSize: 13,
      fontWeight: '800',
    },
    updateButtonArrow: {
      color: colors.white,
      fontSize: 22,
      fontWeight: '800',
    },
    updateBrowserButton: {
      alignItems: 'center',
      borderColor: colors.brand,
      borderRadius: radius.md,
      borderWidth: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 50,
      paddingHorizontal: spacing.md,
    },
    updateBrowserButtonText: {
      color: colors.brand,
      fontSize: 15,
      fontWeight: '800',
    },
    updateBrowserButtonArrow: {
      color: colors.brand,
      fontSize: 20,
      fontWeight: '800',
    },
    updateError: {
      color: colors.warning,
      fontSize: 13,
      lineHeight: 19,
    },
    updateRetryButton: {
      alignItems: 'center',
      minHeight: 40,
      justifyContent: 'center',
    },
    updateRetryText: {
      color: colors.brand,
      fontSize: 13,
      fontWeight: '800',
    },
    tabBar: {
      backgroundColor: colors.surface,
      flexShrink: 0,
      borderTopColor: colors.border,
      borderTopWidth: 1,
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingBottom: spacing.xs,
      paddingTop: spacing.xs,
    },
    tab: {
      alignItems: 'center',
      flex: 1,
      minWidth: 0,
      gap: 2,
      minHeight: 60,
      marginHorizontal: 3,
      justifyContent: 'center',
    },
    activeTab: { backgroundColor: colors.brandSoft, borderRadius: 18 },
    tabIcon: {
      color: colors.textFaint,
      fontSize: 22,
      fontWeight: '700',
      height: 25,
      lineHeight: 25,
    },
    activeTabIcon: {
      color: colors.brand,
    },
    tabLabel: {
      color: colors.textFaint,
      fontSize: 12,
      fontWeight: '600',
    },
    activeTabLabel: {
      color: colors.brand,
      fontWeight: '800',
    },
  });
