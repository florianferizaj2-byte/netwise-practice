import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { Announcement } from '../announcements/client';
import { publicAnnouncements } from '../announcements/current';
import { useTheme } from '../theme';
import { BrandMark } from './BrandMark';
import { AnnouncementDialog } from './AnnouncementDialog';

/** One notice per App launch, shared by guests and signed-in users. */
export function LaunchAnnouncement({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<Announcement | null>(null);
  useEffect(() => {
    let active = true, settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (!active || settled) return;
      settled = true; if (timer) clearTimeout(timer);
      const current = publicAnnouncements.snapshot();
      setNotice(current.enabled ? current : null); setReady(true);
    };
    void publicAnnouncements.hydrate().then(() => {
      if (!active) return;
      // A slow/offline connection uses the last valid local notice promptly.
      timer = setTimeout(finish, 2_000);
      void publicAnnouncements.refresh(true).finally(finish);
    });
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, []);
  if (!ready) return <View style={[s.loading, { backgroundColor: colors.background }]}><BrandMark /><ActivityIndicator color={colors.brand} /></View>;
  return <View style={s.root} testID="announcement-ready">
    {notice ? <>
      <View style={[s.loading, { backgroundColor: colors.background }]}><BrandMark /></View>
      <AnnouncementDialog content={notice} visible launch onClose={() => setNotice(null)} />
    </> : children}
  </View>;
}
const s = StyleSheet.create({ root: { flex: 1 }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 } });
