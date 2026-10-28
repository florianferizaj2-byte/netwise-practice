import { createElement, useContext, type ComponentProps } from 'react';
import { StyleSheet } from 'react-native';
import { initialWindowMetrics, SafeAreaInsetsContext, SafeAreaProvider, SafeAreaView as NativeSafeAreaView } from 'react-native-safe-area-context';

// Keep the .android.ts extension: Metro tries .ts before .tsx, and the shared
// fallback is SafeArea.ts. Every native page/modal must resolve this boundary.
// A nested provider measures its own window rather than doubling outer insets.
export function SafeAreaView(props: ComponentProps<typeof NativeSafeAreaView>) {
  const parentInsets = useContext(SafeAreaInsetsContext);
  return createElement(SafeAreaProvider, {
    initialMetrics: parentInsets ? undefined : initialWindowMetrics,
    style: styles.fill,
  }, createElement(NativeSafeAreaView, {
    edges: ['top', 'right', 'bottom', 'left'],
    testID: 'android-page-safe-area',
    ...props,
  }));
}
const styles = StyleSheet.create({ fill: { flex: 1 } });
