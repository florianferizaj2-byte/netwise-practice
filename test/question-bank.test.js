import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  bundledQuestions,
  certificates,
  banksForCertificate,
  syllabusForCertificate,
} from "../server/question-banks/loader.js";
import { createStore } from "../server/store.js";
import { fingerprint } from "../server/domain.js";
import { hasCertificateQuestion } from "../server/certificates.js";
import {
  buildSyllabusProgress,
  sampleExamQuestions,
  stratifiedSample,
} from "../server/syllabus.js";

test("11 source documents are reconciled without missing records or invented answers", () => {
  const report = JSON.parse(
    fs.readFileSync(
      new URL(
        "../server/question-banks/network-engineer/reports/user-collection.json",
        import.meta.url,
      ),
    ),
  );
  const bank = bundledQuestions().filter((q) => q.source === "user_collection");
  assert.equal(report.documents.length, 11);
  assert.equal(report.sourceCount, 550);
  assert.equal(bank.length, 443);
  assert.equal(
    bank.length + report.duplicates.length + report.needsReview.length,
    550,
  );
  assert.equal(new Set(bank.map(fingerprint)).size, bank.length);
  // Source-document chapters and the current study taxonomy are independent.
  const moduleNames = new Set(certificates[0].taxonomy.modules.map((m) => m.name));
  assert.ok(bank.every((q) => moduleNames.has(q.chapter)));
  const references = [
    ...bank.flatMap((q) => q.provenance),
    ...report.duplicates
      .filter((duplicate) => duplicate.manual)
      .flatMap((duplicate) => duplicate.provenance || []),
    ...report.needsReview.flatMap((r) => r.question.provenance),
  ];
  assert.equal(references.length, 550);
  assert.equal(
    new Set(references.map((p) => `${p.file}:${p.questionNumber}`)).size,
    550,
  );
  for (const q of bank) {
    assert.equal(q.source, "user_collection");
    assert.ok(q.answer.every((a) => q.options[a]));
    assert.ok(q.analysis.length > 0);
    assert.ok(hasCertificateQuestion(q, "network-engineer"));
    assert.ok(!hasCertificateQuestion(q, "hcia-datacom"));
  }
  assert.ok(!bank.some((q) => q.id === "collection-c01-q050"));
});

