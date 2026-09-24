import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { mobileApi, type AiQuestionDraft, type AiStreamProgress } from '../api/client';
import { AnimatedPressable, EntranceView } from '../components/Motion';
import { QuestionImages } from '../components/QuestionImages';
import { radius, shadow, spacing, useThemedStyles, useTheme, type ThemeColors } from '../theme';

type Selection = { chapter: string; knowledgeSection?: string; knowledgePoint: string };

export function AiQuestionDraftScreen({
  selection,
  onBack,
}: {
  selection: Selection;
  onBack: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [draft, setDraft] = useState<AiQuestionDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'generate' | 'submit' | 'delete' | ''>('');
  const [progress, setProgress] = useState<AiStreamProgress | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    mobileApi.currentQuestionDraft(selection)
      .then((result) => { if (active) setDraft(result.draft); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : '草稿加载失败'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selection.chapter, selection.knowledgeSection, selection.knowledgePoint]);

  async function generate() {
    if (busy || draft) return;
    setBusy('generate');
    setError('');
    setNotice('');
    setProgress({ stage: 'prepare', message: '正在读取当前知识点已有题目' });
    try {
      const next = await mobileApi.generateQuestionDraft(selection, setProgress);
      setDraft(next);
      setNotice('已通过程序查重和独立 AI 审核。请阅读题目、答案与解析，再决定是否提交。');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : '生成失败，请稍后重试');
    } finally {
      setBusy('');
      setProgress(null);
    }
  }

  async function submit() {
    if (!draft || busy) return;
    setBusy('submit');
    setError('');
    try {
      await mobileApi.submitQuestionDraft(draft.id);
      setDraft(null);
      setNotice('题目已提交到共享题库，提交数量已计入排行榜。');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : '提交失败，请稍后重试');
    } finally {
      setBusy('');
    }
  }

  async function remove() {
    if (!draft || busy) return;
    setBusy('delete');
    setError('');
    try {
      await mobileApi.deleteQuestionDraft(draft.id);
      setDraft(null);
      setNotice('草稿已删除，可以重新生成。');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : '删除失败，请稍后重试');
    } finally {
      setBusy('');
    }
  }

  const question = draft?.question;
  const stageText = progress?.message || 'AI 正在处理';
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <AnimatedPressable accessibilityLabel="返回知识点" onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>‹ 返回</Text>
        </AnimatedPressable>
        <Text style={styles.title}>AI 生成题目</Text>
      </View>
      <View style={styles.selectionCard}>
        <Text style={styles.selectionLabel}>当前知识点</Text>
        <Text style={styles.selectionName}>{selection.knowledgePoint}</Text>
        <Text style={styles.selectionMeta}>
          {[selection.chapter, selection.knowledgeSection].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Text style={styles.helper}>
        AI 会参考这个知识点的现有题目，生成后依次进行程序查重和独立审核。
      </Text>
      {loading ? <ActivityIndicator color={colors.brand} /> : null}
      {!loading && !draft && (
        <AnimatedPressable
          accessibilityRole="button"
          disabled={!!busy}
          onPress={() => void generate()}
          style={[styles.primaryButton, !!busy && styles.disabled]}
        >
          {busy === 'generate' && <ActivityIndicator color={colors.white} size="small" />}
          <Text style={styles.primaryText}>{busy === 'generate' ? stageText : '开始生成题目'}</Text>
          {busy === 'generate' && !!progress?.outputLength && (
            <Text style={styles.progressMeta}>已输出 {progress.outputLength} 字</Text>
          )}
        </AnimatedPressable>
      )}
      {busy === 'generate' && (
        <View style={styles.progressCard}>
          <Text style={styles.progressTitle}>AI 正在做什么</Text>
          <Text style={styles.progressText}>{stageText}</Text>
          <Text style={styles.progressMeta}>生成 → 规则与查重 → 独立审核 → 再次查重</Text>
        </View>
      )}
      {question && (
        <EntranceView distance={10} style={styles.questionCard}>
          <View style={styles.questionTop}>
            <Text style={styles.badge}>待提交草稿</Text>
            <Text style={styles.checkText}>✓ 双重核验通过</Text>
          </View>
          <QuestionImages question={question} />
          <Text style={styles.questionText}>{question.question}</Text>
          {Object.entries(question.options).map(([letter, option]) => (
            <View key={letter} style={styles.optionRow}>
              <Text style={styles.optionLetter}>{letter}</Text>
              <Text style={styles.optionText}>{option}</Text>
            </View>
          ))}
          <View style={styles.answerCard}>
            <Text style={styles.answerTitle}>答案：{question.answer?.join('、') || question.expectedAnswer}</Text>
            <Text style={styles.analysis}>{question.analysis}</Text>
          </View>
        </EntranceView>
      )}
      {draft && (
        <View style={styles.actions}>
          <AnimatedPressable
            accessibilityRole="button"
            disabled={!!busy}
            onPress={() => void submit()}
            style={[styles.primaryButton, styles.submitButton, !!busy && styles.disabled]}
          >
            <Text style={styles.primaryText}>{busy === 'submit' ? '正在提交…' : '提交到服务器'}</Text>
          </AnimatedPressable>
          <AnimatedPressable
            accessibilityRole="button"
            disabled={!!busy}
            onPress={() => void remove()}
            style={[styles.deleteButton, !!busy && styles.disabled]}
          >
            <Text style={styles.deleteText}>{busy === 'delete' ? '正在删除…' : '删除题目'}</Text>
          </AnimatedPressable>
        </View>
      )}
      {!!notice && <Text style={styles.notice}>{notice}</Text>}
      {!!error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  content: { backgroundColor: colors.background, flexGrow: 1, gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  backButton: { minHeight: 36, justifyContent: 'center' },
  backText: { color: colors.brand, fontSize: 15, fontWeight: '700' },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  selectionCard: { backgroundColor: colors.brand, borderRadius: radius.lg, gap: 5, padding: spacing.lg },
  selectionLabel: { color: colors.white, fontSize: 12, opacity: 0.8 },
  selectionName: { color: colors.white, fontSize: 20, fontWeight: '800' },
  selectionMeta: { color: colors.white, fontSize: 12, opacity: 0.8 },
  helper: { color: colors.textMuted, fontSize: 13, lineHeight: 21 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.brand, borderRadius: radius.md, gap: 5, justifyContent: 'center', minHeight: 50, padding: spacing.sm },
  primaryText: { color: colors.white, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  progressCard: { backgroundColor: colors.surfaceMuted, borderRadius: radius.md, gap: 5, padding: spacing.md },
  progressTitle: { color: colors.brandDark, fontSize: 14, fontWeight: '800' },
  progressText: { color: colors.text, fontSize: 14, lineHeight: 21 },
  progressMeta: { color: colors.textMuted, fontSize: 12 },
  questionCard: { backgroundColor: colors.surface, borderRadius: radius.md, gap: spacing.sm, padding: spacing.md, ...shadow.card },
  questionTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  badge: { backgroundColor: colors.brandSoft, borderRadius: radius.pill, color: colors.brandDark, fontSize: 12, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5 },
  checkText: { color: colors.brand, fontSize: 12, fontWeight: '700' },
  questionText: { color: colors.text, fontSize: 17, fontWeight: '800', lineHeight: 26 },
  optionRow: { alignItems: 'flex-start', borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, padding: spacing.sm },
  optionLetter: { color: colors.brand, fontSize: 14, fontWeight: '800' },
  optionText: { color: colors.text, flex: 1, fontSize: 14, lineHeight: 21 },
  answerCard: { backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, gap: 5, padding: spacing.sm },
  answerTitle: { color: colors.brandDark, fontSize: 14, fontWeight: '800' },
  analysis: { color: colors.textMuted, fontSize: 13, lineHeight: 21 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  submitButton: { flex: 1 },
  deleteButton: { alignItems: 'center', borderColor: colors.warning, borderRadius: radius.md, borderWidth: 1, justifyContent: 'center', minWidth: 100, padding: spacing.sm },
  deleteText: { color: colors.warning, fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.6 },
  notice: { color: colors.brandDark, fontSize: 13, lineHeight: 20 },
  error: { color: colors.warning, fontSize: 13, lineHeight: 20 },
});
