import { iosStyles } from "../../iosStyles";
import { useEffect, useRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ApiError } from "../../api/client";
import { useThemedStyles, type ThemeColors } from "../../theme";

export function useStudyAlive() {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return alive;
}
export const studyErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "暂时无法连接，请重试。";
export const studyErrorCode = (error: unknown) =>
  error instanceof ApiError &&
  error.data &&
  typeof error.data === "object" &&
  "code" in error.data
    ? String(error.data.code)
    : "";
export const studyAccessDenied = (error: unknown) =>
  error instanceof ApiError && (error.status === 401 || error.status === 403);

export function StudyButton({
  label,
  onPress,
  secondary = false,
  busy = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  busy?: boolean;
  disabled?: boolean;
}) {
  const s = useThemedStyles(createStudyStyles, iosStyles.study);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary ? s.secondaryButton : s.primaryButton,
        (disabled || busy) && s.disabled,
        pressed && s.pressed,
      ]}
    >
      {busy && (
        <ActivityIndicator
          color={
            secondary ? s.secondaryButtonText.color : s.primaryButtonText.color
          }
          size="small"
        />
      )}
      <Text style={secondary ? s.secondaryButtonText : s.primaryButtonText}>
        {busy ? "处理中…" : label}
      </Text>
    </Pressable>
  );
}
export function StudyNotice({ children }: { children: ReactNode }) {
  const s = useThemedStyles(createStudyStyles, iosStyles.study);
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={s.notice}
    >
      <Text style={s.noticeText}>{children}</Text>
    </View>
  );
}

