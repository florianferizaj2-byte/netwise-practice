import { useEffect, useRef, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
  type GestureResponderEvent,
} from 'react-native';
import { isAppleWeb, useTheme } from '../theme';
import { useScreenActive } from '../navigation/ScreenActivity';
import { playUiSound } from '../audioFeedback';

const MotionPressable = Animated.createAnimatedComponent(Pressable);

type EntranceOptions = {
  delay?: number;
  distance?: number;
};

export function useEntrance({
  delay = 0,
  distance = 16,
}: EntranceOptions = {}) {
  const { animationScale, reduceMotion } = useTheme();
  const translateY = useRef(new Animated.Value(Math.min(distance, 8))).current;
  const active = useScreenActive();

  useEffect(() => {
    if (!active || isAppleWeb || reduceMotion) {
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
  }, [active, animationScale, delay, reduceMotion, translateY]);

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
  const { animationScale, reduceMotion } = useTheme();
  const active = useScreenActive();
  const scale = useRef(new Animated.Value(minScale)).current;

  useEffect(() => {
    if (!active || isAppleWeb || reduceMotion) {
      scale.setValue(minScale);
      return;
    }
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
  }, [active, animationScale, duration, maxScale, minScale, reduceMotion, scale]);

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
  | 'accessibilityHint'
  | 'accessibilityRole'
  | 'accessibilityState'
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
  const opacity = useRef(new Animated.Value(1)).current;
  const flatStyle = isAppleWeb ? StyleSheet.flatten(style) : undefined;
  const touchStyle = isAppleWeb ? {
    minHeight: Math.max(44, typeof flatStyle?.minHeight === 'number' ? flatStyle.minHeight : 0),
    minWidth: Math.max(44, typeof flatStyle?.minWidth === 'number' ? flatStyle.minWidth : 0),
    ...(typeof flatStyle?.width === 'number' ? { width: Math.max(44, flatStyle.width) } : {}),
    ...(typeof flatStyle?.height === 'number' ? { height: Math.max(44, flatStyle.height) } : {}),
  } : undefined;

  const pressIn = () => {
    if (isAppleWeb) { opacity.setValue(0.65); return; }
    Animated.spring(scale, {
      friction: Math.max(4, Math.round(7 * animationScale)),
      tension: Math.round(260 / animationScale),
      toValue: 0.965,
      useNativeDriver: true,
    }).start();
  };

  const pressOut = () => {
    if (isAppleWeb) { opacity.setValue(1); return; }
    Animated.spring(scale, {
      friction: Math.max(4, Math.round(5 * animationScale)),
      tension: Math.round(230 / animationScale),
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  const handlePress = (event: GestureResponderEvent) => {
    if (!disabled) playUiSound();
    onPress?.(event);
  };

  return (
    <MotionPressable
      accessibilityRole="button"
      {...accessibilityProps}
      accessibilityState={{ ...accessibilityProps.accessibilityState, disabled: !!disabled }}
      aria-pressed={isAppleWeb && (!accessibilityProps.accessibilityRole || accessibilityProps.accessibilityRole === 'button') ? accessibilityProps.accessibilityState?.selected : undefined}
      aria-selected={isAppleWeb && accessibilityProps.accessibilityRole === 'tab' ? accessibilityProps.accessibilityState?.selected : undefined}
      aria-checked={isAppleWeb ? accessibilityProps.accessibilityState?.checked : undefined}
      aria-expanded={isAppleWeb ? accessibilityProps.accessibilityState?.expanded : undefined}
      aria-busy={isAppleWeb ? accessibilityProps.accessibilityState?.busy : undefined}
      disabled={disabled}
      onLongPress={onLongPress}
      onPress={handlePress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      style={[style, touchStyle, isAppleWeb ? { opacity: disabled ? flatStyle?.opacity ?? 1 : opacity } : { transform: [{ scale }] }]}
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
  const { animationScale, reduceMotion } = useTheme();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) { progress.setValue(value); return; }
    Animated.timing(progress, {
      duration: Math.max(1, Math.round((isAppleWeb ? 240 : 900) * animationScale)),
      easing: Easing.out(Easing.cubic),
      toValue: value,
      useNativeDriver: false,
    }).start();
  }, [animationScale, progress, reduceMotion, value]);

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
