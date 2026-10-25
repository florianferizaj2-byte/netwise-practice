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
import { androidMotion } from '../android-design-tokens';

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
  const opacity = useRef(new Animated.Value(1)).current;
  const active = useScreenActive();

  useEffect(() => {
    if (!active || isAppleWeb || reduceMotion) {
      translateY.setValue(0);
      opacity.setValue(1);
      return;
    }
    translateY.setValue(Math.min(distance, 8));
    opacity.setValue(0.96);
    const config = { delay: Math.min(90, Math.round(delay * animationScale)), duration: Math.round(androidMotion.enterMs * animationScale), easing: Easing.out(Easing.cubic), useNativeDriver: true, isInteraction: false };
    const animation = Animated.parallel([
      Animated.timing(translateY, { ...config, toValue: 0 }),
      Animated.timing(opacity, { ...config, toValue: 1 }),
    ]);

    animation.start();
    return () => animation.stop();
  }, [active, animationScale, delay, distance, opacity, reduceMotion, translateY]);

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
  | 'accessibilityHint' | 'accessibilityValue'
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
  const { animationScale, reduceMotion } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const active = useScreenActive();
  const pressAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const flatStyle = StyleSheet.flatten(style);
  const touchStyle = {
    minHeight: Math.max(48, typeof flatStyle?.minHeight === 'number' ? flatStyle.minHeight : 0),
    minWidth: Math.max(48, typeof flatStyle?.minWidth === 'number' ? flatStyle.minWidth : 0),
    ...(typeof flatStyle?.width === 'number' ? { width: Math.max(48, flatStyle.width) } : {}),
    ...(typeof flatStyle?.height === 'number' ? { height: Math.max(48, flatStyle.height) } : {}),
  };

  useEffect(() => {
    if (reduceMotion || disabled || !active) {
      pressAnimation.current?.stop();
      scale.setValue(1);
      opacity.setValue(1);
    }
    return () => pressAnimation.current?.stop();
  }, [active, disabled, opacity, reduceMotion, scale]);

  const pressIn = () => {
    if(reduceMotion)return;
    if (disabled || !active) return;
    if (isAppleWeb) { opacity.setValue(0.65); return; }
    pressAnimation.current?.stop();
    pressAnimation.current = Animated.timing(scale, {
      duration: Math.round(androidMotion.pressInMs * animationScale),
      easing: Easing.out(Easing.quad),
      toValue: androidMotion.pressScale,
      useNativeDriver: true,
    });
    pressAnimation.current.start();
  };

  const pressOut = () => {
    pressAnimation.current?.stop();
    if (reduceMotion || disabled || !active) { scale.setValue(1); opacity.setValue(1); return; }
    if (isAppleWeb) { opacity.setValue(1); return; }
    pressAnimation.current = Animated.timing(scale, {
      duration: Math.round(androidMotion.pressOutMs * animationScale),
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    });
    pressAnimation.current.start();
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
      aria-pressed={!accessibilityProps.accessibilityRole || accessibilityProps.accessibilityRole === 'button' ? accessibilityProps.accessibilityState?.selected : undefined}
      aria-selected={accessibilityProps.accessibilityRole === 'tab' ? accessibilityProps.accessibilityState?.selected : undefined}
      aria-checked={accessibilityProps.accessibilityState?.checked}
      aria-expanded={accessibilityProps.accessibilityState?.expanded}
      aria-busy={accessibilityProps.accessibilityState?.busy}
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
  const active = useScreenActive();
  const progress = useRef(new Animated.Value(0)).current;
  const fraction = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) / 100 : 0;

  useEffect(() => {
    if (reduceMotion || !active) { progress.setValue(fraction); return; }
    const animation = Animated.timing(progress, {
      duration: Math.max(1, Math.round(androidMotion.progressMs * animationScale)),
      easing: Easing.out(Easing.cubic),
      toValue: fraction,
      useNativeDriver: true,
      isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [active, animationScale, fraction, progress, reduceMotion]);

  return (
    <Animated.View
      accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}
      style={[styles.progressTrack, { backgroundColor: trackColor }]}
    >
      <Animated.View
        style={[styles.progressValue, { backgroundColor: color, transform: [{ scaleX: progress }] }]}
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
    width: '100%',
    transformOrigin: 'left center',
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
