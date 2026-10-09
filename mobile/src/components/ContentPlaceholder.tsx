import { useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  Animated,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { useTheme } from "../theme";

export function ContentPlaceholder({
  rows = 4,
  practice = false,
}: {
  rows?: number;
  practice?: boolean;
}) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let live = true;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 850,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 850,
          useNativeDriver: Platform.OS !== "web",
        }),
      ]),
    );
    const apply = (reduce: boolean) => {
      animation.stop();
      opacity.setValue(1);
      if (live && !reduce) animation.start();
    };
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(apply)
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      apply,
    );
    return () => {
      live = false;
      animation.stop();
      subscription.remove();
    };
  }, [opacity]);
  return (
    <Animated.View
      accessible
      accessibilityLabel="正在获取内容"
      accessibilityState={{ busy: true }}
      style={[styles.root, { opacity }]}
    >
      <View style={[styles.title, { backgroundColor: colors.border }]} />
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={styles.row}>
          <View style={[styles.line, { backgroundColor: colors.border }]} />
          <View
            style={[
              styles.line,
              styles.short,
              { backgroundColor: colors.border },
            ]}
          />
        </View>
      ))}
      {practice && (
        <View style={[styles.answer, { borderColor: colors.border }]} />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: "stretch", gap: 23, paddingVertical: 22 },
  title: { height: 25, width: "58%", borderRadius: 5 },
  row: { gap: 10 },
  line: { height: 13, borderRadius: 4 },
  short: { width: "72%" },
  answer: { height: 54, borderWidth: 1, borderRadius: 10, marginTop: 10 },
});
