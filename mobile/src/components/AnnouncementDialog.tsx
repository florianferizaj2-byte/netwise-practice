import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Announcement } from '../announcements/client';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme';
import { AnimatedPressable } from './Motion';
import { SafeAreaView } from './SafeArea';

export function AnnouncementDialog({ content, visible, onClose, launch = false }: {
  content: Announcement; visible: boolean; onClose: () => void; launch?: boolean;
}) {
  const s = useThemedStyles(styles); const { reduceMotion } = useTheme();
  return <Modal visible={visible} transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={onClose}>
    <SafeAreaView style={s.backdrop} testID={launch ? 'launch-announcement' : undefined}>
      <View style={s.dialog} accessibilityViewIsModal>
        <ScrollView contentContainerStyle={s.copy}>
          <Text style={s.label}>考匠公告</Text>
          <Text accessibilityRole="header" style={s.title}>{content.title}</Text>
          <Text style={s.date}>{new Date(content.updatedAt).toLocaleDateString('zh-CN')}</Text>
          <Text testID="announcement-body" selectable style={s.body}>{content.body}</Text>
        </ScrollView>
        <AnimatedPressable accessibilityRole="button" accessibilityLabel="关闭公告" onPress={onClose} style={s.close}>
          <Text style={s.closeText}>知道了</Text>
        </AnimatedPressable>
      </View>
    </SafeAreaView>
  </Modal>;
}
const styles = (c: ThemeColors) => StyleSheet.create({
  backdrop: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: c.overlay },
  dialog: { width: '100%', maxWidth: 500, maxHeight: '85%', padding: 24, gap: 20, borderRadius: 24, backgroundColor: c.surface },
  copy: { gap: 12 }, label: { color: c.brandDark, fontSize: 13, fontWeight: '700' },
  title: { color: c.text, fontSize: 22, lineHeight: 32, fontWeight: '700' },
  date: { color: c.textMuted, fontSize: 13, lineHeight: 20 }, body: { color: c.text, fontSize: 16, lineHeight: 27 },
  close: { minHeight: 48, padding: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: c.brandSoft },
  closeText: { color: c.brandDark, fontSize: 16, fontWeight: '700' },
});
