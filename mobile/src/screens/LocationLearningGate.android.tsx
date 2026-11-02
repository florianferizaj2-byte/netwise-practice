import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { mobileApi } from "../api/client";
import { AnimatedPressable } from "../components/Motion";
import { AndroidModalSafeArea } from "../components/AndroidModalSafeArea.android";
import { AppIcon } from "../components/AppIcon";
import { useScreenActive } from "../navigation/ScreenActivity";
import { useThemedStyles, type ThemeColors } from "../theme";

export function LocationLearningGate({
  visible,
  onClose,
  onEnter,
}: {
  visible: boolean;
  onClose: () => void;
  onEnter: () => Promise<void>;
}) {
  const s = useThemedStyles(styles),
    screenActive = useScreenActive();
  const [todayCount, setTodayCount] = useState<number | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0);
  const requestBusy = useRef(false);

  useEffect(() => {
    if (!visible) {
      setTodayCount(null);
      return;
    }
    let live = true;
    setLoading(true);
    setError("");
    mobileApi
      .dashboard(true)
      .then((summary) => {
        if (live && Number.isFinite(summary?.todayCount))
          setTodayCount(summary.todayCount);
        else if (live)
          setError("暂时无法读取今日答题数");
      })
      .catch((cause) => {
        if (live) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [visible, retry]);

  const threshold = 10,
    qualified = todayCount !== null && todayCount > threshold,
    remaining = Math.max(0, threshold + 1 - (todayCount ?? 0));

  async function enter() {
    if (requestBusy.current || !qualified) return;
    requestBusy.current = true;
    setBusy(true);
    setError("");
    try {
      await onEnter();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      requestBusy.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal
      visible={visible && screenActive}
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <AndroidModalSafeArea style={s.safe}>
        <View style={s.header}>
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel="退出专项学习"
            disabled={busy}
            onPress={onClose}
            style={s.headerAction}
          >
            <AppIcon name="chevron-left" size={24} color={s.text.color} />
          </AnimatedPressable>
          <Text accessibilityRole="header" style={s.headerTitle}>
            模拟定位学习
          </Text>
          <View style={s.headerAction} />
        </View>
        <ScrollView contentContainerStyle={s.content}>
          {error ? (
            <View accessibilityRole="alert" style={s.error}>
              <Text style={s.errorText}>{error}</Text>
              <AnimatedPressable
                accessibilityRole="button"
                onPress={() => setRetry((value) => value + 1)}
                style={s.secondary}
              >
                <Text style={s.link}>重新读取进度</Text>
              </AnimatedPressable>
            </View>
          ) : null}
          {loading && todayCount === null ? (
            <ActivityIndicator accessibilityLabel="正在读取今日答题数" />
          ) : todayCount !== null ? (
            <View style={s.card}>
              <Text style={s.eyebrow}>今日已答</Text>
              <View testID="location-learning-today-count" style={s.countRow}>
                <Text accessibilityLabel={`今日已答 ${todayCount} 题`} style={s.count}>
                  {todayCount}
                </Text>
                <Text style={s.countUnit}>题</Text>
              </View>
              <Text style={s.title}>
                {qualified ? "今日条件已满足" : "今日条件未满足"}
              </Text>
              <Text style={s.body}>
                {qualified
                  ? `今日答题数已超过 ${threshold} 题，可以进入。`
                  : `今日答题数需大于 ${threshold} 题；还需完成 ${remaining} 题。`}
              </Text>
              {qualified ? (
                <AnimatedPressable
                  accessibilityRole="button"
                  disabled={busy}
                  style={[s.primary, busy && s.disabled]}
                  onPress={() => void enter()}
                >
                  <Text style={s.primaryText}>
                    {busy ? "正在核验资格…" : "进入模拟定位学习"}
                  </Text>
                </AnimatedPressable>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      </AndroidModalSafeArea>
    </Modal>
  );
}

const styles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    header: {
      minHeight: 57,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    headerAction: {
      width: 48,
      minHeight: 48,
      justifyContent: "center",
      alignItems: "flex-start",
    },
    headerTitle: {
      flex: 1,
      minWidth: 0,
      textAlign: "center",
      fontSize: 16,
      fontWeight: "700",
      color: c.text,
    },
    content: { flexGrow: 1, justifyContent: "center", padding: 18 },
    card: {
      gap: 12,
      padding: 20,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      backgroundColor: c.surface,
    },
    eyebrow: { fontSize: 13, color: c.textMuted },
    countRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
    count: { fontSize: 42, lineHeight: 50, fontWeight: "700", color: c.text },
    countUnit: { fontSize: 15, color: c.textMuted },
    title: { fontSize: 19, lineHeight: 27, fontWeight: "700", color: c.text },
    body: { fontSize: 14, lineHeight: 22, color: c.textMuted },
    primary: {
      minHeight: 48,
      paddingHorizontal: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.brand,
      borderRadius: 6,
    },
    primaryText: { fontSize: 15, color: c.white, fontWeight: "700" },
    secondary: { minHeight: 42, justifyContent: "center" },
    link: { fontSize: 14, color: c.brand, fontWeight: "600" },
    disabled: { opacity: 0.5 },
    error: {
      marginBottom: 14,
      padding: 14,
      borderRadius: 6,
      backgroundColor: c.warningSoft,
    },
    errorText: { fontSize: 14, lineHeight: 22, color: c.warning },
    text: { color: c.text },
  });
