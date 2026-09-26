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
import { useTheme } from '../theme';
import { useScreenActive } from '../navigation/ScreenActivity';

const MotionPressable = Animated.createAnimatedComponent(Pressable);

type EntranceOptions = {
  delay?: number;
  distance?: number;
};

export function useEntrance({
  delay = 0,
  distance = 16,
}: EntranceOptions = {}) {
  const { animationScale } = useTheme();
  const translateY = useRef(new Animated.Value(Math.min(distance, 8))).current;
  const active = useScreenActive();

  useEffect(() => {
    if (!active) {
      translateY.setValue(0);
      return;
    }
    const animation = Animated.spring(translateY, {
      delay: Math.min(120, Math.round(delay * animationScale)),
      friction: Math.max(4, Math.round(8 * animationScale)),
      tension: Math.round(62 / animationScale),
      toValue: 0,
      useNativeDriver: true,
    });

    animation.start();
    return () => animation.stop();
  }, [active, animationScale, delay, translateY]);

  return {
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
  const { animationScale } = useTheme();
  const active = useScreenActive();
  const scale = useRef(new Animated.Value(minScale)).current;

  useEffect(() => {
    if (!active) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          duration: Math.max(1, Math.round(duration * animationScale)),
          isInteraction: false,
          easing: Easing.inOut(Easing.sin),
          toValue: maxScale,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          duration: Math.max(1, Math.round(duration * animationScale)),
          isInteraction: false,
          easing: Easing.inOut(Easing.sin),
          toValue: minScale,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [active, animationScale, duration, maxScale, minScale, scale]);

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
  | 'accessibilityLabel'
  | 'accessibilityRole'
  | 'disabled'
  | 'onLongPress'
  | 'onPress'
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
  const { animationScale } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    Animated.spring(scale, {
      friction: Math.max(4, Math.round(7 * animationScale)),
      tension: Math.round(260 / animationScale),
      toValue: 0.965,
      useNativeDriver: true,
    }).start();
  };

  const pressOut = () => {
    Animated.spring(scale, {
      friction: Math.max(4, Math.round(5 * animationScale)),
      tension: Math.round(230 / animationScale),
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
  const { animationScale } = useTheme();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      duration: Math.max(1, Math.round(900 * animationScale)),
      easing: Easing.out(Easing.cubic),
      toValue: value,
      useNativeDriver: false,
    }).start();
  }, [animationScale, progress, value]);

  const width = progress.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View
      style={[styles.progressTrack, { backgroundColor: trackColor }]}
    >
      <Animated.View
        style={[styles.progressValue, { backgroundColor: color, width }]}
      />
    </Animated.View>
  );
}

export function FloatingSparkles() {
  const drift = usePulse({ duration: 1500, maxScale: 1.08 });

  return (
    <Animated.View
      style={[
        styles.sparkles,
        { pointerEvents: 'none', transform: [{ scale: drift }] },
      ]}
    >
      <Animated.Text style={[styles.sparkle, styles.sparkleOne]}>
        ✦
      </Animated.Text>
      <Animated.Text style={[styles.sparkle, styles.sparkleTwo]}>
        •
      </Animated.Text>
      <Animated.Text style={[styles.sparkle, styles.sparkleThree]}>
        ✦
      </Animated.Text>
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
