import { useEffect, useId, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useTheme, type ThemeColors } from '../theme';

export function leaderboardGold(c: ThemeColors) {
  return c.background === '#101722' || c.background === '#000000' ? {
    ink: '#FFD689', soft: '#372A19', page: '#1B1813', panel: '#2A2217',
    border: '#70532A', bright: '#4B351A', solid: '#F6C968', onSolid: '#372308',
  } : {
    ink: '#784507', soft: '#FFF0CC', page: '#FFF9EE', panel: '#FFF5DF',
    border: '#DDB772', bright: '#FFE5A4', solid: '#F8CB67', onSolid: '#412807',
  };
}

// One smooth pass with a rest between cycles. Only transform and opacity animate.
export function GoldShimmer({ active = true, small = false, sparkInset = 5, testID }: {
  active?: boolean;
  small?: boolean;
  sparkInset?: number;
  testID?: string;
}) {
  const { reduceMotion } = useTheme();
  const id = `leaderboard-gold-${useId().replace(/[^a-z\d_-]/gi, '')}`;
  const progress = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);
  const playing = active && !reduceMotion;

  useEffect(() => {
    if (!playing || !width) return;
    progress.setValue(0);
    const loop = Animated.loop(Animated.timing(progress, {
      toValue: 1, duration: small ? 4200 : 3600, easing: Easing.linear,
      useNativeDriver: typeof document === 'undefined', isInteraction: false,
    }));
    loop.start();
    return () => { loop.stop(); progress.setValue(0); };
  }, [playing, progress, small, width]);

  if (!playing) return null;
  const bandWidth = Math.max(small ? 45 : 64, width * 0.55);
  const translateX = progress.interpolate({ inputRange: [0, 0.68, 1], outputRange: [-bandWidth - 24, width + 24, width + 24] });
  const opacity = progress.interpolate({ inputRange: [0, 0.12, 0.34, 0.55, 0.68, 1], outputRange: [0, 0.12, 0.76, 0.62, 0, 0] });
  const sparkOpacity = progress.interpolate({ inputRange: [0, 0.21, 0.46, 0.64, 0.8, 1], outputRange: [0, 0, 0.9, 0.34, 0, 0] });
  const sparkScale = progress.interpolate({ inputRange: [0, 0.46, 0.8, 1], outputRange: [0.62, 1.1, 0.7, 0.7] });

  return <View testID={testID} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden
    style={styles.overlay} onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}>
    {width > 0 && <>
      <Animated.View testID={testID ? `${testID}-sweep` : undefined} style={[styles.band, { width: bandWidth, opacity, transform: [{ translateX }, { rotate: '17deg' }] }]}>
        <Svg width="100%" height="100%">
          <Defs><LinearGradient id={id} x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#F4B647" stopOpacity={0} />
            <Stop offset="43%" stopColor="#FFDC7D" stopOpacity={0.34} />
            <Stop offset="55%" stopColor="#FFF7D4" stopOpacity={0.92} />
            <Stop offset="100%" stopColor="#F4B647" stopOpacity={0} />
          </LinearGradient></Defs>
          <Rect width="100%" height="100%" fill={`url(#${id})`} />
        </Svg>
      </Animated.View>
      {!small && <Animated.View testID={testID ? `${testID}-stars` : undefined} style={[styles.stars, { right: sparkInset, opacity: sparkOpacity, transform: [{ scale: sparkScale }] }]}>
        <Svg width={30} height={27} viewBox="0 0 30 27">
          <Path d="M20 1c.9 6 2.9 8 9 9-6.1.9-8.1 2.9-9 9-.9-6.1-2.9-8.1-9-9 6.1-1 8.1-3 9-9Z" fill="#FFF2AE" stroke="#B67418" strokeWidth={1.15} />
          <Path d="M7 13c.5 3.7 1.8 5 5.5 5.5C8.8 19 7.5 20.3 7 24c-.5-3.7-1.8-5-5.5-5.5C5.2 18 6.5 16.7 7 13Z" fill="#F9CB66" stroke="#A46110" strokeWidth={0.8} />
        </Svg>
      </Animated.View>}
    </>}
  </View>;
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  band: { position: 'absolute', top: '-35%', bottom: '-35%', left: 0 },
  stars: { position: 'absolute', top: 5 },
});
