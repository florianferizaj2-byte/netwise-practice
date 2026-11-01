import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { practiceVoice } from '../practiceVoice';
import { AppIcon } from './AppIcon';
import { AnimatedPressable } from './Motion';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme';
export function VoicePackDownloads({ onOpen }: { onOpen: () => void }) {
  const { colors } = useTheme(),
    s = useThemedStyles(styles),
    [status, setStatus] = useState(practiceVoice.getStatus);
  useEffect(
    () => practiceVoice.subscribe(() => setStatus(practiceVoice.getStatus())),
    [],
  );
  return (
    <View testID="voice-pack-downloads">
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel="打开语音包设置"
        onPress={onOpen}
        style={s.row}
      >
        <View style={s.icon}>
          <AppIcon name="waveform" size={25} color={colors.brand} />
        </View>
        <View style={s.copy}>
          <Text style={s.title}>语音包</Text>
          <Text style={s.detail}>
            {status.currentName} · 下载、试听与场景配置
          </Text>
        </View>
        <AppIcon name="chevron-right" size={20} color={colors.textMuted} />
      </AnimatedPressable>
    </View>
  );
}
const styles = (c: ThemeColors) =>
  StyleSheet.create({
    row: {
      minHeight: 76,
      padding: 12,
      borderRadius: 16,
      backgroundColor: c.surfaceMuted,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    icon: {
      width: 44,
      height: 44,
      backgroundColor: c.brandSoft,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    copy: { flex: 1, minWidth: 0, gap: 4 },
    title: { fontSize: 16, lineHeight: 25, fontWeight: '700', color: c.text },
    detail: { fontSize: 13, lineHeight: 21, color: c.textMuted },
  });
