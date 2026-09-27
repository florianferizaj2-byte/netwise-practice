import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from './Motion';
import { AppAlert } from './AppAlert';
import { isAppleMobile, isStandalone, refreshWebApp } from '../platform/webApp';
import { radius, spacing, useThemedStyles, type ThemeColors } from '../theme';

export function WebAppActions({ showRefresh = false }: { showRefresh?: boolean }) {
  const s = useThemedStyles(styles);
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const apple = isAppleMobile();
  const standalone = isStandalone();
  const embedded = /MicroMessenger|QQ\/|Weibo|DingTalk/i.test(navigator.userAgent);
  async function copyAddress() {
    try { await navigator.clipboard.writeText(`${location.origin}/app/`); setCopied(true); }
    catch { setCopied(false); } // The address below remains selectable.
  }
  function update() {
    AppAlert.alert('刷新考匠', '请先保存正在填写的内容。已提交的答题和学习记录会保留。', [
      { text: '稍后再说', style: 'cancel' },
      { text: '立即刷新', onPress: () => { setRefreshing(true); void refreshWebApp().catch(() => setRefreshing(false)); } },
    ]);
  }
  if (standalone && !showRefresh) return null;
  return <>
    <View style={s.actions}>
      {!standalone && <AnimatedPressable accessibilityRole="button" onPress={() => setOpen(true)} style={s.button}>
        <Text style={s.buttonText}>{apple ? '添加考匠到主屏幕' : '安装到主屏幕'}</Text>
      </AnimatedPressable>}
      {showRefresh && <AnimatedPressable accessibilityRole="button" disabled={refreshing} onPress={update} style={s.button}>
        <Text style={s.buttonText}>{refreshing ? '正在刷新…' : '刷新到最新版本'}</Text>
      </AnimatedPressable>}
    </View>
    <Modal transparent animationType="fade" visible={open} onRequestClose={() => setOpen(false)}>
      <View style={s.backdrop}><View style={s.card}>
        <ScrollView contentContainerStyle={s.copy}>
          <Text accessibilityRole="header" style={s.title}>把考匠放到主屏幕</Text>
          <Text style={s.note}>下次点图标就能打开，使用原来的考匠账号继续学习。</Text>
          {apple ? <>
            <Text style={s.step}>1. 在 Safari 浏览器打开考匠{embedded ? '。点击当前浏览器右上角菜单，选择在外部浏览器打开；也可以复制下方地址到 Safari。' : '。'}</Text>
            <Text style={s.step}>2. 点击浏览器的“分享”按钮，再选“添加到主屏幕”。</Text>
            <Text style={s.step}>3. 如有“作为网页 App 打开”选项，请开启，然后点“添加”。</Text>
          </> : <Text style={s.step}>在浏览器菜单中选择“安装应用”或“添加到主屏幕”，按提示完成。</Text>}
          <Text selectable style={s.address}>{location.origin}/app/</Text>
          <AnimatedPressable accessibilityRole="button" onPress={() => void copyAddress()} style={s.button}>
            <Text style={s.buttonText}>{copied ? '已复制地址' : '复制考匠地址'}</Text>
          </AnimatedPressable>
        </ScrollView>
        <AnimatedPressable accessibilityRole="button" onPress={() => setOpen(false)} style={s.primary}>
          <Text style={s.primaryText}>知道了</Text>
        </AnimatedPressable>
      </View></View>
    </Modal>
  </>;
}
const styles = (c: ThemeColors) => StyleSheet.create({
  actions: { gap: spacing.sm, marginTop: spacing.md },
  button: { padding: spacing.md, minHeight: 48, borderWidth: 1, borderColor: c.border, borderRadius: radius.sm, alignItems: 'center' },
  buttonText: { color: c.brand, fontSize: 16, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', padding: spacing.lg, justifyContent: 'center', alignItems: 'center' },
  card: { width: '100%', maxWidth: 440, maxHeight: '90%', borderRadius: radius.lg, backgroundColor: c.surface, padding: spacing.lg, gap: spacing.lg },
  copy: { gap: spacing.md },
  title: { color: c.text, fontSize: 22, fontWeight: '800' },
  note: { color: c.textMuted, fontSize: 15, lineHeight: 24 },
  step: { color: c.text, fontSize: 16, lineHeight: 26 },
  address: { color: c.textMuted, fontSize: 14 },
  primary: { backgroundColor: c.brand, borderRadius: radius.sm, padding: spacing.md, alignItems: 'center' },
  primaryText: { color: c.white, fontSize: 16, fontWeight: '700' },
});
