import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AccountEntitlementsResponse, AuthResponse } from '../api/client';
import { mobileApi } from '../api/client';
import { AnimatedPressable, EntranceView } from '../components/Motion';
import { useScreenActive } from '../navigation/ScreenActivity';
import { radius, shadow, spacing, useThemedStyles, useTheme, type ThemeColors } from '../theme';

type VipScreenProps = {
  preview?: boolean;
  user?: AuthResponse['user'];
};

const plans = [
  {
    id: 'vip',
    name: 'VIP',
    price: '9.9',
    questions: 100,
    descriptor: '适合稳定日常练习',
    color: '#C08A2D',
    soft: '#FFF4D9',
    features: ['每月 100 道 AI 新题', 'AI 解析与错因分析', '题组练习与上传共享'],
  },
  {
    id: 'svip',
    name: 'SVIP',
    price: '19.9',
    questions: 300,
    descriptor: '适合阶段集中备考',
    color: '#4873D8',
    soft: '#EAF0FF',
    recommended: true,
    features: ['每月 300 道 AI 新题', '更充足的解析与错因机会', '题组练习与上传共享'],
  },
  {
    id: 'ssvip',
    name: 'SSVIP',
    price: '39.9',
    questions: 600,
    descriptor: '适合高频刷题与冲刺',
    color: '#9A55C5',
    soft: '#F5EAFE',
    features: ['每月 600 道 AI 新题', '高频 AI 解析与错因分析', '题组练习与上传共享'],
  },
] as const;

const planLabels: Record<AccountEntitlementsResponse['plan'], string> = {
  free: 'Free',
  vip: 'VIP',
  svip: 'SVIP',
  ssvip: 'SSVIP',
};

function tierColor(plan: AccountEntitlementsResponse['plan']) {
  if (plan === 'vip') return '#C08A2D';
  if (plan === 'svip') return '#4873D8';
  if (plan === 'ssvip') return '#9A55C5';
  return '#708078';
}

