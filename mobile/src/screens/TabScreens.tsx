import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  mobileApi,
  type AttemptResponse,
  type AuthResponse,
  type DashboardResponse,
  type Question,
} from '../api/client';
import { BrandMark } from '../components/BrandMark';
import {
  AnimatedPressable,
  AnimatedProgressBar,
  EntranceView,
  FloatingSparkles,
  usePulse,
} from '../components/Motion';
import { colors, radius, shadow, spacing } from '../theme';
import type {
  AppTab,
  NavigationOptions,
  PracticeMode,
  PracticeSource,
} from '../types';

type ScreenProps = {
  dashboard?: DashboardResponse | null;
  onNavigate: (tab: AppTab, options?: NavigationOptions) => void;
  onLogout?: () => void;
  onPracticeModeChange?: (mode: PracticeMode) => void;
  practiceMode?: PracticeMode;
  practiceSource?: PracticeSource;
  preview?: boolean;
  user?: AuthResponse['user'];
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

function ScreenContainer({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

function ScreenHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
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

function sameAnswers(left: string[], right: string[]) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function PrimaryAction({
  children,
  disabled = false,
  onPress,
}: {
  children: ReactNode;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <AnimatedPressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.primaryAction, disabled && styles.disabledAction]}
    >
      <Text style={styles.primaryActionText}>{children}</Text>
      <Text style={styles.actionArrow}>›</Text>
    </AnimatedPressable>
  );
}

export function TodayScreen({ dashboard, onNavigate, preview = false }: ScreenProps) {
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
    : `${dashboard?.recentDays?.filter((item) => item.count > 0).length ?? 0} 天`;
  const progress = Math.min(100, Math.round((todayCount / 20) * 100));

  return (
    <ScreenContainer>
      <ScreenHeader eyebrow={todayLabel()} title="今天也来练一组" />

      <EntranceView delay={60} style={styles.welcomeCard} distance={18}>
        <FloatingSparkles />
        <View style={styles.welcomeCopy}>
          <Text style={styles.welcomeKicker}>今日学习进度</Text>
          <Text style={styles.welcomeTitle}>
            {dashboard || preview ? '保持节奏，稳稳掌握' : '正在同步你的学习'}
          </Text>
          <Text style={styles.welcomeText}>
            {dashboard || preview
              ? '完成今天的练习，就离目标更近一步。'
              : '连接成功后，这里会显示你的真实学习进度。'}
          </Text>
        </View>
        <Animated.View
          style={[styles.progressCircle, { transform: [{ scale: progressPulse }] }]}
        >
          <Text style={styles.progressNumber}>{progress}%</Text>
          <Text style={styles.progressLabel}>已完成</Text>
        </Animated.View>
      </EntranceView>

      <EntranceView delay={140} distance={10} style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>今日任务</Text>
        <Text style={styles.sectionMeta}>{todayCount} / 20 题</Text>
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
        <Text style={styles.sectionTitle}>快速开始</Text>
      </EntranceView>
      <EntranceView delay={380} distance={12}>
        <PrimaryAction
          onPress={() =>
            onNavigate('practice', {
              practiceMode: 'sequential',
              practiceSource: 'all',
            })
          }
        >
          继续今日练习
        </PrimaryAction>
      </EntranceView>
      <EntranceView delay={430} distance={12}>
        <PrimaryAction onPress={() => onNavigate('wrong')}>复习 {wrongCount} 道错题</PrimaryAction>
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
  return (
    <View style={styles.statCard}>
      <View style={[styles.statDot, tone === 'gold' && styles.goldDot]} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function PracticeScreen({
  onNavigate,
  onPracticeModeChange,
  practiceMode = 'sequential',
  practiceSource = 'all',
  preview = false,
}: ScreenProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<AttemptResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [startedAt, setStartedAt] = useState(Date.now());

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    setQuestions([]);
    setQuestionIndex(0);
    setSelected([]);
    setResult(null);
    setFinished(false);

    if (preview) {
      setQuestions([previewQuestion]);
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    const loadQuestions =
      practiceSource === 'wrong'
        ? mobileApi.wrong()
        : mobileApi.questions(practiceMode === 'random' ? 20 : 10, 0, practiceMode === 'random');

    loadQuestions
      .then((items) => {
        if (!mounted) return;
        setQuestions(
          practiceMode === 'random'
            ? shuffleQuestions(items).slice(0, 10)
            : items,
        );
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
    };
  }, [practiceMode, practiceSource, preview, reloadKey]);

  const currentQuestion = questions[questionIndex];

  useEffect(() => {
    setStartedAt(Date.now());
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
    if (!selected.length) {
      setError('先选择一个答案');
      return;
    }
    setError(null);
    setSubmitting(true);
    const timeMs = Math.min(
      86400000,
      Math.max(0, Date.now() - startedAt),
    );

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

    // 错题接口已经返回答案，先在本地展示结果，再后台保存记录，避免复习时等待网络。
    if (currentQuestion.answer?.length) {
      setResult({
        questionId: currentQuestion.id,
        selected,
        correct: sameAnswers(selected, currentQuestion.answer),
        timeMs,
        answer: currentQuestion.answer,
        analysis: currentQuestion.analysis,
      });
      setSubmitting(false);
      void mobileApi
        .recordAttempt(currentQuestion.id, selected, timeMs)
        .catch((requestError) => {
          setError(
            requestError instanceof Error
              ? `结果已显示，但同步失败：${requestError.message}`
              : '结果已显示，但答题记录同步失败',
          );
        });
      return;
    }

    try {
      const response = await mobileApi.recordAttempt(
        currentQuestion.id,
        selected,
        timeMs,
      );
      setResult(response);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : '提交失败，请检查网络后重试',
      );
    } finally {
      setSubmitting(false);
    }
  }

  function nextQuestion() {
    if (questionIndex >= questions.length - 1) {
      setFinished(true);
      return;
    }
    setQuestionIndex((current) => current + 1);
    setSelected([]);
    setResult(null);
    setError(null);
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

  if (finished) {
    return (
      <ScreenContainer>
        <ScreenHeader eyebrow="练习完成" title="这一组完成啦" />
        <EntranceView delay={70} distance={18} style={styles.completedCard}>
          <Text style={styles.completedEmoji}>✦</Text>
          <Text style={styles.completedTitle}>很棒，节奏保持住</Text>
          <Text style={styles.completedText}>
            本组已提交到你的账号，回到首页可以查看最新学习进度。
          </Text>
          <PrimaryAction onPress={() => onNavigate('today')}>查看今日进度</PrimaryAction>
          <PrimaryAction
            onPress={() => {
              setQuestionIndex(0);
              setSelected([]);
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
  const sourceLabel = practiceSource === 'wrong' ? '错题复习' : '题库练习';
  const modeLabel = practiceMode === 'random' ? '随机刷题' : '顺序刷题';

  return (
    <ScreenContainer>
      <ScreenHeader
        eyebrow={`${sourceLabel} · ${modeLabel} · ${questionIndex + 1}/${questions.length}`}
        title={isMultiple ? '选择所有正确答案' : '选出你的答案'}
      />
      <EntranceView delay={20} distance={6} style={styles.modeSwitch}>
        <AnimatedPressable
          accessibilityLabel="顺序刷题"
          disabled={submitting}
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
      </EntranceView>
      <EntranceView delay={50} distance={12} style={styles.questionCard}>
        <View style={styles.questionMetaRow}>
          <Text style={styles.questionType}>{isMultiple ? '多选题' : '单选题'}</Text>
          <Text style={styles.questionKnowledge}>
            {currentQuestion.knowledgePoint ?? '综合练习'}
          </Text>
        </View>
        <Text style={styles.questionText}>{currentQuestion.question}</Text>
      </EntranceView>

      <View style={styles.optionsList}>
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
      </View>

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
          <Text style={styles.feedbackAnswer}>正确答案：{answerText}</Text>
          {!!result.analysis && <Text style={styles.feedbackText}>{result.analysis}</Text>}
        </EntranceView>
      )}

      <EntranceView delay={result || submitting ? 0 : 160} distance={8}>
        <PrimaryAction
          disabled={submitting}
          onPress={result ? nextQuestion : submitAnswer}
        >
          {submitting ? '正在判分…' : result ? '下一题' : '确认答案'}
        </PrimaryAction>
      </EntranceView>
    </ScreenContainer>
  );
}

export function WrongScreen({ dashboard, onNavigate, preview = false }: ScreenProps) {
  const [wrongQuestions, setWrongQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(!preview);

  useEffect(() => {
    if (preview) {
      setWrongQuestions([
        { ...previewQuestion, wrongCount: 3 },
        {
          ...previewQuestion,
          id: 'mobile-preview-question-2',
          question: 'HTTP 方法中，哪一个通常用于获取资源？',
          options: { A: 'GET', B: 'POST', C: 'PATCH', D: 'DELETE' },
          wrongCount: 1,
        },
      ]);
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    mobileApi
      .wrong()
      .then((items) => {
        if (mounted) setWrongQuestions(items);
      })
      .catch(() => {
        if (mounted) setWrongQuestions([]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [preview]);

  const wrongCount = dashboard?.wrongCount ?? wrongQuestions.length;

  return (
    <ScreenContainer>
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
      <EntranceView delay={230} distance={18} style={styles.listCard}>
        {loading ? (
          <View style={styles.listLoading}>
            <ActivityIndicator color={colors.brand} />
            <Text style={styles.loadingText}>正在同步错题…</Text>
          </View>
        ) : wrongQuestions.length ? (
          wrongQuestions.slice(0, 6).map((question) => (
            <ListRow
              key={question.id}
              onPress={() =>
                onNavigate('practice', {
                  practiceSource: 'wrong',
                  practiceMode: 'sequential',
                })
              }
              title={question.question}
              meta={`${question.chapter ?? '综合练习'} · ${question.wrongCount ?? 1} 次错误`}
            />
          ))
        ) : (
          <Text style={styles.emptyListText}>太好了，当前还没有错题。</Text>
        )}
      </EntranceView>
    </ScreenContainer>
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

export function ProfileScreen({ onLogout, user }: ScreenProps) {
  return (
    <ScreenContainer>
      <ScreenHeader eyebrow="我的考匠" title="把学习设置好" />
      <EntranceView delay={60} distance={16} style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>考</Text>
        </View>
        <View>
          <Text style={styles.profileName}>{user?.username ?? '未登录用户'}</Text>
          <Text style={styles.profileMeta}>
            {user ? '账号已连接，学习记录会同步' : '登录后同步学习记录'}
          </Text>
        </View>
      </EntranceView>
      <EntranceView delay={130} distance={16} style={styles.settingsCard}>
        <SettingRow title="证书与题库" value={user ? '已同步' : '预览模式'} />
        <SettingRow title="AI 学习助手" value="按账号配置" />
        <SettingRow title="服务器地址" value="aceexam.top" />
        <SettingRow title="关于考匠" value="移动端 v0.1.1" />
      </EntranceView>
      <EntranceView delay={240} distance={8} style={styles.mutedNotice}>
        <Text style={styles.mutedNoticeText}>AI Key 仍然只保存于对应用户的后端设置，不会写入 App。</Text>
      </EntranceView>
      {onLogout && (
        <EntranceView delay={300} distance={8}>
          <AnimatedPressable onPress={onLogout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>{user ? '退出登录' : '退出预览'}</Text>
          </AnimatedPressable>
        </EntranceView>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    backgroundColor: colors.background,
    flexGrow: 1,
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
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
  disabledAction: {
    opacity: 0.55,
  },
  primaryActionText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
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
    borderRadius: radius.lg,
    gap: spacing.md,
    padding: spacing.lg,
    ...shadow.card,
  },
  questionMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
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
    paddingVertical: 6,
  },
  questionKnowledge: {
    color: colors.textMuted,
    flexShrink: 1,
    fontSize: 12,
  },
  questionText: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 31,
  },
  optionsList: {
    gap: spacing.sm,
  },
  questionOption: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...shadow.card,
  },
  selectedOption: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.brand,
  },
  correctOption: {
    backgroundColor: '#ECF8F0',
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
    height: 32,
    justifyContent: 'center',
    width: 32,
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
    fontSize: 14,
    fontWeight: '800',
  },
  questionOptionText: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  optionStatus: {
    color: colors.brand,
    fontSize: 22,
    fontWeight: '800',
  },
  formError: {
    color: colors.warning,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  feedbackGood: {
    backgroundColor: '#ECF8F0',
    borderColor: '#B9DEC5',
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 5,
    padding: spacing.md,
  },
  feedbackBad: {
    backgroundColor: colors.warningSoft,
    borderColor: '#F0C8C3',
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 5,
    padding: spacing.md,
  },
  feedbackPending: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  feedbackPendingText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  feedbackTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  feedbackAnswer: {
    color: colors.brandDark,
    fontSize: 14,
    fontWeight: '700',
  },
  feedbackText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 22,
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
    borderColor: '#F2D7D3',
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
    color: '#96645F',
    fontSize: 14,
    marginTop: 2,
  },
  wrongEmoji: {
    color: colors.warning,
    fontSize: 54,
    fontWeight: '300',
    transform: [{ rotate: '-35deg' }],
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
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    ...shadow.card,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.brandSoft,
    borderRadius: radius.pill,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  avatarText: {
    color: colors.brand,
    fontSize: 25,
    fontWeight: '800',
  },
  profileName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  profileMeta: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  settingsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    ...shadow.card,
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
  logoutButton: {
    alignItems: 'center',
    borderColor: '#F2D7D3',
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
});

function SettingRow({ title, value }: { title: string; value: string }) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingTitle}>{title}</Text>
      <Text style={styles.settingValue}>{value}</Text>
    </View>
  );
}
