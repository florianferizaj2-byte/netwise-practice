#!/usr/bin/env node
/**
 * 变式题校验器
 *
 * 用途：AI 依据 blueprint.json 生成新题后，先跑这个脚本，再决定是否并入题库。
 *
 * 用法：
 *   node server/question-banks/ncre-ms-office/variants/check-variants.mjs 候选文件.json
 *   node server/question-banks/ncre-ms-office/variants/check-variants.mjs 候选文件.json --json
 *
 * 候选文件是一个题目数组，字段与题库 JSON 相同（不需要 id 以外的来源字段）。
 * 退出码 0 表示可以并入，1 表示存在阻断问题。
 */
import fs from "node:fs";
import path from "node:path";
import { questionSchema } from "../../../domain.js";
import { bundledQuestions, certificates } from "../../loader.js";

const CERTIFICATE_ID = "ncre-ms-office";
const SIMILARITY_BLOCK = 0.9;
const SIMILARITY_WARN = 0.78;

const file = process.argv[2];
const asJson = process.argv.includes("--json");
if (!file) {
  console.error("用法：node check-variants.mjs <候选文件.json> [--json]");
  process.exit(1);
}

const certificate = certificates.find((item) => item.id === CERTIFICATE_ID);
if (!certificate?.taxonomy) {
  console.error(`找不到 ${CERTIFICATE_ID} 的三级知识目录`);
  process.exit(1);
}

const leaves = new Map();
for (const module of certificate.taxonomy.modules) {
  for (const section of module.sections) {
    for (const point of section.knowledgePoints) {
      leaves.set(`${module.name}\u0000${section.name}\u0000${point.name}`, point);
    }
  }
}

const normalize = (text) => String(text).replace(/[\s，。？?！!、：:；;（）()「」《》""]/g, "");
const bigrams = (text) => {
  const value = normalize(text);
  const grams = new Set();
  for (let i = 0; i < value.length - 1; i += 1) grams.add(value.slice(i, i + 2));
  return grams;
};
const similarity = (a, b) => {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared += 1;
  return shared / (a.size + b.size - shared);
};

const existing = bundledQuestions()
  .filter((question) => question.certificates?.includes(CERTIFICATE_ID))
  .map((question) => ({ id: question.id, stem: question.question, grams: bigrams(question.question) }));
const existingIds = new Set(existing.map((item) => item.id));

let candidates;
try {
  candidates = JSON.parse(fs.readFileSync(file, "utf8"));
} catch (error) {
  console.error(`候选文件无法解析：${error.message}`);
  process.exit(1);
}
if (!Array.isArray(candidates) || !candidates.length) {
  console.error("候选文件必须是非空数组");
  process.exit(1);
}

const blocking = [];
const warnings = [];
const accepted = [];
const seenIds = new Set();
const seenStems = new Map();

for (const [index, raw] of candidates.entries()) {
  const label = raw?.id || `第 ${index + 1} 条`;
  // 与 loader 一致：id、source 等由题库清单注入，schema 本身不含这些字段
  const {
    id, source, sourceLabel, provenance, sourceVerification, certificates: ignored, ...rest
  } = raw ?? {};
  const parsed = questionSchema.safeParse({ ...rest, certificates: [CERTIFICATE_ID] });
  if (!parsed.success) {
    blocking.push({ id: label, reason: "字段校验失败", detail: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") });
    continue;
  }
  const question = parsed.data;
  if (typeof id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    blocking.push({ id: label, reason: "题号不合法", detail: "题号只能由小写字母、数字和单个连字符组成" });
    continue;
  }
  const leafKey = `${question.chapter}\u0000${question.knowledgeSection || ""}\u0000${question.knowledgePoint}`;
  if (!leaves.has(leafKey)) {
    blocking.push({ id, reason: "知识点不在标准目录中", detail: `${question.chapter} / ${question.knowledgeSection || "缺少二级分类"} / ${question.knowledgePoint}` });
    continue;
  }
  if (existingIds.has(id)) {
    blocking.push({ id, reason: "题号与题库已有题目冲突", detail: id });
    continue;
  }
  if (seenIds.has(id)) {
    blocking.push({ id, reason: "候选文件内题号重复", detail: id });
    continue;
  }
  seenIds.add(id);

  const stemKey = normalize(question.question);
  if (seenStems.has(stemKey)) {
    blocking.push({ id, reason: "候选文件内题干重复", detail: seenStems.get(stemKey) });
    continue;
  }
  seenStems.set(stemKey, id);

  const grams = bigrams(question.question);
  let worst = { id: null, score: 0 };
  for (const item of existing) {
    const score = similarity(grams, item.grams);
    if (score > worst.score) worst = { id: item.id, score };
  }
  if (worst.score >= SIMILARITY_BLOCK) {
    blocking.push({ id, reason: "与题库题目高度相似", detail: `${worst.id}（相似度 ${worst.score.toFixed(2)}）` });
    continue;
  }
  if (worst.score >= SIMILARITY_WARN) {
    warnings.push({ id, reason: "与题库题目相近，需人工确认设问角度不同", detail: `${worst.id}（相似度 ${worst.score.toFixed(2)}）` });
  }
  accepted.push({ id, knowledgePoint: question.knowledgePoint, answer: question.answer?.[0] ?? "-" });
}

const answerSpread = { A: 0, B: 0, C: 0, D: 0 };
for (const item of accepted) if (item.answer in answerSpread) answerSpread[item.answer] += 1;
const total = accepted.length;
const skewed = total >= 8 && Object.entries(answerSpread).some(([, count]) => count / total > 0.4);
if (skewed) {
  warnings.push({ id: "整体", reason: "正确项位置分布偏斜", detail: JSON.stringify(answerSpread) });
}

const report = {
  file,
  candidateCount: candidates.length,
  acceptedCount: accepted.length,
  blocking,
  warnings,
  answerSpread,
  ok: blocking.length === 0,
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`候选 ${report.candidateCount} 题，可并入 ${report.acceptedCount} 题`);
  console.log(`正确项分布：A ${answerSpread.A} / B ${answerSpread.B} / C ${answerSpread.C} / D ${answerSpread.D}`);
  if (blocking.length) {
    console.log(`\n阻断 ${blocking.length} 项：`);
    for (const item of blocking) console.log(`  - ${item.id}｜${item.reason}｜${item.detail}`);
  }
  if (warnings.length) {
    console.log(`\n提示 ${warnings.length} 项：`);
    for (const item of warnings) console.log(`  - ${item.id}｜${item.reason}｜${item.detail}`);
  }
  console.log(report.ok ? "\n结论：通过，可以并入题库" : "\n结论：未通过，请先修正阻断项");
}
process.exit(report.ok ? 0 : 1);
