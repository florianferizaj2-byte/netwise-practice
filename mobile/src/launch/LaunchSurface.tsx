import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { StatusBar } from "expo-status-bar";
import { KAOJIANG_GLYPH_PATH } from "./kaojiang-vector";

export const LAUNCH_MOTION = {
  intro: 520,
  opening: 300,
  reducedOpening: 120,
} as const;

export const LAUNCH_PALETTE = {
  light: {
    paper: "#FAF8F5",
    ink: "#292B28",
    secondary: "#64665F",
    ring: "#E8D6CB",
    accent: "#AD3229",
    gold: "#BA8247",
    halo: "#F2E7DF",
  },
  dark: {
    paper: "#111A17",
    ink: "#F6F3ED",
    secondary: "#B8C3BC",
    ring: "#524039",
    accent: "#F08A7B",
    gold: "#D8A06A",
    halo: "#261F1A",
  },
} as const;

const TRACK_WIDTH = 84;
const SHINE_WIDTH = 34;
const orbitDots = [
  { x: -94, y: -41, size: 6, gold: false },
  { x: 81, y: -58, size: 5, gold: true },
  { x: 100, y: 25, size: 7, gold: false },
  { x: -70, y: 72, size: 4, gold: true },
] as const;

export function LaunchLogo({ size = 112 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" accessible={false}>
      <Rect x={0} y={0} width={1024} height={1024} rx={208} fill="#C50606" />
      <Path d={KAOJIANG_GLYPH_PATH} fill="#FFFCF6" fillRule="evenodd" />
    </Svg>
  );
}

type Props = {
  ready: boolean;
  progress: Animated.Value;
  reduceMotion: boolean;
  animationScale?: number;
  dark?: boolean;
  onLayoutReady?: () => void;
  onFinished: () => void;
};

function across(
  value: Animated.Value,
  inputRange: number[],
  outputRange: number[],
) {
  return value.interpolate<number>({ inputRange, outputRange, extrapolate: "clamp" });
}

