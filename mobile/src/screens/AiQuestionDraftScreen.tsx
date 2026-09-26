import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  mobileApi,
  type AiQuestionGenerationJob,
  type AiQuestionGroup,
  type AiQuestionGroupResponse,
  type AiQuestionGenerationSelection,
} from '../api/client';
import { AnimatedPressable, EntranceView } from '../components/Motion';
import { QuestionImages } from '../components/QuestionImages';
import { useScreenActive } from '../navigation/ScreenActivity';
import type { AppTab, NavigationOptions } from '../types';
import { radius, shadow, spacing, useThemedStyles, useTheme, type ThemeColors } from '../theme';

export function AiQuestionDraftScreen({
  selection,
  initialGroupId,
  onBack,
  onNavigate,
}: {
  selection: AiQuestionGenerationSelection;
  initialGroupId?: string;
  onBack: () => void;
  onNavigate: (tab: AppTab, options?: NavigationOptions) => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const screenActive = useScreenActive();
  const [groups, setGroups] = useState<AiQuestionGroup[]>([]);
  const [jobs, setJobs] = useState<AiQuestionGenerationJob[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState(initialGroupId || '');
  const [groupDetail, setGroupDetail] = useState<AiQuestionGroupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'generate' | 'upload' | ''>('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!screenActive) return;
    let mounted = true;
    let firstLoad = true;
    const refresh = async () => {
      try {
        const [allGroups, jobResult] = await Promise.all([
          mobileApi.aiQuestionGroups(),
          mobileApi.aiQuestionGenerationJobs(),
        ]);
        if (!mounted) return;
        const matchingGroups = allGroups.filter((group) =>
          group.groupType === 'question_generation' &&
          group.metadata.chapter === selection.chapter &&
          (group.metadata.knowledgeSection || '') === (selection.knowledgeSection || '') &&
          group.metadata.knowledgePoint === selection.knowledgePoint,
        );
        setGroups(matchingGroups);
        setJobs(jobResult.jobs.filter((job) =>
          job.selection.chapter === selection.chapter &&
          (job.selection.knowledgeSection || '') === (selection.knowledgeSection || '') &&
          job.selection.knowledgePoint === selection.knowledgePoint,
        ));
        if (selectedGroupId) {
          const detail = await mobileApi.aiQuestionGroup(selectedGroupId);
          if (mounted) setGroupDetail(detail);
        } else {
          setGroupDetail(null);
        }
        if (mounted) setError('');
      } catch (cause: unknown) {
        if (mounted && firstLoad)
          setError(cause instanceof Error ? cause.message : '题组加载失败，请稍后重试');
      } finally {
        if (mounted && firstLoad) {
          firstLoad = false;
          setLoading(false);
        }
      }
    };
    setLoading(true);
    void refresh();
    const timer = setInterval(() => void refresh(), 3500);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [screenActive, selectedGroupId, selection.chapter, selection.knowledgeSection, selection.knowledgePoint]);

  const activeJob = jobs.find((job) => job.status === 'queued' || job.status === 'running');
  const failedJob = jobs.find((job) => job.status === 'failed');
  const group = groupDetail?.group;

  async function startGeneration() {
    if (busy || activeJob) return;
    setBusy('generate');
    setError('');
    setNotice('');
    try {
      const result = await mobileApi.createAiQuestionGeneration(selection);
      setJobs((current) => [result.job, ...current.filter((job) => job.id !== result.job.id)]);
      setNotice('任务已交给服务器后台运行。你可以切换到其他页面继续刷题。');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : '任务创建失败，请稍后重试');
    } finally {
      setBusy('');
    }
  }

  async function setGroupSharing(target: AiQuestionGroup, shared: boolean) {
    if (busy) return;
    setBusy('upload');
    setError('');
    setNotice('');
    try {
      const result = await mobileApi.shareAiQuestionGroup(target.id, shared);
      setGroupDetail((current) => current
        ? { ...current, group: { ...current.group, shared: result.shared } }
        : current,
      );
      setGroups((current) => current.map((item) =>
        item.id === target.id ? { ...item, shared: result.shared } : item,
      ));
      setNotice(result.shared
        ? '题组已上传到共享 AI 题组。'
        : '题组已取消共享，仍可在你的账号中刷题。');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : '题组上传失败，请稍后重试');
    } finally {
      setBusy('');
    }
  }

  async function uploadGroup() {
    if (!group) return;
    await setGroupSharing(group, !group.shared);
  }

  function practiceGroup(target: AiQuestionGroup) {
    onNavigate('practice', {
      practiceMode: 'sequential',
      practiceSource: 'all',
      practiceChapter: target.metadata.chapter,
      practiceKnowledgeSection: target.metadata.knowledgeSection,
      practiceKnowledgePoint: target.metadata.knowledgePoint,
      practiceSelectionComplete: true,
      practiceAiGroupId: target.id,
    });
  }

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <AnimatedPressable accessibilityLabel="返回知识点" onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>‹ 返回练习</Text>
        </AnimatedPressable>
        <View style={styles.headerMark}><Text style={styles.headerMarkText}>✦</Text></View>
      </View>

      {selectedGroupId && !groupDetail && loading ? (
        <View style={styles.loadingDetail}>
          <ActivityIndicator color={colors.brand} />
          <Text style={styles.loadingText}>正在打开题组…</Text>
        </View>
      ) : selectedGroupId && !groupDetail ? (
        <View style={styles.loadingDetail}>
          <Text style={styles.error}>{error || '暂时无法打开这个题组。'}</Text>
          <AnimatedPressable onPress={() => { setGroupDetail(null); setSelectedGroupId(''); }} style={styles.backToGroups}>
            <Text style={styles.backToGroupsText}>返回题组列表</Text>
          </AnimatedPressable>
        </View>
      ) : groupDetail ? (
        <>
          <View style={styles.detailHeading}>
            <Text style={styles.eyebrow}>AI 生成题组 · {group?.questionCount ?? 10} 道</Text>
            <Text style={styles.title}>题组已准备好</Text>
            <Text style={styles.subtitle}>
              题目已经通过程序校验和独立 AI 复核。先看题干，作答后再查看反馈。
            </Text>
          </View>
          <View style={styles.selectionCard}>
            <View style={styles.selectionIcon}><Text style={styles.selectionIconText}>知</Text></View>
            <View style={styles.selectionCopy}>
              <Text style={styles.selectionLabel}>本组知识点</Text>
              <Text style={styles.selectionName}>{group?.metadata.knowledgePoint}</Text>
              <Text style={styles.selectionMeta}>
                {[group?.metadata.chapter, group?.metadata.knowledgeSection].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Text style={styles.selectionCount}>10{ '\n' }题</Text>
          </View>

          <View style={styles.detailStats}>
            <Stat label="题目数量" value={`${group?.questionCount ?? 10} 道`} colors={colors} />
            <Stat label="已完成" value={`${group?.completedCount ?? 0} 道`} colors={colors} />
            <Stat label="共享状态" value={group?.shared ? '已上传' : '仅自己'} colors={colors} />
          </View>

          <View style={styles.detailListHeader}>
            <Text style={styles.sectionTitle}>本组题目</Text>
            <Text style={styles.privateHint}>答案仅在作答后显示</Text>
          </View>
          {groupDetail.questions.map((question, index) => (
            <EntranceView key={question.id} delay={Math.min(index * 20, 160)} distance={8} style={styles.questionCard}>
              <View style={styles.questionTop}>
                <Text style={styles.questionNumber}>第 {index + 1} 题</Text>
                <Text style={styles.difficulty}>{difficultyName(question.difficulty)}</Text>
              </View>
              <QuestionImages question={question} />
              <Text style={styles.questionText}>{question.question}</Text>
              {Object.entries(question.options || {}).map(([letter, option]) => (
                <View key={letter} style={styles.optionRow}>
                  <Text style={styles.optionLetter}>{letter}</Text>
                  <Text style={styles.optionText}>{option}</Text>
                </View>
              ))}
            </EntranceView>
          ))}

          <View style={styles.actions}>
            <AnimatedPressable onPress={() => practiceGroup(group!)} style={styles.primaryButton}>
              <Text style={styles.primaryText}>开始刷这组题</Text>
              <Text style={styles.primaryArrow}>→</Text>
            </AnimatedPressable>
            <AnimatedPressable
              disabled={busy === 'upload'}
              onPress={() => void uploadGroup()}
              style={[styles.secondaryButton, group?.shared && styles.sharedButton]}
            >
              {busy === 'upload' ? <ActivityIndicator color={colors.brand} size="small" /> : null}
              <Text style={styles.secondaryText}>
                {busy === 'upload' ? '正在更新…' : group?.shared ? '取消题组共享' : '上传到共享题库'}
              </Text>
            </AnimatedPressable>
          </View>
          {!!notice && <Text style={styles.notice}>{notice}</Text>}
          {!!error && <Text style={styles.error}>{error}</Text>}
          <AnimatedPressable onPress={() => { setGroupDetail(null); setSelectedGroupId(''); }} style={styles.backToGroups}>
            <Text style={styles.backToGroupsText}>返回本知识点的题组列表</Text>
          </AnimatedPressable>
        </>
      ) : (
        <>
          <EntranceView distance={14} style={styles.hero}>
            <View style={styles.heroTop}>
              <Text style={styles.heroEyebrow}>考匠 AI · 知识点练习</Text>
              <View style={styles.heroBadge}><Text style={styles.heroBadgeText}>10 题一组</Text></View>
            </View>
            <Text style={styles.heroTitle}>把一个知识点，练成一组题</Text>
            <Text style={styles.heroDescription}>
              按当前知识点生成 10 道不同角度的题，并逐题检查答案、解析和重复度。
            </Text>
            <View style={styles.heroTopic}>
              <Text style={styles.heroTopicIcon}>知</Text>
              <View style={styles.heroTopicCopy}>
                <Text style={styles.heroTopicLabel}>当前知识点</Text>
                <Text numberOfLines={2} style={styles.heroTopicName}>{selection.knowledgePoint}</Text>
              </View>
              <Text style={styles.heroTopicArrow}>›</Text>
            </View>
          </EntranceView>

          <View style={styles.reviewSteps}>
            <Text style={styles.sectionTitle}>题目怎样进入题组</Text>
            <View style={styles.stepRow}>
              <Step number="01" title="批量生成" text="一次准备 10 道题" colors={colors} />
              <View style={styles.stepConnector} />
              <Step number="02" title="逐题复核" text="查重并独立审查" colors={colors} />
              <View style={styles.stepConnector} />
              <Step number="03" title="保存题组" text="通过后才可使用" colors={colors} />
            </View>
          </View>

          {activeJob ? (
            <View style={styles.activeJobCard}>
              <View style={styles.activeJobHeader}>
                <View style={styles.activeJobIcon}><ActivityIndicator color={colors.brand} size="small" /></View>
                <View style={styles.activeJobCopy}>
                  <Text style={styles.activeJobTitle}>正在后台生成并复核</Text>
                  <Text style={styles.activeJobMeta}>
                    已通过 {activeJob.progress.completed ?? 0}/10 道
                    {activeJob.progress.round ? ` · 第 ${activeJob.progress.round} 轮` : ''}
                  </Text>
                </View>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.min(100, ((activeJob.progress.completed ?? 0) / 10) * 100)}%` }]} />
              </View>
              <Text style={styles.activeJobMessage}>{activeJob.progress.message}</Text>
              <Text style={styles.activeJobFootnote}>离开此页面或关闭 App，服务器仍会继续处理。</Text>
            </View>
          ) : (
            <>
              {failedJob && (
                <View style={styles.failedJobCard}>
                  <Text style={styles.failedJobTitle}>上次生成没有完成</Text>
                  <Text style={styles.failedJobMessage}>{failedJob.error || failedJob.progress.message}</Text>
                  <Text style={styles.failedJobFootnote}>之前保存的题组不会受影响，可以重新发起任务。</Text>
                </View>
              )}
              <AnimatedPressable
                accessibilityRole="button"
                disabled={busy === 'generate'}
                onPress={() => void startGeneration()}
                style={[styles.generateButton, busy === 'generate' && styles.disabled]}
              >
                {busy === 'generate' ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.generateIcon}>✦</Text>}
                <View style={styles.generateCopy}>
                  <Text style={styles.generateTitle}>{busy === 'generate' ? '正在创建后台任务…' : '生成 10 道题'}</Text>
                  <Text style={styles.generateSubtitle}>生成后可切换页面，任务会在服务器继续</Text>
                </View>
                <Text style={styles.generateArrow}>→</Text>
              </AnimatedPressable>
            </>
          )}

          {!!notice && <Text style={styles.notice}>{notice}</Text>}
          {!!error && <Text style={styles.error}>{error}</Text>}
          {loading && !groups.length && (
            <View style={styles.loadingRow}><ActivityIndicator color={colors.brand} /><Text style={styles.loadingText}>正在读取你的题组…</Text></View>
          )}

          <View style={styles.groupSectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>本知识点的生成题组</Text>
              <Text style={styles.sectionSubtitle}>生成完成后，在这里上传或接着刷题</Text>
            </View>
            <View style={styles.groupCountPill}><Text style={styles.groupCountText}>{groups.length}</Text></View>
          </View>
          {groups.map((item, index) => (
            <EntranceView key={item.id} delay={60 + index * 35} distance={10}>
              <View style={styles.groupCard}>
                <View style={styles.groupCardTop}>
                  <View style={styles.groupSymbol}><Text style={styles.groupSymbolText}>✦</Text></View>
                  <View style={styles.groupCardCopy}>
                    <Text style={styles.groupTitle}>{selection.knowledgePoint} · AI 题组</Text>
                    <Text style={styles.groupMeta}>{formatDate(item.createdAt)} · {item.questionCount} 道题</Text>
                  </View>
                  <View style={[styles.statusBadge, item.shared && styles.sharedBadge]}>
                    <Text style={[styles.statusBadgeText, item.shared && styles.sharedBadgeText]}>{item.shared ? '已上传' : '私有'}</Text>
                  </View>
                </View>
                <View style={styles.groupProgressRow}>
                  <View style={styles.groupProgressTrack}>
                    <View style={[styles.groupProgressFill, { width: `${item.questionCount ? Math.min(100, (item.completedCount / item.questionCount) * 100) : 0}%` }]} />
                  </View>
                  <Text style={styles.groupProgressText}>已刷 {item.completedCount}/{item.questionCount}</Text>
                </View>
                <View style={styles.groupActions}>
                  <AnimatedPressable onPress={() => { setGroupDetail(null); setSelectedGroupId(item.id); }} style={styles.groupOpenButton}>
                    <Text style={styles.groupOpenText}>详情</Text>
                  </AnimatedPressable>
                  <AnimatedPressable
                    disabled={busy === 'upload' || item.shared}
                    onPress={() => void setGroupSharing(item, true)}
                    style={[styles.groupUploadButton, item.shared && styles.groupUploadedButton]}
                  >
                    <Text style={[styles.groupUploadText, item.shared && styles.groupUploadedText]}>
                      {busy === 'upload' && !item.shared ? '上传中' : item.shared ? '已上传' : '上传'}
                    </Text>
                  </AnimatedPressable>
                  <AnimatedPressable onPress={() => practiceGroup(item)} style={styles.groupPracticeButton}>
                    <Text style={styles.groupPracticeText}>刷题</Text>
                  </AnimatedPressable>
                </View>
              </View>
            </EntranceView>
          ))}
          {!loading && !groups.length && !activeJob && (
            <View style={styles.emptyGroups}>
              <View style={styles.emptyIcon}><Text style={styles.emptyIconText}>✦</Text></View>
              <Text style={styles.emptyTitle}>这个知识点还没有生成题组</Text>
              <Text style={styles.emptyText}>生成并通过复核的题目会保存在这里，不会直接显示答案。</Text>
            </View>
          )}
          <Text style={styles.footerHint}>
            题组默认仅自己可见。上传后，其他考匠用户也可以练习这组题。
          </Text>
        </>
      )}
    </ScrollView>
  );
}

function Stat({ label, value, colors }: { label: string; value: string; colors: ThemeColors }) {
  return (
    <View style={stylesStat(colors).card}>
      <Text style={stylesStat(colors).value}>{value}</Text>
      <Text style={stylesStat(colors).label}>{label}</Text>
    </View>
  );
}

function stylesStat(colors: ThemeColors) {
  return StyleSheet.create({
    card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flex: 1, gap: 5, padding: spacing.sm },
    value: { color: colors.text, fontSize: 13, fontWeight: '800' },
    label: { color: colors.textMuted, fontSize: 11 },
  });
}

function Step({ number, title, text, colors }: { number: string; title: string; text: string; colors: ThemeColors }) {
  return (
    <View style={{ alignItems: 'center', flex: 1, gap: 5 }}>
      <Text style={{ color: colors.brand, fontSize: 11, fontWeight: '900' }}>{number}</Text>
      <Text style={{ color: colors.text, fontSize: 12, fontWeight: '800' }}>{title}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 10, textAlign: 'center' }}>{text}</Text>
    </View>
  );
}

function difficultyName(value?: string) {
  if (value === 'easy') return '基础';
  if (value === 'hard') return '进阶';
  return '巩固';
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '刚刚生成';
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  content: { backgroundColor: colors.background, flexGrow: 1, gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  backButton: { justifyContent: 'center', minHeight: 38 },
  backText: { color: colors.brand, fontSize: 14, fontWeight: '800' },
  headerMark: { alignItems: 'center', backgroundColor: colors.brandSoft, borderRadius: radius.pill, height: 36, justifyContent: 'center', width: 36 },
  headerMarkText: { color: colors.brand, fontSize: 18, fontWeight: '900' },
  hero: { backgroundColor: colors.brand, borderRadius: radius.lg, gap: spacing.md, overflow: 'hidden', padding: spacing.lg, ...shadow.card },
  heroTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  heroEyebrow: { color: colors.white, fontSize: 12, fontWeight: '800', opacity: 0.82 },
  heroBadge: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  heroBadgeText: { color: colors.white, fontSize: 11, fontWeight: '800' },
  heroTitle: { color: colors.white, fontSize: 25, fontWeight: '900', lineHeight: 32, maxWidth: 320 },
  heroDescription: { color: colors.white, fontSize: 13, lineHeight: 21, opacity: 0.86 },
  heroTopic: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.14)', borderColor: 'rgba(255,255,255,0.2)', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, padding: spacing.sm },
  heroTopicIcon: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: radius.sm, color: colors.white, fontSize: 14, fontWeight: '900', overflow: 'hidden', padding: 9 },
  heroTopicCopy: { flex: 1, gap: 2 },
  heroTopicLabel: { color: colors.white, fontSize: 10, opacity: 0.72 },
  heroTopicName: { color: colors.white, fontSize: 14, fontWeight: '800' },
  heroTopicArrow: { color: colors.white, fontSize: 22, opacity: 0.82 },
  reviewSteps: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.md, padding: spacing.md },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  stepRow: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  stepConnector: { backgroundColor: colors.border, height: 1, marginBottom: 20, width: 12 },
  generateButton: { alignItems: 'center', backgroundColor: colors.brand, borderRadius: radius.lg, flexDirection: 'row', gap: spacing.md, minHeight: 70, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, ...shadow.card },
  generateIcon: { color: colors.white, fontSize: 21, fontWeight: '900', paddingHorizontal: 5 },
  generateCopy: { flex: 1, gap: 4 },
  generateTitle: { color: colors.white, fontSize: 16, fontWeight: '900' },
  generateSubtitle: { color: colors.white, fontSize: 11, opacity: 0.78 },
  generateArrow: { color: colors.white, fontSize: 23, fontWeight: '700' },
  disabled: { opacity: 0.65 },
  activeJobCard: { backgroundColor: colors.surface, borderColor: colors.brandSoft, borderRadius: radius.lg, borderWidth: 1, gap: spacing.sm, padding: spacing.md, ...shadow.card },
  activeJobHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  activeJobIcon: { alignItems: 'center', backgroundColor: colors.brandSoft, borderRadius: radius.md, height: 40, justifyContent: 'center', width: 40 },
  activeJobCopy: { flex: 1, gap: 3 },
  activeJobTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  activeJobMeta: { color: colors.brand, fontSize: 11, fontWeight: '700' },
  progressTrack: { backgroundColor: colors.surfaceMuted, borderRadius: radius.pill, height: 7, overflow: 'hidden' },
  progressFill: { backgroundColor: colors.brand, borderRadius: radius.pill, height: '100%' },
  activeJobMessage: { color: colors.text, fontSize: 12, lineHeight: 18 },
  activeJobFootnote: { color: colors.textMuted, fontSize: 11 },
  failedJobCard: { backgroundColor: colors.warningSoft, borderRadius: radius.md, gap: 4, padding: spacing.md },
  failedJobTitle: { color: colors.warning, fontSize: 13, fontWeight: '900' },
  failedJobMessage: { color: colors.text, fontSize: 12, lineHeight: 18 },
  failedJobFootnote: { color: colors.textMuted, fontSize: 10, lineHeight: 15 },
  notice: { color: colors.brandDark, fontSize: 12, lineHeight: 18 },
  error: { backgroundColor: colors.warningSoft, borderRadius: radius.sm, color: colors.warning, fontSize: 12, lineHeight: 18, padding: spacing.sm },
  loadingRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm },
  loadingDetail: { alignItems: 'center', gap: spacing.sm, justifyContent: 'center', minHeight: 200 },
  loadingText: { color: colors.textMuted, fontSize: 12 },
  groupSectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  sectionSubtitle: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  groupCountPill: { alignItems: 'center', backgroundColor: colors.brandSoft, borderRadius: radius.pill, height: 30, justifyContent: 'center', minWidth: 30, paddingHorizontal: 9 },
  groupCountText: { color: colors.brandDark, fontSize: 12, fontWeight: '900' },
  groupCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.md, padding: spacing.md, ...shadow.card },
  groupCardTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  groupSymbol: { alignItems: 'center', backgroundColor: colors.brandSoft, borderRadius: radius.md, height: 42, justifyContent: 'center', width: 42 },
  groupSymbolText: { color: colors.brand, fontSize: 17, fontWeight: '900' },
  groupCardCopy: { flex: 1, gap: 4 },
  groupTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  groupMeta: { color: colors.textMuted, fontSize: 11 },
  statusBadge: { backgroundColor: colors.surfaceMuted, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 5 },
  statusBadgeText: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
  sharedBadge: { backgroundColor: colors.brandSoft },
  sharedBadgeText: { color: colors.brandDark },
  groupProgressRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  groupProgressTrack: { backgroundColor: colors.surfaceMuted, borderRadius: radius.pill, flex: 1, height: 5, overflow: 'hidden' },
  groupProgressFill: { backgroundColor: colors.brand, borderRadius: radius.pill, height: '100%' },
  groupProgressText: { color: colors.textMuted, fontSize: 10 },
  groupActions: { flexDirection: 'row', gap: spacing.xs },
  groupOpenButton: { alignItems: 'center', borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flex: 1, flexDirection: 'row', justifyContent: 'center', minHeight: 42 },
  groupOpenText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  groupUploadButton: { alignItems: 'center', backgroundColor: colors.brandSoft, borderRadius: radius.md, flex: 1, justifyContent: 'center', minHeight: 42 },
  groupUploadText: { color: colors.brandDark, fontSize: 12, fontWeight: '800' },
  groupUploadedButton: { backgroundColor: colors.surfaceMuted },
  groupUploadedText: { color: colors.textMuted },
  groupPracticeButton: { alignItems: 'center', backgroundColor: colors.brand, borderRadius: radius.md, flex: 1, justifyContent: 'center', minHeight: 42 },
  groupPracticeText: { color: colors.white, fontSize: 12, fontWeight: '800' },
  emptyGroups: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.sm, padding: spacing.lg },
  emptyIcon: { alignItems: 'center', backgroundColor: colors.brandSoft, borderRadius: radius.pill, height: 44, justifyContent: 'center', width: 44 },
  emptyIconText: { color: colors.brand, fontSize: 20, fontWeight: '900' },
  emptyTitle: { color: colors.text, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  emptyText: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  footerHint: { color: colors.textFaint, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  detailHeading: { gap: 7, paddingVertical: spacing.xs },
  eyebrow: { color: colors.brand, fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  title: { color: colors.text, fontSize: 26, fontWeight: '900' },
  subtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  selectionCard: { alignItems: 'center', backgroundColor: colors.brand, borderRadius: radius.lg, flexDirection: 'row', gap: spacing.md, padding: spacing.md },
  selectionIcon: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: radius.md, height: 46, justifyContent: 'center', width: 46 },
  selectionIconText: { color: colors.white, fontSize: 15, fontWeight: '900' },
  selectionCopy: { flex: 1, gap: 3 },
  selectionLabel: { color: colors.white, fontSize: 10, opacity: 0.72 },
  selectionName: { color: colors.white, fontSize: 17, fontWeight: '900' },
  selectionMeta: { color: colors.white, fontSize: 10, opacity: 0.78 },
  selectionCount: { color: colors.white, fontSize: 14, fontWeight: '900', lineHeight: 18, textAlign: 'center' },
  detailStats: { flexDirection: 'row', gap: spacing.sm },
  detailListHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  privateHint: { color: colors.textMuted, fontSize: 10 },
  questionCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.sm, padding: spacing.md, ...shadow.card },
  questionTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  questionNumber: { color: colors.brand, fontSize: 12, fontWeight: '900' },
  difficulty: { backgroundColor: colors.surfaceMuted, borderRadius: radius.pill, color: colors.textMuted, fontSize: 10, fontWeight: '700', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4 },
  questionText: { color: colors.text, fontSize: 15, fontWeight: '800', lineHeight: 23 },
  optionRow: { alignItems: 'flex-start', borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, padding: spacing.sm },
  optionLetter: { color: colors.brand, fontSize: 12, fontWeight: '900' },
  optionText: { color: colors.text, flex: 1, fontSize: 12, lineHeight: 18 },
  actions: { gap: spacing.sm, marginTop: spacing.xs },
  primaryButton: { alignItems: 'center', backgroundColor: colors.brand, borderRadius: radius.md, flexDirection: 'row', justifyContent: 'center', minHeight: 52, paddingHorizontal: spacing.md },
  primaryText: { color: colors.white, fontSize: 14, fontWeight: '900' },
  primaryArrow: { color: colors.white, fontSize: 19, marginLeft: spacing.sm },
  secondaryButton: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', minHeight: 48 },
  sharedButton: { backgroundColor: colors.surfaceMuted },
  secondaryText: { color: colors.brandDark, fontSize: 13, fontWeight: '800' },
  backToGroups: { alignItems: 'center', minHeight: 40, justifyContent: 'center' },
  backToGroupsText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
});
