import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from '../components/Motion';
import { SafeAreaView } from '../components/SafeArea';
import { radius, spacing, useThemedStyles, type ThemeColors } from '../theme';
import type { OfflineDeviceProfile } from './offlineDeviceProfile.android';
import { installedOfflinePackManifest, loadOfflinePack, type InstalledOfflinePack, type OfflinePackOwner } from './offlinePacks.android';

export type OfflineLibrarySelection = { owner: OfflinePackOwner; installed: InstalledOfflinePack };
type Row = { id: string; name: string; count: number };

export function OfflineDeviceLibrary({ profile, onBack, onOpen }: {
  profile: OfflineDeviceProfile; onBack: () => void; onOpen: (selection: OfflineLibrarySelection) => void;
}) {
  const s = useThemedStyles(styles);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState('');
  const live = useRef(false);
  const inFlight = useRef(false);
  useEffect(() => {
    live.current = true;
    void Promise.all(profile.certificates.map(async (certificate) => {
      const manifest = await installedOfflinePackManifest({ userId: profile.userId, certificateId: certificate.id }).catch(() => null);
      return manifest ? { ...certificate, count: manifest.questionCount } : null;
    })).then((data) => {
      if (live.current) setRows(data.filter((row): row is Row => row !== null));
    }).catch(() => { if (live.current) { setRows([]); setError('本机学习包读取失败。'); } });
    return () => { live.current = false; };
  }, [profile]);

  async function open(certificateId: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setOpening(certificateId);
    setError('');
    try {
      const owner = { userId: profile.userId, certificateId };
      const installed = await loadOfflinePack(owner);
      if (!installed) throw new Error('本机未找到该证书学习包。');
      if (live.current) onOpen({ owner, installed });
    } catch (cause) {
      if (live.current) setError(cause instanceof Error ? cause.message : '学习包读取失败。');
    } finally {
      inFlight.current = false;
      if (live.current) setOpening('');
    }
  }

  return <SafeAreaView style={s.safe}>
    <ScrollView contentContainerStyle={s.page}>
      <AnimatedPressable accessibilityRole="button" onPress={onBack} style={s.button}><Text style={s.action}>返回</Text></AnimatedPressable>
      <Text accessibilityRole="header" style={s.title}>本机学习包</Text>
      <Text style={s.meta}>选择已下载的证书，无需等待服务器连接。</Text>
      {rows === null && <ActivityIndicator accessibilityLabel="正在读取本机学习包" />}
      {rows?.length === 0 && <Text style={s.meta}>当前账号没有已下载的学习包。联网后可在练习页下载。</Text>}
      {rows?.map((row) => <AnimatedPressable key={row.id} accessibilityRole="button"
        accessibilityState={{ disabled: !!opening, busy: opening === row.id }}
        disabled={!!opening} onPress={() => void open(row.id)} style={s.card}>
        <View style={s.copy}>
          <Text style={s.name}>{row.name}</Text>
          <Text style={s.meta}>{opening === row.id ? '正在读取…' : row.count.toLocaleString() + ' 道题 · 可离线学习'}</Text>
        </View>
      </AnimatedPressable>)}
      {!!error && <Text accessibilityLiveRegion="polite" style={s.error}>{error}</Text>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = (c: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  page: { padding: spacing.lg, gap: spacing.md },
  title: { color: c.text, fontSize: 28, fontWeight: '800' },
  meta: { color: c.textMuted, fontSize: 15, lineHeight: 22 },
  name: { color: c.text, fontSize: 17, fontWeight: '700' },
  action: { color: c.brand, fontSize: 15, fontWeight: '700' },
  error: { color: c.warning, fontSize: 15 },
  copy: { gap: spacing.xs },
  button: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: spacing.md },
  card: { minHeight: 64, justifyContent: 'center', padding: spacing.md, borderRadius: radius.md,
    backgroundColor: c.surface, borderColor: c.border, borderWidth: 1 },
});
