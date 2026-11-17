import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { mobileApi, type AdminOverview, type AdminPracticeRanking } from '../api/client';
import { AppIcon } from '../components/AppIcon';
import { AnimatedPressable } from '../components/Motion';
import { useThemedStyles, useTheme, type ThemeColors } from '../theme';

const number = (value: number) => value.toLocaleString('zh-CN');
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : '暂时无法读取，请重试';

export function AdminOverviewPanel({ onOpenUser }: { onOpenUser: (id: string) => void }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [days, setDays] = useState<7 | 30>(7);
  const [sort, setSort] = useState<'total' | 'period'>('total');
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [ranking, setRanking] = useState<AdminPracticeRanking | null>(null);
  const [overviewError, setOverviewError] = useState('');
  const [rankingError, setRankingError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setOverview(null);
    setOverviewError('');
    void mobileApi.adminOverview(days, controller.signal).then(
      (value) => { if (!controller.signal.aborted) setOverview(value); },
      (cause) => { if (!controller.signal.aborted) setOverviewError(errorText(cause)); },
    );
    return () => controller.abort();
  }, [days, refresh]);

  useEffect(() => {
    const controller = new AbortController();
    setRanking(null);
    setRankingError('');
    void mobileApi.adminPracticeRanking(days, sort, offset, controller.signal).then(
      (value) => { if (!controller.signal.aborted) setRanking(value); },
      (cause) => { if (!controller.signal.aborted) setRankingError(errorText(cause)); },
    );
    return () => controller.abort();
  }, [days, sort, offset, refresh]);

  const stats = overview?.stats;
  const trend = overview?.trend.slice(-7) || [];
  const maxAttempts = Math.max(1, ...trend.map((day) => day.attempts));
  const metrics = stats ? [
    { label: '注册账号', value: stats.users, detail: `新增 ${number(stats.newUsers)}` },
    { label: '刷题用户', value: stats.activeLearners, detail: `近 ${days} 天` },
    { label: '有效作答', value: stats.attempts, detail: stats.attempts ? `正确率 ${Math.round(100 * stats.correct / stats.attempts)}%` : '近 ' + days + ' 天' },
    { label: '封禁账号', value: stats.bannedUsers, detail: `正常 ${number(stats.users - stats.bannedUsers)}` },
  ] : [];

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.toolbar}>
        <View style={s.segments}>
          {([7, 30] as const).map((value) => (
            <AnimatedPressable key={value} accessibilityRole="button" accessibilityState={{ selected: days === value }}
              onPress={() => { setOffset(0); setDays(value); }} style={[s.segment, days === value && s.selected]}>
              <Text style={[s.meta, days === value && s.accent]}>近 {value} 天</Text>
            </AnimatedPressable>
          ))}
        </View>
        <AnimatedPressable accessibilityRole="button" accessibilityLabel="刷新运营数据" onPress={() => setRefresh((value) => value + 1)} style={s.refresh}>
          <AppIcon name="refresh" size={21} color={colors.brand} />
        </AnimatedPressable>
      </View>
      {!!overviewError && <Text accessibilityRole="alert" style={s.error}>{overviewError}</Text>}
      {!overview && !overviewError && <ActivityIndicator color={colors.brand} accessibilityLabel="正在读取运营数据" />}
      {!!overview && (
        <>
          <View style={s.metrics}>{metrics.map(({ label, value, detail }) => (
            <View key={label} style={s.metric}>
              <Text style={s.meta}>{label}</Text>
              <Text style={s.value}>{number(value)}</Text>
              <Text style={s.detail}>{detail}</Text>
            </View>
          ))}</View>
          <View style={s.panel}>
            <Text accessibilityRole="header" style={s.title}>最近 7 天作答</Text>
            {trend.map((day) => <View key={day.date} style={s.trendRow} accessible accessibilityLabel={`${day.date} 作答 ${day.attempts} 次`}>
              <Text style={s.meta}>{day.date.slice(5)}</Text>
              <View style={s.track}><View style={[s.fill, { width: `${day.attempts / maxAttempts * 100}%` }]} /></View>
              <Text style={s.amount}>{number(day.attempts)}</Text>
            </View>)}
          </View>
          <View style={s.panel}>
            <Text accessibilityRole="header" style={s.title}>题库与 AI</Text>
            <Text style={s.meta}>题库 {number(overview.stats.questions)} 道　待处理反馈 {number(overview.pending.feedback)} 条</Text>
            <Text style={s.meta}>未发布草稿 {number(overview.pending.drafts)} 份　失败或中断任务 {number(overview.pending.failedJobs)} 个</Text>
            <Text style={s.meta}>AI 调用 {number(overview.usage.calls)} 次，成功 {number(overview.usage.successful)} 次</Text>
            <Text style={s.meta}>已知 AI 成本 ¥{overview.usage.knownCostCny.toFixed(2)}{overview.usage.unknownCost > 0 ? `，另有 ${number(overview.usage.unknownCost)} 次未记录成本` : ''}</Text>
          </View>
        </>
      )}
      <View style={s.panel}>
        <Text accessibilityRole="header" style={s.title}>用户刷题排名</Text>
        <View style={s.segments}>
          {(['total', 'period'] as const).map((value) => (
            <AnimatedPressable key={value} accessibilityRole="button" accessibilityState={{ selected: sort === value }}
              onPress={() => { setOffset(0); setSort(value); }} style={[s.segment, sort === value && s.selected]}>
              <Text style={[s.meta, sort === value && s.accent]}>{value === 'total' ? '按累计' : '按所选时段'}</Text>
            </AnimatedPressable>
          ))}
        </View>
        {!!rankingError && <Text accessibilityRole="alert" style={s.error}>{rankingError}</Text>}
        {!ranking && !rankingError && <ActivityIndicator color={colors.brand} accessibilityLabel="正在读取刷题排名" />}
        {!!ranking && (
          <>
            {ranking.rows.map((row, index) => (
              <AnimatedPressable key={row.id} accessibilityRole="button" accessibilityLabel={`查看账号 ${row.username}`}
                onPress={() => onOpenUser(row.id)} style={s.rankRow}>
                <Text style={s.rank}>{ranking.offset + index + 1}</Text>
                <View style={s.rankName}>
                  <Text style={s.name}>{row.communityName || row.username}</Text>
                  {!!row.communityName && <Text style={s.meta}>{row.username}</Text>}
                </View>
                <Text style={s.amount}>{number(sort === 'total' ? row.totalAttempts : row.periodAttempts)} 次</Text>
                <AppIcon name="chevron-right" size={15} color={colors.textMuted} />
              </AnimatedPressable>
            ))}
            {!ranking.rows.length && <Text style={s.meta}>暂无账号记录</Text>}
            {ranking.total > ranking.limit && <View style={s.paging}>
              <AnimatedPressable accessibilityRole="button" disabled={offset === 0} onPress={() => setOffset(Math.max(0, offset - ranking.limit))} style={s.segment}>
                <Text style={[s.meta, offset > 0 && s.accent]}>上一页</Text>
              </AnimatedPressable>
              <Text style={s.meta}>{Math.floor(ranking.offset / ranking.limit) + 1} / {Math.ceil(ranking.total / ranking.limit)}</Text>
              <AnimatedPressable accessibilityRole="button" disabled={offset + ranking.limit >= ranking.total} onPress={() => setOffset(offset + ranking.limit)} style={s.segment}>
                <Text style={[s.meta, offset + ranking.limit < ranking.total && s.accent]}>下一页</Text>
              </AnimatedPressable>
            </View>}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = (c: ThemeColors) => StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  segments: { flexDirection: 'row', alignSelf: 'flex-start', gap: 4, padding: 3, backgroundColor: c.surfaceMuted, borderRadius: 10 },
  segment: { paddingHorizontal: 12, minHeight: 44, justifyContent: 'center', borderRadius: 8 },
  selected: { backgroundColor: c.surface },
  refresh: { width: 48, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.brandSoft },
  accent: { color: c.brandDark, fontWeight: '700' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { flexGrow: 1, flexBasis: '46%', padding: 12, borderRadius: 14, backgroundColor: c.surface, gap: 2 },
  value: { color: c.text, fontSize: 26, fontWeight: '700', fontVariant: ['tabular-nums'] },
  detail: { color: c.brandDark, fontSize: 12 },
  meta: { color: c.textMuted, fontSize: 12 },
  panel: { padding: 14, gap: 8, borderRadius: 14, backgroundColor: c.surface },
  title: { color: c.text, fontSize: 16, fontWeight: '700' },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  track: { flex: 1, height: 5, backgroundColor: c.surfaceMuted, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3, backgroundColor: c.action },
  amount: { minWidth: 39, color: c.text, textAlign: 'right', fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  rank: { minWidth: 26, color: c.textMuted, fontSize: 12, fontVariant: ['tabular-nums'] },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
  rankName: { flex: 1, minWidth: 0 },
  name: { color: c.text, fontSize: 14, fontWeight: '600' },
  paging: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  error: { color: c.warning, fontSize: 13 },
});
