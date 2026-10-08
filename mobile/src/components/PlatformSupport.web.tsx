import { useEffect } from 'react';
import { useTheme } from '../theme';
import { registerWebApp } from '../platform/webApp';

export function PlatformSupport() {
  const { colors, resolvedMode } = useTheme();
  useEffect(() => {
    // Let CSS track browser chrome and standalone windows. A visualViewport
    // snapshot can retain Safari's smaller pre-launch height after installing.
    // Only a focused software keyboard needs a measured pixel height.
    const viewport = window.visualViewport;
    const standalone = window.matchMedia('(display-mode: standalone)');
    let frame = 0;
    const resize = () => {
      if (viewport && viewport.scale !== 1) return; // Preserve pinch zoom.
      const root = document.documentElement;
      const focused = document.activeElement;
      const editing = focused instanceof HTMLElement && (
        focused.matches('input:not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea') || focused.isContentEditable
      );
      const keyboard = !!viewport && editing && window.innerHeight - viewport.height > 120;
      root.dataset.appStandalone = String(standalone.matches ||
        !!(navigator as Navigator & { standalone?: boolean }).standalone);
      root.dataset.appKeyboard = keyboard ? 'open' : 'closed';
      const style = root.style;
      style.removeProperty('--app-height');
      style.setProperty('--app-keyboard-height', `${viewport?.height ?? window.innerHeight}px`);
      style.setProperty('--app-top', `${keyboard ? viewport?.offsetTop ?? 0 : 0}px`);
      style.setProperty('--app-bottom-inset', keyboard ? '0px' : 'env(safe-area-inset-bottom, 0px)');
    };
    const scheduleResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(resize);
    };
    resize();
    const windowEvents = ['resize', 'orientationchange', 'pageshow'];
    const documentEvents = ['focusin', 'focusout', 'visibilitychange'];
    windowEvents.forEach((event) => window.addEventListener(event, scheduleResize));
    documentEvents.forEach((event) => document.addEventListener(event, scheduleResize));
    standalone.addEventListener('change', scheduleResize);
    viewport?.addEventListener('resize', scheduleResize);
    viewport?.addEventListener('scroll', scheduleResize);
    void registerWebApp();
    return () => {
      cancelAnimationFrame(frame);
      windowEvents.forEach((event) => window.removeEventListener(event, scheduleResize));
      documentEvents.forEach((event) => document.removeEventListener(event, scheduleResize));
      standalone.removeEventListener('change', scheduleResize);
      viewport?.removeEventListener('resize', scheduleResize);
      viewport?.removeEventListener('scroll', scheduleResize);
    };
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty('--app-background', colors.background);
    document.documentElement.style.setProperty('--app-surface', colors.surface);
    document.documentElement.style.setProperty('--ios-tint', colors.brand);
    document.documentElement.style.setProperty('--ios-chrome', colors.chrome);
    document.documentElement.dataset.appTheme = resolvedMode;
    document.documentElement.style.colorScheme = resolvedMode;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors.background);
  }, [colors, resolvedMode]);
  return null;
}
