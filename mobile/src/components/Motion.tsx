import { useEffect, useRef, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

const MotionPressable = Animated.createAnimatedComponent(Pressable);

type EntranceOptions = {
  delay?: number;
  distance?: number;
};

export function useEntrance({
  delay = 0,
  distance = 16,
}: EntranceOptions = {}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(distance)).current;

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.timing(opacity, {
        delay,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        delay,
        friction: 8,
        tension: 62,
        toValue: 0,
        useNativeDriver: true,
      }),
    ]);

    animation.start();
    return () => animation.stop();
  }, [delay, opacity, translateY]);

  return {
    opacity,
    transform: [{ translateY }],
  };
}

export function usePulse({
  minScale = 1,
  maxScale = 1.045,
  duration = 1800,
}: {
  minScale?: number;
  maxScale?: number;
  duration?: number;
} = {}) {
  const scale = useRef(new Animated.Value(minScale)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          duration,
          easing: Easing.inOut(Easing.sin),
          toValue: maxScale,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          duration,
          easing: Easing.inOut(Easing.sin),
          toValue: minScale,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [duration, maxScale, minScale, scale]);

  return scale;
}

export function EntranceView({
  children,
  delay,
  distance,
  style,
}: {
  children: ReactNode;
  delay?: number;
  distance?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const motionStyle = useEntrance({ delay, distance });

  return <Animated.View style={[style, motionStyle]}>{children}</Animated.View>;
}

type AnimatedPressableProps = Pick<
  PressableProps,
  'accessibilityLabel' | 'accessibilityRole' | 'disabled' | 'onLongPress' | 'onPress'
> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function AnimatedPressable({
  children,
  disabled = false,
  onLongPress,
  onPress,
  style,
  ...accessibilityProps
}: AnimatedPressableProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    Animated.spring(scale, {
      friction: 7,
      tension: 260,
      toValue: 0.965,
      useNativeDriver: true,
    }).start();
  };

  const pressOut = () => {
    Animated.spring(scale, {
      friction: 5,
      tension: 230,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  return (
    <MotionPressable
      {...accessibilityProps}
      disabled={disabled}
      onLongPress={onLongPress}
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      style={[style, { transform: [{ scale }] }]}
    >
      {children}
    </MotionPressable>
  );
}

export function AnimatedProgressBar({
  color,
  trackColor,
  value,
}: {
  color: string;
  trackColor: string;
  value: number;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
      toValue: value,
      useNativeDriver: false,
    }).start();
  }, [progress, value]);

  const width = progress.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View style={[styles.progressTrack, { backgroundColor: trackColor }]}>
      <Animated.View style={[styles.progressValue, { backgroundColor: color, width }]} />
    </Animated.View>
  );
}

export function FloatingSparkles() {
  const drift = usePulse({ duration: 1500, maxScale: 1.08 });

  return (
    <Animated.View
      style={[styles.sparkles, { pointerEvents: 'none', transform: [{ scale: drift }] }]}
    >
      <Animated.Text style={[styles.sparkle, styles.sparkleOne]}>✦</Animated.Text>
      <Animated.Text style={[styles.sparkle, styles.sparkleTwo]}>•</Animated.Text>
      <Animated.Text style={[styles.sparkle, styles.sparkleThree]}>✦</Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  progressTrack: {
    borderRadius: 999,
    height: 9,
    overflow: 'hidden',
  },
  progressValue: {
    borderRadius: 999,
    height: '100%',
  },
  sparkles: {
    height: 90,
    position: 'absolute',
    right: 8,
    top: 5,
    width: 100,
  },
  sparkle: {
    color: '#CFEFDF',
    fontSize: 20,
    position: 'absolute',
  },
  sparkleOne: {
    right: 16,
    top: 3,
  },
  sparkleTwo: {
    color: '#9BD2B8',
    fontSize: 25,
    right: 55,
    top: 35,
  },
  sparkleThree: {
    color: '#8AC9AD',
    fontSize: 14,
    right: 4,
    top: 65,
  },
});
