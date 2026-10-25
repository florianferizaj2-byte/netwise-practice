import { androidAccent } from '../android-design-tokens';
import { useAndroidFocusMode } from '../navigation/AndroidFocusMode.android';
import { AndroidPageHeader, AndroidPointsLink } from '../components/AndroidUi.android';
import { androidPointsFlow } from '../api/androidPointsRuntime.android';
import { AppIcon } from '../components/AppIcon';
import { iosStyles } from '../iosStyles';
export { TodayScreen, WrongScreen } from './StudyOverviewScreens';
export { ExamScreen } from './ExamScreen';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { AppAlert as Alert } from '../components/AppAlert';
import { RefreshControl } from '../components/RefreshControl';
import { SafeAreaView } from '../components/SafeArea';
import { WebAppActions } from '../components/WebAppActions';
import { AppSwitch } from '../components/AppSwitch';

import {
  mobileApi,
  type AiAnalysisResponse,
  type AiSettingsResponse,
  type AiTeacherAction,
  type AttemptResponse,
  type AuthResponse,
  type DashboardResponse,
  type FeedbackKind,
  type Question,
  type QuestionPage,
} from '../api/client';
import { useScreenActive } from '../navigation/ScreenActivity';
import { useActiveTimer } from '../navigation/useActiveTimer';
import { BrandMark } from '../components/BrandMark';
import { RedeemCodeModal, membershipLabels } from '../components/RedeemCodeModal';
import { QuestionImages } from '../components/QuestionImages';
import { AiQuestionDraftScreen } from './AiQuestionDraftScreen';
import { PracticeHubScreen } from './PracticeHubScreen.android';
import { CommunityScreen } from './CommunityScreen';
import { AdminScreen } from './AdminScreen';
import { ProfileSetupScreen } from './ProfileSetupScreen';
import { AccountSecurityScreen } from './AccountSecurityScreen';
import { previewUiSound } from '../audioFeedback';
import {
  AnimatedPressable,
  AnimatedProgressBar,
  EntranceView,
} from '../components/Motion';
import {
  radius,
  shadow,
  spacing,
  useThemedStyles,
  useTheme,
  isAppleWeb,
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
  practiceQuestionIds?: string[];
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
  const styles = useThemedStyles(createStyles, iosStyles.tabs);
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
  const styles = useThemedStyles(createStyles, iosStyles.tabs);
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
  const styles = useThemedStyles(createStyles, iosStyles.tabs);
  return (
    <AnimatedPressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.primaryAction, compact && styles.compactPrimaryAction, disabled && styles.disabledAction]}
    >
      <Text style={styles.primaryActionText}>{children}</Text>
      <AppIcon style={styles.actionArrow}>›</AppIcon>
    </AnimatedPressable>
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
  practiceQuestionIds,
  practiceAiGroupId,
  practiceAiLibrary = false,
  aiQuestionGroupId,
  preview = false, user, certificates, onOpenCertificatePicker,
}: ScreenProps) {
  const { colors, reduceMotion } = useTheme();
  const { width: practiceWidth, fontScale: practiceFontScale } = useWindowDimensions();
  const optionBadgeEdge = Math.ceil(36 * Math.max(1, practiceFontScale));
  const stackAiActions = practiceWidth < 360 || practiceFontScale > 1.15;
  const stackPracticeHeader = practiceWidth < 360 && practiceFontScale > 1.15;
  const styles = useThemedStyles(createStyles, iosStyles.tabs);
  const active = useScreenActive();
  const isDailyPractice = practiceSession === 'daily';
  const [questions, setQuestions] = useState<Question[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState('');
  const pageGeneration = useRef(0);
  const viewedAnswers=useRef<{generation:number;items:Map<string,{selected:string[];draft:string;result:AttemptResponse|null}>}>({generation:-1,items:new Map()});
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
    practiceSource === 'all' &&
    (isDailyPractice
      ? !practiceSelectionComplete
      : practiceMode === 'ai'
        ? !practiceChapter || !practiceKnowledgePoint
        : !practiceChapter && !practiceKnowledgeSection && !practiceKnowledgePoint);

  const practiceSaving=submitting||reportBusy||wrongDeleteBusy;
  const focusedPractice=!needsPracticePicker&&!(practiceAiLibrary&&!preview)&&!(practiceMode==='ai'&&practiceChapter&&practiceKnowledgePoint)&&!finished;
  useAndroidFocusMode(focusedPractice);
  useEffect(()=>{
    if(!active||!focusedPractice)return;
    const subscription=BackHandler.addEventListener('hardwareBackPress',()=>{requestPracticeExit();return true;});
    return()=>subscription.remove();
  },[active,focusedPractice,onNavigate,practiceMode,practiceSession,practiceSaving,aiBusy]);

  useEffect(() => {
    let mounted = true;
    const cachedPage = !preview && !needsPracticePicker && !isDailyPractice &&
      practiceSource === 'all' && practiceMode === 'sequential' && !practiceAiGroupId &&
      reloadKey === 0
      ? mobileApi.freshQuestionPage(0, {
          chapter: practiceChapter,
          knowledgeSection: practiceKnowledgeSection,
          knowledgePoint: practiceKnowledgePoint,
        })
      : undefined;
    pageGeneration.current += 1;
    pageSeed.current = Math.random().toString(36).slice(2);
    pageFlight.current = null;
    setNextOffset(cachedPage?.nextOffset ?? null);
    setTotalQuestions(cachedPage?.total ?? 0);
    setLoadingMore(false);
    setPageError('');
    setLoading(!cachedPage);
    setError(null);
    setQuestions(cachedPage?.items ?? []);
    const cachedIndex = practiceQuestionId
      ? cachedPage?.items.findIndex((question) => question.id === practiceQuestionId)
      : -1;
    setQuestionIndex(cachedIndex !== undefined && cachedIndex >= 0 ? cachedIndex : 0);
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
        const loadedItems = Array.isArray(loaded) ? loaded : loaded.items;
        const selectedIds = practiceQuestionIds ? new Set(practiceQuestionIds) : null;
        const items = practiceSource === 'wrong' ? loadedItems.filter((question) =>
          (!selectedIds || selectedIds.has(question.id)) &&
          (!practiceChapter || question.chapter === practiceChapter) &&
          (!practiceKnowledgeSection || question.knowledgeSection === practiceKnowledgeSection) &&
          (!practiceKnowledgePoint || question.knowledgePoint === practiceKnowledgePoint),
        ) : loadedItems;
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
    practiceQuestionIds,
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
          ? '预览模式只展示页面结构。登录并领取 AI 积分后，这里会返回不会直接泄露答案的分步提示。'
          : '预览模式只展示页面结构。登录并领取 AI 积分后，这里会返回针对当前题目的详细讲解。';
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
        reason: '登录并领取 AI 积分后，服务会结合你的错误选项和历史作答记录分析薄弱点。',
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
      setTrainingNotice('登录并领取 AI 积分后，这里会根据当前知识点生成 3 道变式题。');
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

  function requestPracticeExit(){
    if(practiceSaving)return;
    const leave=()=>onNavigate('practice',{practiceMode,practiceSession});
    if(aiBusy){
      Alert.alert('AI 仍在处理中','离开页面不会自动取消正在进行的 AI 请求，积分以最终用量结算。',[
        {text:'继续等待',style:'cancel'},
        {text:'离开页面',onPress:leave},
      ]);
      return;
    }
    leave();
  }

  // Previous/next are local review navigation, not another grading request.
  // A new loader generation also starts a new account/certificate-owned history.
  function practiceReviewHistory(){
    if(viewedAnswers.current.generation!==pageGeneration.current)viewedAnswers.current={generation:pageGeneration.current,items:new Map()};
    return viewedAnswers.current.items;
  }
  function rememberPracticeView(){
    if(currentQuestion)practiceReviewHistory().set(currentQuestion.id,{selected:[...selected],draft:responseDraft,result});
  }
  function restorePracticeView(index:number){
    const item=questions[index];if(!item)return;
    const saved=practiceReviewHistory().get(item.id);
    setQuestionIndex(index);setSelected(saved?.selected??[]);setResponseDraft(saved?.draft??'');setResult(saved?.result??null);setError(null);
  }
  function previousPracticeQuestion(){
    if(submitting||aiBusy||loadingMore||questionIndex===0)return;
    rememberPracticeView();restorePracticeView(questionIndex-1);
  }
  function continuePracticeQuestion(){
    if(submitting||aiBusy||loadingMore)return;
    rememberPracticeView();
    const next=questions[questionIndex+1];
    if(next&&practiceReviewHistory().has(next.id))restorePracticeView(questionIndex+1);
    else void nextQuestion();
  }

  if (practiceAiLibrary && !preview) {
    return <AiQuestionDraftScreen
      libraryMode
      onBack={() => onNavigate('practice', { practiceMode: 'ai' })}
      onNavigate={onNavigate}
    />;
  }

  if (needsPracticePicker) {
    return (
      <PracticeHubScreen user={user} certificates={certificates} onOpenCertificatePicker={onOpenCertificatePicker}
        onNavigate={onNavigate}
        onPracticeModeChange={onPracticeModeChange}
        practiceMode={practiceMode}
        practiceSession={practiceSession}
        preview={preview}
      />
    );
  }

  if (loading) {
    return (
      <ScreenContainer>
        <ScreenHeader eyebrow="开始练习" title="题目练习" />
        <ContentPlaceholder rows={3} practice />
      </ScreenContainer>
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
          <AppIcon name="check" style={styles.completedEmoji}>✦</AppIcon>
          <Text style={styles.completedTitle}>很棒，节奏保持住</Text>
          <Text style={styles.completedText}>
            本组练习进度已保存到你的账号，回到首页可以查看最新学习进度。
          </Text>
          <PrimaryAction onPress={() => onNavigate('today')}>查看今日进度</PrimaryAction>
          <PrimaryAction
            onPress={() => {
              if (isDailyPractice) { setReloadKey((current) => current + 1); return; }
              viewedAnswers.current.items.clear();
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
        <AnimatedPressable
          accessibilityRole="button"
          onPress={() =>
            onNavigate('practice', {
              practiceMode: practiceMode === 'ai' ? 'sequential' : practiceMode,
              practiceSession,
            })
          }
        >
          <Text style={styles.bodyText}>‹ 返回题库目录</Text>
        </AnimatedPressable>
        <ScreenHeader
          eyebrow="开始练习"
          title={
            error
              ? '题目加载失败'
              : practiceSource === 'favorites'
                ? '收藏题目'
                : '暂时没有可练题目'
          }
        />
        <EntranceView delay={70} distance={14} style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>
            {error
              ? '暂时无法读取题目'
              : practiceSource === 'favorites'
                ? '还没有收藏题目'
                : '当前范围暂时没有题目'}
          </Text>
          <Text style={styles.emptyText}>
            {error ||
              (practiceSource === 'favorites'
                ? '练习时点击题目右上角的星标，就能在这里集中复习。'
                : '可以返回目录选择其他知识点，或重新同步题库。')}
          </Text>
          {practiceSource === 'favorites' && !error ? (
            <PrimaryAction
              onPress={() =>
                onNavigate('practice', { practiceMode: 'sequential' })
              }
            >
              去题库练习
            </PrimaryAction>
          ) : (
            <PrimaryAction
              onPress={() => setReloadKey((current) => current + 1)}
            >
              重新加载
            </PrimaryAction>
          )}
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
    <View style={styles.nativeFocusScreen}>
      <View style={styles.nativeQuestionHeader}>
        <View style={[styles.nativeHeaderLeading,stackPracticeHeader&&styles.nativeHeaderFlexible]}><AnimatedPressable accessibilityRole="button" accessibilityLabel={isDailyPractice?'更换今日练习范围':'返回题库目录'} disabled={practiceSaving} accessibilityHint={practiceSaving?'正在保存作答，完成后可返回':undefined} onPress={requestPracticeExit} style={[styles.nativeHeaderButton,practiceSaving&&{opacity:0.45}]}><AppIcon name="chevron-left" size={25} color={colors.text}/></AnimatedPressable></View>{!stackPracticeHeader&&<View pointerEvents="none" style={styles.nativeCenteredTitle}><Text accessibilityRole="header" style={styles.nativeQuestionTitle}>{practiceSource==='wrong'?'错题复习':practiceSource==='favorites'?'收藏练习':isDailyPractice?'每日刷题':'知识点练习'}</Text></View>}
        <View style={styles.nativeHeaderTools}>
          <AnimatedPressable accessibilityRole="button" accessibilityLabel={currentQuestion.favorite?'取消收藏题目':'收藏题目'} onPress={toggleFavorite} style={styles.nativeHeaderButton}><AppIcon name="star" selected={!!currentQuestion.favorite} size={23} color={currentQuestion.favorite?colors.brand:colors.text}/></AnimatedPressable>
          <AnimatedPressable accessibilityRole="button" accessibilityLabel="举报题目" disabled={reportBusy} onPress={()=>setReportOpen(true)} style={styles.nativeHeaderButton}><AppIcon name="flag" size={23} color={colors.text}/></AnimatedPressable>
        </View>
      </View>
      {stackPracticeHeader&&<View style={styles.nativeHeaderTitleRow}><Text accessibilityRole="header" style={styles.nativeQuestionTitle}>{practiceSource==='wrong'?'错题复习':practiceSource==='favorites'?'收藏练习':isDailyPractice?'每日刷题':'知识点练习'}</Text></View>}
      <ScrollView style={styles.nativeQuestionScroll} contentContainerStyle={styles.nativeQuestionContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <AnimatedProgressBar value={((questionIndex+1)/Math.max(1,totalQuestions,questions.length))*100} color={colors.brand} trackColor={colors.border}/>
        <View style={styles.nativeQuestionProgress}><Text style={styles.nativeProgressText}>第 {questionIndex+1} / {Math.max(totalQuestions,questions.length)} 题</Text><Text style={styles.nativeProgressHint}>{result?'本题已作答':modeLabel}</Text></View>
        {!!pageError&&<Text style={styles.formError}>{pageError}，点击下一题可重试。</Text>}
        {loadingMore&&<Text style={styles.loadingText}>正在准备后续题目…</Text>}
        <View style={styles.nativeKnowledgeLine}><Text style={styles.nativeKnowledgeChip}>{currentQuestion.knowledgePoint||practiceKnowledgePoint||'综合练习'}</Text><Text style={styles.nativeProgressHint}>{currentQuestion.type==='short_answer'?'简答题':currentQuestion.type==='true_false'?'判断题':isMultiple?'多选题':'单选题'}</Text></View>
        <View style={styles.nativeCombinedQuestionCard}>
      <EntranceView delay={50} distance={12} style={styles.questionCard}>
        <QuestionImages question={currentQuestion} />
        <Text style={styles.questionText}>{currentQuestion.question}</Text>
      </EntranceView>

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
                accessibilityRole={isMultiple?'checkbox':'radio'}
                accessibilityLabel={option+'：'+currentQuestion.options[option]}
                accessibilityState={{checked:isSelected,disabled:!!result||submitting}}
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
                    { width: optionBadgeEdge, height: optionBadgeEdge, borderRadius: optionBadgeEdge / 2 },
                    isSelected && styles.selectedOptionLetter,
                    isCorrect && styles.correctOptionLetter,
                    isWrong && styles.wrongOptionLetter,
                  ]}
                >
                  <Text style={[styles.optionLetterText,{lineHeight:optionBadgeEdge/Math.max(0.5,practiceFontScale)},isSelected&&{color:colors.white},isCorrect&&{color:colors.success},isWrong&&{color:colors.warning}]}>{option}</Text>
                </View>
                <Text style={styles.questionOptionText}>{currentQuestion.options[option]}</Text>
                {isCorrect && <Text style={styles.optionStatus}>✓</Text>}
                {isWrong && <Text style={styles.optionStatus}>×</Text>}
              </AnimatedPressable>
            </EntranceView>
          );
        })}
      </View>}

      {!result&&currentQuestion.type!=='short_answer'&&<AnimatedPressable accessibilityRole="button" accessibilityLabel="AI 提示" accessibilityHint={!selected.length?'先选择一个选项再获取提示':'按实际用量结算；缓存结果免费'} disabled={!selected.length||!!aiBusy} onPress={()=>askAiTeacher('给我提示',1)} style={[styles.nativeHintRow,(!selected.length||!!aiBusy)&&{opacity:0.6}]}><AppIcon name="sparkles" size={23} color={colors.brand}/><Text style={styles.nativeHintTitle}>{aiBusy==='hint'?'AI 提示中…':'AI 提示'}</Text><Text style={styles.nativeProgressHint}>使用 AI 积分</Text><AppIcon name="chevron-right" size={17} color={colors.textMuted}/></AnimatedPressable>}
      {!result&&<Text style={styles.nativeBeforeAnswer}>确认后查看答案与解析</Text>}
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
              accessibilityLabel={aiBusy === 'analysis' ? 'AI 解析中…' : 'AI 解析错因'}
              disabled={!!aiBusy}
              onPress={analyzeWithAi}
              style={[styles.aiToolButton, stackAiActions && styles.aiToolWide]}
            >
              <AppIcon name="sparkles" size={18} color={colors.brand}/>
              <Text style={styles.aiToolButtonText}>
                {aiBusy === 'analysis' ? '解析中…' : '错因分析'}
              </Text>
            </AnimatedPressable>
          )}
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={aiBusy === 'teacher' ? 'AI 老师思考中…' : 'AI 详细讲解'}
            disabled={!!aiBusy}
            onPress={() => askAiTeacher('详细讲解')}
            style={[styles.aiToolButton, stackAiActions && styles.aiToolWide]}
          >
            <AppIcon name="book" size={18} color={colors.brand}/>
            <Text style={styles.aiToolButtonText}>
              {aiBusy === 'teacher' ? '思考中…' : '详细讲解'}
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            accessibilityRole="button"
            disabled={!!aiBusy}
            onPress={generateAiPractice}
            style={[styles.aiToolButton, styles.aiToolWide]}
          >
            <AppIcon name="sparkles" size={18} color={colors.brand}/>
            <Text style={styles.aiToolButtonText}>
              {aiBusy === 'train' ? (aiProgress || '正在准备生成…') : '生成 3 道变式题'}
            </Text>
          </AnimatedPressable>
        </View>
      )}

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

        </View>
      </ScrollView>
      <View style={styles.nativeQuestionFooter}><View style={styles.nativeQuestionFooterBody}>
        <AnimatedPressable accessibilityRole="button" accessibilityLabel="上一题" disabled={questionIndex===0||submitting||!!aiBusy||loadingMore} onPress={previousPracticeQuestion} style={[styles.nativePrevious,(questionIndex===0||submitting||!!aiBusy||loadingMore)&&{opacity:0.45}]}><Text style={styles.nativePreviousText}>上一题</Text></AnimatedPressable>
        <AnimatedPressable accessibilityRole="button" accessibilityLabel={result?'下一题':currentQuestion.type==='short_answer'?'提交自评':'确认答案'} disabled={submitting||!!aiBusy||loadingMore} onPress={result?continuePracticeQuestion:submitAnswer} style={[styles.nativeConfirm,(submitting||!!aiBusy||loadingMore)&&{opacity:0.6}]}><Text style={styles.nativeConfirmText}>{submitting?'正在判分…':result?'下一题':currentQuestion.type==='short_answer'?'提交自评':'确认答案'}</Text></AnimatedPressable>
      </View></View>
      <Modal
        animationType={reduceMotion?'none':'slide'}
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
                  {reportKind === option.kind && <AppIcon style={styles.reportCheck}>✓</AppIcon>}
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
    </View>
  );
}

