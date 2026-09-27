import { useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type RefreshControlProps } from 'react-native';
import { useTheme } from '../theme';

// React Native Web's RefreshControl is a no-op. Preserve the native pull gesture.
export function RefreshControl({ children, enabled = true, onRefresh, refreshing, style }: RefreshControlProps & { children?: ReactNode }) {
  const { colors } = useTheme();
  const gesture = useRef<{ x: number; y: number; distance: number } | null>(null);
  const [pull, setPull] = useState(0);
  function reset() { gesture.current = null; setPull(0); }
  return <View style={[s.root, style]}
    onTouchStart={(event) => {
      if (!enabled || refreshing || event.nativeEvent.touches.length !== 1) return;
      let target = event.target as unknown as HTMLElement | null;
      const boundary = event.currentTarget as unknown as HTMLElement;
      while (target && target !== boundary) {
        if (target.scrollTop > 0) return;
        target = target.parentElement;
      }
      const touch = event.nativeEvent.touches[0];
      gesture.current = { x: touch.pageX, y: touch.pageY, distance: 0 };
    }}
    onTouchMove={(event) => {
      const start = gesture.current;
      const touch = event.nativeEvent.touches[0];
      if (!start || !touch) return;
      if (Math.abs(touch.pageX - start.x) > 40 || touch.pageY < start.y) { reset(); return; }
      start.distance = Math.min(110, touch.pageY - start.y);
      setPull(start.distance);
    }}
    onTouchCancel={reset}
    onTouchEnd={() => { const ready = (gesture.current?.distance ?? 0) >= 70; reset(); if (ready && !refreshing) onRefresh?.(); }}>
    {children}
    {(pull > 20 || refreshing) && <View pointerEvents="none" style={[s.indicator, { backgroundColor: colors.surface }]}>
      {refreshing ? <ActivityIndicator color={colors.brand} /> : <Text style={{ color: colors.brand }}>{pull >= 70 ? '松开刷新' : '下拉刷新'}</Text>}
    </View>}
  </View>;
}
const s = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  indicator: { position: 'absolute', top: 8, alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 24, zIndex: 10 },
});
