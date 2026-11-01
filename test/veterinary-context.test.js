import test from "node:test";
import assert from "node:assert/strict";
import { decorateVeterinarySharedGroups, veterinaryContextIssue, bundledQuestions, bundledQuestionWithdrawals } from "../server/question-banks/loader.js";

test("shared-case inference stops at independent questions and numbering resets", () => {
  const stem = "某测试动物出现甲乙丙三项合成表现，以下小问均指此例";
  const make = (id, index, number, question, analysis = "合成测试解析，不属于实际医疗题目。") => ({
    id, question, analysis, options: { A: "测试甲", B: "测试乙", C: "测试丙", D: "测试丁" },
    source: "synthetic_test", certificates: ["veterinary-practitioner"],
    provenance: [{ file: "synthetic.pdf", sha256: "a".repeat(64), sourceIndex: index, questionNumber: number }],
  });
  const rows = [
    make("context-marker", 1, 1, "这是上一道独立合成测试题。", `上一题的独立解析。(共用题干) ${stem}`),
    make("context-child", 2, 2, "该病例的测试检查应选择哪一项？"),
    make("context-independent", 3, 3, "炎症的基本病理变化不包括哪一项？"),
    make("context-after-boundary", 4, 4, "该病例的另一测试检查应选择哪一项？"),
  ];
  decorateVeterinarySharedGroups(rows);
  assert.equal(rows[1].sharedStem, stem);
  assert.ok(rows[1].question.startsWith(stem));
  assert.equal(rows[2].sharedGroupId, undefined);
  assert.equal(rows[3].sharedGroupId, undefined);
  assert.equal(veterinaryContextIssue(rows[2]), null);
  assert.ok(veterinaryContextIssue(rows[3]));
  const reset = [make("reset-marker", 1, 99, "合成测试上一页的独立题目。", `独立解析。(共用题干) ${stem}`), make("reset-child", 2, 1, "该病例的测试检查应选择哪一项？")];
  decorateVeterinarySharedGroups(reset);
  assert.equal(reset[1].sharedStem, undefined);
  const classified = [
    { ...make("class-first", 10, 10, stem + "。该病例的第一子题。"), chapter: "预防科目", sharedGroupId: "class-case", sharedKind: "stem", sharedStem: stem, sharedOrder: 1 },
    { ...make("class-second", 11, 11, stem + "。该病例的第二子题。"), chapter: "基础科目", sharedGroupId: "class-case", sharedKind: "stem", sharedStem: stem, sharedOrder: 2 },
  ];
  for (const rows of [structuredClone(classified), structuredClone(classified).reverse()]) {
    decorateVeterinarySharedGroups(rows);
    assert.ok(rows.every((q) => q.chapter === "预防科目"));
  }
});

test("deployed veterinary questions are self-contained and withdrawn IDs cannot be reintroduced", () => {
  const questions = bundledQuestions().filter((q) => q.certificates.includes("veterinary-practitioner"));
  const ids = new Set(questions.map((q) => q.id));
  assert.ok(questions.length > 0);
  for (const q of questions) {
    assert.equal(veterinaryContextIssue(q), null, q.id);
    if (q.sharedKind === "stem") {
      assert.ok(q.question.replace(/\s+/g, "").startsWith(q.sharedStem.replace(/\s+/g, "").replace(/[。]+$/, "")), q.id);
    }
  }
  for (const entry of bundledQuestionWithdrawals()) assert.equal(ids.has(entry.questionId), false, entry.questionId);
  const treatment = questions.find((q) => q.id === "vet-2009-2022-past-exams-00231");
  assert.ok(treatment?.sharedStem?.length > 16);
  assert.ok(treatment.question.endsWith("该病的最适治疗方法是( )。"));
  for (const id of ["vet-2009-2022-past-exams-00229", "vet-2009-2022-past-exams-00230"])
    assert.equal(questions.find((q) => q.id === id)?.sharedGroupId, treatment.sharedGroupId);
  for (const id of ["vet-2026-recall-preventive-00035", "vet-2026-recall-preventive-00042", "vet-2026-recall-preventive-00043"]) {
    const independent = questions.find((q) => q.id === id);
    assert.ok(independent);
    assert.equal(independent.sharedStem, undefined);
    assert.equal(independent.images?.length || 0, 0);
  }
  assert.equal(veterinaryContextIssue({ question: "炎症的基本病理变化不包括什么？" }), null);
  assert.ok(veterinaryContextIssue({ question: "该病的最适治疗方法是什么？" }));
  assert.ok(veterinaryContextIssue({ question: "°C,前题遗留温度片段。该病可能的诊断是" }));
  assert.ok(veterinaryContextIssue({ question: "合成病例材料。°C,前题遗留温度片段。该病可能的诊断是", sharedStem: "合成病例材料" }));
});
