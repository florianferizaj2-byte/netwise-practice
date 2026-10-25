import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from './Motion';
import { AppAlert } from './AppAlert';
import { openRoutePlayer, routePlayerAvailable } from '../../modules/route-player/index.android';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme';
import {mobileSessionSnapshot} from '../api/client';
import {locationLearningApi as mobileApi} from '../api/locationLearning.android';
import {LocationLearningGate} from '../screens/LocationLearningGate.android';

export const ROUTE_PLAYER_CHAPTER = '虚拟定位学习';

/** Daily, account-and-certificate scoped study is verified before native entry. */
export function RoutePlayerChapter({ search = '',preview=false }: { search?: string;preview?:boolean }) {
  const [opening, setOpening] = useState(false);
  const [gateOpen,setGateOpen]=useState(false);
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  if (!routePlayerAvailable() || !ROUTE_PLAYER_CHAPTER.includes(search.trim())) return null;

  async function open() {
    if (opening) return;
    setOpening(true);
    try { await openRoutePlayer(await mobileApi.locationLearningOpenCredentials()); }
    finally { setOpening(false); }
  }

  return (
    <View style={s.chapter}>
      <AnimatedPressable accessibilityRole="button" accessibilityLabel={ROUTE_PLAYER_CHAPTER}
        disabled={opening} onPress={() => preview||!mobileSessionSnapshot().token?AppAlert.alert('请先登录','专项学习按当前账号和证书记录，请登录后使用。'):setGateOpen(true)} style={s.row}>
        <Text style={s.title}>{ROUTE_PLAYER_CHAPTER}</Text>
        {opening ? <ActivityIndicator size="small" color={colors.brand} /> : <Text style={s.action}>进入学习 ›</Text>}
      </AnimatedPressable>
      {gateOpen&&<LocationLearningGate visible={gateOpen} onClose={()=>setGateOpen(false)} onEnter={open}/>}
    </View>
  );
}

const styles = (colors: ThemeColors) => StyleSheet.create({
  chapter: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 20, marginTop: 4, marginBottom: 16 },
  row: { minHeight: 64, paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '700' },
  action: { color: colors.brand, fontSize: 14, fontWeight: '600' },
});
