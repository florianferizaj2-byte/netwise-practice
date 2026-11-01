import { useMemo } from 'react';
import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native';
import { useTheme as useBaseTheme, type ThemeColors, type IosStyleFactory } from './theme.ts';
import { androidFontSize, androidRadius, androidRadii } from './android-design-tokens';

// Keep the original preference provider and its persisted settings. Only Android
// resolves this presentation layer; /app/ continues to use theme.ts.
export { ThemeProvider } from './theme.ts';
export type { ThemeMode, AnimationSpeed, ThemeColors, IosStyleFactory } from './theme.ts';
export const isAppleWeb = false;
export const systemFont = 'KaojiangSans';
export const lightColors: ThemeColors = {
  background: '#F6F8FC', surface: '#FFFFFF', surfaceMuted: '#F0F4FA',
  brand: '#255FDF', brandDark: '#2052C5', brandSoft: '#EAF1FF',
  text: '#182439', textMuted: '#5F6D82', textFaint: '#637187',
  border: '#E4EAF3', warning: '#C63F48', warningSoft: '#FFF0F0',
  gold: '#965B13', goldSoft: '#FFF4E3', white: '#FFFFFF', action: '#2865EE',
  success: '#177B57', successSoft: '#E9F7F0', chrome: '#FFFFFF', overlay: 'rgba(18,31,51,0.44)',
};
export const darkColors: ThemeColors = {
  background: '#101722', surface: '#1A2535', surfaceMuted: '#233145',
  brand: '#91B8FF', brandDark: '#B2CDFF', brandSoft: '#203A60',
  text: '#F0F5FF', textMuted: '#B1BED1', textFaint: '#9DADC4',
  border: '#34445B', warning: '#FF9CA4', warningSoft: '#432831',
  gold: '#EDBC74', goldSoft: '#3C3224', white: '#FFFFFF', action: '#2865EE',
  success: '#7CDBB2', successSoft: '#1D3A33', chrome: '#1A2535', overlay: 'rgba(0,0,0,0.64)',
};
export const colors = lightColors;
export const spacing = { xs: 4, sm: 8, md: 16, lg: 20, xl: 24, xxl: 32 };
export const radius = androidRadii;
export const shadow = { card: { shadowColor: '#182439', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.025, shadowRadius: 8, elevation: 0 } };

export function useTheme() {
  const base = useBaseTheme();
  return useMemo(() => ({ ...base, colors: base.resolvedMode === 'dark' ? darkColors : lightColors }), [base]);
}

export function useThemedStyles<T>(factory: (theme: ThemeColors) => T, _webOnly?: IosStyleFactory): T {
  const { colors: palette } = useTheme();
  return useMemo(() => Object.fromEntries(Object.entries(factory(palette) as Record<string, ViewStyle & TextStyle>).map(([key, value]) => {
    const style = { ...StyleSheet.flatten(value) };
    // Shared screens use brand as their filled CTA. Keep its white labels
    // readable in dark mode, where brand itself is a lighter link/icon color.
    if (style.backgroundColor === palette.brand) style.backgroundColor = palette.action;
    if (typeof style.borderRadius === 'number') {
      style.borderRadius = androidRadius(style.borderRadius, style.width, style.height);
    }
    if (style.fontSize !== undefined) {
      style.fontFamily ??= systemFont;
      style.fontSize = androidFontSize(style.fontSize);
      if (style.fontWeight && Number(style.fontWeight) > 700) style.fontWeight = '700';
      style.lineHeight = Math.max(style.lineHeight ?? 0, Math.ceil(style.fontSize * (style.fontSize >= 24 ? 1.3 : 1.45)));
      style.includeFontPadding = false;
    }
    return [key, style];
  })) as T, [factory, palette]);
}