export function VipScreen({ preview = false, user }: VipScreenProps) {
  const active = useScreenActive();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [selectedPlanId, setSelectedPlanId] = useState('svip');
  const [entitlements, setEntitlements] = useState<AccountEntitlementsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? plans[1];
  const currentPlan = entitlements?.plan ?? 'free';

  useEffect(() => {
    if (!active || preview || !user) {
      setEntitlements(null);
      return;
    }
    let mounted = true;
    setLoading(true);
    void mobileApi.accountEntitlements()
      .then((result) => {
        if (mounted) setEntitlements(result);
      })
      .catch(() => {
        if (mounted) setEntitlements(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [active, preview, user?.id]);

  async function checkIn() {
    if (preview || !user) {
      Alert.alert('登录后签到', '登录考匠账号后，签到奖励会同步到你的账号。');
      return;
    }
    setCheckingIn(true);
    try {
      const result = await mobileApi.dailyCheckIn();
      setEntitlements(result);
      Alert.alert(
        result.claimed ? '签到成功' : '今天已经签到',
        result.claimed
          ? '今日 AI 机会已到账，可以在做题时使用。'
          : '今日奖励已经领取，明天再来签到吧。',
      );
    } catch (error: unknown) {
      Alert.alert('签到暂时失败', error instanceof Error ? error.message : '请稍后重试。');
    } finally {
      setCheckingIn(false);
    }
  }

  function showPurchaseNotice() {
    if (preview || !user) {
      Alert.alert('登录后查看会员权益', '登录考匠账号后，套餐与使用额度会同步到你的账号。');
      return;
    }
    Alert.alert('支付通道尚未开通', '微信支付或支付宝商户通道接入后，即可购买并自动开通套餐。');
  }

  function showApiUnlockNotice() {
    if (entitlements?.apiConfigUnlocked) {
      Alert.alert('API 配置已解锁', '请前往「我的」→「AI 学习助手」配置自己的 API。');
      return;
    }
    if (preview || !user) {
      Alert.alert('登录后解锁', '自带 API 配置权限为一次性 ¥9.9，登录后可在支付通道开通时购买。');
      return;
    }
    Alert.alert('自带 API 配置', '一次性支付 ¥9.9 解锁。支付通道开通后，即可在「我的」中配置自己的 API。');
  }

  const currentTierColor = tierColor(currentPlan);
  const checkInState = entitlements?.checkIn;

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <EntranceView distance={10} style={styles.pageHeading}>
        <View>
          <Text style={styles.eyebrow}>KAOJIANG MEMBERSHIP</Text>
          <Text style={styles.pageTitle}>考匠会员</Text>
          <Text style={styles.pageSubtitle}>把时间留给练习，让进步看得见。</Text>
        </View>
        <View style={styles.headingMark}><Text style={styles.headingMarkText}>✦</Text></View>
      </EntranceView>

      <EntranceView delay={45} distance={12} style={styles.heroCard}>
        <View style={styles.heroTopline}>
          <View style={[styles.currentPlanPill, { borderColor: `${currentTierColor}88` }]}>
            <View style={[styles.currentPlanDot, { backgroundColor: currentTierColor }]} />
            <Text style={[styles.currentPlanText, { color: currentTierColor }]}>
              当前套餐 · {planLabels[currentPlan]}
            </Text>
          </View>
          <Text style={styles.heroSparkle}>✧</Text>
        </View>
        <Text style={styles.heroTitle}>为每一段认真备考，留出更多空间</Text>
        <Text style={styles.heroDescription}>
          按知识点生成经过复核的题组，做题记录与会员权益跟随你的考匠账号。
        </Text>
        <View style={styles.heroDivider} />
        <View style={styles.heroFootRow}>
          <Text style={styles.heroFootItem}>10 题一组</Text>
          <View style={styles.heroFootDot} />
          <Text style={styles.heroFootItem}>逐题复核</Text>
          <View style={styles.heroFootDot} />
          <Text style={styles.heroFootItem}>跨端同步</Text>
        </View>
      </EntranceView>

      <EntranceView delay={80} distance={10} style={styles.accountCard}>
        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.sectionTitle}>我的权益</Text>
            <Text style={styles.sectionSubtitle}>
              {loading ? '正在同步账号状态…' : entitlements?.expiresAt
                ? `有效期至 ${new Date(entitlements.expiresAt).toLocaleDateString('zh-CN')}`
                : currentPlan === 'free' ? 'Free 用户 · 每日签到可领取 AI 机会' : '会员权益与账号同步'}
            </Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: `${currentTierColor}18` }]}>
            <View style={[styles.statusDot, { backgroundColor: currentTierColor }]} />
            <Text style={[styles.statusText, { color: currentTierColor }]}>{planLabels[currentPlan]}</Text>
          </View>
        </View>
        <View style={styles.creditGrid}>
          <CreditCell label="解析机会" value={checkInState?.remaining.explanations ?? 0} unit="次" />
          <CreditCell label="AI 出题" value={checkInState?.remaining.generations ?? 0} unit="组" />
          <CreditCell label="AI 分析" value={checkInState?.remaining.analyses ?? 0} unit="次" />
        </View>
      </EntranceView>

      <EntranceView delay={110} distance={10} style={styles.checkInCard}>
        <View style={styles.sectionHeading}>
          <View style={styles.checkInHeadingCopy}>
            <Text style={styles.sectionTitle}>每日签到</Text>
            <Text style={styles.sectionSubtitle}>每天领取解析、出题和错因分析机会</Text>
          </View>
          <Text style={styles.checkInCalendar}>日</Text>
        </View>
        <View style={styles.rewardRow}>
          <RewardChip label="解析" value="5 次" />
          <RewardChip label="AI 出题" value="1 组" />
          <RewardChip label="AI 分析" value="3 次" />
        </View>
        <AnimatedPressable
          accessibilityRole="button"
          disabled={checkingIn || (!!checkInState?.claimed && !preview)}
          onPress={() => void checkIn()}
          style={[styles.checkInButton, checkInState?.claimed && styles.checkInButtonClaimed]}
        >
          {checkingIn ? <ActivityIndicator color={colors.white} /> : (
            <Text style={styles.checkInButtonText}>
              {checkInState?.claimed ? '今日已签到' : '立即签到'}
            </Text>
          )}
        </AnimatedPressable>
        {!entitlements?.aiServiceAvailable && !preview && user && (
          <Text style={styles.serviceHint}>AI 服务正在准备中，签到奖励会先为你保留。</Text>
        )}
      </EntranceView>

      <View style={styles.plansHeading}>
        <View>
          <Text style={styles.sectionTitle}>选择适合你的方案</Text>
          <Text style={styles.sectionSubtitle}>月度套餐 · 一次购买 · 不自动续费</Text>
        </View>
        <Text style={styles.planCount}>3 个等级</Text>
      </View>

      <View style={styles.planList}>
        {plans.map((plan) => {
          const selected = selectedPlanId === plan.id;
          return (
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={plan.id}
              onPress={() => setSelectedPlanId(plan.id)}
              style={[
                styles.planCard,
                selected && { borderColor: plan.color, borderWidth: 1.5 },
                'recommended' in plan && plan.recommended && styles.planCardRecommended,
              ]}
            >
              <View style={styles.planTopRow}>
                <View style={styles.planNameRow}>
                  <View style={[styles.planTierMark, { backgroundColor: plan.soft }]}>
                    <Text style={[styles.planTierMarkText, { color: plan.color }]}>✦</Text>
                  </View>
                  <View>
                    <Text style={[styles.planName, { color: plan.color }]}>{plan.name}</Text>
                    <Text style={styles.planDescriptor}>{plan.descriptor}</Text>
                  </View>
                  {'recommended' in plan && plan.recommended && (
                    <View style={styles.recommendedPill}><Text style={styles.recommendedText}>推荐</Text></View>
                  )}
                </View>
                <View style={styles.planPriceRow}>
                  <Text style={styles.currency}>¥</Text>
                  <Text style={styles.planPrice}>{plan.price}</Text>
                  <Text style={styles.planPeriod}>/月</Text>
                </View>
              </View>
              <View style={[styles.planQuotaRow, { backgroundColor: plan.soft }]}>
                <View>
                  <Text style={styles.planQuotaLabel}>AI 新题额度</Text>
                  <Text style={[styles.planQuotaValue, { color: plan.color }]}>{plan.questions} 道 / 月</Text>
                </View>
                <Text style={[styles.planQuotaArrow, { color: plan.color }]}>›</Text>
              </View>
              {plan.features.map((feature) => (
                <View key={feature} style={styles.planFeatureRow}>
                  <Text style={[styles.planCheck, { color: plan.color }]}>✓</Text>
                  <Text style={styles.planFeature}>{feature}</Text>
                </View>
              ))}
            </AnimatedPressable>
          );
        })}
      </View>

      <View style={styles.planDisclosure}>
        <Text style={styles.planDisclosureTitle}>方案权益</Text>
        <Text style={styles.planDisclosureText}>
          VIP、SVIP、SSVIP 提供不同的新题额度与 AI 学习权益。套餐开通后会显示在「我的权益」中。
        </Text>
      </View>

      <AnimatedPressable accessibilityRole="button" onPress={showPurchaseNotice} style={styles.subscribeButton}>
        <View>
          <Text style={styles.subscribeTitle}>开通 {selectedPlan.name}</Text>
          <Text style={styles.subscribeSubtitle}>¥{selectedPlan.price} / 30 天</Text>
        </View>
        <Text style={styles.subscribeArrow}>查看支付方式 ›</Text>
      </AnimatedPressable>
      <Text style={styles.paymentFootnote}>支付通道开通后即可购买，当前不会扣款。</Text>

      <AnimatedPressable accessibilityRole="button" onPress={showApiUnlockNotice} style={styles.apiUnlockEntry}>
        <View style={styles.apiUnlockIcon}><Text style={styles.apiUnlockIconText}>⌘</Text></View>
        <View style={styles.apiUnlockCopy}>
          <Text style={styles.apiUnlockTitle}>自带 API 配置</Text>
          <Text style={styles.apiUnlockSubtitle}>
            {entitlements?.apiConfigUnlocked ? '已解锁 · 前往「我的」配置' : '一次性 ¥9.9 解锁配置权限'}
          </Text>
        </View>
        <Text style={styles.apiUnlockArrow}>{entitlements?.apiConfigUnlocked ? '已解锁' : '›'}</Text>
      </AnimatedPressable>
    </ScrollView>
  );
}

