import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { SafeAreaView } from '../components/SafeArea';
import { AnimatedPressable } from '../components/Motion';
import { ExamQuestionCard } from '../components/ExamQuestionCard.android';
import { radius, spacing, useThemedStyles, type ThemeColors } from '../theme';
import { createOfflineExam, scoreOfflineExam, type OfflineExamSession } from './offlineExamCore';
import { offlineStudyStore } from './offlineStudyStore.android';
import type { InstalledOfflinePack, OfflinePackOwner } from './offlinePacks.android';

type Mode = 'home' | 'exam';
const examKey = 'exam:current';
const choices = [15, 30, 50, 75];

export function OfflineExamScreen({ owner, installed, onClose }: {
  owner: OfflinePackOwner;
  installed: InstalledOfflinePack;
  onClose: () => void;
}) {
  const { pack, manifest, imageUri } = installed;
  const s = useThemedStyles(styles);
  const [mode, setMode] = useState<Mode>('home');
  const [chapter, setChapter] = useState('');
  const [count, setCount] = useState(30);
  const [exam, setExam] = useState<OfflineExamSession | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = useRef(true);
  const locking = useRef(false);
  const [now, setNow] = useState(Date.now);
  const chapters = useMemo(() => [...new Set(pack.questions.map((q) => q.chapter || '综合知识'))], [pack]);
  const examQuestion = exam?.questions[exam.index];
  const examResult = useMemo(() => exam?.submittedAt ? scoreOfflineExam(exam, exam.submittedAt) : null, [exam]);
  const examExpired = !!exam && now >= exam.expiresAt;
  const examLeft = exam ? Math.max(0, Math.ceil((exam.expiresAt - now) / 1000)) : 0;

  useEffect(() => {
    active.current = true;
    void offlineStudyStore.readSession<OfflineExamSession>(owner, examKey).then(paper => {
      if (!active.current) return;
      setExam(paper);
      setReady(true);
    }).catch(() => { if (active.current) setError('读取本机续练记录失败，请重新进入。'); });
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
      if (active.current) setExam(next);
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
          {button(mode === 'home' ? '返回考试' : '返回组卷', mode === 'home' ? onClose : () => { setMode('home'); setError(''); })}
        </View>
        <Text accessibilityRole="header" style={s.title}>离线模拟考试</Text>
        <Text style={s.meta}>{pack.certificate.name} · 学习内容保存在本机</Text>
        {!!error && <Text accessibilityLiveRegion="polite" style={s.error}>{error}</Text>}
        {mode === 'home' && <>
          <Text style={s.heading}>章节范围</Text>
          <View style={s.row}>
            {button('全部章节', () => setChapter(''), false, !chapter)}
            {chapters.map((name) => <View key={name}>{button(name, () => setChapter(name), false, name === chapter)}</View>)}
          </View>
          {!chapter && pack.exam.blueprint
            ? <Text style={s.meta}>按证书规则组卷：{pack.exam.blueprint.questionCount} 题 · {pack.exam.blueprint.durationMinutes} 分钟</Text>
            : <View style={s.row}>{choices.map((n) => <View key={n}>{button(n + ' 题', () => setCount(n), false, n === count)}</View>)}</View>}
          <View style={s.row}>
            {exam && !exam.submittedAt ? button('继续模拟考试', () => { setNow(Date.now()); setMode('exam'); }, !ready, true)
              : button('开始模拟考试', () => void startExam(), !ready, true)}
            {!!exam?.submittedAt && button('上次考试结果', () => setMode('exam'), !ready)}
          </View>
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
});
