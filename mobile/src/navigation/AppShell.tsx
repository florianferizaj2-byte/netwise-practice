import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { mobileApi, type AuthResponse, type DashboardResponse } from '../api/client';
import { AnimatedPressable } from '../components/Motion';
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
import { colors, spacing } from '../theme';
import type {
  AppTab,
  NavigationOptions,
  PracticeMode,
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
  const [isPreview, setIsPreview] = useState(false);
  const [session, setSession] = useState<AuthResponse | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('today');
  const [practiceMode, setPracticeMode] = useState<PracticeMode>('sequential');
  const [practiceSource, setPracticeSource] = useState<PracticeSource>('all');
  const [certificatePickerOpen, setCertificatePickerOpen] = useState(false);
  const screenOpacity = useRef(new Animated.Value(1)).current;
  const screenOffset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isPreview && !session) return;

    screenOpacity.setValue(0);
    screenOffset.setValue(12);
    const animation = Animated.parallel([
      Animated.timing(screenOpacity, {
        duration: 260,
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.spring(screenOffset, {
        friction: 8,
        tension: 95,
        toValue: 0,
        useNativeDriver: true,
      }),
    ]);

    animation.start();
    return () => animation.stop();
  }, [activeTab, isPreview, screenOffset, screenOpacity, session]);

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
    setPracticeSource('all');
  }

  function handleOpenCertificatePicker() {
    if (session?.certificates.length) setCertificatePickerOpen(true);
  }

  function handleNavigate(tab: AppTab, options?: NavigationOptions) {
    if (tab === 'practice') {
      setPracticeSource(options?.practiceSource ?? 'all');
      if (options?.practiceMode) setPracticeMode(options.practiceMode);
    }
    setActiveTab(tab);
  }

  if (!isPreview && !session) {
    return (
      <AuthScreen
        onAuthenticated={handleAuthenticated}
        onPreview={() => setIsPreview(true)}
      />
    );
  }

  if (session && !session.user.certificateId) {
    return (
      <CertificateScreen
        certificates={session.certificates}
        onSelected={handleCertificateSelected}
      />
    );
  }

  if (session && certificatePickerOpen) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
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
      <StatusBar style="dark" />
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

function renderScreen(
  activeTab: AppTab,
  onNavigate: (tab: AppTab, options?: NavigationOptions) => void,
  data: {
    dashboard: DashboardResponse | null;
    onLogout: () => void;
    preview: boolean;
    practiceMode: PracticeMode;
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
  const iconScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(iconScale, {
      friction: 5,
      tension: 240,
      toValue: active ? 1.16 : 1,
      useNativeDriver: true,
    }).start();
  }, [active, iconScale]);

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

const styles = StyleSheet.create({
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
