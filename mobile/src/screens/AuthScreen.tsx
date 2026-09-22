import { useState } from 'react';
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
  const styles = useThemedStyles(createStyles);
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const title = mode === 'login' ? '欢迎回来' : '创建考匠账号';
  const action = mode === 'login' ? '登录' : '注册';

  async function submit() {
    if (!username.trim() || password.length < 8) {
      setError('请输入账号和至少 8 位密码');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const response =
        mode === 'login'
          ? await mobileApi.login(username.trim(), password)
          : await mobileApi.register(username.trim(), password);
      onAuthenticated(response);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : '暂时无法连接服务器');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
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
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setUsername}
            placeholder="输入账号"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            value={username}
          />

          <Text style={styles.label}>密码</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setPassword}
            placeholder="至少 8 位密码"
            placeholderTextColor={colors.textFaint}
            secureTextEntry
            style={styles.input}
            value={password}
          />

          <AnimatedPressable
            disabled={busy}
            onPress={submit}
            style={[styles.primaryButton, busy && styles.disabledButton]}
          >
            <Text style={styles.primaryButtonText}>{busy ? `${action}中…` : action}</Text>
          </AnimatedPressable>

          {!!error && <Text style={styles.errorText}>{error}</Text>}

          {__DEV__ && (
            <AnimatedPressable onPress={onPreview} style={styles.previewButton}>
              <Text style={styles.previewButtonText}>进入 App 预览</Text>
            </AnimatedPressable>
          )}
        </EntranceView>

        <EntranceView delay={220} distance={8}>
          <Text style={styles.note}>
          移动端登录已通过安全会话连接考匠后端；预览入口仅在开发环境显示。
          </Text>
        </EntranceView>
      </ScrollView>
    </KeyboardAvoidingView>
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
