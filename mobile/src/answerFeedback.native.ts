import { AppState, Platform, Vibration } from 'react-native';
import { createAudioPlayer, preload, type AudioPlayer } from 'expo-audio';
import { ANSWER_HAPTIC_MS, normalizeAnswerFeedback, type AnswerFeedbackSettings, type AnswerSoundStyle } from './answerFeedbackSettings';

const sources: Record<AnswerSoundStyle, number> = {
  soft: require('../assets/sounds/answer-correct-soft.wav'),
  crisp: require('../assets/sounds/answer-correct-crisp.wav'),
  warm: require('../assets/sounds/answer-correct-warm.wav'),
};
let settings: AnswerFeedbackSettings | null = null;
let preparation: Promise<void> | null = null;
const players: Partial<Record<AnswerSoundStyle, AudioPlayer>> = {};
let playbackRevision = 0;
const active = () => AppState.currentState === 'active';

export function stopAnswerFeedback() {
  playbackRevision++;
  for (const player of Object.values(players)) {
    try { player?.pause(); } catch { /* Optional feedback cannot block study. */ }
  }
}
export function configureAnswerFeedback(next: AnswerFeedbackSettings) {
  stopAnswerFeedback();
  settings = normalizeAnswerFeedback(next);
  for (const player of Object.values(players)) {
    try { if (player) player.volume = settings.volume; } catch { /* Optional audio. */ }
  }
}
export function prepareAnswerFeedback(): Promise<void> {
  if (preparation) return preparation;
  // Use the existing app audio mode. No recording, audio-focus takeover or
  // background playback session is requested for a 240 ms confirmation.
  preparation = Promise.all((Object.keys(sources) as AnswerSoundStyle[]).map(async style => {
    try {
      await preload(sources[style]);
      const player = createAudioPlayer(sources[style], { updateInterval: 1000 });
      player.volume = settings?.volume ?? 0.32;
      players[style] = player;
    } catch { /* A missing audio device must never prevent answering. */ }
  })).then(() => undefined);
  return preparation;
}
export function playCorrectAnswerFeedback(correct: boolean, isCurrent: () => boolean = () => true) {
  if (correct !== true || !settings || !active() || Platform.OS !== 'android' || !isCurrent()) return;
  if (settings.hapticsEnabled) {
    try { Vibration.vibrate(ANSWER_HAPTIC_MS[settings.hapticStrength], false); } catch { /* No vibrator / disabled by OS. */ }
  }
  if (!settings.soundEnabled || settings.volume <= 0) return;
  const player = players[settings.style];
  // Never queue an old success tone to play later after a screen change.
  if (!player?.isLoaded) { void prepareAnswerFeedback(); return; }
  const revision = ++playbackRevision, started = Date.now();
  const volume = settings.volume;
  try {
    void player.seekTo(0).then(() => {
      if (revision !== playbackRevision || !active() || !isCurrent() || !settings?.soundEnabled || settings.volume <= 0 || Date.now() - started > 250) return;
      try { player.volume = volume; player.play(); } catch { /* Optional audio. */ }
    }).catch(() => undefined);
  } catch { /* Synchronous native errors are optional too. */ }
}
