import type { AiQuestionGenerationJob } from './api/client';
export function generationProgress(job: AiQuestionGenerationJob) {
  const raw = job.progress.completed ?? 0;
  const completed = Number.isFinite(raw)
    ? Math.max(0, Math.min(10, Math.floor(raw)))
    : 0;
  return { completed, total: 10, percent: completed * 10 };
}
export function inlineAiGenerationPage(state: {
  tab: string;
  mode: string;
  chapter?: string;
  point?: string;
  library: boolean;
  daily: boolean;
}) {
  return (
    state.tab === 'practice' &&
    state.mode === 'ai' &&
    !state.daily &&
    (state.library || !!(state.chapter && state.point))
  );
}