function CreditCell({ label, value, unit }: { label: string; value: number; unit: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.creditCell}>
      <Text style={styles.creditValue}>{value}<Text style={styles.creditUnit}> {unit}</Text></Text>
      <Text style={styles.creditLabel}>{label}</Text>
    </View>
  );
}

function RewardChip({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.rewardChip}>
      <Text style={styles.rewardValue}>{value}</Text>
      <Text style={styles.rewardLabel}>{label}</Text>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xl, paddingHorizontal: spacing.md, paddingTop: spacing.xl },
  pageHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  eyebrow: { color: colors.brand, fontSize: 10, fontWeight: '900', letterSpacing: 1.7 },
  pageTitle: { color: colors.text, fontSize: 27, fontWeight: '900', marginTop: 4 },
  pageSubtitle: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  headingMark: { alignItems: 'center', backgroundColor: colors.goldSoft, borderRadius: radius.md, height: 44, justifyContent: 'center', width: 44 },
  headingMarkText: { color: colors.gold, fontSize: 27, fontWeight: '900' },
  heroCard: { backgroundColor: '#12392F', borderColor: '#285847', borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden', padding: spacing.lg, ...shadow.card },
  heroTopline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  currentPlanPill: { alignItems: 'center', backgroundColor: '#203F35', borderRadius: radius.pill, borderWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingVertical: 6 },
  currentPlanDot: { borderRadius: radius.pill, height: 6, width: 6 },
  currentPlanText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.3 },
  heroSparkle: { color: '#E8C77E', fontSize: 30, lineHeight: 32 },
  heroTitle: { color: '#F5F7EF', fontSize: 21, fontWeight: '900', lineHeight: 29, marginTop: spacing.md },
  heroDescription: { color: '#C3D8CC', fontSize: 12, lineHeight: 20, marginTop: 6 },
  heroDivider: { backgroundColor: '#3A6251', height: StyleSheet.hairlineWidth, marginVertical: spacing.md },
  heroFootRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  heroFootItem: { color: '#DDEBE1', fontSize: 10, fontWeight: '700' },
  heroFootDot: { backgroundColor: '#D8B96F', borderRadius: radius.pill, height: 4, width: 4 },
  accountCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.md, padding: spacing.md, ...shadow.card },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  sectionSubtitle: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  statusPill: { alignItems: 'center', borderRadius: radius.pill, flexDirection: 'row', gap: 5, paddingHorizontal: 9, paddingVertical: 6 },
  statusDot: { borderRadius: radius.pill, height: 6, width: 6 },
  statusText: { fontSize: 10, fontWeight: '800' },
  creditGrid: { backgroundColor: colors.surfaceMuted, borderRadius: radius.md, flexDirection: 'row', paddingVertical: spacing.md },
  creditCell: { alignItems: 'center', borderRightColor: colors.border, borderRightWidth: StyleSheet.hairlineWidth, flex: 1 },
  creditValue: { color: colors.brandDark, fontSize: 22, fontWeight: '900' },
  creditUnit: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
  creditLabel: { color: colors.textMuted, fontSize: 10, marginTop: 3 },
  checkInCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.md, padding: spacing.md, ...shadow.card },
  checkInHeadingCopy: { flex: 1 },
  checkInCalendar: { alignItems: 'center', backgroundColor: colors.brandSoft, borderRadius: radius.sm, color: colors.brandDark, fontSize: 16, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 11, paddingVertical: 7 },
  rewardRow: { flexDirection: 'row', gap: spacing.xs },
  rewardChip: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, flex: 1, paddingVertical: spacing.sm },
  rewardValue: { color: colors.brandDark, fontSize: 13, fontWeight: '900' },
  rewardLabel: { color: colors.textMuted, fontSize: 10, marginTop: 3 },
  checkInButton: { alignItems: 'center', backgroundColor: colors.brand, borderRadius: radius.md, justifyContent: 'center', minHeight: 46 },
  checkInButtonClaimed: { backgroundColor: colors.surfaceMuted },
  checkInButtonText: { color: colors.white, fontSize: 13, fontWeight: '900' },
  serviceHint: { color: colors.textFaint, fontSize: 10, lineHeight: 15, textAlign: 'center' },
  plansHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2, paddingTop: spacing.xs },
  planCount: { color: colors.textFaint, fontSize: 10, fontWeight: '700' },
  planList: { gap: spacing.sm },
  planCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, gap: spacing.sm, padding: spacing.md },
  planCardRecommended: { ...shadow.card, elevation: 2 },
  planTopRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  planNameRow: { alignItems: 'center', flexDirection: 'row', flex: 1, gap: 8 },
  planTierMark: { alignItems: 'center', borderRadius: radius.sm, height: 34, justifyContent: 'center', width: 34 },
  planTierMarkText: { fontSize: 20, fontWeight: '900' },
  planName: { fontSize: 15, fontWeight: '900' },
  planDescriptor: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  recommendedPill: { backgroundColor: colors.goldSoft, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 3 },
  recommendedText: { color: colors.gold, fontSize: 9, fontWeight: '900' },
  planPriceRow: { alignItems: 'baseline', flexDirection: 'row' },
  currency: { color: colors.text, fontSize: 12, fontWeight: '800' },
  planPrice: { color: colors.text, fontSize: 23, fontWeight: '900', marginLeft: 1 },
  planPeriod: { color: colors.textMuted, fontSize: 10, marginLeft: 2 },
  planQuotaRow: { alignItems: 'center', borderRadius: radius.sm, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.sm, paddingVertical: 8 },
  planQuotaLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
  planQuotaValue: { fontSize: 13, fontWeight: '900', marginTop: 2 },
  planQuotaArrow: { fontSize: 21, fontWeight: '700' },
  planFeatureRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 7 },
  planCheck: { fontSize: 12, fontWeight: '900', lineHeight: 17 },
  planFeature: { color: colors.textMuted, flex: 1, fontSize: 10, lineHeight: 16 },
  planDisclosure: { backgroundColor: colors.surfaceMuted, borderRadius: radius.md, gap: 4, padding: spacing.md },
  planDisclosureTitle: { color: colors.text, fontSize: 11, fontWeight: '900' },
  planDisclosureText: { color: colors.textMuted, fontSize: 10, lineHeight: 16 },
  subscribeButton: { alignItems: 'center', backgroundColor: colors.brand, borderRadius: radius.md, flexDirection: 'row', justifyContent: 'space-between', minHeight: 58, paddingHorizontal: spacing.md, ...shadow.card },
  subscribeTitle: { color: colors.white, fontSize: 14, fontWeight: '900' },
  subscribeSubtitle: { color: '#D8F0E5', fontSize: 10, marginTop: 2 },
  subscribeArrow: { color: colors.white, fontSize: 11, fontWeight: '900' },
  paymentFootnote: { color: colors.textFaint, fontSize: 9, lineHeight: 14, marginTop: -spacing.xs, textAlign: 'center' },
  apiUnlockEntry: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, paddingHorizontal: spacing.xs, paddingTop: spacing.md },
  apiUnlockIcon: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, height: 32, justifyContent: 'center', width: 32 },
  apiUnlockIconText: { color: colors.textMuted, fontSize: 16, fontWeight: '800' },
  apiUnlockCopy: { flex: 1 },
  apiUnlockTitle: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
  apiUnlockSubtitle: { color: colors.textFaint, fontSize: 9, marginTop: 2 },
  apiUnlockArrow: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
});