const utilityType = StyleSheet.create({
  title: { fontSize: 16, lineHeight: 24, fontWeight: '500', flexShrink: 1 },
});

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
  const { width, fontScale } = useWindowDimensions();
  const stackUtilities = width < 360 || fontScale > 1.2;
  const {
    animationSpeed,
    colors,
    mode,
    resolvedMode, reduceMotion,
    soundEnabled,
    soundStyle,
    soundVolume,
    setAnimationSpeed,
    setMode,
    setSoundEnabled,
    setSoundStyle,
    setSoundVolume,
  } = useTheme();
  const styles = useThemedStyles(createStyles, iosStyles.tabs);
  const activeCertificate = certificates.find((certificate) => certificate.id === user?.certificateId);
  const [sponsorOpen, setSponsorOpen] = useState(false);
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [authorApiOpen, setAuthorApiOpen] = useState(false);
  const [communityOpen, setCommunityOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [membershipPlan, setMembershipPlan] = useState<keyof typeof membershipLabels>('free');
  const membershipRevision = useRef(0);
  const [settings, setSettings] = useState<AiSettingsResponse | null>(null);
  const [canManageAiService, setCanManageAiService] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsSaveBusy, setSettingsSaveBusy] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState('');
  const [cacheNotice, setCacheNotice] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [authorPassword, setAuthorPassword] = useState('');
  const [aiForm, setAiForm] = useState({
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-flash',
    temperature: '0.3',
  });

  useEffect(() => {
    if (!user || preview) {
      setCanManageAiService(false);
      setMembershipPlan('free');
      return;
    }
    if (!active) return;
    const requestId = ++membershipRevision.current;
    let mounted = true;
    void mobileApi.accountEntitlements()
      .then((result) => {
        if (mounted && requestId === membershipRevision.current) { setCanManageAiService(!!result.canManageAiService); setMembershipPlan(result.plan); }
      })
      .catch(() => undefined);
    return () => { mounted = false; };
  }, [active, preview, user?.id]);

  async function openAiSettings() {
    if (!user || preview) {
      Alert.alert('需要登录', '登录考匠账号后即可使用作者 AI 服务并查看剩余积分。');
      return;
    }
    setSettingsBusy(true);
    try {
      const entitlement = await mobileApi.accountEntitlements();
      setCanManageAiService(!!entitlement.canManageAiService);
      if (!entitlement.canManageAiService) {
        Alert.alert(
          entitlement.aiServiceAvailable ? '作者 AI 服务已连接' : '作者 AI 服务暂未就绪',
          '无需填写个人 API。解析、提示、出题、计划和答疑统一使用积分；成功按实际用量结算，失败退还预扣。可在 VIP 页查看积分和记录。',
          [
            { text: '稍后再说', style: 'cancel' },
            { text: '查看 AI 积分', onPress: () => onNavigate('vip') },
          ],
        );
        return;
      }
    } catch (error: unknown) {
      Alert.alert('暂时无法读取权限', error instanceof Error ? error.message : '请稍后重试。');
      return;
    } finally {
      setSettingsBusy(false);
    }

    setAiSettingsOpen(true);
    setTutorialOpen(false);
    setAuthorApiOpen(false);
    setSettingsNotice('');
    setSettingsError('');
    setApiKey('');
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
      setSettingsNotice('作者 AI 配置已保存，所有账号共用服务并独立扣除积分。');
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
      setSettingsNotice('作者预设配置已保存，所有账号共用服务并独立扣除积分。');
    } catch (error: unknown) {
      setSettingsError(error instanceof Error ? error.message : '作者 API 部署失败');
    } finally {
      setSettingsSaveBusy(false);
    }
  }

  return (
    <ScreenContainer profile>
      {user?.isAdmin && !preview && adminOpen && <Modal visible={active && adminOpen} animationType={reduceMotion?'none':'slide'} onRequestClose={() => setAdminOpen(false)}>
        <AdminScreen user={user} certificates={certificates} onClose={() => setAdminOpen(false)} onUserUpdated={onUserUpdated} />
      </Modal>}
      <RedeemCodeModal visible={active && redeemOpen} preview={preview} userId={user?.id} onClose={() => setRedeemOpen(false)} onRedeemed={(result) => { membershipRevision.current++; setMembershipPlan(result.plan); setCanManageAiService(!!result.canManageAiService); }} />
      {communityOpen && (
        <Modal
          animationType={reduceMotion?'none':'slide'}
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
      <AndroidPageHeader title="我的" action={{label:'设置',onPress:()=>setAppSettingsOpen(true)}}/>
      <View style={styles.nativeIdentity}>
        {user?.avatarUrl?<Image source={{uri:mobileApi.resolveDownloadUrl(user.avatarUrl)}} style={styles.avatar}/>:<View style={styles.avatar}><AppIcon name="person" size={32} color={colors.brand}/></View>}
        <View style={styles.profileIdentityCopy}><Text style={styles.profileName}>{user?.communityName||user?.username||'未登录用户'}</Text><Text style={styles.profileMeta}>{user?'考匠，陪你认真备考每一天':'登录后同步学习记录'}</Text></View>
        {user&&<AnimatedPressable accessibilityRole="button" accessibilityLabel="编辑个人资料" onPress={()=>setProfileOpen(true)} style={styles.nativeIconButton}><AppIcon name="chevron-right" size={20} color={colors.textMuted}/></AnimatedPressable>}
      </View>
      <AnimatedPressable accessibilityRole="button" accessibilityLabel="考试与题库，切换证书" onPress={user?onOpenCertificatePicker:undefined} style={styles.nativeCertificate}>
        <View style={styles.nativeIconTile}><AppIcon name="exam" size={23} color={colors.brand}/></View><View style={styles.profileIdentityCopy}><Text style={styles.profileMeta}>考试与题库</Text><Text style={styles.nativeCertificateTitle}>{activeCertificate?.name||(user?'请选择证书与题库':'预览模式')}</Text></View><Text style={styles.nativeLink}>切换</Text><AppIcon name="chevron-right" size={16} color={colors.textMuted}/>
      </AnimatedPressable>
      <View testID="profile-membership-card" style={styles.nativeMembership}>
        <AnimatedPressable accessibilityRole="button" onPress={()=>onNavigate('vip')} style={styles.nativeMemberHeading}><AppIcon name="crown" size={25} color={androidAccent(colors,'member').ink}/><Text style={styles.nativeMemberTitle}>会员与 AI 积分</Text><Text style={styles.nativeMemberPlan}>{membershipPlan==='free'?'普通用户':membershipLabels[membershipPlan]}</Text><AppIcon name="chevron-right" size={16} color={colors.brand}/></AnimatedPressable>
        <AndroidPointsLink userId={user?.id} membership/>
        <View style={styles.nativeMemberActions}>
          <AnimatedPressable accessibilityRole="button" accessibilityLabel="签到领积分，进入会员积分页" onPress={()=>onNavigate('vip')} style={[styles.nativeMemberAction,fontScale>1.2&&styles.nativeMemberActionLarge]}><AppIcon name="calendar" size={18} color={colors.brand}/><Text style={styles.nativeMemberActionText}>签到</Text></AnimatedPressable>
          <AnimatedPressable accessibilityRole="button" onPress={()=>setRedeemOpen(true)} style={[styles.nativeMemberAction,fontScale>1.2&&styles.nativeMemberActionLarge]}><AppIcon name="crown" size={19} color={colors.brand}/><Text style={styles.nativeMemberActionText}>兑换码</Text></AnimatedPressable>
          <AnimatedPressable accessibilityRole="button" accessibilityLabel="积分记录" onPress={androidPointsFlow.showDetails} style={[styles.nativeMemberAction,fontScale>1.2&&styles.nativeMemberActionLarge]}><AppIcon name="list" size={18} color={colors.brand}/><Text style={styles.nativeMemberActionText}>记录</Text></AnimatedPressable>
        </View>
      </View>
      <View style={styles.profileSection}><Text style={styles.profileSectionTitle}>学习入口</Text><View style={styles.profileShortcutGrid}>
        {[
          {title:'错题复习',icon:'wrong',tone:'review' as const,go:()=>onNavigate('wrong')},
          {title:'收藏题目',icon:'star',tone:'member' as const,go:()=>onNavigate('practice',{practiceSource:'favorites'})},
          {title:'已生成题目',icon:'sparkles',tone:'ai' as const,go:()=>onNavigate('practice',{practiceMode:'ai',practiceAiLibrary:true})},
          {title:'学习进度',icon:'chart',tone:'progress' as const,go:()=>onNavigate('today')},
        ].map(item=><AnimatedPressable key={item.title} accessibilityRole="button" onPress={item.go} style={styles.profileShortcut}><View style={[styles.profileShortcutIcon,{backgroundColor:androidAccent(colors,item.tone).soft}]}><AppIcon name={item.icon} size={25} color={androidAccent(colors,item.tone).ink}/></View><Text style={styles.profileShortcutTitle}>{item.title}</Text></AnimatedPressable>)}
      </View></View>
      <View style={styles.settingsCard}>
        <SettingRow onPress={()=>setCommunityOpen(true)} title="考匠社区" value="学习交流 · 排行榜"/>
        <SettingRow onPress={()=>void openAiSettings()} title="AI 学习助手" value={canManageAiService?'管理作者服务':'作者服务 · 按积分使用'}/>
        {user&&!preview&&<SettingRow onPress={()=>setSecurityOpen(true)} title="账号与安全" value="登录密码与账号保护"/>}
        {user?.isAdmin&&!preview&&<SettingRow onPress={()=>setAdminOpen(true)} title="管理中心" value="注册账号 · 公告管理"/>}
      </View>
      <View testID="profile-utilities" style={[styles.nativeAboutRow,stackUtilities&&styles.nativeAboutStack]}>
        <AnimatedPressable accessibilityRole="button" accessibilityLabel="关于考匠" onPress={()=>setAboutOpen(true)} style={[styles.nativeAboutButton,stackUtilities&&styles.nativeAboutButtonStack]}><AppIcon name="info" size={22} color={colors.textMuted}/><Text style={[styles.nativeAboutText,utilityType.title]}>关于考匠</Text><AppIcon name="chevron-right" size={16} color={colors.textMuted}/></AnimatedPressable>
        <View style={stackUtilities?styles.nativeAboutHorizontalDivider:styles.nativeAboutDivider}/>
        <AnimatedPressable accessibilityRole="button" accessibilityLabel="赞助作者" onPress={()=>setSponsorOpen(true)} style={[styles.nativeAboutButton,stackUtilities&&styles.nativeAboutButtonStack]}><AppIcon name="heart" size={23} color={androidAccent(colors,'review').ink}/><Text style={[styles.nativeAboutText,utilityType.title]}>赞助作者</Text><AppIcon name="chevron-right" size={16} color={colors.textMuted}/></AnimatedPressable>
      </View>
      {onLogout&&<AnimatedPressable accessibilityRole="button" onPress={onLogout} style={styles.logoutButton}><Text style={styles.logoutText}>{user?'退出登录':'退出预览'}</Text></AnimatedPressable>}
      {user && securityOpen && <Modal visible={active} onRequestClose={() => setSecurityOpen(false)} animationType={reduceMotion?'none':'slide'}>
        <AccountSecurityScreen key={user.id} onClose={() => setSecurityOpen(false)} onLogout={() => { setSecurityOpen(false); onLogout?.(); }} />
      </Modal>}
      {user && profileOpen && <Modal visible={active} onRequestClose={() => setProfileOpen(false)} animationType={reduceMotion?'none':'slide'}>
        <ProfileSetupScreen user={user} onSaved={(updated) => { onUserUpdated?.(updated); setProfileOpen(false); }} onCancel={() => setProfileOpen(false)} />
      </Modal>}
      <Modal animationType={reduceMotion?'none':'slide'} onRequestClose={()=>setAppSettingsOpen(false)} visible={active&&appSettingsOpen}>
        <SafeAreaView style={styles.settingsPage}>
          <View style={styles.settingsNativeHeader}><AnimatedPressable accessibilityRole="button" accessibilityLabel="关闭设置" onPress={()=>setAppSettingsOpen(false)} style={styles.nativeHeaderButton}><AppIcon name="chevron-left" size={25} color={colors.text}/></AnimatedPressable><Text accessibilityRole="header" style={styles.settingsNativeTitle}>设置</Text></View>
          <ScrollView contentContainerStyle={styles.settingsPageContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.settingsSmall}>修改会立即生效</Text>
            <View style={styles.settingsNativeGroup}>
              <Text style={styles.settingsNativeGroupTitle}>显示与动画</Text>
              <View style={styles.settingsChoiceRow}><View style={styles.settingsRowLabel}><AppIcon name="sun" size={22} color={colors.text}/><Text style={styles.settingsRowLabelText}>主题模式</Text></View><View accessibilityRole="radiogroup" accessibilityLabel="主题模式" style={styles.settingsSegments}>
                {themeOptions.map(option=><AnimatedPressable key={option.id} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{checked:mode===option.id}} onPress={()=>setMode(option.id)} style={[styles.settingsSegment,mode===option.id&&styles.settingsSegmentSelected]}><Text style={[styles.settingsSegmentText,mode===option.id&&styles.settingsSegmentTextSelected]}>{option.label}</Text></AnimatedPressable>)}
              </View></View>
              <View style={styles.settingsSectionDivider}/>
              <View style={styles.settingsChoiceRow}><View style={styles.settingsRowLabel}><AppIcon name="play" size={22} color={colors.text}/><Text style={styles.settingsRowLabelText}>动画速度</Text></View><View accessibilityRole="radiogroup" accessibilityLabel="动画速度" style={styles.settingsSegments}>
                {animationOptions.map(option=><AnimatedPressable key={option.id} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{checked:animationSpeed===option.id}} onPress={()=>setAnimationSpeed(option.id)} style={[styles.settingsSegment,animationSpeed===option.id&&styles.settingsSegmentSelected]}><Text style={[styles.settingsSegmentText,animationSpeed===option.id&&styles.settingsSegmentTextSelected]}>{option.label}</Text></AnimatedPressable>)}
              </View></View>
              <Text style={styles.settingsSmall}>跟随系统的减少动态效果设置</Text>
            </View>
            <View style={styles.settingsNativeGroup}>
              <Text style={styles.settingsNativeGroupTitle}>交互音效</Text>
              <View style={styles.settingsSoundToggleRow}><AppIcon name="volume" size={23} color={colors.text}/><View style={styles.nativeSettingCopy}><Text style={styles.settingsRowLabelText}>开启交互音效</Text><Text style={styles.settingsSmall}>点击按钮时播放轻短提示音</Text></View><AppSwitch accessibilityLabel="开启交互音效" value={soundEnabled} onValueChange={setSoundEnabled} trackColor={{false:colors.border,true:colors.action}} thumbColor={colors.white} style={{minHeight:48,minWidth:52}}/></View>
              <View style={styles.settingsSectionDivider}/>
              <View style={styles.settingsChoiceRow}><View style={styles.settingsRowLabel}><AppIcon name="equalizer" size={22} color={colors.text}/><Text style={styles.settingsRowLabelText}>音效样式</Text></View><View accessibilityRole="radiogroup" accessibilityLabel="音效样式" style={styles.settingsSegments}>
                {soundStyleOptions.map(option=><AnimatedPressable key={option.id} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{checked:soundStyle===option.id}} onPress={()=>setSoundStyle(option.id)} style={[styles.settingsSegment,soundStyle===option.id&&styles.settingsSegmentSelected]}><Text style={[styles.settingsSegmentText,soundStyle===option.id&&styles.settingsSegmentTextSelected]}>{option.label}</Text></AnimatedPressable>)}
              </View></View>
              <View style={styles.settingsSectionDivider}/>
              <View style={styles.settingsSoundHeader}><View style={styles.settingsRowLabel}><AppIcon name="chart" size={22} color={colors.text}/><Text style={styles.settingsRowLabelText}>音量</Text></View><Text style={styles.settingsSmall}>{Math.round(soundVolume*100)}%</Text></View>
              <View accessibilityRole="radiogroup" accessibilityLabel="音量" style={styles.settingsSegments}>
                {soundVolumeOptions.map(option=><AnimatedPressable key={option.label} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{checked:soundVolume===option.value}} onPress={()=>setSoundVolume(option.value)} style={[styles.settingsSegment,soundVolume===option.value&&styles.settingsSegmentSelected]}><Text style={[styles.settingsSegmentText,soundVolume===option.value&&styles.settingsSegmentTextSelected]}>{option.label}</Text></AnimatedPressable>)}
              </View>
              <AnimatedPressable accessibilityRole="button" onPress={previewUiSound} style={styles.settingsSample}><AppIcon name="volume" size={22} color={colors.brand}/><Text style={styles.nativeLink}>试听当前音效</Text></AnimatedPressable>
            </View>
            <AnimatedPressable accessibilityRole="button" accessibilityLabel="清理学习缓存" onPress={()=>{void mobileApi.clearStudyCache().then(()=>setCacheNotice('已清理')).catch(()=>setCacheNotice('清理失败，请重试'))}} style={styles.settingsCache}><AppIcon name="refresh" size={23} color={colors.text}/><View style={styles.nativeSettingCopy}><Text style={styles.settingsRowLabelText}>清理学习缓存</Text><Text style={styles.settingsSmall}>{cacheNotice||'不会清除账号中的学习记录'}</Text></View><AppIcon name="chevron-right" size={18} color={colors.textMuted}/></AnimatedPressable>
            <Text style={styles.settingsDeviceNote}>设置仅影响当前设备的使用体验</Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
      <Modal
        animationType={reduceMotion?'none':'fade'}
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
        animationType={reduceMotion?'none':'slide'}
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
                  <Text style={styles.modalKicker}>全站作者服务配置</Text>
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
                此处由站点作者管理全站 AI 服务。密钥保存在服务器，普通用户无需配置；若服务器设置了作者 API 环境变量，会优先使用环境变量。
              </Text>

              <View style={styles.settingsStatusCard}>
                <View>
                  <Text style={styles.settingsStatusLabel}>作者账号保存的配置</Text>
                  <Text style={styles.settingsStatusHint}>
                    {preview
                      ? '预览模式，登录后可保存'
                      : settingsBusy
                        ? '正在读取配置…'
                        : settings?.hasKey
                          ? '已保存作者密钥；环境配置仍优先'
                          : '尚未在作者账号保存密钥；可使用服务器环境配置'}
                  </Text>
                </View>
                <AppIcon style={styles.settingsStatusIcon}>{settings?.hasKey ? '✓' : '✦'}</AppIcon>
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
                placeholder="deepseek-flash"
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
                placeholder={settings?.hasKey ? '已配置，留空可保留原 Key' : '输入作者 API Key'}
                placeholderTextColor={colors.textFaint}
                secureTextEntry
                style={styles.settingsInput}
                value={apiKey}
              />
              <Text style={styles.settingsHint}>
                不填写 API Key 时，保存会保留作者账号已有的密钥。普通账号通过作者服务使用 AI，无需保存个人密钥。
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
                    输入服务器部署密码后，将预设服务保存为作者配置，供所有账号使用。App 不保存密码。
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
                      <Text style={styles.modalPrimaryText}>保存为作者配置</Text>
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
                  <GuideStep number="4" text="点击底部保存，所有账号即可按各自积分使用 AI。" />
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
        animationType={reduceMotion?'none':'slide'}
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
                  <Text style={styles.modalTitle}>关于考匠</Text><Text style={styles.nativeLicense}>安卓界面字体：Noto Sans SC。Copyright 2014–2021 Adobe，依据 SIL Open Font License 1.1 随应用分发。完整许可证随安装包提供。</Text>
                  <Text style={styles.modalKicker}>移动端 v{APP_VERSION} · 让学习回到每个人手里</Text>
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
                  普通题库继续免费开放。AI 服务由作者统一提供，按账号积分使用，可通过每日签到或会员获取积分。
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
  const styles = useThemedStyles(createStyles, iosStyles.tabs);
  return (
    <View style={styles.guideStep}>
      <View style={styles.guideStepNumber}>
        <Text style={styles.guideStepNumberText}>{number}</Text>
      </View>
      <Text style={styles.guideStepText}>{text}</Text>
    </View>
  );
}

