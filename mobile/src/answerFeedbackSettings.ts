export type VoiceScenePreference = {
  mode: 'off' | 'fixed' | 'random';
  clips: string[];
};
export type VoiceScenePreferences = Record<string, VoiceScenePreference>;
export type VoicePackPreferences = Record<string, VoiceScenePreferences>;
export function normalizeVoicePreferences(
  value: unknown,
): VoicePackPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: VoicePackPreferences = {};
  for (const [pack, raw] of Object.entries(value).slice(0, 32)) {
    if (
      !/^[a-z0-9][a-z0-9-]{0,47}$/.test(pack) ||
      !raw ||
      typeof raw !== 'object' ||
      Array.isArray(raw)
    )
      continue;
    const scenes: VoiceScenePreferences = {};
    for (const [key, data] of Object.entries(raw).slice(0, 27)) {
      if (!(
        key === 'practice.enter' ||
        key === 'answer.correct' ||
        /^wrong:[1-5]$/.test(key) ||
        (/^streak:\d{1,4}$/.test(key) &&
          Number(key.split(':')[1]) >= 2 &&
          Number(key.split(':')[1]) <= 1000)
      ))
        continue;
      if (!data || typeof data !== 'object' || Array.isArray(data)) continue;
      const row = data as Partial<VoiceScenePreference>;
      if (!['off', 'fixed', 'random'].includes(row.mode ?? '')) continue;
      const clips = Array.isArray(row.clips)
        ? [
            ...new Set(
              row.clips.filter(
                (id): id is string =>
                  typeof id === 'string' && /^[a-f0-9]{64}$/.test(id),
              ),
            ),
          ].slice(0, row.mode === 'fixed' ? 1 : 8)
        : [];
      if (row.mode !== 'off' && !clips.length) continue;
      scenes[key] = {
        mode: row.mode as VoiceScenePreference['mode'],
        clips: row.mode === 'off' ? [] : clips,
      };
    }
    if (Object.keys(scenes).length) result[pack] = scenes;
  }
  return result;
}
export type AnswerSoundStyle = 'soft' | 'crisp' | 'warm';
export type AnswerHapticStrength = 'light' | 'normal' | 'strong';
export type AnswerFeedbackSettings = {
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  volume: number;
  style: AnswerSoundStyle;
  hapticStrength: AnswerHapticStrength;
  voicePackId: string;
  voiceScenes?: VoicePackPreferences;
};
export const ANSWER_FEEDBACK_KEY = 'kaojiang-answer-feedback-v1';
export const DEFAULT_ANSWER_FEEDBACK: AnswerFeedbackSettings = {
  soundEnabled: true,
  hapticsEnabled: true,
  volume: 0.32,
  style: 'soft',
  hapticStrength: 'light',
  voicePackId: 'default',
};
export const ANSWER_HAPTIC_MS: Record<AnswerHapticStrength, number> = {
  light: 16,
  normal: 28,
  strong: 42,
};
export function normalizeAnswerFeedback(
  value: unknown,
): AnswerFeedbackSettings {
  const input =
    value && typeof value === 'object'
      ? (value as Partial<AnswerFeedbackSettings>)
      : {};
  const voiceScenes = normalizeVoicePreferences(input.voiceScenes);
  return {
    ...(Object.keys(voiceScenes).length ? { voiceScenes } : {}),
    voicePackId:
      typeof input.voicePackId === 'string' &&
      /^(default|builtin|[a-z0-9][a-z0-9-]{0,47})$/.test(input.voicePackId)
        ? input.voicePackId
        : 'default',
    soundEnabled:
      typeof input.soundEnabled === 'boolean' ? input.soundEnabled : true,
    hapticsEnabled:
      typeof input.hapticsEnabled === 'boolean' ? input.hapticsEnabled : true,
    volume:
      typeof input.volume === 'number' && Number.isFinite(input.volume)
        ? Math.max(0, Math.min(1, input.volume))
        : 0.32,
    style:
      input.style === 'crisp' || input.style === 'warm' ? input.style : 'soft',
    hapticStrength:
      input.hapticStrength === 'normal' || input.hapticStrength === 'strong'
        ? input.hapticStrength
        : 'light',
  };
}
