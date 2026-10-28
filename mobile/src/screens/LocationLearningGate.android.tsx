import { ExamQuestionCard, ExamAnswerGrid } from '../components/ExamQuestionCard.android';
import { practiceVoice } from '../practiceVoice';
import { playCorrectAnswerFeedback, stopAnswerFeedback } from '../answerFeedback';
import { mobileApi as practiceApi } from '../api/client';
import { useCallback, useEffect, useRef, useState } from "react";
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
import { AndroidModalSafeArea } from "../components/AndroidModalSafeArea.android";
import { AppIcon } from '../components/AppIcon';
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
  const [chapters, setChapters] = useState<string[]>([]);
  const [legacyPoint, setLegacyPoint] = useState<string | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const [instantFeedback, setInstantFeedback] = useState<LocationLearningSession['feedback']>(null);
  const feedbackCache = useRef(new Map<string, Awaited<ReturnType<typeof practiceApi.practiceFeedback>>>());
  const voiceVisible = useRef(false), voiceQuestion = useRef(''), sounded = useRef(new Set<string>());
  const requiredCount = data?.session?.total || data?.policy?.count || 10;
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
        : { ...next, points: next.points ?? previous?.points,
          session: next.session && previous?.session?.id === next.session.id ? {
            ...next.session,
            feedback: next.session.phase===previous.session.phase && next.session.question?.id===previous.session.question?.id ? previous.session.feedback : next.session.feedback,
            questions: next.session.questions ?? previous.session.questions,
            reviews: next.session.reviews ?? previous.session.reviews,
            question: next.session.question?.id === previous.session.question?.id ? previous.session.question : next.session.question,
          } : next.session },
    );
  };
  const voiceScope = 'location:' + data?.userId + ':' + data?.certificateId + ':' + session?.id;
  voiceVisible.current = !cardOpen && reviewIndex===null && visible && appActive && screenActive && session?.state === 'active' && !!currentQuestion;
  voiceQuestion.current = currentQuestion?.id || '';
  useEffect(() => {
    if (voiceVisible.current) practiceVoice.enter(voiceScope, () => voiceVisible.current);
    else stopAnswerFeedback();
    return () => stopAnswerFeedback();
  }, [visible, appActive, screenActive, cardOpen, reviewIndex, session?.state, !!currentQuestion, voiceScope]);
  useEffect(() => {
    setInstantFeedback(null); setReviewIndex(null);
    if (!visible || !currentQuestion || session?.phase !== 'answer') return;
    let current = true;
    void practiceApi.practiceFeedback(currentQuestion.id).then(feedback => {
      if (current) feedbackCache.current.set(currentQuestion.id, feedback);
    }).catch(() => {});
    return () => { current = false; };
  }, [visible, session?.id, currentQuestion?.id, session?.phase]);
  function soundAnswer(correct: boolean, questionId: string, challenge: string) {
    const id = voiceScope + ':' + questionId + ':' + challenge;
    if (sounded.current.has(id)) return;
    sounded.current.add(id);
    playCorrectAnswerFeedback(correct, () => voiceVisible.current && voiceQuestion.current === questionId, { scope: voiceScope, attemptId: id });
  }
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
      cardOpen || reviewIndex!==null ||
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
    cardOpen, reviewIndex,
    readingVisible,
    session?.id,
    currentQuestion?.id,
    session?.phase,
    session?.challenge,
    presenceError,
  ]);

  async function action(
    name: "start" | "answer" | "advance" | "cancel",
    pointId?: string | string[],
  ) {
    if (requestBusy.current) return;
    requestBusy.current = true;
    setBusy(true);
    setError("");
    try {
      const current = session;
      if (name === 'answer' && current?.question) {
        const cached = feedbackCache.current.get(current.question.id);
        if (cached?.answer?.length) {
          const correct = JSON.stringify([...selected].sort()) === JSON.stringify([...cached.answer].sort());
          setInstantFeedback({ selected: [...selected], answer: cached.answer, analysis: cached.analysis || '', correct });
        }
      }
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
      if (name === 'answer' && current?.question && next.session?.feedback) soundAnswer(next.session.feedback.correct, current.question.id, current.challenge);
    } catch (cause) {
      setInstantFeedback(null);
      setError((cause as Error).message);
    } finally {
      requestBusy.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const remaining = session
    ? Math.max(0, Math.ceil((session.requiredMs - session.activeMs) / 1000))
    : 0;
  const choose = useCallback((key: string) => {
    if (session?.phase !== "answer" || busy) return;
    setSelected((previous) =>
      currentQuestion?.type === "multiple_choice"
        ? previous.includes(key)
          ? previous.filter((item) => item !== key)
          : [...previous, key]
        : [key],
    );
  }, [session?.phase, currentQuestion?.type, busy]);
  function close() {
    if (busy) return;
    if (session?.state === "active")
      AppAlert.alert(
        "暂时退出专项学习？",
        `已提交的作答和阅读进度会保留；今天完成 ${requiredCount} 道后再进入该功能。`,
        [
          { text: "继续刷题", style: "cancel" },
          { text: "暂时退出", onPress: onClose },
        ],
      );
    else onClose();
  }
  const chapterRows = [...new Set((data?.points || []).map(p => p.chapter))].map(name => ({ name, points: (data?.points || []).filter(p => p.chapter === name) }));
  const supportsChapters=typeof data?.remainingCount==='number';
  const chosenPoints = (data?.points || []).filter(p => supportsChapters?chapters.includes(p.chapter):p.id===legacyPoint);
  const chosenCount = chosenPoints.reduce((n,p) => n + p.questionCount, 0);
  const viewedQuestion = reviewIndex === null ? currentQuestion : session?.questions?.[reviewIndex];
  const reviewed = reviewIndex === null ? null : session?.reviews?.find(r => r.questionId === viewedQuestion?.id);
  const feedback = reviewed || session?.feedback || instantFeedback;
  const examActive = session?.state === 'active' && !!viewedQuestion && !data?.unlocked;
  return <Modal visible={visible && screenActive} animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
    <AndroidModalSafeArea style={s.safe}>
      <View testID="location-learning-header" style={s.header}>
        <AnimatedPressable accessibilityRole="button" accessibilityLabel="退出专项学习" disabled={busy} onPress={close} style={s.headerAction}><AppIcon name="chevron-left" size={24} color={s.link.color}/></AnimatedPressable>
        <Text accessibilityRole="header" style={s.headerTitle}>{examActive ? '学习测验' : '模拟定位学习'}</Text>
        {examActive ? <AnimatedPressable accessibilityRole="button" accessibilityLabel="答题卡" onPress={()=>setCardOpen(true)} style={s.headerAction}><AppIcon name="list" size={22} color={s.link.color}/></AnimatedPressable> : <Text style={s.day}>{requiredCount} 题</Text>}
      </View>
      {examActive && <View style={s.examStatus}><Text style={s.body}>已完成 {session!.completedCount} / {requiredCount}</Text><Text style={s.hint}>{session!.point.name} · 不限正确率</Text><View style={s.track}><View style={[s.fill,{width:`${session!.completedCount / requiredCount * 100}%`}]}/></View></View>}
      <ScrollView testID="location-learning-scroll" ref={scroll} onScroll={event=>{scrollOffset.current=event.nativeEvent.contentOffset.y}} scrollEventThrottle={80} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {!!error && <View accessibilityRole="alert" style={s.error}><Text style={s.errorText}>{error}</Text><AnimatedPressable accessibilityRole="button" onPress={()=>{setPresenceError(false);setRetry(v=>v+1)}} style={s.secondary}><Text style={s.link}>重新读取进度</Text></AnimatedPressable></View>}
        {loading && !data ? <ActivityIndicator accessibilityLabel="正在读取专项学习"/> : data?.unlocked ? <View style={s.card}>
          <Text style={s.title}>{data.exemption ? '剩余题量不足，直接进入' : '今日学习已完成'}</Text>
          <Text style={s.body}>{data.exemption ? `当前题库剩余 ${data.remainingCount ?? 0} 道可用未刷题，无法完整组成 ${requiredCount} 题，本次免除学习前置要求。` : '学习记录已保存，今天可以再次进入。'}</Text>
          <AnimatedPressable accessibilityRole="button" disabled={busy} style={s.primary} onPress={()=>{if(requestBusy.current)return;requestBusy.current=true;setBusy(true);void onEnter().then(onClose).catch(cause=>setError(cause.message)).finally(()=>{requestBusy.current=false;if(alive.current)setBusy(false)})}}><Text style={s.primaryText}>{busy?'正在核验资格…':'进入模拟定位学习'}</Text></AnimatedPressable>
        </View> : examActive && viewedQuestion ? <>
          <Text style={s.kicker}>第 {(reviewIndex ?? session!.completedCount) + 1} 题 · {viewedQuestion.type==='multiple_choice'?'多选题':viewedQuestion.type==='true_false'?'判断题':'单选题'}</Text>
          <View ref={questionReading} collapsable={false}>
            <ExamQuestionCard question={viewedQuestion} index={reviewIndex ?? session!.completedCount} selected={reviewed?.selected || session!.feedback?.selected || selected} disabled={busy || session!.phase==='review' || reviewIndex!==null} onChoose={choose}/>
          </View>
          {!!feedback && <View ref={reviewIndex===null?analysisReading:undefined} collapsable={false} style={s.feedback}>
            <Text style={s.feedbackTitle}>{feedback.correct?'本题答对了':'本题答错了，阅读解析也算完成'}</Text>
            <Text style={s.body}>正确答案：{feedback.answer.join('、')}</Text><Text selectable style={s.analysis}>{feedback.analysis}</Text>
            {busy && <Text style={s.hint}>结果已显示，正在保存作答…</Text>}
          </View>}
          <Text style={s.hint}>{reviewIndex!==null?'这是已保存的作答，仅供回顾，不会重复记分或播放语音。':session!.phase==='answer'?'作答自动计入刷题记录，答错也可以完成。':remaining?`阅读解析，还需 ${remaining} 秒`:'确认阅读后继续。'}</Text>
          <AnimatedPressable accessibilityRole="button" disabled={busy} style={s.secondary} onPress={()=>AppAlert.alert('重新选择章节？','已完成作答会保留在学习记录，未刷题可以重新组题。',[{text:'继续本轮',style:'cancel'},{text:'重新选择',onPress:()=>void action('cancel')}])}><Text style={s.link}>重新选择章节</Text></AnimatedPressable>
        </> : data ? <>
          <View style={s.card}><Text style={s.title}>{supportsChapters?`选择章节，组合 ${requiredCount} 道题`:`选择知识点，练习 ${requiredCount} 道题`}</Text><Text style={s.body}>可多选章节，只抽取尚未刷过的题；答错后阅读解析即可完成。作答与普通刷题共用学习记录。</Text><Text style={s.hint}>当前剩余 {data.remainingCount ?? (data.points || []).reduce((n,p)=>n+p.questionCount,0)} 题 · 已选 {chosenCount} 题</Text></View>
          <TextInput accessibilityLabel="搜索专项学习知识点" placeholder="搜索章节或知识点" value={search} onChangeText={setSearch} style={s.search} placeholderTextColor={s.placeholder.color}/>
          {!supportsChapters && <Text style={s.hint}>当前服务器支持单知识点学习；多章节组合和免刷规则需要部署新版后端。</Text>}
          {!supportsChapters && (data?.points || []).filter(p=>p.eligible && (!search.trim()||[p.chapter,p.name].some(v=>v.includes(search.trim())))).map(p=><AnimatedPressable key={p.id} accessibilityRole="radio" accessibilityLabel={p.name} accessibilityState={{checked:legacyPoint===p.id}} onPress={()=>setLegacyPoint(p.id)} style={[s.card,legacyPoint===p.id&&s.selectedChapter]}><Text style={s.pointName}>{p.name}</Text><Text style={s.body}>{p.chapter} · {p.questionCount} 道题</Text></AnimatedPressable>)}
          {supportsChapters && chapterRows.filter(row=>!search.trim() || [row.name,...row.points.map(p=>p.name)].some(v=>v.includes(search.trim()))).map(row=><AnimatedPressable key={row.name} accessibilityRole="checkbox" accessibilityLabel={row.name} accessibilityState={{checked:chapters.includes(row.name)}} disabled={busy} onPress={()=>setChapters(old=>old.includes(row.name)?old.filter(n=>n!==row.name):[...old,row.name])} style={[s.card, chapters.includes(row.name)&&s.selectedChapter]}><Text style={s.pointName}>{chapters.includes(row.name)?'✓  ':''}{row.name}</Text><Text style={s.body}>{row.points.reduce((n,p)=>n+p.questionCount,0)} 道未刷题</Text></AnimatedPressable>)}
          {!chapterRows.length && <Text style={s.body}>没有可选章节，请重新读取题库。</Text>}
        </> : null}
      </ScrollView>
      {data && !data.unlocked && <View style={s.examFooter}>
        <AnimatedPressable accessibilityRole="button" disabled={busy || (reviewIndex===null && (remaining>0 || presenceError || (session?.state==='active' && session.phase==='answer' && !selected.length))) || (!examActive && chosenCount<requiredCount)} onPress={()=>reviewIndex!==null?setReviewIndex(null):examActive?void action(session!.phase==='answer'?'answer':'advance'):void action('start',chosenPoints.map(p=>p.id))} style={[s.primary,s.footerPrimary,(busy || (reviewIndex===null && (remaining>0 || presenceError)) || (!examActive && chosenCount<requiredCount))&&s.disabled]}>
          <Text style={s.primaryText}>{busy?'正在保存…':reviewIndex!==null?'回到当前题':!examActive?`开始学习 · ${requiredCount} 题`:session!.phase==='answer'?'提交本题':session!.completedCount>=requiredCount-1?`确认阅读，完成 ${requiredCount} 题`:'确认阅读，下一题'}</Text>
        </AnimatedPressable>
      </View>}
      <Modal visible={cardOpen && visible} statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={()=>setCardOpen(false)}>
        <AndroidModalSafeArea style={s.safe}><View style={s.header}><Text style={s.headerTitle}>答题卡</Text><AnimatedPressable accessibilityRole="button" accessibilityLabel="关闭答题卡" onPress={()=>setCardOpen(false)} style={s.headerAction}><AppIcon name="close" size={22} color={s.link.color}/></AnimatedPressable></View>
          <ScrollView contentContainerStyle={s.content}><Text style={s.body}>点击已答题回顾，未答题按顺序继续。</Text><ExamAnswerGrid items={(session?.questions || []).map((q,i)=>({id:q.id,answered:!!session?.reviews?.some(r=>r.questionId===q.id),current:i===(reviewIndex ?? session?.completedCount),disabled:i>(session?.completedCount || 0)}))} onChoose={i=>{setReviewIndex(i===session?.completedCount?null:i);setCardOpen(false)}}/></ScrollView>
        </AndroidModalSafeArea>
      </Modal>
    </AndroidModalSafeArea>
  </Modal>;
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    reading: { gap: 12 },
    examStatus: { paddingHorizontal:16, paddingVertical:12, gap:8 },
    selectedChapter: { borderColor:c.brand, backgroundColor:c.brandSoft },
    examFooter: { backgroundColor:c.surface, padding:16, borderTopWidth:StyleSheet.hairlineWidth, borderColor:c.border },
    footerPrimary: { width:'100%' },
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
    headerAction: { width:48, minHeight: 56, justifyContent: "center", alignItems:'flex-start' },
    headerTitle: { flex:1,minWidth:0,textAlign:'center',fontSize: 16, fontWeight: "700", color: c.text },
    day: { fontSize: 12, color: c.textMuted, width:48,textAlign:'right' },
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
