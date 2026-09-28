import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { RefreshControl } from "../components/RefreshControl";
import {
  mobileApi,
  type AuthResponse,
  type DashboardResponse,
  type Question,
} from "../api/client";
import { useCachedQuery } from "../api/useCachedQuery";
import { AnimatedPressable, AnimatedProgressBar } from "../components/Motion";
import { useTheme, useThemedStyles, type ThemeColors } from "../theme";
import type { AppTab, NavigationOptions } from "../types";

type Props = {
  dashboard?: DashboardResponse | null;
  preview?: boolean;
  user?: AuthResponse["user"];
  certificates?: AuthResponse["certificates"];
  onNavigate: (tab: AppTab, options?: NavigationOptions) => void;
};
const demoChapters = [
  {
    name: "计算机基础知识",
    questionCount: 86,
    attemptedCount: 24,
    progress: 28,
  },
  {
    name: "网络体系结构与 TCP/IP",
    questionCount: 382,
    attemptedCount: 92,
    progress: 24,
  },
  {
    name: "局域网与交换技术",
    questionCount: 136,
    attemptedCount: 38,
    progress: 28,
  },
  {
    name: "路由与广域网技术",
    questionCount: 153,
    attemptedCount: 12,
    progress: 8,
  },
];
const demoWrong: Question[] = [
  {
    id: "wrong-preview-1",
    question: "OSPF 接口优先级为 0 时，能否参与 DR/BDR 选举？",
    type: "single_choice",
    options: {},
    chapter: "路由与广域网技术",
    knowledgePoint: "OSPF 选举",
    wrongCount: 4,
  },
  {
    id: "wrong-preview-2",
    question: "交换机收到未知单播帧时，应如何转发？",
    type: "single_choice",
    options: {},
    chapter: "局域网与交换技术",
    knowledgePoint: "以太网交换",
    wrongCount: 2,
  },
  {
    id: "wrong-preview-3",
    question: "OSPF 邻居关系建立时使用哪一种报文？",
    type: "single_choice",
    options: {},
    chapter: "路由与广域网技术",
    knowledgePoint: "OSPF 选举",
    wrongCount: 2,
  },
];
const groupKey = (question: Question) =>
  JSON.stringify([
    question.chapter || "",
    question.knowledgeSection || "",
    question.knowledgePoint || "综合知识",
  ]);

