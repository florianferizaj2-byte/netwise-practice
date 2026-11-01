import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { locationLearningApi as mobileApi } from "../api/locationLearning.android";
import type {
  LocationLearningSession,
  LocationLearningStatus,
} from "../api/locationLearningTypes";
import { studyRequestId } from "../api/studyTypes";
import { AnimatedPressable } from "../components/Motion";
import { QuestionImages } from "../components/QuestionImages";
import { SafeAreaView } from "../components/SafeArea";
import { AppAlert } from "../components/AppAlert";
import { useAppActive, useScreenActive } from "../navigation/ScreenActivity";
import { useThemedStyles, type ThemeColors } from "../theme";

export function LocationLearningGate({
  visible,
  onClose,
  onEnter,
}: {
  visible: boolean;
  onClose: () => void;
  onEnter: () => Promise<void>;
}) {
  const s = useThemedStyles(styles),
    appActive = useAppActive(),
    screenActive = useScreenActive();
  const [data, setData] = useState<LocationLearningStatus | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [search, setSearch] = useState(""),
    [retry, setRetry] = useState(0),
    [presenceError, setPresenceError] = useState(false),
    [documentActive, setDocumentActive] = useState(true);
  const alive = useRef(true),
    requestBusy = useRef(false);
  const scroll = useRef<ScrollView>(null),
    questionReading = useRef<View>(null),
    analysisReading = useRef<View>(null),
    scrollOffset = useRef(0);
  const [readingVisible, setReadingVisible] = useState(false),
    { height: windowHeight } = useWindowDimensions();
  const session = data?.session,
    currentQuestion = session?.question;
  const apply = (next: LocationLearningStatus) => {
    if (!alive.current) return;
    setData((previous) =>
      previous?.session &&
      next.session &&
      previous.session.id === next.session.id &&
      previous.session.version > next.session.version
        ? previous
        : { ...next, points: next.points ?? previous?.points },
    );
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const changed = () => setDocumentActive(!document.hidden);
    changed();
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);
  useEffect(() => {
    if (!visible) {
      setData(null);
      setSelected([]);
      return;
    }
    let live = true;
    setLoading(true);
    setError("");
    mobileApi
      .locationLearningStatus()
      .then((next) => {
        if (live) apply(next);
      })
      .catch((cause) => {
        if (live) setError(cause.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [visible, retry]);
  useEffect(() => {
    setSelected([]);
    setPresenceError(false);
  }, [session?.id, currentQuestion?.id, session?.phase]);
  useEffect(() => {
    setReadingVisible(false);
    if (!visible || session?.state !== "active") return;
    let live = true;
    if (session.phase === "answer")
      scroll.current?.scrollTo({ y: 0, animated: false });
    else
      analysisReading.current?.measureInWindow((_x, y) =>
        scroll.current?.scrollTo({
          y: Math.max(0, scrollOffset.current + y - 90),
          animated: false,
        }),
      );
    const measure = () => {
      const target =
        session.phase === "answer"
          ? questionReading.current
          : analysisReading.current;
      target?.measureInWindow((_x, y, _width, height) => {
        const overlap = Math.max(
          0,
          Math.min(y + height, windowHeight) - Math.max(y, 70),
        );
        if (live && alive.current)
          setReadingVisible(height > 0 && overlap >= Math.min(60, height));
      });
    };
    measure();
    const timer = setInterval(measure, 500);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [visible, session?.id, currentQuestion?.id, session?.phase, windowHeight]);
  useEffect(() => {
    if (
      !visible ||
      !appActive ||
      !screenActive ||
      !documentActive ||
      !readingVisible ||
      !session ||
      session.state !== "active" ||
      !currentQuestion ||
      presenceError
    )
      return;
    let live = true,
      pending = false;
    let sequence = 0;
    const controller = new AbortController(),
      leaseId = studyRequestId(),
      snapshot = session;
    const body = {
      questionId: currentQuestion.id,
      challenge: snapshot.challenge,
      phase: snapshot.phase,
      leaseId,
    };
    const fail = (cause: Error) => {
      if (live && !controller.signal.aborted) {
        setError(cause.message);
        setPresenceError(true);
      }
    };
    const pulse = async () => {
      if (!live || pending) return;
      pending = true;
      try {
        const next = await mobileApi.locationLearningAction(
          snapshot.id,
          "pulse",
          { ...body, sequence: sequence + 1 },
          controller.signal,
        );
        if (live) {
          sequence++;
          apply(next);
        }
      } catch (cause) {
        fail(cause as Error);
      } finally {
        pending = false;
      }
    };
    let timer: ReturnType<typeof setInterval> | undefined;
    void mobileApi
      .locationLearningAction(snapshot.id, "present", body, controller.signal)
      .then((next) => {
        if (live) {
          apply(next);
          timer = setInterval(
            () => void pulse(),
            data?.policy.pulseIntervalMs || 1000,
          );
        }
      })
      .catch(fail);
    return () => {
      live = false;
      controller.abort();
      if (timer) clearInterval(timer);
      void mobileApi
        .locationLearningAction(snapshot.id, "pause", { leaseId })
        .catch(() => undefined);
    };
  }, [
    visible,
    appActive,
    screenActive,
    documentActive,
    readingVisible,
    session?.id,
    currentQuestion?.id,
    session?.phase,
    session?.challenge,
    presenceError,
  ]);

  async function action(
    name: "start" | "answer" | "advance" | "cancel",
    pointId?: string,
  ) {
    if (requestBusy.current) return;
    requestBusy.current = true;
    setBusy(true);
    setError("");
    try {
      const current = session;
      const next =
        name === "start"
          ? await mobileApi.startLocationLearning(pointId!)
          : await mobileApi.locationLearningAction(
              current!.id,
              name,
              name === "cancel"
                ? {}
                : {
                    questionId: current!.question!.id,
                    challenge: current!.challenge,
                    ...(name === "answer" ? { selected } : {}),
                  },
            );
      apply(next);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      requestBusy.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const remaining = session
    ? Math.max(0, Math.ceil((session.requiredMs - session.activeMs) / 1000))
    : 0;
  const points = (data?.points || []).filter(
    (point) =>
      !search.trim() ||
      [point.name, point.chapter, point.section].some((value) =>
        value.toLowerCase().includes(search.trim().toLowerCase()),
      ),
  );
  function choose(key: string) {
    if (session?.phase !== "answer" || busy) return;
    setSelected((previous) =>
      currentQuestion?.type === "multiple_choice"
        ? previous.includes(key)
          ? previous.filter((item) => item !== key)
          : [...previous, key]
        : [key],
    );
  }
  function close() {
    if (busy) return;
    if (session?.state === "active")
      AppAlert.alert(
        "暂时退出专项学习？",
        "已提交的作答和阅读进度会保留；今天完成 30 道后再进入该功能。",
        [
          { text: "继续刷题", style: "cancel" },
          { text: "暂时退出", onPress: onClose },
        ],
      );
    else onClose();
  }
  return (
    <Modal
      visible={visible && screenActive}
      animationType="slide"
      onRequestClose={close}
    >
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel="退出专项学习"
            disabled={busy}
            onPress={close}
            style={s.headerAction}
          >
            <Text style={s.link}>‹ 返回练习</Text>
          </AnimatedPressable>
          <Text style={s.headerTitle}>先学习，再进入</Text>
          <Text style={s.day}>{data?.day?.slice(5) || ""}</Text>
        </View>
        <ScrollView
          testID="location-learning-scroll"
          ref={scroll}
          onScroll={(event) => {
            scrollOffset.current = event.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={80}
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
        >
          {!!error && (
            <View accessibilityRole="alert" style={s.error}>
              <Text style={s.errorText}>{error}</Text>
              <AnimatedPressable
                accessibilityRole="button"
                onPress={() => {
                  setPresenceError(false);
                  setRetry((value) => value + 1);
                }}
                style={s.secondary}
              >
                <Text style={s.link}>重新读取进度</Text>
              </AnimatedPressable>
            </View>
          )}
          {loading && !data ? (
            <ActivityIndicator accessibilityLabel="正在读取专项学习" />
          ) : data?.unlocked ? (
            <View style={s.card}>
              <Text style={s.kicker}>今日专项学习已完成</Text>
              <Text style={s.title}>已解锁模拟定位学习</Text>
              <Text style={s.body}>
                当前账号、当前证书今天可重复进入。次日需重新完成 30
                道；答错不影响解锁资格。
              </Text>
              <AnimatedPressable
                accessibilityRole="button"
                disabled={busy}
                style={s.primary}
                onPress={() => {
                  if (requestBusy.current) return;
                  requestBusy.current = true;
                  setBusy(true);
                  setError("");
                  void onEnter()
                    .then(onClose)
                    .catch((cause) => setError(cause.message))
                    .finally(() => {
                      requestBusy.current = false;
                      if (alive.current) setBusy(false);
                    });
                }}
              >
                <Text style={s.primaryText}>
                  {busy ? "正在核验资格…" : "进入模拟定位学习"}
                </Text>
              </AnimatedPressable>
            </View>
          ) : session?.state === "active" && currentQuestion ? (
            <>
              <View style={s.card}>
                <Text style={s.kicker}>
                  {session.point.chapter} · {session.point.section} ·{" "}
                  {session.point.name}
                </Text>
                <Text style={s.title}>
                  专项学习 {Math.min(session.completedCount + 1, 30)} / 30
                </Text>
                <Text style={s.body}>
                  已完成 {session.completedCount}{" "}
                  题；答错也可以完成，不设正确率门槛。
                </Text>
                <View style={s.track}>
                  <View
                    style={[
                      s.fill,
                      { width: `${(session.completedCount / 30) * 100}%` },
                    ]}
                  />
                </View>
              </View>
              <View style={s.card}>
                <Text style={s.kicker}>
                  {currentQuestion.type === "multiple_choice"
                    ? "多选题"
                    : currentQuestion.type === "true_false"
                      ? "判断题"
                      : "单选题"}
                </Text>
                {!!currentQuestion.sharedStem && (
                  <View style={s.material}>
                    <Text style={s.body}>{currentQuestion.sharedStem}</Text>
                  </View>
                )}
                <View
                  ref={questionReading}
                  collapsable={false}
                  style={s.reading}
                >
                  <QuestionImages question={currentQuestion} />
                  <Text style={s.question}>{currentQuestion.question}</Text>
                  {Object.entries(currentQuestion.options).map(
                    ([key, text]) => {
                      const checked =
                          session.phase === "review"
                            ? session.feedback?.selected.includes(key)
                            : selected.includes(key),
                        correct =
                          session.phase === "review" &&
                          session.feedback?.answer.includes(key);
                      return (
                        <AnimatedPressable
                          key={key}
                          accessibilityRole={
                            currentQuestion.type === "multiple_choice"
                              ? "checkbox"
                              : "radio"
                          }
                          accessibilityState={{
                            checked: !!checked,
                            disabled: session.phase === "review",
                          }}
                          accessibilityLabel={key + " " + text}
                          disabled={busy || session.phase === "review"}
                          onPress={() => choose(key)}
                          style={[
                            s.option,
                            checked && s.optionSelected,
                            correct && s.optionCorrect,
                          ]}
                        >
                          <Text
                            style={[s.optionKey, checked && s.selectedText]}
                          >
                            {key}
                          </Text>
                          <Text style={s.optionText}>{text}</Text>
                        </AnimatedPressable>
                      );
                    },
                  )}
                </View>
                {session.phase === "answer" ? (
                  <>
                    <Text style={s.hint}>
                      {!appActive || !documentActive
                        ? "切回前台后继续计时"
                        : remaining
                          ? `请先阅读题目，还需前台有效停留 ${remaining} 秒`
                          : "可以提交作答；答错后阅读解析也计入完成"}
                    </Text>
                    <AnimatedPressable
                      accessibilityRole="button"
                      disabled={
                        busy ||
                        remaining > 0 ||
                        !selected.length ||
                        presenceError
                      }
                      onPress={() => void action("answer")}
                      style={[
                        s.primary,
                        (busy ||
                          remaining > 0 ||
                          !selected.length ||
                          presenceError) &&
                          s.disabled,
                      ]}
                    >
                      <Text style={s.primaryText}>
                        {busy ? "正在提交…" : "提交本题"}
                      </Text>
                    </AnimatedPressable>
                  </>
                ) : (
                  session.feedback && (
                    <View style={s.feedback}>
                      <Text style={s.feedbackTitle}>
                        {session.feedback.correct
                          ? "本题答对了"
                          : "本题答错了，阅读解析也算完成"}
                      </Text>
                      <Text style={s.body}>
                        正确答案：{session.feedback.answer.join("、")}
                      </Text>
                      <View ref={analysisReading} collapsable={false}>
                        <Text selectable style={s.analysis}>
                          {session.feedback.analysis}
                        </Text>
                      </View>
                      <Text style={s.hint}>
                        {remaining
                          ? `请对照答案阅读解析，还需前台有效停留 ${remaining} 秒`
                          : "无需重答或达到正确率，确认阅读后即可继续"}
                      </Text>
                      <AnimatedPressable
                        accessibilityRole="button"
                        disabled={busy || remaining > 0 || presenceError}
                        onPress={() => void action("advance")}
                        style={[
                          s.primary,
                          (busy || remaining > 0 || presenceError) &&
                            s.disabled,
                        ]}
                      >
                        <Text style={s.primaryText}>
                          {session.completedCount === 29
                            ? "确认阅读，完成 30 题"
                            : "确认阅读，下一题"}
                        </Text>
                      </AnimatedPressable>
                    </View>
                  )
                )}
              </View>
              <AnimatedPressable
                accessibilityRole="button"
                disabled={busy}
                style={s.secondary}
                onPress={() =>
                  AppAlert.alert(
                    "重新选择知识点？",
                    "本轮进度将从 0 开始，已保存的普通学习记录仍保留。",
                    [
                      { text: "继续本轮", style: "cancel" },
                      {
                        text: "重新选择",
                        onPress: () => void action("cancel"),
                      },
                    ],
                  )
                }
              >
                <Text style={s.link}>重新选择知识点</Text>
              </AnimatedPressable>
            </>
          ) : data ? (
            <>
              <View style={s.card}>
                <Text style={s.kicker}>当前证书 · 每日专项学习</Text>
                <Text style={s.title}>选择一个知识点，抽取 30 道</Text>
                <Text style={s.body}>
                  不要求答对多少题。每题先阅读至少 1 秒；答错后阅读解析至少 3
                  秒。后台停留不计时，重复提交不加进度。
                </Text>
                <Text style={s.hint}>
                  只从当前证书抽取不重复、能即时判分并有解析的客观题；不足 30
                  道的知识点暂不能选择。
                </Text>
              </View>
              <TextInput
                accessibilityLabel="搜索专项学习知识点"
                placeholder="搜索知识点、章节或分类"
                value={search}
                onChangeText={setSearch}
                style={s.search}
                placeholderTextColor={s.placeholder.color}
              />
              {!points.length && (
                <Text style={s.body}>
                  没有符合条件的知识点，请换一个搜索词或切换证书。
                </Text>
              )}
              {points.map((point) => (
                <AnimatedPressable
                  key={point.id}
                  accessibilityRole="button"
                  accessibilityLabel={`选择${point.name}，${point.questionCount}道题${point.eligible ? "" : "，不足30道"}`}
                  disabled={busy || !point.eligible}
                  onPress={() => void action("start", point.id)}
                  style={[s.card, !point.eligible && s.disabled]}
                >
                  <Text style={s.kicker}>
                    {point.chapter}
                    {point.section ? " · " + point.section : ""}
                  </Text>
                  <Text style={s.pointName}>{point.name}</Text>
                  <Text style={s.body}>
                    {point.questionCount} 道可用客观题 ·{" "}
                    {point.eligible
                      ? "随机抽取 30 道"
                      : "题量或完整题组不足，暂不可选"}
                  </Text>
                  <Text style={s.link}>
                    {point.eligible ? "选择并开始 ›" : "请选其他知识点"}
                  </Text>
                </AnimatedPressable>
              ))}
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
const styles = (c: ThemeColors) =>
  StyleSheet.create({
    reading: { gap: 12 },
    safe: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    headerAction: { minHeight: 48, justifyContent: "center" },
    headerTitle: { fontSize: 15, fontWeight: "700", color: c.text },
    day: { fontSize: 12, color: c.textMuted, minWidth: 48 },
    content: { padding: 18, gap: 14, paddingBottom: 40 },
    card: {
      backgroundColor: c.surface,
      padding: 18,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 16,
      gap: 12,
    },
    kicker: { fontSize: 12, color: c.textMuted, lineHeight: 19 },
    title: { fontSize: 22, fontWeight: "700", color: c.text, lineHeight: 30 },
    body: { fontSize: 14, lineHeight: 23, color: c.textMuted },
    link: { fontSize: 14, color: c.brand, fontWeight: "600" },
    track: {
      height: 5,
      backgroundColor: c.surfaceMuted,
      borderRadius: 4,
      overflow: "hidden",
    },
    fill: { height: 5, backgroundColor: c.brand },
    material: { backgroundColor: c.surfaceMuted, padding: 12, borderRadius: 8 },
    question: {
      fontSize: 18,
      lineHeight: 29,
      fontWeight: "600",
      color: c.text,
    },
    option: {
      flexDirection: "row",
      gap: 12,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      padding: 14,
      minHeight: 52,
      alignItems: "center",
    },
    optionSelected: { borderColor: c.brand, backgroundColor: c.brandSoft },
    optionCorrect: { borderColor: c.success, backgroundColor: c.successSoft },
    optionKey: { fontWeight: "700", fontSize: 15, color: c.textMuted },
    optionText: { flex: 1, fontSize: 15, lineHeight: 24, color: c.text },
    selectedText: { color: c.brand },
    hint: { fontSize: 12, lineHeight: 20, color: c.textMuted },
    primary: {
      minHeight: 48,
      padding: 13,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.brand,
      borderRadius: 12,
    },
    primaryText: { fontSize: 15, color: c.white, fontWeight: "700" },
    secondary: {
      minHeight: 46,
      padding: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    disabled: { opacity: 0.48 },
    feedback: {
      gap: 12,
      paddingTop: 14,
      borderTopWidth: 1,
      borderColor: c.border,
    },
    feedbackTitle: { fontSize: 16, fontWeight: "700", color: c.text },
    analysis: { fontSize: 15, lineHeight: 26, color: c.text },
    search: {
      minHeight: 48,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      color: c.text,
      backgroundColor: c.surface,
    },
    pointName: { fontSize: 17, fontWeight: "700", color: c.text },
    placeholder: { color: c.textFaint },
    error: {
      backgroundColor: c.warningSoft,
      borderRadius: 12,
      padding: 14,
      gap: 8,
    },
    errorText: { fontSize: 14, lineHeight: 22, color: c.warning },
  });
