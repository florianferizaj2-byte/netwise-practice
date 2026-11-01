import { SafeAreaView } from '../components/SafeArea';
import { iosStyles } from '../iosStyles';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BrandMark } from '../components/BrandMark';
import { WebAppActions } from '../components/WebAppActions';
import { AnimatedPressable, EntranceView } from '../components/Motion';
import { ApiError, mobileApi } from '../api/client';
import { radius, shadow, spacing, useThemedStyles, useTheme, type ThemeColors } from '../theme';
import type { AuthMode } from '../types';
import type { AuthResponse } from '../api/client';

type AuthScreenProps = {
  onAuthenticated: (response: AuthResponse) => void;
  onPreview: () => void;
};

export function AuthScreen({ onAuthenticated, onPreview }: AuthScreenProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles, iosStyles.auth);
  const [mode, setMode] = useState<AuthMode | 'reset'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [emailRequired, setEmailRequired] = useState<boolean | null>(null), [policyError, setPolicyError] = useState(''), [policyRevision, setPolicyRevision] = useState(0);
  useEffect(() => {
    let live = true; setEmailRequired(null); setPolicyError('');
    mobileApi.accountEmailPolicy().then(result => {
      if (typeof result.emailVerificationRequired !== 'boolean') throw new Error('注册设置读取失败');
      if (live) setEmailRequired(result.emailVerificationRequired);
    }).catch(cause => { if (live) setPolicyError(cause instanceof Error ? cause.message : '注册设置读取失败'); });
    return () => { live = false; };
  }, [policyRevision]);
  const [email, setEmail] = useState(''), [code, setCode] = useState(''), [challengeId, setChallengeId] = useState('');
  const [confirm, setConfirm] = useState(''), [sending, setSending] = useState(false), [until, setUntil] = useState(0), [seconds, setSeconds] = useState(0), [notice, setNotice] = useState('');
  const inFlight = useRef(false), scope = useRef(''); scope.current = `${mode}:${username}:${email}`;
  useEffect(() => { setChallengeId(''); setCode(''); setError(''); setPassword(''); setConfirm(''); }, [mode]);
  useEffect(() => { const tick = () => setSeconds(Math.max(0, Math.ceil((until - Date.now()) / 1000))); tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer); }, [until]);

  async function sendCode() {
    if (sending || inFlight.current || mode === 'login' || emailRequired !== true) return;
    if (!username.trim() || !email.trim()) { setError('请先填写账号和邮箱'); return; }
    inFlight.current = true; setSending(true); setError(''); setNotice(''); const sentScope = scope.current;
    try {
      const result = await mobileApi.sendAccountEmailCode({ purpose: mode === 'reset' ? 'reset' : 'register', username: username.trim(), email: email.trim() });
      if (sentScope !== scope.current) return;
      setChallengeId(result.challengeId); setUntil(Date.now() + result.retryAfter * 1000); setNotice(result.message);
    } catch (cause) { if (sentScope === scope.current) setError(cause instanceof ApiError ? cause.message : '邮件暂时无法发送'); }
    finally { inFlight.current = false; setSending(false); }
  }

  const title = mode === 'login' ? '欢迎回来' : mode === 'reset' ? '找回密码' : '创建考匠账号';
  const action = mode === 'login' ? '登录' : mode === 'reset' ? '重置密码' : '注册';

  async function submit() {
    if (inFlight.current) return;
    if (mode !== 'login' && emailRequired === null) return;
    if (!username.trim() || password.length < 8) {
      setError('请输入账号和至少 8 位密码');
      return;
    }

    if (mode !== 'login' && password !== confirm) { setError('两次输入的密码不一致'); return; }
    if (mode !== 'login' && emailRequired && (!challengeId || !/^\d{6}$/.test(code))) { setError('请获取并填写 6 位邮箱验证码'); return; }
    inFlight.current = true; setBusy(true);
    setError('');
    try {
      if (mode === 'reset') {
        await mobileApi.resetPassword({ username: username.trim(), password, email: email.trim(), code, challengeId });
        setMode('login'); setNotice('密码已重置，请使用新密码登录；其他设备的登录已退出'); return;
      }
      const response =
        mode === 'login'
          ? await mobileApi.login(username.trim(), password)
          : await mobileApi.register(username.trim(), password, emailRequired ? { email: email.trim(), code, challengeId } : undefined);
      onAuthenticated(response);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : '暂时无法连接服务器');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.flex}><KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <EntranceView style={styles.hero} distance={12}>
          <BrandMark />
          <Text style={styles.kicker}>移动学习空间</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>
            随时练习，随时复盘，把每一次答题都变成真正的掌握。
          </Text>
        </EntranceView>

        <EntranceView delay={100} style={styles.card} distance={22}>
          <View style={styles.segmented}>
            {(['login', 'register'] as AuthMode[]).map((item) => (
              <AnimatedPressable
                key={item}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === item }}
                disabled={busy || sending}
                onPress={() => setMode(item)}
                style={[styles.segment, mode === item && styles.activeSegment]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    mode === item && styles.activeSegmentText,
                  ]}
                >
                  {item === 'login' ? '登录' : '注册'}
                </Text>
              </AnimatedPressable>
            ))}
          </View>

          <Text style={styles.label}>账号</Text>
          <TextInput
            accessibilityLabel="账号"
            autoComplete="username"
            textContentType="username"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy && !sending}
            onChangeText={(value) => { setUsername(value); setChallengeId(''); setCode(''); }}
            placeholder="输入账号"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            value={username}
          />

          <Text style={styles.label}>{mode === 'reset' ? '新密码' : '密码'}</Text>
          <TextInput
            accessibilityLabel={mode === 'reset' ? '新密码' : '密码'}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            textContentType={mode === 'login' ? 'password' : 'newPassword'}
            returnKeyType="go"
            onSubmitEditing={() => { if (!busy) void submit(); }}
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setPassword}
            placeholder="至少 8 位密码"
            placeholderTextColor={colors.textFaint}
            secureTextEntry
            style={styles.input}
            value={password}
          />

          {mode !== 'login' && <>
            <Text style={styles.label}>确认密码</Text>
            <TextInput accessibilityLabel="确认密码" autoComplete="new-password" secureTextEntry autoCapitalize="none" style={styles.input} value={confirm} onChangeText={setConfirm} placeholder="再次输入密码" placeholderTextColor={colors.textFaint} editable={!busy} maxLength={128} />
            {emailRequired && <>
            {mode === 'reset' && <Text style={styles.note}>请输入此前已绑定的邮箱。未绑定且已忘记密码的老账号需联系管理员核验；仍可登录的账号请先到“我的 → 账号与安全”绑定邮箱。</Text>}
            <Text style={styles.label}>邮箱</Text>
            <TextInput accessibilityLabel="邮箱" autoComplete="email" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} style={styles.input} value={email} onChangeText={value => { setEmail(value); setChallengeId(''); setCode(''); }} placeholder="可长期接收邮件的邮箱" placeholderTextColor={colors.textFaint} editable={!busy && !sending} maxLength={254} />
            <Text style={styles.label}>邮箱验证码</Text>
            <TextInput accessibilityLabel="邮箱验证码" autoComplete="one-time-code" keyboardType="number-pad" style={styles.input} value={code} onChangeText={value => setCode(value.replace(/\D/g, '').slice(0, 6))} placeholder="6 位验证码" placeholderTextColor={colors.textFaint} editable={!busy} maxLength={6} />
            <AnimatedPressable disabled={busy || sending || seconds > 0} onPress={sendCode} style={styles.previewButton}><Text style={styles.previewButtonText}>{sending ? '发送中…' : seconds > 0 ? `${seconds} 秒后重发` : '获取验证码'}</Text></AnimatedPressable>
            </>}
          </>}

          <AnimatedPressable
            disabled={busy || sending || (mode !== 'login' && emailRequired === null)}
            onPress={submit}
            style={[styles.primaryButton, busy && styles.disabledButton]}
          >
            <Text style={styles.primaryButtonText}>{busy ? `${action}中…` : action}</Text>
          </AnimatedPressable>

          {!!error && <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>}
          {mode !== 'login' && !!policyError && <><Text accessibilityRole="alert" style={styles.errorText}>{policyError}</Text><AnimatedPressable onPress={() => setPolicyRevision(value => value + 1)} style={styles.previewButton}><Text style={styles.previewButtonText}>重新读取</Text></AnimatedPressable></>}
          {!!notice && <Text accessibilityRole="text" style={styles.note}>{notice}</Text>}
          {mode === 'login' && emailRequired && <AnimatedPressable disabled={busy} onPress={() => setMode('reset')} style={styles.previewButton}><Text style={styles.previewButtonText}>忘记密码？</Text></AnimatedPressable>}

          {__DEV__ && (
            <AnimatedPressable onPress={onPreview} style={styles.previewButton}>
              <Text style={styles.previewButtonText}>进入 App 预览</Text>
            </AnimatedPressable>
          )}
        </EntranceView>

        <EntranceView delay={220} distance={8}>
          <Text style={styles.note}>
            使用同一个考匠账号，学习记录与会员权益随账号同步。
          </Text>
          <WebAppActions />
        </EntranceView>
      </ScrollView>
    </KeyboardAvoidingView></SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  flex: { flex: 1 },
  content: {
    backgroundColor: colors.background,
    flexGrow: 1,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  hero: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
    paddingTop: spacing.lg,
  },
  kicker: {
    color: colors.brand,
    fontSize: 14,
    fontWeight: '700',
    marginTop: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 40,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 25,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.card,
  },
  segmented: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    flexDirection: 'row',
    marginBottom: spacing.lg,
    padding: 4,
  },
  segment: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    paddingVertical: 11,
  },
  activeSegment: {
    backgroundColor: colors.surface,
  },
  segmentText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  activeSegmentText: {
    color: colors.brand,
    fontWeight: '800',
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderRadius: radius.sm,
    marginTop: spacing.lg,
    minHeight: 54,
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.65,
  },
  previewButton: {
    alignItems: 'center',
    borderColor: colors.brandSoft,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginTop: spacing.sm,
    minHeight: 50,
    justifyContent: 'center',
  },
  previewButtonText: {
    color: colors.brand,
    fontSize: 15,
    fontWeight: '700',
  },
  errorText: {
    color: colors.warning,
    fontSize: 13,
    lineHeight: 20,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  note: {
    color: colors.textFaint,
    fontSize: 13,
    lineHeight: 20,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
});
