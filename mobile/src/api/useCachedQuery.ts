import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { studyCache } from './client';
import { useScreenActive } from '../navigation/ScreenActivity';

export function useCachedQuery<T>(
  key: string,
  load: (force?: boolean) => Promise<T>,
  enabled = true,
) {
  const active = useScreenActive();
  const loadRef = useRef(load);
  loadRef.current = load;
  const snapshot = useSyncExternalStore(
    useCallback((notify) => studyCache.subscribe(key, notify), [key]),
    useCallback(() => studyCache.snapshot<T>(key), [key]),
  );
  useEffect(() => {
    if (!enabled || !active) return;
    const refresh = () => {
      void loadRef.current().catch(() => undefined);
    };
    refresh();
    return studyCache.subscribe(key, (invalidated) => {
      if (invalidated) refresh();
    });
  }, [active, enabled, key]);
  const refresh = useCallback(
    () => loadRef.current(true).catch(() => undefined),
    [],
  );
  return {
    ...snapshot,
    loading: enabled && snapshot.data === undefined && !snapshot.error,
    refresh,
  };
}
