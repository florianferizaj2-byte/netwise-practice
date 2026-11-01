import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from './Motion';
import { AppIcon } from './AppIcon';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme';
import { membershipPurchaseUrl } from './membership-purchase';

export function MembershipPurchaseLink({ primary = false, compact = false, label = '购买会员兑换码' }: { primary?: boolean; compact?: boolean; label?: string }) {
  const { colors } = useTheme(), s = useThemedStyles(styles);
  const [failed, setFailed] = useState(false);
  function openShop() {
    setFailed(false);
    void Linking.openURL(membershipPurchaseUrl).catch(() => setFailed(true));
  }
  return <View style={[s.wrapper, compact && s.compact]}>
    <AnimatedPressable accessibilityRole="link" accessibilityLabel="购买会员兑换码" accessibilityHint="在浏览器打开购买页，购买后返回考匠兑换" onPress={openShop} style={[s.link, primary && s.primary]}>
      <Text style={[s.label, primary && s.onPrimary]}>{label}</Text><AppIcon name="arrow" size={20} color={primary ? colors.white : colors.brand}/>
    </AnimatedPressable>
    {failed && <View accessibilityLiveRegion="polite" style={s.failure}><Text style={s.note}>无法打开浏览器，可复制下方地址后手动打开。</Text><Text selectable style={s.address}>{membershipPurchaseUrl}</Text></View>}
  </View>;
}
const styles = (c: ThemeColors) => StyleSheet.create({
  wrapper: { marginTop: 10 }, compact: { flex: 1, minWidth: 154, marginTop: 0 },
  link: { minHeight: 50, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, backgroundColor: c.surface },
  primary: { backgroundColor: c.action, borderColor: c.action },
  label: { fontSize: 15, fontWeight: '500', color: c.brand, flex: 1 }, onPrimary: { color: '#FFFFFF' },
  failure: { gap: 6, marginTop: 10 }, note: { fontSize: 13, lineHeight: 21, color: c.warning }, address: { fontSize: 13, lineHeight: 21, color: c.textMuted },
});
