import crypto from "node:crypto";

export const examPointId = (certificateId, q) =>
  "kp-" +
  crypto
    .createHash("sha256")
    .update(
      JSON.stringify([
        certificateId,
        q.chapter || "综合知识",
        q.knowledgeSection || "",
        q.knowledgePoint || "综合练习",
      ]),
    )
    .digest("hex")
    .slice(0, 24);
export function examUnits(questions) {
  const units = [],
    groups = new Map();
  for (const q of questions) {
    if (!q.sharedGroupId) {
      units.push([q]);
      continue;
    }
    if (!groups.has(q.sharedGroupId)) {
      const unit = [];
      groups.set(q.sharedGroupId, unit);
      units.push(unit);
    }
    groups.get(q.sharedGroupId).push(q);
  }
  return units;
}
export const wholeExamPool = (allQuestions, predicate) =>
  examUnits(allQuestions)
    .filter((unit) => unit.every(predicate))
    .flat();
export function examSelectionCatalog(questions, certificateId) {
  const chapters = new Map();
  for (const q of questions) {
    const chapter = q.chapter || "综合知识",
      id = examPointId(certificateId, q);
    if (!chapters.has(chapter))
      chapters.set(chapter, {
        name: chapter,
        questionCount: 0,
        types: {},
        knowledgePoints: new Map(),
      });
    const row = chapters.get(chapter);
    row.questionCount++;
    row.types[q.type] = (row.types[q.type] || 0) + 1;
    if (!row.knowledgePoints.has(id))
      row.knowledgePoints.set(id, {
        id,
        name: q.knowledgePoint || "综合练习",
        section: q.knowledgeSection || "",
        questionCount: 0,
        types: {},
      });
    const point = row.knowledgePoints.get(id);
    point.questionCount++;
    point.types[q.type] = (point.types[q.type] || 0) + 1;
  }
  return {
    chapters: [...chapters.values()].map((row) => ({
      ...row,
      knowledgePoints: [...row.knowledgePoints.values()],
    })),
  };
}
function shuffle(items, randomInt) {
  const rows = [...items];
  for (let i = rows.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  return rows;
}
// Cover each selected leaf using whole material groups, then fill without splitting a group.
export function sampleKnowledgeExam(
  questions,
  certificateId,
  pointIds,
  requested,
  randomInt = crypto.randomInt,
) {
  const units = shuffle(examUnits(questions), randomInt),
    remaining = new Set(pointIds),
    selected = [];
  const unitPoints = (unit) =>
    new Set(unit.map((q) => examPointId(certificateId, q)));
  while (remaining.size) {
    const candidates = units.filter(
      (unit) =>
        !selected.includes(unit) &&
        [...unitPoints(unit)].some((id) => remaining.has(id)),
    );
    candidates.sort((a, b) => a.length - b.length);
    const next = candidates[0];
    if (!next)
      throw new Error("部分知识点没有符合题型与完整题组要求的题目，请调整范围");
    selected.push(next);
    for (const id of unitPoints(next)) remaining.delete(id);
  }
  const used = selected.reduce((sum, unit) => sum + unit.length, 0),
    target = Math.min(requested, questions.length);
  if (used > target)
    throw new Error("为保留完整题组并覆盖所选知识点，请增加题量或缩小范围");
  const slots = target - used,
    reachable = Array(slots + 1).fill(null);
  reachable[0] = [];
  for (const unit of units.filter((unit) => !selected.includes(unit)))
    for (let total = slots - unit.length; total >= 0; total--) {
      if (reachable[total] !== null && reachable[total + unit.length] === null)
        reachable[total + unit.length] = [...reachable[total], unit];
    }
  let total = slots;
  while (total > 0 && reachable[total] === null) total--;
  return shuffle([...selected, ...reachable[total]], randomInt).flat();
}
