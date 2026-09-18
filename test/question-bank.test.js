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
import { buildSyllabusProgress, stratifiedSample } from "../server/syllabus.js";

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
  assert.equal(bank.length, 459);
  assert.equal(
    bank.length + report.duplicates.length + report.needsReview.length,
    550,
  );
  assert.equal(new Set(bank.map(fingerprint)).size, bank.length);
  assert.equal(new Set(bank.map((q) => q.chapter)).size, 11);
  const references = [
    ...bank.flatMap((q) => q.provenance),
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

test("manifest catalog discovers certificates and keeps HCIA V2.0 sources explicit", () => {
  assert.deepEqual(
    certificates.map((item) => item.id),
    ["network-engineer", "hcia-datacom"],
  );
  assert.deepEqual(
    banksForCertificate("network-engineer").map((item) => item.source),
    ["practice", "user_collection"],
  );
  assert.deepEqual(
    banksForCertificate("hcia-datacom").map((item) => item.source),
    [
      "syllabus_practice",
      "user_recall_collection",
      "user_simulation_collection",
    ],
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
});

test("certificate guides retain verified dates, exam facts, and official HTTPS sources", () => {
  const networkEngineer = certificates.find(
    (item) => item.id === "network-engineer",
  );
  const hcia = certificates.find((item) => item.id === "hcia-datacom");

  assert.ok(networkEngineer.guide);
  assert.ok(hcia.guide);
  assert.equal(networkEngineer.guide.verifiedAt, "2026-09-18");
  assert.equal(hcia.guide.verifiedAt, "2026-09-18");
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
  for (const certificate of certificates) {
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

test("server initializes the bundled collection idempotently and preserves learning records", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "netwise-bank-"));
  let store;
  try {
    store = createStore(directory);
    const q = store.getQ("collection-c07-q003");
    assert.equal(q.options.C, "192.168.10.64");
    assert.deepEqual(q.answer, ["C"]);
    assert.equal(store.recordAttempt(q.id, ["C"], 2000).correct, true);
    assert.equal(store.allQ().length, 906);
    store.db.close();
    store = createStore(directory);
    assert.equal(store.allQ().length, 906);
    assert.equal(store.allA().length, 1);
    assert.equal(store.getQ(q.id).provenance[0].questionNumber, 3);
  } finally {
    store?.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
