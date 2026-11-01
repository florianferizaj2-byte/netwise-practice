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
  intro: 1_320,
  opening: 860,
  reducedOpening: 160,
} as const;
export const LAUNCH_PALETTE = {
  light: {
    paper: "#FAF8F5",
    ink: "#292B28",
    secondary: "#64665F",
    frame: "#D9D4C9",
  },
  dark: {
    paper: "#111A17",
    ink: "#F6F3ED",
    secondary: "#B8C3BC",
    frame: "#3B4941",
  },
} as const;

/** The current App icon, traced from assets/icon.png; no font glyph or bitmap. */
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
  revealStyle?: "window" | "curtain";
  onLayoutReady?: () => void;
  onFinished: () => void;
};

/** Only transforms and opacity change per frame; every motion uses the native driver. */
export function LaunchSurface({
  ready,
  progress,
  reduceMotion,
  animationScale = 1,
  dark = false,
  revealStyle = "window",
  onLayoutReady,
  onFinished,
}: Props) {
  const palette = LAUNCH_PALETTE[dark ? "dark" : "light"];
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [introDone, setIntroDone] = useState(false);
  const [slow, setSlow] = useState(false);
  const intro = useRef(new Animated.Value(0)).current;
  const text = useRef(new Animated.Value(0)).current;
  const tagline = useRef(new Animated.Value(0)).current;
  const breathing = useRef(new Animated.Value(0)).current;
  const reducedFade = useRef(new Animated.Value(1)).current;
  const callbacks = useRef({ onFinished, onLayoutReady });
  callbacks.current = { onFinished, onLayoutReady };
  const didLayout = useRef(false);
  const openingStarted = useRef(false);
  const speed = useRef(Math.min(1.35, Math.max(0.72, animationScale))).current;

  useEffect(() => {
    if (reduceMotion) {
      intro.setValue(1);
      text.setValue(1);
      tagline.setValue(1);
      setIntroDone(true);
      return;
    }
    const timing = (value: Animated.Value, duration: number, delay = 0) =>
      Animated.timing(value, {
        toValue: 1,
        duration: Math.round(duration * speed),
        delay: Math.round(delay * speed),
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: true,
        isInteraction: false,
      });
    const entrance = Animated.sequence([
      Animated.parallel([
        timing(intro, 920),
        timing(text, 650, 180),
        timing(tagline, 700, 360),
      ]),
      Animated.delay(Math.round(260 * speed)),
    ]);
    entrance.start(({ finished }) => {
      if (finished) setIntroDone(true);
    });
    return () => entrance.stop();
  }, [intro, reduceMotion, speed, tagline, text]);

  useEffect(() => {
    if (reduceMotion) return;
    const breath = Animated.loop(
      Animated.sequence([
        Animated.timing(breathing, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(breathing, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
    );
    breath.start();
    return () => breath.stop();
  }, [breathing, reduceMotion]);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 2400);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!size.width || didLayout.current) return;
    const frame = requestAnimationFrame(() => {
      didLayout.current = true;
      callbacks.current.onLayoutReady?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [size.width]);

  useEffect(() => {
    if (!ready || !introDone || !size.width || openingStarted.current) return;
    let frame: number;
    let animation: Animated.CompositeAnimation | undefined;
    // Let the page's layout and cache subscribers paint before uncovering them.
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        openingStarted.current = true;
        animation = reduceMotion
          ? Animated.timing(reducedFade, {
              toValue: 0,
              duration: LAUNCH_MOTION.reducedOpening,
              useNativeDriver: true,
              isInteraction: false,
            })
          : Animated.timing(progress, {
              toValue: 1,
              duration: Math.round(LAUNCH_MOTION.opening * speed),
              easing: Easing.bezier(0.65, 0, 0.2, 1),
              useNativeDriver: true,
              isInteraction: false,
            });
        animation.start(({ finished }) => {
          if (finished) callbacks.current.onFinished();
        });
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      animation?.stop();
      openingStarted.current = false;
    };
  }, [
    introDone,
    progress,
    ready,
    reducedFade,
    reduceMotion,
    size.width,
    speed,
  ]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((current) =>
      current.width === width && current.height === height
        ? current
        : { width, height },
    );
  };
  const corner = 28,
    halfWidth = size.width / 2 + corner,
    halfHeight = size.height / 2 + corner;
  const anchor = size.height > 0 && size.height < 500 ? "35%" : "50%";
  const yProgress =
    revealStyle === "curtain"
      ? progress.interpolate({
          inputRange: [0, 0.28, 1],
          outputRange: [0, 1, 1],
          extrapolate: "clamp",
        })
      : progress;
  const x = (direction: number) =>
    Animated.multiply(progress, direction * halfWidth);
  const y = (direction: number) =>
    Animated.multiply(yProgress, direction * halfHeight);
  const copyOpacity = progress.interpolate({
    inputRange: [0, 0.12, 0.38, 1],
    outputRange: [1, 1, 0, 0],
    extrapolate: "clamp",
  });

  return (
    <Animated.View
      testID="launch-splash"
      onLayout={onLayout}
      accessibilityLabel="考匠，更适合你的刷题软件"
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      style={[
        styles.overlay,
        {
          opacity: reducedFade,
          backgroundColor: size.width ? "transparent" : palette.paper,
        },
      ]}
    >
      <StatusBar style={dark ? "light" : "dark"} />
      <View
        style={StyleSheet.absoluteFill}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        {reduceMotion ? (
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: palette.paper },
            ]}
          />
        ) : (
          <>
            <Animated.View
              style={[
                styles.panel,
                {
                  backgroundColor: palette.paper,
                  left: -corner,
                  top: -corner,
                  width: size.width + 2 * corner,
                  height: halfHeight,
                  transform: [{ translateY: y(-1) }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.panel,
                {
                  backgroundColor: palette.paper,
                  left: -corner,
                  top: size.height / 2,
                  width: size.width + 2 * corner,
                  height: halfHeight,
                  transform: [{ translateY: y(1) }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.panel,
                {
                  backgroundColor: palette.paper,
                  left: -corner,
                  top: -corner,
                  width: halfWidth,
                  height: size.height + 2 * corner,
                  transform: [{ translateX: x(-1) }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.panel,
                {
                  backgroundColor: palette.paper,
                  left: size.width / 2,
                  top: -corner,
                  width: halfWidth,
                  height: size.height + 2 * corner,
                  transform: [{ translateX: x(1) }],
                },
              ]}
            />
            {([-1, 1] as const).flatMap((dx) =>
              ([-1, 1] as const).map((dy) => (
                <Animated.View
                  key={`${dx}:${dy}`}
                  style={[
                    styles.panel,
                    {
                      left: size.width / 2 - (dx === 1 ? corner : 0),
                      top: size.height / 2 - (dy === 1 ? corner : 0),
                      width: corner,
                      height: corner,
                      transform: [
                        { translateX: x(dx) },
                        { translateY: y(dy) },
                        { scaleX: -dx },
                        { scaleY: -dy },
                      ],
                    },
                  ]}
                >
                  <Svg width={corner} height={corner} viewBox="0 0 28 28">
                    <Path d="M0 0H28A28 28 0 0 0 0 28Z" fill={palette.paper} />
                  </Svg>
                </Animated.View>
              )),
            )}
          </>
        )}
        <Animated.View style={[styles.brandLayer, { opacity: copyOpacity }]}>
          <Animated.View
            style={[
              styles.frame,
              {
                top: anchor,
                borderColor: palette.frame,
                opacity: intro,
                transform: [
                  {
                    scale: Animated.add(
                      intro.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.87, 1],
                      }),
                      Animated.multiply(breathing, 0.018),
                    ),
                  },
                ],
              },
            ]}
          >
            <View
              style={[styles.frameNotch, { backgroundColor: palette.paper }]}
            />
            <View
              style={[
                styles.frameNotchBottom,
                { backgroundColor: palette.paper },
              ]}
            />
          </Animated.View>
          <Animated.View
            style={[
              styles.logo,
              {
                top: anchor,
                transform: [
                  {
                    scale: intro.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.94, 1],
                    }),
                  },
                  {
                    translateY: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -14],
                    }),
                  },
                ],
              },
            ]}
          >
            <LaunchLogo />
          </Animated.View>
          <View style={[styles.copy, { top: anchor }]}>
            <Animated.Text
              maxFontSizeMultiplier={1.6}
              style={[
                styles.wordmark,
                {
                  color: palette.ink,
                  opacity: text,
                  transform: [
                    {
                      translateY: text.interpolate({
                        inputRange: [0, 1],
                        outputRange: [12, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              考匠
            </Animated.Text>
            <Animated.Text
              maxFontSizeMultiplier={1.6}
              style={[
                styles.tagline,
                {
                  color: palette.secondary,
                  opacity: tagline,
                  transform: [
                    {
                      translateY: tagline.interpolate({
                        inputRange: [0, 1],
                        outputRange: [12, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              更适合你的刷题软件
            </Animated.Text>
          </View>
        </Animated.View>
        {slow && !ready && size.height >= 640 && (
          <Text
            maxFontSizeMultiplier={1.4}
            style={[styles.waiting, { color: palette.secondary }]}
          >
            正在准备你的学习空间…
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 100, overflow: "hidden" },
  panel: { position: "absolute" },
  brandLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  frame: {
    position: "absolute",
    top: "50%",
    marginTop: -94,
    width: 188,
    height: 188,
    borderWidth: 1,
    borderRadius: 45,
  },
  frameNotch: { position: "absolute", left: -2, top: 51, width: 4, height: 84 },
  frameNotchBottom: {
    position: "absolute",
    right: -2,
    top: 51,
    width: 4,
    height: 84,
  },
  logo: { position: "absolute", top: "50%", marginTop: -56 },
  copy: {
    position: "absolute",
    marginTop: 121,
    left: 24,
    right: 24,
    alignItems: "center",
    gap: 14,
  },
  wordmark: {
    fontSize: 30,
    lineHeight: 42,
    fontWeight: "700",
    letterSpacing: 5,
    textAlign: "center",
  },
  tagline: {
    fontSize: 18,
    lineHeight: 28,
    letterSpacing: 1.1,
    textAlign: "center",
  },
  waiting: {
    position: "absolute",
    bottom: 46,
    left: 24,
    right: 24,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
});
