import { AppIcon } from '../components/AppIcon';
import { iosStyles } from '../iosStyles';
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppAlert as Alert } from "../components/AppAlert";
import {
  mobileApi,
  type PracticeCatalogChapter,
  type PracticeCatalogResponse,
  type PracticeKnowledgePoint,
} from "../api/client";
import { useCachedQuery } from "../api/useCachedQuery";
import { AnimatedPressable, AnimatedProgressBar } from "../components/Motion";
import { useTheme, useThemedStyles, type ThemeColors } from "../theme";
import type {
  AppTab,
  NavigationOptions,
  PracticeMode,
  PracticeSession,
} from "../types";

type Props = {
  onNavigate: (tab: AppTab, options?: NavigationOptions) => void;
  onPracticeModeChange?: (mode: PracticeMode) => void;
  practiceMode?: PracticeMode;
  practiceSession?: PracticeSession;
  preview?: boolean;
};

const modes: Array<{
  id: PracticeMode;
  title: string;
  hint: string;
  icon: string;
}> = [
  { id: "sequential", title: "顺序刷题", hint: "按顺序巩固", icon: "≡" },
  { id: "random", title: "随机刷题", hint: "打乱顺序练", icon: "⇄" },
  { id: "ai", title: "AI 生成题目", hint: "围绕考点出题", icon: "✦" },
];
const sampleCatalog: PracticeCatalogResponse = {
  total: 30,
  attemptedCount: 12,
  favoriteCount: 3,
  chapters: [
    {
      name: "路由与广域网技术",
      questionCount: 16,
      attemptedCount: 8,
      progress: 50,
      sections: [
        {
          name: "OSPF 路由协议",
          questionCount: 16,
          attemptedCount: 8,
          progress: 50,
          knowledgePoints: [
            {
              name: "OSPF 选举资格",
              knowledgeSection: "OSPF 路由协议",
              questionCount: 8,
              attemptedCount: 5,
              progress: 63,
            },
            {
              name: "OSPF 邻居关系",
              knowledgeSection: "OSPF 路由协议",
              questionCount: 8,
              attemptedCount: 3,
              progress: 38,
            },
          ],
        },
      ],
      knowledgePoints: [
        {
          name: "OSPF 选举资格",
          knowledgeSection: "OSPF 路由协议",
          questionCount: 8,
          attemptedCount: 5,
          progress: 63,
        },
        {
          name: "OSPF 邻居关系",
          knowledgeSection: "OSPF 路由协议",
          questionCount: 8,
          attemptedCount: 3,
          progress: 38,
        },
      ],
    },
    {
      name: "网络基础",
      questionCount: 14,
      attemptedCount: 4,
      progress: 29,
      knowledgePoints: [
        { name: "子网划分", questionCount: 7, attemptedCount: 2, progress: 29 },
        {
          name: "地址与掩码",
          questionCount: 7,
          attemptedCount: 2,
          progress: 29,
        },
      ],
    },
  ],
};
const sectionKey = (chapter: string, section: string) =>
  JSON.stringify([chapter, section]);
const percentage = (value: number) =>
  Math.min(100, Math.max(0, Math.round(value || 0)));

function standalonePoints(chapter: PracticeCatalogChapter) {
  const sections = chapter.sections || [];
  return (chapter.knowledgePoints || []).filter(
    (point) =>
      !sections.some(
        (section) =>
          section.name === point.knowledgeSection &&
          section.knowledgePoints.some((child) => child.name === point.name),
      ),
  );
}

