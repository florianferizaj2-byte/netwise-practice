import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  ActivityIndicator,
  Linking,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { mobileApi, type AppVersionResponse, type AuthResponse, type DashboardResponse } from '../api/client';
import { AnimatedPressable, EntranceView } from '../components/Motion';
import { BrandMark } from '../components/BrandMark';
import { AuthScreen } from '../screens/AuthScreen';
import { CertificateScreen } from '../screens/CertificateScreen';
import { CommunityScreen } from '../screens/CommunityScreen';
import {
  ExamScreen,
  PracticeScreen,
  ProfileScreen,
  TodayScreen,
  WrongScreen,
} from '../screens/TabScreens';
import {
  radius,
  shadow,
  spacing,
  useThemedStyles,
  useTheme,
  type ThemeColors,
} from '../theme';
import { APP_VERSION } from '../version';
import { downloadAndInstallUpdate } from '../update';
import type {
  AppTab,
  NavigationOptions,
  PracticeMode,
  PracticeSession,
  PracticeSource,
} from '../types';

const tabs: Array<{ id: AppTab; label: string; icon: string }> = [
  { id: 'today', label: '今日', icon: '⌂' },
  { id: 'practice', label: '练习', icon: '✦' },
  { id: 'wrong', label: '错题', icon: '×' },
  { id: 'exam', label: '考试', icon: '□' },
  { id: 'community', label: '社区', icon: '◉' },
  { id: 'profile', label: '我的', icon: '◎' },
];

