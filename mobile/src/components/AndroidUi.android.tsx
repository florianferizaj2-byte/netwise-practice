import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { AppIcon } from './AppIcon';
import { AnimatedPressable } from './Motion.android';
import { AppAlert } from './AppAlert';
import { useAndroidPoints } from './AndroidPointsBar.android';
import { androidPointsFlow } from '../api/androidPointsRuntime.android';
import { formatPointUnits } from '../api/androidPointsFlow.android';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme';
import type { AuthResponse } from '../api/client';
import { androidAccent } from '../android-design-tokens';

export type AndroidCertificateProps = {
  user?: AuthResponse['user'];
  certificates?: AuthResponse['certificates'];
  onOpenCertificatePicker?: () => void;
};

export function AndroidPageHeader({ title = '今日', action }: AndroidCertificateProps & { title?: string; action?: { label: string; onPress: () => void } }) {
  const s = useThemedStyles(styles), { colors } = useTheme();
  const tone = androidAccent(colors, title === '练习' ? 'practice' : title === '错题' ? 'review' : title === '考试' ? 'exam' : 'primary');
  const icon = title === '练习' ? 'book' : title === '错题' ? 'wrong' : title === '考试' ? 'exam' : title === '我的' ? 'person' : 'home';
  return <View testID="android-page-header" style={s.header}>
    <View style={s.headerIdentity}><View style={[s.headerIcon, { backgroundColor: tone.soft }]}><AppIcon name={icon} size={25} color={tone.ink}/></View><Text accessibilityRole="header" style={s.brand}>{title}</Text></View>
    {action ? <AnimatedPressable accessibilityRole="button" onPress={action.onPress} style={s.headerAction}>
      <AppIcon name="settings" size={23} color={colors.textMuted}/><Text style={s.actionText}>{action.label}</Text>
    </AnimatedPressable> : null}
  </View>;
}

export function AndroidPointsLink({ userId, compact = false, membership = false }: { userId?: string; compact?: boolean; membership?: boolean }) {
  const s = useThemedStyles(styles), { colors } = useTheme(), state = useAndroidPoints();
  const {fontScale} = useWindowDimensions();
  const owned = !!userId && state.ownerKey?.split(':')[0] === userId;
  const wallet = owned ? state.wallet : null, error = owned ? state.error : '';
  const balance = wallet ? `${formatPointUnits(wallet.availableUnits, wallet.scale)} 积分` : '积分与费用';
  const held = wallet ? formatPointUnits(wallet.heldUnits, wallet.scale) : '';
  const open = () => userId ? androidPointsFlow.showDetails() : AppAlert.alert('登录后查看积分', '登录后可查看当前账号的可用积分、服务费用和使用记录。');
  return <View testID={membership?'profile-points-summary':undefined} style={[s.pointsWrap,membership&&s.memberPointsWrap]}>
    <View style={s.pointsRow}>
      <AnimatedPressable accessibilityRole="button" accessibilityLabel="查看可用AI积分、服务费用和积分记录"
        accessibilityValue={{text:wallet?`可用${balance}，预扣${held}积分`:'积分余额尚未同步'}} onPress={open}
        style={[membership?s.memberPoints:compact ? s.pointsCompact : s.points, s.pointsGrow]}>
        {!membership&&<AppIcon name="sparkles" size={16} color={colors.brand}/>}
        <View style={[s.pointsGrow,membership&&s.memberBalanceContent,membership&&fontScale>1.25&&s.memberBalanceStack]}><Text style={s.pointsCaption}>{membership?'可用 AI 积分':'可用积分'}</Text>
          {membership?<View style={s.memberBalanceRow}><Text testID="profile-points-value" style={[s.memberBalance,wallet&&wallet.availableUnits<0&&{color:colors.warning}]}>{wallet?formatPointUnits(wallet.availableUnits,wallet.scale):'—'}</Text><Text style={s.memberUnit}>积分</Text></View>:<Text style={s.pointsText}>{balance}</Text>}
        </View>
        {!compact&&!membership && <AppIcon name="chevron-right" size={14} color={colors.brand}/>}
      </AnimatedPressable>
      {!!error&&<AnimatedPressable accessibilityRole="button" accessibilityLabel="重新同步积分余额" disabled={state.refreshing}
        onPress={()=>void androidPointsFlow.refresh()} style={s.pointsRetry}>
        {state.refreshing?<ActivityIndicator color={colors.brand} size="small"/>:<AppIcon name="refresh" size={20} color={colors.brand}/>}
      </AnimatedPressable>}
    </View>
    {!!wallet&&wallet.availableUnits<0&&<Text style={s.pointsError}>欠分中 · 签到积分先抵扣，正余额后恢复付费 AI</Text>}
    {!!wallet?.heldUnits&&<Text style={s.pointsStatus} accessibilityLiveRegion="polite">预扣中 {held} 积分 · 以最终结算为准</Text>}
    {!!error&&<Text style={s.pointsError} accessibilityLiveRegion="polite">积分未同步，点击重试</Text>}
  </View>;
}

