import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  FlatList,
  RefreshControl,
  Linking,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  mobileApi,
  type AiAnalysisResponse,
  type AiSettingsResponse,
  type AiTeacherAction,
  type AttemptResponse,
  type AuthResponse,
  type DashboardResponse,
  type FeedbackKind,
  type PracticeCatalogResponse,
  type Question,
  type QuestionPage,
} from '../api/client';
import { useCachedQuery } from '../api/useCachedQuery';
import { useScreenActive } from '../navigation/ScreenActivity';
import { useActiveTimer } from '../navigation/useActiveTimer';
import { BrandMark } from '../components/BrandMark';
import { QuestionImages } from '../components/QuestionImages';
import { AiQuestionDraftScreen } from './AiQuestionDraftScreen';
import { CommunityScreen } from './CommunityScreen';
import { previewUiSound } from '../audioFeedback';
import {
  AnimatedPressable,
  AnimatedProgressBar,
  EntranceView,
  FloatingSparkles,
  usePulse,
} from '../components/Motion';
import {
  radius,
  shadow,
  spacing,
  useThemedStyles,
  useTheme,
  type AnimationSpeed,
  type ThemeColors,
  type ThemeMode,
} from '../theme';
import type { UiSoundStyle } from '../audioFeedback';
import type {
  AppTab,
  NavigationOptions,
  PracticeMode,
  PracticeSession,
  PracticeSource,
} from '../types';
import { APP_VERSION } from '../version';

type ScreenProps = {
  dashboard?: DashboardResponse | null;
  onNavigate: (tab: AppTab, options?: NavigationOptions) => void;
  onLogout?: () => void;
  onPracticeModeChange?: (mode: PracticeMode) => void;
  practiceMode?: PracticeMode;
  practiceSession?: PracticeSession;
  practiceSource?: PracticeSource;
  practiceChapter?: string;
  practiceKnowledgeSection?: string;
  practiceKnowledgePoint?: string;
  practiceSelectionComplete?: boolean;
  practiceQuestionId?: string;
  practiceAiGroupId?: string;
  practiceAiLibrary?: boolean;
  aiQuestionGroupId?: string;
  preview?: boolean;
  onOpenCertificatePicker?: () => void;
  onUserUpdated?: (user: AuthResponse['user']) => void;
  user?: AuthResponse['user'];
  certificates?: AuthResponse['certificates'];
};

const previewQuestion: Question = {
  id: 'mobile-preview-question',
  type: 'single_choice',
  question: 'OSPF 接口优先级设置为多少时，该接口不会参与 DR/BDR 选举？',
  options: {
    A: '0',
    B: '1',
    C: '100',
    D: '255',
  },
  chapter: '路由协议',
  knowledgePoint: 'OSPF 选举资格',
};

const reportOptions: Array<{ kind: FeedbackKind; label: string }> = [
  { kind: 'wrong_answer', label: '答案或解析错误' },
  { kind: 'ambiguous', label: '题干或选项表述有问题' },
  { kind: 'duplicate', label: '题目重复' },
  { kind: 'other', label: '其他问题' },
];

const animationOptions: Array<{ id: AnimationSpeed; label: string; hint: string }> = [
  { id: 'slow', label: '舒缓', hint: '更从容的转场与反馈' },
  { id: 'normal', label: '标准', hint: '推荐的平衡体验' },
  { id: 'fast', label: '灵动', hint: '更快进入下一步' },
];

const themeOptions: Array<{ id: ThemeMode; label: string; hint: string }> = [
  { id: 'system', label: '跟随系统', hint: '根据手机系统自动切换' },
  { id: 'light', label: '浅色模式', hint: '保持明亮清爽' },
  { id: 'dark', label: '深色模式', hint: '夜间使用更舒适' },
];

const soundStyleOptions: Array<{ id: UiSoundStyle; label: string; hint: string }> = [
  { id: 'soft', label: '轻柔', hint: '清淡提示' },
  { id: 'crisp', label: '清脆', hint: '明亮短音' },
  { id: 'warm', label: '醇厚', hint: '柔和木音' },
];

const soundVolumeOptions = [
  { label: '轻', value: 0.16 },
  { label: '适中', value: 0.32 },
  { label: '较强', value: 0.55 },
  { label: '最大', value: 0.8 },
];

const DAILY_PRACTICE_COUNT = 30;

function ScreenContainer({ children, compact = false, profile = false, onRefresh, refreshing = false }: { children: ReactNode; compact?: boolean; profile?: boolean; onRefresh?: () => void; refreshing?: boolean }) {
  const styles = useThemedStyles(createStyles);
  return (
    <ScrollView
      contentContainerStyle={[styles.content, compact && styles.compactContent, profile && styles.profileContent]}
      showsVerticalScrollIndicator={false}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

function ScreenHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <EntranceView style={styles.header} distance={8}>
      <View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.screenTitle}>{title}</Text>
      </View>
      <BrandMark compact />
    </EntranceView>
  );
}

function ProgressBar({ value }: { value: number }) {
  const { colors } = useTheme();
  return (
    <AnimatedProgressBar
      color={colors.brand}
      trackColor={colors.brandSoft}
      value={value}
    />
  );
}