const baseCreateStyles = (colors: ThemeColors) => StyleSheet.create({
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
  const styles = useThemedStyles(createStyles, iosStyles.tabs);
  const icon=title.includes('安全')?'lock':title.includes('AI')?'sparkles':title.includes('社区')?'message':title.includes('资料')?'person':title.includes('管理')?'settings':'info';
  const content=<><View style={styles.nativeSettingIcon}><AppIcon name={icon} size={20} color={styles.nativeLink.color}/></View><View style={styles.nativeSettingCopy}><Text style={styles.settingTitle}>{title}</Text><Text style={styles.settingValue}>{value}</Text></View>{onPress&&<AppIcon name="chevron-right" size={18} color={styles.settingValue.color}/>}</>;
  if(onPress)return <AnimatedPressable accessibilityLabel={title+'设置'} accessibilityRole="button" onPress={onPress} style={styles.settingRow}>{content}</AnimatedPressable>;
  return <View style={styles.settingRow}>{content}</View>;
}
import { ContentPlaceholder } from '../components/ContentPlaceholder';
const legacyProfileStyles=(c:ThemeColors)=>({...baseCreateStyles(c),...StyleSheet.create({
 content:{padding:16,paddingTop:8,paddingBottom:28,gap:14},compactContent:{padding:16,paddingTop:8,paddingBottom:28,gap:14},profileContent:{padding:16,paddingTop:8,paddingBottom:28,gap:0},
 nativeIdentity:{flexDirection:'row',alignItems:'center',gap:13,paddingVertical:10,marginBottom:16},avatar:{width:58,height:58,borderRadius:29,backgroundColor:c.brandSoft,alignItems:'center',justifyContent:'center'},profileName:{fontSize:19,fontWeight:'700',color:c.text},profileMeta:{color:c.textMuted,fontSize:12,lineHeight:20,marginTop:3},profileIdentityCopy:{flex:1,minWidth:0,gap:3},nativeIconButton:{width:48,minHeight:48,alignItems:'center',justifyContent:'center'},
 nativeCertificate:{flexDirection:'row',alignItems:'center',gap:10,padding:14,borderRadius:14,backgroundColor:c.surface,borderColor:c.border,borderWidth:StyleSheet.hairlineWidth,marginBottom:16},nativeIconTile:{backgroundColor:c.brandSoft,width:42,height:42,borderRadius:11,alignItems:'center',justifyContent:'center'},nativeCertificateTitle:{color:c.text,fontSize:16,fontWeight:'700'},nativeLink:{color:c.brand,fontSize:13},
 nativeMembership:{padding:16,borderRadius:15,backgroundColor:androidAccent(c,'member').soft,borderColor:androidAccent(c,'member').border,borderWidth:StyleSheet.hairlineWidth,marginBottom:16},nativeMemberHeading:{flexDirection:'row',alignItems:'center',gap:8,minHeight:48},nativeMemberTitle:{color:c.brand,fontSize:16,fontWeight:'700',flex:1},nativeMemberPlan:{color:c.brand,fontSize:12},nativeMemberActions:{flexDirection:'row',borderTopColor:c.border,borderTopWidth:StyleSheet.hairlineWidth,paddingTop:8,gap:6},nativeMemberAction:{flex:1,alignItems:'center',justifyContent:'center',gap:7,minHeight:60},nativeMemberActionText:{color:c.text,fontSize:12},
 profileSection:{gap:14,marginBottom:16,backgroundColor:c.surface,padding:16,borderRadius:14,borderWidth:StyleSheet.hairlineWidth,borderColor:c.border},profileSectionTitle:{color:c.text,fontSize:16,fontWeight:'700'},profileShortcutGrid:{flexDirection:'row',gap:5},profileShortcut:{flex:1,alignItems:'center',gap:8,minHeight:66},profileShortcutIcon:{backgroundColor:c.brandSoft,borderRadius:11,width:40,height:40,alignItems:'center',justifyContent:'center'},profileShortcutTitle:{color:c.text,fontSize:12,textAlign:'center'},
 settingsCard:{backgroundColor:c.surface,borderColor:c.border,borderWidth:StyleSheet.hairlineWidth,borderRadius:14,overflow:'hidden',marginBottom:16},settingRow:{flexDirection:'row',alignItems:'center',gap:12,padding:14,minHeight:62,borderBottomColor:c.border,borderBottomWidth:StyleSheet.hairlineWidth},settingTitle:{color:c.text,fontSize:15,fontWeight:'500'},settingValue:{color:c.textMuted,fontSize:12,lineHeight:19,marginTop:3},nativeSettingCopy:{flex:1,minWidth:0},nativeSettingIcon:{width:34,height:34,borderRadius:9,backgroundColor:c.brandSoft,alignItems:'center',justifyContent:'center'},
 nativeAboutRow:{flexDirection:'row',backgroundColor:c.surface,borderRadius:14,borderWidth:StyleSheet.hairlineWidth,borderColor:c.border,marginBottom:16},nativeAboutButton:{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,paddingHorizontal:10,minHeight:60,flexWrap:'wrap'},nativeAboutText:{fontSize:13,color:c.text},nativeVersion:{fontSize:12,color:c.textMuted},logoutButton:{backgroundColor:c.surface,borderRadius:12,minHeight:50,alignItems:'center',justifyContent:'center',marginBottom:16,borderWidth:StyleSheet.hairlineWidth,borderColor:c.border},logoutText:{color:c.warning,fontSize:15,fontWeight:'500'},nativeLicense:{color:c.textMuted,fontSize:12,lineHeight:20,marginTop:8},
 questionCard:{backgroundColor:'transparent',padding:0,gap:12},questionText:{color:c.text,fontSize:18,lineHeight:30,fontWeight:'700'},questionOption:{backgroundColor:c.surface,borderColor:c.border,borderWidth:1,borderRadius:12,flexDirection:'row',alignItems:'center',minHeight:60,padding:14,gap:12},selectedOption:{backgroundColor:c.brandSoft,borderColor:c.brand},correctOption:{backgroundColor:c.successSoft,borderColor:c.success},wrongOption:{backgroundColor:c.warningSoft,borderColor:c.warning},questionOptionText:{color:c.text,fontSize:15,lineHeight:24,flex:1},modeButton:{flex:1,alignItems:'center',justifyContent:'center',minHeight:48,borderRadius:9,padding:9},modeButtonHint:{display:'none'},activeModeButton:{backgroundColor:c.brandSoft},activeModeButtonText:{color:c.brand,fontWeight:'700'},aiToolButton:{flexGrow:1,flexBasis:'30%',minHeight:48,padding:12,backgroundColor:c.brandSoft,borderRadius:10,alignItems:'center',justifyContent:'center'},aiToolButtonText:{color:c.brand,fontSize:13,fontWeight:'500'},
 nativeFocusScreen:{flex:1,backgroundColor:c.background},nativeQuestionHeader:{flexDirection:'row',alignItems:'center',minHeight:60,paddingHorizontal:8,paddingVertical:6,width:'100%',maxWidth:760,alignSelf:'center'},nativeHeaderButton:{width:48,minHeight:48,alignItems:'center',justifyContent:'center'},nativeHeaderLeading:{width:96},nativeCenteredTitle:{flex:1,minWidth:0,alignItems:'center'},nativeQuestionTitle:{color:c.text,fontSize:18,fontWeight:'700',textAlign:'center'},nativeHeaderTools:{flexDirection:'row',alignItems:'center',width:96},nativeQuestionScroll:{flex:1,minHeight:0},nativeQuestionContent:{padding:16,paddingTop:12,paddingBottom:24,gap:14,width:'100%',maxWidth:760,alignSelf:'center'},nativeQuestionProgress:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},nativeProgressText:{color:c.text,fontSize:14},nativeProgressHint:{color:c.textMuted,fontSize:12,lineHeight:20},nativeKnowledgeLine:{flexDirection:'row',alignItems:'center',gap:12,flexWrap:'wrap',marginTop:6},nativeKnowledgeChip:{fontSize:12,color:c.textMuted,backgroundColor:c.surfaceMuted,paddingVertical:5,paddingHorizontal:10,borderRadius:8},nativeCombinedQuestionCard:{backgroundColor:c.surface,borderRadius:15,padding:16,gap:16},nativeHintRow:{flexDirection:'row',alignItems:'center',gap:9,borderWidth:1,borderColor:c.border,borderRadius:11,minHeight:54,padding:12},nativeHintTitle:{flex:1,color:c.text,fontSize:15,fontWeight:'500'},nativeBeforeAnswer:{color:c.textMuted,fontSize:12,lineHeight:20,textAlign:'center',paddingVertical:12},nativeQuestionFooterBody:{flexDirection:'row',alignItems:'center',gap:12,width:'100%',maxWidth:760,alignSelf:'center'},nativeQuestionFooter:{padding:16,paddingBottom:20,backgroundColor:c.surface,borderTopColor:c.border,borderTopWidth:StyleSheet.hairlineWidth},nativePrevious:{width:96,minHeight:50,borderRadius:11,borderWidth:1,borderColor:c.border,alignItems:'center',justifyContent:'center'},nativePreviousText:{fontSize:15,color:c.text,fontWeight:'500'},nativeConfirm:{flex:1,minHeight:50,borderRadius:11,backgroundColor:c.action,alignItems:'center',justifyContent:'center'},nativeConfirmText:{fontSize:15,fontWeight:'700',color:'#FFFFFF'},optionLetter:{width:32,height:32,borderRadius:16,borderWidth:1,borderColor:c.border,backgroundColor:'transparent',alignItems:'center',justifyContent:'center'},optionLetterText:{color:c.text,fontSize:16,fontWeight:'400'},selectedOptionLetter:{backgroundColor:c.action,borderColor:c.action},correctOptionLetter:{backgroundColor:c.successSoft,borderColor:c.success},wrongOptionLetter:{backgroundColor:c.warningSoft,borderColor:c.warning},
settingsPage:{flex:1,backgroundColor:c.background},settingsNativeHeader:{minHeight:60,paddingHorizontal:8,flexDirection:'row',alignItems:'center',gap:4},settingsNativeTitle:{fontSize:22,color:c.text,fontWeight:'700'},settingsPageContent:{padding:16,paddingTop:8,paddingBottom:28,gap:16},settingsNativeGroup:{backgroundColor:c.surface,borderRadius:15,padding:16,gap:15},settingsNativeGroupTitle:{fontSize:18,fontWeight:'700',color:c.text},settingsChoiceRow:{flexDirection:'row',alignItems:'center',gap:10,flexWrap:'wrap'},settingsRowLabel:{flexDirection:'row',alignItems:'center',gap:9,minWidth:94,minHeight:48},settingsRowLabelText:{fontSize:14,fontWeight:'500',color:c.text},settingsSegments:{flexDirection:'row',alignItems:'stretch',flex:1,minWidth:174,borderRadius:10,backgroundColor:c.surfaceMuted,padding:3,gap:2},settingsSegment:{flex:1,minHeight:48,paddingHorizontal:4,paddingVertical:10,alignItems:'center',justifyContent:'center',borderRadius:8},settingsSegmentSelected:{backgroundColor:c.action},settingsSegmentText:{fontSize:12,color:c.textMuted,textAlign:'center'},settingsSegmentTextSelected:{color:'#FFFFFF',fontWeight:'700'},settingsSmall:{fontSize:12,color:c.textMuted,lineHeight:20},settingsSectionDivider:{height:StyleSheet.hairlineWidth,backgroundColor:c.border},settingsSoundToggleRow:{flexDirection:'row',alignItems:'center',gap:10},settingsSoundHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},settingsSample:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9,minHeight:50,padding:12,backgroundColor:c.brandSoft,borderColor:c.brand,borderWidth:1,borderRadius:11},settingsCache:{flexDirection:'row',alignItems:'center',gap:12,minHeight:84,padding:16,backgroundColor:c.surface,borderRadius:14},settingsDeviceNote:{fontSize:12,color:c.textMuted,lineHeight:20,textAlign:'center',padding:8},
})});


