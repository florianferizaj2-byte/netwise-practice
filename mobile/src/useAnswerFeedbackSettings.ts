import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { configureAnswerFeedback, prepareAnswerFeedback, stopAnswerFeedback } from './answerFeedback';
import { ANSWER_FEEDBACK_KEY, DEFAULT_ANSWER_FEEDBACK, normalizeAnswerFeedback, type AnswerFeedbackSettings } from './answerFeedbackSettings';

export function useAnswerFeedbackSettings() {
  const [answerFeedbackSettings, setSettings] = useState(DEFAULT_ANSWER_FEEDBACK);
  const [answerFeedbackReady, setReady] = useState(false);
  const current = useRef(DEFAULT_ANSWER_FEEDBACK), dirty = useRef(false);
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    let mounted = true;
    // Preload off the answer path, without emitting sound or vibration.
    void prepareAnswerFeedback();
    void AsyncStorage.getItem(ANSWER_FEEDBACK_KEY).then(raw => {
      if (!mounted || dirty.current) return;
      let next = DEFAULT_ANSWER_FEEDBACK;
      try { next = normalizeAnswerFeedback(raw === null ? null : JSON.parse(raw)); } catch { /* Recover corrupt local preferences. */ }
      current.current = next; setSettings(next); configureAnswerFeedback(next);
    }).catch(() => {
      if (mounted && !dirty.current) configureAnswerFeedback(current.current);
    }).finally(() => { if (mounted) setReady(true); });
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') stopAnswerFeedback();
    });
    return () => { mounted = false; subscription.remove(); stopAnswerFeedback(); };
  }, []);
  const setAnswerFeedbackSettings = useCallback((patch: Partial<AnswerFeedbackSettings>) => {
    dirty.current = true;
    const next = normalizeAnswerFeedback({ ...current.current, ...patch });
    current.current = next; configureAnswerFeedback(next); setSettings(next);
    // Serialize writes so rapid switch/volume changes survive a restart in order.
    writes.current = writes.current.catch(() => undefined).then(() => AsyncStorage.setItem(ANSWER_FEEDBACK_KEY, JSON.stringify(next))).catch(() => undefined);
  }, []);
  return { answerFeedbackSettings, answerFeedbackReady, setAnswerFeedbackSettings };
}
