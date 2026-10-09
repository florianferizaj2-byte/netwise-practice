import { useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { AnimatedPressable } from "./Motion";
import { useTheme } from "../theme";
import { membershipPurchaseUrl } from "./membership-purchase";

export function MembershipPurchaseLink({ primary = false }: { primary?: boolean }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  function openShop() {
    setFailed(false);
    void Linking.openURL(membershipPurchaseUrl).catch(() => setFailed(true));
  }
  return <View style={styles.wrapper}>
    <AnimatedPressable accessibilityRole="link" accessibilityLabel="购买会员兑换码"
      accessibilityHint="在浏览器打开购买页，购买后返回考匠兑换"
      onPress={openShop} style={[styles.link, { borderColor: colors.border,
        backgroundColor: primary ? colors.brand : colors.surface }]}>
      <Text style={[styles.label, { color: primary ? colors.white : colors.brand }]}>购买会员兑换码</Text>
      <Text accessible={false} style={[styles.arrow, { color: primary ? colors.white : colors.brand }]}>↗</Text>
    </AnimatedPressable>
    {failed && <View accessibilityLiveRegion="polite" style={styles.failure}>
      <Text style={[styles.note, { color: colors.warning }]}>无法打开浏览器，可复制下方地址后手动打开。</Text>
      <Text selectable style={[styles.address, { color: colors.textMuted }]}>{membershipPurchaseUrl}</Text>
    </View>}
  </View>;
}
const styles = StyleSheet.create({
  wrapper: { marginTop: 12 },
  link: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 18,
    paddingVertical: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  label: { flex: 1, fontSize: 16, fontWeight: "600" }, arrow: { fontSize: 18 },
  failure: { gap: 6, marginTop: 10 }, note: { fontSize: 13, lineHeight: 21 },
  address: { fontSize: 13, lineHeight: 21 },
});