const createStyles=(c:ThemeColors)=>({...legacyProfileStyles(c),...StyleSheet.create({
  nativeHeaderFlexible:{flex:1,width:undefined},
  nativeMemberActionLarge:{flexDirection:'column',gap:6,paddingHorizontal:4,minHeight:68},
  nativeHeaderTitleRow:{width:'100%',paddingHorizontal:16,paddingBottom:8,alignItems:'center'},
  optionLetter:{width:36,height:36,borderRadius:18,borderWidth:1,borderColor:c.border,backgroundColor:'transparent',alignItems:'center',justifyContent:'center',flexShrink:0},
  optionLetterText:{color:c.text,fontSize:16,fontWeight:'500',width:'100%',height:'100%',textAlign:'center',textAlignVertical:'center',includeFontPadding:false},
  feedbackGood:{backgroundColor:c.successSoft,borderColor:c.success,borderRadius:16,borderWidth:1,padding:18,gap:8},
  feedbackBad:{backgroundColor:c.warningSoft,borderColor:c.warning,borderRadius:16,borderWidth:1,padding:18,gap:8},
  feedbackTitle:{color:c.text,fontSize:16,lineHeight:25,fontWeight:'700'},
  feedbackAnswer:{color:c.text,fontSize:14,lineHeight:24,fontWeight:'500'},
  feedbackText:{color:c.textMuted,fontSize:14,lineHeight:25},
  aiTools:{flexDirection:'row',flexWrap:'wrap',gap:10},
  aiToolButton:{flexGrow:1,flexBasis:'45%',minWidth:0,minHeight:52,paddingHorizontal:12,paddingVertical:12,backgroundColor:c.brandSoft,borderRadius:12,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},
  aiToolWide:{flexBasis:'100%'},
  aiToolButtonText:{color:c.brand,fontSize:14,lineHeight:23,fontWeight:'500',flexShrink:1,textAlign:'center'},
  nativeMembership:{padding:18,borderRadius:18,backgroundColor:c.surface,borderColor:c.border,borderWidth:StyleSheet.hairlineWidth,marginBottom:16},
  nativeMemberHeading:{flexDirection:'row',alignItems:'center',gap:9,minHeight:44},
  nativeMemberTitle:{color:c.text,fontSize:16,fontWeight:'700',flex:1,minWidth:0},
  nativeMemberPlan:{color:androidAccent(c,'member').ink,fontSize:12,fontWeight:'500',backgroundColor:androidAccent(c,'member').soft,paddingHorizontal:10,paddingVertical:4,borderRadius:8},
  nativeMemberActions:{flexDirection:'row',borderTopColor:c.border,borderTopWidth:StyleSheet.hairlineWidth,paddingTop:14,gap:8},
  nativeMemberAction:{flex:1,minWidth:0,minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,paddingVertical:10,paddingHorizontal:5,borderRadius:10,backgroundColor:c.surfaceMuted},
  nativeMemberActionText:{color:c.text,fontSize:13,fontWeight:'500',flexShrink:1},
  nativeAboutRow:{flexDirection:'row',alignItems:'stretch',backgroundColor:c.surface,borderRadius:18,borderWidth:StyleSheet.hairlineWidth,borderColor:c.border,marginBottom:14,overflow:'hidden'},
  nativeAboutStack:{flexDirection:'column'},
  nativeAboutButton:{flex:1,minWidth:0,minHeight:64,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,paddingHorizontal:12,paddingVertical:12},
  nativeAboutButtonStack:{flex:0,alignSelf:'stretch',justifyContent:'flex-start',paddingHorizontal:18},
  nativeAboutText:{fontSize:16,color:c.text,minWidth:0},
  nativeAboutDivider:{width:StyleSheet.hairlineWidth,height:28,alignSelf:'center',backgroundColor:c.border},
  nativeAboutHorizontalDivider:{height:StyleSheet.hairlineWidth,alignSelf:'stretch',marginHorizontal:18,backgroundColor:c.border},
})});
