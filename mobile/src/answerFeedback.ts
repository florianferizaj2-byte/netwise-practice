// Mobile website work is deferred; native-only feedback has no browser side effects.
import type { AnswerFeedbackSettings } from './answerFeedbackSettings';
export function configureAnswerFeedback(_settings: AnswerFeedbackSettings) {}
export async function prepareAnswerFeedback() {}
export function stopAnswerFeedback() {}
export function playCorrectAnswerFeedback(_correct: boolean, _isCurrent?: () => boolean, _context?: {scope:string;attemptId:string}) {}

export function previewAnswerSound(_isCurrent?: () => boolean) {}
