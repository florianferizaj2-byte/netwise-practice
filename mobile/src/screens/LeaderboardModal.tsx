import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { mobileApi, type AuthResponse, type LeaderboardEntry, type LeaderboardResponse } from '../api/client';
import { AppIcon } from '../components/AppIcon';
import { GoldShimmer, leaderboardGold } from '../components/LeaderboardGold';
import { AnimatedPressable } from '../components/Motion';
import { SafeAreaView } from '../components/SafeArea';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme';

const boards = [
  { key: 'answered', label: '刷题量', unit: '题', rule: '按累计作答次数排名', joinHint: '完成一次作答即可上榜' },
  { key: 'accuracy', label: '正确率', unit: '%', rule: '', joinHint: '' },
  { key: 'streakDays', label: '连续学习', unit: '天', rule: '按北京时间统计连续刷题天数', joinHint: '今天完成一次作答即可上榜' },
  { key: 'submitted', label: '提交题目', unit: '题', rule: '按通过核验并提交的题量排名', joinHint: '成功提交题目后即可上榜' },
] as const;
type Board = (typeof boards)[number];

function Avatar({ name, url, size = 36, onAccent = false, gold = false }: {
  name?: string | null;
  url?: string | null;
  size?: number;
  onAccent?: boolean;
  gold?: boolean;
}) {
  const styles = useThemedStyles(gold ? createGoldStyles : createStyles);
  const { colors } = useTheme();
  const [failedUri, setFailedUri] = useState('');
  const uri = url ? mobileApi.resolveDownloadUrl(url) : '';
  const initial = Array.from(name?.trim() || '')[0];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.avatar, onAccent && styles.avatarOnAccent, { width: size, height: size, borderRadius: size / 2 }]}
    >
      {uri && uri !== failedUri ? (
        <Image source={{ uri }} style={styles.avatarImage} onError={() => setFailedUri(uri)} />
      ) : initial ? (
        <Text allowFontScaling={false} style={styles.initial}>{initial.toUpperCase()}</Text>
      ) : (
        <AppIcon name="person" size={size / 2} color={gold ? leaderboardGold(colors).ink : colors.brand} />
      )}
    </View>
  );
}

function Score({ value, unit }: { value: number; unit: Board['unit'] }) {
  const styles = useThemedStyles(createStyles);
  return <Text style={styles.score}>{value.toLocaleString('zh-CN')}<Text style={styles.unit}>{unit === '%' ? '%' : ' ' + unit}</Text></Text>;
}

