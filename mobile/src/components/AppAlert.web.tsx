import { iosStyles } from '../iosStyles';
import { useSyncExternalStore } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View, type AlertButton, type AlertOptions } from 'react-native';
import { AnimatedPressable } from './Motion';
import { radius, spacing, useThemedStyles, type ThemeColors } from '../theme';

type Notice = { title: string; message?: string; buttons: AlertButton[]; options?: AlertOptions };
let notices: Notice[] = [];
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const snapshot = () => notices[0] ?? null;
const emit = () => listeners.forEach((listener) => listener());

// React Native's Alert has no web implementation. Keep the same actions on web.
export const AppAlert = {
  alert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
    notices = [...notices, { title, message, buttons: buttons?.length ? buttons : [{ text: '知道了' }], options }];
    emit();
  },
};

export function AppAlertHost() {
  const notice = useSyncExternalStore(subscribe, snapshot, snapshot);
  const s = useThemedStyles(styles, iosStyles.alert);
  if (!notice) return null;
  function finish(button?: AlertButton) {
    notices = notices.slice(1);
    emit();
    if (button) button.onPress?.();
    else notice?.options?.onDismiss?.();
  }
  function dismiss() {
    const cancel = notice?.buttons.find((button) => button.style === 'cancel');
    if (cancel) finish(cancel);
    else if (notice?.options?.cancelable) finish();
  }
  return (
    <Modal transparent visible animationType="fade" onRequestClose={dismiss}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <ScrollView contentContainerStyle={s.copy}>
            <Text accessibilityRole="header" style={s.title}>{notice.title}</Text>
            {!!notice.message && <Text style={s.message}>{notice.message}</Text>}
          </ScrollView>
          <View style={s.actions}>
            {notice.buttons.map((button, index) => (
              <AnimatedPressable key={index} accessibilityRole="button" onPress={() => finish(button)}
                style={[s.button, button.style === 'cancel' && s.cancel]}>
                <Text style={[s.buttonText, button.style === 'cancel' && s.cancelText,
                  button.style === 'destructive' && s.destructive]}>{button.text ?? '确定'}</Text>
              </AnimatedPressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}
const styles = (c: ThemeColors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', padding: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: c.surface, borderRadius: radius.lg, width: '100%', maxWidth: 420, maxHeight: '90%', padding: spacing.lg, gap: spacing.lg },
  copy: { gap: spacing.sm },
  title: { color: c.text, fontSize: 20, fontWeight: '800' },
  message: { color: c.textMuted, fontSize: 16, lineHeight: 25 },
  actions: { gap: spacing.sm },
  button: { backgroundColor: c.brand, borderRadius: radius.sm, padding: spacing.md, alignItems: 'center', minHeight: 48 },
  buttonText: { color: c.white, fontSize: 16, fontWeight: '700' },
  cancel: { backgroundColor: c.background },
  cancelText: { color: c.textMuted },
  destructive: { color: c.warning },
});
