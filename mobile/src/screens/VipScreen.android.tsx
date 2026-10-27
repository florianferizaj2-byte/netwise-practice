import { androidAccent } from '../android-design-tokens';
import { AppIcon } from '../components/AppIcon';
import { iosStyles } from '../iosStyles';
import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentProps } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { AppAlert as Alert } from "../components/AppAlert";
import { RefreshControl } from "../components/RefreshControl";
import {
  mobileApi,
  type AccountEntitlementsResponse,
  type AuthResponse,
  type PointOperation,
} from "../api/client";
import { AnimatedPressable } from "../components/Motion";
import {
  RedeemCodeModal,
  useMembershipColors,
  membershipDate,
  membershipLabels,
} from "../components/RedeemCodeModal";
import { useScreenActive } from "../navigation/ScreenActivity";
import { isAppleWeb, useTheme, useThemedStyles, type ThemeColors } from "../theme";
import { SubjectiveStudyScreen } from "./subjective-study/SubjectiveStudyScreen";
import { MembershipPurchaseLink } from '../components/MembershipPurchaseLink.android';
import { AiPointsPricing } from '../components/AiPointsPricing.android';
import { useAndroidPoints } from '../components/AndroidPointsBar.android';
import { androidPointsFlow } from '../api/androidPointsRuntime.android';
import { CheckInScreen } from './CheckInScreen.android';
import { androidPointsApi, pointUsageLabel } from '../api/points.android';
import type { PointCall } from '../api/pointsTypes';
import { useAndroidFocusMode } from '../navigation/AndroidFocusMode.android';

const vipType = StyleSheet.create({
  title: { fontSize: 20, lineHeight: 28, fontWeight: '500' },
  planName: { fontSize: 16, lineHeight: 24, fontWeight: '500', flexShrink: 1 },
  currency: { fontSize: 14, lineHeight: 21, fontWeight: '400' },
  price: { fontSize: 26, lineHeight: 36, fontWeight: '500', marginTop: 0, fontVariant: ['tabular-nums'] },
  points: { fontSize: 14, lineHeight: 21, fontWeight: '500', marginTop: 0, fontVariant: ['tabular-nums'] },
  period: { fontSize: 14, lineHeight: 21, fontWeight: '400', marginTop: 0 },
  footerTitle: { fontSize: 16, lineHeight: 24, fontWeight: '500', marginTop: 0 },
  footerHint: { fontSize: 14, lineHeight: 21, fontWeight: '400', marginTop: 0 },
});

const plans = [
  {
    id: "vip",
    name: "VIP",
    price: "9.9",
    points: 33,
    description: "日常巩固",
  },
  {
    id: "svip",
    name: "SVIP",
    price: "19.9",
    points: 66,
    description: "集中备考",
  },
  {
    id: "ssvip",
    name: "SSVIP",
    price: "39.9",
    points: 133,
    description: "高频冲刺",
  },
] as const;

export function VipScreen(props: ComponentProps<typeof AndroidVipScreen>) {
  // Remount account-owned balance/history synchronously, rather than leaving a
  // previous account's wallet visible for one effect turn during a switch.
  return <AndroidVipScreen key={props.preview ? 'preview' : props.user?.id || 'guest'} {...props}/>;
}

