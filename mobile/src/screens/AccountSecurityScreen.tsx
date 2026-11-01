import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "../components/SafeArea";
import { AnimatedPressable } from "../components/Motion";
import { mobileApi, ApiError } from "../api/client";
import {
  radius,
  spacing,
  useThemedStyles,
  useTheme,
  type ThemeColors,
} from "../theme";

type SecurityState = Awaited<ReturnType<typeof mobileApi.accountSecurity>>;
export function AccountSecurityScreen({
  onClose,
  onLogout,
}: {
  onClose: () => void;
  onLogout: () => void;
}) {
  const { colors } = useTheme(),
    styles = useThemedStyles(createStyles);
  const [state, setState] = useState<SecurityState | null>(null),
    [readError, setReadError] = useState("");
  const [mode, setMode] = useState<"bind" | "password" | "changed" | "">("");
  const [currentPassword, setCurrentPassword] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState("");
  const [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [challengeId, setChallengeId] = useState("");
  const [busy, setBusy] = useState(false),
    [sending, setSending] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [until, setUntil] = useState(0),
    [seconds, setSeconds] = useState(0),
    [reload, setReload] = useState(0);
  const inFlight = useRef(false),
    scope = useRef("");
  scope.current = `${mode}:${email}`;
  useEffect(() => {
    let live = true;
    setReadError("");
    mobileApi
      .accountSecurity()
      .then((result) => {
        if (live) setState(result);
      })
      .catch((cause) => {
        if (live)
          setReadError(
            cause instanceof Error ? cause.message : "账号安全信息读取失败",
          );
      });
    return () => {
      live = false;
    };
  }, [reload]);
  useEffect(() => {
    const tick = () =>
      setSeconds(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [until]);
  function choose(next: "bind" | "password" | "") {
    setMode(next);
    setCurrentPassword("");
    setPassword("");
    setConfirm("");
    setChallengeId("");
    setCode("");
    setError("");
    setNotice("");
  }
  async function send() {
    if (inFlight.current) return;
    if (!currentPassword || !email.trim()) {
      setError("请先填写当前密码和邮箱");
      return;
    }
    inFlight.current = true;
    setSending(true);
    setError("");
    setNotice("");
    const sentScope = scope.current;
    try {
      const result = await mobileApi.sendAccountEmailCode({
        purpose: "bind",
        email: email.trim(),
        currentPassword,
      });
      if (sentScope !== scope.current) return;
      setChallengeId(result.challengeId);
      setCode("");
      setUntil(Date.now() + result.retryAfter * 1000);
      setNotice(result.message);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "邮件暂时无法发送");
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }
  async function save() {
    if (inFlight.current) return;
    if (mode === "bind" && (!challengeId || !/^\d{6}$/.test(code))) {
      setError("请获取并填写 6 位邮箱验证码");
      return;
    }
    if (mode === "password" && (password.length < 8 || password !== confirm)) {
      setError("新密码至少 8 位，两次输入须一致");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "bind") {
        const result = await mobileApi.bindAccountEmail({
          currentPassword,
          email: email.trim(),
          code,
          challengeId,
        });
        setState(result);
        choose("");
        setNotice("邮箱已验证并绑定，可用于找回密码");
      } else {
        const result = await mobileApi.changePassword({
          currentPassword,
          password,
        });
        setMode("changed");
        setNotice(result.message);
        setCurrentPassword("");
        setPassword("");
        setConfirm("");
      }
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "保存失败，请检查网络后重试",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const input = (
    label: string,
    value: string,
    onChangeText: (value: string) => void,
    secret = false,
  ) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        editable={!busy && !sending}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={
          secret
            ? label === "当前密码"
              ? "current-password"
              : "new-password"
            : label === "邮箱"
              ? "email"
              : "one-time-code"
        }
        keyboardType={
          label === "邮箱"
            ? "email-address"
            : label === "邮箱验证码"
              ? "number-pad"
              : "default"
        }
        maxLength={label === "邮箱" ? 254 : label === "邮箱验证码" ? 6 : 128}
        secureTextEntry={secret}
        style={styles.input}
        placeholderTextColor={colors.textFaint}
      />
    </View>
  );
  return (
    <SafeAreaView style={styles.flex}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>
              账号与安全
            </Text>
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel="关闭账号安全"
              disabled={busy || sending}
              onPress={onClose}
              style={styles.secondary}
            >
              <Text style={styles.actionText}>返回</Text>
            </AnimatedPressable>
          </View>
          <Text style={styles.hint}>管理登录密码，保护你的学习账号。</Text>
          {!!readError && (
            <>
              <Text accessibilityRole="alert" style={styles.error}>
                {readError}
              </Text>
              <AnimatedPressable
                onPress={() => setReload((value) => value + 1)}
                style={styles.secondary}
              >
                <Text style={styles.actionText}>重新读取</Text>
              </AnimatedPressable>
            </>
          )}
          {!state && !readError && <Text style={styles.hint}>正在读取…</Text>}
          {state && (
            <View style={styles.card}>
              {(state.emailVerificationRequired || state.emailBound) && <View style={styles.row}>
                <View style={styles.copy}>
                  <Text style={styles.label}>恢复邮箱</Text>
                  <Text style={styles.hint}>
                    {state.emailBound
                      ? state.maskedEmail
                      : "尚未绑定，忘记密码后无法自助找回"}
                  </Text>
                </View>
                {state.emailVerificationRequired && !state.emailBound && (
                  <AnimatedPressable
                    disabled={busy || sending || mode === "changed"}
                    onPress={() => choose("bind")}
                    style={styles.secondary}
                  >
                    <Text style={styles.actionText}>绑定邮箱</Text>
                  </AnimatedPressable>
                )}
              </View>}
              {state.emailVerificationRequired && !state.emailAvailable && (
                <Text style={styles.hint}>
                  邮件服务暂未开通。已有账号仍可登录，并可使用当前密码修改密码。
                </Text>
              )}
              <View style={styles.row}>
                <View style={styles.copy}>
                  <Text style={styles.label}>登录密码</Text>
                  <Text style={styles.hint}>
                    修改后，所有设备都需重新登录。
                  </Text>
                </View>
                <AnimatedPressable
                  disabled={busy || sending || mode === "changed"}
                  onPress={() => choose("password")}
                  style={styles.secondary}
                >
                  <Text style={styles.actionText}>修改密码</Text>
                </AnimatedPressable>
              </View>
            </View>
          )}
          {(mode === "bind" || mode === "password") && (
            <View style={styles.card}>
              {input("当前密码", currentPassword, setCurrentPassword, true)}
              {mode === "bind" ? (
                <>
                  {input("邮箱", email, (value) => {
                    setEmail(value);
                    setChallengeId("");
                    setCode("");
                  })}
                  {input("邮箱验证码", code, (value) =>
                    setCode(value.replace(/\D/g, "").slice(0, 6)),
                  )}
                  <AnimatedPressable
                    disabled={busy || sending || seconds > 0}
                    onPress={send}
                    style={styles.secondary}
                  >
                    <Text style={styles.actionText}>
                      {sending
                        ? "发送中…"
                        : seconds > 0
                          ? `${seconds} 秒后重发`
                          : "获取验证码"}
                    </Text>
                  </AnimatedPressable>
                </>
              ) : (
                <>
                  {input("新密码", password, setPassword, true)}
                  {input("确认新密码", confirm, setConfirm, true)}
                </>
              )}
              <AnimatedPressable
                disabled={busy || sending}
                onPress={save}
                style={styles.primary}
              >
                <Text style={styles.primaryText}>
                  {busy
                    ? "保存中…"
                    : mode === "bind"
                      ? "验证并绑定邮箱"
                      : "确认修改密码"}
                </Text>
              </AnimatedPressable>
              <AnimatedPressable
                disabled={busy || sending}
                onPress={() => choose("")}
                style={styles.secondary}
              >
                <Text style={styles.actionText}>取消</Text>
              </AnimatedPressable>
            </View>
          )}
          {!!error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          )}
          {!!notice && <Text style={styles.hint}>{notice}</Text>}
          {mode === "changed" && (
            <AnimatedPressable onPress={onLogout} style={styles.primary}>
              <Text style={styles.primaryText}>重新登录</Text>
            </AnimatedPressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    content: {
      padding: spacing.lg,
      gap: spacing.lg,
      maxWidth: 760,
      width: "100%",
      alignSelf: "center",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    title: { fontSize: 25, fontWeight: "800", color: colors.text },
    hint: { color: colors.textMuted, fontSize: 14, lineHeight: 23 },
    card: {
      padding: spacing.lg,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      gap: 18,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      flexWrap: "wrap",
    },
    copy: { gap: 5, flex: 1, minWidth: 155 },
    field: { gap: 8 },
    label: { color: colors.text, fontWeight: "700", fontSize: 15 },
    input: {
      color: colors.text,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      minHeight: 46,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
    },
    secondary: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      padding: 12,
      alignItems: "center",
      minHeight: 44,
    },
    actionText: { color: colors.brand, fontSize: 14, fontWeight: "600" },
    primary: {
      backgroundColor: colors.brand,
      borderRadius: radius.sm,
      minHeight: 46,
      padding: 13,
      alignItems: "center",
    },
    primaryText: { color: colors.surface, fontWeight: "700", fontSize: 15 },
    error: { color: colors.warning, fontSize: 14, lineHeight: 23 },
  });