test("manifest catalog discovers the certificate tracks and keeps sources explicit", () => {
  assert.deepEqual(
    certificates.map((item) => item.id),
    [
      "network-engineer",
      "hcia-datacom",
      "ncre-ms-office",
      "veterinary-practitioner",
    ],
  );
  assert.deepEqual(
    banksForCertificate("network-engineer").map((item) => item.source),
    [
      "practice",
      "network_engineer_supplement",
      "user_collection",
      "user_simulation_collection",
      "user_external_2026_h1",
      "user_external_2026_h1_lastset",
    ],
  );
  assert.deepEqual(
    banksForCertificate("hcia-datacom").map((item) => item.source),
    [
      "syllabus_practice",
      "user_recall_collection",
      "user_simulation_collection",
    ],
  );
  assert.deepEqual(
    banksForCertificate("ncre-ms-office").map((item) => item.source),
    ["syllabus_practice", "user_docx_collection"],
  );
  assert.deepEqual(
    banksForCertificate("veterinary-practitioner").map((item) => item.source),
    ["vet_admin_added"],
  );
  const practice = bundledQuestions().find((q) => q.id === "practice-1");
  assert.deepEqual(practice.certificates, ["network-engineer"]);
  const hcia = bundledQuestions().filter((q) =>
    hasCertificateQuestion(q, "hcia-datacom"),
  );
  assert.equal(hcia.length, 400);
  assert.equal(new Set(hcia.map((q) => q.chapter)).size, 22);
  assert.equal(
    hcia.filter((q) => q.source === "syllabus_practice").length,
    220,
  );
  assert.equal(
    hcia.filter((q) => q.source === "user_recall_collection").length,
    89,
  );
  assert.equal(
    hcia.filter((q) => q.source === "user_simulation_collection").length,
    91,
  );
  assert.ok(
    hcia.every((q) => /(?:不属于|非华为)官方真题/.test(q.sourceVerification)),
  );
  const recall = hcia.find((q) => q.id === "hcia-h12-811-recall-019");
  assert.equal(recall.type, "true_false");
  assert.deepEqual(recall.options, { A: "正确", B: "错误" });
  assert.deepEqual(recall.answer, ["B"]);
  assert.equal(
    hcia.find((q) => q.id === "hcia-h12-811-recall-032").type,
    "single_choice",
  );
  const fiveOptions = hcia.find((q) => q.id === "hcia-h12-811-recall-047");
  assert.deepEqual(Object.keys(fiveOptions.options), ["A", "B", "C", "D", "E"]);
  assert.deepEqual(fiveOptions.answer, ["A", "D", "E"]);
  assert.equal(
    hcia.find((q) => q.id === "hcia-h12-811-recall-066").type,
    "single_choice",
  );
  assert.equal(certificates[1].syllabus.version, "V2.0");
  assert.equal(certificates[2].syllabus.examCode, "NCRE 二级 MS Office 高级应用与设计");
  const officeSyllabus = syllabusForCertificate("ncre-ms-office");
  assert.deepEqual(
    officeSyllabus.modules.map((module) => module.name),
    [
      "公共基础知识",
      "Office 应用基础",
      "Word 文档处理",
      "Excel 数据处理",
      "PowerPoint 演示文稿",
    ],
  );
  assert.equal(
    officeSyllabus.modules.reduce((sum, module) => sum + module.weight, 0),
    100,
  );
  assert.ok(
    officeSyllabus.modules
      .find((module) => module.name === "Word 文档处理")
      .knowledgePoints.includes("邮件合并"),
  );
  assert.ok(
    officeSyllabus.modules
      .find((module) => module.name === "Excel 数据处理")
      .knowledgePoints.includes("数据透视表与数据透视图"),
  );
  assert.ok(
    officeSyllabus.modules
      .find((module) => module.name === "PowerPoint 演示文稿")
      .knowledgePoints.includes("幻灯片母版"),
  );
  assert.equal(
    bundledQuestions().filter((q) => hasCertificateQuestion(q, "ncre-ms-office")).length,
    180,
  );
  const veterinaryQuestions = bundledQuestions().filter((q) =>
    hasCertificateQuestion(q, "veterinary-practitioner"),
  );
  assert.equal(veterinaryQuestions.length, 7888);
  assert.ok(veterinaryQuestions.every((q) => q.source === "vet_admin_added"));
  assert.ok(
    veterinaryQuestions.every((q) =>
      ["基础科目", "预防科目", "临床科目", "综合科目"].includes(q.chapter),
    ),
  );
  assert.ok(new Set(veterinaryQuestions.map((q) => q.knowledgePoint)).size > 12);
  const mediaIds = [
    "vet-2009-2022-past-exams-00069",
    "vet-2009-2022-past-exams-00164",
    "vet-2009-2022-past-exams-00686",
    "vet-2009-2022-past-exams-00699",
    "vet-2009-2022-past-exams-00811",
    "vet-2009-2022-past-exams-00812",
    "vet-2009-2022-past-exams-00813",
    "vet-2009-2022-past-exams-00814",
    "vet-2009-2022-past-exams-00815",
    "vet-2009-2022-past-exams-00816",
    "vet-2009-2022-past-exams-00862",
    "vet-2009-2022-past-exams-00863",
    "vet-2009-2022-past-exams-00864",
    "vet-2024-past-exam-00095",
    "vet-2025-preventive-00046",
  ];
  const mediaQuestions = mediaIds.map((id) => veterinaryQuestions.find((q) => q.id === id));
  assert.ok(mediaQuestions.every((q) => q?.images?.length));
  assert.deepEqual(
    mediaQuestions.slice(4, 7).map((q) => q.sharedOrder),
    [1, 2, 3],
  );
  assert.deepEqual(
    mediaQuestions.slice(10, 13).map((q) => q.sharedOrder),
    [1, 2, 3],
  );
});

test("certificate guides retain verified dates, exam facts, and official HTTPS sources", () => {
  const networkEngineer = certificates.find(
    (item) => item.id === "network-engineer",
  );
  const hcia = certificates.find((item) => item.id === "hcia-datacom");
  const veterinary = certificates.find(
    (item) => item.id === "veterinary-practitioner",
  );

  assert.ok(networkEngineer.guide);
  assert.ok(hcia.guide);
  assert.ok(veterinary.guide);
  assert.equal(networkEngineer.guide.verifiedAt, "2026-09-18");
  assert.equal(hcia.guide.verifiedAt, "2026-09-18");
  assert.equal(veterinary.guide.verifiedAt, "2026-09-19");
  assert.ok(
    networkEngineer.guide.schedule.items.some(
      (item) => item.date === "5 月 23 日" && /网络工程师/.test(item.title),
    ),
  );
  assert.ok(
    hcia.guide.facts.some(
      (fact) => fact.label === "考试费用" && /200 美元/.test(fact.value),
    ),
  );
  assert.ok(
    hcia.guide.facts.some(
      (fact) => fact.label === "证书有效期" && /3 年/.test(fact.value),
    ),
  );
  assert.equal(veterinary.syllabus.version, "2025版");
  assert.deepEqual(
    veterinary.syllabus.modules.map((module) => module.name),
    ["基础科目", "预防科目", "临床科目", "综合科目"],
  );
  assert.ok(
    veterinary.guide.facts.some(
      (fact) => fact.label === "考试方式" && /计算机考试/.test(fact.value),
    ),
  );
  for (const certificate of certificates.filter((item) => item.guide)) {
    assert.ok(certificate.guide.sources.length >= 2);
    assert.ok(
      certificate.guide.sources.every((source) =>
        source.url.startsWith("https://"),
      ),
    );
  }
});