function AndroidVipScreen({
  preview = false,
  user,
  certificateName,
  onOpenCertificates,
  onOpenPractice, onBack,
}: {
  preview?: boolean;
  user?: AuthResponse["user"];
  certificateName: string;
  onOpenCertificates: () => void;
  onOpenPractice: () => void;
  onBack?: () => void;
}) {
  const pointFlow=useAndroidPoints();
  const active = useScreenActive();
  useAndroidFocusMode(!!onBack, onBack);
  const { width, fontScale } = useWindowDimensions();
  const compactPlans = width < 360 || fontScale > 1.2;
  const stackPurchase = fontScale > 1.2;
  const { colors, resolvedMode } = useTheme();
  const styles = useThemedStyles(createStyles, iosStyles.vip);
  const tierColors={free:colors.textMuted,vip:colors.brand,svip:colors.brand,ssvip:colors.brand};
  const [selected, setSelected] =
    useState<(typeof plans)[number]["id"]>("svip");
  const [account, setAccount] = useState<AccountEntitlementsResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pointHistory,setPointHistory]=useState<PointOperation[]>([]);
  const [pointCalls,setPointCalls]=useState<PointCall[]>([]);
  const [historyError,setHistoryError]=useState('');
  const [historyLoading,setHistoryLoading]=useState(false);
  const historyRevision=useRef(0);
  const [checkInOpen,setCheckInOpen]=useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [studyOpen, setStudyOpen] = useState(false);
  const [pricesOpen,setPricesOpen]=useState(false),[historyOpen,setHistoryOpen]=useState(false);
  const [studyVisited, setStudyVisited] = useState(false);
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    if (preview || !user) return;
    const id = ++revision.current;
    setLoading(true);
    setError("");
    try {
      const data = await mobileApi.accountEntitlements();
      if (revision.current === id) setAccount(data);
    } catch (cause) {
      if (revision.current === id)
        setError(
          cause instanceof Error ? cause.message : "权益暂未同步，请下拉重试。",
        );
    } finally {
      if (revision.current === id) setLoading(false);
    }
  }, [preview, user?.id]);
  useEffect(() => {
    setAccount(null);
    historyRevision.current++;setPointHistory([]);setPointCalls([]);setHistoryError('');setHistoryLoading(false);
  }, [user?.id, preview]);
  useEffect(() => {
    if (active && !studyOpen) void refresh();
    return () => {
      revision.current++;
    };
  }, [active, refresh, studyOpen]);
  const availablePlans = plans.map(item => {
    const remote = account?.pointsPlans?.[item.id];
    return remote && typeof remote.dailyPoints === "number" && Number.isSafeInteger(remote.priceCents) && remote.priceCents >= 0 && Number.isSafeInteger(remote.dailyPoints) && remote.dailyPoints >= 0
      ? { ...item, price: (remote.priceCents / 100).toFixed(2).replace(/\.?0+$/, ''), points: remote.dailyPoints }
      : { ...item, points: preview ? item.points : null };
  });
  const plan = availablePlans.find((item) => item.id === selected)!;
  const current = account?.plan || "free",
    hasAccount = preview || !!account,
    paid = current !== "free";
  const currentColor = tierColors[current],
    selectedColor = tierColors[selected];
  const check = account?.checkIn;
  const accountPoints=account?.points;
  const liveWallet=pointFlow.ownerKey===`${user?.id}:${user?.certificateId||''}`?pointFlow.wallet:null;
  const points=accountPoints&&liveWallet?{...accountPoints,availableUnits:liveWallet.availableUnits,heldUnits:liveWallet.heldUnits}:accountPoints;
  const pointNumber=(units:number|undefined)=>((units||0)/1000).toLocaleString('zh-CN',{maximumFractionDigits:3});
  async function loadPointHistory(){
    const request=++historyRevision.current;
    setHistoryLoading(true);
    setHistoryError('');
    try{const data=await androidPointsApi.operations();if(request===historyRevision.current){setPointHistory(data.rows);setPointCalls(data.calls);void refresh();}}
    catch(cause){if(request===historyRevision.current)setHistoryError(cause instanceof Error?cause.message:'积分记录读取失败');}
    finally{if(request===historyRevision.current)setHistoryLoading(false);}
  }

  useEffect(() => {
    if (active && !studyOpen && !preview && user) void loadPointHistory();
    return () => { historyRevision.current++; };
  }, [active, studyOpen, preview, user?.id, pointFlow.updated]);

  return (
    <View style={{ flex: 1 }}>
      <CheckInScreen visible={active&&!studyOpen&&checkInOpen} preview={preview} user={user} onClose={()=>setCheckInOpen(false)} onUpdated={next=>{revision.current++;setLoading(false);setAccount(next);setError('');}}/>
      <View style={[{ flex: 1 }, studyOpen && { display: 'none' }]}
        accessibilityElementsHidden={studyOpen} importantForAccessibility={studyOpen ? 'no-hide-descendants' : 'auto'}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={loading && !!account}
            onRefresh={() => void refresh()}
            tintColor={colors.brand}
          />
        }
      >
        <View style={styles.nativeNav}>
          <AnimatedPressable accessibilityRole="button" accessibilityLabel="返回我的" onPress={onBack} style={styles.nativeBack}><AppIcon name="chevron-left" size={23} color={colors.text}/></AnimatedPressable><Text accessibilityRole="header" style={[styles.nativeTitle,vipType.title]}>会员与 AI 积分</Text><AnimatedPressable accessibilityRole="button" onPress={()=>setRedeemOpen(true)} style={styles.nativeBack}><Text style={styles.redeemLinkText}>兑换码</Text></AnimatedPressable>
        </View>
        <View style={styles.nativeAccountCard}>
          <View style={styles.sectionLine}><View style={styles.nativeAccountIcon}><AppIcon name="person" size={26} color={colors.brand}/></View><Text style={styles.nativeCurrent}>当前套餐 · {hasAccount?current==='free'?'普通用户':membershipLabels[current]:loading?'同步中':'待同步'}</Text><AnimatedPressable accessibilityRole="button" onPress={()=>user?.id&&pointFlow.ownerKey?.startsWith(user.id+':')?androidPointsFlow.showDetails():setHistoryOpen(value=>!value)} style={styles.nativeRecordButton}><Text style={styles.smallMuted}>积分记录</Text><AppIcon name="chevron-right" size={15} color={colors.textMuted}/></AnimatedPressable></View>
          {paid&&!!account?.expiresAt&&<Text style={styles.accountMeta}>{membershipDate(account.expiresAt)} 到期</Text>}
          <View style={[styles.usageRow,fontScale>1.2&&styles.usageRowStack]}><View style={[styles.balanceGroup,fontScale>1.2&&styles.balanceGroupStack]}><Quota label="可用积分" value={hasAccount?pointNumber(points?.availableUnits):'—'} unit="积分"/><View style={styles.rule}/><Quota label="预扣中" value={hasAccount?pointNumber(points?.heldUnits):'—'} unit="积分"/></View><AnimatedPressable accessibilityRole="button" accessibilityLabel={check?.claimed?'已签到':'签到领积分'} onPress={()=>setCheckInOpen(true)} style={styles.checkInButton}><AppIcon name="calendar" size={18} color={colors.brand}/><Text style={styles.checkInButtonText}>{check?.claimed?'已签到':check?.canClaim===false?'暂不可领':'签到'}</Text></AnimatedPressable></View>
          {!!points?.pendingUnits&&<Text style={styles.quotaFootnote}>本期积分待到账，请联系管理员核对发放记录。</Text>}
          <Text style={styles.quotaFootnote}>{check?.disabledReason || `签到 ${check?.grants.points ?? '—'} 积分 · 当日有效 · 每日手动领取`}</Text>
        </View>
        {!!error&&<AnimatedPressable accessibilityRole="button" onPress={()=>void refresh()}><Text style={styles.error}>{error} 点击重试</Text></AnimatedPressable>}
        <View style={styles.plansHeading}><Text style={styles.sectionTitle}>选择会员套餐</Text><Text style={styles.smallMuted}>不自动续费</Text></View>
        <View testID="vip-plans" style={[styles.planRow,compactPlans&&styles.planRowStack]}>
          {availablePlans.map((item) => {
            const chosen = item.id === selected,
              color = tierColors[item.id];
            return (
              <AnimatedPressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}，${item.price}元，每日签到${item.points ?? '—'}积分，会员有效30天`}
                accessibilityState={{ selected: chosen }}
                onPress={() => setSelected(item.id)}
                style={[
                  styles.plan,
                  compactPlans && styles.planCompact,
                  chosen && {
                    borderColor: color,
                    backgroundColor: `${color}${resolvedMode === "dark" ? "18" : "0A"}`,
                  },
                ]}
              >
                <View style={[styles.planTop,compactPlans&&styles.planTopCompact]}>
                  <Text style={[styles.planName,vipType.planName,{color:chosen?color:colors.text}]}>{item.name}</Text>
                  <View
                    style={[
                      styles.selectionDot,
                      chosen && { backgroundColor: color, borderColor: color },
                    ]}
                  >
                    {chosen && <AppIcon style={[styles.selectionCheck,{color:resolvedMode==='dark'?colors.background:colors.white}]}>✓</AppIcon>}
                  </View>
                </View>
                <View style={[styles.planPriceRow,compactPlans&&styles.planPriceCompact]}><Text style={[styles.currency,vipType.currency,{color:chosen?color:colors.text}]}>¥</Text><Text style={[styles.price,vipType.price,{color:chosen?color:colors.text}]}>{item.price}</Text></View>
                <View style={[styles.planTerms,compactPlans&&styles.planTermsCompact]}><Text style={[styles.planQuantity,vipType.points]}>每日 {item.points ?? '—'} 积分</Text><Text style={[styles.planQuantity,vipType.period]}>30 天</Text></View>
              </AnimatedPressable>
            );
          })}
        </View>
        <Text style={styles.purchaseTerms}>购买后返回，使用兑换码开通。{'\n'}价格与会员时长以购买页为准。</Text>

        <View style={styles.benefits}>
          <View style={styles.sectionLine}><Text style={styles.sectionTitle}>AI 学习权益</Text><AnimatedPressable accessibilityRole="button" onPress={()=>setPricesOpen(value=>!value)} style={styles.nativeRecordButton}><Text style={styles.smallMuted}>{pricesOpen?'收起价目':'服务价目'}</Text><AppIcon name="chevron-right" size={15} color={colors.textMuted}/></AnimatedPressable></View>
          <Benefit glyph="≡" title="详细讲解与提示" detail="提供题目解析、思路提示与知识点讲解。" color={colors.brand}/>
          <Benefit glyph="↗" title="错因分析与学习计划" detail="分析薄弱点，生成个性化学习计划。" color={colors.brand}/>
          <Benefit glyph="✦" title="AI 出题与答疑" detail="基于知识点生成题目，支持学习答疑。" color={colors.brand}/>
          <Text style={styles.quotaFootnote}>以上功能共用 AI 积分，按实际用量结算。</Text>
        </View>
        {pricesOpen&&<AiPointsPricing userId={user?.id} preview={preview}/>}
        <AnimatedPressable accessibilityRole="button" accessibilityLabel="进入 AI 精炼" onPress={()=>{setStudyVisited(true);setStudyOpen(true)}} style={styles.nativeStudyEntry}><View style={styles.nativeAccountIcon}><AppIcon name="book" size={27} color={colors.brand}/></View><View style={styles.flex}><Text style={styles.studyTitle}>AI 精炼</Text><Text style={styles.studyIntro}>按知识点精讲与练习</Text></View><Text style={styles.smallMuted}>进入</Text><AppIcon name="chevron-right" size={18} color={colors.textMuted}/></AnimatedPressable>
        <View style={styles.nativeRuleCard}><AppIcon name="info" size={22} color={colors.brand}/><View style={styles.flex}><Text style={styles.benefitTitle}>积分使用说明</Text><Text style={styles.quotaFootnote}>先预扣、后结算，失败退回预扣。已有课程、缓存内容和确定性判分不扣积分。会员按每日签到领取，退款不延长原有效期。</Text></View></View>
        {historyOpen&&<>        <View style={{padding:20,gap:12}}>
          <Text style={styles.sectionTitle}>积分使用记录</Text>
          <AnimatedPressable accessibilityRole="button" disabled={historyLoading||!user} onPress={()=>void loadPointHistory()} style={styles.checkInButton}>
            <Text style={styles.checkInButtonText}>{historyLoading?'正在读取…':'查看 / 刷新积分记录'}</Text>
          </AnimatedPressable>
          {!!historyError&&<Text accessibilityRole="alert" style={styles.quotaFootnote}>{historyError}</Text>}
          {!historyLoading&&!historyError&&!pointHistory.length&&<Text style={styles.quotaFootnote}>暂无积分使用记录</Text>}
          {pointHistory.map(row=><View key={row.id} style={{gap:5,paddingVertical:10}}>
            <Text style={styles.quotaFootnote}>{pointUsageLabel(row.feature,pointCalls.filter(call=>call.operationId===row.id))}</Text>
            <Text style={styles.sectionTitle}>{row.state==='pending'?`预扣 ${pointNumber(row.heldUnits)}`:row.state==='refunded'?`退回 ${pointNumber(row.heldUnits)}`:`扣除 ${pointNumber(row.chargedUnits)}`} 积分</Text>
            <Text style={styles.quotaFootnote}>{[...new Set(pointCalls.filter(call=>call.operationId===row.id).map(call=>call.model))].join(' / ') || '等待模型记录'}{row.state==='settled'&&row.heldUnits>row.chargedUnits?` · 预扣差额 ${pointNumber(row.heldUnits-row.chargedUnits)} 积分已释放`:''}</Text>
            <Text style={styles.quotaFootnote}>{new Date(row.createdAt).toLocaleString('zh-CN')} · {row.state==='pending'?'任务处理中':row.state==='refunded'?'失败，预扣已退还':'已结算'}</Text>
            {!!row.error&&<Text style={styles.quotaFootnote}>{row.error}</Text>}
          </View>)}
        </View>
</>}
      </ScrollView><View testID="vip-purchase-footer" style={styles.purchaseFooter}><View style={[styles.nativePurchaseLine,stackPurchase&&styles.nativePurchaseStack]}><View style={[styles.purchaseSummary,stackPurchase&&styles.purchaseSummaryStack]}><Text style={[styles.purchaseHint,vipType.footerTitle]}>已选 {plan.name}</Text><Text style={[styles.purchaseHint,vipType.footerHint]}>购买后返回兑换</Text></View><MembershipPurchaseLink primary compact={!stackPurchase} label="前往购买页"/></View></View>
      </View>
      {studyVisited && <SubjectiveStudyScreen visible={studyOpen} preview={preview} user={user} certificateName={certificateName}
        onClose={() => setStudyOpen(false)} onOpenMembership={() => { setStudyOpen(false); setRedeemOpen(true); }}
        onOpenCertificates={onOpenCertificates} onOpenPractice={onOpenPractice} />}
      <RedeemCodeModal
        visible={active && redeemOpen}
        preview={preview}
        userId={user?.id}
        onClose={() => setRedeemOpen(false)}
        onRedeemed={(next) => {
          revision.current++;
          setLoading(false);
          setAccount(next);
          setError("");
          if (next.plan !== "free") setSelected(next.plan);
        }}
      />
    </View>
  );
}
function Quota({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | string;
  unit: string;
}) {
  const s = useThemedStyles(createStyles, iosStyles.vip);
  return (
      <View style={s.quota} testID={label === '可用积分' ? 'vip-points-balance' : label === '预扣中' ? 'vip-points-held' : label === '每 30 天套餐' ? 'vip-points-monthly' : undefined}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[s.quotaValue,String(value).length>6&&{fontSize:String(value).length>9?13:19}]}>
        {value}
      </Text>
        <Text style={s.quotaUnit}>{unit}</Text>
      <Text style={s.quotaLabel}>{label}</Text>
    </View>
  );
}
function Benefit({
  glyph,
  title,
  detail,
  color,
}: {
  glyph: string;
  title: string;
  detail: string;
  color: string;
}) {
  const s = useThemedStyles(createStyles, iosStyles.vip);
  return (
    <View style={s.benefitRow}>
      <View style={[s.benefitIcon, { backgroundColor: `${color}12` }]}>
        <AppIcon style={[s.benefitGlyph, { color }]}>{glyph}</AppIcon>
      </View>
      <View style={s.flex}>
        <Text style={s.benefitTitle}>{title}</Text>
        <Text style={s.benefitDetail}>{detail}</Text>
      </View>
    </View>
  );
}
const baseCreateStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    headingCopy: {},
    studyEntry: { backgroundColor: c.surfaceMuted, borderLeftWidth: 4, borderLeftColor: c.brand, borderRadius: 14, padding: 20, gap: 10 },
    studyTitle: { color: c.text, fontSize: 24, lineHeight: 32, fontWeight: '800' },
    studyIntro: { color: c.text, fontSize: 16, lineHeight: 26 },
    studyEntryFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
    studyEntryAction: { color: c.brandDark, fontSize: 15, lineHeight: 24, fontWeight: '700' },
    content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32 },
    heading: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 6,
      marginBottom: 22,
    },
    eyebrow: {
      color: c.textMuted,
      fontSize: 11,
      letterSpacing: 1.4,
      fontWeight: "700",
      marginBottom: 8,
    },
    title: {
      color: c.text,
      fontSize: 24,
      fontWeight: "800",
      letterSpacing: -0.6,
    },
    redeemLink: { paddingVertical: 12, paddingLeft: 4 },
    redeemLinkText: { color: c.brand, fontSize: 12, fontWeight: "600" },
    accountRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 16,
      paddingHorizontal: 16,
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
    },
    accountMark: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
    },
    accountMarkText: { fontSize: 25 },
    identityLine: { flexDirection: "row", alignItems: "center", gap: 8 },
    accountLabel: { color: c.textMuted, fontSize: 12 },
    currentTier: { fontSize: 17, fontWeight: "800" },
    accountMeta: { color: c.textMuted, fontSize: 11, marginTop: 5 },
    accountAction: { paddingVertical: 12, paddingLeft: 6 },
    accountActionText: { color: c.brand, fontSize: 12, fontWeight: "600" },
    error: { color: c.warning, fontSize: 12, lineHeight: 19, marginTop: 8 },
    usageSection: { paddingTop: 23, paddingBottom: 20 },
    sectionLine: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 5,
    },
    sectionTitle: { color: c.text, fontSize: 16, fontWeight: "700" },
    smallMuted: { color: c.textMuted, fontSize: 11 },
    usageRow: { flexDirection: "row", alignItems: "center", paddingTop: 16 },
    quota: { flex: 1, alignItems: "center" },
    quotaValue: {
      color: c.text,
      fontSize: 27,
      fontWeight: "700",
      fontVariant: ["tabular-nums"],
    },
    quotaUnit: { color: c.textMuted, fontSize: 11, fontWeight: "400" },
    quotaLabel: { color: c.textMuted, fontSize: 11, marginTop: 5 },
    rule: {
      width: StyleSheet.hairlineWidth,
      height: 28,
      backgroundColor: c.border,
    },
    quotaFootnote: {
      color: c.textFaint,
      fontSize: 11,
      textAlign: "center",
      marginTop: 14,
    },
    checkInRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: c.surfaceMuted,
      borderRadius: 12,
      padding: 12,
    },
    calendar: {
      width: 32,
      height: 35,
      borderColor: c.brandSoft,
      borderWidth: 1,
      borderTopWidth: 5,
      borderRadius: 7,
      alignItems: "center",
      justifyContent: "center",
    },
    calendarText: { color: c.brandDark, fontSize: 15, fontWeight: "700" },
    checkInTitle: { color: c.text, fontSize: 12, fontWeight: "700" },
    checkInMeta: { color: c.textMuted, fontSize: 11, marginTop: 4 },
    checkInButton: {
      borderRadius: 9,
      backgroundColor: c.brandSoft,
      minHeight: 36,
      minWidth: 54,
      paddingHorizontal: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    checkInButtonText: { color: c.brandDark, fontSize: 12, fontWeight: "700" },
    checkedButton: { backgroundColor: c.background },
    checkedText: { color: c.textMuted },
    plansHeading: {
      flexDirection: "row",
      flexWrap: "wrap",
      rowGap: 6,
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 28,
      marginBottom: 14,
      gap: 4,
    },
    planRow: { flexDirection: "row", gap: 8 },
    plan: {
      flex: 1,
      borderWidth: 1.2,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 13,
      paddingHorizontal: 11,
      paddingVertical: 15,
    },
    planTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    planName: { fontSize: 15, fontWeight: "800" },
    selectionDot: {
      width: 13,
      height: 13,
      borderRadius: 7,
      borderColor: c.border,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    selectionCheck: { color: c.white, fontSize: 8, fontWeight: "900" },
    planDescription: { color: c.textMuted, fontSize: 11, marginTop: 5 },
    price: {
      color: c.text,
      fontSize: 25,
      fontWeight: "700",
      marginTop: 14,
      letterSpacing: -0.8,
    },
    currency: { fontSize: 12, fontWeight: "500" },
    planQuantity: { color: c.textMuted, fontSize: 11, marginTop: 6 },
    benefits: { marginTop: 21, paddingHorizontal: 2 },
    benefitHeading: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingBottom: 8,
    },
    benefitTier: { fontSize: 15, fontWeight: "800" },
    benefitHeadingText: { color: c.text, fontSize: 13, fontWeight: "600" },
    benefitRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 11,
    },
    benefitIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    benefitGlyph: { fontSize: 20, fontWeight: "600" },
    benefitTitle: { color: c.text, fontSize: 13, fontWeight: "700" },
    benefitDetail: {
      color: c.textMuted,
      fontSize: 12,
      lineHeight: 19,
      marginTop: 3,
    },
    benefitFooter: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      borderTopColor: c.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingTop: 13,
      marginTop: 8,
    },
    footerCheck: { color: c.brand, fontSize: 10 },
    benefitFooterText: { color: c.textMuted, fontSize: 11, marginRight: 7 },
    primary: {
      marginTop: 23,
      backgroundColor: c.brand,
      borderRadius: 12,
      minHeight: 50,
      paddingHorizontal: 19,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    primaryText: { color: c.white, fontSize: 14, fontWeight: "700" },
    primaryArrow: { color: c.white, fontSize: 22 },
    purchaseHint: {
      textAlign: "center",
      color: c.textMuted,
      fontSize: 13,
      lineHeight: 21,
      marginTop: 10,
    },
    redeemSecondary: { minHeight: 48, marginTop: 10, paddingVertical: 13, paddingHorizontal: 18,
      borderColor: c.border, borderWidth: 1, borderRadius: 14, flexDirection: "row",
      justifyContent: "space-between", alignItems: "center", gap: 10 },
    redeemSecondaryText: { color: c.brand, fontSize: 16, fontWeight: "600" },
    apiSection: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
      marginTop: 25,
      paddingTop: 16,
    },
    apiEntry: {
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      paddingVertical: 6,
    },
    apiGlyph: { fontSize: 21, color: c.gold },
    apiTitle: { color: c.textMuted, fontSize: 12, fontWeight: "600" },
    apiMeta: { color: c.textFaint, fontSize: 11, marginTop: 4 },
    apiArrow: { fontSize: 22, color: c.textFaint },
  });

const legacyVipStyles=(c:ThemeColors)=>({...baseCreateStyles(c),...StyleSheet.create({content:{paddingHorizontal:16,paddingTop:8,paddingBottom:24},nativeNav:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',minHeight:56,marginBottom:16,gap:8},nativeBack:{minWidth:48,minHeight:48,justifyContent:'center'},nativeTitle:{fontSize:19,fontWeight:'700',color:c.text},nativeAccountCard:{backgroundColor:androidAccent(c,'member').soft,borderRadius:15,padding:16,gap:8},nativeAccountIcon:{width:44,height:44,borderRadius:12,backgroundColor:c.surface,alignItems:'center',justifyContent:'center'},nativeCurrent:{fontSize:15,color:c.text,fontWeight:'700',flex:1},nativeRecordButton:{minHeight:48,flexDirection:'row',alignItems:'center',gap:3},usageRow:{flexDirection:'row',alignItems:'center',paddingTop:8,gap:10},quota:{flex:1,alignItems:'flex-start',gap:4},quotaValue:{fontSize:23,fontWeight:'700',color:c.text},quotaLabel:{fontSize:12,color:c.textMuted},quotaUnit:{display:'none'},rule:{width:1,height:42,backgroundColor:c.border},checkInButton:{minHeight:48,borderRadius:10,borderColor:c.brand,borderWidth:1,paddingHorizontal:10,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5},checkInButtonText:{fontSize:12,fontWeight:'500',color:c.brand},plansHeading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:22,marginBottom:12},planRow:{flexDirection:'row',gap:8},plan:{flex:1,padding:12,borderRadius:13,borderColor:c.border,borderWidth:1,backgroundColor:c.surface,minHeight:139},planTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},planName:{fontSize:16,fontWeight:'700'},planDescription:{display:'none'},price:{color:c.brand,fontSize:26,fontWeight:'700',marginTop:17},planQuantity:{fontSize:12,color:c.textMuted,lineHeight:20,marginTop:6},benefits:{backgroundColor:c.surface,borderRadius:14,borderColor:c.border,borderWidth:StyleSheet.hairlineWidth,padding:15,marginTop:18},benefitRow:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:14,borderBottomColor:c.border,borderBottomWidth:StyleSheet.hairlineWidth},benefitTitle:{fontSize:15,fontWeight:'700',color:c.text},benefitDetail:{fontSize:12,color:c.textMuted,lineHeight:20,marginTop:4},quotaFootnote:{fontSize:12,color:c.textMuted,lineHeight:20,marginTop:7},nativeStudyEntry:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:androidAccent(c,'ai').soft,borderRadius:14,padding:16,borderColor:c.border,borderWidth:StyleSheet.hairlineWidth,marginTop:14},studyTitle:{fontSize:17,color:c.text,fontWeight:'700'},studyIntro:{fontSize:13,color:c.textMuted,lineHeight:21,marginTop:4},nativeRuleCard:{flexDirection:'row',alignItems:'flex-start',gap:12,backgroundColor:c.surface,borderRadius:14,padding:16,marginTop:14,borderColor:c.border,borderWidth:StyleSheet.hairlineWidth},nativePurchaseLine:{flexDirection:'row',alignItems:'center',gap:12,flexWrap:'wrap'},purchaseFooter:{padding:16,backgroundColor:c.surface,borderTopColor:c.border,borderTopWidth:StyleSheet.hairlineWidth,gap:8},purchaseHint:{fontSize:12,color:c.textMuted,lineHeight:19,marginTop:0,flex:1,minWidth:120}})});


const createStyles=(c:ThemeColors)=>({...legacyVipStyles(c),...StyleSheet.create({
  nativeNav:{flexDirection:'row',alignItems:'center',minHeight:56,marginBottom:12,gap:8},
  nativeTitle:{fontSize:20,color:c.text,flex:1,minWidth:0,textAlign:'center'},
  nativeAccountCard:{backgroundColor:androidAccent(c,'member').soft,borderRadius:18,padding:16,gap:10},
  nativeCurrent:{fontSize:16,lineHeight:24,fontWeight:'500',color:c.text,flex:1,minWidth:0},
  nativeAccountIcon:{width:36,height:36,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:c.surface},
  usageRow:{flexDirection:'row',alignItems:'center',gap:12,paddingTop:2},
  usageRowStack:{flexDirection:'column',alignItems:'stretch'},balanceGroupStack:{flex:0,alignSelf:'stretch'},
  balanceGroup:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:12},
  quota:{flex:1,minWidth:0,alignItems:'flex-start',gap:3},
  quotaValue:{fontSize:26,lineHeight:36,fontWeight:'500',fontVariant:['tabular-nums'],color:c.text},
  quotaLabel:{fontSize:12,lineHeight:21,color:c.textMuted},
  checkInButton:{minHeight:48,minWidth:90,alignSelf:'center',paddingHorizontal:10,borderRadius:14,borderWidth:1,borderColor:c.brand,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5},
  plansHeading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,marginTop:20,marginBottom:10},
  planRow:{flexDirection:'row',gap:8},planRowStack:{flexDirection:'column'},
  plan:{flex:1,minWidth:0,padding:12,borderRadius:16,borderWidth:1,borderColor:c.border,backgroundColor:c.surface,minHeight:136},
  planCompact:{flex:0,flexDirection:'row',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12,minHeight:82},
  planTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:3},
  planTopCompact:{flex:1,minWidth:72,gap:10},
  planPriceRow:{flexDirection:'row',alignItems:'baseline',gap:1,marginTop:10},
  planPriceCompact:{marginTop:0,flexShrink:0},
  planTerms:{marginTop:6,gap:0},planTermsCompact:{marginTop:0,flexShrink:0,alignItems:'flex-end'},
  purchaseTerms:{color:c.textMuted,fontSize:12,lineHeight:21,marginTop:10},
  purchaseFooter:{backgroundColor:c.surface,borderTopColor:c.border,borderTopWidth:StyleSheet.hairlineWidth,paddingHorizontal:16,paddingTop:10,paddingBottom:12},
  nativePurchaseLine:{flexDirection:'row',alignItems:'center',gap:12},nativePurchaseStack:{flexDirection:'column',alignItems:'stretch',gap:0},
  purchaseSummary:{flex:1,minWidth:0,gap:2},purchaseSummaryStack:{flex:0,alignSelf:'stretch'},purchaseHint:{color:c.textMuted,fontSize:12,minWidth:0,marginTop:0},
})});
