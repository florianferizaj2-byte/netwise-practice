import test from "node:test";
import assert from "node:assert/strict";
import {
  bundledQuestions,
  hasCertificateQuestion,
  bankManifestForCertificate,
  syllabusForCertificate,
} from "../server/question-banks/loader.js";

const BANKS = [
  { id: "hcip-datacom-core", total: 900 },
  { id: "hcip-datacom-advanced", total: 900 },
];
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const rowsFor = (id) =>
  bundledQuestions().filter((q) => hasCertificateQuestion(q, id));

test("HCIP banks keep 900 questions each with full knowledge-point coverage", () => {
  for (const bank of BANKS) {
    const rows = rowsFor(bank.id);
    assert.equal(rows.length, bank.total, bank.id);
    const manifest = bankManifestForCertificate(bank.id);
    const points = manifest.taxonomy.modules.flatMap((m) =>
      m.sections.flatMap((s) => s.knowledgePoints.map((p) => p.name)),
    );
    const covered = new Set(rows.map((q) => q.knowledgePoint));
    const missing = points.filter((name) => !covered.has(name));
    assert.deepEqual(missing, [], `${bank.id} 存在无题知识点`);
  }
});

test("every HCIP question matches its type contract", () => {
  for (const bank of BANKS) {
    for (const q of rowsFor(bank.id)) {
      const keys = Object.keys(q.options).sort();
      if (q.type === "true_false") {
        assert.deepEqual(keys, ["A", "B"], q.id);
        assert.equal(q.options.A, "正确", q.id);
        assert.equal(q.options.B, "错误", q.id);
        assert.equal(q.answer.length, 1, q.id);
      } else {
        assert.ok(
          ["single_choice", "multiple_choice"].includes(q.type),
          `${q.id} 题型异常：${q.type}`,
        );
        assert.deepEqual(keys, ["A", "B", "C", "D"], q.id);
        if (q.type === "single_choice") assert.equal(q.answer.length, 1, q.id);
        else assert.ok(q.answer.length >= 2, `${q.id} 多选答案少于 2 项`);
      }
      assert.ok(q.answer.length > 0, q.id);
      assert.ok(
        q.answer.every((letter) => keys.includes(letter)),
        `${q.id} 答案不在选项内`,
      );
      assert.equal(new Set(q.answer).size, q.answer.length, `${q.id} 答案重复`);
      const texts = Object.values(q.options).map((v) => v.trim().toLowerCase());
      assert.equal(new Set(texts).size, texts.length, `${q.id} 选项重复`);
      assert.ok(
        !texts.some((t) => t.includes("以上都") || t.includes("都不对")),
        `${q.id} 含万能选项`,
      );
      assert.ok(q.question.trim().length >= 10, `${q.id} 题干过短`);
      assert.ok(q.analysis.trim().length >= 30, `${q.id} 解析过短`);
      assert.ok(q.tags.length >= 1 && q.tags.length <= 12, `${q.id} 标签异常`);
      assert.ok(
        ["easy", "medium", "hard"].includes(q.difficulty),
        `${q.id} 难度异常`,
      );
      assert.ok(
        ["single_choice", "multiple_choice", "true_false"].includes(q.type),
        `${q.id} 出现未预期题型`,
      );
    }
  }
});

test("every HCIP question is addressable, classified and traceable", () => {
  for (const bank of BANKS) {
    const rows = rowsFor(bank.id);
    const ids = new Set();
    const manifest = bankManifestForCertificate(bank.id);
    const triples = new Set(
      manifest.taxonomy.modules.flatMap((m) =>
        m.sections.flatMap((s) =>
          s.knowledgePoints.map((p) => `${m.name}/${s.name}/${p.name}`),
        ),
      ),
    );
    const chapters = new Set(manifest.syllabus.modules.map((m) => m.name));
    for (const q of rows) {
      assert.ok(SLUG.test(q.id), `${q.id} 题号不合规`);
      assert.ok(!ids.has(q.id), `${q.id} 题号重复`);
      ids.add(q.id);
      assert.ok(
        triples.has(`${q.chapter}/${q.knowledgeSection}/${q.knowledgePoint}`),
        `${q.id} 分类不在标准目录`,
      );
      assert.ok(chapters.has(q.chapter), `${q.id} 章节不在大纲`);
      assert.match(
        q.provenance?.reviewDigest || "",
        /^[a-f0-9]{64}$/,
        `${q.id} 缺少内容摘要`,
      );
      assert.ok(q.provenance?.locator, `${q.id} 缺少来源定位`);
      assert.ok(q.sourceVerification, `${q.id} 缺少来源说明`);
    }
  }
});

test("HCIP chapter volume reaches at least 90% of the syllabus target", () => {
  for (const bank of BANKS) {
    const rows = rowsFor(bank.id);
    const syllabus = syllabusForCertificate(bank.id);
    const counts = new Map();
    for (const q of rows)
      counts.set(q.chapter, (counts.get(q.chapter) || 0) + 1);
    for (const module of syllabus.modules) {
      const actual = counts.get(module.name) || 0;
      assert.ok(
        actual >= module.targetQuestionCount * 0.9,
        `${bank.id} ${module.name} 仅 ${actual} 题，低于目标 ${module.targetQuestionCount} 的 90%`,
      );
    }
  }
});

test("HCIP answer positions stay balanced enough to resist guessing", () => {
  for (const bank of BANKS) {
    const rows = rowsFor(bank.id).filter((q) => q.type !== "true_false");
    const tally = { A: 0, B: 0, C: 0, D: 0 };
    for (const q of rows)
      for (const letter of q.answer) if (tally[letter] !== undefined) tally[letter] += 1;
    const total = Object.values(tally).reduce((a, b) => a + b, 0);
    for (const [letter, count] of Object.entries(tally)) {
      const share = count / total;
      assert.ok(
        share > 0.18 && share < 0.32,
        `${bank.id} 答案 ${letter} 占比 ${(share * 100).toFixed(1)}%，偏离均衡`,
      );
    }
  }
});
