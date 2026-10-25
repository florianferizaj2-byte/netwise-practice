import type { ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { initialWindowMetrics, SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

/** A native Modal owns a separate window; never reuse the page's consumed insets. */
export function AndroidModalSafeArea({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <SafeAreaProvider initialMetrics={initialWindowMetrics} style={styles.fill}>
    <SafeAreaView testID="android-modal-safe-area" edges={['top', 'right', 'bottom', 'left']} style={[styles.fill, style]}>
      {children}
    </SafeAreaView>
  </SafeAreaProvider>;
}
const styles = StyleSheet.create({ fill: { flex: 1 } });
