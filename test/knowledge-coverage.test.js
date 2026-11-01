import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildKnowledgeCoverage, MINIMUM_QUESTIONS_PER_LEAF } from "../server/question-banks/knowledge-coverage.js";
import { classification, digest } from "../server/content-quality/quality.js";
import { managedReportPath } from "../server/content-quality/managed-report.js";

const certificate = (points = ["甲知识点", "空白知识点"]) => ({
  id: "test-cert", name: "测试证书", taxonomy: {
    schemaVersion: 1, modules: [{ name: "章节", order: 1,
      sections: [{ name: "分类", order: 1, knowledgePoints: points.map((name, i) => ({
        name, code: `p-${i + 1}`, order: i + 1, scope: `只覆盖${name}的定义及应用边界`,
      })) }],
    }],
  },
});
const question = (i, extra = {}) => ({ id: `q-${i}`, type: "single_choice",
  question: `独立测试场景 ${i} 的判断结论是什么？`,
  options: { A: `情形${i}`, B: "另一情形", C: "其余情形", D: "条件不成立" },
  answer: ["A"], analysis: "根据本题明确给定的条件作独立判断。",
  chapter: "章节", knowledgeSection: "分类", knowledgePoint: "甲知识点",
  certificates: ["test-cert"], source: "practice", ...extra,
});