function todayLabel(date = new Date()) {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${weekdays[date.getDay()]}，${date.getMonth() + 1}月${date.getDate()}日`;
}

function shuffleQuestions(items: Question[]) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }
  return shuffled;
}

async function loadDailyPracticeQuestions(
  chapter?: string,
  knowledgeSection?: string,
  knowledgePoint?: string,
) {
  const filters = { chapter, knowledgeSection, knowledgePoint };
  const hasSelection = Boolean(chapter || knowledgeSection || knowledgePoint);
  const selectedQuestions = await mobileApi.questions(
    DAILY_PRACTICE_COUNT,
    0,
    true,
    hasSelection ? filters : undefined,
  );
  if (!hasSelection || selectedQuestions.length >= DAILY_PRACTICE_COUNT) {
    return shuffleQuestions(selectedQuestions).slice(0, DAILY_PRACTICE_COUNT);
  }

  const selectedIds = new Set(selectedQuestions.map((question) => question.id));
  const additionalQuestions = await mobileApi.questions(
    DAILY_PRACTICE_COUNT + selectedQuestions.length,
    0,
    true,
  );
  return shuffleQuestions([
    ...selectedQuestions,
    ...additionalQuestions.filter((question) => !selectedIds.has(question.id)).slice(0, DAILY_PRACTICE_COUNT - selectedQuestions.length),
  ]).slice(0, DAILY_PRACTICE_COUNT);
}

function sameAnswers(left: string[], right: string[]) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function PrimaryAction({
  children,
  disabled = false,
  compact = false,
  onPress,
}: {
  children: ReactNode;
  compact?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <AnimatedPressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.primaryAction, compact && styles.compactPrimaryAction, disabled && styles.disabledAction]}
    >
      <Text style={styles.primaryActionText}>{children}</Text>
      <Text style={styles.actionArrow}>›</Text>
    </AnimatedPressable>
  );
}

export function TodayScreen({ dashboard, onNavigate, preview = false }: ScreenProps) {
  const styles = useThemedStyles(createStyles);
  const query = useCachedQuery('/dashboard?summary=1', mobileApi.dashboard, !preview);
  const progressPulse = usePulse({ duration: 2100, maxScale: 1.028 });
  const todayCount = dashboard?.todayCount ?? (preview ? 12 : 0);
  const wrongCount = dashboard?.wrongCount ?? (preview ? 18 : 0);
  const accuracy =
    dashboard?.accuracy == null
      ? preview
        ? '82%'
        : '—'
      : `${Math.round(dashboard.accuracy * 100)}%`;
  const streak = preview
    ? '7 天'
    : `${dashboard?.streakDays ?? 0} 天`;
  const progress = Math.min(100, Math.round((todayCount / DAILY_PRACTICE_COUNT) * 100));

  return (
    <ScreenContainer onRefresh={preview ? undefined : query.refresh} refreshing={query.fetching && !!dashboard}>
      {!!query.error && <Text style={styles.formError}>{dashboard ? '当前显示上次同步的进度。' : ''}{query.error.message}</Text>}
      <ScreenHeader eyebrow={todayLabel()} title="今天学什么？" />

      <EntranceView delay={60} style={styles.todayFocusCard} distance={18}>
        <FloatingSparkles />
        <View style={styles.todayFocusTop}>
          <View style={styles.welcomeCopy}>
            <Text style={styles.welcomeKicker}>今日学习</Text>
            <Text style={styles.welcomeTitle}>
              {todayCount >= DAILY_PRACTICE_COUNT
                ? '今日目标完成'
                : todayCount
                  ? '继续保持节奏'
                  : '从一组练习开始'}
            </Text>
            <Text style={styles.welcomeText}>
              {todayCount >= DAILY_PRACTICE_COUNT
                ? '很棒，明天继续保持。'
                : `还差 ${Math.max(0, DAILY_PRACTICE_COUNT - todayCount)} 道题完成今日目标`}
            </Text>
          </View>
          <Animated.View
            style={[styles.progressCircle, { transform: [{ scale: progressPulse }] }]}
          >
            <Text style={styles.progressNumber}>{progress}%</Text>
            <Text style={styles.progressLabel}>已完成</Text>
          </Animated.View>
        </View>
        <AnimatedPressable
          accessibilityLabel="开始今日学习"
          accessibilityRole="button"
          onPress={() =>
            onNavigate('practice', {
              practiceMode: 'random',
              practiceSession: 'daily',
              practiceSource: 'all',
            })
          }
          style={styles.todayStartButton}
        >
          <Text style={styles.todayStartButtonText}>
            {todayCount ? '继续今日学习' : '开始今日学习'}
          </Text>
          <Text style={styles.todayStartButtonArrow}>→</Text>
        </AnimatedPressable>
      </EntranceView>

      <EntranceView delay={140} distance={10} style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>今日任务</Text>
        <Text style={styles.sectionMeta}>{todayCount} / {DAILY_PRACTICE_COUNT} 题</Text>
      </EntranceView>
      <EntranceView delay={170} distance={6}>
        <ProgressBar value={progress} />
      </EntranceView>

      <View style={styles.statsRow}>
        <EntranceView delay={230} distance={14} style={styles.statSlot}>
          <StatCard value={streak} label="连续学习" tone="green" />
        </EntranceView>
        <EntranceView delay={285} distance={14} style={styles.statSlot}>
          <StatCard value={accuracy} label="近期正确率" tone="gold" />
        </EntranceView>
      </View>

      <EntranceView delay={340} distance={8} style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>继续学习</Text>
      </EntranceView>
      <EntranceView delay={380} distance={12}>
        <AnimatedPressable onPress={() => onNavigate('wrong')} style={styles.secondaryAction}>
          <View>
            <Text style={styles.secondaryActionText}>错题复习</Text>
            <Text style={styles.secondaryActionMeta}>{wrongCount} 道待巩固</Text>
          </View>
          <Text style={styles.actionArrow}>›</Text>
        </AnimatedPressable>
      </EntranceView>
    </ScreenContainer>
  );
}

function StatCard({
  label,
  tone,
  value,
}: {
  label: string;
  tone: 'green' | 'gold';
  value: string;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.statCard}>
      <View style={[styles.statDot, tone === 'gold' && styles.goldDot]} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function PracticePicker({
  onNavigate,
  onPracticeModeChange,
  practiceMode = 'sequential',
  practiceSession = 'standard',
  preview = false,
}: ScreenProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const isDailyPractice = practiceSession === 'daily';
  const query = useCachedQuery('/practice/catalog', mobileApi.practiceCatalog, !preview);
  const [previewCatalog, setCatalog] = useState<PracticeCatalogResponse | null>(null);
  const catalog = preview ? previewCatalog : query.data;
  const loading = !preview && query.loading;
  const error = query.error ? `${catalog ? '当前显示已缓存的题库。' : ''}${query.error.message}` : '';
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(() => new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (preview) {
      setCatalog({
        total: 30,
        attemptedCount: 12,
        favoriteCount: 3,
        chapters: [
          {
            name: '路由协议',
            questionCount: 16,
            attemptedCount: 8,
            progress: 50,
            knowledgePoints: [
              { name: 'OSPF 选举资格', questionCount: 8, attemptedCount: 5, progress: 63 },
              { name: 'OSPF 邻居关系', questionCount: 8, attemptedCount: 3, progress: 38 },
            ],
          },
          {
            name: '网络基础',
            questionCount: 14,
            attemptedCount: 4,
            progress: 29,
            knowledgePoints: [
              { name: '子网划分', questionCount: 7, attemptedCount: 2, progress: 29 },
              { name: '地址与掩码', questionCount: 7, attemptedCount: 2, progress: 29 },
            ],
          },
        ],
      });
      return;
    }
  }, [preview]);

  return (
    <ScreenContainer onRefresh={preview ? undefined : query.refresh} refreshing={query.fetching && !!catalog}>
      <EntranceView delay={50} distance={12} style={styles.pickerSummary}>
        <View>
          <Text style={styles.pickerSummaryTitle}>
            {isDailyPractice ? '随机生成今日题目' : practiceMode === 'ai' ? 'AI 智能出题' : '题库练习'}
          </Text>
          <Text style={styles.pickerSummaryText}>
            {isDailyPractice
              ? `从所选知识随机抽取 ${DAILY_PRACTICE_COUNT} 题，不足时自动补充其他题目`
              : practiceMode === 'ai'
                ? '每组 10 道，经过程序校验和独立 AI 复核'
              : catalog
                ? `${catalog.total} 道题 · 已刷 ${catalog.attemptedCount} 道`
                : '正在同步你的题库'}
          </Text>
        </View>
        <Text style={styles.pickerSummaryMark}>✦</Text>
      </EntranceView>

      {!isDailyPractice && (
        <EntranceView delay={90} distance={8} style={styles.modeSwitch}>
          <AnimatedPressable
            accessibilityLabel="顺序刷题"
            onPress={() => onPracticeModeChange?.('sequential')}
            style={[styles.modeButton, practiceMode === 'sequential' && styles.activeModeButton]}
          >
            <Text style={[styles.modeButtonText, practiceMode === 'sequential' && styles.activeModeButtonText]}>
              顺序刷题
            </Text>
            <Text style={styles.modeButtonHint}>按题库顺序</Text>
          </AnimatedPressable>
          <AnimatedPressable
            accessibilityLabel="随机刷题"
            onPress={() => onPracticeModeChange?.('random')}
            style={[styles.modeButton, practiceMode === 'random' && styles.activeModeButton]}
          >
            <Text style={[styles.modeButtonText, practiceMode === 'random' && styles.activeModeButtonText]}>
              随机刷题
            </Text>
            <Text style={styles.modeButtonHint}>打乱所选题库</Text>
          </AnimatedPressable>
          <AnimatedPressable
            accessibilityLabel="AI生成题目"
            onPress={() => onPracticeModeChange?.('ai')}
            style={[styles.modeButton, practiceMode === 'ai' && styles.activeModeButton]}
          >
            <Text style={[styles.modeButtonText, practiceMode === 'ai' && styles.activeModeButtonText]}>AI生成题目</Text>
            <Text style={styles.modeButtonHint}>按知识点出题</Text>
          </AnimatedPressable>
        </EntranceView>
      )}
      {practiceMode === 'ai' && !isDailyPractice && (
        <View style={styles.aiPickerIntro}>
          <View style={styles.aiPickerIntroMark}><Text style={styles.aiPickerIntroGlyph}>✦</Text></View>
          <View style={styles.aiPickerIntroCopy}>
            <Text style={styles.aiPickerIntroTitle}>选择知识点开始出题</Text>
            <Text style={styles.aiPickerHint}>AI 会参考该知识点已有题目，并对新题逐题复核。</Text>
          </View>
        </View>
      )}

      {catalog && !isDailyPractice && (
        <View style={styles.pickerSpecialCards}>
          <EntranceView delay={120} distance={10}>
            <AnimatedPressable
              accessibilityLabel="进入收藏题目"
              disabled={!catalog.favoriteCount}
              onPress={() =>
                onNavigate('practice', {
                  practiceMode,
                  practiceSource: 'favorites',
                })
              }
              style={styles.pickerFavoriteCard}
            >
              <Text style={styles.pickerFavoriteStar}>★</Text>
              <View style={styles.pickerCardCopy}>
                <Text style={styles.pickerFavoriteTitle}>收藏题目</Text>
                <Text style={styles.pickerCardMeta}>{catalog.favoriteCount} 道已收藏题目</Text>
              </View>
              <Text style={styles.actionArrow}>›</Text>
            </AnimatedPressable>
          </EntranceView>
          <EntranceView delay={150} distance={10}>
            <AnimatedPressable
              accessibilityLabel="进入已生成题目"
              onPress={() => onNavigate('practice', {
                practiceMode: 'ai',
                practiceAiLibrary: true,
              })}
              style={[styles.pickerFavoriteCard, styles.pickerGeneratedCard]}
            >
              <Text style={styles.pickerGeneratedIcon}>✦</Text>
              <View style={styles.pickerCardCopy}>
                <Text style={styles.pickerFavoriteTitle}>已生成题目</Text>
                <Text style={styles.pickerCardMeta}>按生成批次分组，可刷题或上传</Text>
              </View>
              <Text style={styles.actionArrow}>›</Text>
            </AnimatedPressable>
          </EntranceView>
        </View>
      )}

      {loading && (
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.brand} size="large" />
          <Text style={styles.loadingText}>正在读取知识点进度…</Text>
        </View>
      )}
      {!!error && <Text style={styles.formError}>{error}</Text>}
      {!loading && catalog && (
        <View style={styles.pickerChapters}>
          {isDailyPractice && (
            <EntranceView delay={120} distance={10}>
              <AnimatedPressable
                accessibilityRole="button"
                onPress={() =>
                  onNavigate('practice', {
                    practiceMode: 'random',
                    practiceSession: 'daily',
                    practiceSource: 'all',
                    practiceSelectionComplete: true,
                  })
                }
                style={styles.pickerDailyAllCard}
              >
                <View style={styles.pickerCardCopy}>
                  <Text style={styles.pickerFavoriteTitle}>全题库随机抽题</Text>
                  <Text style={styles.pickerCardMeta}>从当前证书题库中随机选择 30 题</Text>
                </View>
                <Text style={styles.actionArrow}>›</Text>
              </AnimatedPressable>
            </EntranceView>
          )}
          {catalog.chapters.map((chapter, chapterIndex) => (
            <EntranceView
              delay={isDailyPractice ? 150 + chapterIndex * 35 : 120 + chapterIndex * 35}
              distance={10}
              key={chapter.name}
              style={styles.pickerChapter}
            >
              <View style={styles.pickerChapterHeader}>
                <AnimatedPressable
                  accessibilityLabel={`直接练习大知识点 ${chapter.name}`}
                  accessibilityRole="button"
                  onPress={() => {
                    if (practiceMode === 'ai') {
                      setExpandedChapters((current) => new Set(current).add(chapter.name));
                      return;
                    }
                    onNavigate('practice', {
                      practiceMode: isDailyPractice ? 'random' : practiceMode,
                      practiceSession: isDailyPractice ? 'daily' : 'standard',
                      practiceSource: 'all',
                      practiceChapter: chapter.name,
                      practiceSelectionComplete: isDailyPractice,
                    });
                  }}
                  style={styles.pickerChapterStart}
                >
                  <View style={styles.pickerCardCopy}>
                    <Text style={styles.pickerChapterTitle}>{chapter.name}</Text>
                    <Text style={styles.pickerCardMeta}>
                      {chapter.questionCount} 道题 · 已刷 {chapter.attemptedCount} 道
                    </Text>
                  </View>
                  <Text style={styles.pickerChapterProgress}>{chapter.progress}%</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  accessibilityLabel={`${expandedChapters.has(chapter.name) ? '收起' : '展开'}${chapter.name}知识点`}
                  accessibilityRole="button"
                  onPress={() =>
                    setExpandedChapters((current) => {
                      const next = new Set(current);
                      if (next.has(chapter.name)) next.delete(chapter.name);
                      else next.add(chapter.name);
                      return next;
                    })
                  }
                  style={styles.pickerChapterExpand}
                >
                  <Text style={styles.pickerChapterExpandText}>
                    {expandedChapters.has(chapter.name) ? '收起' : '展开'}
                  </Text>
                  <Text style={styles.pickerChapterExpandIcon}>
                    {expandedChapters.has(chapter.name) ? '⌃' : '⌄'}
                  </Text>
                </AnimatedPressable>
              </View>
              <AnimatedProgressBar
                color={colors.brand}
                trackColor={colors.surfaceMuted}
                value={chapter.progress}
              />
              <Text style={styles.pickerChapterProgressMeta}>
                大知识点总进度 · {chapter.attemptedCount}/{chapter.questionCount} 题
              </Text>
              {expandedChapters.has(chapter.name) && (
                <View style={styles.pickerKnowledgeList}>
                  {chapter.sections?.length
                    ? chapter.sections.map((section) => {
                        const sectionKey = `${chapter.name}/${section.name}`;
                        const isExpanded = expandedSections.has(sectionKey);
                        return (
                          <View key={section.name} style={styles.pickerSectionBlock}>
                            <View style={styles.pickerSectionHeader}>
                              <AnimatedPressable
                                accessibilityLabel={`练习二级分类 ${section.name}`}
                                accessibilityRole="button"
                                onPress={() => {
                                  if (practiceMode === 'ai') {
                                    setExpandedSections((current) => new Set(current).add(sectionKey));
                                    return;
                                  }
                                  onNavigate('practice', {
                                    practiceMode: isDailyPractice ? 'random' : practiceMode,
                                    practiceSession: isDailyPractice ? 'daily' : 'standard',
                                    practiceSource: 'all',
                                    practiceChapter: chapter.name,
                                    practiceKnowledgeSection: section.name,
                                    practiceSelectionComplete: isDailyPractice,
                                  });
                                }}
                                style={styles.pickerSectionStart}
                              >
                                <View style={styles.pickerCardCopy}>
                                  <Text style={styles.pickerKnowledgeName}>{section.name}</Text>
                                  <Text style={styles.pickerCardMeta}>
                                    {section.questionCount} 道题 · 已刷 {section.attemptedCount} 道
                                  </Text>
                                </View>
                                <Text style={styles.pickerChapterProgress}>
                                  {section.progress}%
                                </Text>
                              </AnimatedPressable>
                              <AnimatedPressable
                                accessibilityLabel={`${isExpanded ? '收起' : '展开'}${section.name}考点`}
                                accessibilityRole="button"
                                onPress={() =>
                                  setExpandedSections((current) => {
                                    const next = new Set(current);
                                    if (next.has(sectionKey)) next.delete(sectionKey);
                                    else next.add(sectionKey);
                                    return next;
                                  })
                                }
                                style={styles.pickerSectionExpand}
                              >
                                <Text style={styles.pickerChapterExpandText}>
                                  {isExpanded ? '收起' : '考点'}
                                </Text>
                                <Text style={styles.pickerChapterExpandIcon}>
                                  {isExpanded ? '⌃' : '⌄'}
                                </Text>
                              </AnimatedPressable>
                            </View>
                            <AnimatedProgressBar
                              color={colors.brand}
                              trackColor={colors.surfaceMuted}
                              value={section.progress}
                            />
                            {isExpanded && (
                              <View style={styles.pickerSectionPoints}>
                                {section.knowledgePoints.map((point) => (
                                  <AnimatedPressable
                                    accessibilityLabel={`练习知识点 ${point.name}`}
                                    key={point.name}
                                    onPress={() =>
                                      onNavigate('practice', {
                                        practiceMode: isDailyPractice ? 'random' : practiceMode,
                                        practiceSession: isDailyPractice ? 'daily' : 'standard',
                                        practiceSource: 'all',
                                        practiceChapter: chapter.name,
                                        practiceKnowledgeSection: section.name,
                                        practiceKnowledgePoint: point.name,
                                        practiceSelectionComplete: isDailyPractice,
                                      })
                                    }
                                    style={styles.pickerKnowledgeItem}
                                  >
                                    <View style={styles.pickerKnowledgeTop}>
                                      <Text style={styles.pickerKnowledgeName}>{point.name}</Text>
                                      <Text style={styles.pickerKnowledgeMeta}>
                                        已刷 {point.attemptedCount}/{point.questionCount} 题
                                      </Text>
                                    </View>
                                    <AnimatedProgressBar
                                      color={colors.brand}
                                      trackColor={colors.surfaceMuted}
                                      value={point.progress}
                                    />
                                  </AnimatedPressable>
                                ))}
                              </View>
                            )}
                          </View>
                        );
                      })
                    : chapter.knowledgePoints.map((point) => (
                        <AnimatedPressable
                          accessibilityLabel={`练习知识点 ${point.name}`}
                          key={point.name}
                          onPress={() =>
                            onNavigate('practice', {
                              practiceMode: isDailyPractice ? 'random' : practiceMode,
                              practiceSession: isDailyPractice ? 'daily' : 'standard',
                              practiceSource: 'all',
                              practiceChapter: chapter.name,
                              practiceKnowledgePoint: point.name,
                              practiceSelectionComplete: isDailyPractice,
                            })
                          }
                          style={styles.pickerKnowledgeItem}
                        >
                          <View style={styles.pickerKnowledgeTop}>
                            <Text style={styles.pickerKnowledgeName}>{point.name}</Text>
                            <Text style={styles.pickerKnowledgeMeta}>
                              已刷 {point.attemptedCount}/{point.questionCount} 题
                            </Text>
                          </View>
                          <AnimatedProgressBar
                            color={colors.brand}
                            trackColor={colors.surfaceMuted}
                            value={point.progress}
                          />
                        </AnimatedPressable>
                      ))}
                </View>
              )}
            </EntranceView>
          ))}
        </View>
      )}
      {!loading && catalog && !catalog.chapters.length && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>当前题库还没有知识点</Text>
          <Text style={styles.emptyText}>请先在“我的”里选择并同步证书题库。</Text>
        </View>
      )}
    </ScreenContainer>
  );
}

export function PracticeScreen({
  onNavigate,
  onPracticeModeChange,
  practiceMode = 'sequential',
  practiceSession = 'standard',
  practiceSource = 'all',
  practiceChapter,
  practiceKnowledgeSection,
  practiceKnowledgePoint,
  practiceSelectionComplete = false,
  practiceQuestionId,
  practiceAiGroupId,
  practiceAiLibrary = false,
  aiQuestionGroupId,
  preview = false,
}: ScreenProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const active = useScreenActive();
  const isDailyPractice = practiceSession === 'daily';
  const [questions, setQuestions] = useState<Question[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState('');
  const pageGeneration = useRef(0);
  const pageSeed = useRef('');
  const pageFlight = useRef<Promise<number> | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [responseDraft, setResponseDraft] = useState('');
  const [result, setResult] = useState<AttemptResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [aiBusy, setAiBusy] = useState('');
  const [aiProgress, setAiProgress] = useState('');
  const [aiError, setAiError] = useState<string | null>(null);
  const [hintText, setHintText] = useState('');
  const [teacherText, setTeacherText] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysisResponse | null>(null);
  const [trainingNotice, setTrainingNotice] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportKind, setReportKind] = useState<FeedbackKind>('wrong_answer');
  const [reportNote, setReportNote] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [reportNotice, setReportNotice] = useState('');
  const [wrongDeleteBusy, setWrongDeleteBusy] = useState(false);
  const favoriteRevisionRef = useRef(new Map<string, number>());
  const favoriteDesiredRef = useRef(new Map<string, boolean>());
  const favoriteConfirmedRef = useRef(new Map<string, boolean>());
  const favoriteSaveQueuesRef = useRef(new Map<string, Promise<void>>());
  const needsPracticePicker =
    !preview &&
    practiceSource === 'all' &&
    (isDailyPractice
      ? !practiceSelectionComplete
      : practiceMode === 'ai'
        ? !practiceChapter || !practiceKnowledgePoint
        : !practiceChapter && !practiceKnowledgeSection && !practiceKnowledgePoint);

  useEffect(() => {
    let mounted = true;
    pageGeneration.current += 1;
    pageSeed.current = Math.random().toString(36).slice(2);
    pageFlight.current = null;
    setNextOffset(null);
    setTotalQuestions(0);
    setLoadingMore(false);
    setPageError('');
    setLoading(true);
    setError(null);
    setQuestions([]);
    setQuestionIndex(0);
    setSelected([]);
    setResponseDraft('');
    setResult(null);
    setSubmitting(false);
    setFinished(false);
    setAiBusy('');
    setAiError(null);
    setHintText('');
    setTeacherText('');
    setAiAnalysis(null);
    setTrainingNotice('');
    setReportOpen(false);
    setReportNote('');
    setReportNotice('');
    setWrongDeleteBusy(false);

    if (preview) {
      setQuestions([previewQuestion]);
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    if (needsPracticePicker) {
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    if (practiceMode === 'ai' && !practiceAiGroupId) {
      setLoading(false);
      return () => { mounted = false; };
    }

    const loadQuestions = practiceAiGroupId
      ? mobileApi.aiQuestionGroup(practiceAiGroupId).then((result) => result.questions)
      : isDailyPractice
      ? loadDailyPracticeQuestions(
          practiceChapter,
          practiceKnowledgeSection,
          practiceKnowledgePoint,
        )
      : practiceSource === 'wrong'
        ? mobileApi.wrong()
        : practiceSource === 'favorites'
          ? mobileApi.favorites()
          : mobileApi.questionPage(0, {
              chapter: practiceChapter,
              knowledgeSection: practiceKnowledgeSection,
              knowledgePoint: practiceKnowledgePoint,
            }, practiceMode === 'random' ? pageSeed.current : undefined, reloadKey > 0);

    loadQuestions
      .then((loaded: Question[] | QuestionPage) => {
        if (!mounted) return;
        const items = Array.isArray(loaded) ? loaded : loaded.items;
        setNextOffset(Array.isArray(loaded) ? null : loaded.nextOffset);
        setTotalQuestions(Array.isArray(loaded) ? items.length : loaded.total);
        const nextQuestions = !Array.isArray(loaded) || isDailyPractice
          ? items
          : practiceMode === 'random'
            ? shuffleQuestions(items)
            : items;
        setQuestions(nextQuestions);
        const requestedIndex = practiceQuestionId
          ? nextQuestions.findIndex((question) => question.id === practiceQuestionId)
          : -1;
        setQuestionIndex(requestedIndex >= 0 ? requestedIndex : 0);
      })
      .catch((requestError) => {
        if (!mounted) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : '题目加载失败，请稍后重试',
        );
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
      pageGeneration.current += 1;
    };
  }, [
    isDailyPractice,
    practiceChapter,
    practiceKnowledgeSection,
    practiceKnowledgePoint,
    practiceMode,
    practiceQuestionId,
    practiceAiGroupId,
    practiceSelectionComplete,
    practiceSource,
    preview,
    reloadKey,
  ]);

  const currentQuestion = questions[questionIndex];
  const questionIdRef = useRef(currentQuestion?.id);
  questionIdRef.current = currentQuestion?.id;
  const elapsedTime = useActiveTimer(currentQuestion?.id);

  function questionTask() {
    const generation = pageGeneration.current;
    const questionId = currentQuestion?.id;
    return () => generation === pageGeneration.current && questionId === questionIdRef.current;
  }

  async function loadMoreQuestions() {
    if (pageFlight.current) return pageFlight.current;
    if (nextOffset === null) return 0;
    const generation = pageGeneration.current;
    setLoadingMore(true);
    setPageError('');
    const pending = mobileApi.questionPage(nextOffset, {
      chapter: practiceChapter, knowledgeSection: practiceKnowledgeSection, knowledgePoint: practiceKnowledgePoint,
    }, practiceMode === 'random' ? pageSeed.current : undefined).then((page) => {
      if (generation !== pageGeneration.current) return 0;
      setQuestions((current) => {
        const ids = new Set(current.map((question) => question.id));
        return [...current, ...page.items.filter((question) => !ids.has(question.id))];
      });
      setNextOffset(page.nextOffset);
      setTotalQuestions(page.total);
      return page.items.length;
    }).catch((cause: unknown) => {
      if (generation === pageGeneration.current) setPageError(cause instanceof Error ? cause.message : '后续题目加载失败，请重试');
      return -1;
    }).finally(() => {
      if (generation === pageGeneration.current) { setLoadingMore(false); pageFlight.current = null; }
    });
    pageFlight.current = pending;
    return pending;
  }

  useEffect(() => {
    if (active && !loading && !loadingMore && !pageError && nextOffset !== null && questions.length - questionIndex <= 8) {
      void loadMoreQuestions();
    }
  }, [active, loading, loadingMore, pageError, nextOffset, questionIndex, questions.length]);

  useEffect(() => {
    setAiBusy('');
    setAiProgress('');
    setAiError(null);
    setHintText('');
    setTeacherText('');
    setAiAnalysis(null);
    setTrainingNotice('');
    setReportNotice('');
  }, [currentQuestion?.id]);

  function toggleOption(option: string) {
    if (!currentQuestion || result || submitting) return;
    setError(null);
    if (currentQuestion.type === 'multiple_choice') {
      setSelected((current) =>
        current.includes(option)
          ? current.filter((item) => item !== option)
          : [...current, option].sort(),
      );
    } else {
      setSelected([option]);
    }
  }

  async function submitAnswer() {
    if (!currentQuestion || result || submitting) return;
    if (currentQuestion.type === 'short_answer' && !responseDraft.trim()) {
      setError('请先填写作答内容，再选择自评结果');
      return;
    }
    if (!selected.length) {
      setError(currentQuestion.type === 'short_answer' ? '请选择自评结果' : '先选择一个答案');
      return;
    }
    setError(null);
    setSubmitting(true);
    const timeMs = elapsedTime();

    if (preview) {
      setResult({
        questionId: currentQuestion.id,
        selected,
        correct: sameAnswers(selected, ['A']),
        timeMs,
        answer: ['A'],
        analysis: '接口优先级为 0 表示不参与 DR/BDR 选举。',
      });
      setSubmitting(false);
      return;
    }

    const generation = pageGeneration.current;
    try {
      const response = await mobileApi.recordAttempt(
        currentQuestion.id,
        selected,
        timeMs,
        currentQuestion.type === 'short_answer' ? responseDraft.trim() : undefined,
      );
      if (generation === pageGeneration.current) setResult(response);
    } catch (requestError) {
      if (generation !== pageGeneration.current) return;
      setError(
        requestError instanceof Error
          ? requestError.message
          : '提交失败，请检查网络后重试',
      );
    } finally {
      if (generation === pageGeneration.current) setSubmitting(false);
    }
  }

  async function askAiTeacher(action: AiTeacherAction, hintLevel = 0) {
    if (!currentQuestion || aiBusy) return;
    const current = questionTask();
    setAiError(null);
    setAiBusy(action === '给我提示' ? 'hint' : 'teacher');
    if (preview) {
      const previewText =
        action === '给我提示'
          ? '预览模式只展示页面结构。登录并配置 AI 后，这里会返回不会直接泄露答案的分步提示。'
          : '预览模式只展示页面结构。登录并配置 AI 后，这里会返回针对当前题目的详细讲解。';
      if (action === '给我提示') setHintText(previewText);
      else setTeacherText(previewText);
      setAiBusy('');
      return;
    }
    try {
      const response = await mobileApi.teacher(
        currentQuestion.id,
        action,
        selected,
        hintLevel,
      );
      if (!current()) return;
      if (action === '给我提示') setHintText(response.text);
      else setTeacherText(response.text);
    } catch (requestError) {
      if (!current()) return;
      setAiError(
        requestError instanceof Error
          ? requestError.message
          : 'AI 服务暂时不可用，请稍后重试',
      );
    } finally {
      if (current()) setAiBusy('');
    }
  }

  async function analyzeWithAi() {
    if (!currentQuestion || aiBusy) return;
    const current = questionTask();
    setAiError(null);
    setAiBusy('analysis');
    if (preview) {
      setAiAnalysis({
        mistakeType: '预览示例',
        weakKnowledge: 'OSPF 选举资格',
        reason: '登录并配置 AI 后，服务会结合你的错误选项和历史作答记录分析薄弱点。',
      });
      setAiBusy('');
      return;
    }
    try {
      const analysis = await mobileApi.analyze(currentQuestion.id);
      if (current()) setAiAnalysis(analysis);
    } catch (requestError) {
      if (!current()) return;
      setAiError(
        requestError instanceof Error
          ? requestError.message
          : 'AI 解析暂时不可用，请稍后重试',
      );
    } finally {
      if (current()) setAiBusy('');
    }
  }

  async function generateAiPractice() {
    if (!currentQuestion || aiBusy) return;
    const current = questionTask();
    setAiError(null);
    setAiBusy('train');
    if (preview) {
      setTrainingNotice('登录并配置 AI 后，这里会根据当前知识点生成 3 道变式题。');
      setAiBusy('');
      return;
    }
    try {
      const response = await mobileApi.trainStream(currentQuestion.id, 3, (event) => {
        if (current() && event.stage !== 'heartbeat') setAiProgress(event.message);
      });
      if (!current()) return;
      const existingIds = new Set(questions.map((question) => question.id));
      const freshQuestions = response.questions.filter(
        (question) => !existingIds.has(question.id),
      );
      if (freshQuestions.length) {
        setQuestions((current) => [...current, ...freshQuestions]);
      }
      setTrainingNotice(
        freshQuestions.length
          ? `AI 已准备 ${freshQuestions.length} 道变式题，完成当前题后继续练习。`
          : 'AI 训练题已在当前题组中，可以继续下一题。',
      );
    } catch (requestError) {
      if (!current()) return;
      setAiError(
        requestError instanceof Error
          ? requestError.message
          : 'AI 变式训练暂时不可用，请稍后重试',
      );
    } finally {
      if (current()) { setAiBusy(''); setAiProgress(''); }
    }
  }

  async function submitReport() {
    if (!currentQuestion || reportBusy) return;
    const current = questionTask();
    setReportBusy(true);
    try {
      if (!preview) {
        await mobileApi.feedback(
          currentQuestion.id,
          reportKind,
          reportNote.trim() || undefined,
        );
      }
      if (!current()) return;
      setReportOpen(false);
      setReportNote('');
      setReportNotice(
        preview ? '预览模式不会提交数据，登录后即可举报题目。' : '举报已提交，感谢你帮助我们改进题库。',
      );
    } catch (requestError) {
      if (!current()) return;
      setReportNotice(
        requestError instanceof Error
          ? requestError.message
          : '举报提交失败，请稍后重试',
      );
    } finally {
      if (current()) setReportBusy(false);
    }
  }

  function toggleFavorite() {
    if (!currentQuestion) return;
    const generation = pageGeneration.current;
    const questionId = currentQuestion.id;
    if (!favoriteConfirmedRef.current.has(questionId)) {
      favoriteConfirmedRef.current.set(questionId, Boolean(currentQuestion.favorite));
    }
    const currentDesired = favoriteDesiredRef.current.get(questionId) ?? Boolean(currentQuestion.favorite);
    const nextFavorite = !currentDesired;
    favoriteDesiredRef.current.set(questionId, nextFavorite);
    const revision = (favoriteRevisionRef.current.get(questionId) ?? 0) + 1;
    favoriteRevisionRef.current.set(questionId, revision);
    setError(null);
    setQuestions((current) =>
      current.map((question) =>
        question.id === questionId ? { ...question, favorite: nextFavorite } : question,
      ),
    );
    setReportNotice(preview ? '预览模式下的收藏只在当前页面生效。' : '');
    if (preview) return;

    const previousSave = favoriteSaveQueuesRef.current.get(questionId) ?? Promise.resolve();
    const save = previousSave
      .catch(() => undefined)
      .then(async () => {
        if (generation !== pageGeneration.current) return;
        const saved = await mobileApi.favorite(questionId, nextFavorite);
        if (generation !== pageGeneration.current) return;
        favoriteConfirmedRef.current.set(questionId, saved.favorite);
        if (favoriteRevisionRef.current.get(questionId) === revision) {
          favoriteDesiredRef.current.set(questionId, saved.favorite);
          setQuestions((current) =>
            current.map((question) =>
              question.id === questionId
                ? { ...question, favorite: saved.favorite }
                : question,
            ),
          );
        }
      })
      .catch((requestError) => {
        if (generation !== pageGeneration.current) return;
        if (favoriteRevisionRef.current.get(questionId) !== revision) return;
        const confirmedFavorite = favoriteConfirmedRef.current.get(questionId) ?? false;
        favoriteDesiredRef.current.set(questionId, confirmedFavorite);
        setQuestions((current) =>
          current.map((question) =>
            question.id === questionId
              ? { ...question, favorite: confirmedFavorite }
              : question,
          ),
        );
        setError(
          requestError instanceof Error
            ? requestError.message
            : '收藏状态保存失败，已恢复原状态',
        );
      });
    favoriteSaveQueuesRef.current.set(questionId, save);
    void save.finally(() => {
      if (favoriteSaveQueuesRef.current.get(questionId) === save) favoriteSaveQueuesRef.current.delete(questionId);
    });
  }

  async function removeCurrentWrong() {
    if (
      !currentQuestion ||
      practiceSource !== 'wrong' ||
      !result?.correct ||
      wrongDeleteBusy
    )
      return;
    const current = questionTask();
    setWrongDeleteBusy(true);
    setError(null);
    try {
      if (!preview) await mobileApi.removeWrong(currentQuestion.id);
      if (!current()) return;
      const remaining = questions.filter((question) => question.id !== currentQuestion.id);
      setReportNotice('已从错题中移除。');
      if (!remaining.length) {
        setQuestions([]);
        setFinished(true);
      } else {
        setQuestions(remaining);
        setQuestionIndex((current) => Math.min(current, remaining.length - 1));
        setSelected([]);
        setResponseDraft('');
        setResult(null);
      }
    } catch (requestError) {
      if (!current()) return;
      setError(
        requestError instanceof Error
          ? requestError.message
          : '移除错题失败，请稍后重试',
      );
    } finally {
      if (current()) setWrongDeleteBusy(false);
    }
  }

  async function nextQuestion() {
    const current = questionTask();
    if (questionIndex >= questions.length - 1) {
      if (nextOffset !== null) {
        const count = await loadMoreQuestions();
        if (!current()) return;
        if (count < 0) return;
        if (count > 0) {
          setQuestionIndex((current) => current + 1);
          setSelected([]); setResponseDraft(''); setResult(null); setError(null);
          return;
        }
      }
      setFinished(true);
      return;
    }
    setQuestionIndex((current) => current + 1);
    setSelected([]);
    setResponseDraft('');
    setResult(null);
    setError(null);
  }

  if (practiceAiLibrary && !preview) {
    return <AiQuestionDraftScreen
      libraryMode
      onBack={() => onNavigate('practice', { practiceMode: 'ai' })}
      onNavigate={onNavigate}
    />;
  }

  if (loading) {
    return (
      <ScreenContainer>
        <ScreenHeader eyebrow="开始练习" title="正在准备题目" />
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.brand} size="large" />
          <Text style={styles.loadingText}>正在从考匠题库同步…</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (needsPracticePicker) {
    return (
      <PracticePicker
        onNavigate={onNavigate}
        onPracticeModeChange={onPracticeModeChange}
        practiceMode={practiceMode}
        practiceSession={practiceSession}
        preview={preview}
      />
    );
  }

  if (practiceMode === 'ai' && practiceChapter && practiceKnowledgePoint) {
    return <AiQuestionDraftScreen
      selection={{ chapter: practiceChapter, knowledgeSection: practiceKnowledgeSection, knowledgePoint: practiceKnowledgePoint }}
      initialGroupId={aiQuestionGroupId}
      onBack={() => onNavigate('practice', { practiceMode: 'ai' })}
      onNavigate={onNavigate}
    />;
  }

  if (finished) {
    return (
      <ScreenContainer>
        <ScreenHeader eyebrow="练习完成" title="这一组完成啦" />
        <EntranceView delay={70} distance={18} style={styles.completedCard}>
          <Text style={styles.completedEmoji}>✦</Text>
          <Text style={styles.completedTitle}>很棒，节奏保持住</Text>
          <Text style={styles.completedText}>
            本组练习进度已保存到你的账号，回到首页可以查看最新学习进度。
          </Text>
          <PrimaryAction onPress={() => onNavigate('today')}>查看今日进度</PrimaryAction>
          <PrimaryAction
            onPress={() => {
              setQuestionIndex(0);
              setSelected([]);
              setResponseDraft('');
              setResult(null);
              setFinished(false);
            }}
          >
            再练一组
          </PrimaryAction>
        </EntranceView>
      </ScreenContainer>
    );
  }

  if (!currentQuestion) {
    return (
      <ScreenContainer>
        <ScreenHeader eyebrow="开始练习" title="暂时没有可练题目" />
        <EntranceView delay={70} distance={14} style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>题库还没有返回题目</Text>
          <Text style={styles.emptyText}>
            请确认已经选择证书，或稍后重新同步你的题库。
          </Text>
          <PrimaryAction onPress={() => setReloadKey((current) => current + 1)}>
            重新加载
          </PrimaryAction>
        </EntranceView>
      </ScreenContainer>
    );
  }

  const optionKeys = Object.keys(currentQuestion.options);
  const isMultiple = currentQuestion.type === 'multiple_choice';
  const answerText = result?.answer.join('、') ?? '';
  const sourceLabel = isDailyPractice
    ? '今日练习'
    : practiceSource === 'wrong'
      ? '错题复习'
      : practiceSource === 'favorites'
        ? '收藏题目'
      : '题库练习';
  const modeLabel = practiceMode === 'random' ? '随机刷题' : '顺序刷题';
  const headerParts = [sourceLabel];
  if (!isDailyPractice) headerParts.push(modeLabel);
  if (practiceKnowledgeSection) headerParts.push(practiceKnowledgeSection);
  if (practiceKnowledgePoint) headerParts.push(practiceKnowledgePoint);
  headerParts.push(`${questionIndex + 1}/${Math.max(totalQuestions, questions.length)}`);

  return (
    <ScreenContainer compact>
      <AnimatedPressable accessibilityLabel="返回题库目录" onPress={() => onNavigate('practice', { practiceMode, practiceSession })}>
        <Text style={styles.bodyText}>‹ 返回题库目录</Text>
      </AnimatedPressable>
      {!!pageError && <Text style={styles.formError}>{pageError}，点击下一题可重试。</Text>}
      {loadingMore && <Text style={styles.loadingText}>正在准备后续题目…</Text>}
      <Text style={styles.practiceProgressLabel}>{headerParts.join(' · ')}</Text>
      {!isDailyPractice && <EntranceView delay={20} distance={6} style={styles.modeSwitch}>
        <AnimatedPressable
          accessibilityLabel="顺序刷题"
          disabled={submitting || (loadingMore && questionIndex >= questions.length - 1)}
          onPress={() => onPracticeModeChange?.('sequential')}
          style={[styles.modeButton, practiceMode === 'sequential' && styles.activeModeButton]}
        >
          <Text style={[styles.modeButtonText, practiceMode === 'sequential' && styles.activeModeButtonText]}>
            顺序刷题
          </Text>
          <Text style={styles.modeButtonHint}>按题库顺序</Text>
        </AnimatedPressable>
        <AnimatedPressable
          accessibilityLabel="随机刷题"
          disabled={submitting}
          onPress={() => onPracticeModeChange?.('random')}
          style={[styles.modeButton, practiceMode === 'random' && styles.activeModeButton]}
        >
          <Text style={[styles.modeButtonText, practiceMode === 'random' && styles.activeModeButtonText]}>
            随机刷题
          </Text>
          <Text style={styles.modeButtonHint}>打乱本组题目</Text>
        </AnimatedPressable>
      </EntranceView>}
      <EntranceView delay={50} distance={12} style={styles.questionCard}>
        <View style={styles.questionMetaRow}>
          <Text style={styles.questionType}>{currentQuestion.type === 'short_answer' ? '简答题' : currentQuestion.type === 'true_false' ? '判断题' : isMultiple ? '多选题' : '单选题'}</Text>
          {currentQuestion.knowledgeSection ? (
            <Text style={styles.questionKnowledge}>{currentQuestion.knowledgeSection}</Text>
          ) : null}
          <Text style={styles.questionKnowledge}>
            {currentQuestion.knowledgePoint ?? '综合练习'}
          </Text>
        </View>
        <QuestionImages question={currentQuestion} />
        <Text style={styles.questionText}>{currentQuestion.question}</Text>
        <View style={styles.questionUtilityIcons}>
          <AnimatedPressable
            accessibilityLabel={currentQuestion.favorite ? '取消收藏题目' : '收藏题目'}
            accessibilityRole="button"
            onPress={toggleFavorite}
            style={styles.questionIconButton}
          >
            <Text
              style={[
                styles.questionStarIcon,
                currentQuestion.favorite && styles.questionStarActive,
              ]}
            >
              ★
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            accessibilityLabel="举报题目"
            accessibilityRole="button"
            disabled={reportBusy}
            onPress={() => setReportOpen(true)}
            style={styles.questionIconButton}
          >
            <Text style={styles.questionReportIcon}>⚠︎</Text>
          </AnimatedPressable>
        </View>
      </EntranceView>

      {!result && currentQuestion.type !== 'short_answer' && (
        <View style={styles.questionUtilities}>
          <AnimatedPressable
            accessibilityRole="button"
            disabled={!selected.length || !!aiBusy}
            onPress={() => askAiTeacher('给我提示', 1)}
            style={[styles.utilityButton, styles.aiUtilityButton]}
          >
            <Text style={styles.aiUtilityButtonText}>
              {aiBusy === 'hint' ? 'AI 提示中…' : 'AI 提示'}
            </Text>
          </AnimatedPressable>
        </View>
      )}

      {currentQuestion.type === 'short_answer' ? (
        <View style={styles.shortAnswerCard}>
          <Text style={styles.shortAnswerLabel}>我的作答</Text>
          <TextInput
            editable={!result && !submitting}
            multiline
            onChangeText={(value) => setResponseDraft(value.slice(0, 5000))}
            placeholder="填写配置命令、计算过程或文字答案…"
            placeholderTextColor={colors.textFaint}
            style={styles.shortAnswerInput}
            textAlignVertical="top"
            value={responseDraft}
          />
          {!result && <View style={styles.selfRatingRow}>
            {([['A', '我答对了'], ['B', '需要复习']] as const).map(([value, label]) => (
              <AnimatedPressable
                key={value}
                onPress={() => setSelected([value])}
                style={[styles.selfRatingButton, selected[0] === value && styles.selectedOption]}
              >
                <Text style={styles.selfRatingText}>{label}</Text>
              </AnimatedPressable>
            ))}
          </View>}
        </View>
      ) : <View style={styles.optionsList}>
        {optionKeys.map((option, optionIndex) => {
          const isSelected = selected.includes(option);
          const isCorrect = !!result?.answer.includes(option);
          const isWrong = !!result && isSelected && !isCorrect;
          return (
            <EntranceView delay={90 + optionIndex * 45} distance={10} key={option}>
              <AnimatedPressable
                disabled={!!result || submitting}
                onPress={() => toggleOption(option)}
                style={[
                  styles.questionOption,
                  isSelected && styles.selectedOption,
                  isCorrect && styles.correctOption,
                  isWrong && styles.wrongOption,
                ]}
              >
                <View
                  style={[
                    styles.optionLetter,
                    isSelected && styles.selectedOptionLetter,
                    isCorrect && styles.correctOptionLetter,
                    isWrong && styles.wrongOptionLetter,
                  ]}
                >
                  <Text style={styles.optionLetterText}>{option}</Text>
                </View>
                <Text style={styles.questionOptionText}>{currentQuestion.options[option]}</Text>
                {isCorrect && <Text style={styles.optionStatus}>✓</Text>}
                {isWrong && <Text style={styles.optionStatus}>×</Text>}
              </AnimatedPressable>
            </EntranceView>
          );
        })}
      </View>}

      {error && <Text style={styles.formError}>{error}</Text>}

      {submitting && !result && (
        <View style={styles.feedbackPending}>
          <ActivityIndicator color={colors.brand} size="small" />
          <Text style={styles.feedbackPendingText}>正在快速判分…</Text>
        </View>
      )}

      {result && (
        <EntranceView delay={0} distance={6} style={result.correct ? styles.feedbackGood : styles.feedbackBad}>
          <Text style={styles.feedbackTitle}>{result.correct ? '回答正确！' : '再想一想'}</Text>
          <Text style={styles.feedbackAnswer}>{currentQuestion.type === 'short_answer' ? '参考答案' : `正确答案：${answerText}`}</Text>
          {currentQuestion.type === 'short_answer' && !!result.expectedAnswer && <Text style={styles.feedbackText}>{result.expectedAnswer}</Text>}
          {!!result.analysis && <Text style={styles.feedbackText}>{result.analysis}</Text>}
        </EntranceView>
      )}

      {result && (
        <>
          {practiceSource === 'wrong' && result.correct && (
            <AnimatedPressable
              accessibilityRole="button"
              disabled={wrongDeleteBusy}
              onPress={() => void removeCurrentWrong()}
              style={[styles.removeWrongButton, wrongDeleteBusy && styles.disabledAction]}
            >
              <Text style={styles.removeWrongButtonText}>
                {wrongDeleteBusy ? '移除中…' : '从错题中移除'}
              </Text>
            </AnimatedPressable>
          )}
        </>
      )}

      {result && (
        <View style={styles.aiTools}>
          {result.correct === false && (
            <AnimatedPressable
              accessibilityRole="button"
              disabled={!!aiBusy}
              onPress={analyzeWithAi}
              style={styles.aiToolButton}
            >
              <Text style={styles.aiToolButtonText}>
                {aiBusy === 'analysis' ? 'AI 解析中…' : 'AI 解析错因'}
              </Text>
            </AnimatedPressable>
          )}
          <AnimatedPressable
            accessibilityRole="button"
            disabled={!!aiBusy}
            onPress={() => askAiTeacher('详细讲解')}
            style={styles.aiToolButton}
          >
            <Text style={styles.aiToolButtonText}>
              {aiBusy === 'teacher' ? 'AI 老师思考中…' : 'AI 详细讲解'}
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            accessibilityRole="button"
            disabled={!!aiBusy}
            onPress={generateAiPractice}
            style={styles.aiToolButton}
          >
            <Text style={styles.aiToolButtonText}>
              {aiBusy === 'train' ? (aiProgress || '正在准备生成…') : '生成 3 道变式题'}
            </Text>
          </AnimatedPressable>
        </View>
      )}

      <EntranceView delay={result || submitting ? 0 : 160} distance={8}>
        <PrimaryAction
          compact
          disabled={submitting}
          onPress={result ? nextQuestion : submitAnswer}
        >
          {submitting ? '正在判分…' : result ? '下一题' : currentQuestion.type === 'short_answer' ? '提交自评' : '确认答案'}
        </PrimaryAction>
      </EntranceView>

      {!!hintText && (
        <View style={styles.aiResponseCard}>
          <Text style={styles.aiResponseTitle}>AI 提示</Text>
          <Text style={styles.aiResponseText}>{hintText}</Text>
        </View>
      )}
      {!!aiAnalysis && (
        <View style={styles.aiResponseCard}>
          <Text style={styles.aiResponseTitle}>AI 错因解析</Text>
          <Text style={styles.aiResponseMeta}>薄弱知识：{aiAnalysis.weakKnowledge}</Text>
          <Text style={styles.aiResponseText}>{aiAnalysis.reason}</Text>
        </View>
      )}
      {!!teacherText && (
        <View style={styles.aiResponseCard}>
          <Text style={styles.aiResponseTitle}>AI 老师讲解</Text>
          <Text style={styles.aiResponseText}>{teacherText}</Text>
        </View>
      )}
      {!!trainingNotice && <Text style={styles.trainingNotice}>{trainingNotice}</Text>}
      {!!aiError && <Text style={styles.aiError}>{aiError}</Text>}

      {!!reportNotice && <Text style={styles.reportNotice}>{reportNotice}</Text>}

      <Modal
        animationType="slide"
        onRequestClose={() => {
          if (!reportBusy) setReportOpen(false);
        }}
        transparent
        visible={active && reportOpen}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.reportModal}>
            <Text style={styles.modalTitle}>举报题目</Text>
            <Text style={styles.modalIntro}>
              请选择问题类型，帮助我们更快修正题库。
            </Text>
            <View style={styles.reportOptions}>
              {reportOptions.map((option) => (
                <AnimatedPressable
                  accessibilityRole="button"
                  disabled={reportBusy}
                  key={option.kind}
                  onPress={() => setReportKind(option.kind)}
                  style={[
                    styles.reportOption,
                    reportKind === option.kind && styles.selectedReportOption,
                  ]}
                >
                  <Text
                    style={[
                      styles.reportOptionText,
                      reportKind === option.kind && styles.selectedReportOptionText,
                    ]}
                  >
                    {option.label}
                  </Text>
                  {reportKind === option.kind && <Text style={styles.reportCheck}>✓</Text>}
                </AnimatedPressable>
              ))}
            </View>
            <TextInput
              editable={!reportBusy}
              multiline
              onChangeText={setReportNote}
              placeholder="补充说明（可选）"
              placeholderTextColor={colors.textFaint}
              style={styles.reportInput}
              value={reportNote}
            />
            <View style={styles.modalActions}>
              <AnimatedPressable
                disabled={reportBusy}
                onPress={() => setReportOpen(false)}
                style={styles.modalSecondaryButton}
              >
                <Text style={styles.modalSecondaryText}>取消</Text>
              </AnimatedPressable>
              <AnimatedPressable
                disabled={reportBusy}
                onPress={submitReport}
                style={styles.modalPrimaryButton}
              >
                <Text style={styles.modalPrimaryText}>
                  {reportBusy ? '提交中…' : '提交举报'}
                </Text>
              </AnimatedPressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

export function WrongScreen({ dashboard, onNavigate, preview = false }: ScreenProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const query = useCachedQuery('/wrong', mobileApi.wrong, !preview);
  const wrongQuestions = useMemo(() => preview ? [{ ...previewQuestion, wrongCount: 3 }] : query.data ?? [], [preview, query.data]);
  const loading = !preview && query.loading;
  const loadError = query.error?.message ?? '';
  const [allDistribution, setAllDistribution] = useState(false);
  const wrongCount = query.data || preview ? wrongQuestions.length : dashboard?.wrongCount ?? 0;
  const knowledgeDistribution = useMemo(() => [...wrongQuestions.reduce((counts, question) => {
    const knowledgePoint = question.knowledgePoint || question.chapter || '未分类';
    counts.set(knowledgePoint, (counts.get(knowledgePoint) ?? 0) + 1);
    return counts;
  }, new Map<string, number>()).entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)), [wrongQuestions]);

  return (
    <FlatList
      data={wrongQuestions}
      keyExtractor={(question) => question.id}
      initialNumToRender={12}
      maxToRenderPerBatch={10}
      windowSize={7}
      contentContainerStyle={styles.content}
      onRefresh={preview ? undefined : query.refresh}
      refreshing={query.fetching && !!query.data}
      renderItem={({ item: question }) => (
        <ListRow
          onPress={() => onNavigate('practice', { practiceSource: 'wrong', practiceMode: 'sequential', practiceQuestionId: question.id })}
          title={question.question}
          meta={`${question.knowledgePoint ?? question.chapter ?? '综合练习'} · ${question.wrongCount ?? 1} 次错误`}
        />
      )}
      ListHeaderComponent={<>
      <ScreenHeader eyebrow="错题复习" title="把不会的变成会的" />
      <EntranceView delay={60} distance={16} style={styles.wrongSummary}>
        <View>
          <Text style={styles.wrongCount}>{wrongCount}</Text>
          <Text style={styles.wrongLabel}>待复习错题</Text>
        </View>
        <Text style={styles.wrongEmoji}>↗</Text>
      </EntranceView>
      <EntranceView delay={120} distance={8}>
        <Text style={styles.bodyText}>按照遗忘曲线安排复习，优先处理最需要巩固的题目。</Text>
      </EntranceView>
      {!loading && !!loadError && <Text style={styles.formError}>{wrongQuestions.length ? '当前显示上次同步的错题。' : ''}{loadError}</Text>}
      {!loading && wrongQuestions.length > 0 && (
        <EntranceView delay={145} distance={10} style={styles.wrongDistributionCard}>
          <View style={styles.wrongDistributionHeader}>
            <Text style={styles.wrongDistributionTitle}>错题知识点分布</Text>
            <Text style={styles.wrongDistributionMeta}>{wrongQuestions.length} 道 · {knowledgeDistribution.length} 个知识点</Text>
          </View>
          <View style={styles.wrongDistributionList}>
            {(allDistribution ? knowledgeDistribution : knowledgeDistribution.slice(0, 8)).map((item) => (
              <View key={item.name} style={styles.wrongDistributionItem}>
                <View style={styles.wrongDistributionLabels}>
                  <Text style={styles.wrongDistributionName}>{item.name}</Text>
                  <Text style={styles.wrongDistributionCount}>{item.count} 题</Text>
                </View>
                <AnimatedProgressBar
                  color={colors.warning}
                  trackColor={colors.surfaceMuted}
                  value={wrongQuestions.length ? (item.count / wrongQuestions.length) * 100 : 0}
                />
              </View>
            ))}
            {knowledgeDistribution.length > 8 && <AnimatedPressable onPress={() => setAllDistribution((value) => !value)}>
              <Text style={styles.bodyText}>{allDistribution ? '收起分布' : `展开全部 ${knowledgeDistribution.length} 个知识点`}</Text>
            </AnimatedPressable>}
          </View>
        </EntranceView>
      )}
      <EntranceView delay={170} distance={12}>
        <PrimaryAction
          onPress={() =>
            onNavigate('practice', {
              practiceSource: 'wrong',
              practiceMode: 'sequential',
            })
          }
        >
          开始错题复习
        </PrimaryAction>
      </EntranceView>
      {!!wrongQuestions.length && <Text style={styles.wrongListTitle}>全部错题 · {wrongQuestions.length} 道</Text>}
      </>}
      ListEmptyComponent={loading ? (
          <View style={styles.listLoading}>
            <ActivityIndicator color={colors.brand} />
            <Text style={styles.loadingText}>正在同步错题…</Text>
          </View>
        ) : loadError ? (
          <PrimaryAction onPress={query.refresh}>重新同步</PrimaryAction>
        ) : (
          <Text style={styles.emptyListText}>太好了，当前还没有错题。</Text>
        )}
    />
  );
}

function ListRow({
  meta,
  onPress,
  title,
}: {
  meta: string;
  onPress: () => void;
  title: string;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.listRow}
    >
      <View style={styles.wrongBullet} />
      <View style={styles.listCopy}>
        <Text style={styles.listTitle}>{title}</Text>
        <Text style={styles.listMeta}>{meta}</Text>
      </View>
      <Text style={styles.rowArrow}>›</Text>
    </AnimatedPressable>
  );
}

export function ExamScreen({ onNavigate }: ScreenProps) {
  const styles = useThemedStyles(createStyles);
  return (
    <ScreenContainer>
      <ScreenHeader eyebrow="模拟考试" title="用一次完整考试检验自己" />
      <EntranceView delay={60} distance={18} style={styles.examHero}>
        <FloatingSparkles />
        <Text style={styles.examTag}>考试模式</Text>
        <Text style={styles.examTitle}>HCIA-Datacom 模拟考试</Text>
        <Text style={styles.examText}>按正式考试节奏完成整套题目，提交后查看成绩和薄弱点。</Text>
        <View style={styles.examMetaRow}>
          <Text style={styles.examMeta}>60 道题</Text>
          <Text style={styles.examMeta}>90 分钟</Text>
          <Text style={styles.examMeta}>可自动保存</Text>
        </View>
        <PrimaryAction
          onPress={() =>
            onNavigate('practice', {
              practiceMode: 'sequential',
              practiceSource: 'all',
            })
          }
        >
          创建模拟考试
        </PrimaryAction>
      </EntranceView>
      <EntranceView delay={160} distance={8} style={styles.mutedNotice}>
        <Text style={styles.mutedNoticeText}>考试会话和自动保存将复用现有后端。</Text>
      </EntranceView>
    </ScreenContainer>
  );
}

export function ProfileScreen({
  certificates = [],
  onNavigate,
  onLogout,
  onOpenCertificatePicker,
  onUserUpdated,
  preview = false,
  user,
}: ScreenProps) {
  const active = useScreenActive();
  const {
    animationSpeed,
    colors,
    mode,
    resolvedMode,
    soundEnabled,
    soundStyle,
    soundVolume,
    setAnimationSpeed,
    setMode,
    setSoundEnabled,
    setSoundStyle,
    setSoundVolume,
  } = useTheme();
  const styles = useThemedStyles(createStyles);
  const activeCertificate = certificates.find((certificate) => certificate.id === user?.certificateId);
  const [sponsorOpen, setSponsorOpen] = useState(false);
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [authorApiOpen, setAuthorApiOpen] = useState(false);
  const [communityNameOpen, setCommunityNameOpen] = useState(false);
  const [communityOpen, setCommunityOpen] = useState(false);
  const [communityName, setCommunityName] = useState('');
  const [communityNameBusy, setCommunityNameBusy] = useState(false);
  const [communityNameError, setCommunityNameError] = useState('');
  const [settings, setSettings] = useState<AiSettingsResponse | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsSaveBusy, setSettingsSaveBusy] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState('');
  const [cacheNotice, setCacheNotice] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [authorPassword, setAuthorPassword] = useState('');
  const [aiForm, setAiForm] = useState({
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    temperature: '0.3',
  });

  function openCommunityNameSettings() {
    setCommunityName(user?.communityName || user?.username || '');
    setCommunityNameError('');
    setCommunityNameOpen(true);
  }

  async function saveCommunityName() {
    if (!user || preview) return;
    const name = communityName.trim();
    if (!name) {
      setCommunityNameError('社区昵称不能为空');
      return;
    }
    setCommunityNameBusy(true);
    setCommunityNameError('');
    try {
      const result = await mobileApi.updateCommunityProfile(name);
      onUserUpdated?.(result.user);
      setCommunityNameOpen(false);
    } catch (cause: unknown) {
      setCommunityNameError(
        cause instanceof Error ? cause.message : '社区昵称保存失败',
      );
    } finally {
      setCommunityNameBusy(false);
    }
  }

  function openAiSettings() {
    setAiSettingsOpen(true);
    setTutorialOpen(false);
    setAuthorApiOpen(false);
    setSettingsNotice('');
    setSettingsError('');
    setApiKey('');
    if (!user || preview) return;

    setSettingsBusy(true);
    void mobileApi
      .settings()
      .then((result) => {
        setSettings(result);
        setAiForm({
          baseUrl: result.baseUrl,
          model: result.model,
          temperature: String(result.temperature),
        });
      })
      .catch((error: unknown) => {
        setSettingsError(error instanceof Error ? error.message : '读取 AI 配置失败');
      })
      .finally(() => setSettingsBusy(false));
  }

  async function saveAiSettings() {
    if (!user || preview) {
      setSettingsError('登录后才能保存当前账号的 AI 配置');
      return;
    }
    const temperature = Number(aiForm.temperature);
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
      setSettingsError('温度需要填写 0 到 2 之间的数字');
      return;
    }
    if (!aiForm.baseUrl.trim() || !aiForm.model.trim()) {
      setSettingsError('请填写 API 地址和模型名称');
      return;
    }

    setSettingsSaveBusy(true);
    setSettingsError('');
    setSettingsNotice('');
    try {
      await mobileApi.saveSettings({
        baseUrl: aiForm.baseUrl.trim(),
        model: aiForm.model.trim(),
        temperature,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      });
      const result = await mobileApi.settings();
      setSettings(result);
      setApiKey('');
      setSettingsNotice('已保存到当前账号，做题时即可使用 AI 服务。');
    } catch (error: unknown) {
      setSettingsError(error instanceof Error ? error.message : '保存 AI 配置失败');
    } finally {
      setSettingsSaveBusy(false);
    }
  }

  async function deployAuthorApi() {
    if (!user || preview) {
      setSettingsError('登录后才能为当前账号部署作者 API');
      return;
    }
    if (!authorPassword.trim()) {
      setSettingsError('请输入作者提供的部署密码');
      return;
    }

    setSettingsSaveBusy(true);
    setSettingsError('');
    setSettingsNotice('');
    try {
      await mobileApi.deployAuthorApi(authorPassword.trim());
      const result = await mobileApi.settings();
      setSettings(result);
      setAiForm({
        baseUrl: result.baseUrl,
        model: result.model,
        temperature: String(result.temperature),
      });
      setAuthorPassword('');
      setAuthorApiOpen(false);
      setSettingsNotice('作者 API 已配置到当前账号，可以开始使用 AI 服务。');
    } catch (error: unknown) {
      setSettingsError(error instanceof Error ? error.message : '作者 API 部署失败');
    } finally {
      setSettingsSaveBusy(false);
    }
  }

  return (
    <ScreenContainer profile>
      {communityOpen && (
        <Modal
          animationType="slide"
          onRequestClose={() => setCommunityOpen(false)}
          visible={active && communityOpen}
        >
          <SafeAreaView style={styles.communityModalSafeArea}>
            <CommunityScreen
              onClose={() => setCommunityOpen(false)}
              preview={preview}
              user={user}
            />
          </SafeAreaView>
        </Modal>
      )}
      <EntranceView delay={60} distance={16} style={styles.profileCard}>
        <View style={styles.profileIdentity}>
          <View style={styles.avatar}><Text style={styles.avatarText}>考</Text></View>
          <View style={styles.profileIdentityCopy}>
            <Text style={styles.profileKicker}>考匠账号</Text>
            <Text numberOfLines={1} style={styles.profileName}>{user?.username ?? '未登录用户'}</Text>
            <Text numberOfLines={1} style={styles.profileMeta}>
              {activeCertificate?.name ?? (user ? '请选择证书与题库' : '预览模式')}
            </Text>
          </View>
          {user && (
            <AnimatedPressable
              accessibilityRole="button"
              onPress={onOpenCertificatePicker}
              style={styles.profileCertificateButton}
            >
              <Text style={styles.profileCertificateText}>切换 ›</Text>
            </AnimatedPressable>
          )}
        </View>
        <View style={styles.profileSyncRow}>
          <View style={styles.profileSyncDot} />
          <Text style={styles.profileSyncText}>{user ? '学习进度已同步到当前账号' : '登录后可同步学习进度'}</Text>
        </View>
      </EntranceView>

      <EntranceView delay={100} distance={12} style={styles.profileSection}>
        <View style={styles.profileSectionHeader}>
          <Text style={styles.profileSectionTitle}>学习快捷入口</Text>
          <Text style={styles.profileSectionHint}>常用功能</Text>
        </View>
        <View style={styles.profileShortcutGrid}>
          <AnimatedPressable
            accessibilityRole="button"
            onPress={() => onNavigate('wrong')}
            style={styles.profileShortcut}
          >
            <View style={[styles.profileShortcutIcon, styles.profileShortcutIconGold]}><Text style={styles.profileShortcutGlyph}>错</Text></View>
            <Text style={styles.profileShortcutTitle}>错题复习</Text>
            <Text style={styles.profileShortcutMeta}>巩固薄弱知识点</Text>
          </AnimatedPressable>
          <AnimatedPressable
            accessibilityRole="button"
            onPress={() => onNavigate('practice', { practiceSource: 'favorites' })}
            style={styles.profileShortcut}
          >
            <View style={styles.profileShortcutIcon}><Text style={styles.profileShortcutGlyph}>★</Text></View>
            <Text style={styles.profileShortcutTitle}>收藏题目</Text>
            <Text style={styles.profileShortcutMeta}>回看标记的题目</Text>
          </AnimatedPressable>
          <AnimatedPressable
            accessibilityRole="button"
            onPress={() => onNavigate('practice', { practiceMode: 'ai', practiceAiLibrary: true })}
            style={styles.profileShortcut}
          >
            <View style={[styles.profileShortcutIcon, styles.profileShortcutIconBlue]}><Text style={styles.profileShortcutGlyph}>AI</Text></View>
            <Text style={styles.profileShortcutTitle}>已生成题目</Text>
            <Text style={styles.profileShortcutMeta}>按批次刷题或上传</Text>
          </AnimatedPressable>
          <AnimatedPressable
            accessibilityRole="button"
            onPress={() => onNavigate('today')}
            style={styles.profileShortcut}
          >
            <View style={[styles.profileShortcutIcon, styles.profileShortcutIconMint]}><Text style={styles.profileShortcutGlyph}>今</Text></View>
            <Text style={styles.profileShortcutTitle}>学习进度</Text>
            <Text style={styles.profileShortcutMeta}>查看今日练习情况</Text>
          </AnimatedPressable>
        </View>
      </EntranceView>

      <EntranceView delay={150} distance={12} style={styles.profileSection}>
        <View style={styles.profileSectionHeader}>
          <Text style={styles.profileSectionTitle}>账户与学习</Text>
        </View>
        <View style={styles.settingsCard}>
          <SettingRow
            onPress={() => setCommunityOpen(true)}
            title="考匠社区"
            value="学习交流 · 排行榜"
          />
          <SettingRow
            onPress={user ? onOpenCertificatePicker : undefined}
            title="证书与题库"
            value={activeCertificate?.name ?? (user ? '已同步' : '预览模式')}
          />
          <SettingRow onPress={openAiSettings} title="AI 学习助手" value="按账号配置" />
          <SettingRow
            onPress={user ? openCommunityNameSettings : undefined}
            title="社区昵称"
            value={user?.communityName || user?.username || '登录后设置'}
          />
        </View>
      </EntranceView>

      <EntranceView delay={200} distance={12} style={styles.profileSection}>
        <View style={styles.profileSectionHeader}>
          <Text style={styles.profileSectionTitle}>应用设置</Text>
        </View>
        <View style={styles.settingsCard}>
          <SettingRow onPress={() => setAppSettingsOpen(true)} title="外观、动画与音效" value="主题、动画、提示音" />
          <SettingRow title="清理学习缓存" value={cacheNotice || '自动缓存 · 可清理'} onPress={() => {
            void mobileApi.clearStudyCache().then(() => setCacheNotice('已清理'));
          }} />
          <SettingRow
            onPress={() => setAboutOpen(true)}
            title="关于考匠"
            value={`移动端 v${APP_VERSION}`}
          />
        </View>
      </EntranceView>

      <EntranceView delay={230} distance={12} style={styles.aiServiceCard}>
        <Text style={styles.aiServiceTitle}>AI 学习服务</Text>
        <Text style={styles.aiServiceText}>
          做题后可使用 AI 提示、错因解析、详细讲解和变式训练。AI Key 仍由你的账号配置，App 不保存密钥。
        </Text>
      </EntranceView>
      <EntranceView delay={260} distance={10}>
        <PrimaryAction onPress={() => setSponsorOpen(true)}>赞助作者</PrimaryAction>
      </EntranceView>
      {onLogout && (
        <EntranceView delay={290} distance={8}>
          <AnimatedPressable onPress={onLogout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>{user ? '退出登录' : '退出预览'}</Text>
          </AnimatedPressable>
        </EntranceView>
      )}
      <Modal
        animationType="slide"
        onRequestClose={() => setAppSettingsOpen(false)}
        transparent
        visible={active && appSettingsOpen}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.settingsModal}>
            <ScrollView
              contentContainerStyle={styles.settingsModalScroll}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderCopy}>
                  <Text style={styles.modalTitle}>设置</Text>
                  <Text style={styles.modalKicker}>外观、动画与声音</Text>
                </View>
                <AnimatedPressable
                  accessibilityLabel="关闭设置"
                  accessibilityRole="button"
                  onPress={() => setAppSettingsOpen(false)}
                  style={styles.modalCloseButton}
                >
                  <Text style={styles.modalCloseText}>关闭</Text>
                </AnimatedPressable>
              </View>
              <Text style={styles.modalIntro}>选择你喜欢的节奏和显示方式，修改会立即生效。</Text>
              <Text style={styles.settingsSectionTitle}>动画速度</Text>
              <View style={styles.appearanceOptions}>
                {animationOptions.map((option) => {
                  const active = animationSpeed === option.id;
                  return (
                    <AnimatedPressable
                      key={option.id}
                      onPress={() => setAnimationSpeed(option.id)}
                      style={[styles.appearanceOption, active && styles.appearanceOptionActive]}
                    >
                      <View style={styles.appearanceOptionCopy}>
                        <Text style={[styles.appearanceOptionText, active && styles.appearanceOptionTextActive]}>
                          {option.label}
                        </Text>
                        <Text style={styles.appearanceOptionHint}>{option.hint}</Text>
                      </View>
                      {active && <Text style={styles.appearanceCheck}>✓</Text>}
                    </AnimatedPressable>
                  );
                })}
              </View>
              <Text style={styles.settingsSectionTitle}>主题模式</Text>
              <View style={styles.appearanceOptions}>
                {themeOptions.map((option) => {
                  const active = mode === option.id;
                  return (
                    <AnimatedPressable
                      key={option.id}
                      onPress={() => setMode(option.id)}
                      style={[styles.appearanceOption, active && styles.appearanceOptionActive]}
                    >
                      <View style={styles.appearanceOptionCopy}>
                        <Text style={[styles.appearanceOptionText, active && styles.appearanceOptionTextActive]}>
                          {option.label}
                        </Text>
                        <Text style={styles.appearanceOptionHint}>{option.hint}</Text>
                      </View>
                      {active && <Text style={styles.appearanceCheck}>✓</Text>}
                    </AnimatedPressable>
                  );
                })}
              </View>
              <Text style={styles.settingsHint}>
                当前显示：{resolvedMode === 'dark' ? '深色' : '浅色'}模式
              </Text>
              <View style={styles.settingsSoundHeader}>
                <View style={styles.settingsSoundCopy}>
                  <Text style={styles.settingsSectionTitle}>交互音效</Text>
                  <Text style={styles.appearanceOptionHint}>点击按钮时播放轻短提示音</Text>
                </View>
                <Switch
                  accessibilityLabel="开启交互音效"
                  onValueChange={(enabled) => {
                    previewUiSound();
                    setSoundEnabled(enabled);
                  }}
                  thumbColor={soundEnabled ? colors.brand : colors.textFaint}
                  trackColor={{ false: colors.border, true: colors.brandSoft }}
                  value={soundEnabled}
                />
              </View>
              <Text style={styles.settingsSoundLabel}>音效样式</Text>
              <View style={styles.soundStyleOptions}>
                {soundStyleOptions.map((option) => {
                  const selected = soundStyle === option.id;
                  return (
                    <AnimatedPressable
                      accessibilityRole="button"
                      key={option.id}
                      onPress={() => setSoundStyle(option.id)}
                      style={[styles.soundStyleOption, selected && styles.appearanceOptionActive]}
                    >
                      <Text style={[styles.appearanceOptionText, selected && styles.appearanceOptionTextActive]}>
                        {option.label}
                      </Text>
                      <Text style={styles.appearanceOptionHint}>{option.hint}</Text>
                    </AnimatedPressable>
                  );
                })}
              </View>
              <View style={styles.settingsSoundLevelHeader}>
                <Text style={styles.settingsSoundLabel}>音量</Text>
                <Text style={styles.appearanceOptionHint}>{Math.round(soundVolume * 100)}%</Text>
              </View>
              <View style={styles.soundVolumeOptions}>
                {soundVolumeOptions.map((option) => {
                  const selected = soundVolume === option.value;
                  return (
                    <AnimatedPressable
                      accessibilityRole="button"
                      key={option.label}
                      onPress={() => setSoundVolume(option.value)}
                      style={[styles.soundVolumeOption, selected && styles.appearanceOptionActive]}
                    >
                      <Text style={[styles.appearanceOptionText, selected && styles.appearanceOptionTextActive]}>
                        {option.label}
                      </Text>
                    </AnimatedPressable>
                  );
                })}
              </View>
              <AnimatedPressable
                accessibilityRole="button"
                onPress={previewUiSound}
                style={styles.soundPreviewButton}
              >
                <Text style={styles.soundPreviewButtonText}>试听当前音效</Text>
              </AnimatedPressable>
              <AnimatedPressable
                onPress={() => setAppSettingsOpen(false)}
                style={[styles.modalPrimaryButton, styles.appearanceDoneButton]}
              >
                <Text style={styles.modalPrimaryText}>完成</Text>
              </AnimatedPressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal
        animationType="fade"
        onRequestClose={() => setSponsorOpen(false)}
        transparent
        visible={active && sponsorOpen}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.sponsorModal}>
            <Text style={styles.modalTitle}>赞助作者</Text>
            <Text style={styles.modalIntro}>
              如果考匠帮你节省了复习时间，欢迎支持作者继续维护题库和 AI 服务。
            </Text>
            <Image
              accessibilityLabel="微信赞助二维码"
              source={require('../../assets/sponsor-wechat.jpg')}
              style={styles.sponsorImage}
            />
            <Text style={styles.sponsorHint}>使用微信扫一扫</Text>
            <AnimatedPressable
              onPress={() => setSponsorOpen(false)}
              style={[styles.modalPrimaryButton, styles.sponsorCloseButton]}
            >
              <Text style={styles.modalPrimaryText}>暂时关闭</Text>
            </AnimatedPressable>
          </View>
        </View>
      </Modal>
      <Modal
        animationType="fade"
        onRequestClose={() => {
          if (!communityNameBusy) setCommunityNameOpen(false);
        }}
        transparent
        visible={active && communityNameOpen}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.nameModal}>
            <Text style={styles.modalTitle}>设置社区昵称</Text>
            <Text style={styles.modalIntro}>
              这是你在公共大群里显示的名字，不会改变登录账号。最多 24 个字符。
            </Text>
            <TextInput
              editable={!communityNameBusy}
              maxLength={24}
              onChangeText={setCommunityName}
              placeholder="输入社区昵称"
              placeholderTextColor={colors.textFaint}
              style={styles.settingsInput}
              value={communityName}
            />
            {!!communityNameError && (
              <Text style={styles.settingsError}>{communityNameError}</Text>
            )}
            <View style={styles.modalActions}>
              <AnimatedPressable
                disabled={communityNameBusy}
                onPress={() => setCommunityNameOpen(false)}
                style={styles.modalSecondaryButton}
              >
                <Text style={styles.modalSecondaryText}>取消</Text>
              </AnimatedPressable>
              <AnimatedPressable
                disabled={communityNameBusy}
                onPress={() => void saveCommunityName()}
                style={styles.modalPrimaryButton}
              >
                {communityNameBusy ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.modalPrimaryText}>保存昵称</Text>
                )}
              </AnimatedPressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        animationType="slide"
        onRequestClose={() => setAiSettingsOpen(false)}
        transparent
        visible={active && aiSettingsOpen}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.settingsModal}>
            <ScrollView
              contentContainerStyle={styles.settingsModalScroll}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderCopy}>
                  <Text style={styles.modalTitle}>AI 学习助手</Text>
                  <Text style={styles.modalKicker}>只为当前账号保存</Text>
                </View>
                <AnimatedPressable
                  accessibilityLabel="关闭 AI 配置"
                  accessibilityRole="button"
                  onPress={() => setAiSettingsOpen(false)}
                  style={styles.modalCloseButton}
                >
                  <Text style={styles.modalCloseText}>关闭</Text>
                </AnimatedPressable>
              </View>
              <Text style={styles.modalIntro}>
                配置后，做题页可以使用 AI 提示、错因解析、详细讲解和变式训练。密钥只会提交到当前账号的后端设置，不会写入 App。
              </Text>

              <View style={styles.settingsStatusCard}>
                <View>
                  <Text style={styles.settingsStatusLabel}>当前 AI 状态</Text>
                  <Text style={styles.settingsStatusHint}>
                    {preview
                      ? '预览模式，登录后可保存'
                      : settingsBusy
                        ? '正在读取配置…'
                        : settings?.hasKey
                          ? '已配置，可以调用'
                          : '尚未配置 API Key'}
                  </Text>
                </View>
                <Text style={styles.settingsStatusIcon}>{settings?.hasKey ? '✓' : '✦'}</Text>
              </View>

              <Text style={styles.settingsSectionTitle}>服务配置</Text>
              <Text style={styles.settingsLabel}>API 地址</Text>
              <TextInput
                autoCapitalize="none"
                editable={!preview && !settingsSaveBusy}
                keyboardType="url"
                onChangeText={(baseUrl) => setAiForm((current) => ({ ...current, baseUrl }))}
                placeholder="https://api.deepseek.com"
                placeholderTextColor={colors.textFaint}
                style={styles.settingsInput}
                value={aiForm.baseUrl}
              />
              <Text style={styles.settingsLabel}>模型名称</Text>
              <TextInput
                autoCapitalize="none"
                editable={!preview && !settingsSaveBusy}
                onChangeText={(model) => setAiForm((current) => ({ ...current, model }))}
                placeholder="deepseek-chat"
                placeholderTextColor={colors.textFaint}
                style={styles.settingsInput}
                value={aiForm.model}
              />
              <Text style={styles.settingsLabel}>温度（0 - 2）</Text>
              <TextInput
                editable={!preview && !settingsSaveBusy}
                keyboardType="decimal-pad"
                onChangeText={(temperature) =>
                  setAiForm((current) => ({ ...current, temperature }))
                }
                placeholder="0.3"
                placeholderTextColor={colors.textFaint}
                style={styles.settingsInput}
                value={aiForm.temperature}
              />
              <Text style={styles.settingsLabel}>API Key（可选）</Text>
              <TextInput
                autoCapitalize="none"
                editable={!preview && !settingsSaveBusy}
                onChangeText={setApiKey}
                placeholder={settings?.hasKey ? '已配置，留空可保留原 Key' : '粘贴你的 API Key'}
                placeholderTextColor={colors.textFaint}
                secureTextEntry
                style={styles.settingsInput}
                value={apiKey}
              />
              <Text style={styles.settingsHint}>
                不填写 API Key 时，保存会保留当前账号已有的密钥；作者 API 也只会写入当前账号。
              </Text>

              <View style={styles.settingsToolRow}>
                <AnimatedPressable
                  onPress={() => setTutorialOpen((current) => !current)}
                  style={styles.settingsToolButton}
                >
                  <Text style={styles.settingsToolText}>配置教程</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  onPress={() => setAuthorApiOpen((current) => !current)}
                  style={[styles.settingsToolButton, styles.settingsToolButtonAccent]}
                >
                  <Text style={styles.settingsToolText}>使用作者 API</Text>
                </AnimatedPressable>
              </View>

              {authorApiOpen && (
                <View style={styles.authorApiCard}>
                  <Text style={styles.authorApiTitle}>使用作者 API</Text>
                  <Text style={styles.authorApiText}>
                    输入作者提供的部署密码后，服务器会把作者 API 安全配置到你的账号。App 不保存密码。
                  </Text>
                  <TextInput
                    autoCapitalize="none"
                    editable={!settingsSaveBusy}
                    onChangeText={setAuthorPassword}
                    placeholder="请输入部署密码"
                    placeholderTextColor={colors.textFaint}
                    secureTextEntry
                    style={styles.settingsInput}
                    value={authorPassword}
                  />
                  <AnimatedPressable
                    disabled={settingsSaveBusy || preview}
                    onPress={() => void deployAuthorApi()}
                    style={[styles.modalPrimaryButton, styles.authorApiButton]}
                  >
                    {settingsSaveBusy ? (
                      <ActivityIndicator color={colors.white} />
                    ) : (
                      <Text style={styles.modalPrimaryText}>部署到当前账号</Text>
                    )}
                  </AnimatedPressable>
                </View>
              )}

              {tutorialOpen && (
                <View style={styles.guideCard}>
                  <Text style={styles.guideTitle}>DeepSeek 配置教程</Text>
                  <GuideStep number="1" text="打开 DeepSeek 开放平台并登录账号。" />
                  <GuideStep number="2" text="在 API Keys 页面创建一个新的 Key。" />
                  <GuideStep number="3" text="回到这里，填写 API 地址、模型和 Key。" />
                  <GuideStep number="4" text="点击底部保存，之后做题页就能调用 AI。" />
                  <AnimatedPressable
                    onPress={() =>
                      void Linking.openURL('https://platform.deepseek.com/api_keys').catch(
                        () => undefined,
                      )
                    }
                    style={styles.guideLinkButton}
                  >
                    <Text style={styles.guideLinkText}>打开 DeepSeek API Keys</Text>
                  </AnimatedPressable>
                </View>
              )}

              {!!settingsNotice && <Text style={styles.settingsNotice}>{settingsNotice}</Text>}
              {!!settingsError && <Text style={styles.settingsError}>{settingsError}</Text>}
              <View style={styles.modalActions}>
                <AnimatedPressable
                  disabled={settingsSaveBusy}
                  onPress={() => setAiSettingsOpen(false)}
                  style={styles.modalSecondaryButton}
                >
                  <Text style={styles.modalSecondaryText}>稍后配置</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  disabled={settingsSaveBusy || preview}
                  onPress={() => void saveAiSettings()}
                  style={styles.modalPrimaryButton}
                >
                  {settingsSaveBusy ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.modalPrimaryText}>保存配置</Text>
                  )}
                </AnimatedPressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal
        animationType="slide"
        onRequestClose={() => setAboutOpen(false)}
        transparent
        visible={active && aboutOpen}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.settingsModal}>
            <ScrollView
              contentContainerStyle={styles.settingsModalScroll}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderCopy}>
                  <Text style={styles.modalTitle}>关于考匠</Text>
                  <Text style={styles.modalKicker}>让学习回到每个人手里</Text>
                </View>
                <AnimatedPressable
                  accessibilityLabel="关闭关于考匠"
                  accessibilityRole="button"
                  onPress={() => setAboutOpen(false)}
                  style={styles.modalCloseButton}
                >
                  <Text style={styles.modalCloseText}>关闭</Text>
                </AnimatedPressable>
              </View>
              <View style={styles.aboutHero}>
                <Text style={styles.aboutHeroMark}>考</Text>
                <View style={styles.aboutHeroCopy}>
                  <Text style={styles.aboutHeroTitle}>考匠 · AceExam</Text>
                  <Text style={styles.aboutHeroText}>把精练题、碎片时间和现代化 AI 教育放在一起。</Text>
                </View>
              </View>
              <Text style={styles.aboutSectionTitle}>作者想说</Text>
              <View style={styles.authorMessageCard}>
                <Text style={styles.authorMessageLead}>我做考匠，起初只是因为相信：</Text>
                <Text style={styles.authorMessage}>
                  每一个认真学习的人，都应该拥有一条不被费用和时间挡住的路。
                </Text>
                <Text style={styles.authorMessage}>
                  我希望，让暂时无力承担学费的同学，也能接触到经过整理、真正精练有用的题目；让没有时间参加补课的同学，也能利用通勤、排队和睡前的碎片时间，一点点向前进步；让每个人都能体验到更现代、更贴近自己的 AI 教育。
                </Text>
                <Text style={styles.authorMessage}>
                  考匠网站永久免费。唯一可能产生费用的部分，是 AI 供应商收取的 API 使用费，这笔费用不会进入作者口袋。
                </Text>
                <Text style={styles.authorMessage}>
                  如果考匠对你有帮助，欢迎打赏一笔小小的支持，帮助我们持续维护题库、改进体验，让考匠社区越来越好。
                </Text>
              </View>
              <Text style={styles.aboutFootnote}>
                愿每一次短暂练习，都能变成看得见的进步。感谢你把时间交给考匠。
              </Text>
              <AnimatedPressable
                onPress={() => {
                  setAboutOpen(false);
                  setSponsorOpen(true);
                }}
                style={styles.modalPrimaryButton}
              >
                <Text style={styles.modalPrimaryText}>去赞助作者</Text>
              </AnimatedPressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

function GuideStep({ number, text }: { number: string; text: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.guideStep}>
      <View style={styles.guideStepNumber}>
        <Text style={styles.guideStepNumberText}>{number}</Text>
      </View>
      <Text style={styles.guideStepText}>{text}</Text>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  content: {
    backgroundColor: colors.background,
    flexGrow: 1,
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  compactContent: {
    gap: spacing.xs,
    paddingBottom: spacing.md,
  },
  profileContent: { gap: spacing.lg, paddingTop: spacing.lg },
  practiceProgressLabel: { color: colors.brand, fontSize: 13, fontWeight: '700', marginBottom: 2 },
  aiPickerIntro: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  aiPickerIntroMark: { alignItems: 'center', backgroundColor: colors.brandSoft, borderRadius: radius.sm, height: 34, justifyContent: 'center', width: 34 },
  aiPickerIntroGlyph: { color: colors.brand, fontSize: 16, fontWeight: '900' },
  aiPickerIntroCopy: { flex: 1, gap: 3 },
  aiPickerIntroTitle: { color: colors.text, fontSize: 13, fontWeight: '900' },
  aiPickerHint: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  shortAnswerCard: { backgroundColor: colors.surface, borderRadius: radius.md, gap: spacing.sm, padding: spacing.md },
  shortAnswerLabel: { color: colors.text, fontSize: 14, fontWeight: '800' },
  shortAnswerInput: { borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, color: colors.text, fontSize: 14, minHeight: 130, padding: spacing.sm },
  selfRatingRow: { flexDirection: 'row', gap: spacing.sm },
  selfRatingButton: { alignItems: 'center', borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, flex: 1, minHeight: 42, justifyContent: 'center' },
  selfRatingText: { color: colors.brandDark, fontSize: 14, fontWeight: '700' },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    paddingTop: spacing.sm,
  },
  eyebrow: {
    color: colors.brand,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  screenTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 36,
  },
  welcomeCard: {
    backgroundColor: colors.brand,
    borderRadius: radius.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 170,
    overflow: 'hidden',
    padding: spacing.lg,
    ...shadow.card,
  },
  todayFocusCard: {
    backgroundColor: colors.brand,
    borderRadius: radius.lg,
    gap: spacing.md,
    overflow: 'hidden',
    padding: spacing.md,
    ...shadow.card,
  },
  todayFocusTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 124,
  },
  welcomeCopy: {
    flex: 1,
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  welcomeKicker: {
    color: '#BFE5D3',
    fontSize: 13,
    fontWeight: '700',
  },
  welcomeTitle: {
    color: colors.white,
    fontSize: 23,
    fontWeight: '800',
    lineHeight: 30,
  },
  welcomeText: {
    color: '#E2F2E9',
    fontSize: 14,
    lineHeight: 21,
  },
  progressCircle: {
    alignItems: 'center',
    backgroundColor: '#2C9478',
    borderColor: '#72BBA1',
    borderRadius: 58,
    borderWidth: 5,
    height: 116,
    justifyContent: 'center',
    marginTop: spacing.sm,
    width: 116,
  },
  progressNumber: {
    color: colors.white,
    fontSize: 24,
    fontWeight: '800',
  },
  progressLabel: {
    color: '#D1EFE0',
    fontSize: 12,
    marginTop: 2,
  },
  todayStartButton: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  todayStartButtonText: {
    color: colors.brandDark,
    fontSize: 16,
    fontWeight: '800',
  },
  todayStartButtonArrow: {
    color: colors.brand,
    fontSize: 25,
    fontWeight: '700',
  },
  sectionHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  sectionMeta: {
    color: colors.brand,
    fontSize: 14,
    fontWeight: '700',
  },
  progressTrack: {
    backgroundColor: colors.brandSoft,
    borderRadius: radius.pill,
    height: 9,
    overflow: 'hidden',
  },
  progressValue: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    height: '100%',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statSlot: {
    flex: 1,
  },
  statCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    flex: 1,
    minHeight: 100,
    padding: spacing.md,
    ...shadow.card,
  },
  statDot: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    height: 9,
    marginBottom: spacing.sm,
    width: 9,
  },
  goldDot: {
    backgroundColor: colors.gold,
  },
  statValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 3,
  },
  primaryAction: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 58,
    paddingHorizontal: spacing.md,
    ...shadow.card,
  },
  compactPrimaryAction: {
    minHeight: 50,
    paddingHorizontal: spacing.sm,
  },
  disabledAction: {
    opacity: 0.55,
  },
  primaryActionText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryAction: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 58,
    paddingHorizontal: spacing.md,
    ...shadow.card,
  },
  secondaryActionText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryActionMeta: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  modeSwitch: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
  modeButton: {
    alignItems: 'center',
    borderRadius: radius.sm,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.sm,
  },
  activeModeButton: {
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  modeButtonText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  activeModeButtonText: {
    color: colors.brand,
    fontWeight: '800',
  },
  modeButtonHint: {
    color: colors.textFaint,
    fontSize: 11,
    marginTop: 2,
  },
  pickerSummary: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderRadius: radius.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.md,
    ...shadow.card,
  },
  pickerSummaryTitle: {
    color: colors.white,
    fontSize: 19,
    fontWeight: '800',
  },
  pickerSummaryText: {
    color: '#D9F0E5',
    fontSize: 13,
    marginTop: 4,
  },
  pickerSummaryMark: {
    color: '#BFE5D3',
    fontSize: 38,
  },
  pickerFavoriteCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.gold,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 66,
    paddingHorizontal: spacing.md,
    ...shadow.card,
  },
  pickerSpecialCards: { gap: spacing.xs },
  pickerGeneratedCard: {
    backgroundColor: colors.surface,
    borderColor: colors.brand,
  },
  pickerGeneratedIcon: {
    color: colors.brand,
    fontSize: 26,
    fontWeight: '900',
    width: 32,
  },
  pickerFavoriteStar: {
    color: colors.gold,
    fontSize: 28,
    width: 32,
  },
  pickerFavoriteTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  pickerChapters: {
    gap: spacing.sm,
  },
  pickerDailyAllCard: {
    alignItems: 'center',
    backgroundColor: colors.brandSoft,
    borderColor: colors.brand,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 66,
    paddingHorizontal: spacing.md,
  },
  pickerChapter: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    gap: spacing.sm,
    padding: spacing.sm,
    ...shadow.card,
  },
  pickerChapterHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: 2,
  },
  pickerChapterStart: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 48,
  },
  pickerChapterExpand: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: spacing.xs,
  },
  pickerChapterExpandText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  pickerChapterExpandIcon: {
    color: colors.brand,
    fontSize: 20,
    fontWeight: '800',
  },
  pickerChapterTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  pickerChapterProgress: {
    color: colors.brand,
    fontSize: 16,
    fontWeight: '800',
  },
  pickerChapterProgressMeta: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: -spacing.xs,
  },
  pickerCardCopy: {
    flex: 1,
  },
  pickerCardMeta: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  pickerKnowledgeList: {
    gap: 4,
  },
  pickerSectionBlock: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    gap: 6,
    padding: spacing.xs,
  },
  pickerSectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  pickerSectionStart: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 46,
    paddingHorizontal: spacing.sm,
  },
  pickerSectionExpand: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: spacing.xs,
  },
  pickerSectionPoints: {
    gap: 4,
    paddingLeft: spacing.sm,
  },
  pickerKnowledgeItem: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    gap: 7,
    paddingHorizontal: spacing.sm,
    paddingVertical: 9,
  },
  pickerKnowledgeTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pickerKnowledgeName: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  pickerKnowledgeMeta: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: '800',
  },
  actionArrow: {
    color: colors.brand,
    fontSize: 28,
    fontWeight: '400',
    lineHeight: 30,
  },
  bodyText: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 24,
  },
  optionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    gap: spacing.sm,
    padding: spacing.lg,
    ...shadow.card,
  },
  optionTag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    color: colors.brand,
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  optionTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '800',
  },
  optionText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  mutedNotice: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  mutedNoticeText: {
    color: colors.brandDark,
    fontSize: 13,
    lineHeight: 20,
  },
  loadingState: {
    alignItems: 'center',
    gap: spacing.md,
    justifyContent: 'center',
    minHeight: 240,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  questionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    gap: spacing.xs,
    padding: spacing.sm,
    position: 'relative',
    ...shadow.card,
  },
  questionUtilities: {
    marginTop: -2,
  },
  utilityButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: spacing.xs,
  },
  aiUtilityButton: {
    backgroundColor: colors.surfaceMuted,
    borderColor: '#B8D9C3',
  },
  aiUtilityButtonText: {
    color: colors.brandDark,
    fontSize: 13,
    fontWeight: '800',
  },
  reportNotice: {
    color: colors.brandDark,
    fontSize: 13,
    lineHeight: 20,
  },
  questionUtilityIcons: {
    alignItems: 'center',
    bottom: 4,
    flexDirection: 'row',
    gap: 2,
    position: 'absolute',
    right: 5,
  },
  questionIconButton: {
    alignItems: 'center',
    height: 30,
    justifyContent: 'center',
    width: 28,
  },
  questionStarIcon: {
    color: colors.textFaint,
    fontSize: 17,
    lineHeight: 20,
  },
  questionStarActive: {
    color: colors.gold,
  },
  questionReportIcon: {
    color: colors.textFaint,
    fontSize: 17,
    lineHeight: 20,
  },
  questionMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'space-between',
  },
  questionType: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    color: colors.brand,
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  questionKnowledge: {
    color: colors.textMuted,
    flexShrink: 1,
    fontSize: 12,
  },
  questionText: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 23,
    paddingRight: 54,
  },
  optionsList: {
    gap: spacing.xs,
  },
  questionOption: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 46,
    paddingHorizontal: 10,
    paddingVertical: 5,
    ...shadow.card,
  },
  selectedOption: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.brand,
  },
  correctOption: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.brand,
  },
  wrongOption: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warning,
  },
  optionLetter: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  selectedOptionLetter: {
    backgroundColor: colors.brand,
  },
  correctOptionLetter: {
    backgroundColor: colors.brand,
  },
  wrongOptionLetter: {
    backgroundColor: colors.warning,
  },
  optionLetterText: {
    color: colors.brandDark,
    fontSize: 13,
    fontWeight: '800',
  },
  questionOptionText: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
  },
  optionStatus: {
    color: colors.brand,
    fontSize: 20,
    fontWeight: '800',
  },
  formError: {
    color: colors.warning,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  feedbackGood: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.brandSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 3,
    padding: spacing.xs,
  },
  feedbackBad: {
    backgroundColor: colors.warningSoft,
    borderColor: '#F0C8C3',
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 3,
    padding: spacing.xs,
  },
  feedbackPending: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
  },
  feedbackPendingText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  feedbackTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  feedbackAnswer: {
    color: colors.brandDark,
    fontSize: 14,
    fontWeight: '700',
  },
  feedbackText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  aiTools: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  removeWrongButton: {
    alignItems: 'center',
    borderColor: colors.warning,
    borderRadius: radius.sm,
    borderWidth: 1,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  removeWrongButtonText: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: '800',
  },
  aiToolButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: spacing.xs,
  },
  aiToolButtonText: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: '800',
  },
  aiResponseCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 3,
    padding: spacing.xs,
  },
  aiResponseTitle: {
    color: colors.brandDark,
    fontSize: 15,
    fontWeight: '800',
  },
  aiResponseMeta: {
    color: colors.brand,
    fontSize: 13,
    fontWeight: '700',
  },
  aiResponseText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 22,
  },
  trainingNotice: {
    backgroundColor: colors.goldSoft,
    borderRadius: radius.sm,
    color: colors.gold,
    fontSize: 13,
    lineHeight: 20,
    padding: spacing.sm,
  },
  aiError: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(16, 37, 29, 0.42)',
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.md,
  },
  reportModal: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    gap: spacing.md,
    maxHeight: '92%',
    padding: spacing.lg,
    width: '100%',
    ...shadow.card,
  },
  settingsModal: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    maxHeight: '92%',
    width: '100%',
    ...shadow.card,
  },
  nameModal: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    gap: spacing.md,
    padding: spacing.lg,
    width: '100%',
    ...shadow.card,
  },
  settingsModalScroll: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  modalHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  modalKicker: {
    color: colors.brand,
    fontSize: 12,
    fontWeight: '800',
  },
  modalCloseButton: {
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
  },
  modalCloseText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  settingsStatusCard: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  settingsStatusLabel: {
    color: colors.brandDark,
    fontSize: 14,
    fontWeight: '800',
  },
  settingsStatusHint: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  settingsStatusIcon: {
    color: colors.brand,
    fontSize: 25,
    fontWeight: '800',
  },
  settingsSectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  appearanceOptions: {
    gap: spacing.xs,
  },
  appearanceOption: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  appearanceOptionActive: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.brand,
  },
  appearanceOptionCopy: {
    flex: 1,
    gap: 3,
  },
  appearanceOptionText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  appearanceOptionTextActive: {
    color: colors.brandDark,
    fontWeight: '800',
  },
  appearanceOptionHint: {
    color: colors.textMuted,
    fontSize: 12,
  },
  appearanceCheck: {
    color: colors.brand,
    fontSize: 20,
    fontWeight: '800',
    paddingLeft: spacing.sm,
  },
  appearanceDoneButton: {
    marginTop: spacing.xs,
  },
  settingsSoundHeader: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.md,
  },
  settingsSoundCopy: { flex: 1, gap: 4 },
  settingsSoundLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  soundStyleOptions: { flexDirection: 'row', gap: spacing.xs },
  soundStyleOption: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    justifyContent: 'center',
    minHeight: 58,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  settingsSoundLevelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  soundVolumeOptions: { flexDirection: 'row', gap: spacing.xs },
  soundVolumeOption: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
  },
  soundPreviewButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 40,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  soundPreviewButtonText: { color: colors.brandDark, fontSize: 13, fontWeight: '800' },
  settingsLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: -spacing.sm,
  },
  settingsInput: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    color: colors.text,
    fontSize: 14,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  settingsHint: {
    color: colors.textFaint,
    fontSize: 12,
    lineHeight: 18,
  },
  settingsToolRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  settingsToolButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: spacing.sm,
  },
  settingsToolButtonAccent: {
    backgroundColor: colors.brandSoft,
  },
  settingsToolText: {
    color: colors.brandDark,
    fontSize: 13,
    fontWeight: '800',
  },
  authorApiCard: {
    backgroundColor: colors.goldSoft,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  authorApiTitle: {
    color: colors.gold,
    fontSize: 15,
    fontWeight: '800',
  },
  authorApiText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  authorApiButton: {
    alignSelf: 'stretch',
    flex: 0,
  },
  guideCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  guideTitle: {
    color: colors.brandDark,
    fontSize: 15,
    fontWeight: '800',
  },
  guideStep: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  guideStepNumber: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  guideStepNumberText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  guideStepText: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  guideLinkButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  guideLinkText: {
    color: colors.brand,
    fontSize: 13,
    fontWeight: '800',
  },
  settingsNotice: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    color: colors.brandDark,
    fontSize: 13,
    lineHeight: 20,
    padding: spacing.sm,
  },
  settingsError: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.sm,
    color: colors.warning,
    fontSize: 13,
    lineHeight: 20,
    padding: spacing.sm,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  modalIntro: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  reportOptions: {
    gap: spacing.sm,
  },
  reportOption: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 46,
    paddingHorizontal: spacing.md,
  },
  selectedReportOption: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.brand,
  },
  reportOptionText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  selectedReportOptionText: {
    color: colors.brandDark,
    fontWeight: '800',
  },
  reportCheck: {
    color: colors.brand,
    fontSize: 18,
    fontWeight: '800',
  },
  reportInput: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    color: colors.text,
    fontSize: 14,
    minHeight: 88,
    padding: spacing.sm,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modalSecondaryButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  modalSecondaryText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  modalPrimaryButton: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderRadius: radius.sm,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  modalPrimaryText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    gap: spacing.md,
    padding: spacing.lg,
    ...shadow.card,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 22,
  },
  completedCard: {
    backgroundColor: colors.brandSoft,
    borderRadius: radius.lg,
    gap: spacing.md,
    padding: spacing.lg,
    ...shadow.card,
  },
  completedEmoji: {
    color: colors.gold,
    fontSize: 44,
  },
  completedTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  completedText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 22,
  },
  wrongSummary: {
    alignItems: 'center',
    backgroundColor: colors.warningSoft,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  wrongCount: {
    color: colors.warning,
    fontSize: 42,
    fontWeight: '800',
  },
  wrongLabel: {
    color: colors.warning,
    fontSize: 14,
    marginTop: 2,
  },
  wrongEmoji: {
    color: colors.warning,
    fontSize: 54,
    fontWeight: '300',
    transform: [{ rotate: '-35deg' }],
  },
  wrongDistributionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
    ...shadow.card,
  },
  wrongDistributionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'space-between',
  },
  wrongDistributionTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
  },
  wrongDistributionMeta: {
    color: colors.textMuted,
    fontSize: 11,
  },
  wrongDistributionList: {
    gap: spacing.sm,
  },
  wrongDistributionItem: {
    gap: 5,
  },
  wrongDistributionLabels: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  wrongDistributionName: {
    color: colors.text,
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  wrongDistributionCount: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: '800',
  },
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    ...shadow.card,
  },
  listLoading: {
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 100,
    justifyContent: 'center',
  },
  wrongListTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    paddingTop: spacing.md,
  },
  emptyListText: {
    color: colors.textMuted,
    fontSize: 14,
    paddingVertical: spacing.lg,
    textAlign: 'center',
  },
  listRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 76,
  },
  wrongBullet: {
    backgroundColor: colors.warning,
    borderRadius: radius.pill,
    height: 8,
    marginRight: spacing.sm,
    width: 8,
  },
  listCopy: {
    flex: 1,
    gap: 4,
  },
  listTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  listMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  rowArrow: {
    color: colors.textFaint,
    fontSize: 25,
    paddingLeft: spacing.sm,
  },
  examHero: {
    backgroundColor: '#23483C',
    borderRadius: radius.lg,
    gap: spacing.md,
    padding: spacing.lg,
    ...shadow.card,
  },
  examTag: {
    color: '#BFE5D3',
    fontSize: 13,
    fontWeight: '800',
  },
  examTitle: {
    color: colors.white,
    fontSize: 23,
    fontWeight: '800',
    lineHeight: 30,
  },
  examText: {
    color: '#D4E9DF',
    fontSize: 14,
    lineHeight: 22,
  },
  examMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  examMeta: {
    backgroundColor: '#376657',
    borderRadius: radius.pill,
    color: '#E5F5EC',
    fontSize: 12,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  profileCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
    ...shadow.card,
  },
  profileIdentity: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  profileIdentityCopy: { flex: 1, gap: 3 },
  profileKicker: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.brandSoft,
    borderRadius: radius.md,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  avatarText: {
    color: colors.brand,
    fontSize: 25,
    fontWeight: '800',
  },
  profileName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  profileMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  profileCertificateButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: spacing.sm,
  },
  profileCertificateText: { color: colors.brand, fontSize: 12, fontWeight: '800' },
  profileSyncRow: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', gap: spacing.xs, paddingTop: spacing.sm },
  profileSyncDot: { backgroundColor: colors.brand, borderRadius: radius.pill, height: 7, width: 7 },
  profileSyncText: { color: colors.textMuted, fontSize: 11 },
  profileSection: { gap: spacing.sm },
  communityModalSafeArea: { backgroundColor: colors.background, flex: 1 },
  profileSectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  profileSectionTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  profileSectionHint: { color: colors.textFaint, fontSize: 11 },
  profileShortcutGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  profileShortcut: {
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexBasis: '48%',
    flexGrow: 1,
    gap: 7,
    minHeight: 116,
    padding: spacing.md,
  },
  profileShortcutIcon: { alignItems: 'center', backgroundColor: colors.brandSoft, borderRadius: radius.sm, height: 32, justifyContent: 'center', minWidth: 32, paddingHorizontal: 5 },
  profileShortcutIconGold: { backgroundColor: colors.goldSoft },
  profileShortcutIconBlue: { backgroundColor: colors.surfaceMuted },
  profileShortcutIconMint: { backgroundColor: colors.brandSoft },
  profileShortcutGlyph: { color: colors.brand, fontSize: 12, fontWeight: '900' },
  profileShortcutTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  profileShortcutMeta: { color: colors.textMuted, fontSize: 10, lineHeight: 15 },
  settingsCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    ...shadow.card,
  },
  aiServiceCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  aiServiceTitle: {
    color: colors.brandDark,
    fontSize: 16,
    fontWeight: '800',
  },
  aiServiceText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 22,
  },
  settingRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 60,
  },
  settingTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  settingValue: {
    color: colors.textMuted,
    fontSize: 13,
  },
  settingValueWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  settingArrow: {
    color: colors.brand,
    fontSize: 22,
    lineHeight: 22,
  },
  logoutButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: 52,
    justifyContent: 'center',
  },
  logoutText: {
    color: colors.warning,
    fontSize: 15,
    fontWeight: '800',
  },
  sponsorModal: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    gap: spacing.md,
    padding: spacing.lg,
    width: '100%',
    ...shadow.card,
  },
  sponsorImage: {
    borderRadius: radius.sm,
    height: 250,
    width: 250,
  },
  sponsorHint: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  sponsorCloseButton: {
    alignSelf: 'stretch',
    flex: 0,
  },
  aboutHero: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderRadius: radius.lg,
    flexDirection: 'row',
    gap: spacing.md,
    overflow: 'hidden',
    padding: spacing.lg,
  },
  aboutHeroMark: {
    alignItems: 'center',
    backgroundColor: '#2C9478',
    borderColor: '#75BBA2',
    borderRadius: radius.md,
    borderWidth: 2,
    color: colors.white,
    fontSize: 28,
    fontWeight: '800',
    height: 58,
    lineHeight: 54,
    textAlign: 'center',
    width: 58,
  },
  aboutHeroCopy: {
    flex: 1,
    gap: 5,
  },
  aboutHeroTitle: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '800',
  },
  aboutHeroText: {
    color: '#D9F0E3',
    fontSize: 13,
    lineHeight: 20,
  },
  aboutSectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  authorMessageCard: {
    backgroundColor: colors.goldSoft,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  authorMessageLead: {
    color: colors.gold,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 23,
  },
  authorMessage: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 23,
  },
  aboutFootnote: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 21,
  },
});

function SettingRow({
  onPress,
  title,
  value,
}: {
  onPress?: () => void;
  title: string;
  value: string;
}) {
  const styles = useThemedStyles(createStyles);
  const content = (
    <>
      <Text style={styles.settingTitle}>{title}</Text>
      <View style={styles.settingValueWrap}>
        <Text style={styles.settingValue}>{value}</Text>
        {onPress && <Text style={styles.settingArrow}>›</Text>}
      </View>
    </>
  );

  if (onPress) {
    return (
      <AnimatedPressable
        accessibilityLabel={`${title}设置`}
        accessibilityRole="button"
        onPress={onPress}
        style={styles.settingRow}
      >
        {content}
      </AnimatedPressable>
    );
  }

  return <View style={styles.settingRow}>{content}</View>;
}
