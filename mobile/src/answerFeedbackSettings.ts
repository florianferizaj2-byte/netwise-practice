export type AnswerSoundStyle = 'soft' | 'crisp' | 'warm';
export type AnswerHapticStrength = 'light' | 'normal' | 'strong';
export type AnswerFeedbackSettings = {
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  volume: number;
  style: AnswerSoundStyle;
  hapticStrength: AnswerHapticStrength;
};
export const ANSWER_FEEDBACK_KEY = 'kaojiang-answer-feedback-v1';
export const DEFAULT_ANSWER_FEEDBACK: AnswerFeedbackSettings = {
  soundEnabled: true, hapticsEnabled: true, volume: 0.32, style: 'soft', hapticStrength: 'light',
};
export const ANSWER_HAPTIC_MS: Record<AnswerHapticStrength, number> = { light: 16, normal: 28, strong: 42 };
export function normalizeAnswerFeedback(value: unknown): AnswerFeedbackSettings {
  const input = value && typeof value === 'object' ? value as Partial<AnswerFeedbackSettings> : {};
  return {
    soundEnabled: typeof input.soundEnabled === 'boolean' ? input.soundEnabled : true,
    hapticsEnabled: typeof input.hapticsEnabled === 'boolean' ? input.hapticsEnabled : true,
    volume: typeof input.volume === 'number' && Number.isFinite(input.volume) ? Math.max(0, Math.min(1, input.volume)) : 0.32,
    style: input.style === 'crisp' || input.style === 'warm' ? input.style : 'soft',
    hapticStrength: input.hapticStrength === 'normal' || input.hapticStrength === 'strong' ? input.hapticStrength : 'light',
  };
}