export function LaunchSurface({
  ready,
  progress,
  reduceMotion,
  animationScale = 1,
  dark = false,
  onLayoutReady,
  onFinished,
}: Props) {
  const palette = LAUNCH_PALETTE[dark ? "dark" : "light"];
  const [height, setHeight] = useState(0);
  const [introDone, setIntroDone] = useState(false);
  const [showWaiting, setShowWaiting] = useState(false);
  const entrance = useRef(new Animated.Value(0)).current;
  const scanner = useRef(new Animated.Value(0)).current;
  const callbacks = useRef({ onFinished, onLayoutReady });
  callbacks.current = { onFinished, onLayoutReady };
  const speed = useRef(Math.min(1.35, Math.max(0.72, animationScale))).current;
  const laidOut = height > 0;

  useEffect(() => {
    if (!laidOut) return;
    const frame = requestAnimationFrame(() => callbacks.current.onLayoutReady?.());
    const waitingTimer = setTimeout(() => setShowWaiting(true), 900);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(waitingTimer);
    };
  }, [laidOut]);

  useEffect(() => {
    if (!laidOut) return;
    if (reduceMotion) {
      entrance.setValue(1);
      setIntroDone(true);
      return;
    }
    const intro = Animated.timing(entrance, {
      toValue: 1,
      duration: Math.round(LAUNCH_MOTION.intro * speed),
      easing: Easing.linear,
      useNativeDriver: true,
      isInteraction: false,
    });
    intro.start(({ finished }) => {
      if (finished) setIntroDone(true);
    });
    return () => intro.stop();
  }, [entrance, laidOut, reduceMotion, speed]);

  useEffect(() => {
    if (!laidOut || reduceMotion) return;
    const scan = Animated.loop(
      Animated.timing(scanner, {
        toValue: 1,
        duration: 1_100,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
        isInteraction: false,
      }),
    );
    scan.start();
    return () => scan.stop();
  }, [laidOut, reduceMotion, scanner]);

  useEffect(() => {
    if (!laidOut || !introDone || !ready) {
      progress.setValue(0);
      return;
    }
    let opening: Animated.CompositeAnimation | undefined;
    const frame = requestAnimationFrame(() => {
      opening = Animated.timing(progress, {
        toValue: 1,
        duration: reduceMotion
          ? LAUNCH_MOTION.reducedOpening
          : Math.round(LAUNCH_MOTION.opening * speed),
        easing: reduceMotion ? Easing.linear : Easing.inOut(Easing.cubic),
        useNativeDriver: true,
        isInteraction: false,
      });
      opening.start(({ finished }) => {
        if (finished) callbacks.current.onFinished();
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      opening?.stop();
    };
  }, [introDone, laidOut, progress, ready, reduceMotion, speed]);

  const onLayout = (event: LayoutChangeEvent) => {
    setHeight(event.nativeEvent.layout.height);
  };
  const anchor = height > 0 && height < 540 ? "39%" : "50%";
  const brandOpacity = across(progress, [0, 0.12, 0.76], [1, 1, 0]);
  const markScale = across(entrance, [0, 0.53, 1], [1, 1.065, 1]);

  return (
    <Animated.View
      testID="launch-splash"
      onLayout={onLayout}
      accessibilityLabel="考匠，正在启动"
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      style={[
        styles.overlay,
        {
          backgroundColor: palette.paper,
          opacity: reduceMotion
            ? across(progress, [0, 1], [1, 0])
            : across(progress, [0, 0.18, 1], [1, 1, 0]),
        },
      ]}
    >
      <StatusBar style={dark ? "light" : "dark"} />
      <Animated.View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.brand,
          !reduceMotion && {
            opacity: brandOpacity,
            transform: [
              { translateY: across(progress, [0, 1], [0, -14]) },
              { scale: across(progress, [0, 1], [1, 0.96]) },
            ],
          },
        ]}
      >
        <View style={[styles.emblem, { top: anchor }]}>
          {!reduceMotion && (
            <>
              <Animated.View
                style={[
                  styles.halo,
                  {
                    backgroundColor: palette.halo,
                    opacity: across(entrance, [0, 0.52, 1], [0, 0.95, 0.7]),
                    transform: [{ scale: across(entrance, [0, 1], [0.48, 1]) }],
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.orbits,
                  {
                    opacity: across(entrance, [0, 0.18, 0.77, 1], [0, 0, 1, 1]),
                    transform: [
                      {
                        rotate: entrance.interpolate<string>({
                          inputRange: [0, 1],
                          outputRange: ["-56deg", "0deg"],
                        }),
                      },
                      { scale: across(entrance, [0.18, 1], [0.68, 1]) },
                    ],
                  },
                ]}
              >
                <View style={[styles.outerRing, { borderColor: palette.ring }]} />
                <View
                  style={[
                    styles.outerRing,
                    styles.arc,
                    { borderTopColor: palette.accent, borderBottomColor: palette.gold },
                  ]}
                />
                <View style={[styles.innerRing, { borderColor: palette.ring }]} />
                {orbitDots.map(({ x, y, size, gold }) => (
                  <View
                    key={x}
                    style={[
                      styles.dot,
                      {
                        left: 104 + x - size / 2,
                        top: 104 + y - size / 2,
                        width: size,
                        height: size,
                        backgroundColor: gold ? palette.gold : palette.accent,
                      },
                    ]}
                  />
                ))}
              </Animated.View>
            </>
          )}
          <Animated.View
            style={[styles.logo, !reduceMotion && { transform: [{ scale: markScale }] }]}
          >
            <LaunchLogo />
            {!reduceMotion && (
              <Animated.View
                style={[
                  styles.glint,
                  {
                    opacity: across(entrance, [0, 0.25, 0.46, 0.82, 1], [0, 0, 1, 0.68, 0]),
                    transform: [
                      { translateX: across(entrance, [0.25, 0.93], [-75, 144]) },
                      { rotate: "27deg" },
                    ],
                  },
                ]}
              >
                <View style={styles.glintCore} />
              </Animated.View>
            )}
          </Animated.View>
        </View>
        <View style={[styles.copy, { top: anchor }]}>
          <Animated.Text
            maxFontSizeMultiplier={1.6}
            style={[
              styles.wordmark,
              { color: palette.ink },
              !reduceMotion && {
                opacity: across(entrance, [0.25, 0.72], [0, 1]),
                transform: [{ translateY: across(entrance, [0.25, 0.78], [12, 0]) }],
              },
            ]}
          >
            考匠
          </Animated.Text>
          <Animated.Text
            maxFontSizeMultiplier={1.6}
            style={[
              styles.tagline,
              { color: palette.secondary },
              !reduceMotion && {
                opacity: across(entrance, [0.41, 1], [0, 1]),
                transform: [{ translateY: across(entrance, [0.41, 1], [8, 0]) }],
              },
            ]}
          >
            更适合你的刷题软件
          </Animated.Text>
        </View>
      </Animated.View>
      <Animated.View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.loading, !reduceMotion && { opacity: brandOpacity }]}
      >
        {showWaiting && !ready && (
          <Text maxFontSizeMultiplier={1.4} style={[styles.waiting, { color: palette.secondary }]}>
            正在准备你的学习空间…
          </Text>
        )}
        {!reduceMotion && (
          <Animated.View
            style={[
              styles.track,
              { backgroundColor: palette.ring, opacity: across(entrance, [0.44, 0.94], [0, 1]) },
            ]}
          >
            <Animated.View
              style={[
                styles.trackLight,
                {
                  backgroundColor: palette.accent,
                  transform: [{ translateX: across(scanner, [0, 1], [-SHINE_WIDTH, TRACK_WIDTH]) }],
                },
              ]}
            />
          </Animated.View>
        )}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 100, overflow: "hidden" },
  brand: { ...StyleSheet.absoluteFill, alignItems: "center" },
  emblem: {
    position: "absolute",
    marginTop: -104,
    width: 208,
    height: 208,
    alignItems: "center",
    justifyContent: "center",
  },
  halo: { position: "absolute", width: 224, height: 224, borderRadius: 112 },
  orbits: { position: "absolute", width: 208, height: 208, alignItems: "center", justifyContent: "center" },
  outerRing: { position: "absolute", width: 196, height: 196, borderWidth: 1, borderRadius: 98 },
  arc: { borderColor: "transparent", transform: [{ rotate: "-24deg" }] },
  innerRing: { position: "absolute", width: 154, height: 154, borderWidth: 1, borderRadius: 77 },
  dot: { position: "absolute", borderRadius: 4 },
  logo: { width: 112, height: 112, borderRadius: 23, overflow: "hidden" },
  glint: {
    position: "absolute",
    top: -29,
    width: 35,
    height: 170,
    alignItems: "center",
    backgroundColor: "rgba(255,252,246,0.12)",
  },
  glintCore: { width: 13, height: "100%", backgroundColor: "rgba(255,252,246,0.16)" },
  copy: {
    position: "absolute",
    marginTop: 113,
    left: 24,
    right: 24,
    alignItems: "center",
    gap: 6,
  },
  wordmark: { fontSize: 32, lineHeight: 44, fontWeight: "700", letterSpacing: 4, textAlign: "center" },
  tagline: { fontSize: 16, lineHeight: 26, letterSpacing: 0.7, textAlign: "center" },
  loading: { position: "absolute", bottom: "7%", left: 24, right: 24, alignItems: "center", gap: 10 },
  waiting: { fontSize: 13, lineHeight: 20, textAlign: "center" },
  track: { width: TRACK_WIDTH, height: 3, borderRadius: 2, overflow: "hidden" },
  trackLight: { width: SHINE_WIDTH, height: 3, borderRadius: 2 },
});
