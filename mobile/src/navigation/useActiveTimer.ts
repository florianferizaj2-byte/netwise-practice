import { useCallback, useEffect, useRef } from 'react';
import { useScreenActive } from './ScreenActivity';

export function useActiveTimer(questionId?: string) {
  const active = useScreenActive();
  const timer = useRef({ questionId, elapsed: 0, started: 0 });
  useEffect(() => {
    if (timer.current.questionId !== questionId)
      timer.current = { questionId, elapsed: 0, started: 0 };
    const current = timer.current;
    if (active && questionId) current.started = Date.now();
    return () => {
      if (current.started) current.elapsed += Date.now() - current.started;
      current.started = 0;
    };
  }, [active, questionId]);
  return useCallback(() => {
    const current = timer.current;
    return Math.min(
      86400000,
      Math.max(
        0,
        current.elapsed + (current.started ? Date.now() - current.started : 0),
      ),
    );
  }, []);
}
