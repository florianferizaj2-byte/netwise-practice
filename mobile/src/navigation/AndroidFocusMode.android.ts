import { useId, useLayoutEffect, useSyncExternalStore } from 'react';
import { BackHandler } from 'react-native';
import { useScreenActive } from './ScreenActivity';

// Presentation only: question/exam pages own the full viewport. Inactive cached
// tabs, account switches and unmounts must never leave the navigation hidden.
const owners = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => owners.size > 0;
export const useAndroidFocusModeState = () => useSyncExternalStore(subscribe, snapshot, snapshot);

export function useAndroidFocusMode(focused: boolean, onBack?: () => void) {
  const id = useId(), active = useScreenActive();
  useLayoutEffect(() => {
    if (!focused || !active) return;
    owners.add(id); emit();
    const back = onBack ? BackHandler.addEventListener('hardwareBackPress', () => { onBack(); return true; }) : null;
    return () => { back?.remove(); owners.delete(id); emit(); };
  }, [id, focused, active, onBack]);
}
