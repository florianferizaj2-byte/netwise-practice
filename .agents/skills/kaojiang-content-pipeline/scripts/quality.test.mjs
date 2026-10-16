import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { questionSchema, verifyCalculation } from "../../../../server/domain.js";
import { createTaxonomyIndex, assertQuestionTaxonomy } from "../../../../server/question-banks/taxonomy.js";
import { auditBatch, allocate, calculateBlueprint, contentKey, digest, duplicates, normalize, reviewDigest } from "./quality.mjs";

const now = new Date("2026-10-16T10:00:00.000Z");
function fixture() {
  const certificate = { id: "fixture-exam", taxonomy: { schemaVersion: 1, modules: [{ name: "网络基础", order: 1,
    sections: [{ name: "分层原理", order: 1, knowledgePoints: [{ name: "传输层", code: "01.01.01", order: 1, scope: "端到端通信与传输层职责", questionCount: 0 }] }] }] },
    syllabus: { version: "fixture-1", modules: [{ id: "network", name: "网络基础", order: 1, weight: 100, targetQuestionCount: 20 }] } };
  const q = { id: "fixture-new-001", type: "single_choice", question: "关于传输层的基本职责，下列哪项描述正确？",
    options: { A: "提供端到端的进程通信", B: "只负责物理信号传输", C: "只负责链路上的帧校验", D: "规定图像压缩格式" }, answer: ["A"],
    analysis: "传输层为端系统上的进程提供通信服务，物理信号、帧校验及表示格式分别属于其他层的职责。",
    chapter: "网络基础", knowledgeSection: "分层原理", knowledgePoint: "传输层", difficulty: "easy", tags: ["分层"] };
  // All URLs and claimed access in this fixture are synthetic. No network is used.
  const data = { batch: { schemaVersion: 1, runId: "fixture-batch", certificateId: certificate.id,
    createdAt: "2026-10-16T00:00:00.000Z", authorContext: "test-author", examVersion: "fixture-1", newCertificate: false, maxQuestions: 20,
    bank: { id: "fixture-batch", source: "curated_fixture", name: "合成测试批次", category: "syllabus_practice" } },
    questions: [q], sources: [{ id: "scope", title: "Synthetic scope fixture", url: "https://example.invalid/scope", authority: "official", access: "opened",
      checkedAt: "2026-10-16", examVersion: "fixture-1", claims: [{ kind: "scope", summary: "Synthetic scope, not real exam evidence", locator: "fixture section 1" },
        { kind: "weights", summary: "Synthetic weights, not real exam evidence", locator: "fixture section 2" },
        { kind: "question", summary: "Synthetic paper, not real exam evidence", locator: "fixture appendix" }] }],
    provenance: [{ questionId: q.id, sourceIds: ["scope"], locator: "fixture section 1", category: "syllabus_practice", reuse: "original",
      reuseBasis: "Synthetic original fixture for local behavior tests only" }], reviews: [], blueprint: null };
  const adapter = { certificate, existing: [], questionSchema, verifyCalculation, createTaxonomyIndex, assertQuestionTaxonomy };
  const seal = () => {
    data.reviews = data.questions.map((q) => ({ questionId: q.id, digest: reviewDigest(q, data.provenance.find((p) => p.questionId === q.id), data.sources, certificate),
      reviewerContext: "test-reviewer", verdict: "pass", independentAnswer: [...q.answer], blindReasoning: "Synthetic blind solve: transport-layer services connect endpoint processes, then compare the choices.",
      checks: Object.fromEntries(["scope", "answer", "analysis", "distractors", "wording", "source", "classification"].map((k) => [k, true])),
      calculation: { applicable: false, method: "Conceptual reasoning; no numerical calculation", result: "not-applicable", passed: true }, duplicates: [] }));
  };
  seal(); return { data, adapter, seal };
}
const audit = (f) => auditBatch(f.data, f.adapter, now);
test("a reviewed, version-matched candidate passes the real domain and taxonomy validators", () => {
  const result = audit(fixture()); assert.equal(result.ok, true); assert.equal(result.stage, "reviewed"); assert.equal(result.integrated.length, 0);
});
test("empty batches, missing taxonomy and unreviewed candidates fail closed", () => {
  for (const mutate of [(f) => f.data.questions = [], (f) => delete f.adapter.certificate.taxonomy, (f) => f.data.reviews = []]) {
    const f = fixture(); mutate(f); assert.equal(audit(f).ok, false);
  }
});
test("changing the answer, source evidence, node scope or exam blueprint invalidates reviews", () => {
  for (const mutate of [(f) => f.data.questions[0].answer = ["B"], (f) => f.data.sources[0].claims[0].summary += " changed",
    (f) => f.adapter.certificate.taxonomy.modules[0].sections[0].knowledgePoints[0].scope += " changed",
    (f) => f.adapter.certificate.syllabus.examBlueprint = { questionCount: 75 }]) {
    const f = fixture(); mutate(f); assert.ok(audit(f).errors.some((e) => e.code === "review"));
  }
});
test("derived taxonomy questionCount alone does not invalidate a meaning-preserving review", () => {
  const f = fixture(); f.adapter.certificate.taxonomy.modules[0].sections[0].knowledgePoints[0].questionCount = 5;
  assert.equal(audit(f).ok, true);
});
test("snippet-only, stale, future and wrong-version source claims fail even with a freshly signed review", () => {
  for (const mutate of [(s) => s.access = "search_only", (s) => s.checkedAt = "2025-01-01", (s) => s.checkedAt = "2026-10-17", (s) => s.examVersion = "older-version"]) {
    const f = fixture(); mutate(f.data.sources[0]); f.seal(); assert.equal(audit(f).ok, false);
  }
});
test("author self-review and disagreement in the independent answer are rejected", () => {
  const f = fixture(); f.data.reviews[0].reviewerContext = f.data.batch.authorContext; assert.equal(audit(f).ok, false);
  const g = fixture(); g.data.reviews[0].independentAnswer = ["B"]; assert.ok(audit(g).errors.some((e) => e.code === "answer"));
});
test("unknown fields, incomplete diagrams and malformed answers cannot throw past the report", () => {
  for (const mutate of [(q) => q.script = "arbitrary()", (q) => q.question = "根据如下图判断网络中的传输层职责？", (q) => delete q.answer]) {
    const f = fixture(); mutate(f.data.questions[0]); assert.equal(audit(f).ok, false);
  }
});
test("option shuffling is still an exact duplicate; changed correct text is an answer conflict", () => {
  const q = fixture().data.questions[0], other = structuredClone(q); other.id = "existing-fixture";
  other.options = { A: q.options.D, B: q.options.A, C: q.options.B, D: q.options.C }; other.answer = ["B"];
  assert.equal(contentKey(q), contentKey(other)); assert.equal(duplicates([q], [other])[0].kind, "exact");
  other.answer = ["A"]; assert.equal(duplicates([q], [other])[0].kind, "answer_conflict");
});
test("numeric-only variants and cross-certificate copies are found without chapter blocking", () => {
  const q = fixture().data.questions[0]; q.question = "若传输数据包有 4 个，下列哪项描述正确？";
  const old = { ...q, id: "old-fixture", question: "若传输数据包有 5 个，下列哪项描述正确？", chapter: "其他章节", certificates: ["other-exam"] };
  assert.equal(duplicates([q], [old])[0].kind, "number_only_variant");
});
test("normalization preserves operators and decimal points that change a calculation", () => {
  assert.notEqual(normalize("a+b=1.5"), normalize("a-b=15")); assert.notEqual(normalize("x<5"), normalize("x>5"));
});
test("within-batch exact duplicates remain blocking after changing IDs", () => {
  const f = fixture(), q = { ...structuredClone(f.data.questions[0]), id: "fixture-new-002" };
  f.data.questions.push(q); f.data.provenance.push({ ...f.data.provenance[0], questionId: q.id }); f.seal();
  assert.ok(audit(f).errors.some((e) => e.code === "duplicate"));
});
test("unknown and duplicated provenance/review rows cannot silently replace a candidate", () => {
  const f = fixture(); f.data.provenance.push({ ...f.data.provenance[0] }); assert.equal(audit(f).ok, false);
  const g = fixture(); g.data.reviews[0].questionId = "unknown-question"; assert.equal(audit(g).ok, false);
});
test("the real IPv4 checker rejects an incorrect network address answer", () => {
  const f = fixture(), q = f.data.questions[0]; q.question = "IPv4 地址 192.168.1.130/26 所在的网络地址是什么？";
  q.options = { A: "192.168.1.0", B: "192.168.1.128", C: "192.168.1.192", D: "192.168.1.255" }; q.answer = ["A"]; f.seal();
  assert.ok(audit(f).errors.some((e) => e.code === "question" && e.message.includes("计算")));
});
test("unresolved and link-only sources never reach an exportable state", () => {
  for (const mutate of [(f) => f.data.provenance[0].reuse = "link_only", (f) => { f.data.provenance[0].category = "unverified_collection"; f.data.batch.bank.category = "unverified_collection"; }]) {
    const f = fixture(); mutate(f); f.seal(); assert.equal(audit(f).ok, false);
  }
});
test("existing unrelated IDs are blocked; matching integration into the declared bank is idempotent", () => {
  const f = fixture(); f.adapter.existing = [{ ...f.data.questions[0], source: "unrelated_bank", certificates: ["fixture-exam"] }];
  assert.equal(audit(f).ok, false);
  f.adapter.existing[0].source = f.data.batch.bank.source; const report = audit(f);
  assert.equal(report.ok, true); assert.equal(report.stage, "integrated");
});
test("shared cases require every member and contiguous order", () => {
  const f = fixture(); Object.assign(f.data.questions[0], { sharedGroupId: "fixture-case", sharedKind: "stem", sharedStem: "这是合成测试使用的共用题干", sharedOrder: 1 });
  f.data.provenance[0].groupQuestionCount = 2; f.seal(); assert.ok(audit(f).errors.some((e) => e.code === "shared_group"));
});
test("largest-remainder allocation conserves totals including small and zero-weight modules", () => {
  for (const total of [1, 2, 7, 20, 75, 300]) for (const weights of [[15, 20, 35, 10, 10, 5, 5], [0, 1, 99], [1, 1, 1]]) {
    const counts = allocate(weights, total); assert.equal(counts.reduce((s, x) => s + x, 0), total); assert.ok(counts.every(Number.isInteger));
    weights.forEach((w, i) => { if (!w) assert.equal(counts[i], 0); });
  }
  assert.throws(() => allocate([0, 0], 20)); assert.throws(() => allocate([NaN], 20));
});
function blueprint() { return { schemaVersion: 1, certificateId: "fixture-exam", syllabusVersion: "fixture-1", basis: "official",
  explanation: "Synthetic allocation fixture, not real official weights", sourceIds: ["scope"], targetQuestionCount: 20, examQuestionCount: 7,
  modules: [{ id: "first", name: "第一模块", weight: 25 }, { id: "second", name: "第二模块", weight: 75 }], papers: [] }; }
