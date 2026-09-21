import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { mobileApi, type AuthResponse } from '../api/client';
import { AnimatedPressable, EntranceView } from '../components/Motion';
import { colors, radius, shadow, spacing } from '../theme';

type CertificateScreenProps = {
  certificates: AuthResponse['certificates'];
  currentCertificateId?: string | null;
  onCancel?: () => void;
  onSelected: (user: AuthResponse['user']) => void;
};

export function CertificateScreen({
  certificates,
  currentCertificateId,
  onCancel,
  onSelected,
}: CertificateScreenProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function choose(certificateId: string) {
    setBusyId(certificateId);
    setError('');
    try {
      const result = await mobileApi.selectCertificate(certificateId);
      onSelected(result.user);
    } catch {
      setError('证书选择失败，请检查服务器连接');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {onCancel && (
        <AnimatedPressable
          accessibilityLabel="返回我的"
          accessibilityRole="button"
          onPress={onCancel}
          style={styles.backButton}
        >
          <Text style={styles.backText}>‹ 返回我的</Text>
        </AnimatedPressable>
      )}
      <EntranceView distance={12} style={styles.hero}>
        <Text style={styles.kicker}>先确定学习目标</Text>
        <Text style={styles.title}>{onCancel ? '切换学习证书' : '选择你的报考证书'}</Text>
        <Text style={styles.subtitle}>
          {onCancel
            ? '切换后会同步对应题库、学习计划和错题记录。'
            : '之后可以在“我的”里切换，学习记录会跟随账号同步。'}
        </Text>
      </EntranceView>

      <View style={styles.list}>
        {certificates.map((certificate, index) => {
          const selected = certificate.id === currentCertificateId;
          return (
            <EntranceView
              delay={80 + index * 55}
              distance={14}
              key={certificate.id}
            >
              <AnimatedPressable
                disabled={!!busyId || selected}
                onPress={() => choose(certificate.id)}
                style={[styles.certificateCard, selected && styles.selectedCertificateCard]}
              >
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{certificate.name.slice(0, 1)}</Text>
                </View>
                <View style={styles.copy}>
                  <Text style={styles.name}>{certificate.name}</Text>
                  <Text style={styles.meta}>
                    {selected
                      ? '当前正在学习'
                      : busyId === certificate.id
                        ? '正在准备题库…'
                        : '进入对应题库和学习计划'}
                  </Text>
                </View>
                <Text style={styles.arrow}>{selected ? '✓' : '›'}</Text>
              </AnimatedPressable>
            </EntranceView>
          );
        })}
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    backgroundColor: colors.background,
    flexGrow: 1,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  hero: {
    gap: spacing.sm,
    paddingBottom: spacing.xl,
    paddingTop: spacing.lg,
  },
  kicker: {
    color: colors.brand,
    fontSize: 14,
    fontWeight: '800',
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 38,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 24,
  },
  list: {
    gap: spacing.md,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
    paddingVertical: spacing.xs,
  },
  backText: {
    color: colors.brand,
    fontSize: 15,
    fontWeight: '800',
  },
  certificateCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 82,
    padding: spacing.md,
    ...shadow.card,
  },
  selectedCertificateCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: '#9DC9AE',
  },
  badge: {
    alignItems: 'center',
    backgroundColor: colors.brandSoft,
    borderRadius: radius.sm,
    height: 48,
    justifyContent: 'center',
    marginRight: spacing.md,
    width: 48,
  },
  badgeText: {
    color: colors.brand,
    fontSize: 22,
    fontWeight: '800',
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  name: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  meta: {
    color: colors.textMuted,
    fontSize: 13,
  },
  arrow: {
    color: colors.brand,
    fontSize: 29,
    marginLeft: spacing.sm,
  },
  error: {
    color: colors.warning,
    fontSize: 14,
    lineHeight: 22,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
