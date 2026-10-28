import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type {
  AiQuestionGenerationSelection,
  AiQuestionGroup,
  Question,
} from '../api/client';
import type { AppTab, NavigationOptions } from '../types';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme';
import { androidAccent, type AndroidAccent } from '../android-design-tokens';
import { generationProgress } from '../aiGenerationPresentation';
import { AppIcon } from '../components/AppIcon';
import { AnimatedPressable } from '../components/Motion';
import { QuestionImages } from '../components/QuestionImages';
import { useAiQuestionDraft } from './useAiQuestionDraft';

export function AiQuestionDraftScreen({
  selection,
  libraryMode = false,
  initialGroupId,
  onBack,
  onNavigate,
}: {
  selection?: AiQuestionGenerationSelection;
  libraryMode?: boolean;
  initialGroupId?: string;
  onBack: () => void;
  onNavigate: (tab: AppTab, options?: NavigationOptions) => void;
}) {
  const { colors } = useTheme(),
    s = useThemedStyles(styles),
    { width, fontScale } = useWindowDimensions();
  const compact = width < 360 || fontScale > 1.2,
    isLibrary = libraryMode || !selection;
  const state = useAiQuestionDraft({ selection, initialGroupId, onNavigate });
  const {
    groups,
    groupDetail,
    group,
    loading,
    busy,
    error,
    activeJob,
    failedJob,
    selectedGroupId,
    latestJob,
  } = state;
  const progress = activeJob ? generationProgress(activeJob) : null;
  const completedJob =
    !activeJob && latestJob?.status === 'completed' ? latestJob : null;
  const back = () => (selectedGroupId ? state.selectGroup('') : onBack());
  const openLibrary = () =>
    onNavigate('practice', { practiceMode: 'ai', practiceAiLibrary: true });
  const icon = (
    name: string,
    tone: AndroidAccent = 'primary',
    large = false,
  ) => (
    <View
      style={[
        large ? s.introIcon : s.icon,
        { backgroundColor: androidAccent(colors, tone).soft },
      ]}
    >
      <AppIcon
        name={name}
        size={large ? 27 : 23}
        color={androidAccent(colors, tone).ink}
      />
    </View>
  );
  const header = (
    <View style={s.header}>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={selectedGroupId ? '返回题组列表' : '返回练习'}
        onPress={back}
        style={s.headerAction}
      >
        <AppIcon name="chevron-left" size={26} color={colors.text} />
      </AnimatedPressable>
      <Text accessibilityRole="header" style={s.headerTitle}>
        {selectedGroupId ? '题组详情' : isLibrary ? '已生成题组' : 'AI 生成'}
      </Text>
      {!selectedGroupId && !isLibrary ? (
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel="查看已生成题组"
          onPress={openLibrary}
          style={s.headerAction}
        >
          <Text style={s.link}>已生成</Text>
        </AnimatedPressable>
      ) : !selectedGroupId ? (
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel="刷新生成题组"
          disabled={loading}
          onPress={state.refresh}
          style={s.headerAction}
        >
          <AppIcon name="refresh" size={22} color={colors.brand} />
        </AnimatedPressable>
      ) : (
        <View style={s.headerAction} />
      )}
    </View>
  );
  function topic(topic: AiQuestionGenerationSelection, change = false) {
    return (
      <View testID="ai-generation-topic" style={s.topicCard}>
        <View style={s.copy}>
          <Text style={s.meta}>{change ? '当前知识点' : '本组知识点'}</Text>
          <Text accessibilityRole="header" style={s.topicTitle}>
            {topic.knowledgePoint}
          </Text>
          <Text style={s.meta}>
            {[topic.chapter, topic.knowledgeSection]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        {change && (
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel="更换生成知识点"
            onPress={onBack}
            style={s.smallAction}
          >
            <Text style={s.link}>更换</Text>
            <AppIcon name="chevron-right" size={18} color={colors.brand} />
          </AnimatedPressable>
        )}
      </View>
    );
  }
  const failure = error || failedJob?.error || failedJob?.progress.message;
  const errorCard = failure ? (
    <View
      testID="ai-generation-error"
      accessibilityLiveRegion="polite"
      style={s.errorCard}
    >
      <View style={s.row}>
        {icon('info', 'review')}
        <View style={s.copy}>
          <Text style={s.cardTitle}>
            {failedJob ? '上次生成未完成' : '暂时没能完成'}
          </Text>
          <Text style={s.body}>{failure}</Text>
        </View>
      </View>
      <View style={s.between}>
        <Text style={[s.meta, s.flex]}>已保存的题组不受影响</Text>
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel="重试读取生成状态"
          onPress={state.refresh}
          style={s.smallAction}
        >
          <Text style={s.link}>重试</Text>
        </AnimatedPressable>
      </View>
    </View>
  ) : null;
  function groupCard(item: AiQuestionGroup) {
    const completed = Math.max(
        0,
        Math.min(item.questionCount, item.completedCount),
      ),
      percent = item.questionCount
        ? Math.round((completed / item.questionCount) * 100)
        : 0;
    return (
      <View testID={'ai-generated-card-' + item.id} style={s.groupCard}>
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={'查看题组 ' + item.id}
          onPress={() => state.selectGroup(item.id)}
          style={s.groupOpen}
        >
          {icon('book')}
          <View style={s.copy}>
            <Text style={s.cardTitle}>
              {item.metadata.knowledgePoint || 'AI 题组'} · 专项练习
            </Text>
            <Text style={s.meta}>
              {item.questionCount} 道题 ·{' '}
              {completed ? `已练 ${completed} 道` : '未开始'}
            </Text>
            {compact && (
              <Text style={s.meta}>{item.shared ? '已共享' : '仅自己'}</Text>
            )}
          </View>
          {!compact && (
            <View style={s.privacy}>
              <AppIcon
                name={item.shared ? 'check-circle' : 'lock'}
                size={14}
                color={colors.textMuted}
              />
              <Text style={s.meta}>{item.shared ? '已共享' : '仅自己'}</Text>
            </View>
          )}
        </AnimatedPressable>
        <View style={s.groupBottom}>
          <View style={s.groupProgress}>
            {completed > 0 ? (
              <>
                <View style={s.track}>
                  <View style={[s.fill, { width: `${percent}%` }]} />
                </View>
                <Text style={s.meta}>{percent}%</Text>
              </>
            ) : (
              <Text style={s.meta}>{formatDate(item.createdAt)}</Text>
            )}
          </View>
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={'练习题组 ' + item.id}
            onPress={() => state.practiceGroup(item)}
            style={s.practiceButton}
          >
            <Text style={s.link}>去练习</Text>
          </AnimatedPressable>
        </View>
      </View>
    );
  }
  const runCard =
    activeJob && progress ? (
      <View
        testID="ai-generation-progress"
        accessibilityLiveRegion="polite"
        style={s.jobCard}
      >
        <View style={s.between}>
          <View style={s.row}>
            <ActivityIndicator size="small" color={colors.brand} />
            <Text style={s.cardTitle}>
              {activeJob.status === 'queued' ? '任务已排队' : '正在生成并复核'}
            </Text>
          </View>
          <Text style={s.link}>{progress.completed}/10</Text>
        </View>
        <Text style={s.body}>
          {activeJob.progress.message || '正在处理这组题目'}
        </Text>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="AI 生成进度"
          accessibilityValue={{ min: 0, max: 10, now: progress.completed }}
          style={s.progressTrack}
        >
          <View style={[s.fill, { width: `${progress.percent}%` }]} />
        </View>
        <Text style={s.meta}>可以离开此页，任务会在后台继续。</Text>
      </View>
    ) : completedJob?.groupId ? (
      <View testID="ai-generation-complete" style={s.completeCard}>
        <View style={s.row}>
          {icon('check-circle', 'progress')}
          <View style={s.copy}>
            <Text style={s.cardTitle}>新题组已准备好</Text>
            <Text style={s.meta}>已保存到你的账号，可以开始练习。</Text>
          </View>
        </View>
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel="打开新生成题组"
          onPress={() => state.selectGroup(completedJob.groupId!)}
          style={s.smallAction}
        >
          <Text style={s.link}>查看题组</Text>
          <AppIcon name="chevron-right" size={18} color={colors.brand} />
        </AnimatedPressable>
      </View>
    ) : null;
  const generateFooter =
    selection && !isLibrary && !selectedGroupId ? (
      <View style={s.footer}>
        <View style={s.footerInfo}>
          <View style={[s.row, s.flex]}>
            <AppIcon name="info" size={17} color={colors.textMuted} />
            <Text style={s.meta}>
              {compact ? '按用量扣积分' : '按实际用量扣积分'}
            </Text>
          </View>
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel="查看生成积分说明"
            onPress={() => onNavigate('vip')}
            style={s.smallAction}
          >
            <Text style={s.meta}>积分说明</Text>
            <AppIcon name="chevron-right" size={17} color={colors.textMuted} />
          </AnimatedPressable>
        </View>
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={
            activeJob ? 'AI 正在后台生成题目' : '生成十道 AI 题目'
          }
          disabled={loading || !!busy || !!activeJob}
          onPress={() => void state.startGeneration()}
          style={[s.primary, (loading || !!busy || !!activeJob) && s.disabled]}
        >
          {busy === 'generate' || activeJob ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <AppIcon name="sparkles" size={23} color={colors.white} />
          )}
          <Text style={s.primaryText}>
            {activeJob
              ? `生成中 ${progress?.completed ?? 0}/10`
              : busy === 'generate'
                ? '正在提交…'
                : '生成 10 道题'}
          </Text>
        </AnimatedPressable>
      </View>
    ) : null;
  if (selectedGroupId) {
    return (
      <View style={s.screen} testID="android-ai-generation-screen">
        {header}
        {!groupDetail || !group ? (
          <View style={s.detailLoading}>
            {loading ? (
              <>
                <ActivityIndicator color={colors.brand} />
                <Text style={s.meta}>正在打开题组…</Text>
              </>
            ) : (
              <>
                {errorCard}
                <AnimatedPressable
                  accessibilityRole="button"
                  onPress={state.refresh}
                  style={s.practiceButton}
                >
                  <Text style={s.link}>重新读取题组</Text>
                </AnimatedPressable>
              </>
            )}
          </View>
        ) : (
          <>
            <FlatList<Question>
              style={s.list}
              contentContainerStyle={s.content}
              data={groupDetail.questions}
              keyExtractor={(q) => q.id}
              initialNumToRender={5}
              maxToRenderPerBatch={5}
              windowSize={7}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                <View style={s.headerContent}>
                  {topic(group.metadata)}
                  <View style={s.stats}>
                    {[
                      { name: '题目数量', value: group.questionCount },
                      { name: '已练题目', value: group.completedCount },
                      {
                        name: '可见范围',
                        value: group.shared ? '已共享' : '仅自己',
                      },
                    ].map((stat) => (
                      <View key={stat.name} style={s.stat}>
                        <Text style={s.statValue}>{stat.value}</Text>
                        <Text style={s.meta}>{stat.name}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={s.between}>
                    <Text accessibilityRole="header" style={s.sectionTitle}>
                      本组题目
                    </Text>
                    <Text style={s.meta}>练习后查看答案</Text>
                  </View>
                  {errorCard}
                </View>
              }
              renderItem={({ item, index }) => (
                <View style={s.questionCard}>
                  <View style={s.between}>
                    <Text style={s.meta}>第 {index + 1} 题</Text>
                    <Text style={s.badgeText}>
                      {item.difficulty === 'easy'
                        ? '基础'
                        : item.difficulty === 'hard'
                          ? '进阶'
                          : '巩固'}
                    </Text>
                  </View>
                  <QuestionImages question={item} />
                  <Text style={s.questionText}>{item.question}</Text>
                </View>
              )}
              ItemSeparatorComponent={() => <View style={s.listGap} />}
              ListFooterComponent={
                state.notice ? (
                  <Text accessibilityLiveRegion="polite" style={s.notice}>
                    {state.notice}
                  </Text>
                ) : null
              }
            />
            <View style={s.detailFooter}>
              <AnimatedPressable
                accessibilityRole="button"
                accessibilityLabel={
                  group.shared ? '取消题组共享' : '共享当前题组'
                }
                disabled={!!busy}
                onPress={() => void state.uploadGroup()}
                style={s.shareButton}
              >
                <Text style={s.link}>
                  {busy === 'upload'
                    ? '正在更新…'
                    : group.shared
                      ? '取消共享'
                      : '共享题组'}
                </Text>
              </AnimatedPressable>
              <AnimatedPressable
                accessibilityRole="button"
                accessibilityLabel="开始刷这组题"
                onPress={() => state.practiceGroup(group)}
                style={[s.primary, s.flex]}
              >
                <Text style={s.primaryText}>开始练习</Text>
                <AppIcon name="arrow" size={22} color={colors.white} />
              </AnimatedPressable>
            </View>
          </>
        )}
      </View>
    );
  }
  return (
    <View style={s.screen} testID="android-ai-generation-screen">
      {header}
      <FlatList<AiQuestionGroup>
        style={s.list}
        contentContainerStyle={s.content}
        data={isLibrary ? groups : groups.slice(0, 3)}
        keyExtractor={(g) => g.id}
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={7}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={s.headerContent}>
            {!isLibrary && selection ? (
              <>
                <View style={s.intro}>
                  {icon('sparkles', 'ai', true)}
                  <View style={s.copy}>
                    <Text style={s.introTitle}>围绕考点，练一组新题</Text>
                    <Text style={s.meta}>一次生成 10 道，附答案与解析</Text>
                  </View>
                </View>
                {topic(selection, true)}
                <View testID="ai-generation-settings" style={s.optionsCard}>
                  <View style={s.between}>
                    <Text accessibilityRole="header" style={s.sectionTitle}>
                      本次生成
                    </Text>
                    <View style={s.badge}>
                      <Text style={s.badgeText}>10 道题</Text>
                    </View>
                  </View>
                  <View style={[s.features, compact && s.featuresStack]}>
                    {[
                      { name: '多角度出题', icon: 'shuffle', tone: 'progress' },
                      {
                        name: '逐题复核',
                        icon: 'check-circle',
                        tone: 'primary',
                      },
                      { name: '完整解析', icon: 'document', tone: 'ai' },
                    ].map((feature) => (
                      <View
                        key={feature.name}
                        style={[s.feature, compact && s.featureRow]}
                      >
                        {icon(feature.icon, feature.tone as AndroidAccent)}
                        <Text style={s.meta}>{feature.name}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </>
            ) : (
              <View style={s.libraryIntro}>
                <Text style={s.meta}>
                  {loading
                    ? '正在读取题组…'
                    : `${groups.length} 组题目，按生成批次保存`}
                </Text>
              </View>
            )}
            {runCard}
            {errorCard}
            <View style={s.sectionHeading}>
              <Text accessibilityRole="header" style={s.sectionTitle}>
                {isLibrary ? '全部生成' : '最近生成'}
              </Text>
              {!isLibrary && (
                <AnimatedPressable
                  accessibilityRole="button"
                  accessibilityLabel="查看全部生成题组"
                  onPress={openLibrary}
                  style={s.smallAction}
                >
                  <Text style={s.meta}>全部</Text>
                  <AppIcon
                    name="chevron-right"
                    size={19}
                    color={colors.textMuted}
                  />
                </AnimatedPressable>
              )}
            </View>
          </View>
        }
        renderItem={({ item }) => groupCard(item)}
        ItemSeparatorComponent={() => <View style={s.listGap} />}
        ListEmptyComponent={
          loading ? (
            <View style={s.empty}>
              <ActivityIndicator color={colors.brand} />
              <Text style={s.meta}>正在读取你的题组…</Text>
            </View>
          ) : !activeJob ? (
            <View testID="ai-generation-empty" style={s.empty}>
              <Text style={s.cardTitle}>
                {isLibrary ? '还没有生成的题组' : '这个知识点还没有题组'}
              </Text>
              <Text style={s.meta}>
                {isLibrary
                  ? '回到练习页，选一个知识点即可生成。'
                  : '点击下方生成，完成后会自动保存在这里。'}
              </Text>
              {isLibrary && (
                <AnimatedPressable
                  accessibilityRole="button"
                  onPress={onBack}
                  style={s.smallAction}
                >
                  <Text style={s.link}>去选择知识点</Text>
                  <AppIcon name="arrow" size={20} color={colors.brand} />
                </AnimatedPressable>
              )}
            </View>
          ) : null
        }
        ListFooterComponent={
          <View style={s.privacyFootnote}>
            <AppIcon name="info" size={17} color={colors.textMuted} />
            <Text style={[s.meta, s.flex]}>
              题组默认仅自己可见，可在详情中共享
            </Text>
          </View>
        }
      />
      {generateFooter}
    </View>
  );
}
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '刚刚生成';
}
const styles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    header: {
      minHeight: 60,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    headerAction: {
      minHeight: 48,
      minWidth: 60,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      minWidth: 0,
      textAlign: 'center',
      color: c.text,
      fontSize: 22,
      lineHeight: 32,
      fontWeight: '700',
    },
    list: { flex: 1 },
    content: {
      padding: 20,
      paddingTop: 12,
      paddingBottom: 20,
      flexGrow: 1,
      maxWidth: 720,
      width: '100%',
      alignSelf: 'center',
    },
    headerContent: { gap: 18 },
    copy: { flex: 1, minWidth: 0, gap: 5 },
    flex: { flex: 1, minWidth: 0 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    between: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    link: { color: c.brand, fontSize: 15, lineHeight: 23, fontWeight: '500' },
    meta: { color: c.textMuted, fontSize: 13, lineHeight: 21, flexShrink: 1 },
    body: { color: c.text, fontSize: 15, lineHeight: 24 },
    sectionTitle: {
      color: c.text,
      fontSize: 18,
      lineHeight: 27,
      fontWeight: '700',
    },
    cardTitle: {
      color: c.text,
      fontSize: 16,
      lineHeight: 25,
      fontWeight: '700',
    },
    smallAction: {
      minHeight: 48,
      minWidth: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingHorizontal: 4,
    },
    icon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    introIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    intro: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingBottom: 2,
    },
    introTitle: {
      fontSize: 19,
      lineHeight: 28,
      fontWeight: '700',
      color: c.text,
    },
    topicCard: {
      backgroundColor: c.surface,
      borderRadius: 22,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    topicTitle: {
      fontSize: 21,
      lineHeight: 30,
      fontWeight: '700',
      color: c.text,
    },
    optionsCard: {
      backgroundColor: c.surface,
      borderRadius: 22,
      padding: 16,
      gap: 18,
    },
    badge: {
      backgroundColor: c.brandSoft,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 10,
    },
    badgeText: {
      color: c.brand,
      fontSize: 14,
      lineHeight: 21,
      fontWeight: '500',
    },
    features: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    featuresStack: { flexDirection: 'column', alignItems: 'stretch', gap: 10 },
    feature: { flex: 1, minWidth: 0, alignItems: 'center', gap: 7 },
    featureRow: {
      flexDirection: 'row',
      justifyContent: 'flex-start',
      minHeight: 44,
      gap: 12,
    },
    sectionHeading: {
      minHeight: 42,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    groupCard: {
      backgroundColor: c.surface,
      borderRadius: 22,
      padding: 16,
      gap: 14,
    },
    groupOpen: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    privacy: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingTop: 2,
    },
    groupBottom: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
    },
    groupProgress: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minWidth: 0,
    },
    progressTrack: { height: 4, borderRadius: 2, backgroundColor: c.border, overflow: "hidden" },
    track: {
      height: 4,
      borderRadius: 2,
      backgroundColor: c.border,
      overflow: 'hidden',
      flex: 1,
    },
    fill: { height: 4, backgroundColor: c.action, borderRadius: 2 },
    practiceButton: {
      minHeight: 48,
      minWidth: 76,
      paddingHorizontal: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.brand,
      alignItems: 'center',
      justifyContent: 'center',
    },
    listGap: { height: 12 },
    privacyFootnote: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      paddingTop: 18,
    },
    empty: {
      backgroundColor: c.surface,
      borderRadius: 20,
      padding: 20,
      gap: 10,
      alignItems: 'center',
      marginTop: 4,
    },
    footer: {
      backgroundColor: c.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      paddingHorizontal: 20,
      paddingTop: 2,
      paddingBottom: 12,
      gap: 2,
    },
    footerInfo: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    primary: {
      minHeight: 52,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 17,
      backgroundColor: c.action,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    primaryText: {
      fontSize: 16,
      lineHeight: 25,
      fontWeight: '700',
      color: c.white,
    },
    disabled: { opacity: 0.55 },
    errorCard: {
      padding: 16,
      borderRadius: 20,
      gap: 10,
      backgroundColor: c.warningSoft,
    },
    jobCard: {
      padding: 16,
      borderRadius: 20,
      gap: 12,
      backgroundColor: c.brandSoft,
    },
    completeCard: {
      padding: 16,
      borderRadius: 20,
      gap: 8,
      backgroundColor: c.successSoft,
    },
    detailLoading: {
      flex: 1,
      padding: 20,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
    },
    stats: { flexDirection: 'row', gap: 8 },
    stat: {
      flex: 1,
      padding: 12,
      borderRadius: 16,
      backgroundColor: c.surface,
      alignItems: 'center',
      gap: 5,
    },
    statValue: {
      fontSize: 20,
      lineHeight: 30,
      fontWeight: '700',
      color: c.text,
    },
    questionCard: {
      backgroundColor: c.surface,
      borderRadius: 20,
      padding: 16,
      gap: 12,
    },
    questionText: { fontSize: 16, lineHeight: 27, color: c.text },
    detailFooter: {
      paddingHorizontal: 20,
      paddingVertical: 12,
      backgroundColor: c.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    shareButton: {
      minHeight: 52,
      minWidth: 76,
      alignItems: 'center',
      justifyContent: 'center',
    },
    notice: { fontSize: 14, lineHeight: 23, color: c.brand, paddingTop: 12 },
    libraryIntro: { paddingVertical: 4 },
  });
