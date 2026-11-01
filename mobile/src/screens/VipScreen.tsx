import { AppIcon } from '../components/AppIcon';
import { iosStyles } from '../iosStyles';
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
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
import { MembershipPurchaseLink } from "../components/MembershipPurchaseLink";

const plans = [
  {
    id: "vip",
    name: "VIP",
    price: "9.9",
    points: 990,
    description: "日常巩固",
  },
  {
    id: "svip",
    name: "SVIP",
    price: "19.9",
    points: 1990,
    description: "集中备考",
  },
  {
    id: "ssvip",
    name: "SSVIP",
    price: "39.9",
    points: 3990,
    description: "高频冲刺",
  },
] as const;

export function VipScreen({
  preview = false,
  user,
  certificateName,
  onOpenCertificates,
  onOpenPractice,
}: {
  preview?: boolean;
  user?: AuthResponse["user"];
  certificateName: string;
  onOpenCertificates: () => void;
  onOpenPractice: () => void;
}) {
  const active = useScreenActive();
  const { colors, resolvedMode } = useTheme();
  const styles = useThemedStyles(createStyles, iosStyles.vip);
  const tierColors = useMembershipColors();
  const [selected, setSelected] =
    useState<(typeof plans)[number]["id"]>("svip");
  const [account, setAccount] = useState<AccountEntitlementsResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pointHistory,setPointHistory]=useState<PointOperation[]>([]);
  const [historyError,setHistoryError]=useState('');
  const [historyLoading,setHistoryLoading]=useState(false);
  const historyRevision=useRef(0);
  const [checkingIn, setCheckingIn] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [studyOpen, setStudyOpen] = useState(false);
  const [studyVisited, setStudyVisited] = useState(false);
  const revision = useRef(0),
    checkInBusy = useRef(false);
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
    historyRevision.current++;setPointHistory([]);setHistoryError('');setHistoryLoading(false);
  }, [user?.id, preview]);
  useEffect(() => {
    if (active && !studyOpen) void refresh();
    return () => {
      revision.current++;
    };
  }, [active, refresh, studyOpen]);
  async function checkIn() {
    if (checkInBusy.current) return;
    if (preview || !user) {
      Alert.alert("登录后签到", "登录考匠账号，即可领取每日 AI 学习机会。");
      return;
    }
    checkInBusy.current = true;
    const scope=++revision.current;
    setCheckingIn(true);
    try {
      const data = await mobileApi.dailyCheckIn();
      if(scope!==revision.current)return;
      revision.current++;
      setLoading(false);
      setAccount(data);
      setError("");
      Alert.alert(
        data.claimed ? "签到成功" : "今日已签到",
        data.claimed
          ? `今日 ${data.checkIn.grants.points || 5} 积分已到账，当日有效，所有 AI 功能通用。`
          : "明天再来领取新的学习机会。",
      );
    } catch (cause) {
      if(scope!==revision.current)return;
      Alert.alert(
        "签到失败",
        cause instanceof Error ? cause.message : "请稍后重试。",
      );
    } finally {
      checkInBusy.current = false;
      setCheckingIn(false);
    }
  }
  const plan = plans.find((item) => item.id === selected)!;
  const current = account?.plan || "free",
    hasAccount = preview || !!account,
    paid = current !== "free";
  const currentColor = tierColors[current],
    selectedColor = tierColors[selected];
  const check = account?.checkIn;
  const points=account?.points;
  const pointNumber=(units:number|undefined)=>((units||0)/1000).toLocaleString('zh-CN',{maximumFractionDigits:3});
  async function loadPointHistory(){
    const request=++historyRevision.current;
    setHistoryLoading(true);
    setHistoryError('');
    try{const data=await mobileApi.pointOperations();if(request===historyRevision.current)setPointHistory(data.rows);}
    catch(cause){if(request===historyRevision.current)setHistoryError(cause instanceof Error?cause.message:'积分记录读取失败');}
    finally{if(request===historyRevision.current)setHistoryLoading(false);}
  }

  return (
    <View style={{ flex: 1 }}>
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
        <View style={styles.heading}>
          <View style={styles.headingCopy}>
            <Text style={styles.eyebrow}>{isAppleWeb ? '会员与学习' : 'KAOJIANG · MEMBERSHIP'}</Text>
            <Text style={styles.title}>让学习，再进一步</Text>
          </View>
          <AnimatedPressable
            accessibilityRole="button"
            onPress={() => setRedeemOpen(true)}
            style={styles.redeemLink}
          >
            <Text style={styles.redeemLinkText}>兑换码 ›</Text>
          </AnimatedPressable>
        </View>
        <View style={styles.accountRow}>
          <View
            style={[
              styles.accountMark,
              { backgroundColor: `${currentColor}16` },
            ]}
          >
            <AppIcon style={[styles.accountMarkText, { color: currentColor }]}>
              ✦
            </AppIcon>
          </View>
          <View style={styles.flex}>
            <View style={styles.identityLine}>
              <Text style={styles.accountLabel}>当前套餐</Text>
              <Text style={[styles.currentTier, { color: currentColor }]}>
                {hasAccount
                  ? membershipLabels[current]
                  : loading
                    ? "同步中"
                    : "待同步"}
              </Text>
            </View>
            <Text style={styles.accountMeta}>
              {paid && account?.expiresAt
                ? `${membershipDate(account.expiresAt)} 到期`
                : paid
                  ? "会员权益已生效"
                  : "每日签到，也能开启 AI 学习"}
            </Text>
          </View>
          <AnimatedPressable
            accessibilityRole="button"
            onPress={() => setRedeemOpen(true)}
            style={styles.accountAction}
          >
            <Text style={styles.accountActionText}>
              {paid ? "续期" : "开通"} ›
            </Text>
          </AnimatedPressable>
        </View>
        {!!error && (
          <AnimatedPressable
            onPress={() => void refresh()}
            accessibilityRole="button"
          >
            <Text style={styles.error}>{error} 点击重试</Text>
          </AnimatedPressable>
        )}
        <AnimatedPressable accessibilityRole="button" accessibilityLabel="进入 AI 精炼"
          onPress={() => { setStudyVisited(true); setStudyOpen(true); }}
          style={styles.studyEntry}>
          <Text style={styles.studyTitle}>AI 精炼</Text>
          <Text style={styles.studyIntro}>知识点精讲、填空练习、随时答疑。{"\n"}先理解，再练到会。</Text>
          <View style={styles.studyEntryFooter}>
            <Text style={styles.studyEntryAction}>进入 AI 精炼</Text>
            <AppIcon style={styles.studyEntryAction} size={22}>→</AppIcon>
          </View>
        </AnimatedPressable>
        <View style={styles.usageSection}>
          <View style={styles.sectionLine}>
            <Text style={styles.sectionTitle}>我的 AI 积分</Text>
            <Text style={styles.smallMuted}>
              所有 AI 功能通用
            </Text>
          </View>
          <View style={styles.usageRow}>
            <Quota
              label="可用积分"
              value={hasAccount ? pointNumber(points?.availableUnits) : "—"}
              unit="积分"
            />
            <View style={styles.rule} />
            <Quota
              label="预扣中"
              value={hasAccount ? pointNumber(points?.heldUnits) : "—"}
              unit="积分"
            />
            <View style={styles.rule} />
            <Quota
              label="每 30 天套餐"
              value={hasAccount ? points?.monthlyPoints || 0 : "—"}
              unit="积分"
            />
          </View>
          <Text style={styles.quotaFootnote}>
            按模型和实际用量统一结算。先预扣、后结算，失败全额退还预扣；已有课程、缓存和确定性判分不扣积分。
          </Text>
          {paid && points && (
            <Text style={styles.quotaFootnote}>
              {points.pendingUnits ? '本期积分待到账，请联系管理员核对发放记录。' : '积分按原周期发放，续期不重置已用积分。'}
              {points.periodEnd
                ? ` · ${membershipDate(points.periodEnd)} 周期结束`
                : ""}
            </Text>
          )}
        </View>
        <View style={{padding:20,gap:12}}>
          <Text style={styles.sectionTitle}>积分使用记录</Text>
          <AnimatedPressable accessibilityRole="button" disabled={historyLoading||!user} onPress={()=>void loadPointHistory()} style={styles.checkInButton}>
            <Text style={styles.checkInButtonText}>{historyLoading?'正在读取…':'查看 / 刷新积分记录'}</Text>
          </AnimatedPressable>
          {!!historyError&&<Text accessibilityRole="alert" style={styles.quotaFootnote}>{historyError}</Text>}
          {pointHistory.map(row=><View key={row.id} style={{gap:5,paddingVertical:10}}>
            <Text style={styles.sectionTitle}>{row.state==='pending'?`预扣 ${pointNumber(row.heldUnits)}`:row.state==='refunded'?`退回 ${pointNumber(row.heldUnits)}`:`扣除 ${pointNumber(row.chargedUnits)}`} 积分</Text>
            <Text style={styles.quotaFootnote}>{new Date(row.createdAt).toLocaleString('zh-CN')} · {row.state==='pending'?'任务处理中':row.state==='refunded'?'失败，预扣已退还':'已结算'}</Text>
          </View>)}
        </View>
        <View style={styles.checkInRow}>
          <View style={styles.calendar}>
            <Text style={styles.calendarText}>日</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.checkInTitle}>给坚持，一点奖励</Text>
            <Text style={styles.checkInMeta}>
              签到领取 {check?.grants.points || 5} 积分 · 当日有效 · 以活动预算为准
            </Text>
          </View>
          <AnimatedPressable
            accessibilityRole="button"
            disabled={checkingIn || !!check?.claimed}
            onPress={() => void checkIn()}
            style={[
              styles.checkInButton,
              check?.claimed && styles.checkedButton,
            ]}
          >
            {checkingIn ? (
              <ActivityIndicator color={colors.brand} size="small" />
            ) : (
              <Text
                style={[
                  styles.checkInButtonText,
                  check?.claimed && styles.checkedText,
                ]}
              >
                {check?.claimed ? "已签到" : "签到"}
              </Text>
            )}
          </AnimatedPressable>
        </View>
        <View style={styles.plansHeading}>
          <Text style={styles.sectionTitle}>选一个适合你的节奏</Text>
          <Text style={styles.smallMuted}>参考价 · 不自动续费</Text>
        </View>
        <View style={styles.planRow}>
          {plans.map((item) => {
            const chosen = item.id === selected,
              color = tierColors[item.id];
            return (
              <AnimatedPressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}，${item.price}元，每30天${item.points}积分`}
                accessibilityState={{ selected: chosen }}
                onPress={() => setSelected(item.id)}
                style={[
                  styles.plan,
                  chosen && {
                    borderColor: color,
                    backgroundColor: `${color}${resolvedMode === "dark" ? "18" : "0A"}`,
                  },
                ]}
              >
                <View style={styles.planTop}>
                  <Text style={[styles.planName, { color }]}>{item.name}</Text>
                  <View
                    style={[
                      styles.selectionDot,
                      chosen && { backgroundColor: color, borderColor: color },
                    ]}
                  >
                    {chosen && <AppIcon style={styles.selectionCheck}>✓</AppIcon>}
                  </View>
                </View>
                <Text style={styles.planDescription}>{item.description}</Text>
                <Text style={styles.price}>
                  <Text style={styles.currency}>¥</Text>
                  {item.price}
                </Text>
                <Text style={styles.planQuantity}>
                  {item.points} 积分 / 30 天 · AI 功能通用
                </Text>
              </AnimatedPressable>
            );
          })}
        </View>
        <View style={styles.benefits}>
          <View style={styles.benefitHeading}>
            <Text style={[styles.benefitTier, { color: selectedColor }]}>
              {plan.name}
            </Text>
            <Text style={styles.benefitHeadingText}>为你的备考提供</Text>
          </View>
          <Benefit
            glyph="✦"
            title={`${plan.points} 积分通用额度`}
            detail="围绕知识点出题，10 题一组，每题独立复核"
            color={selectedColor}
          />
          <Benefit
            glyph="≡"
            title="把每道题讲明白"
            detail="详细步骤与核心知识点，按实际 AI 用量扣积分"
            color={selectedColor}
          />
          <Benefit
            glyph="↗"
            title="找到出错的原因"
            detail="定位薄弱知识点，与其他 AI 功能共用积分"
            color={selectedColor}
          />
          <View style={styles.benefitFooter}>
            <AppIcon style={styles.footerCheck}>✓</AppIcon>
            <Text style={styles.benefitFooterText}>账号同步</Text>
            <AppIcon style={styles.footerCheck}>✓</AppIcon>
            <Text style={styles.benefitFooterText}>每日额外奖励</Text>
            <AppIcon style={styles.footerCheck}>✓</AppIcon>
            <Text style={styles.benefitFooterText}>题组随时练</Text>
          </View>
        </View>
        <MembershipPurchaseLink primary />
        <AnimatedPressable
          accessibilityRole="button"
          onPress={() => setRedeemOpen(true)}
          style={styles.redeemSecondary}
        >
          <Text style={styles.redeemSecondaryText}>使用兑换码开通会员</Text>
          <AppIcon style={styles.redeemSecondaryText}>→</AppIcon>
        </AnimatedPressable>
        <Text style={styles.purchaseHint}>
          请在购买页选择 {plan.name}。售价与会员时长以购买页为准，购买后回到考匠兑换。
        </Text>
        <View style={styles.apiSection}>
          <AnimatedPressable
            accessibilityRole="button"
            onPress={() =>
              Alert.alert(
                "作者 AI 服务",
                "所有账号统一使用作者提供的 AI 服务。AI 出题、解析、计划、判分与答疑共用积分，失败自动退回预扣；已生成题组和缓存结果可反复使用。",
              )
            }
            style={styles.apiEntry}
          >
            <AppIcon style={styles.apiGlyph}>⌘</AppIcon>
            <View style={styles.flex}>
              <Text style={styles.apiTitle}>作者 AI 服务</Text>
              <Text style={styles.apiMeta}>
                {account?.aiServiceAvailable === false ? "服务暂未就绪 · 积分保留" : "无需配置 · 按积分使用"}
              </Text>
            </View>
            <AppIcon style={styles.apiArrow}>›</AppIcon>
          </AnimatedPressable>
        </View>
      </ScrollView>
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
const createStyles = (c: ThemeColors) =>
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
