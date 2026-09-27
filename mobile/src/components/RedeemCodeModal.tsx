import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "./SafeArea";
import {
  mobileApi,
  type AccountEntitlementsResponse,
  type MembershipRedemption,
} from "../api/client";
import { AnimatedPressable } from "./Motion";
import { useTheme, useThemedStyles, type ThemeColors } from "../theme";

export const membershipLabels = {
  free: "Free",
  vip: "VIP",
  svip: "SVIP",
  ssvip: "SSVIP",
} as const;
export const membershipColors = {
  free: "#708078",
  vip: "#B28132",
  svip: "#5277C9",
  ssvip: "#9363B9",
} as const;
export const membershipDate = (value: string) =>
  new Date(value).toLocaleDateString("zh-CN");

type Props = {
  visible: boolean;
  preview?: boolean;
  userId?: string;
  onClose: () => void;
  onRedeemed?: (entitlements: AccountEntitlementsResponse) => void;
};

export function RedeemCodeModal({
  visible,
  preview = false,
  userId,
  onClose,
  onRedeemed,
}: Props) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<MembershipRedemption[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [result, setResult] = useState<{
    alreadyRedeemed: boolean;
    redemption: {
      plan: "vip" | "svip" | "ssvip";
      durationDays: number;
      expiresAt: string;
    };
  } | null>(null);

  useEffect(() => {
    setCode("");
    setError("");
    setResult(null);
    setHistory([]);
    setHistoryError("");
    if (!visible || preview || !userId) {
      setHistoryLoading(false);
      return;
    }
    let live = true;
    setHistoryLoading(true);
    void mobileApi
      .membershipRedemptions()
      .then((data) => {
        if (live) setHistory(data.redemptions);
      })
      .catch(() => {
        if (live) setHistoryError("暂时无法读取兑换记录，请重新打开后重试。");
      })
      .finally(() => {
        if (live) setHistoryLoading(false);
      });
    return () => {
      live = false;
    };
  }, [visible, preview, userId]);

  async function redeem() {
    if (submitting.current) return;
    if (preview || !userId) {
      setError("请登录考匠账号后使用兑换码。");
      return;
    }
    if (!code.trim()) {
      setError("请先输入兑换码。");
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const data = await mobileApi.redeemMembership(code.trim());
      setResult(data);
      setCode("");
      onRedeemed?.(data.entitlements);
      void mobileApi
        .membershipRedemptions()
        .then((next) => {
          setHistory(next.redemptions);
          setHistoryError("");
        })
        .catch(() => setHistoryError("会员已到账，兑换记录暂未同步。"));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "兑换失败，请稍后重试。",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.nav}>
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel="返回"
            disabled={busy}
            onPress={onClose}
            style={styles.back}
          >
            <Text style={styles.backText}>‹ 返回</Text>
          </AnimatedPressable>
          <Text style={styles.navTitle}>兑换码</Text>
          <View style={styles.navSpacer} />
        </View>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
          >
            <View style={styles.heading}>
              <Text style={styles.eyebrow}>开启更多学习可能</Text>
              <Text style={styles.title}>让权益，即刻到账。</Text>
              <Text style={styles.subtitle}>
                输入会员兑换码，权益将绑定当前考匠账号。
              </Text>
            </View>
            {result ? (
              <View style={styles.success} accessibilityLiveRegion="polite">
                <Text style={styles.successMark}>✓</Text>
                <Text style={styles.successTitle}>
                  {result.alreadyRedeemed
                    ? "这张兑换码已兑换到你的账号"
                    : `${membershipLabels[result.redemption.plan]} 兑换成功`}
                </Text>
                <Text style={styles.successText}>
                  本次权益到期日 · {membershipDate(result.redemption.expiresAt)}
                </Text>
                <AnimatedPressable
                  accessibilityRole="button"
                  onPress={onClose}
                  style={styles.button}
                >
                  <Text style={styles.buttonText}>完成</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  accessibilityRole="button"
                  onPress={() => setResult(null)}
                  style={styles.more}
                >
                  <Text style={styles.moreText}>继续兑换</Text>
                </AnimatedPressable>
              </View>
            ) : (
              <View style={styles.form}>
                <Text style={styles.label}>会员兑换码</Text>
                <TextInput
                  accessibilityLabel="会员兑换码"
                  value={code}
                  editable={!busy}
                  onChangeText={(value) => {
                    setCode(value);
                    setError("");
                  }}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={80}
                  placeholder="输入或粘贴兑换码"
                  placeholderTextColor={colors.textFaint}
                  style={[styles.input, !!error && styles.invalid]}
                  returnKeyType="done"
                  onSubmitEditing={() => void redeem()}
                />
                {!!error && (
                  <Text style={styles.error} accessibilityLiveRegion="polite">
                    {error}
                  </Text>
                )}
                <AnimatedPressable
                  accessibilityRole="button"
                  disabled={busy || !code.trim()}
                  onPress={() => void redeem()}
                  style={[
                    styles.button,
                    (busy || !code.trim()) && styles.disabled,
                  ]}
                >
                  {busy ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.buttonText}>确认兑换</Text>
                  )}
                </AnimatedPressable>
                <Text style={styles.hint}>
                  每张兑换码限用一次。会员有效期内支持同等级续期；其他等级可在到期后兑换。
                </Text>
              </View>
            )}
            <View style={styles.historyHeading}>
              <Text style={styles.historyTitle}>兑换记录</Text>
              <Text style={styles.historyMeta}>当前账号</Text>
            </View>
            {historyLoading ? (
              <ActivityIndicator color={colors.brand} />
            ) : historyError ? (
              <Text style={styles.hint}>{historyError}</Text>
            ) : history.length ? (
              history.map((entry) => (
                <View key={entry.id} style={styles.historyRow}>
                  <View
                    style={[
                      styles.tier,
                      { backgroundColor: `${membershipColors[entry.plan]}15` },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tierText,
                        { color: membershipColors[entry.plan] },
                      ]}
                    >
                      {membershipLabels[entry.plan]}
                    </Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.recordTitle}>
                      {entry.durationDays} 天会员
                    </Text>
                    <Text style={styles.recordMeta}>
                      {membershipDate(entry.redeemedAt)} 兑换
                    </Text>
                  </View>
                  <Text style={styles.recordState}>已到账</Text>
                </View>
              ))
            ) : (
              <Text style={styles.empty}>
                暂无兑换记录，兑换成功后会显示在这里。
              </Text>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    flex: { flex: 1 },
    nav: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    back: { minWidth: 66, minHeight: 40, justifyContent: "center" },
    backText: { color: c.brand, fontSize: 16 },
    navTitle: { color: c.text, fontSize: 17, fontWeight: "700" },
    navSpacer: { width: 66 },
    content: { padding: 22, paddingBottom: 40, gap: 20 },
    heading: { paddingTop: 18, paddingBottom: 6, gap: 10 },
    eyebrow: { color: c.brand, fontSize: 12, fontWeight: "700" },
    title: { color: c.text, fontSize: 27, fontWeight: "800" },
    subtitle: { color: c.textMuted, fontSize: 13, lineHeight: 21 },
    form: {
      backgroundColor: c.surface,
      padding: 20,
      borderRadius: 18,
      borderColor: c.border,
      borderWidth: 1,
      gap: 14,
    },
    label: { color: c.text, fontSize: 14, fontWeight: "700" },
    input: {
      backgroundColor: c.background,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      minHeight: 54,
      color: c.text,
      fontSize: 15,
    },
    invalid: { borderColor: c.warning },
    button: {
      backgroundColor: c.brand,
      borderRadius: 12,
      minHeight: 50,
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "stretch",
    },
    buttonText: { color: c.white, fontSize: 15, fontWeight: "700" },
    disabled: { opacity: 0.5 },
    hint: { color: c.textMuted, fontSize: 12, lineHeight: 20 },
    error: { color: c.warning, fontSize: 13, lineHeight: 21 },
    success: {
      backgroundColor: c.surface,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 18,
      padding: 24,
      alignItems: "center",
      gap: 16,
    },
    successMark: {
      color: c.brand,
      fontSize: 30,
      backgroundColor: c.brandSoft,
      borderRadius: 28,
      width: 56,
      height: 56,
      lineHeight: 56,
      textAlign: "center",
      overflow: "hidden",
    },
    successTitle: {
      fontSize: 19,
      fontWeight: "800",
      color: c.text,
      textAlign: "center",
    },
    successText: { color: c.textMuted, fontSize: 13 },
    more: { padding: 8 },
    moreText: { color: c.brand, fontSize: 13 },
    historyHeading: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingTop: 8,
    },
    historyTitle: { color: c.text, fontSize: 17, fontWeight: "700" },
    historyMeta: { color: c.textFaint, fontSize: 12 },
    historyRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingBottom: 15,
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    tier: {
      borderRadius: 8,
      paddingHorizontal: 9,
      paddingVertical: 10,
      minWidth: 60,
      alignItems: "center",
    },
    tierText: { fontWeight: "800", fontSize: 12 },
    recordTitle: { color: c.text, fontSize: 14, fontWeight: "600" },
    recordMeta: { color: c.textMuted, fontSize: 12, marginTop: 4 },
    recordState: { color: c.brand, fontSize: 12 },
    empty: {
      color: c.textMuted,
      fontSize: 13,
      paddingVertical: 16,
      lineHeight: 21,
    },
  });
