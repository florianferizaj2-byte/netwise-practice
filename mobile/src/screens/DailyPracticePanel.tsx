import { iosStyles } from '../iosStyles';
import { useEffect, useState } from "react";
import { BackHandler, StyleSheet, Text, View } from "react-native";
import { PracticeScreen } from "./TabScreens";
import { AnimatedPressable } from "../components/Motion";
import { ScreenActivityProvider } from "../navigation/ScreenActivity";
import { useThemedStyles, type ThemeColors } from "../theme";
import type { AppTab, NavigationOptions } from "../types";

export function DailyPracticePanel({
  visible,
  active,
  preview,
  onClose,
  onNavigate,
}: {
  visible: boolean;
  active: boolean;
  preview: boolean;
  onClose: () => void;
  onNavigate: (tab: AppTab, options?: NavigationOptions) => void;
}) {
  const s = useThemedStyles(styles, iosStyles.daily);
  const [route, setRoute] = useState<NavigationOptions>({
    practiceSession: "daily",
    practiceMode: "random",
    practiceSource: "all",
    practiceSelectionComplete: true,
  });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        onClose();
        return true;
      },
    );
    return () => subscription.remove();
  }, [visible, onClose]);
  function navigate(tab: AppTab, options?: NavigationOptions) {
    if (tab === "practice" && options?.practiceSession === "daily") {
      setRoute({
        ...options,
        practiceMode: "random",
        practiceSession: "daily",
      });
      setRevision((value) => value + 1);
    } else {
      onClose();
      onNavigate(tab, options);
    }
  }
  return (
    <View
      style={[s.panel, !visible && s.hidden]}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
    >
      <View style={s.header}>
        <AnimatedPressable
          accessibilityRole="button"
          onPress={onClose}
          style={s.action}
        >
          <Text style={s.link}>‹ 返回今日</Text>
        </AnimatedPressable>
        <Text style={s.title}>每日刷题</Text>
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel="切换到普通练习和AI出题"
          onPress={() =>
            navigate("practice", {
              practiceMode: "sequential",
              practiceSource: "all",
            })
          }
          style={s.action}
        >
          <Text style={s.link}>其他练习 ›</Text>
        </AnimatedPressable>
      </View>
      <View style={s.content}>
        <ScreenActivityProvider active={active && visible}>
          <PracticeScreen
            key={revision}
            {...route}
            preview={preview}
            onNavigate={navigate}
          />
        </ScreenActivityProvider>
      </View>
    </View>
  );
}
const styles = (c: ThemeColors) =>
  StyleSheet.create({
    panel: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: c.background,
      zIndex: 10,
      elevation: 8,
    },
    hidden: { display: "none" },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 15,
      paddingVertical: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    action: { minHeight: 44, justifyContent: "center" },
    link: { color: c.brand, fontSize: 13 },
    title: { color: c.text, fontWeight: "700", fontSize: 15 },
    content: { flex: 1 },
  });