test("official weight calculations require opened, version-matched primary evidence", () => {
  const p = blueprint(), sources = fixture().data.sources; assert.equal(calculateBlueprint(p, sources, now).ok, true);
  sources[0].authority = "third_party"; assert.equal(calculateBlueprint(p, sources, now).ok, false);
  p.modules[1].weight = 70; assert.equal(calculateBlueprint(p, fixture().data.sources, now).ok, false);
});
test("knowledge-point allocation conserves each chapter target and labels the basis separately", () => {
  const p = blueprint(); p.modules[0].knowledgePoints = { basis: "platform", explanation: "Synthetic practice priority only, not official frequency", sourceIds: ["scope"],
    points: [{ code: "01.01.01", name: "知识甲", weight: 40 }, { code: "01.01.02", name: "知识乙", weight: 60 }] };
  const r = calculateBlueprint(p, fixture().data.sources, now); assert.equal(r.ok, true);
  assert.equal(r.modules[0].knowledgePoints.points.reduce((s, x) => s + x.targetQuestionCount, 0), r.modules[0].targetQuestionCount);
  assert.equal(r.modules[0].knowledgePoints.basis, "platform"); assert.equal(r.modules[1].knowledgePointAllocationStatus, "not_configured");
});
test("paper estimates use normalized scores per paper, not concatenated raw question counts", () => {
  const p = blueprint(); p.basis = "past_papers"; delete p.modules[0].weight; delete p.modules[1].weight;
  p.papers = [{ id: "sitting-one", sourceId: "scope", year: 2025, syllabusVersion: "fixture-1", complete: true, totalPoints: 100, sampleWeight: 1,
    questions: [{ sourceQuestionId: "1", contentHash: digest("one"), moduleId: "first", points: 10 }, { sourceQuestionId: "2", contentHash: digest("two"), moduleId: "second", points: 90 }] },
  { id: "sitting-two", sourceId: "scope", year: 2026, syllabusVersion: "fixture-1", complete: true, totalPoints: 10, sampleWeight: 1,
    questions: [{ sourceQuestionId: "1", contentHash: digest("three"), moduleId: "first", points: 9 }, { sourceQuestionId: "2", contentHash: digest("four"), moduleId: "second", points: 1 }] }];
  const r = calculateBlueprint(p, fixture().data.sources, now); assert.equal(r.ok, true); assert.equal(r.modules[0].weight, 50);
  p.papers[1].questions[0].points = 8; assert.equal(calculateBlueprint(p, fixture().data.sources, now).ok, false);
});
test("reprinted copies of one paper cannot inflate the estimated sample", () => {
  const p = blueprint(); p.basis = "past_papers";
  const paper = { id: "one", sourceId: "scope", year: 2025, syllabusVersion: "fixture-1", complete: true, totalPoints: 10,
    questions: [{ sourceQuestionId: "1", contentHash: digest("same-question"), moduleId: "first", points: 10 }] };
  p.papers = [paper, { ...structuredClone(paper), id: "different-site-reprint" }];
  assert.equal(calculateBlueprint(p, fixture().data.sources, now).ok, false);
});
test("CLI init is isolated, check fails on an empty draft, and active bank paths are refused", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kaojiang-skill-test-")), cli = fileURLToPath(new URL("./pipeline.mjs", import.meta.url));
  const root = fileURLToPath(new URL("../../../../", import.meta.url));
  // The command precedes flags. Keep the wrapper explicit to exercise real CLI parsing.
  const command = (name, ...args) => spawnSync(process.execPath, [cli, name, "--root", root, ...args], { encoding: "utf8", windowsHide: true });
  try {
    const r = command("init", "--certificate", "sichuan-upgrading-computer", "--batch", dir); assert.equal(r.status, 0, r.stderr);
    assert.ok(fs.existsSync(path.join(dir, "batch.json"))); assert.equal(command("check", "--batch", dir).status, 1);
    assert.equal(command("prepare", "--batch", dir).status, 1); assert.equal(fs.existsSync(path.join(dir, "prepared")), false);
    assert.equal(command("init", "--certificate", "sichuan-upgrading-computer", "--batch", path.join(root, "server/question-banks/refuse-fixture")).status, 1);
  } finally {
    // This exact mkdtemp path is owned by this test. No shell deletion or user path is involved.
    assert.equal(path.dirname(fs.realpathSync(dir)), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith("kaojiang-skill-test-"));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("CLI check and prepare export a valid fixture without writing an active bank", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kaojiang-skill-positive-"));
  const cli = fileURLToPath(new URL("./pipeline.mjs", import.meta.url)), f = fixture(), server = path.join(dir, "server");
  const write = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof v === "string" ? v : JSON.stringify(v), "utf8"); };
  const actual = (p) => new URL(`../../../../${p}`, import.meta.url).href;
  try {
    write(path.join(dir, "package.json"), { name: "aceexam", type: "module" });
    write(path.join(server, "question-banks/loader.js"), `export const certificates = [${JSON.stringify(f.adapter.certificate)}]; export const bundledQuestions = () => [];`);
    write(path.join(server, "domain.js"), `export * from ${JSON.stringify(actual("server/domain.js"))};`);
    write(path.join(server, "question-banks/taxonomy.js"), `export * from ${JSON.stringify(actual("server/question-banks/taxonomy.js"))};`);
    write(path.join(server, "syllabus.js"), `export * from ${JSON.stringify(actual("server/syllabus.js"))};`);
    const batchDir = path.join(dir, "tmp/batch");
    f.data.batch.createdAt = new Date().toISOString(); f.data.sources[0].checkedAt = new Date().toISOString().slice(0, 10); f.seal();
    for (const [name, value] of Object.entries(f.data)) write(path.join(batchDir, `${name}.json`), value);
    const command = (name) => spawnSync(process.execPath, [cli, name, "--root", dir, "--batch", batchDir], { encoding: "utf8", windowsHide: true });
    const result = command("check"); assert.equal(result.status, 0, result.stderr + result.stdout);
    const prepared = command("prepare"); assert.equal(prepared.status, 0, prepared.stderr + prepared.stdout);
    assert.equal(fs.existsSync(path.join(server, "question-banks/fixture-exam")), false);
    const qs = JSON.parse(fs.readFileSync(path.join(batchDir, "prepared/questions.json"), "utf8"));
    assert.equal(qs.length, 1); assert.equal(qs[0].question, f.data.questions[0].question); assert.ok(qs[0].provenance.reviewDigest);
    assert.equal(command("verify").status, 1, "staging is not real integration");
    f.data.questions[0].answer = ["B"]; write(path.join(batchDir, "questions.json"), f.data.questions);
    assert.equal(command("prepare").status, 1, "stale review must not produce a successful export");
  } finally {
    assert.equal(path.dirname(fs.realpathSync(dir)), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith("kaojiang-skill-positive-"));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
