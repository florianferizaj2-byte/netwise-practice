import { contentKey, answerText } from "../content-quality/quality.js";
import { questionForCertificate } from "./scopes.js";
import { createTaxonomyIndex } from "./taxonomy.js";

// A production floor, not an official exam weighting or an authoring shortcut.
export const MINIMUM_QUESTIONS_PER_LEAF = 30;
const pathKey = (q) => JSON.stringify([
  q.chapter, q.knowledgeSection || "", q.knowledgePoint,
]);
// Different figures can make otherwise identical verbal prompts different
// problems. Their substantive equivalence still belongs to independent review.
const coverageContentKey = (q) => JSON.stringify([
  contentKey(q), (q.images || []).map((image) => image.src),
]);

/**
 * Enumerate the configured directory, including leaves with no questions.
 * reviewedQuestionIds is trusted input ONLY from a successful, current pipeline
 * check whose integrated payload and review digest still match the loaded bank.
 * A provenance stamp or a parent chapter's count is not review evidence.
 */
export function buildKnowledgeCoverage(
  certificate,
  questions,
  { reviewedQuestionIds = new Set() } = {},
) {
  if (!certificate?.id) throw new Error("缺少证书 ID");
  const taxonomy = certificate.taxonomy;
  if (taxonomy) createTaxonomyIndex(taxonomy, certificate.id);
  const points = (taxonomy?.modules || []).flatMap((module) =>
    module.sections.flatMap((section) => section.knowledgePoints.map((point) => ({
      code: point.code,
      name: point.name,
      chapter: module.name,
      section: section.name,
      scope: point.scope,
      target: MINIMUM_QUESTIONS_PER_LEAF,
      loaded: 0,
      unique: 0,
      reviewed: 0,
    }))),
  );
  const byPath = new Map(points.map((p) => [pathKey({
    chapter: p.chapter, knowledgeSection: p.section, knowledgePoint: p.name,
  }), p]));
  const rows = questions
    .filter((q) => q.certificates?.includes(certificate.id) && q.source !== "ai_generated")
    .map((q) => questionForCertificate(q, certificate.id));
  const unmapped = [];
  const contentGroups = new Map();
  const ids = new Map();
  const conflictingIds = new Set();
  for (const q of rows) {
    if (!q.id) throw new Error("题目缺少稳定 ID");
    const identity = JSON.stringify([coverageContentKey(q), answerText(q), pathKey(q)]);
    if (ids.has(q.id) && ids.get(q.id) !== identity) conflictingIds.add(q.id);
    ids.set(q.id, identity);
  }
  const seenIds = new Set();
  for (const q of rows) {
    if (seenIds.has(q.id) || conflictingIds.has(q.id)) continue;
    seenIds.add(q.id);
    const point = byPath.get(pathKey(q));
    if (!point) {
      unmapped.push({ id: q.id, chapter: q.chapter,
        section: q.knowledgeSection || "", knowledgePoint: q.knowledgePoint });
      continue;
    }
    point.loaded += 1;
    const key = coverageContentKey(q);
    const group = contentGroups.get(key) || [];
    group.push(q);
    contentGroups.set(key, group);
  }
  const duplicates = [];
  for (const group of contentGroups.values()) {
    const paths = new Set(group.map(pathKey));
    const answers = new Set(group.map(answerText));
    const conflict = paths.size !== 1 || answers.size !== 1;
    if (group.length > 1) duplicates.push({
      questionIds: group.map((q) => q.id),
      conflict,
      reason: answers.size > 1 ? "answer_conflict"
        : paths.size > 1 ? "classification_conflict" : "same_content",
    });
    if (conflict) continue;
    const point = byPath.get(pathKey(group[0]));
    point.unique += 1;
    if (group.some((q) => reviewedQuestionIds.has(q.id))) point.reviewed += 1;
  }
  for (const point of points) {
    point.gap = Math.max(0, point.target - point.unique);
    point.reviewedGap = Math.max(0, point.target - point.reviewed);
  }
  const taxonomyMissing = !points.length;
  const hasConflict = conflictingIds.size > 0 || duplicates.some((g) => g.conflict);
  const minimumMet = !taxonomyMissing && !unmapped.length && !hasConflict &&
    points.every((point) => point.gap === 0);
  return {
    certificateId: certificate.id,
    certificateName: certificate.name,
    minimumQuestionsPerLeaf: MINIMUM_QUESTIONS_PER_LEAF,
    taxonomyMissing,
    leafCount: points.length,
    loadedQuestionCount: seenIds.size,
    uniqueQuestionCount: points.reduce((n, p) => n + p.unique, 0),
    reviewedQuestionCount: points.reduce((n, p) => n + p.reviewed, 0),
    zeroQuestionLeaves: points.filter((p) => p.unique === 0).length,
    underMinimumLeaves: points.filter((p) => p.gap > 0).length,
    missingQuestions: points.reduce((n, p) => n + p.gap, 0),
    missingReviewedQuestions: points.reduce((n, p) => n + p.reviewedGap, 0),
    minimumMet,
    reviewedMinimumMet: minimumMet && points.every((p) => p.reviewedGap === 0),
    points,
    unmapped,
    duplicates,
    conflictingIds: [...conflictingIds],
    limitations: [
      "题量是逐叶统计，不从父章节或 tags 重复分摊；共用原题按当前证书的有效分类读取。",
      "复用现有内容指纹检查换序重复；近似题、只换数字及实质语义仍须经过现有批次查重与独立复核。",
      "图片按资源地址区分，alt/caption不增题量；不同地址是否为同图仍须资产及实质重复复核。",
      "未提供当前通过且已接入的复核批次时，reviewed 为 0，不将来源文字或 reviewDigest 字符串当作审核通过。",
      "题量达标不证明考纲零遗漏、操作题能力或专家认证；范围审查另行记录。",
    ],
  };
}
