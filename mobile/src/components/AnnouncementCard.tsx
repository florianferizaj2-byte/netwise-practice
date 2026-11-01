import { useEffect, useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text } from 'react-native';
import { publicAnnouncements as announcements } from '../announcements/current';
import { useScreenActive } from '../navigation/ScreenActivity';
import { useThemedStyles, type ThemeColors } from '../theme';
import { AnimatedPressable } from './Motion';
import { AnnouncementDialog } from './AnnouncementDialog';

export function AnnouncementCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const active = useScreenActive();
  const content = useSyncExternalStore(announcements.subscribe, announcements.snapshot, announcements.snapshot);
  const [open, setOpen] = useState(false);
  const s = useThemedStyles(styles);

  useEffect(() => { void announcements.hydrate(); }, []);
  useEffect(() => {
    if (!active) { setOpen(false); return; }
    void announcements.refresh(true);
    const timer = setInterval(() => { void announcements.refresh(true); }, 60_000);
    return () => clearInterval(timer);
  }, [active, refreshKey]);

  if (!content.enabled) return null;
  return (
    <>
      <AnimatedPressable accessibilityRole="button"
        accessibilityLabel={`查看公告：${content.title}`} accessibilityHint="展开公告全文"
        onPress={() => setOpen(true)} style={s.banner}>
        <Text style={s.badge}>公告</Text>
        <Text numberOfLines={1} style={s.summary}>{content.title}</Text>
        <Text accessibilityElementsHidden importantForAccessibility="no" style={s.arrow}>›</Text>
      </AnimatedPressable>
      <AnnouncementDialog content={content} visible={open && active} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = (c: ThemeColors) => StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16,
    paddingVertical: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 16 },
  badge: { color: c.brandDark, backgroundColor: c.brandSoft, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6, fontSize: 13, fontWeight: '700' },
  summary: { flex: 1, minWidth: 0, color: c.text, fontSize: 15, lineHeight: 23 },
  arrow: { color: c.textMuted, fontSize: 22 },
});