test("all configured leaves, including zero-question leaves, have a non-lowerable floor of 30", () => {
  assert.equal(MINIMUM_QUESTIONS_PER_LEAF, 30);
  const r = buildKnowledgeCoverage(certificate(), [question(1)]);
  assert.equal(r.leafCount, 2);
  assert.equal(r.zeroQuestionLeaves, 1);
  assert.equal(r.missingQuestions, 59);
  assert.equal(r.minimumMet, false);
  assert.deepEqual(r.points.map((p) => p.target), [30, 30]);
});
test("29 fails, 30 loaded is distinct from 30 independently verified", () => {
  const rows = Array.from({ length: 30 }, (_, i) => question(i));
  const c = certificate(["甲知识点"]);
  assert.equal(buildKnowledgeCoverage(c, rows.slice(0, 29)).minimumMet, false);
  const loaded = buildKnowledgeCoverage(c, rows);
  assert.equal(loaded.minimumMet, true);
  assert.equal(loaded.reviewedMinimumMet, false);
  assert.equal(loaded.reviewedQuestionCount, 0);
  const reviewed = buildKnowledgeCoverage(c, rows, { reviewedQuestionIds: new Set(rows.map((q) => q.id)) });
  assert.equal(reviewed.reviewedMinimumMet, true);
});
test("option permutations, duplicate IDs, parent counts and tags cannot inflate coverage", () => {
  const original = question(1);
  const shuffled = question(2, { question: original.question,
    options: { A: original.options.B, B: original.options.A, C: original.options.D, D: original.options.C },
    answer: ["B"], tags: ["空白知识点"] });
  const r = buildKnowledgeCoverage(certificate(), [original, original, shuffled]);
  assert.equal(r.points[0].loaded, 2);
  assert.equal(r.points[0].unique, 1);
  assert.equal(r.points[1].unique, 0);
  assert.equal(r.duplicates[0].reason, "same_content");
});
test("answer or classification conflicts do not count toward any leaf", () => {
  const original = question(1);
  const conflict = question(2, { question: original.question, options: original.options, answer: ["B"] });
  const r = buildKnowledgeCoverage(certificate(), [original, conflict]);
  assert.equal(r.uniqueQuestionCount, 0);
  assert.equal(r.duplicates[0].reason, "answer_conflict");
  const moved = { ...original, id: "moved", knowledgePoint: "空白知识点" };
  assert.equal(buildKnowledgeCoverage(certificate(), [original, moved]).uniqueQuestionCount, 0);
});
test("certificate-specific references use the effective path, not the source certificate path", () => {
  const shared = question(1, { chapter: "原证书章节", knowledgeSection: "原分类", knowledgePoint: "原知识点",
    certificates: ["other-cert", "test-cert"], certificateScopes: { "test-cert": {
      chapter: "章节", knowledgeSection: "分类", knowledgePoint: "甲知识点",
    } } });
  const r = buildKnowledgeCoverage(certificate(), [shared]);
  assert.equal(r.points[0].unique, 1);
  assert.equal(r.unmapped.length, 0);
});
test("missing taxonomies and unmapped legacy questions are blockers, not fabricated leaves", () => {
  const missing = buildKnowledgeCoverage({ id: "test-cert", name: "旧目录" }, [question(1)]);
  assert.equal(missing.taxonomyMissing, true);
  assert.equal(missing.leafCount, 0);
  assert.equal(missing.minimumMet, false);
  const unmapped = buildKnowledgeCoverage(certificate(), [question(1, { knowledgePoint: "旧的宽泛分类" })]);
  assert.equal(unmapped.unmapped.length, 1);
  assert.equal(unmapped.uniqueQuestionCount, 0);
});
test("AI user content and other certificates cannot fill the bundled-content floor", () => {
  const r = buildKnowledgeCoverage(certificate(), [question(1, { source: "ai_generated" }),
    question(2, { certificates: ["other-cert"] })]);
  assert.equal(r.loadedQuestionCount, 0);
  assert.equal(r.missingQuestions, 60);
});
test("content identity preserves numerical operators and negation", () => {
  const a = question(1, { question: "给定表达式 a < 1，结论是否成立？" });
  const b = question(2, { question: "给定表达式 a > 1，结论是否成立？", options: a.options });
  assert.equal(buildKnowledgeCoverage(certificate(), [a, b]).points[0].unique, 2);
});
test("different figures remain distinct and duplicate figure problems do not inflate counts", () => {
  const a = question(1, { images: [{ src: "/question-images/a.png", alt: "图甲" }] });
  const b = question(2, { question: a.question, options: a.options,
    images: [{ src: "/question-images/b.png", alt: "图乙" }] });
  const copy = { ...a, id: "figure-copy" };
  assert.equal(buildKnowledgeCoverage(certificate(), [a, b, copy]).points[0].unique, 2);
  const metadataCopies = Array.from({ length: 30 }, (_, i) => ({ ...a, id: `metadata-${i}`,
    images: [{ caption: `说明${i}`, alt: `图片${i}`, src: "/question-images/a.png" }] }));
  assert.equal(buildKnowledgeCoverage(certificate(), metadataCopies).points[0].unique, 1);
  assert.equal(buildKnowledgeCoverage(certificate(), metadataCopies).minimumMet, false);
});
test("review context only ignores derived taxonomy counts, never exam blueprint structure", () => {
  const a = certificate(["甲知识点"]);
  a.syllabus = { examBlueprint: { questionCount: 400 } };
  const b = structuredClone(a);
  b.taxonomy.modules[0].sections[0].knowledgePoints[0].questionCount = 99;
  assert.equal(digest(classification(a)), digest(classification(b)));
  b.syllabus.examBlueprint.questionCount = 200;
  assert.notEqual(digest(classification(a)), digest(classification(b)));
});
test("managed report paths reject junctions leading into source or outside the workspace", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aceexam-coverage-path-"));
  try {
    fs.mkdirSync(path.join(root, "tmp"));
    fs.mkdirSync(path.join(root, "server"));
    fs.symlinkSync(path.join(root, "server"), path.join(root, "tmp", "source-link"), "junction");
    assert.throws(() => managedReportPath(root, "tmp/source-link/report.json"), /reports must resolve/);
    assert.throws(() => managedReportPath(root, "server/report.json"), /reports must resolve/);
    assert.throws(() => managedReportPath(root, "../outside.json"), /reports must resolve/);
    assert.equal(managedReportPath(root, "tmp/nested/report.json"), path.join(fs.realpathSync(root), "tmp/nested/report.json"));
  } finally {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("aceexam-coverage-path-"));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
