import type { OfflinePack, OfflineQuestion } from './offlinePackFormat';

export const LOCATION_MINIMUM_ANSWERS = 11;
export function shanghaiStudyDay(occurredAt: number): string {
  return new Date(occurredAt + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export type OfflineAnswer = {
  id: string; questionId: string; selected: string[]; response?: string; correct: boolean;
  timeMs: number; occurredAt: number; source: 'practice' | 'exam';
  packVersion: string;
};

export function gradeOfflineAnswer(question: OfflineQuestion, selected: string[], response?: string) {
  if (!selected.length || new Set(selected).size !== selected.length ||
      selected.some((key) => !/^[A-E]$/.test(key)))
    throw new Error('请选择有效答案。');
  if (question.type === 'short_answer') {
    if (selected.length !== 1 || !['A', 'B'].includes(selected[0]) ||
        !response?.trim() || response.length > 5000)
      throw new Error('请填写作答内容，再选择自评结果。');
    return selected[0] === 'A';
  }
  if (selected.some((key) => !Object.hasOwn(question.options, key)) ||
      (question.type !== 'multiple_choice' && selected.length !== 1))
    throw new Error('请选择有效答案。');
  return selected.length === question.answer.length && selected.every((key) => question.answer.includes(key));
}

export type OfflinePracticeFilter = { chapter?: string; section?: string; point?: string; random?: boolean };
export function practiceQuestions(pack: OfflinePack, filter: OfflinePracticeFilter, random = Math.random) {
  const questions = pack.questions.filter((q) =>
    (!filter.chapter || (q.chapter || '综合知识') === filter.chapter) &&
    (!filter.section || q.knowledgeSection === filter.section) &&
    (!filter.point || q.knowledgePoint === filter.point));
  if (filter.random) {
    for (let i = questions.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [questions[i], questions[j]] = [questions[j], questions[i]];
    }
  }
  return questions;
}