export function TodayScreen({
  dashboard,
  onNavigate,
  preview = false,
  user,
  certificates,
}: Props) {
  const s = useThemedStyles(styles),
    { colors } = useTheme();
  const query = useCachedQuery(
    "/dashboard?summary=1",
    mobileApi.dashboard,
    !preview,
  );
  const catalogQuery = useCachedQuery(
    "/practice/catalog?summary=1",
    mobileApi.practiceCatalogSummary,
    !preview,
  );
  // The full catalog is already persisted for practice. Reuse it on an
  // offline relaunch without downloading the large tree for the home screen.
  const offlineCatalog = useCachedQuery(
    "/practice/catalog",
    mobileApi.practiceCatalog,
    false,
  );
  const catalog = catalogQuery.data ?? offlineCatalog.data;
  const data = query.data || dashboard;
  const chapters = preview ? demoChapters : catalog?.chapters || [];
  const total = preview ? 1204 : catalog?.total;
  const attempted = preview ? 166 : catalog?.attemptedCount;
  const coverage = total
    ? Math.min(100, Math.round(((attempted || 0) / total) * 100))
    : 0;
  const today = preview ? 12 : data?.todayCount;
  const accuracy = preview
    ? "82%"
    : data?.accuracy == null
      ? "—"
      : `${Math.round(data.accuracy * 100)}%`;
  const certificate =
    certificates?.find((item) => item.id === user?.certificateId)?.name ||
    "当前题库";
  const refresh = () => {
    void query.refresh();
    void catalogQuery.refresh();
  };
  return (
    <ScrollView
      contentContainerStyle={s.page}
      showsVerticalScrollIndicator={false}
      refreshControl={
        preview ? undefined : (
          <RefreshControl
            refreshing={!!(query.fetching && data)}
            onRefresh={refresh}
          />
        )
      }
    >
      <View style={s.headingRow}>
        <View>
          <Text style={s.kicker}>
            {new Date().toLocaleDateString("zh-CN", {
              month: "long",
              day: "numeric",
              weekday: "long",
            })}
          </Text>
          <Text style={s.title}>每一步，都有进度</Text>
        </View>
        <Text style={s.brandGlyph}>✦</Text>
      </View>
      {!!(query.error || catalogQuery.error) && (
        <Text style={s.error}>
          进度暂未同步，可下拉重试。
          {data || catalog ? "当前显示上次记录。" : ""}
        </Text>
      )}
      <View style={s.coverage}>
        <Text style={s.label} numberOfLines={1}>
          {certificate} · 刷题进度
        </Text>
        <View style={s.coverageNumbers}>
          <Text style={s.coverageValue}>
            {total === undefined ? "—" : `${coverage}%`}
          </Text>
          <Text style={s.coverageDetail}>
            已刷 {attempted ?? "—"} / {total ?? "—"} 题
          </Text>
        </View>
        <AnimatedProgressBar
          value={coverage}
          color={colors.brand}
          trackColor={colors.border}
        />
        <Text style={s.footnote}>
          按已练习的不同题目统计，重复练习不增加覆盖进度
        </Text>
      </View>
      <View style={s.daily}>
        <View style={s.headingRow}>
          <View>
            <Text style={s.dailyLabel}>每日刷题</Text>
            <Text style={s.dailyTitle}>
              {(today || 0) >= 30 ? "今日目标已完成" : "每天 30 题，稳步向前"}
            </Text>
          </View>
          <Text style={s.dailyCount}>
            {today ?? "—"}
            <Text style={s.dailyUnit}> / 30</Text>
          </Text>
        </View>
        <AnimatedProgressBar
          value={Math.min(100, ((today || 0) / 30) * 100)}
          color="#BDE8D5"
          trackColor="#FFFFFF25"
        />
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel="开始今日学习"
          onPress={() =>
            onNavigate("practice", {
              practiceSession: "daily",
              practiceMode: "random",
              practiceSource: "all",
            })
          }
          style={s.dailyButton}
        >
          <Text style={s.dailyButtonText}>
            {(today || 0) >= 30
              ? "继续每日刷题"
              : today
                ? "继续今日学习"
                : "开始今日学习"}
          </Text>
          <Text style={s.dailyArrow}>→</Text>
        </AnimatedPressable>
      </View>
      <View style={s.metrics}>
        <Metric
          value={String(preview ? 7 : (data?.streakDays ?? "—"))}
          label="连续学习 / 天"
        />
        <Metric value={accuracy} label="累计正确率" />
        <Metric
          value={String(preview ? 18 : (data?.wrongCount ?? "—"))}
          label="待巩固错题"
        />
      </View>
      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>知识点进度</Text>
        <AnimatedPressable
          accessibilityRole="button"
          onPress={() => onNavigate("practice", { practiceMode: "sequential" })}
        >
          <Text style={s.link}>全部 ›</Text>
        </AnimatedPressable>
      </View>
      {catalogQuery.loading && !catalog && !preview ? (
        <ActivityIndicator color={colors.brand} />
      ) : (
        chapters.slice(0, 4).map((chapter) => (
          <AnimatedPressable
            key={chapter.name}
            accessibilityRole="button"
            onPress={() =>
              onNavigate("practice", {
                practiceChapter: chapter.name,
                practiceMode: "sequential",
              })
            }
            style={s.chapterRow}
          >
            <View style={s.headingRow}>
              <Text style={s.rowTitle} numberOfLines={1}>
                {chapter.name}
              </Text>
              <Text style={s.progressText}>{chapter.progress}%</Text>
            </View>
            <AnimatedProgressBar
              value={chapter.progress}
              color={colors.brand}
              trackColor={colors.border}
            />
            <Text style={s.rowMeta}>
              {chapter.attemptedCount} / {chapter.questionCount} 题已练习
            </Text>
          </AnimatedPressable>
        ))
      )}
      {!catalogQuery.loading && !chapters.length && (
        <Text style={s.empty}>当前题库暂无可显示的进度。</Text>
      )}
      <View style={s.quickRow}>
        <AnimatedPressable
          accessibilityRole="button"
          onPress={() => onNavigate("wrong")}
          style={s.quick}
        >
          <Text style={s.quickTitle}>巩固薄弱点</Text>
          <Text style={s.rowMeta}>从错题开始 ›</Text>
        </AnimatedPressable>
        <AnimatedPressable
          accessibilityRole="button"
          onPress={() => onNavigate("exam")}
          style={s.quick}
        >
          <Text style={s.quickTitle}>知识点组卷</Text>
          <Text style={s.rowMeta}>检验学习成果 ›</Text>
        </AnimatedPressable>
      </View>
    </ScrollView>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  const s = useThemedStyles(styles);
  return (
    <View style={s.metric}>
      <Text style={s.metricValue}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </View>
  );
}

export function WrongScreen({ onNavigate, preview = false }: Props) {
  const s = useThemedStyles(styles),
    { colors } = useTheme();
  const query = useCachedQuery("/wrong", mobileApi.wrong, !preview);
  const questions = preview ? demoWrong : query.data || [];
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false),
    [repeatedOnly, setRepeatedOnly] = useState(false);
  const groups = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        name: string;
        chapter?: string;
        section?: string;
        count: number;
        mistakes: number;
        questions: Question[];
      }
    >();
    for (const question of questions) {
      const key = groupKey(question);
      const group = map.get(key) || {
        key,
        name: question.knowledgePoint || "综合知识",
        chapter: question.chapter,
        section: question.knowledgeSection,
        count: 0,
        mistakes: 0,
        questions: [],
      };
      group.count++;
      group.mistakes += question.wrongCount || 1;
      group.questions.push(question);
      map.set(key, group);
    }
    return [...map.values()].sort(
      (a, b) =>
        b.mistakes - a.mistakes ||
        b.count - a.count ||
        a.name.localeCompare(b.name),
    );
  }, [questions]);
  useEffect(() => {
    if (
      selected &&
      query.data &&
      !groups.some((group) => group.key === selected)
    )
      setSelected(null);
  }, [groups, selected, query.data]);
  const selectedGroup = groups.find((group) => group.key === selected);
  const filtered = useMemo(
    () =>
      (selectedGroup?.questions || questions)
        .filter((question) => !repeatedOnly || (question.wrongCount || 1) >= 2)
        .slice()
        .sort((a, b) => (b.wrongCount || 1) - (a.wrongCount || 1)),
    [questions, selectedGroup, repeatedOnly],
  );
  const dueCount = questions.filter(
    (question) =>
      question.review?.dueAt && Date.parse(question.review.dueAt) <= Date.now(),
  ).length;
  const review = (question?: Question) =>
    onNavigate("practice", {
      practiceSource: "wrong",
      practiceMode: "sequential",
      ...(selectedGroup
        ? {
            practiceChapter: selectedGroup.chapter,
            practiceKnowledgeSection: selectedGroup.section,
            practiceKnowledgePoint:
              selectedGroup.name === "综合知识"
                ? undefined
                : selectedGroup.name,
          }
        : {}),
      practiceQuestionId: question?.id,
      practiceQuestionIds: filtered.map((item) => item.id),
    });
  return (
    <FlatList
      data={filtered}
      keyExtractor={(item) => item.id}
      contentContainerStyle={s.page}
      showsVerticalScrollIndicator={false}
      initialNumToRender={10}
      maxToRenderPerBatch={10}
      windowSize={7}
      onRefresh={preview ? undefined : query.refresh}
      refreshing={!!(query.fetching && query.data)}
      ListHeaderComponent={
        <>
          <Text style={s.kicker}>错题复习</Text>
          <Text style={s.title}>找到薄弱，逐个掌握</Text>
          <View style={s.metrics}>
            <Metric value={String(questions.length)} label="待巩固题目" />
            <Metric value={String(dueCount)} label="到期需复习" />
            <Metric
              value={String(
                questions.filter((q) => (q.wrongCount || 1) >= 2).length,
              )}
              label="反复出错"
            />
          </View>
          {!!query.error && (
            <Text style={s.error}>
              错题暂未同步，请下拉重试。
              {questions.length ? "当前显示上次记录。" : ""}
            </Text>
          )}
          {!!groups.length && (
            <>
              <View style={s.sectionHead}>
                <Text style={s.sectionTitle}>优先巩固</Text>
                <Text style={s.rowMeta}>点击定位错题</Text>
              </View>
              {(expanded ? groups : groups.slice(0, 3)).map((group, index) => (
                <AnimatedPressable
                  key={group.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selected === group.key }}
                  onPress={() =>
                    setSelected(selected === group.key ? null : group.key)
                  }
                  style={[s.weakRow, selected === group.key && s.selectedWeak]}
                >
                  <View style={s.weakLine}>
                    <Text style={s.rank}>
                      {String(index + 1).padStart(2, "0")}
                    </Text>
                    <View style={s.flex}>
                      <Text style={s.rowTitle} numberOfLines={2}>
                        {group.name}
                      </Text>
                      <Text style={s.rowMeta} numberOfLines={1}>
                        {group.chapter}
                        {group.section ? ` · ${group.section}` : ""}
                      </Text>
                    </View>
                    <Text style={s.weakCount}>{group.count} 题</Text>
                  </View>
                  <AnimatedProgressBar
                    value={
                      (group.mistakes / Math.max(1, groups[0].mistakes)) * 100
                    }
                    color={colors.gold}
                    trackColor={colors.border}
                  />
                  <Text style={s.rowMeta}>
                    累计错误 {group.mistakes} 次
                    {selected === group.key ? " · 已筛选" : ""}
                  </Text>
                </AnimatedPressable>
              ))}
              {groups.length > 3 && (
                <AnimatedPressable
                  accessibilityRole="button"
                  onPress={() => setExpanded(!expanded)}
                  style={s.expand}
                >
                  <Text style={s.link}>
                    {expanded
                      ? "收起知识点"
                      : `查看全部 ${groups.length} 个知识点`}
                  </Text>
                </AnimatedPressable>
              )}
              <Text style={s.footnote}>
                依据错题数量和重复错误排序，优先复习高频薄弱点。
              </Text>
              <AnimatedPressable
                accessibilityRole="button"
                disabled={!filtered.length}
                onPress={() => review()}
                style={[s.primary, !filtered.length && s.disabled]}
              >
                <Text style={s.primaryText}>
                  {selectedGroup ? "复习所选知识点" : "开始错题复习"} ·{" "}
                  {filtered.length} 题
                </Text>
                <Text style={s.primaryArrow}>→</Text>
              </AnimatedPressable>
              <View style={s.sectionHead}>
                <Text style={s.sectionTitle}>错题清单</Text>
                {selectedGroup && (
                  <AnimatedPressable
                    accessibilityRole="button"
                    onPress={() => setSelected(null)}
                  >
                    <Text style={s.link}>清除知识点筛选 ×</Text>
                  </AnimatedPressable>
                )}
              </View>
              <View style={s.filterRow}>
                {[
                  { value: false, label: "全部错题" },
                  { value: true, label: "反复出错" },
                ].map((filter) => (
                  <AnimatedPressable
                    key={filter.label}
                    accessibilityRole="button"
                    accessibilityState={{
                      selected: repeatedOnly === filter.value,
                    }}
                    onPress={() => setRepeatedOnly(filter.value)}
                    style={[
                      s.filter,
                      repeatedOnly === filter.value && s.filterActive,
                    ]}
                  >
                    <Text
                      style={[
                        s.filterText,
                        repeatedOnly === filter.value && s.filterTextActive,
                      ]}
                    >
                      {filter.label}
                    </Text>
                  </AnimatedPressable>
                ))}
              </View>
            </>
          )}
        </>
      }
      renderItem={({ item, index }) => (
        <AnimatedPressable
          accessibilityRole="button"
          onPress={() => review(item)}
          style={s.questionRow}
        >
          <Text style={s.questionNumber}>{index + 1}</Text>
          <View style={s.flex}>
            <Text style={s.questionTitle} numberOfLines={2}>
              {item.question}
            </Text>
            <Text style={s.rowMeta}>
              {item.knowledgePoint || item.chapter || "综合知识"} · 错{" "}
              {item.wrongCount || 1} 次
            </Text>
          </View>
          <Text style={s.chevron}>›</Text>
        </AnimatedPressable>
      )}
      ListEmptyComponent={
        query.loading && !preview ? (
          <ActivityIndicator color={colors.brand} style={s.emptyLoader} />
        ) : (
          <View style={s.emptyBlock}>
            <Text style={s.emptyTitle}>
              {query.error
                ? "暂时无法读取错题"
                : questions.length
                  ? "当前筛选下没有错题"
                  : "这里会记录你的薄弱点"}
            </Text>
            <Text style={s.empty}>
              {query.error
                ? "下拉页面重新同步。"
                : questions.length
                  ? "切换筛选，继续复习其他知识点。"
                  : "完成练习后，答错的题会自动归集到这里。"}
            </Text>
          </View>
        )
      }
    />
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    page: { padding: 22, paddingTop: 26, paddingBottom: 32 },
    flex: { flex: 1 },
    kicker: { color: c.textMuted, fontSize: 12, marginBottom: 7 },
    title: { color: c.text, fontSize: 25, fontWeight: "800", marginBottom: 6 },
    headingRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    brandGlyph: { color: c.brand, fontSize: 30 },
    label: { color: c.textMuted, fontSize: 13 },
    coverage: { paddingTop: 24, paddingBottom: 23 },
    coverageNumbers: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: 14,
      marginVertical: 12,
    },
    coverageValue: {
      color: c.text,
      fontSize: 40,
      fontWeight: "700",
      letterSpacing: -1.4,
    },
    coverageDetail: { color: c.textMuted, fontSize: 13 },
    footnote: {
      color: c.textMuted,
      fontSize: 11,
      lineHeight: 18,
      marginTop: 10,
    },
    daily: { backgroundColor: c.brand, borderRadius: 18, padding: 19, gap: 15 },
    dailyLabel: { color: "#FFFFFFD0", fontSize: 12 },
    dailyTitle: {
      color: c.white,
      fontSize: 16,
      fontWeight: "700",
      marginTop: 6,
    },
    dailyCount: { color: c.white, fontSize: 25, fontWeight: "700" },
    dailyUnit: { color: "#FFFFFFD0", fontSize: 12, fontWeight: "400" },
    dailyButton: {
      backgroundColor: c.white,
      borderRadius: 11,
      paddingHorizontal: 15,
      minHeight: 46,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    dailyButtonText: { color: "#11664F", fontSize: 15, fontWeight: "700" },
    dailyArrow: { color: "#11664F", fontSize: 23 },
    metrics: {
      flexDirection: "row",
      paddingVertical: 24,
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    metric: { flex: 1, alignItems: "center" },
    metricValue: { color: c.text, fontSize: 23, fontWeight: "700" },
    metricLabel: { color: c.textMuted, fontSize: 11, marginTop: 6 },
    sectionHead: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 8,
      marginTop: 23,
      marginBottom: 13,
    },
    sectionTitle: { color: c.text, fontSize: 17, fontWeight: "700" },
    link: { color: c.brand, fontSize: 12, paddingVertical: 6 },
    chapterRow: {
      gap: 8,
      paddingVertical: 12,
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    rowTitle: { color: c.text, fontSize: 14, fontWeight: "600", flexShrink: 1 },
    progressText: { color: c.brand, fontSize: 14, fontWeight: "700" },
    rowMeta: { color: c.textMuted, fontSize: 11, lineHeight: 17, marginTop: 3 },
    quickRow: { flexDirection: "row", gap: 12, marginTop: 23 },
    quick: {
      flex: 1,
      padding: 15,
      backgroundColor: c.surface,
      borderRadius: 12,
      borderColor: c.border,
      borderWidth: 1,
    },
    quickTitle: { color: c.text, fontSize: 14, fontWeight: "700" },
    error: {
      color: c.warning,
      fontSize: 12,
      lineHeight: 20,
      marginVertical: 8,
    },
    weakRow: {
      padding: 14,
      borderRadius: 13,
      borderColor: c.border,
      borderWidth: 1,
      marginBottom: 10,
      gap: 8,
      backgroundColor: c.surface,
    },
    selectedWeak: { borderColor: c.brand, backgroundColor: c.surfaceMuted },
    weakLine: { flexDirection: "row", alignItems: "center", gap: 10 },
    rank: { color: c.gold, fontSize: 17, fontWeight: "600" },
    weakCount: { color: c.text, fontSize: 13, fontWeight: "600" },
    expand: { alignItems: "center" },
    primary: {
      marginTop: 20,
      borderRadius: 12,
      minHeight: 48,
      paddingHorizontal: 16,
      backgroundColor: c.brand,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    primaryText: { color: c.white, fontSize: 14, fontWeight: "700" },
    primaryArrow: { color: c.white, fontSize: 22 },
    disabled: { opacity: 0.5 },
    filterRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
    filter: {
      paddingHorizontal: 13,
      paddingVertical: 8,
      borderRadius: 9,
      backgroundColor: c.surface,
    },
    filterActive: { backgroundColor: c.brandSoft },
    filterText: { color: c.textMuted, fontSize: 12 },
    filterTextActive: { color: c.brandDark, fontWeight: "600" },
    questionRow: {
      flexDirection: "row",
      gap: 11,
      alignItems: "center",
      paddingVertical: 17,
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    questionNumber: { color: c.textFaint, fontSize: 13, minWidth: 18 },
    questionTitle: { color: c.text, fontSize: 14, lineHeight: 22 },
    chevron: { color: c.textFaint, fontSize: 23 },
    empty: { color: c.textMuted, fontSize: 13, lineHeight: 22, marginTop: 10 },
    emptyBlock: { paddingVertical: 36 },
    emptyTitle: { color: c.text, fontSize: 17, fontWeight: "600" },
    emptyLoader: { marginTop: 35 },
  });
