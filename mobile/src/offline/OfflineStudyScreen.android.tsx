import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { SafeAreaView } from '../components/SafeArea';
import { AnimatedPressable } from '../components/Motion';
import { ExamQuestionCard } from '../components/ExamQuestionCard.android';
import { QuestionImages } from '../components/QuestionImages';
import { radius, spacing, useThemedStyles, type ThemeColors } from '../theme';
import { gradeOfflineAnswer, LOCATION_MINIMUM_ANSWERS, practiceQuestions, type OfflineAnswer } from './offlineStudyCore';
import { createOfflineExam, scoreOfflineExam, type OfflineExamSession } from './offlineExamCore';
import { offlineOwnerKey, offlineStudyStore } from './offlineStudyStore.android';
import { openOfflineRoutePlayer } from '../../modules/route-player/index.android';
import type { InstalledOfflinePack, OfflinePackOwner } from './offlinePacks.android';

type PracticeRun = {
  packVersion: string;
  ids: string[];
  index: number;
  attemptId: string;
  startedAt: number;
  result?: OfflineAnswer;
};
type Mode = 'home' | 'practice' | 'exam';
const practiceKey = 'practice:current';
const examKey = 'exam:current';
const choices = [15, 30, 50, 75];

export function OfflineStudyScreen({ owner, installed, onClose }: {
  owner: OfflinePackOwner;
  installed: InstalledOfflinePack;
  onClose: () => void;
}) {
  const { pack, manifest, imageUri } = installed;
  const s = useThemedStyles(styles);
  const [mode, setMode] = useState<Mode>('home');
  const [chapter, setChapter] = useState('');
  const [random, setRandom] = useState(false);
  const [count, setCount] = useState(30);
  const [practice, setPractice] = useState<PracticeRun | null>(null);
  const [exam, setExam] = useState<OfflineExamSession | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [response, setResponse] = useState('');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = useRef(true);
  const locking = useRef(false);
  const [now, setNow] = useState(Date.now);
  const [todayCount, setTodayCount] = useState(0);
  const [progress, setProgress] = useState<Awaited<ReturnType<typeof offlineStudyStore.progress>> | null>(null);
  const questions = useMemo(() => new Map(pack.questions.map((q) => [q.id, q])), [pack]);
  const chapters = useMemo(() => [...new Set(pack.questions.map((q) => q.chapter || '综合知识'))], [pack]);
  const current = practice ? questions.get(practice.ids[practice.index]) : undefined;
  const examQuestion = exam?.questions[exam.index];
  const examResult = useMemo(() => exam?.submittedAt ? scoreOfflineExam(exam, exam.submittedAt) : null, [exam]);
  const examExpired = !!exam && now >= exam.expiresAt;
  const examLeft = exam ? Math.max(0, Math.ceil((exam.expiresAt - now) / 1000)) : 0;

  function refresh() {
    void Promise.all([offlineStudyStore.progress(owner), offlineStudyStore.todayCount(owner)]).then(([value, count]) => { if (active.current) { setProgress(value); setTodayCount(count); } })
      .catch(() => { if (active.current) setError('读取本机学习记录失败，请重新进入。'); });
  }
  useEffect(() => {
    active.current = true;
    void Promise.all([
      offlineStudyStore.readSession<PracticeRun>(owner, practiceKey),
      offlineStudyStore.readSession<OfflineExamSession>(owner, examKey),
    ]).then(([prior, paper]) => {
      if (!active.current) return;
      if (prior?.packVersion === manifest.version && prior.ids[prior.index] && questions.has(prior.ids[prior.index])) {
        setPractice(prior);
        setSelected(prior.result?.selected ?? []);
        setResponse(prior.result?.response ?? '');
      }
      setExam(paper);
      setReady(true);
    }).catch(() => { if (active.current) setError('读取本机续练记录失败，请重新进入。'); });
    refresh();
    return () => { active.current = false; };
  }, [owner.userId, owner.certificateId, manifest.version]);

  useEffect(() => {
    if (mode !== 'exam' || examResult) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [mode, examResult]);

  async function perform(task: () => Promise<void>) {
    if (locking.current || !ready) return;
    locking.current = true;
    setBusy(true);
    setError('');
    try { await task(); }
    catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : '本机保存失败，请重试。'); }
    finally {
      locking.current = false;
      if (active.current) setBusy(false);
    }
  }

  function startPractice(view: 'all' | 'wrong' | 'favorites' = 'all') {
    return perform(async () => {
      let rows = practiceQuestions(pack, { chapter, random });
      if (view !== 'all') rows = rows.filter((q) => progress?.[view].has(q.id));
      else {
        const unseen = rows.filter((q) => !progress?.answered.has(q.id));
        if (unseen.length) rows = unseen;
      }
      if (!rows.length) throw new Error('当前范围没有可练习的题目。');
      const next = { packVersion: manifest.version, ids: rows.map((q) => q.id), index: 0,
        attemptId: randomUUID(), startedAt: Date.now() };
      await offlineStudyStore.saveSession(owner, { id: practiceKey, data: next });
      if (!active.current) return;
      setPractice(next); setSelected([]); setResponse(''); setMode('practice');
    });
  }

  function submitPractice(values = selected) {
    return perform(async () => {
      if (!practice || !current || practice.result) return;
      const occurredAt = Date.now();
      const result: OfflineAnswer = {
        id: practice.attemptId, questionId: current.id, selected: values,
        ...(current.type === 'short_answer' ? { response: response.trim() } : {}),
        correct: gradeOfflineAnswer(current, values, response),
        timeMs: Math.max(0, Math.min(86400000, occurredAt - practice.startedAt)),
        occurredAt, source: 'practice', packVersion: manifest.version,
      };
      const next = { ...practice, result };
      await offlineStudyStore.record(owner, [result], { id: practiceKey, data: next });
      if (!active.current) return;
      setPractice(next); setSelected(values); refresh();
    });
  }

  function advancePractice() {
    return perform(async () => {
      if (!practice) return;
      const next: PracticeRun = { ...practice, index: practice.index + 1, result: undefined,
        startedAt: Date.now(), attemptId: randomUUID() };
      await offlineStudyStore.saveSession(owner, { id: practiceKey, data: next });
      if (!active.current) return;
      setPractice(next); setSelected([]); setResponse('');
      if (!next.ids[next.index]) { setMode('home'); refresh(); }
    });
  }

  function startExam() {
    return perform(async () => {
      const next = createOfflineExam(pack, manifest.version, count, chapter ? [chapter] : [],
        Math.random, randomUUID, Date.now());
      await offlineStudyStore.saveSession(owner, { id: examKey, data: next });
      if (active.current) { setExam(next); setNow(Date.now()); setMode('exam'); }
    });
  }

  function changeExam(next: OfflineExamSession) {
    return perform(async () => {
      await offlineStudyStore.saveSession(owner, { id: examKey, data: next });
      if (active.current) setExam(next);
    });
  }

  function submitExam() {
    return perform(async () => {
      if (!exam || exam.submittedAt) return;
      const next = { ...exam, submittedAt: Math.min(Date.now(), exam.expiresAt) };
      const result = scoreOfflineExam(next, next.submittedAt);
      await offlineStudyStore.record(owner, result.attempts, { id: examKey, data: next });
      if (active.current) { setExam(next); refresh(); }
    });
  }
  useEffect(() => {
    if (mode === 'exam' && examExpired && !examResult && !busy && !error) void submitExam();
  }, [mode, examExpired, examResult, busy, error]);

  const button = (label: string, run: () => void, disabled = false, marked = false) =>
    <AnimatedPressable accessibilityRole="button" accessibilityState={{ disabled: busy || disabled, selected: marked }}
      disabled={busy || disabled} onPress={run} style={[s.button, marked && s.marked, (disabled || busy) && s.dim]}>
      <Text style={s.buttonText}>{label}</Text>
    </AnimatedPressable>;
  const toggle = (values: string[], key: string, multi: boolean) =>
    multi ? (values.includes(key) ? values.filter((x) => x !== key) : [...values, key]) : [key];

  return <Modal animationType="slide" onRequestClose={() => { if (!locking.current) mode === 'home' ? onClose() : setMode('home'); }}>
    <SafeAreaView style={s.safe}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.page}>
        <View style={s.row}>
          {button(mode === 'home' ? '返回练习' : '返回离线学习', mode === 'home' ? onClose : () => { setMode('home'); setError(''); })}
        </View>
        <Text accessibilityRole="header" style={s.title}>{mode === 'home' ? '离线学习' : mode === 'practice' ? '离线练习' : '离线模拟考试'}</Text>
        <Text style={s.meta}>{pack.certificate.name} · 学习内容保存在本机</Text>
        {!!error && <Text accessibilityLiveRegion="polite" style={s.error}>{error}</Text>}
        {mode === 'home' && <>
          <View style={s.card}>
            <Text style={s.heading}>学习进度</Text>
            <Text style={s.body}>本机已答 {progress?.attempts ?? 0} 次 · 答对 {progress?.correct ?? 0} 次</Text>
            <Text style={s.meta}>已练 {progress?.answered.size ?? 0} 道 · 待同步 {progress?.pending ?? 0} 条</Text>
            {!!progress?.rejected && <Text style={s.meta}>{progress.rejected} 条旧题记录仅保留在本机。</Text>}
          </View>
          <Text style={s.heading}>章节范围</Text>
          <View style={s.row}>
            {button('全部章节', () => setChapter(''), false, !chapter)}
            {chapters.map((name) => <View key={name}>{button(name, () => setChapter(name), false, name === chapter)}</View>)}
          </View>
          <Text style={s.heading}>练习</Text>
          <View style={s.row}>
            {button('顺序', () => setRandom(false), false, !random)}
            {button('随机', () => setRandom(true), false, random)}
          </View>
          <View style={s.row}>
            {button('开始练习', () => void startPractice(), !ready, true)}
            {!!current && button('继续上次', () => setMode('practice'), !ready)}
            {button('错题本', () => void startPractice('wrong'), !progress?.wrong.size)}
            {button('收藏题', () => void startPractice('favorites'), !progress?.favorites.size)}
          </View>
          <Text style={s.heading}>模拟考试</Text>
          {!chapter && pack.exam.blueprint
            ? <Text style={s.meta}>按证书规则组卷：{pack.exam.blueprint.questionCount} 题 · {pack.exam.blueprint.durationMinutes} 分钟</Text>
            : <View style={s.row}>{choices.map((n) => <View key={n}>{button(n + ' 题', () => setCount(n), false, n === count)}</View>)}</View>}
          <View style={s.row}>
            {exam && !exam.submittedAt ? button('继续模拟考试', () => { setNow(Date.now()); setMode('exam'); }, !ready, true)
              : button('开始模拟考试', () => void startExam(), !ready, true)}
            {!!exam?.submittedAt && button('上次考试结果', () => setMode('exam'), !ready)}
          </View>
          <View style={s.card}>
            <Text style={s.heading}>虚拟定位学习</Text>
            <Text style={s.body}>今日已答 {todayCount} / {LOCATION_MINIMUM_ANSWERS} 题 · 按北京时间统计</Text>
            {button(todayCount >= LOCATION_MINIMUM_ANSWERS ? '进入虚拟定位学习' : '答满 11 题后解锁',
              () => void perform(() => openOfflineRoutePlayer(offlineOwnerKey(owner))), todayCount < LOCATION_MINIMUM_ANSWERS)}
          </View>
          <Text style={s.meta}>AI 功能需要联网，本机练习和考试不受影响。</Text>
        </>}
        {mode === 'practice' && practice && current && <>
          <Text style={s.meta}>第 {practice.index + 1} / {practice.ids.length} 题</Text>
          {current.type === 'short_answer' ? <View style={s.card}>
            {!!current.sharedStem && <Text style={s.body}>{current.sharedStem}</Text>}
            <Text style={s.heading}>{current.question}</Text>
            <QuestionImages question={current} resolveLocalImage={imageUri} />
            <TextInput accessibilityLabel="我的简答" placeholder="填写我的作答" placeholderTextColor={s.meta.color}
              editable={!practice.result} value={response} onChangeText={setResponse} multiline maxLength={5000} style={s.input} />
            {!practice.result && <View style={s.row}>
              {button('自评答对', () => void submitPractice(['A']), !response.trim())}
              {button('自评答错', () => void submitPractice(['B']), !response.trim())}
            </View>}
          </View> : <ExamQuestionCard question={current} index={practice.index} selected={selected}
            disabled={!!practice.result || busy} resolveLocalImage={imageUri}
            onChoose={(key) => setSelected(toggle(selected, key, current.type === 'multiple_choice'))} />}
          <View style={s.row}>
            {!practice.result && current.type !== 'short_answer' && button('提交答案', () => void submitPractice(), !selected.length, true)}
            {button(progress?.favorites.has(current.id) ? '取消收藏' : '收藏本题',
              () => void perform(async () => { await offlineStudyStore.setFavorite(owner, current.id, !progress?.favorites.has(current.id)); refresh(); }))}
          </View>
          {practice.result && <View style={s.card}>
            <Text accessibilityLiveRegion="polite" style={s.heading}>{practice.result.correct ? '答对了' : '答错了'}</Text>
            <Text style={s.body}>参考答案：{current.expectedAnswer || current.answer.join('、')}</Text>
            <Text style={s.body}>{current.analysis}</Text>
            {button(practice.index + 1 < practice.ids.length ? '下一题' : '完成练习', () => void advancePractice(), false, true)}
          </View>}
        </>}
        {mode === 'exam' && exam && examQuestion && <>
          <Text style={s.meta}>{examResult
            ? '得分 ' + examResult.score + ' / ' + examResult.total + (exam.passingScore ? ' · 及格线 ' + exam.passingScore : '')
            : '剩余 ' + Math.floor(examLeft / 60) + ' 分 ' + (examLeft % 60) + ' 秒 · 已答 ' + Object.values(exam.answers).filter((row) => row.length).length + ' / ' + exam.questions.length + ' 题'}</Text>
          <ExamQuestionCard question={examQuestion} index={exam.index}
            selected={exam.answers[examQuestion.id] || []} disabled={busy || examExpired || !!examResult}
            resolveLocalImage={imageUri} onChoose={(key) => {
              if (Date.now() >= exam.expiresAt || exam.submittedAt) return;
              void changeExam({ ...exam, answers: { ...exam.answers, [examQuestion.id]:
                toggle(exam.answers[examQuestion.id] || [], key, examQuestion.type === 'multiple_choice') } });
            }} />
          {examResult && <View style={s.card}>
            <Text style={s.heading}>{examResult.reviews[exam.index]?.correct ? '答对了' : '未答对'}</Text>
            <Text style={s.body}>参考答案：{examQuestion.answer.join('、')}</Text>
            <Text style={s.body}>{examQuestion.analysis}</Text>
          </View>}
          <View style={s.row}>
            {button('上一题', () => void changeExam({ ...exam, index: exam.index - 1 }), exam.index === 0)}
            {button('下一题', () => void changeExam({ ...exam, index: exam.index + 1 }), exam.index + 1 >= exam.questions.length)}
            {!examResult && button(examExpired ? '时间到，交卷' : '交卷并查看得分', () => void submitExam(), false, true)}
          </View>
        </>}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

const styles = (c: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  page: { gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  title: { color: c.text, fontSize: 27, fontWeight: '800' },
  heading: { color: c.text, fontSize: 18, fontWeight: '700' },
  body: { color: c.text, fontSize: 16, lineHeight: 25 },
  meta: { color: c.textMuted, fontSize: 14, lineHeight: 21 },
  error: { color: c.warning, fontSize: 15, lineHeight: 21 },
  card: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
    borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  button: { minHeight: 48, maxWidth: '100%', justifyContent: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: c.surfaceMuted,
    borderRadius: radius.sm, borderWidth: 1, borderColor: c.border },
  buttonText: { color: c.text, fontSize: 15, fontWeight: '700' },
  marked: { borderColor: c.brand, backgroundColor: c.brandSoft },
  dim: { opacity: 0.55 },
  input: { minHeight: 90, borderWidth: 1, borderColor: c.border, borderRadius: radius.sm,
    color: c.text, fontSize: 16, padding: spacing.sm, textAlignVertical: 'top' },
});
