import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from './Motion';
import { presetAvatarData } from './presetAvatarData';
import { useThemedStyles, type ThemeColors } from '../theme';

export type PresetAvatar = { index: number; uri: string; data: string; mimeType: 'image/png' };

const presets: PresetAvatar[] = presetAvatarData.map((data, index) => ({
  index, data, uri: 'data:image/png;base64,' + data, mimeType: 'image/png',
}));

export function PresetAvatarPicker({ selected, disabled, onSelect }: {
  selected?: number;
  disabled?: boolean;
  onSelect: (avatar: PresetAvatar) => void;
}) {
  const s = useThemedStyles(styles);
  return (
    <View style={s.section}>
      <View style={s.heading}>
        <Text accessibilityRole="header" style={s.label}>预设头像</Text>
        <Text style={s.hint}>左右滑动查看全部 {presets.length} 个</Text>
      </View>
      <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail}>
        {presets.map((avatar) => (
          <AnimatedPressable
            key={avatar.index}
            accessibilityRole="radio"
            accessibilityLabel={`预设头像 ${avatar.index + 1}`}
            accessibilityState={{ checked: selected === avatar.index, disabled }}
            disabled={disabled}
            onPress={() => onSelect(avatar)}
            style={[s.choice, selected === avatar.index && s.selected]}
          >
            <Image source={{ uri: avatar.uri }} style={s.avatar} />
          </AnimatedPressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = (c: ThemeColors) => StyleSheet.create({
  section: { gap: 7 },
  heading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' },
  label: { color: c.text, fontWeight: '600', fontSize: 15 },
  hint: { color: c.textMuted, fontSize: 12 },
  rail: { gap: 8, paddingVertical: 4 },
  choice: { width: 60, height: 60, borderWidth: 2, borderColor: 'transparent', borderRadius: 30, padding: 3 },
  selected: { borderColor: c.brand, backgroundColor: c.brandSoft },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: c.surfaceMuted },
});
