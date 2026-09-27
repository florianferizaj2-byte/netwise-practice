import { useEffect } from 'react';
import { useTheme } from '../theme';
import { registerWebApp } from '../platform/webApp';

export function PlatformSupport() {
  const { colors, resolvedMode } = useTheme();
  useEffect(() => {
    // Use the visible viewport when Safari's keyboard or address bar changes size.
    const viewport = window.visualViewport;
    const resize = () => {
      if (viewport && viewport.scale !== 1) return; // Preserve pinch zoom.
      const keyboard = !!viewport && window.innerHeight - viewport.height > 150;
      const style = document.documentElement.style;
      style.setProperty('--app-height', `${viewport?.height ?? window.innerHeight}px`);
      style.setProperty('--app-top', `${viewport?.offsetTop ?? 0}px`);
      style.setProperty('--app-bottom-inset', keyboard ? '0px' : 'env(safe-area-inset-bottom, 0px)');
    };
    resize();
    window.addEventListener('resize', resize);
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    void registerWebApp();
    return () => {
      window.removeEventListener('resize', resize);
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
    };
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty('--app-background', colors.background);
    document.documentElement.style.colorScheme = resolvedMode;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors.background);
  }, [colors.background, resolvedMode]);
  return null;
}
