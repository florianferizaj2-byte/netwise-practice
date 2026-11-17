import type { OfflinePack, OfflineQuestion } from './offlinePackFormat';
import type { PracticeCatalogResponse } from '../api/client';

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
const chapterName = (question: OfflineQuestion) => question.chapter || '综合知识';
const pointName = (question: OfflineQuestion) => question.knowledgePoint || '综合练习';

export function practiceQuestions(pack: OfflinePack, filter: OfflinePracticeFilter, random = Math.random) {
  const questions = pack.questions.filter((q) =>
    (!filter.chapter || chapterName(q) === filter.chapter) &&
    (!filter.section || q.knowledgeSection === filter.section) &&
    (!filter.point || pointName(q) === filter.point));
  if (filter.random) {
    for (let i = questions.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [questions[i], questions[j]] = [questions[j], questions[i]];
    }
  }
  return questions;
}

export function offlinePracticeCatalog(pack: OfflinePack, answered: ReadonlySet<string>, favoriteCount: number): PracticeCatalogResponse {
  const chapters = new Map<string, Map<string, Map<string, { questionCount: number; attemptedCount: number }>>>();
  let attemptedCount = 0;
  for (const question of pack.questions) {
    const chapter = chapterName(question), section = question.knowledgeSection || '', point = pointName(question);
    const sections = chapters.get(chapter) ?? new Map();
    const points = sections.get(section) ?? new Map();
    const counts = points.get(point) ?? { questionCount: 0, attemptedCount: 0 };
    counts.questionCount++;
    if (answered.has(question.id)) { counts.attemptedCount++; attemptedCount++; }
    points.set(point, counts);
    sections.set(section, points);
    chapters.set(chapter, sections);
  }
  const stats = (questionCount: number, attemptedCount: number) => ({ questionCount, attemptedCount,
    progress: questionCount ? Math.round(attemptedCount / questionCount * 100) : 0 });
  const totals = (rows: { questionCount: number; attemptedCount: number }[]) => stats(
    rows.reduce((total, row) => total + row.questionCount, 0),
    rows.reduce((total, row) => total + row.attemptedCount, 0),
  );
  return { total: pack.questions.length, attemptedCount, favoriteCount, chapters: Array.from(chapters, ([name, sections]) => {
    const groups = Array.from(sections, ([section, points]) => {
      const knowledgePoints = Array.from(points, ([point, counts]) => ({ name: point, knowledgeSection: section || undefined,
        ...stats(counts.questionCount, counts.attemptedCount) }));
      return { name: section, knowledgePoints, ...totals(knowledgePoints) };
    });
    return { name, ...totals(groups), knowledgePoints: groups.flatMap(group => group.knowledgePoints),
      sections: groups.filter(group => group.name) };
  }) };
}
