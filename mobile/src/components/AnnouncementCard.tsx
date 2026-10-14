import { useEffect, useState, useSyncExternalStore } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { publicAnnouncements as announcements } from '../announcements/current';
import { useScreenActive } from '../navigation/ScreenActivity';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme';
import { AnimatedPressable } from './Motion';

export function AnnouncementCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const active = useScreenActive();
  const content = useSyncExternalStore(announcements.subscribe, announcements.snapshot, announcements.snapshot);
  const [open, setOpen] = useState(false);
  const s = useThemedStyles(styles);
  const { reduceMotion } = useTheme();

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
      <Modal visible={open && active} transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={() => setOpen(false)}>
        <View style={s.backdrop}>
          <View style={s.dialog} accessibilityViewIsModal>
            <ScrollView contentContainerStyle={s.copy}>
              <Text style={s.label}>考匠公告</Text>
              <Text accessibilityRole="header" style={s.title}>{content.title}</Text>
              <Text style={s.date}>{new Date(content.updatedAt).toLocaleDateString('zh-CN')}</Text>
              <Text testID="announcement-body" selectable style={s.body}>{content.body}</Text>
            </ScrollView>
            <AnimatedPressable accessibilityRole="button" accessibilityLabel="关闭公告"
              onPress={() => setOpen(false)} style={s.close}>
              <Text style={s.closeText}>知道了</Text>
            </AnimatedPressable>
          </View>
        </View>
      </Modal>
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
  backdrop: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: c.overlay },
  dialog: { width: '100%', maxWidth: 500, maxHeight: '85%', padding: 24, gap: 20, borderRadius: 24, backgroundColor: c.surface },
  copy: { gap: 12 },
  label: { color: c.brandDark, fontSize: 13, fontWeight: '700' },
  title: { color: c.text, fontSize: 22, lineHeight: 32, fontWeight: '700' },
  date: { color: c.textMuted, fontSize: 13, lineHeight: 20 },
  body: { color: c.text, fontSize: 16, lineHeight: 27 },
  close: { minHeight: 48, padding: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: c.brandSoft },
  closeText: { color: c.brandDark, fontSize: 16, fontWeight: '700' },
});
