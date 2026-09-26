import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AuthResponse } from '../api/client';
import { AnimatedPressable, EntranceView } from '../components/Motion';
import { radius, shadow, spacing, useThemedStyles, useTheme, type ThemeColors } from '../theme';

type VipScreenProps = {
  preview?: boolean;
  user?: AuthResponse['user'];
};

const plans = [
  {
    id: 'starter',
    name: '入门版',
    price: '9.9',
    questions: 100,
    descriptor: '适合稳定日常练习',
  },
  {
    id: 'advanced',
    name: '进阶版',
    price: '19.9',
    questions: 300,
    descriptor: '适合阶段集中备考',
    recommended: true,
  },
  {
    id: 'professional',
    name: '专业版',
    price: '39.9',
    questions: 600,
    descriptor: '适合高频刷题与冲刺',
  },
] as const;

export function VipScreen({ preview = false, user }: VipScreenProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [selectedPlanId, setSelectedPlanId] = useState('advanced');
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? plans[1];

  function showSubscribeNotice() {
    if (preview || !user) {
      Alert.alert('登录后同步会员权益', '登录考匠账号后，会员状态和 AI 出题额度会同步到你的账号。');
      return;
    }
    Alert.alert(
      '支付通道尚未开通',
      '套餐权益已展示。完成微信或支付宝商户支付接入后，即可购买并自动同步剩余额度。',
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <EntranceView distance={10} style={styles.pageHeading}>
        <View>
          <Text style={styles.eyebrow}>KAOJIANG MEMBERSHIP</Text>
          <Text style={styles.pageTitle}>考匠 VIP</Text>
          <Text style={styles.pageSubtitle}>为每一段认真备考，留出更多空间。</Text>
        </View>
        <View style={styles.headingMark}><Text style={styles.headingMarkText}>✦</Text></View>
      </EntranceView>

      <EntranceView delay={50} distance={12} style={styles.heroCard}>
        <View style={styles.heroTopline}>
          <View style={styles.vipPill}><Text style={styles.vipPillText}>VIP 会员权益</Text></View>
          <Text style={styles.heroSparkle}>✧</Text>
        </View>
        <Text style={styles.heroTitle}>把时间花在掌握知识上</Text>
        <Text style={styles.heroDescription}>
          按知识点生成经过二次审核的题组，练习记录和会员额度跟随你的考匠账号。
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

      <EntranceView delay={90} distance={10} style={styles.accountCard}>
        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.sectionTitle}>我的权益</Text>
            <Text style={styles.sectionSubtitle}>
              {preview || !user ? '登录后同步账号状态' : '权益与出题额度绑定考匠账号'}
            </Text>
          </View>
          <View style={styles.statusPill}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>尚未开通</Text>
          </View>
        </View>
        <View style={styles.quotaPanel}>
          <View style={styles.quotaMain}>
            <Text style={styles.quotaLabel}>AI 出题剩余额度</Text>
            <View style={styles.quotaValueRow}>
              <Text style={styles.quotaValue}>—</Text>
              <Text style={styles.quotaUnit}>道</Text>
            </View>
            <Text style={styles.quotaHint}>订阅生效后显示实时余额</Text>
          </View>
          <View style={styles.quotaDivider} />
          <View style={styles.quotaSide}>
            <Text style={styles.quotaSideValue}>∞</Text>
            <Text style={styles.quotaSideLabel}>已缓存标准解析</Text>
            <Text style={styles.quotaSideHint}>同一道题重复查看不重复生成</Text>
          </View>
        </View>
      </EntranceView>

      <View style={styles.plansHeading}>
        <View>
          <Text style={styles.sectionTitle}>选择适合你的方案</Text>
          <Text style={styles.sectionSubtitle}>月度套餐 · 一次购买 · 不自动续费</Text>
        </View>
        <Text style={styles.planCount}>3 个方案</Text>
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
                selected && styles.planCardSelected,
                'recommended' in plan && plan.recommended && styles.planCardRecommended,
              ]}
            >
              <View style={styles.planTopRow}>
                <View style={styles.planNameRow}>
                  <View style={[styles.planRadio, selected && styles.planRadioSelected]}>
                    {selected && <View style={styles.planRadioDot} />}
                  </View>
                  <Text style={styles.planName}>{plan.name}</Text>
                  {'recommended' in plan && plan.recommended && (
                    <View style={styles.recommendedPill}>
                      <Text style={styles.recommendedText}>推荐</Text>
                    </View>
                  )}
                </View>
                <View style={styles.planPriceRow}>
                  <Text style={styles.currency}>¥</Text>
                  <Text style={styles.planPrice}>{plan.price}</Text>
                  <Text style={styles.planPeriod}>/月</Text>
                </View>
              </View>
              <Text style={styles.planDescriptor}>{plan.descriptor}</Text>
              <View style={styles.planRule} />
              <View style={styles.planQuotaRow}>
                <View>
                  <Text style={styles.planQuotaLabel}>AI 新题</Text>
                  <Text style={styles.planQuotaValue}>{plan.questions} 道 / 月</Text>
                </View>
                <Text style={styles.planQuotaArrow}>›</Text>
              </View>
              <View style={styles.planFeatureRow}>
                <Text style={styles.planCheck}>✓</Text>
                <Text style={styles.planFeature}>标准解析与常见错因，首次生成后可反复查看</Text>
              </View>
              <View style={styles.planFeatureRow}>
                <Text style={styles.planCheck}>✓</Text>
                <Text style={styles.planFeature}>已审核题组可上传共享，也可直接刷题</Text>
              </View>
            </AnimatedPressable>
          );
        })}
      </View>

      <View style={styles.cacheNote}>
        <View style={styles.cacheNoteIcon}><Text style={styles.cacheNoteIconText}>i</Text></View>
        <View style={styles.cacheNoteCopy}>
          <Text style={styles.cacheNoteTitle}>解析按题缓存，额度花在新题上</Text>
          <Text style={styles.cacheNoteText}>
            同一道共享题的标准解析和常见错因生成一次后保存复用。额度按最终审核通过的 AI 新题数计算。
          </Text>
        </View>
      </View>

      <AnimatedPressable
        accessibilityRole="button"
        onPress={showSubscribeNotice}
        style={styles.subscribeButton}
      >
        <View>
          <Text style={styles.subscribeTitle}>订阅{selectedPlan.name}</Text>
          <Text style={styles.subscribeSubtitle}>¥{selectedPlan.price} / 30 天</Text>
        </View>
        <Text style={styles.subscribeArrow}>继续 ›</Text>
      </AnimatedPressable>
      <Text style={styles.paymentFootnote}>支付功能开通后，权益会在到账确认后自动同步。</Text>
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    content: { gap: spacing.md, paddingBottom: spacing.xl, paddingHorizontal: spacing.md, paddingTop: spacing.md },
    pageHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
    eyebrow: { color: colors.brand, fontSize: 10, fontWeight: '900', letterSpacing: 1.7 },
    pageTitle: { color: colors.text, fontSize: 26, fontWeight: '900', marginTop: 3 },
    pageSubtitle: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
    headingMark: { alignItems: 'center', backgroundColor: colors.goldSoft, borderRadius: radius.md, height: 44, justifyContent: 'center', width: 44 },
    headingMarkText: { color: colors.gold, fontSize: 27, fontWeight: '900' },
    heroCard: { backgroundColor: '#12392F', borderColor: '#285847', borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden', padding: spacing.lg, ...shadow.card },
    heroTopline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    vipPill: { backgroundColor: '#244E40', borderColor: '#597C5E', borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
    vipPillText: { color: '#E8C77E', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
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
    statusPill: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: radius.pill, flexDirection: 'row', gap: 5, paddingHorizontal: 9, paddingVertical: 6 },
    statusDot: { backgroundColor: colors.textFaint, borderRadius: radius.pill, height: 6, width: 6 },
    statusText: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
    quotaPanel: { alignItems: 'stretch', backgroundColor: colors.surfaceMuted, borderRadius: radius.md, flexDirection: 'row', minHeight: 112, padding: spacing.md },
    quotaMain: { flex: 1.05, justifyContent: 'center' },
    quotaLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
    quotaValueRow: { alignItems: 'baseline', flexDirection: 'row', gap: 4, marginTop: 4 },
    quotaValue: { color: colors.text, fontSize: 30, fontWeight: '900', lineHeight: 36 },
    quotaUnit: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
    quotaHint: { color: colors.textFaint, fontSize: 9, marginTop: 3 },
    quotaDivider: { backgroundColor: colors.border, marginHorizontal: spacing.md, width: StyleSheet.hairlineWidth },
    quotaSide: { flex: 1, justifyContent: 'center' },
    quotaSideValue: { color: colors.brand, fontSize: 23, fontWeight: '900' },
    quotaSideLabel: { color: colors.text, fontSize: 10, fontWeight: '800', marginTop: 3 },
    quotaSideHint: { color: colors.textMuted, fontSize: 9, lineHeight: 13, marginTop: 3 },
    plansHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2, paddingTop: spacing.xs },
    planCount: { color: colors.textFaint, fontSize: 10, fontWeight: '700' },
    planList: { gap: spacing.sm },
    planCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, padding: spacing.md },
    planCardSelected: { borderColor: colors.brand, borderWidth: 1.5 },
    planCardRecommended: { shadowColor: colors.brandDark, shadowOpacity: 0.1, shadowRadius: 12, elevation: 2 },
    planTopRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    planNameRow: { alignItems: 'center', flexDirection: 'row', gap: 7 },
    planRadio: { alignItems: 'center', borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1.5, height: 17, justifyContent: 'center', width: 17 },
    planRadioSelected: { borderColor: colors.brand },
    planRadioDot: { backgroundColor: colors.brand, borderRadius: radius.pill, height: 8, width: 8 },
    planName: { color: colors.text, fontSize: 14, fontWeight: '900' },
    recommendedPill: { backgroundColor: colors.goldSoft, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 3 },
    recommendedText: { color: colors.gold, fontSize: 9, fontWeight: '900' },
    planPriceRow: { alignItems: 'baseline', flexDirection: 'row' },
    currency: { color: colors.text, fontSize: 12, fontWeight: '800' },
    planPrice: { color: colors.text, fontSize: 23, fontWeight: '900', marginLeft: 1 },
    planPeriod: { color: colors.textMuted, fontSize: 10, marginLeft: 2 },
    planDescriptor: { color: colors.textMuted, fontSize: 10, marginLeft: 24, marginTop: 2 },
    planRule: { backgroundColor: colors.border, height: StyleSheet.hairlineWidth, marginVertical: spacing.sm },
    planQuotaRow: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.sm, paddingVertical: 8 },
    planQuotaLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
    planQuotaValue: { color: colors.brandDark, fontSize: 13, fontWeight: '900', marginTop: 2 },
    planQuotaArrow: { color: colors.brand, fontSize: 21, fontWeight: '700' },
    planFeatureRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 7, marginTop: 8 },
    planCheck: { color: colors.brand, fontSize: 12, fontWeight: '900', lineHeight: 17 },
    planFeature: { color: colors.textMuted, flex: 1, fontSize: 10, lineHeight: 16 },
    cacheNote: { alignItems: 'flex-start', backgroundColor: colors.goldSoft, borderColor: colors.gold, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
    cacheNoteIcon: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.pill, height: 20, justifyContent: 'center', width: 20 },
    cacheNoteIconText: { color: colors.gold, fontSize: 12, fontWeight: '900' },
    cacheNoteCopy: { flex: 1, gap: 3 },
    cacheNoteTitle: { color: colors.text, fontSize: 11, fontWeight: '900' },
    cacheNoteText: { color: colors.textMuted, fontSize: 10, lineHeight: 16 },
    subscribeButton: { alignItems: 'center', backgroundColor: colors.brand, borderRadius: radius.md, flexDirection: 'row', justifyContent: 'space-between', minHeight: 58, paddingHorizontal: spacing.md, ...shadow.card },
    subscribeTitle: { color: colors.white, fontSize: 14, fontWeight: '900' },
    subscribeSubtitle: { color: '#D8F0E5', fontSize: 10, marginTop: 2 },
    subscribeArrow: { color: colors.white, fontSize: 12, fontWeight: '900' },
    paymentFootnote: { color: colors.textFaint, fontSize: 9, lineHeight: 14, marginTop: -spacing.xs, textAlign: 'center' },
  });
