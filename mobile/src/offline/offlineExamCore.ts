import type { OfflinePack, OfflineQuestion } from './offlinePackFormat';
import { gradeOfflineAnswer, type OfflineAnswer } from './offlineStudyCore.ts';

type Unit = OfflineQuestion[];
function units(questions: OfflineQuestion[]) {
  const result: Unit[] = [];
  const groups = new Map<string, Unit>();
  for (const q of questions) {
    if (!q.sharedGroupId) { result.push([q]); continue; }
    let group = groups.get(q.sharedGroupId);
    if (!group) { group = []; groups.set(q.sharedGroupId, group); result.push(group); }
    group.push(q);
  }
  return result;
}
function shuffled<T>(items: T[], random: () => number) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickWhole(pool: Unit[], count: number, random: () => number, strict = false): Unit[] {
  const shuffledPool = shuffled(pool, random);
  const found = new Map<number, Unit[]>([[0, []]]);
  for (const unit of shuffledPool) {
    for (let i = count - unit.length; i >= 0; i--) {
      const prior = found.get(i);
      if (prior && !found.has(i + unit.length)) found.set(i + unit.length, [...prior, unit]);
    }
    if (found.has(count)) return found.get(count)!;
  }
  if (strict) throw new Error('本地题库不足，无法按考试规则组成完整试卷。');
  for (let n = count; n > 0; n--) if (found.has(n)) return found.get(n)!;
  return [];
}

export function buildOfflineExamQuestions(
  pack: OfflinePack,
  requested: number,
  chapters: string[] = [],
  random = Math.random,
): { questions: OfflineQuestion[]; durationMs: number; passingScore: number | null } {
  const range = new Set(chapters);
  const blueprint = range.size === 0 ? pack.exam.blueprint : null;
  if (!Number.isSafeInteger(requested) || requested < 1 || requested > (blueprint ? 1000 : 100))
    throw new Error('请选择合适的试卷题量。');
  const pool = units(pack.questions).filter((unit) => unit.every((q) => q.type !== 'short_answer' &&
    (!range.size || range.has(q.chapter || '综合知识'))));
  const modules = [...pack.exam.modules].sort((a, b) => a.order - b.order);
  const chapterFor = (unit: Unit) => unit.every((q) => q.chapter === unit[0].chapter) ? unit[0].chapter : undefined;
  let chosen: Unit[] = [];
  if (blueprint) {
    if (blueprint.questionCount !== modules.length * blueprint.questionsPerModule)
      throw new Error('学习包的固定试卷规则不完整，请检查更新。');
    for (const module of modules)
      chosen.push(...pickWhole(pool.filter((unit) => chapterFor(unit) === module.name),
        blueprint.questionsPerModule, random, true));
  } else if (range.size) {
    if (requested < range.size) throw new Error('题量不能少于所选章节数。');
    let slots = requested;
    const ordered = shuffled(pool, random).sort((a, b) => a.length - b.length);
    const remaining = new Set(range);
    while (remaining.size) {
      const unit = ordered.find((row) => !chosen.includes(row) && row.length <= slots &&
        row.some((q) => remaining.has(q.chapter || '综合知识')));
      if (!unit) throw new Error('题量不足以覆盖所选章节与完整题组，请增加题量或调整范围。');
      chosen.push(unit);
      slots -= unit.length;
      for (const q of unit) remaining.delete(q.chapter || '综合知识');
    }
    chosen.push(...pickWhole(pool.filter((unit) => !chosen.includes(unit)), slots, random));
  } else if (modules.length && modules.some((module) => module.weight > 0)) {
    const slices = modules.map((module) => ({
      ...module, count: 0, available: pool.filter((unit) => chapterFor(unit) === module.name),
    }));
    const capacity = (list: Unit[]) => list.reduce((sum, unit) => sum + unit.length, 0);
    for (let i = 0; i < requested; i++) {
      const options = slices.filter((slice) => slice.count < capacity(slice.available))
        .sort((a, b) => (b.weight - a.weight) * requested / 100 + a.count - b.count || a.order - b.order);
      if (!options.length) break;
      options[0].count++;
    }
    for (const slice of slices) chosen.push(...pickWhole(slice.available, slice.count, random));
    const slots = requested - capacity(chosen);
    chosen.push(...pickWhole(pool.filter((unit) => !chosen.includes(unit)), slots, random));
  } else {
    chosen = pickWhole(pool, requested, random);
  }
  const questions = shuffled(chosen, random).flat();
  if (!questions.length) throw new Error('本地题库没有足够的适用题目。');
  return {
    questions,
    durationMs: blueprint ? blueprint.durationMinutes * 60_000 : questions.length * pack.exam.secondsPerQuestion * 1000,
    passingScore: blueprint?.passingScore ?? null,
  };
}

export type OfflineExamSession = {
  id: string;
  packVersion: string;
  questions: OfflineQuestion[];
  attemptIds: string[];
  answers: Record<string, string[]>;
  index: number;
  startedAt: number;
  expiresAt: number;
  passingScore: number | null;
  submittedAt?: number;
};
export function createOfflineExam(pack: OfflinePack, packVersion: string, count: number, chapters: string[],
  random: () => number, id: () => string, now: number): OfflineExamSession {
  const { questions, durationMs, passingScore } = buildOfflineExamQuestions(pack, count, chapters, random);
  return { id: id(), packVersion, questions, attemptIds: questions.map(id), answers: {},
    index: 0, startedAt: now, expiresAt: now + durationMs, passingScore };
}
export function scoreOfflineExam(session: OfflineExamSession, now: number) {
  const occurredAt = Math.max(session.startedAt, Math.min(session.submittedAt ?? now, session.expiresAt));
  const attempts: OfflineAnswer[] = [];
  const reviews = session.questions.map((question, index) => {
    const selected = Object.hasOwn(session.answers, question.id) ? session.answers[question.id] : [];
    const correct = !!selected.length && gradeOfflineAnswer(question, selected);
    if (selected.length) attempts.push({
      id: session.attemptIds[index], questionId: question.id, selected, correct, occurredAt,
      timeMs: Math.floor((occurredAt - session.startedAt) / session.questions.length),
      source: 'exam', packVersion: session.packVersion,
    });
    return { question, selected, correct };
  });
  return { score: reviews.filter((row) => row.correct).length, total: reviews.length, reviews, attempts };
}