export function LeaderboardModal({ user, onClose, gold = false }: { user?: AuthResponse['user']; onClose: () => void; gold?: boolean }) {
  const styles = useThemedStyles(gold ? createGoldStyles : createStyles);
  const { colors, reduceMotion } = useTheme();
  const goldColors = gold ? leaderboardGold(colors) : null;
  const { width, fontScale } = useWindowDimensions();
  const [tab, setTab] = useState<Board['key']>('answered');
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setFetching(true);
    setError('');
    void mobileApi.leaderboards(controller.signal).then(
      (next) => {
        if (!controller.signal.aborted) {
          setData(next);
          setFetching(false);
        }
      },
      (cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : '榜单暂时无法加载');
          setFetching(false);
        }
      },
    );
    return () => controller.abort();
  }, [refreshKey]);

  const board = boards.find((board) => board.key === tab) ?? boards[0];
  const result = data?.[board.key];
  const entries = result?.top ?? [];
  const me = user ? result?.me : null;
  const myName = me?.name || user?.communityName?.trim() || '考匠同学';
  const minAttempts = data?.accuracyMinAttempts ?? 20;
  const rule = board.key === 'accuracy' ? `至少作答 ${minAttempts} 次才参与排名` : board.rule;
  const joinHint = board.key === 'accuracy' ? `作答满 ${minAttempts} 次后上榜` : board.joinHint;
  const refresh = () => setRefreshKey((key) => key + 1);
  const compact = width < 360 || fontScale > 1.25;
  const [first, second, third] = entries;
  const podium = !compact && first && second && third ? [second, first, third] : null;

  function renderRow(entry: LeaderboardEntry) {
    const own = !!user && entry.userId === user.id;
    const champion = gold && entry.rank === 1;
    return (
      <View style={[styles.row, own && styles.ownRow, champion && styles.firstRow]}>
        {champion && <GoldShimmer testID="leaderboard-champion-glow" />}
        <Text accessibilityLabel={`第 ${entry.rank} 名`} style={[styles.rank, entry.rank === 1 && styles.gold]}>{entry.rank}</Text>
        <Avatar gold={gold} name={entry.name} url={entry.avatarUrl || (own ? user?.avatarUrl : null)} />
        <View style={styles.person}>
          <Text style={styles.name}>{entry.name}{own ? '（我）' : ''}</Text>
          {board.key === 'accuracy' && <Text style={styles.secondary}>答对 {entry.correct} / {entry.answered} 题</Text>}
        </View>
        <Score value={entry.value} unit={board.unit} />
      </View>
    );
  }

  return (
    <Modal animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose} visible>
      <SafeAreaView style={styles.screen} accessibilityViewIsModal testID="leaderboard-screen">
        <View style={styles.content}>
          <View style={styles.header} testID={gold ? 'gold-leaderboard-header' : undefined}>
            {gold && <GoldShimmer sparkInset={52} testID="leaderboard-title-glow" />}
            <AnimatedPressable accessibilityRole="button" accessibilityLabel="关闭排行榜" onPress={onClose} style={styles.back}>
              <AppIcon name="chevron-left" size={24} color={goldColors?.ink ?? colors.text} />
            </AnimatedPressable>
            <Text accessibilityRole="header" style={styles.title}>排行榜</Text>
            {goldColors && <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.headerTrophy}>
              <AppIcon name="trophy" size={23} color={goldColors.onSolid} />
            </View>}
          </View>
          <View style={[styles.tabs, compact && styles.tabsWrap]} accessibilityRole="tablist">
            {boards.map(({ key, label }) => (
              <AnimatedPressable
                key={key}
                accessibilityRole="tab"
                accessibilityLabel={`${label}榜单`}
                accessibilityState={{ selected: tab === key }}
                onPress={() => setTab(key)}
                style={[styles.tab, compact && styles.tabWide, tab === key && styles.selectedTab]}
              >
                <Text style={[styles.tabText, tab === key && styles.selectedTabText]}>{label}</Text>
              </AnimatedPressable>
            ))}
          </View>

          <Text style={styles.rule}>{rule}</Text>
          {!!error && (
            <View style={styles.error} accessibilityLiveRegion="polite">
              <Text style={styles.errorText}>{data ? '刷新失败，当前显示上次榜单。' : error}</Text>
              <AnimatedPressable accessibilityRole="button" onPress={refresh} style={styles.retry}>
                <Text style={styles.selectedTabText}>重试</Text>
              </AnimatedPressable>
            </View>
          )}
          <FlatList
            key={tab}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            data={podium ? entries.slice(3) : entries}
            keyExtractor={(entry) => entry.userId ?? String(entry.rank)}
            renderItem={({ item }) => renderRow(item)}
            refreshing={fetching && !!data}
            onRefresh={refresh}
            ListHeaderComponent={podium && (
              <View style={styles.podium}>
                {podium.map((entry) => {
                  const isFirst = entry.rank === 1;
                  const own = !!user && entry.userId === user.id;
                  return (
                    <View
                      key={entry.userId ?? entry.rank}
                      accessible
                      accessibilityLabel={`第 ${entry.rank} 名，${entry.name}${own ? '，我' : ''}，${entry.value}${board.unit}`}
                      style={[styles.podiumPlace, isFirst && styles.firstPlace, own && styles.ownPlace]}
                    >
                      {gold && isFirst && <GoldShimmer testID="leaderboard-champion-glow" />}
                      <Avatar gold={gold} name={entry.name} url={entry.avatarUrl || (own ? user?.avatarUrl : null)} size={isFirst ? 56 : 42} />
                      <Text style={[styles.medal, isFirst && styles.firstMedal]}>第 {entry.rank} 名</Text>
                      <Text numberOfLines={2} style={styles.podiumName}>{entry.name}{own ? '（我）' : ''}</Text>
                      <Score value={entry.value} unit={board.unit} />
                    </View>
                  );
                })}
              </View>
            )}
            ListEmptyComponent={fetching && !data ? (
              <View style={styles.empty}><ActivityIndicator color={goldColors?.ink ?? colors.brand} /><Text style={styles.secondary}>正在加载榜单…</Text></View>
            ) : !error && !entries.length ? (
              <View style={styles.empty}><Text style={styles.secondary}>这个榜单还没有上榜记录</Text></View>
            ) : null}
          />

          <View style={styles.ownPanel} testID="leaderboard-own-rank" accessibilityLiveRegion="polite">
            {user ? (
              <>
                <Avatar gold={gold} name={myName} url={me?.avatarUrl || user.avatarUrl} size={40} onAccent />
                <View style={styles.person}>
                  <Text style={styles.ownLabel}>我的排名</Text>
                  <Text style={styles.name}>{myName}</Text>
                  {!me && !!data && <Text style={styles.secondary}>{joinHint}</Text>}
                </View>
                <View style={styles.ownNumbers}>
                  <Text style={styles.ownRank}>{me ? `第 ${me.rank.toLocaleString('zh-CN')} 名` : data ? '未上榜' : '—'}</Text>
                  {me && <Score value={me.value} unit={board.unit} />}
                </View>
              </>
            ) : (
              <Text style={styles.secondary}>登录后可查看自己的排名</Text>
            )}
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (c: ThemeColors, goldTheme = false) => {
 const g = goldTheme ? leaderboardGold(c) : null;
 return StyleSheet.create({
  screen: { flex: 1, backgroundColor: g?.page ?? c.background },
  content: { flex: 1, width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 16 },
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, marginBottom: 10,
    ...(g && { minHeight: 64, padding: 6, backgroundColor: g.bright, borderColor: g.border, borderWidth: 1, borderRadius: 16, overflow: 'hidden' as const }) },
  back: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: g?.soft ?? c.surfaceMuted, borderRadius: 14 },
  title: { color: g?.ink ?? c.text, fontSize: 26, fontWeight: '700', flexShrink: 1 },
  headerTrophy: { marginLeft: 'auto', marginRight: 7, flexShrink: 0, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: g?.solid ?? c.surfaceMuted },
  tabs: { flexDirection: 'row', gap: 3, backgroundColor: g?.soft ?? c.surfaceMuted, borderRadius: 14, padding: 4, ...(g && { borderColor: g.border, borderWidth: StyleSheet.hairlineWidth }) },
  tabsWrap: { flexWrap: 'wrap' },
  tab: { flex: 1, minWidth: 0, minHeight: g ? 48 : 44, paddingHorizontal: 2, justifyContent: 'center', alignItems: 'center', borderRadius: 10 },
  tabWide: { flexBasis: '44%' },
  tabText: { color: g?.ink ?? c.textMuted, fontSize: 13, fontWeight: '500', textAlign: 'center' },
  selectedTab: { backgroundColor: g?.solid ?? c.surface },
  selectedTabText: { color: g?.onSolid ?? c.brandDark, fontWeight: '700', fontSize: 14 },
  rule: { color: c.textMuted, fontSize: 12, paddingVertical: 10 },
  list: { flex: 1 },
  listContent: { paddingBottom: 8 },
  podium: { backgroundColor: g?.panel ?? c.surface, flexDirection: 'row', alignItems: 'flex-end', gap: 3, borderRadius: 20, marginBottom: 10, padding: 6,
    ...(g && { borderColor: g.border, borderWidth: StyleSheet.hairlineWidth }) },
  podiumPlace: { alignItems: 'center', alignSelf: 'stretch', justifyContent: 'flex-end', flex: 1, minWidth: 0, gap: 4, borderRadius: 14, paddingHorizontal: 4, paddingVertical: 12 },
  firstPlace: { backgroundColor: g?.bright ?? c.goldSoft, paddingTop: 18,
    ...(g && { overflow: 'hidden' as const, borderColor: g.border, borderWidth: 1 }) },
  ownPlace: { borderColor: g?.border ?? c.brand, borderWidth: 1 },
  medal: { color: g?.ink ?? c.textMuted, fontSize: 12, fontWeight: '600' },
  firstMedal: { color: g?.onSolid ?? c.gold, fontWeight: '700', ...(g && { backgroundColor: g.solid, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99 }) },
  podiumName: { color: c.text, fontSize: 14, fontWeight: '700', textAlign: 'center', width: '100%' },
  row: { backgroundColor: c.surface, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingVertical: 8, minHeight: 58, borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth },
  ownRow: { backgroundColor: g?.panel ?? c.brandSoft },
  firstRow: { backgroundColor: g?.bright ?? c.goldSoft, borderColor: g?.border ?? c.border, borderWidth: 1, borderRadius: 14, overflow: 'hidden', marginBottom: 4 },
  rank: { minWidth: 32, textAlign: 'center', color: c.textMuted, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  gold: { color: g?.ink ?? c.gold },
  person: { flex: 1, minWidth: 0 },
  name: { color: c.text, fontSize: 15, fontWeight: '700' },
  secondary: { color: c.textMuted, fontSize: 12 },
  score: { color: c.text, textAlign: 'right', fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  unit: { color: c.textMuted, fontSize: 12, fontWeight: '400' },
  avatar: { overflow: 'hidden', backgroundColor: g?.soft ?? c.brandSoft, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  avatarOnAccent: { backgroundColor: c.surface },
  avatarImage: { width: '100%', height: '100%' },
  initial: { color: g?.ink ?? c.brandDark, fontSize: 15, fontWeight: '700' },
  ownPanel: { flexShrink: 0, gap: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: g?.soft ?? c.brandSoft, padding: 12, borderRadius: 16, marginTop: 6, marginBottom: 8,
    ...(g && { borderColor: g.border, borderWidth: 1 }) },
  ownLabel: { color: g?.ink ?? c.brandDark, fontSize: 12, fontWeight: '600' },
  ownRank: { color: g?.ink ?? c.brandDark, fontSize: 17, fontWeight: '700', textAlign: 'right', fontVariant: ['tabular-nums'] },
  ownNumbers: { flexShrink: 1, maxWidth: '44%' },
  error: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.surface, borderRadius: 12, paddingHorizontal: 12, marginBottom: 8 },
  errorText: { flex: 1, color: c.textMuted, fontSize: 13 },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6, ...(g && { backgroundColor: g.solid, borderRadius: 10 }) },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 30 },
 });
};
const createGoldStyles = (c: ThemeColors) => createStyles(c, true);
