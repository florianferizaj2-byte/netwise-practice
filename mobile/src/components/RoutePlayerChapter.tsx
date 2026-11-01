import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from './Motion';
import { AppAlert } from './AppAlert';
import { openRoutePlayer, routePlayerAvailable } from '../../modules/route-player';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme';

export const ROUTE_PLAYER_CHAPTER = '虚拟定位学习';

/** A local chapter entry; it never creates quiz questions or learning progress. */
export function RoutePlayerChapter({ search = '' }: { search?: string }) {
  const [opening, setOpening] = useState(false);
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  if (!routePlayerAvailable() || !ROUTE_PLAYER_CHAPTER.includes(search.trim())) return null;

  async function open() {
    if (opening) return;
    setOpening(true);
    try { await openRoutePlayer(); }
    catch (error) {
      AppAlert.alert('暂时无法打开', error instanceof Error ? error.message : '请更新考匠安卓版后再试');
    } finally { setOpening(false); }
  }

  return (
    <View style={s.chapter}>
      <AnimatedPressable accessibilityRole="button" accessibilityLabel={ROUTE_PLAYER_CHAPTER}
        disabled={opening} onPress={() => void open()} style={s.row}>
        <Text style={s.title}>{ROUTE_PLAYER_CHAPTER}</Text>
        {opening ? <ActivityIndicator size="small" color={colors.brand} /> : <Text style={s.action}>进入学习</Text>}
      </AnimatedPressable>
    </View>
  );
}

const styles = (colors: ThemeColors) => StyleSheet.create({
  chapter: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 20, marginTop: 4, marginBottom: 16 },
  row: { minHeight: 64, paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '700' },
  action: { color: colors.brand, fontSize: 14, fontWeight: '600' },
});