export function DailyGoalRing({ count, target = 30, inverse = true, label = "今日已刷" }: { count?: number; target?: number; inverse?: boolean; label?: string }) {
  const s = useThemedStyles(styles), { colors } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const ink = inverse ? '#FFFFFF' : colors.brand;
  const edge = Math.min(width - 76, Math.round((width < 360 ? 100 : 108) * Math.max(1, fontScale)));
  const radius = 45, circumference = 2 * Math.PI * radius;
  const fraction = target > 0 ? Math.min(1, Math.max(0, (count || 0) / target)) : 0;
  return <View testID="daily-goal" accessible accessibilityLabel={`${label} ${count ?? '未同步'} / ${target}`} style={[s.ring,{width:edge}]}>
    <View testID="daily-goal-circle" style={{width:edge,height:edge}}>
      <Svg width={edge} height={edge} viewBox="0 0 104 104">
        <Circle cx="52" cy="52" r={radius} stroke={inverse?'#FFFFFF38':colors.brandSoft} strokeWidth="4" fill="none"/>
        <Circle cx="52" cy="52" r={radius} stroke={ink} strokeWidth="4" fill="none" strokeLinecap="round" strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={circumference * (1 - fraction)} rotation="-90" origin="52,52"/>
      </Svg>
      <View style={s.ringCopy}><View testID="daily-goal-numbers" style={s.ringNumberRow}>
        <Text style={[s.ringValue,ringType.value,{color:ink}]}>{count ?? '—'}</Text>
        <Text style={[s.ringTarget,ringType.target,{color:ink}]}>/{target}</Text>
      </View></View>
    </View>
    <Text testID="daily-goal-caption" style={[s.ringLabel,ringType.caption,{color:inverse?ink:colors.textMuted}]}>{label}</Text>
  </View>;
}

// Deliberate optical roles: don't pass these sizes through the legacy size uplift.
const ringType = StyleSheet.create({
  value: { fontSize: 30, lineHeight: 38, fontWeight: '500', fontVariant: ['tabular-nums'] },
  target: { fontSize: 14, lineHeight: 21, fontWeight: '400', fontVariant: ['tabular-nums'] },
  caption: { fontSize: 14, lineHeight: 22, fontWeight: '400', letterSpacing: 0.6 },
});

const styles = (c: ThemeColors) => StyleSheet.create({
  memberPointsWrap:{paddingTop:4,paddingBottom:12,gap:6},
  memberPoints:{minHeight:52,justifyContent:'center'},
  memberBalanceContent:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},
  memberBalanceStack:{flexDirection:'column',alignItems:'flex-start',gap:4},
  memberBalanceRow:{flexDirection:'row',alignItems:'baseline',gap:7,flexShrink:1},
  memberBalance:{fontSize:28,lineHeight:37,fontWeight:'700',color:c.text,fontVariant:['tabular-nums'],flexShrink:1},
  memberUnit:{fontSize:13,lineHeight:22,color:c.textMuted},
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 56, marginBottom: 14, minWidth: 0 },
  headerIdentity: { flexDirection: 'row', alignItems: 'center', gap: 11, flex: 1, minWidth: 0 },
  headerIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  brand: { color: c.text, fontSize: 26, fontWeight: '700', flexShrink: 1 },
  certificate: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, minHeight: 48, maxWidth: '65%', minWidth: 0, flexShrink: 1, backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 26 },
  certificateName: { color: c.text, fontSize: 14, flexShrink: 1 },
  headerAction: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, paddingHorizontal: 8 },
  actionText: { color: c.textMuted, fontSize: 14 },
  points: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, minHeight: 48, paddingHorizontal: 12, borderRadius: 12, backgroundColor: c.brandSoft },
  pointsCompact: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 48, alignSelf: 'flex-start' },
  pointsText: { color: c.brand, fontSize: 13, fontWeight: '500', flexShrink: 1 },
  pointsWrap: { gap: 5, minWidth: 0, maxWidth: '100%' },
  pointsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  pointsGrow: { flex: 1, minWidth: 0 },
  pointsCaption: { color: c.textMuted, fontSize: 12, lineHeight: 19 },
  pointsRetry: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: c.surface },
  pointsStatus: { color: c.textMuted, fontSize: 12, lineHeight: 19 },
  pointsError: { color: c.warning, fontSize: 12, lineHeight: 19 },
  ring: { alignItems: 'center', gap: 10, flexShrink: 0 },
  ringCopy: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  ringNumberRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  ringValue: { color: '#FFFFFF', fontSize: 25, fontWeight: '700', lineHeight: 36 },
  ringTarget: { color: '#FFFFFF', fontSize: 14, fontWeight: '400' },
  ringLabel: { color: '#FFFFFF', fontSize: 14, textAlign: 'center' },
});
