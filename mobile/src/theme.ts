import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';
export type AnimationSpeed = 'slow' | 'normal' | 'fast';

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceMuted: string;
  brand: string;
  brandDark: string;
  brandSoft: string;
  text: string;
  textMuted: string;
  textFaint: string;
  border: string;
  warning: string;
  warningSoft: string;
  gold: string;
  goldSoft: string;
  white: string;
};

export const lightColors: ThemeColors = {
  background: '#F6F8F7',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF6F1',
  brand: '#177C63',
  brandDark: '#11664F',
  brandSoft: '#D7E9DF',
  text: '#25312D',
  textMuted: '#6F7E76',
  textFaint: '#9AA69F',
  border: '#DCE3DF',
  warning: '#C77771',
  warningSoft: '#FFF1F0',
  gold: '#D99C3D',
  goldSoft: '#FFF6E8',
  white: '#FFFFFF',
};

export const darkColors: ThemeColors = {
  background: '#0D1714',
  surface: '#17231F',
  surfaceMuted: '#20362E',
  brand: '#3AC096',
  brandDark: '#78E0B9',
  brandSoft: '#224B3C',
  text: '#F3F8F5',
  textMuted: '#A9BDB4',
  textFaint: '#71877D',
  border: '#2D473D',
  warning: '#F19A93',
  warningSoft: '#422726',
  gold: '#E4B45E',
  goldSoft: '#41321F',
  white: '#FFFFFF',
};

// Kept as a compatibility export for non-React utility code. Screens use useTheme().
export const colors = lightColors;

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  xxl: 36,
};

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
};

export const shadow = {
  card: {
    shadowColor: '#163A2F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
};

const THEME_MODE_KEY = 'kaojiang-theme-mode';
const ANIMATION_SPEED_KEY = 'kaojiang-animation-speed';

const animationScales: Record<AnimationSpeed, number> = {
  slow: 1.35,
  normal: 1,
  fast: 0.72,
};

type ThemeContextValue = {
  colors: ThemeColors;
  mode: ThemeMode;
  resolvedMode: 'light' | 'dark';
  animationSpeed: AnimationSpeed;
  animationScale: number;
  setMode: (mode: ThemeMode) => void;
  setAnimationSpeed: (speed: AnimationSpeed) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [animationSpeed, setAnimationSpeedState] = useState<AnimationSpeed>('normal');

  useEffect(() => {
    let mounted = true;
    void Promise.all([
      AsyncStorage.getItem(THEME_MODE_KEY),
      AsyncStorage.getItem(ANIMATION_SPEED_KEY),
    ]).then(([storedMode, storedSpeed]) => {
      if (!mounted) return;
      if (storedMode === 'system' || storedMode === 'light' || storedMode === 'dark') {
        setModeState(storedMode);
      }
      if (storedSpeed === 'slow' || storedSpeed === 'normal' || storedSpeed === 'fast') {
        setAnimationSpeedState(storedSpeed);
      }
    }).catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, []);

  const setMode = useCallback((nextMode: ThemeMode) => {
    setModeState(nextMode);
    void AsyncStorage.setItem(THEME_MODE_KEY, nextMode).catch(() => undefined);
  }, []);

  const setAnimationSpeed = useCallback((nextSpeed: AnimationSpeed) => {
    setAnimationSpeedState(nextSpeed);
    void AsyncStorage.setItem(ANIMATION_SPEED_KEY, nextSpeed).catch(() => undefined);
  }, []);

  const resolvedMode = mode === 'system'
    ? (systemScheme === 'dark' ? 'dark' : 'light')
    : mode;

  const value = useMemo<ThemeContextValue>(() => ({
    colors: resolvedMode === 'dark' ? darkColors : lightColors,
    mode,
    resolvedMode,
    animationSpeed,
    animationScale: animationScales[animationSpeed],
    setMode,
    setAnimationSpeed,
  }), [animationSpeed, mode, resolvedMode, setAnimationSpeed, setMode]);

  return createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}

export function useThemedStyles<T>(factory: (theme: ThemeColors) => T) {
  const { colors: themeColors } = useTheme();
  return useMemo(() => factory(themeColors), [factory, themeColors]);
}
