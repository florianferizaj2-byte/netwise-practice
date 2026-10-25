import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Animated, StyleSheet, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { useTheme } from "../theme";
import { LaunchContext, type LaunchStage } from "./LaunchReadiness";
import { LaunchSurface } from "./LaunchSurface";

// Keep the OS launch screen until the first vector frame has a native layout.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ fade: false });

export const MAX_LAUNCH_WAIT_MS = 5_000;

export function AppLaunch({ children }: { children: ReactNode }) {
  const { reduceMotion, animationScale, resolvedMode } = useTheme();
  const [active, setActive] = useState(true);
  const [stages, setStages] = useState<Partial<Record<LaunchStage, boolean>>>({
    route: false,
    announcement: false,
  });
  const [timedOut, setTimedOut] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const hiddenSystemSplash = useRef(false);
  const report = useCallback((stage: LaunchStage, ready: boolean) => {
    setStages((current) =>
      current[stage] === ready ? current : { ...current, [stage]: ready },
    );
  }, []);
  const context = useMemo(() => ({ active, report }), [active, report]);
  const ready = timedOut || Object.values(stages).every(Boolean);

  useEffect(() => {
    if (!active) return;
    // Slow network/storage may show the existing page skeleton, never trap a launch.
    const timer = setTimeout(() => setTimedOut(true), MAX_LAUNCH_WAIT_MS);
    return () => clearTimeout(timer);
  }, [active]);

  const hideSystemSplash = useCallback(() => {
    if (hiddenSystemSplash.current) return;
    hiddenSystemSplash.current = true;
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  return (
    <LaunchContext.Provider value={context}>
      <View style={styles.root}>
        <Animated.View
          testID="launch-content"
          pointerEvents={active ? "none" : "auto"}
          accessibilityElementsHidden={active}
          importantForAccessibility={active ? "no-hide-descendants" : "auto"}
          style={[
            styles.root,
            active &&
              !reduceMotion && {
                transform: [
                  {
                    scale: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.975, 1],
                    }),
                  },
                ],
              },
          ]}
        >
          {children}
        </Animated.View>
        {active && (
          <LaunchSurface
            ready={ready}
            progress={progress}
            reduceMotion={reduceMotion}
            animationScale={animationScale}
            dark={resolvedMode === "dark"}
            onLayoutReady={hideSystemSplash}
            onFinished={() => setActive(false)}
          />
        )}
      </View>
    </LaunchContext.Provider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
