import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from '../components/Motion';
import { AppIcon } from '../components/AppIcon';
import { radius, spacing, useThemedStyles, type ThemeColors } from '../theme';
import { downloadOfflinePack, installedOfflinePackManifest } from './offlinePacks.android';
import type { OfflinePackManifest } from './offlinePackFormat';

export function OfflineDownloadCard({ userId, certificateId, name }: { userId: string; certificateId: string; name: string }) {
  const styles = useThemedStyles(createStyles);
  const [installed, setInstalled] = useState<OfflinePackManifest | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const current = useRef<AbortController | null>(null);
  const owner = { userId, certificateId };
  useEffect(() => {
    let live = true;
    void installedOfflinePackManifest({ userId, certificateId }).then((value) => {
      if (live) setInstalled(value);
    }).catch(cause => { if (live) setMessage(cause instanceof Error ? cause.message : '本机学习包无法读取，请重新下载。'); });
    return () => {
      live = false;
      current.current?.abort();
      current.current = null;
    };
  }, [userId, certificateId]);

  async function download() {
    if (current.current) return;
    const run = new AbortController();
    current.current = run;
    setProgress(0);
    setMessage('');
    try {
      const manifest = await downloadOfflinePack(owner, {
        signal: run.signal,
        onProgress: (value) => { if (current.current === run) setProgress(Math.round(value * 100)); },
      });
      if (current.current === run) {
        setInstalled(manifest);
        setMessage('学习包已保存到本机。');
      }
    } catch (cause) {
      if (current.current === run) setMessage(run.signal.aborted ? '已取消下载。' :
        cause instanceof Error ? cause.message : '学习包下载失败，请检查网络后重试。');
    } finally {
      if (current.current === run) { current.current = null; setProgress(null); }
    }
  }

  return <View style={styles.card} testID="offline-download-card">
    <View style={styles.heading}>
      <AppIcon name="download" size={22} color={styles.accent.color} />
      <Text style={styles.title} accessibilityRole="header">{name}</Text>
    </View>
    <Text style={styles.meta}>{installed
      ? '已下载 · ' + installed.questionCount.toLocaleString() + ' 道题 · ' +
        (installed.bytes / 1024 / 1024).toFixed(1) + ' MB'
      : '未下载'}</Text>
    <View style={styles.actions}>
      <AnimatedPressable accessibilityRole="button"
        accessibilityLabel={installed ? `检查${name}题库更新` : `下载${name}题库`}
        accessibilityState={{ busy: progress !== null, disabled: progress !== null }}
        disabled={progress !== null} onPress={() => void download()} style={styles.button}>
        {progress !== null && <ActivityIndicator size="small" color={styles.accent.color} />}
        <Text style={styles.accent}>{progress !== null ? (progress >= 90 ? '正在校验学习包…' : '正在下载 ' + progress + '%')
          : installed ? '检查更新' : '下载题库'}</Text>
      </AnimatedPressable>
      {progress !== null && <AnimatedPressable accessibilityRole="button" onPress={() => current.current?.abort()}
        style={styles.button}><Text style={styles.meta}>取消下载</Text></AnimatedPressable>}
    </View>
    {!!message && <Text accessibilityLiveRegion="polite" style={styles.meta}>{message}</Text>}
  </View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, marginBottom: spacing.md },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { color: colors.text, fontSize: 17, fontWeight: '700', flexShrink: 1 },
  meta: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  accent: { color: colors.brand, fontSize: 15, fontWeight: '700', flexShrink: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  button: { backgroundColor: colors.surfaceMuted, minHeight: 48, justifyContent: 'center',
    alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.sm, flexDirection: 'row', gap: spacing.sm, maxWidth: '100%' },
});