export function PracticeHubScreen({
  onNavigate,
  onPracticeModeChange,
  practiceMode = "sequential",
  practiceSession = "standard",
  preview = false,
}: Props) {
  const s = useThemedStyles(styles, iosStyles.practiceHub),
    { colors } = useTheme();
  const query = useCachedQuery(
    "/practice/catalog",
    mobileApi.practiceCatalog,
    !preview,
  );
  const catalog = preview ? sampleCatalog : query.data;
  const [search, setSearch] = useState("");
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set(),
  );
  const daily = practiceSession === "daily",
    ai = !daily && practiceMode === "ai";
  const needle = search.trim().toLowerCase();
  const progress = catalog?.total
    ? percentage((catalog.attemptedCount / catalog.total) * 100)
    : 0;
  const chapters = useMemo(() => {
    if (!needle) return catalog?.chapters || [];
    return (catalog?.chapters || []).flatMap((chapter) => {
      if (chapter.name.toLowerCase().includes(needle)) return [chapter];
      const sections = (chapter.sections || [])
        .map((section) => ({
          ...section,
          knowledgePoints: section.name.toLowerCase().includes(needle)
            ? section.knowledgePoints
            : section.knowledgePoints.filter((point) =>
                point.name.toLowerCase().includes(needle),
              ),
        }))
        .filter(
          (section) =>
            section.knowledgePoints.length ||
            section.name.toLowerCase().includes(needle),
        );
      const knowledgePoints = (chapter.knowledgePoints || []).filter(
        (point) =>
          point.name.toLowerCase().includes(needle) ||
          point.knowledgeSection?.toLowerCase().includes(needle),
      );
      return sections.length || knowledgePoints.length
        ? [{ ...chapter, sections, knowledgePoints }]
        : [];
    });
  }, [catalog, needle]);
  const chapterNumbers = useMemo(
    () =>
      new Map(
        (catalog?.chapters || []).map((chapter, index) => [
          chapter.name,
          index + 1,
        ]),
      ),
    [catalog],
  );

  function chooseMode(mode: PracticeMode) {
    if (onPracticeModeChange) onPracticeModeChange(mode);
    else
      onNavigate("practice", {
        practiceMode: mode,
        practiceSession: "standard",
        practiceSource: "all",
      });
  }
  function begin(chapter?: string, section?: string, point?: string) {
    if (ai && preview) {
      Alert.alert(
        "登录后使用 AI 出题",
        "选择知识点后，可生成经过二次复核的 10 道新题。",
      );
      return;
    }
    onNavigate("practice", {
      practiceMode: daily ? "random" : practiceMode,
      practiceSession: daily ? "daily" : "standard",
      practiceSource: "all",
      practiceChapter: chapter,
      practiceKnowledgeSection: section,
      practiceKnowledgePoint: point,
      practiceSelectionComplete: daily,
    });
  }
  function toggleChapter(name: string) {
    setExpandedChapters((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }
  function toggleSection(chapter: string, name: string) {
    const key = sectionKey(chapter, name);
    setExpandedSections((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  const pointAction = ai ? "AI 出题" : daily ? "选此考点" : "开始练习";
  function renderPoint(
    chapter: string,
    point: PracticeKnowledgePoint,
    section?: string,
  ) {
    return (
      <AnimatedPressable
        key={JSON.stringify([
          section || point.knowledgeSection || "",
          point.name,
        ])}
        accessibilityRole="button"
        accessibilityLabel={`${pointAction}：${point.name}，已刷 ${point.attemptedCount} / ${point.questionCount} 题`}
        disabled={!point.questionCount}
        onPress={() =>
          begin(chapter, section || point.knowledgeSection, point.name)
        }
        style={[s.point, !point.questionCount && s.disabled]}
      >
        <View style={s.pointDot} />
        <View style={s.grow}>
          <Text style={s.pointName}>{point.name}</Text>
          <Text style={s.meta}>
            已刷 {point.attemptedCount} / {point.questionCount} 题 ·{" "}
            {percentage(point.progress)}%
          </Text>
        </View>
        <Text style={s.pointAction}>
          {ai ? "出题" : daily ? "选择" : "练习"} ›
        </Text>
      </AnimatedPressable>
    );
  }

  return (
    <FlatList
      style={s.screen}
      contentContainerStyle={s.page}
      data={chapters}
      keyExtractor={(chapter) => chapter.name}
      initialNumToRender={5}
      maxToRenderPerBatch={5}
      windowSize={7}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      onRefresh={preview ? undefined : query.refresh}
      refreshing={!!(query.fetching && catalog)}
      extraData={{ expandedChapters, expandedSections, practiceMode, needle }}
      ListHeaderComponent={
        <>
          <View style={s.heading}>
            <View style={s.grow}>
              <Text style={s.title}>
                {daily ? "选择今日练习范围" : "题库练习"}
              </Text>
              <Text style={s.headingMeta}>
                {catalog
                  ? `${catalog.total.toLocaleString()} 道题 · 已刷 ${catalog.attemptedCount.toLocaleString()} 道`
                  : "正在同步题库进度…"}
              </Text>
            </View>
            <View style={s.progressBadge}>
              <Text style={s.progressValue}>
                {catalog ? `${progress}%` : "—"}
              </Text>
              <Text style={s.progressLabel}>已练习</Text>
            </View>
          </View>
          <View style={s.overviewProgress}>
            <AnimatedProgressBar
              value={progress}
              color={colors.brand}
              trackColor={colors.border}
            />
          </View>

          {!daily && (
            <>
              <View style={s.modeRow}>
                {modes.map((mode) => {
                  const selected = practiceMode === mode.id;
                  return (
                    <AnimatedPressable
                      key={mode.id}
                      accessibilityRole="radio"
                      accessibilityLabel={mode.title}
                      accessibilityState={{ checked: selected }}
                      onPress={() => chooseMode(mode.id)}
                      style={[s.mode, selected && s.modeSelected]}
                    >
                      <View style={s.modeTop}>
                        <AppIcon style={[s.modeGlyph, selected && s.activeText]}>
                          {mode.icon}
                        </AppIcon>
                        <View
                          style={[
                            s.selectionDot,
                            selected && s.selectionDotActive,
                          ]}
                        >
                          {selected && <View style={s.selectionDotCenter} />}
                        </View>
                      </View>
                      <Text style={[s.modeTitle, selected && s.activeText]}>
                        {mode.title}
                      </Text>
                      <Text style={s.modeHint}>{mode.hint}</Text>
                    </AnimatedPressable>
                  );
                })}
              </View>
              <View style={s.libraryRow}>
                <AnimatedPressable
                  accessibilityRole="button"
                  accessibilityLabel="进入收藏题目"
                  onPress={() =>
                    onNavigate("practice", {
                      practiceMode:
                        practiceMode === "random" ? "random" : "sequential",
                      practiceSource: "favorites",
                    })
                  }
                  style={s.library}
                >
                  <View style={[s.libraryIcon, s.favoriteIcon]}>
                    <AppIcon style={s.favoriteGlyph}>★</AppIcon>
                  </View>
                  <View style={s.grow}>
                    <Text style={s.libraryTitle}>收藏题目</Text>
                    <Text style={s.libraryMeta}>
                      {catalog
                        ? `${catalog.favoriteCount} 道已收藏`
                        : "查看我的收藏"}
                    </Text>
                  </View>
                  <AppIcon style={s.chevron}>›</AppIcon>
                </AnimatedPressable>
                <AnimatedPressable
                  accessibilityRole="button"
                  accessibilityLabel="进入已生成题目"
                  onPress={() => {
                    if (preview) {
                      Alert.alert(
                        "登录后查看题组",
                        "生成的 AI 题目按批次保存在这里，可以练习或上传。",
                      );
                      return;
                    }
                    onNavigate("practice", {
                      practiceMode: "ai",
                      practiceAiLibrary: true,
                    });
                  }}
                  style={s.library}
                >
                  <View style={s.libraryIcon}>
                    <AppIcon style={s.generatedGlyph}>✦</AppIcon>
                  </View>
                  <View style={s.grow}>
                    <Text style={s.libraryTitle}>已生成题目</Text>
                    <Text style={s.libraryMeta}>按题组刷题 / 上传</Text>
                  </View>
                  <AppIcon style={s.chevron}>›</AppIcon>
                </AnimatedPressable>
              </View>
            </>
          )}

          <View style={[s.modeNotice, ai && s.aiNotice]}>
            <AppIcon name="info" style={s.noticeMark}>{ai ? "✦" : "·"}</AppIcon>
            <Text style={s.noticeText}>
              {daily
                ? "从所选范围随机抽取 30 题，不足时从全题库补充。"
                : ai
                  ? "展开目录，选择具体考点。每组 10 题，逐题二次复核。"
                  : practiceMode === "random"
                    ? "选择练习范围后，打乱题目顺序开始刷题。"
                    : "可以练习整个大知识点，也可以展开后选择子知识点。"}
            </Text>
          </View>

          {daily && (
            <AnimatedPressable
              accessibilityRole="button"
              disabled={!catalog?.total}
              onPress={() => begin()}
              style={[s.dailyAll, !catalog?.total && s.disabled]}
            >
              <View style={s.grow}>
                <Text style={s.dailyAllTitle}>全题库随机抽题</Text>
                <Text style={s.meta}>从当前题库中组合 30 道题</Text>
              </View>
              <Text style={s.link}>开始 ›</Text>
            </AnimatedPressable>
          )}

          <View style={s.catalogHeading}>
            <View style={s.grow}>
              <Text style={s.sectionTitle}>知识点目录</Text>
              <Text style={s.meta}>
                {catalog
                  ? `${catalog.chapters.length} 个大知识点 · 点击标题展开`
                  : "大知识点 / 子知识点 / 具体考点"}
              </Text>
            </View>
            {!needle &&
              (expandedChapters.size > 0 || expandedSections.size > 0) && (
                <AnimatedPressable
                  accessibilityRole="button"
                  accessibilityLabel="收起全部知识点"
                  onPress={() => {
                    setExpandedChapters(new Set());
                    setExpandedSections(new Set());
                  }}
                  style={s.collapse}
                >
                  <Text style={s.link}>收起全部</Text>
                </AnimatedPressable>
              )}
          </View>
          <View style={s.searchBox}>
            <View style={s.searchIcon}>
              <View style={s.searchLens} />
              <View style={s.searchHandle} />
            </View>
            <TextInput
              accessibilityLabel="搜索知识点"
              placeholder="搜索知识点或子知识点"
              placeholderTextColor={colors.textFaint}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              style={s.searchInput}
            />
            {!!search && (
              <AnimatedPressable
                accessibilityRole="button"
                accessibilityLabel="清除知识点搜索"
                onPress={() => setSearch("")}
                style={s.clearSearch}
              >
                <AppIcon style={s.clearText}>×</AppIcon>
              </AnimatedPressable>
            )}
          </View>
          {!!needle && (
            <Text style={s.searchHint}>
              匹配 {chapters.length} 个大知识点 · 清空搜索可查看全部
            </Text>
          )}
          {!preview && !!query.error && (
            <View style={s.errorNotice}>
              <Text style={s.errorText}>
                {catalog
                  ? "题库暂未同步，当前显示上次记录。"
                  : "暂时无法读取题库，请重试。"}
              </Text>
              <AnimatedPressable
                accessibilityRole="button"
                onPress={() => void query.refresh()}
                style={s.retry}
              >
                <Text style={s.link}>重试</Text>
              </AnimatedPressable>
            </View>
          )}
        </>
      }
      renderItem={({ item: chapter }) => {
        const open = !!needle || expandedChapters.has(chapter.name);
        const sections = chapter.sections || [],
          points = standalonePoints(chapter);
        const hasChildren = sections.length > 0 || points.length > 0;
        return (
          <View style={[s.chapter, open && s.chapterOpen]}>
            <View style={s.chapterHeading}>
              <AnimatedPressable
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                accessibilityLabel={`${open ? "收起" : "展开"} ${chapter.name} 的子知识点`}
                disabled={!hasChildren || !!needle}
                onPress={() => toggleChapter(chapter.name)}
                style={s.chapterToggle}
              >
                <View style={[s.chapterNumber, open && s.chapterNumberOpen]}>
                  <Text style={[s.chapterNumberText, open && s.activeText]}>
                    {String(chapterNumbers.get(chapter.name) || 1).padStart(
                      2,
                      "0",
                    )}
                  </Text>
                </View>
                <View style={s.grow}>
                  <Text style={s.chapterTitle}>{chapter.name}</Text>
                  <Text style={s.meta}>
                    {chapter.questionCount} 道题 · 已刷 {chapter.attemptedCount}{" "}
                    道
                  </Text>
                </View>
                {hasChildren && (
                  <AppIcon style={s.expandGlyph}>{open ? "⌃" : "⌄"}</AppIcon>
                )}
              </AnimatedPressable>
            </View>
            <View style={s.chapterBottom}>
              <View style={s.chapterProgress}>
                <AnimatedProgressBar
                  value={percentage(chapter.progress)}
                  color={colors.brand}
                  trackColor={colors.border}
                />
              </View>
              <Text style={s.progressPercent}>
                {percentage(chapter.progress)}%
              </Text>
              {!ai && (
                <AnimatedPressable
                  accessibilityRole="button"
                  accessibilityLabel={`${daily ? "选择" : "练习"}整个大知识点 ${chapter.name}`}
                  disabled={!chapter.questionCount}
                  onPress={() => begin(chapter.name)}
                  style={[s.chapterStart, !chapter.questionCount && s.disabled]}
                >
                  <Text style={s.chapterStartText}>
                    {daily ? "选择本章" : "练习本章"} ›
                  </Text>
                </AnimatedPressable>
              )}
            </View>
            {open && hasChildren && (
              <View style={s.children}>
                {sections.map((section) => {
                  const key = sectionKey(chapter.name, section.name),
                    sectionOpen = !!needle || expandedSections.has(key);
                  return (
                    <View key={key} style={s.section}>
                      <View style={s.sectionRow}>
                        <AnimatedPressable
                          accessibilityRole="button"
                          accessibilityState={{ expanded: sectionOpen }}
                          accessibilityLabel={`${sectionOpen ? "收起" : "展开"} ${section.name} 的考点`}
                          disabled={!section.knowledgePoints.length || !!needle}
                          onPress={() =>
                            toggleSection(chapter.name, section.name)
                          }
                          style={s.sectionToggle}
                        >
                          <AppIcon style={s.sectionChevron}>
                            {sectionOpen ? "⌃" : "⌄"}
                          </AppIcon>
                          <View style={s.grow}>
                            <Text style={s.sectionName}>{section.name}</Text>
                            <Text style={s.meta}>
                              已刷 {section.attemptedCount} /{" "}
                              {section.questionCount} 题 ·{" "}
                              {percentage(section.progress)}%
                            </Text>
                          </View>
                        </AnimatedPressable>
                        {!ai && (
                          <AnimatedPressable
                            accessibilityRole="button"
                            accessibilityLabel={`${daily ? "选择" : "练习"}子知识点 ${section.name}`}
                            disabled={!section.questionCount}
                            onPress={() => begin(chapter.name, section.name)}
                            style={[
                              s.sectionStart,
                              !section.questionCount && s.disabled,
                            ]}
                          >
                            <Text style={s.pointAction}>
                              {daily ? "选择" : "练习"} ›
                            </Text>
                          </AnimatedPressable>
                        )}
                      </View>
                      {sectionOpen && (
                        <View style={s.sectionPoints}>
                          {section.knowledgePoints.map((point) =>
                            renderPoint(chapter.name, point, section.name),
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
                {!!points.length && (
                  <View style={s.directPoints}>
                    {!!sections.length && (
                      <Text style={s.otherPoints}>其他考点</Text>
                    )}
                    {points.map((point) => renderPoint(chapter.name, point))}
                  </View>
                )}
              </View>
            )}
          </View>
        );
      }}
      ListEmptyComponent={
        !preview && query.loading ? (
          <View style={s.empty}>
            <ActivityIndicator color={colors.brand} />
            <Text style={s.emptyText}>正在读取知识点…</Text>
          </View>
        ) : query.error && !catalog && !preview ? null : (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>
              {needle ? "没有找到这个知识点" : "当前题库还没有知识点"}
            </Text>
            <Text style={s.emptyText}>
              {needle
                ? "换一个关键词，或清空搜索查看完整目录。"
                : "请在“我的”中选择并同步证书题库。"}
            </Text>
            {!!needle && (
              <AnimatedPressable
                accessibilityRole="button"
                onPress={() => setSearch("")}
                style={s.retry}
              >
                <Text style={s.link}>查看全部知识点</Text>
              </AnimatedPressable>
            )}
          </View>
        )
      }
      ListFooterComponent={
        !!chapters.length ? (
          <Text style={s.footer}>进度按已练习的不同题目统计</Text>
        ) : null
      }
    />
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    page: { padding: 20, paddingTop: 23, paddingBottom: 30 },
    grow: { flex: 1, minWidth: 0 },
    heading: { flexDirection: "row", alignItems: "center", gap: 14 },
    title: { color: c.text, fontSize: 25, fontWeight: "800", lineHeight: 34 },
    headingMeta: { color: c.textMuted, fontSize: 12, marginTop: 5 },
    progressBadge: { alignItems: "flex-end", minWidth: 48 },
    progressValue: {
      color: c.brand,
      fontSize: 25,
      fontWeight: "700",
      fontVariant: ["tabular-nums"],
    },
    progressLabel: { color: c.textMuted, fontSize: 10, marginTop: 3 },
    overviewProgress: { marginTop: 16, marginBottom: 20 },
    modeRow: { flexDirection: "row", gap: 9 },
    mode: {
      flex: 1,
      padding: 12,
      paddingVertical: 13,
      borderRadius: 13,
      borderColor: c.border,
      borderWidth: 1,
      backgroundColor: c.surface,
    },
    modeSelected: { borderColor: c.brand, backgroundColor: c.surfaceMuted },
    modeTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    modeGlyph: { color: c.textMuted, fontSize: 26, lineHeight: 29 },
    modeTitle: {
      color: c.text,
      fontSize: 13,
      fontWeight: "700",
      lineHeight: 20,
    },
    modeHint: {
      color: c.textMuted,
      fontSize: 10,
      lineHeight: 15,
      marginTop: 3,
    },
    activeText: { color: c.brandDark },
    selectionDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
    },
    selectionDotActive: { borderColor: c.brand },
    selectionDotCenter: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: c.brand,
    },
    libraryRow: { flexDirection: "row", gap: 10, marginTop: 12 },
    library: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 15,
      paddingHorizontal: 10,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
    },
    libraryIcon: {
      width: 28,
      height: 28,
      borderRadius: 9,
      backgroundColor: c.brandSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    favoriteIcon: { backgroundColor: c.goldSoft },
    favoriteGlyph: { color: c.gold, fontSize: 17 },
    generatedGlyph: { color: c.brandDark, fontSize: 18 },
    libraryTitle: {
      color: c.text,
      fontSize: 13,
      fontWeight: "700",
      lineHeight: 20,
    },
    libraryMeta: {
      color: c.textMuted,
      fontSize: 10,
      lineHeight: 15,
      marginTop: 2,
    },
    chevron: { color: c.textFaint, fontSize: 20 },
    modeNotice: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 7,
      paddingVertical: 13,
    },
    aiNotice: {
      backgroundColor: c.surfaceMuted,
      marginTop: 12,
      borderRadius: 10,
      paddingHorizontal: 11,
    },
    noticeMark: { color: c.brand, fontSize: 14, lineHeight: 19 },
    noticeText: { flex: 1, color: c.textMuted, fontSize: 11, lineHeight: 19 },
    catalogHeading: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginTop: 7,
      marginBottom: 12,
    },
    sectionTitle: { color: c.text, fontSize: 17, fontWeight: "700" },
    meta: { color: c.textMuted, fontSize: 11, lineHeight: 18, marginTop: 3 },
    link: { color: c.brand, fontSize: 12, fontWeight: "600" },
    collapse: { minHeight: 44, justifyContent: "center" },
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      minHeight: 44,
      paddingLeft: 13,
      backgroundColor: c.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 15,
    },
    searchInput: {
      flex: 1,
      color: c.text,
      fontSize: 13,
      paddingVertical: 11,
      minWidth: 0,
    },
    searchIcon: { width: 17, height: 17 },
    searchLens: {
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: c.textFaint,
    },
    searchHandle: {
      position: "absolute",
      height: 1.5,
      width: 7,
      backgroundColor: c.textFaint,
      transform: [{ rotate: "45deg" }],
      left: 9,
      top: 12,
    },
    clearSearch: {
      width: 42,
      minHeight: 42,
      alignItems: "center",
      justifyContent: "center",
    },
    clearText: { color: c.textMuted, fontSize: 21 },
    searchHint: { color: c.textMuted, fontSize: 11, marginBottom: 13 },
    chapter: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      marginBottom: 11,
      backgroundColor: c.surface,
      overflow: "hidden",
    },
    chapterOpen: { borderColor: c.brand },
    chapterHeading: { paddingHorizontal: 14, paddingTop: 13 },
    chapterToggle: {
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      minHeight: 48,
    },
    chapterNumber: {
      width: 29,
      height: 31,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.background,
    },
    chapterNumberOpen: { backgroundColor: c.brandSoft },
    chapterNumberText: {
      color: c.textMuted,
      fontSize: 12,
      fontWeight: "700",
      fontVariant: ["tabular-nums"],
    },
    chapterTitle: {
      color: c.text,
      fontSize: 15,
      fontWeight: "700",
      lineHeight: 23,
    },
    expandGlyph: {
      color: c.textMuted,
      fontSize: 22,
      width: 20,
      textAlign: "center",
    },
    chapterBottom: {
      paddingHorizontal: 14,
      paddingBottom: 10,
      paddingTop: 4,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minHeight: 43,
    },
    chapterProgress: { flex: 1 },
    progressPercent: {
      color: c.brand,
      fontSize: 11,
      minWidth: 30,
      textAlign: "right",
      fontVariant: ["tabular-nums"],
    },
    chapterStart: {
      paddingHorizontal: 10,
      minHeight: 36,
      justifyContent: "center",
      borderRadius: 8,
      backgroundColor: c.surfaceMuted,
    },
    chapterStartText: { color: c.brandDark, fontSize: 11, fontWeight: "600" },
    children: {
      borderTopColor: c.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: 14,
      backgroundColor: c.background,
    },
    section: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    sectionRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    sectionToggle: {
      flex: 1,
      minHeight: 65,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    sectionChevron: {
      color: c.textFaint,
      fontSize: 19,
      width: 16,
      textAlign: "center",
    },
    sectionName: {
      color: c.text,
      fontSize: 13,
      fontWeight: "600",
      lineHeight: 21,
    },
    sectionStart: {
      paddingHorizontal: 8,
      minHeight: 44,
      justifyContent: "center",
    },
    sectionPoints: {
      marginLeft: 7,
      borderLeftWidth: 1,
      borderLeftColor: c.border,
      paddingLeft: 12,
    },
    directPoints: { paddingHorizontal: 2 },
    otherPoints: { color: c.textMuted, fontSize: 11, paddingTop: 14 },
    point: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      paddingVertical: 13,
      minHeight: 59,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    pointDot: {
      backgroundColor: c.brand,
      width: 4,
      height: 4,
      borderRadius: 2,
    },
    pointName: { color: c.text, fontSize: 13, lineHeight: 21 },
    pointAction: { color: c.brand, fontSize: 12, paddingVertical: 5 },
    dailyAll: {
      flexDirection: "row",
      alignItems: "center",
      padding: 15,
      gap: 12,
      borderRadius: 12,
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 16,
    },
    dailyAllTitle: { color: c.text, fontWeight: "700", fontSize: 14 },
    disabled: { opacity: 0.5 },
    errorNotice: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 12,
    },
    errorText: { flex: 1, color: c.warning, fontSize: 12, lineHeight: 20 },
    retry: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
    empty: { alignItems: "center", paddingVertical: 32, gap: 10 },
    emptyTitle: { color: c.text, fontSize: 15, fontWeight: "600" },
    emptyText: {
      color: c.textMuted,
      fontSize: 12,
      lineHeight: 21,
      textAlign: "center",
    },
    footer: {
      color: c.textFaint,
      fontSize: 11,
      textAlign: "center",
      paddingTop: 12,
      paddingBottom: 4,
    },
  });
