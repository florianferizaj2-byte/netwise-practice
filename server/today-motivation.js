import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const MOTIVATION_CATEGORIES = Object.freeze([
  'starting', 'fast_wrong', 'volume_low_accuracy', 'repeat_wrong', 'improving', 'stable', 'steady',
]);

const catalog = JSON.parse(readFileSync(new URL('./today-motivation-catalog.json', import.meta.url), 'utf8'));
const seenLines = new Set();
for (const category of MOTIVATION_CATEGORIES) {
  const lines = catalog[category];
  if (!Array.isArray(lines) || lines.length < 2) throw new Error(`Invalid motivation category: ${category}`);
  for (const text of lines) {
    const key = typeof text === 'string' && text.normalize('NFKC').replace(/[\p{P}\s]/gu, '');
    if (!key || text !== text.trim() || Array.from(text).length > 9 || seenLines.has(key)) {
      throw new Error(`Invalid or repeated motivation line: ${String(text)}`);
    }
    seenLines.add(key);
  }
  Object.freeze(lines);
}
if (Object.keys(catalog).length !== MOTIVATION_CATEGORIES.length) throw new Error('Unknown motivation category');
export const todayMotivationCatalog = Object.freeze(catalog);

const dayMs = 86_400_000;
const zoneOffsetMs = 8 * 3_600_000;
const localDay = (time) => Math.floor((time + zoneOffsetMs) / dayMs);
const dayStart = (day) => day * dayMs - zoneOffsetMs;
const answered = (attempt) => (Array.isArray(attempt.selected) && attempt.selected.length > 0) ||
  (typeof attempt.response === 'string' && attempt.response.trim() !== '');
const accuracy = (sample) => sample.filter((attempt) => attempt.correct === true).length / sample.length;

function latestQuestions(rows) {
  const questions = new Set();
  const sample = [];
  for (const { attempt } of rows) {
    if (questions.has(attempt.questionId)) continue;
    questions.add(attempt.questionId);
    sample.push(attempt);
    if (sample.length === 20) break;
  }
  return sample;
}

export function classifyTodayMotivation(attempts, { now = Date.now(), certificateId, isSingleChoice = () => false } = {}) {
  now = Number(now);
  const today = localDay(now);
  const recentStart = dayStart(today - 6);
  const priorStart = dayStart(today - 13);
  const rows = [];
  const seenIds = new Set();
  for (const [index, attempt] of attempts.entries()) {
    if (!attempt?.questionId || !answered(attempt) || typeof attempt.correct !== 'boolean') continue;
    if (certificateId && attempt.certificateId && attempt.certificateId !== certificateId) continue;
    const when = Date.parse(attempt.createdAt);
    if (!Number.isFinite(when) || when < priorStart || when > now) continue;
    if (attempt.id && seenIds.has(attempt.id)) continue;
    if (attempt.id) seenIds.add(attempt.id);
    rows.push({ attempt, when, index });
  }
  rows.sort((a, b) => b.when - a.when || b.index - a.index);
  const recentRows = rows.filter(({ when }) => when >= recentStart);

  // Only the latest two answers count here; a later correct answer clears this signal.
  const latestWrong = new Map();
  for (const { attempt } of recentRows) {
    const last = latestWrong.get(attempt.questionId);
    if (!last) latestWrong.set(attempt.questionId, { wrong: !attempt.correct, tested: false });
    else if (!last.tested) {
      if (last.wrong && !attempt.correct) return 'repeat_wrong';
      last.tested = true;
    }
  }

  const recent = latestQuestions(recentRows);
  if (recent.length < 10) return 'starting';

  // Do not infer guessing from speed alone, or compare exam timing to practice.
  const timed = recent.filter((attempt) => attempt.mode === 'practice' &&
    Number.isFinite(attempt.timeMs) && attempt.timeMs >= 250 && attempt.timeMs <= 300_000 &&
    isSingleChoice(attempt.questionId));
  const fastWrong = timed.filter((attempt) => !attempt.correct && attempt.timeMs <= 3_000).length;
  if (timed.length >= 10 && fastWrong >= 4 && fastWrong / timed.length >= 0.4) return 'fast_wrong';

  const rate = accuracy(recent);
  const prior = latestQuestions(rows.filter(({ when }) => when < recentStart));
  if (prior.length >= 10 && rate - accuracy(prior) >= 0.15 - Number.EPSILON) return 'improving';
  if (recent.length >= 16 && rate <= 0.55) return 'volume_low_accuracy';

  const half = Math.floor(recent.length / 2);
  if (rate >= 0.85 && accuracy(recent.slice(0, half)) >= 0.75 && accuracy(recent.slice(half)) >= 0.75) return 'stable';
  return 'steady';
}

export function selectTodayMotivation(attempts, { userId, certificateId, now = Date.now(), isSingleChoice } = {}) {
  const category = classifyTodayMotivation(attempts, { now, certificateId, isSingleChoice });
  const lines = todayMotivationCatalog[category];
  const today = localDay(Number(now));
  const seed = createHash('sha256').update(JSON.stringify([userId ?? '', certificateId ?? '', category])).digest().readUInt32BE(0);
  // Rotate from a different starting point per account/certificate. The same
  // category advances one unique line each day and wraps only after a cycle.
  const index = ((seed + today) % lines.length + lines.length) % lines.length;
  return { category, text: lines[index], day: new Date(today * dayMs).toISOString().slice(0, 10) };
}
