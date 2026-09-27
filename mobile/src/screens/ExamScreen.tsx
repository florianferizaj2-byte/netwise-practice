import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Modal,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { mobileApi, type ExamSession, type Question } from "../api/client";
import { useCachedQuery } from "../api/useCachedQuery";
import { useScreenActive } from "../navigation/ScreenActivity";
import { AnimatedPressable, AnimatedProgressBar } from "../components/Motion";
import { QuestionImages } from "../components/QuestionImages";
import { useTheme, useThemedStyles, type ThemeColors } from "../theme";
import type { AppTab, NavigationOptions } from "../types";

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const date = (value: string) =>
  new Date(value).toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
const typeName = (question: Question) =>
  question.type === "multiple_choice"
    ? "多选题"
    : question.type === "true_false"
      ? "判断题"
      : "单选题";
const previewChapters = [
  { name: "计算机基础知识", questionCount: 86 },
  { name: "网络体系结构与 TCP/IP", questionCount: 382 },
  { name: "局域网与交换技术", questionCount: 136 },
  { name: "路由与广域网技术", questionCount: 153 },
];

export function ExamScreen({
  preview = false,
  onNavigate,
}: {
  preview?: boolean;
  onNavigate: (tab: AppTab, options?: NavigationOptions) => void;
}) {
  const s = useThemedStyles(styles),
    { colors } = useTheme(),
    active = useScreenActive();
  const [exam, setExam] = useState<ExamSession | null>(null);
  const examRef = useRef(exam);
  examRef.current = exam;
  const catalog = useCachedQuery(
    "/exams/catalog",
    mobileApi.examCatalog,
    !preview && !exam,
  );
  const history = useCachedQuery("/exams", mobileApi.exams, !preview && !exam);
  const chapters = preview ? previewChapters : catalog.data?.chapters || [];
  const [selection, setSelection] = useState<string[]>([]),
    [count, setCount] = useState(30);
  const [answers, setAnswers] = useState<Record<string, string[]>>({}),
    answersRef = useRef(answers);
  const [index, setIndex] = useState(0),
    [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false),
    busyRef = useRef(false);
  const [error, setError] = useState(""),
    [saveState, setSaveState] = useState<
      "saved" | "saving" | "error" | "expired"
    >("saved");
  const [cardOpen, setCardOpen] = useState(false),
    [confirmOpen, setConfirmOpen] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null),
    [allHistory, setAllHistory] = useState(false);
  const mounted = useRef(true),
    saveChain = useRef<Promise<void>>(Promise.resolve());
  const revision = useRef(0),
    savedRevision = useRef(0),
    autoSubmitted = useRef<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (catalog.data)
      setSelection((current) =>
        current.filter((name) =>
          catalog.data!.chapters.some((chapter) => chapter.name === name),
        ),
      );
  }, [catalog.data]);
  const available = chapters
    .filter((chapter) => selection.includes(chapter.name))
    .reduce((sum, chapter) => sum + chapter.questionCount, 0);
  const expectedCount = Math.min(count, available);
  const completed = Object.values(answers).filter(
    (answer) => answer.length,
  ).length;
  const result = exam?.result;
  const breakdown = useMemo(() => {
    const groups = new Map<
      string,
      { name: string; total: number; correct: number }
    >();
    for (const item of result?.results || []) {
      const name = item.chapter || "综合知识",
        group = groups.get(name) || { name, total: 0, correct: 0 };
      group.total++;
      if (item.correct) group.correct++;
      groups.set(name, group);
    }
    return [...groups.values()].sort(
      (a, b) => a.correct / a.total - b.correct / b.total,
    );
  }, [result]);

  function enter(next: ExamSession) {
    examRef.current = next;
    setExam(next);
    answersRef.current = next.answers || {};
    setAnswers(answersRef.current);
    revision.current = 0;
    savedRevision.current = 0;
    saveChain.current = Promise.resolve();
    setIndex(
      Math.max(
        0,
        next.questions.findIndex(
          (question) => !next.answers?.[question.id]?.length,
        ),
      ),
    );
    setRemaining(
      Math.max(0, Math.ceil((Date.parse(next.expiresAt) - Date.now()) / 1000)),
    );
    setSaveState("saved");
    setError("");
    setReviewId(null);
    autoSubmitted.current = null;
  }
  async function open(id?: string) {
    if (busyRef.current) return;
    if (preview) {
      Alert.alert(
        "登录后考试",
        "选择题库并登录账号，即可保存试卷、作答与考试成绩。",
      );
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const next = id
        ? await mobileApi.exam(id)
        : await mobileApi.createExam(selection, count);
      if (mounted.current) enter(next);
    } catch (cause) {
      if (mounted.current)
        setError(cause instanceof Error ? cause.message : "试卷暂时无法加载");
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function save() {
    const current = examRef.current;
    if (!current || current.submitted) return saveChain.current;
    const snapshot = answersRef.current,
      version = revision.current;
    setSaveState("saving");
    saveChain.current = saveChain.current
      .catch(() => undefined)
      .then(async () => {
        if (
          !mounted.current ||
          examRef.current?.id !== current.id ||
          examRef.current.submitted ||
          version < revision.current
        )
          return;
        const response = await mobileApi.saveExamAnswers(current.id, snapshot);
        if (!mounted.current || examRef.current?.id !== current.id) return;
        if (response.expired) {
          setSaveState("expired");
          return;
        }
        savedRevision.current = Math.max(savedRevision.current, version);
        if (version === revision.current) setSaveState("saved");
      })
      .catch(() => {
        if (mounted.current && examRef.current?.id === current.id)
          setSaveState("error");
      });
    return saveChain.current;
  }
  function choose(letter: string) {
    const current = examRef.current,
      question = current?.questions[index];
    if (
      !current ||
      !question ||
      current.submitted ||
      busyRef.current ||
      Date.now() >= Date.parse(current.expiresAt)
    )
      return;
    const previous = answersRef.current[question.id] || [];
    const selected =
      question.type === "multiple_choice"
        ? previous.includes(letter)
          ? previous.filter((item) => item !== letter)
          : [...previous, letter]
        : [letter];
    answersRef.current = { ...answersRef.current, [question.id]: selected };
    revision.current++;
    setAnswers(answersRef.current);
    void save();
  }
  async function submit() {
    const current = examRef.current;
    if (!current || current.submitted || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setConfirmOpen(false);
    setError("");
    try {
      await saveChain.current;
      const nextResult = await mobileApi.submitExam(
        current.id,
        answersRef.current,
      );
      if (!mounted.current || examRef.current?.id !== current.id) return;
      const next = {
        ...current,
        submitted: true,
        result: nextResult,
        answers: answersRef.current,
      };
      examRef.current = next;
      setExam(next);
      setCardOpen(false);
      setSaveState("saved");
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "交卷失败，请保持网络连接后重试",
        );
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function leave() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      if (!examRef.current?.submitted) {
        await saveChain.current;
        if (savedRevision.current < revision.current) await save();
        if (
          savedRevision.current < revision.current &&
          examRef.current &&
          Date.now() < Date.parse(examRef.current.expiresAt)
        ) {
          if (mounted.current)
            setError("有答案尚未保存，请联网后点击“重试保存”。");
          return;
        }
      }
      if (!mounted.current) return;
      examRef.current = null;
      setExam(null);
      setError("");
      setCardOpen(false);
      setConfirmOpen(false);
      void history.refresh();
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (!active || !exam || exam.submitted) return;
    const tick = () => {
      const seconds = Math.max(
        0,
        Math.ceil((Date.parse(exam.expiresAt) - Date.now()) / 1000),
      );
      setRemaining(seconds);
      if (!seconds && autoSubmitted.current !== exam.id && !busyRef.current) {
        autoSubmitted.current = exam.id;
        void submit();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [active, exam?.id, exam?.submitted]);
  useEffect(() => {
    if (!active || !exam) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        void leave();
        return true;
      },
    );
    return () => subscription.remove();
  }, [active, exam?.id, exam?.submitted]);

  if (!exam)
    return (
      <View style={s.flex}>
        <ScrollView
          contentContainerStyle={s.page}
          showsVerticalScrollIndicator={false}
          refreshControl={
            preview ? undefined : (
              <RefreshControl
                refreshing={!!(catalog.fetching && catalog.data)}
                onRefresh={() => {
                  void catalog.refresh();
                  void history.refresh();
                }}
              />
            )
          }
        >
          <Text style={s.kicker}>模拟考试</Text>
          <Text style={s.title}>按知识点，组一场考试</Text>
          <Text style={s.subtitle}>多选大知识点，检验真正掌握了多少。</Text>
          {(error || catalog.error) && (
            <Text style={s.error}>
              {error || catalog.error?.message} · 可下拉重试
            </Text>
          )}
          {!!history.data?.sessions.some((item) => !item.submitted) && (
            <View style={s.resume}>
              <Text style={s.sectionTitle}>有一场考试等你继续</Text>
              {history.data.sessions
                .filter((item) => !item.submitted)
                .slice(0, 1)
                .map((item) => (
                  <AnimatedPressable
                    key={item.id}
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => void open(item.id)}
                    style={s.historyRow}
                  >
                    <View style={s.flex}>
                      <Text style={s.rowTitle} numberOfLines={1}>
                        {item.chapters.join(" / ")}
                      </Text>
                      <Text style={s.meta}>
                        已答 {item.answeredCount} / {item.count} 题 ·{" "}
                        {Date.parse(item.expiresAt) <= Date.now()
                          ? "时间已到，查看交卷"
                          : "继续计时中"}
                      </Text>
                    </View>
                    <Text style={s.link}>继续 ›</Text>
                  </AnimatedPressable>
                ))}
            </View>
          )}
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>考试题量</Text>
            <Text style={s.meta}>每题约 2 分钟</Text>
          </View>
          <View style={s.quantityRow}>
            {[10, 20, 30, 50].map((value) => (
              <AnimatedPressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: count === value }}
                onPress={() => setCount(value)}
                style={[s.quantity, count === value && s.selected]}
              >
                <Text
                  style={[s.quantityText, count === value && s.selectedText]}
                >
                  {value} 题
                </Text>
              </AnimatedPressable>
            ))}
          </View>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>选择大知识点</Text>
            <AnimatedPressable
              accessibilityRole="button"
              disabled={!chapters.length}
              onPress={() =>
                setSelection(
                  selection.length === chapters.length
                    ? []
                    : chapters.map((chapter) => chapter.name),
                )
              }
            >
              <Text style={s.link}>
                {selection.length === chapters.length && chapters.length
                  ? "取消全选"
                  : "全选"}
              </Text>
            </AnimatedPressable>
          </View>
          {catalog.loading && !preview ? (
            <ActivityIndicator color={colors.brand} />
          ) : (
            chapters.map((chapter) => {
              const checked = selection.includes(chapter.name);
              return (
                <AnimatedPressable
                  key={chapter.name}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  onPress={() =>
                    setSelection((current) =>
                      checked
                        ? current.filter((name) => name !== chapter.name)
                        : [...current, chapter.name],
                    )
                  }
                  style={[s.chapter, checked && s.chapterSelected]}
                >
                  <View style={[s.checkbox, checked && s.checkboxSelected]}>
                    {checked && <Text style={s.check}>✓</Text>}
                  </View>
                  <View style={s.flex}>
                    <Text style={s.rowTitle}>{chapter.name}</Text>
                    <Text style={s.meta}>
                      {chapter.questionCount} 道可考题目
                    </Text>
                  </View>
                </AnimatedPressable>
              );
            })
          )}
          {!catalog.loading && !chapters.length && (
            <Text style={s.empty}>当前题库没有可用于考试的客观题。</Text>
          )}
          <Text style={s.footnote}>
            从所选范围组合试卷，不重复抽题。题量不足时使用现有题目，共用材料题会保留完整题组，实际数量以试卷为准。
          </Text>
          {!!history.error && (
            <Text style={s.error}>考试记录暂未同步，下拉可重试。</Text>
          )}
          {!!history.data?.sessions.length && (
            <>
              <View style={s.sectionHead}>
                <Text style={s.sectionTitle}>最近考试</Text>
                {history.data.sessions.length > 3 && (
                  <AnimatedPressable
                    accessibilityRole="button"
                    onPress={() => setAllHistory(!allHistory)}
                  >
                    <Text style={s.link}>
                      {allHistory ? "收起" : "全部记录"}
                    </Text>
                  </AnimatedPressable>
                )}
              </View>
              {(allHistory
                ? history.data.sessions
                : history.data.sessions.slice(0, 3)
              ).map((item) => (
                <AnimatedPressable
                  key={item.id}
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => void open(item.id)}
                  style={s.historyRow}
                >
                  <View style={s.flex}>
                    <Text style={s.rowTitle} numberOfLines={1}>
                      {item.chapters.join(" / ")}
                    </Text>
                    <Text style={s.meta}>
                      {date(item.createdAt)} · {item.count} 题
                    </Text>
                  </View>
                  <Text style={s.historyScore}>
                    {item.submitted
                      ? `${item.score} / ${item.maxScore}`
                      : "继续 ›"}
                  </Text>
                </AnimatedPressable>
              ))}
            </>
          )}
        </ScrollView>
        <View style={s.setupFooter}>
          <Text style={s.footerHint}>
            {selection.length
              ? `已选 ${selection.length} 个知识点 · 预计 ${expectedCount} 题 / ${expectedCount * 2} 分钟`
              : "选择知识点后即可开始"}
            {count < selection.length ? "\n请增加题量，覆盖所有已选知识点" : ""}
          </Text>
          <AnimatedPressable
            accessibilityRole="button"
            disabled={!expectedCount || busy || count < selection.length}
            onPress={() => void open()}
            style={[
              s.primary,
              (!expectedCount || busy || count < selection.length) &&
                s.disabled,
            ]}
          >
            {busy ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={s.primaryText}>组合试卷，开始考试 →</Text>
            )}
          </AnimatedPressable>
        </View>
      </View>
    );

  if (result)
    return (
      <ScrollView
        contentContainerStyle={s.page}
        showsVerticalScrollIndicator={false}
      >
        <AnimatedPressable
          accessibilityRole="button"
          onPress={() => void leave()}
          style={s.back}
        >
          <Text style={s.link}>‹ 返回考试</Text>
        </AnimatedPressable>
        <Text style={s.kicker}>考试完成</Text>
        <Text style={s.title}>让每次检验都有收获</Text>
        <View style={s.resultScore}>
          <Text style={s.score}>
            {result.score}
            <Text style={s.scoreUnit}> / {result.maxScore}</Text>
          </Text>
          <Text style={s.subtitle}>
            答对 {result.results.filter((item) => item.correct).length} /{" "}
            {result.results.length} 题 · 用时{" "}
            {clock(Math.round(result.elapsed / 1000))}
          </Text>
        </View>
        <Text style={s.sectionTitle}>知识点表现</Text>
        {breakdown.map((group) => (
          <View key={group.name} style={s.breakdown}>
            <View style={s.sectionLine}>
              <Text style={s.rowTitle}>{group.name}</Text>
              <Text style={s.meta}>
                {group.correct} / {group.total} 正确
              </Text>
            </View>
            <AnimatedProgressBar
              value={(group.correct / group.total) * 100}
              color={
                group.correct / group.total < 0.6 ? colors.gold : colors.brand
              }
              trackColor={colors.border}
            />
          </View>
        ))}
        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>逐题回顾</Text>
          <Text style={s.meta}>点击展开解析</Text>
        </View>
        {result.results.map((item, questionIndex) => (
          <View key={item.questionId} style={s.reviewRow}>
            <AnimatedPressable
              accessibilityRole="button"
              onPress={() =>
                setReviewId(
                  reviewId === item.questionId ? null : item.questionId,
                )
              }
              style={s.reviewHeading}
            >
              <Text
                style={[
                  s.reviewMark,
                  { color: item.correct ? colors.brand : colors.warning },
                ]}
              >
                {item.correct ? "✓" : "×"}
              </Text>
              <Text
                style={[s.questionText, s.flex]}
                numberOfLines={reviewId === item.questionId ? undefined : 2}
              >
                {questionIndex + 1}. {item.question}
              </Text>
            </AnimatedPressable>
            {reviewId === item.questionId && (
              <View style={s.reviewDetail}>
                {!!item.sharedStem && (
                  <Text style={s.sharedStem}>{item.sharedStem}</Text>
                )}
                <QuestionImages question={item} />
                {Object.entries(item.options || {}).map(([key, text]) => (
                  <Text key={key} style={s.explanation}>
                    {key}. {text}
                  </Text>
                ))}
                <Text style={s.answerLabel}>
                  你的答案：{item.selected.join("、") || "未作答"}　正确答案：
                  {item.answer.join("、")}
                </Text>
                <Text style={s.explanation}>
                  {item.analysis || "这道题暂未提供文字解析。"}
                </Text>
              </View>
            )}
          </View>
        ))}
        <AnimatedPressable
          accessibilityRole="button"
          onPress={() => onNavigate("wrong")}
          style={s.primary}
        >
          <Text style={s.primaryText}>去错题页巩固 →</Text>
        </AnimatedPressable>
      </ScrollView>
    );

  const question = exam.questions[index],
    selected = answers[question.id] || [];
  return (
    <View style={s.flex}>
      <View style={s.examHeader}>
        <AnimatedPressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void leave()}
        >
          <Text style={s.link}>‹ 暂存退出</Text>
        </AnimatedPressable>
        <Text style={[s.timer, remaining < 300 && { color: colors.warning }]}>
          {clock(remaining)}
        </Text>
        <AnimatedPressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => setConfirmOpen(true)}
        >
          <Text style={s.link}>交卷</Text>
        </AnimatedPressable>
      </View>
      <View style={s.examStatus}>
        <Text style={s.meta}>
          已答 {completed} / {exam.questions.length}
        </Text>
        <AnimatedPressable
          accessibilityRole="button"
          onPress={() => setCardOpen(true)}
        >
          <Text style={s.link}>答题卡 ›</Text>
        </AnimatedPressable>
      </View>
      <View style={s.progress}>
        <AnimatedProgressBar
          value={(completed / exam.questions.length) * 100}
          color={colors.brand}
          trackColor={colors.border}
        />
      </View>
      <ScrollView
        key={question.id}
        contentContainerStyle={s.questionPage}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.kicker}>
          {question.chapter} · {typeName(question)}
        </Text>
        {!!question.sharedStem && (
          <Text style={s.sharedStem}>{question.sharedStem}</Text>
        )}
        <Text style={s.examQuestion}>
          {index + 1}. {question.question}
        </Text>
        <QuestionImages question={question} />
        {Object.entries(question.options).map(([letter, text]) => (
          <AnimatedPressable
            key={letter}
            accessibilityRole={
              question.type === "multiple_choice" ? "checkbox" : "radio"
            }
            accessibilityState={{ checked: selected.includes(letter) }}
            disabled={busy || remaining === 0}
            onPress={() => choose(letter)}
            style={[s.option, selected.includes(letter) && s.optionSelected]}
          >
            <Text
              style={[
                s.optionLetter,
                selected.includes(letter) && s.selectedText,
              ]}
            >
              {letter}
            </Text>
            <Text style={s.optionText}>{text}</Text>
          </AnimatedPressable>
        ))}
        <Text style={s.saveLabel}>
          {saveState === "saving"
            ? "正在保存答案…"
            : saveState === "error"
              ? "答案暂未同步，请保持网络连接"
              : saveState === "expired"
                ? "考试时间已到，以已保存答案交卷"
                : "答案已保存，交卷后显示解析"}
        </Text>
        {saveState === "error" && (
          <AnimatedPressable
            accessibilityRole="button"
            onPress={() => void save()}
          >
            <Text style={s.link}>重试保存</Text>
          </AnimatedPressable>
        )}
        {!!error && <Text style={s.error}>{error}</Text>}
        {remaining === 0 && !busy && (
          <AnimatedPressable
            accessibilityRole="button"
            onPress={() => void submit()}
            style={s.primary}
          >
            <Text style={s.primaryText}>重新提交试卷</Text>
          </AnimatedPressable>
        )}
      </ScrollView>
      <View style={s.examFooter}>
        <AnimatedPressable
          accessibilityRole="button"
          disabled={index === 0 || busy}
          onPress={() => setIndex(index - 1)}
          style={[s.secondary, (index === 0 || busy) && s.disabled]}
        >
          <Text style={s.secondaryText}>上一题</Text>
        </AnimatedPressable>
        <Text style={s.meta}>
          {index + 1} / {exam.questions.length}
        </Text>
        <AnimatedPressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() =>
            index < exam.questions.length - 1
              ? setIndex(index + 1)
              : setConfirmOpen(true)
          }
          style={[s.next, busy && s.disabled]}
        >
          {busy ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={s.primaryText}>
              {index < exam.questions.length - 1 ? "下一题" : "检查并交卷"}
            </Text>
          )}
        </AnimatedPressable>
      </View>
      <Modal
        visible={cardOpen || confirmOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setCardOpen(false);
          setConfirmOpen(false);
        }}
      >
        <SafeAreaView style={s.modalBackdrop}>
          <View style={s.sheet}>
            <View style={s.sectionLine}>
              <Text style={s.sectionTitle}>
                {confirmOpen ? "确认交卷" : "答题卡"}
              </Text>
              <AnimatedPressable
                accessibilityRole="button"
                accessibilityLabel="关闭答题卡"
                onPress={() => {
                  setCardOpen(false);
                  setConfirmOpen(false);
                }}
                style={s.close}
              >
                <Text style={s.link}>关闭 ×</Text>
              </AnimatedPressable>
            </View>
            {confirmOpen ? (
              <>
                <Text style={s.confirmText}>
                  {completed === exam.questions.length
                    ? "所有题目已作答，交卷后查看成绩与解析。"
                    : `还有 ${exam.questions.length - completed} 道题未作答，未答题将按错误计分。`}
                </Text>
                <AnimatedPressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => void submit()}
                  style={s.primary}
                >
                  <Text style={s.primaryText}>确认交卷</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  accessibilityRole="button"
                  onPress={() => {
                    setConfirmOpen(false);
                    setCardOpen(true);
                  }}
                  style={s.back}
                >
                  <Text style={s.link}>返回检查</Text>
                </AnimatedPressable>
              </>
            ) : (
              <ScrollView contentContainerStyle={s.grid}>
                {exam.questions.map((item, i) => (
                  <AnimatedPressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={`第${i + 1}题，${answers[item.id]?.length ? "已答" : "未答"}`}
                    onPress={() => {
                      setIndex(i);
                      setCardOpen(false);
                    }}
                    style={[
                      s.gridCell,
                      !!answers[item.id]?.length && s.gridAnswered,
                      index === i && s.gridCurrent,
                    ]}
                  >
                    <Text
                      style={[
                        s.gridText,
                        !!answers[item.id]?.length && s.selectedText,
                      ]}
                    >
                      {i + 1}
                    </Text>
                  </AnimatedPressable>
                ))}
              </ScrollView>
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    page: { padding: 22, paddingTop: 26, paddingBottom: 32 },
    kicker: { color: c.textMuted, fontSize: 12, marginBottom: 8 },
    title: { color: c.text, fontSize: 25, fontWeight: "800", lineHeight: 34 },
    subtitle: {
      color: c.textMuted,
      fontSize: 13,
      lineHeight: 21,
      marginTop: 8,
    },
    sectionHead: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 26,
      marginBottom: 13,
      gap: 8,
    },
    sectionLine: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
    },
    sectionTitle: { color: c.text, fontSize: 17, fontWeight: "700" },
    meta: { color: c.textMuted, fontSize: 12, lineHeight: 20 },
    link: { color: c.brand, fontSize: 13, paddingVertical: 9 },
    quantityRow: { flexDirection: "row", gap: 9 },
    quantity: {
      flex: 1,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 10,
    },
    quantityText: { color: c.textMuted, fontSize: 14 },
    selected: { borderColor: c.brand, backgroundColor: c.brandSoft },
    selectedText: { color: c.brandDark, fontWeight: "700" },
    chapter: {
      flexDirection: "row",
      alignItems: "center",
      gap: 13,
      paddingVertical: 16,
      paddingHorizontal: 13,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
      borderRadius: 9,
    },
    chapterSelected: { backgroundColor: c.surfaceMuted },
    checkbox: {
      width: 21,
      height: 21,
      borderColor: c.border,
      borderWidth: 1.5,
      borderRadius: 6,
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxSelected: { backgroundColor: c.brand, borderColor: c.brand },
    check: { color: c.white, fontSize: 14, fontWeight: "700" },
    rowTitle: {
      color: c.text,
      fontSize: 14,
      fontWeight: "600",
      flexShrink: 1,
      lineHeight: 22,
    },
    footnote: {
      color: c.textMuted,
      fontSize: 11,
      lineHeight: 19,
      marginTop: 17,
    },
    error: {
      color: c.warning,
      fontSize: 13,
      lineHeight: 21,
      marginVertical: 12,
    },
    empty: {
      color: c.textMuted,
      fontSize: 14,
      lineHeight: 24,
      marginVertical: 24,
    },
    resume: {
      backgroundColor: c.surfaceMuted,
      borderRadius: 14,
      padding: 15,
      marginTop: 22,
    },
    historyRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 14,
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    historyScore: { color: c.brand, fontSize: 15, fontWeight: "600" },
    setupFooter: {
      backgroundColor: c.surface,
      padding: 16,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    footerHint: {
      color: c.textMuted,
      fontSize: 12,
      textAlign: "center",
      marginBottom: 9,
      lineHeight: 19,
    },
    primary: {
      backgroundColor: c.brand,
      minHeight: 48,
      borderRadius: 12,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 18,
      marginTop: 8,
    },
    primaryText: { color: c.white, fontSize: 14, fontWeight: "700" },
    disabled: { opacity: 0.45 },
    examHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 21,
      paddingVertical: 8,
    },
    timer: {
      color: c.text,
      fontSize: 22,
      fontWeight: "700",
      fontVariant: ["tabular-nums"],
    },
    examStatus: {
      paddingHorizontal: 22,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    progress: { marginHorizontal: 22, marginBottom: 8 },
    questionPage: { padding: 22, paddingBottom: 28 },
    sharedStem: {
      color: c.textMuted,
      fontSize: 14,
      lineHeight: 23,
      backgroundColor: c.surfaceMuted,
      padding: 14,
      borderRadius: 10,
      marginBottom: 16,
    },
    examQuestion: {
      color: c.text,
      fontSize: 19,
      lineHeight: 30,
      fontWeight: "600",
      marginBottom: 22,
    },
    option: {
      flexDirection: "row",
      gap: 13,
      padding: 16,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      marginTop: 12,
      backgroundColor: c.surface,
    },
    optionSelected: { borderColor: c.brand, backgroundColor: c.surfaceMuted },
    optionLetter: { color: c.textMuted, fontSize: 16, fontWeight: "600" },
    optionText: { flex: 1, color: c.text, fontSize: 15, lineHeight: 23 },
    saveLabel: {
      color: c.textMuted,
      fontSize: 11,
      marginTop: 22,
      lineHeight: 19,
    },
    examFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      padding: 16,
      borderTopColor: c.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      backgroundColor: c.surface,
    },
    secondary: {
      minHeight: 44,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 17,
      justifyContent: "center",
    },
    secondaryText: { color: c.text, fontSize: 13 },
    next: {
      minHeight: 44,
      minWidth: 100,
      borderRadius: 10,
      backgroundColor: c.brand,
      paddingHorizontal: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    modalBackdrop: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "#00000066",
    },
    sheet: {
      padding: 22,
      backgroundColor: c.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      maxHeight: "75%",
    },
    close: { paddingHorizontal: 7 },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
      paddingVertical: 18,
    },
    gridCell: {
      width: 44,
      height: 44,
      borderRadius: 10,
      backgroundColor: c.background,
      borderColor: c.border,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    gridAnswered: { backgroundColor: c.brandSoft },
    gridCurrent: { borderColor: c.brand, borderWidth: 2 },
    gridText: { color: c.text, fontSize: 14 },
    confirmText: {
      color: c.textMuted,
      lineHeight: 24,
      fontSize: 14,
      marginVertical: 15,
    },
    back: { paddingVertical: 9, alignItems: "flex-start" },
    resultScore: {
      paddingVertical: 24,
      marginBottom: 17,
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    score: {
      color: c.brand,
      fontSize: 54,
      fontWeight: "700",
      letterSpacing: -1.5,
    },
    scoreUnit: { color: c.textMuted, fontSize: 19, fontWeight: "400" },
    breakdown: { gap: 9, paddingVertical: 13 },
    reviewRow: {
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      paddingVertical: 15,
    },
    reviewHeading: { flexDirection: "row", gap: 12 },
    reviewMark: { fontSize: 21, fontWeight: "700", width: 18 },
    questionText: { color: c.text, fontSize: 14, lineHeight: 23 },
    reviewDetail: { paddingTop: 15, gap: 8 },
    answerLabel: { color: c.brandDark, fontSize: 13, lineHeight: 22 },
    explanation: { color: c.textMuted, fontSize: 13, lineHeight: 22 },
  });