export const createStudyStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    hidden: { display: "none" },
    header: {
      paddingHorizontal: 20,
      paddingVertical: 10,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerLine: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    headerTitle: {
      color: colors.text,
      fontSize: 22,
      lineHeight: 30,
      fontWeight: "800",
      flexShrink: 1,
    },
    textAction: {
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: 4,
    },
    actionText: {
      color: colors.brandDark,
      fontSize: 15,
      lineHeight: 22,
      fontWeight: "700",
    },
    scroll: { flex: 1 },
    content: {
      width: "100%",
      maxWidth: 760,
      alignSelf: "center",
      padding: 20,
      paddingBottom: 28,
      gap: 24,
    },
    row: { flexDirection: "row", alignItems: "center", gap: 12 },
    flex: { flex: 1 },
    wrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 10,
    },
    meta: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
    body: { color: colors.text, fontSize: 16, lineHeight: 27 },
    reading: { color: colors.text, fontSize: 18, lineHeight: 31 },
    title: {
      color: colors.text,
      fontSize: 27,
      lineHeight: 36,
      fontWeight: "800",
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 17,
      lineHeight: 26,
      fontWeight: "800",
    },
    label: {
      color: colors.brandDark,
      fontSize: 14,
      lineHeight: 22,
      fontWeight: "700",
    },
    progress: {
      height: 5,
      backgroundColor: colors.border,
      borderRadius: 3,
      overflow: "hidden",
    },
    progressFill: { height: "100%", backgroundColor: colors.brand },
    lead: {
      paddingVertical: 22,
      paddingHorizontal: 20,
      backgroundColor: colors.surface,
      borderLeftWidth: 4,
      borderLeftColor: colors.brand,
      borderRadius: 8,
      gap: 12,
    },
    feature: {
      backgroundColor: colors.surfaceMuted,
      padding: 22,
      borderRadius: 18,
      gap: 12,
    },
    featureTitle: {
      color: colors.text,
      fontSize: 24,
      lineHeight: 33,
      fontWeight: "800",
    },
    section: { gap: 14 },
    point: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
    pointMark: {
      width: 4,
      height: 20,
      marginTop: 5,
      borderRadius: 2,
      backgroundColor: colors.brand,
    },
    example: {
      backgroundColor: colors.surfaceMuted,
      padding: 20,
      borderRadius: 12,
      gap: 12,
    },
    pitfall: {
      backgroundColor: colors.goldSoft,
      padding: 18,
      borderRadius: 12,
      gap: 8,
    },
    courseSection: { gap: 6 },
    courseRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 16,
      minHeight: 68,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    courseTitle: {
      color: colors.text,
      fontSize: 16,
      lineHeight: 25,
      fontWeight: "600",
    },
    courseStatus: { color: colors.brandDark, fontSize: 12, fontWeight: "700" },
    search: {
      minHeight: 48,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      backgroundColor: colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 10,
      color: colors.text,
      fontSize: 16,
    },
    chapterList: { gap: 8, paddingVertical: 4 },
    chapterButton: {
      minHeight: 44,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      justifyContent: "center",
    },
    chapterSelected: {
      backgroundColor: colors.brandSoft,
      borderColor: colors.brand,
    },
    chapterText: { fontSize: 14, lineHeight: 22, color: colors.text },
    tabs: {
      flexDirection: "row",
      alignSelf: "stretch",
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    tab: {
      minHeight: 46,
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      borderBottomWidth: 2,
      borderBottomColor: "transparent",
    },
    tabSelected: { borderBottomColor: colors.brand },
    tabText: { color: colors.textMuted, fontSize: 16, fontWeight: "600" },
    tabSelectedText: { color: colors.brandDark },
    footer: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 20,
      paddingVertical: 12,
      gap: 10,
    },
    button: {
      minHeight: 48,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: "row",
      gap: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryButton: { backgroundColor: colors.brand },
    primaryButtonText: {
      color: colors.background,
      fontSize: 16,
      lineHeight: 24,
      fontWeight: "800",
      textAlign: "center",
    },
    secondaryButton: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    secondaryButtonText: {
      color: colors.brandDark,
      fontSize: 15,
      lineHeight: 24,
      fontWeight: "700",
      textAlign: "center",
    },
    disabled: { opacity: 0.5 },
    pressed: { opacity: 0.78 },
    state: {
      paddingVertical: 36,
      paddingHorizontal: 20,
      alignItems: "stretch",
      gap: 16,
      width: "100%",
      maxWidth: 640,
      alignSelf: "center",
    },
    notice: {
      padding: 14,
      borderRadius: 10,
      backgroundColor: colors.warningSoft,
      borderLeftWidth: 3,
      borderLeftColor: colors.warning,
    },
    noticeText: { color: colors.text, fontSize: 15, lineHeight: 24 },
    question: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 20,
      gap: 22,
    },
    questionStem: {
      color: colors.text,
      fontSize: 22,
      lineHeight: 36,
      fontWeight: "600",
    },
    blankText: { color: colors.brandDark, fontWeight: "800" },
    blankField: { gap: 8 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      minHeight: 54,
      fontSize: 18,
      lineHeight: 25,
      color: colors.text,
    },
    inputGraded: { backgroundColor: colors.surfaceMuted },
    result: {
      gap: 14,
      padding: 18,
      borderRadius: 12,
      backgroundColor: colors.surfaceMuted,
    },
    resultRow: {
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 5,
    },
    feedbackInput: { minHeight: 86, textAlignVertical: "top" },
    questionNav: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    questionNavButton: {
      width: 48,
      minHeight: 44,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    questionNavActive: {
      backgroundColor: colors.brandSoft,
      borderColor: colors.brand,
    },
    sheetBackdrop: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "#00000080",
    },
    sheet: {
      height: "88%",
      maxHeight: 820,
      maxWidth: 760,
      width: "100%",
      alignSelf: "center",
      backgroundColor: colors.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      overflow: "hidden",
    },
    sheetHeader: {
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    sheetContent: { padding: 20, gap: 20, paddingBottom: 28 },
    teacherQuestion: {
      color: colors.text,
      backgroundColor: colors.brandSoft,
      borderRadius: 12,
      padding: 14,
      fontSize: 16,
      lineHeight: 26,
      alignSelf: "flex-end",
    },
    teacherAnswer: { gap: 8, paddingVertical: 8 },
    teacherComposer: {
      padding: 16,
      gap: 12,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    teacherInput: { minHeight: 72, maxHeight: 120, textAlignVertical: "top" },
  });