export function AppShell() {
  const { animationScale, resolvedMode } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [isPreview, setIsPreview] = useState(false);
  const [session, setSession] = useState<AuthResponse | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('today');
  const [practiceMode, setPracticeMode] = useState<PracticeMode>('sequential');
  const [practiceSession, setPracticeSession] = useState<PracticeSession>('standard');
  const [practiceSource, setPracticeSource] = useState<PracticeSource>('all');
  const [certificatePickerOpen, setCertificatePickerOpen] = useState(false);
  const [versionChecked, setVersionChecked] = useState(false);
  const [updateRelease, setUpdateRelease] = useState<AppVersionResponse | null>(null);
  const [versionCheckKey, setVersionCheckKey] = useState(0);
  const screenOpacity = useRef(new Animated.Value(1)).current;
  const screenOffset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    setVersionChecked(false);
    void mobileApi
      .appVersion(APP_VERSION)
      .then((release) => {
        if (!mounted) return;
        setUpdateRelease(release.forceUpdate ? release : null);
      })
      .catch(() => {
        // A temporary network failure should not brick the app; normal API requests
        // will still report their own connection state after the check completes.
        if (mounted) setUpdateRelease(null);
      })
      .finally(() => {
        if (mounted) setVersionChecked(true);
      });

    return () => {
      mounted = false;
    };
  }, [versionCheckKey]);

  useEffect(() => {
    if (!isPreview && !session) return;

    screenOpacity.setValue(0);
    screenOffset.setValue(12);
    const animation = Animated.parallel([
      Animated.timing(screenOpacity, {
        duration: Math.max(1, Math.round(260 * animationScale)),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.spring(screenOffset, {
        friction: Math.max(4, Math.round(8 * animationScale)),
        tension: Math.round(95 / animationScale),
        toValue: 0,
        useNativeDriver: true,
      }),
    ]);

    animation.start();
    return () => animation.stop();
  }, [activeTab, animationScale, isPreview, screenOffset, screenOpacity, session]);

  useEffect(() => {
    if (!session?.user.certificateId) return;

    let mounted = true;
    mobileApi
      .dashboard()
      .then((result) => {
        if (mounted) setDashboard(result);
      })
      .catch(() => {
        if (mounted) setDashboard(null);
      });

    return () => {
      mounted = false;
    };
  }, [session?.user.certificateId]);

  function handleAuthenticated(response: AuthResponse) {
    setSession(response);
    setIsPreview(false);
    setCertificatePickerOpen(false);
    setDashboard(null);
    setPracticeSession('standard');
    setPracticeMode('sequential');
    setPracticeSource('all');
    setActiveTab('today');
  }

  function handleCertificateSelected(user: AuthResponse['user']) {
    setSession((current) => (current ? { ...current, user } : current));
    setCertificatePickerOpen(false);
    setActiveTab('today');
  }

  function handleUserUpdated(user: AuthResponse['user']) {
    setSession((current) => (current ? { ...current, user } : current));
  }

  function handleLogout() {
    if (session) void mobileApi.logout().catch(() => undefined);
    setSession(null);
    setDashboard(null);
    setIsPreview(false);
    setCertificatePickerOpen(false);
    setPracticeSession('standard');
    setPracticeMode('sequential');
    setPracticeSource('all');
  }

  function handleOpenCertificatePicker() {
    if (session?.certificates.length) setCertificatePickerOpen(true);
  }

  function handleNavigate(tab: AppTab, options?: NavigationOptions) {
    if (tab === 'practice') {
      const nextSession = options?.practiceSession ?? 'standard';
      setPracticeSession(nextSession);
      setPracticeSource(options?.practiceSource ?? 'all');
      setPracticeMode(
        options?.practiceMode ?? (nextSession === 'daily' ? 'random' : 'sequential'),
      );
    }
    setActiveTab(tab);
  }

  function retryVersionCheck() {
    setUpdateRelease(null);
    setVersionChecked(false);
    setVersionCheckKey((current) => current + 1);
  }

  if (!versionChecked) {
    return <VersionCheckingScreen />;
  }

  if (updateRelease) {
    return <UpdateRequiredScreen release={updateRelease} onRetry={retryVersionCheck} />;
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

  if (session && certificatePickerOpen) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style={resolvedMode === 'dark' ? 'light' : 'dark'} />
        <CertificateScreen
          certificates={session.certificates}
          currentCertificateId={session.user.certificateId}
          onCancel={() => setCertificatePickerOpen(false)}
          onSelected={handleCertificateSelected}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style={resolvedMode === 'dark' ? 'light' : 'dark'} />
      <View style={styles.screen}>
        <Animated.View
          style={[
            styles.content,
            {
              opacity: screenOpacity,
              transform: [{ translateY: screenOffset }],
            },
          ]}
        >
          {renderScreen(activeTab, handleNavigate, {
            dashboard,
            onLogout: handleLogout,
            preview: isPreview,
            practiceMode,
            practiceSession,
            practiceSource,
            onPracticeModeChange: setPracticeMode,
            onOpenCertificatePicker: handleOpenCertificatePicker,
            onUserUpdated: handleUserUpdated,
            user: session?.user,
            certificates: session?.certificates ?? [],
          })}
        </Animated.View>
        <TabBar activeTab={activeTab} onChange={handleNavigate} />
      </View>
    </SafeAreaView>
  );
}

function VersionCheckingScreen() {
  const { colors, resolvedMode } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style={resolvedMode === 'dark' ? 'light' : 'dark'} />
      <View style={styles.updateScreen}>
        <ActivityIndicator color={colors.brand} size="large" />
        <Text style={styles.updateLoadingText}>正在检查 App 版本…</Text>
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
  const styles = useThemedStyles(createStyles);
  const downloadUrl = mobileApi.resolveDownloadUrl(release.downloadUrl);
  const [downloadState, setDownloadState] = useState<
    'idle' | 'downloading' | 'installing' | 'error'
  >('idle');
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState('');

  async function handleInAppUpdate() {
    if (downloadState === 'downloading' || downloadState === 'installing') return;

    setDownloadState('downloading');
    setDownloadProgress(0);
    setDownloadError('');
    try {
      await downloadAndInstallUpdate(
        downloadUrl,
        release.latestVersion,
        setDownloadProgress,
        () => setDownloadState('installing'),
      );
      setDownloadState('idle');
      setDownloadProgress(null);
    } catch (error) {
      setDownloadState('error');
      setDownloadError(
        error instanceof Error ? error.message : '应用内更新失败，请改用浏览器下载。',
      );
    }
  }

  const inAppButtonLabel =
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
            当前 App 版本已停止服务。你可以直接在 App 内下载并安装，也可以改用浏览器下载新版。
          </Text>
          <View style={styles.updateVersionRow}>
            <Text style={styles.updateVersionLabel}>当前版本</Text>
            <Text style={styles.updateVersionValue}>v{release.currentVersion}</Text>
            <Text style={styles.updateVersionArrow}>→</Text>
            <Text style={styles.updateVersionValue}>v{release.latestVersion}</Text>
          </View>
          {!!release.releaseNotes && (
            <Text style={styles.updateNotes}>本次更新：{release.releaseNotes}</Text>
          )}
          <AnimatedPressable
            accessibilityLabel="在应用内下载并安装最新版 App"
            accessibilityRole="button"
            disabled={downloadState === 'downloading' || downloadState === 'installing'}
            onPress={() => void handleInAppUpdate()}
            style={[
              styles.updateButton,
              (downloadState === 'downloading' || downloadState === 'installing') &&
                styles.updateButtonDisabled,
            ]}
          >
            {downloadState === 'downloading' && (
              <ActivityIndicator color={styles.updateButtonText.color} size="small" />
            )}
            <Text style={styles.updateButtonText}>{inAppButtonLabel}</Text>
            {downloadState === 'downloading' && downloadProgress !== null && (
              <Text style={styles.updateButtonProgress}>{downloadProgress}%</Text>
            )}
          </AnimatedPressable>
          {downloadError && <Text style={styles.updateError}>{downloadError}</Text>}
          <AnimatedPressable
            accessibilityLabel="改用浏览器下载最新版 App"
            accessibilityRole="button"
            onPress={() => void Linking.openURL(downloadUrl).catch(() => undefined)}
            style={styles.updateBrowserButton}
          >
            <Text style={styles.updateBrowserButtonText}>改用浏览器下载新版</Text>
            <Text style={styles.updateBrowserButtonArrow}>→</Text>
          </AnimatedPressable>
          <AnimatedPressable
            accessibilityLabel="重新检查版本"
            accessibilityRole="button"
            onPress={onRetry}
            style={styles.updateRetryButton}
          >
            <Text style={styles.updateRetryText}>已安装，重新检查</Text>
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
    practiceSession: PracticeSession;
    practiceSource: PracticeSource;
    onPracticeModeChange: (mode: PracticeMode) => void;
    onOpenCertificatePicker: () => void;
    onUserUpdated: (user: AuthResponse['user']) => void;
    user: AuthResponse['user'] | undefined;
    certificates: AuthResponse['certificates'];
  },
) {
  switch (activeTab) {
    case 'practice':
      return <PracticeScreen onNavigate={onNavigate} {...data} />;
    case 'wrong':
      return <WrongScreen onNavigate={onNavigate} {...data} />;
    case 'exam':
      return <ExamScreen onNavigate={onNavigate} {...data} />;
    case 'community':
      return <CommunityScreen {...data} />;
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
}: {
  activeTab: AppTab;
  onChange: (tab: AppTab) => void;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.tabBar}>
      {tabs.map((tab) => (
        <TabBarItem
          active={activeTab === tab.id}
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
  const { animationScale } = useTheme();
  const styles = useThemedStyles(createStyles);
  const iconScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(iconScale, {
      friction: Math.max(4, Math.round(5 * animationScale)),
      tension: Math.round(240 / animationScale),
      toValue: active ? 1.16 : 1,
      useNativeDriver: true,
    }).start();
  }, [active, animationScale, iconScale]);

  return (
    <AnimatedPressable
      accessibilityLabel={`${tab.label}导航`}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.tab}
    >
      <Animated.Text
        style={[
          styles.tabIcon,
          active && styles.activeTabIcon,
          { transform: [{ scale: iconScale }] },
        ]}
      >
        {tab.icon}
      </Animated.Text>
      <Text style={[styles.tabLabel, active && styles.activeTabLabel]}>
        {tab.label}
      </Text>
    </AnimatedPressable>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  screen: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
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
    gap: 2,
    minHeight: 52,
    justifyContent: 'center',
  },
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