test("HCIA H12-811 import report retains source and review information", () => {
  const report = JSON.parse(
    fs.readFileSync(
      new URL(
        "../server/question-banks/hcia-datacom/reports/h12-811-user-provided.json",
        import.meta.url,
      ),
    ),
  );
  assert.equal(report.counts.total, 180);
  assert.equal(report.counts.userProvidedPublicRecalls, 89);
  assert.equal(report.counts.userProvidedOriginalSimulations, 91);
  assert.equal(report.counts.types.true_false, 67);
  assert.equal(report.sourceUrls.length, 10);
  assert.deepEqual(
    report.notedQuestions.map((question) => question.id),
    [24, 38, 39, 80, 84],
  );
  assert.deepEqual(
    report.structuralCorrections.map((question) => question.originalQuestionId),
    [19, 32, 49, 60, 66],
  );
});

test("HCIA syllabus reports coverage and creates weighted exam samples", () => {
  const syllabus = syllabusForCertificate("hcia-datacom");
  const questions = bundledQuestions().filter((q) =>
    hasCertificateQuestion(q, "hcia-datacom"),
  );
  const progress = buildSyllabusProgress(questions, [], syllabus);
  assert.equal(progress.coveredModules, 22);
  assert.equal(progress.completeModules, 22);
  assert.equal(progress.questionCount, 400);
  assert.equal(progress.targetQuestionCount, 220);
  assert.equal(progress.coverage, 1);
  const sample = stratifiedSample(questions, syllabus, 40, () => 0);
  assert.equal(sample.length, 40);
  assert.equal(new Set(sample.map((q) => q.id)).size, 40);
  const count = (chapter) => sample.filter((q) => q.chapter === chapter).length;
  assert.ok(count("IP 地址与配置") >= count("AAA 原理与配置"));
});

test("执兽模拟考试固定四科各抽100题并按总分240分及格", () => {
  const syllabus = syllabusForCertificate("veterinary-practitioner");
  const questions = bundledQuestions().filter((q) =>
    hasCertificateQuestion(q, "veterinary-practitioner"),
  );
  const sample = sampleExamQuestions(questions, syllabus, 400, () => 0);
  assert.equal(sample.length, 400);
  assert.equal(new Set(sample.map((q) => q.id)).size, 400);
  for (const module of syllabus.modules)
    assert.equal(
      sample.filter((q) => q.chapter === module.name).length,
      100,
    );
  assert.equal(syllabus.examBlueprint.passingScore, 240);
  assert.equal(syllabus.examBlueprint.questionsPerModule, 100);
  const selectedGroups = new Map();
  for (const [index, question] of sample.entries()) {
    if (!question.sharedGroupId) continue;
    if (!selectedGroups.has(question.sharedGroupId)) selectedGroups.set(question.sharedGroupId, []);
    selectedGroups.get(question.sharedGroupId).push(index);
  }
  for (const [groupId, indexes] of selectedGroups) {
    const allIndexes = questions
      .map((question, index) => (question.sharedGroupId === groupId ? index : -1))
      .filter((index) => index >= 0);
    assert.equal(indexes.length, allIndexes.length, `共享题组 ${groupId} 被拆分`);
  }
});

test("server initializes the bundled collection idempotently and preserves learning records", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "netwise-bank-"));
  const bundledCount = bundledQuestions().length;
  let store;
  try {
    store = createStore(directory);
    const q = store.getQ("collection-c07-q003");
    assert.equal(q.options.C, "192.168.10.64");
    assert.deepEqual(q.answer, ["C"]);
    assert.equal(store.recordAttempt(q.id, ["C"], 2000).correct, true);
    assert.equal(store.allQ().length, bundledCount);
    store.db.close();
    store = createStore(directory);
    assert.equal(store.allQ().length, bundledCount);
    assert.equal(store.allA().length, 1);
    assert.equal(store.getQ(q.id).provenance[0].questionNumber, 3);
  } finally {
    store?.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
