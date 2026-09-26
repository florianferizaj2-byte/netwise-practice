import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bundledQuestions, certificates } from "../server/question-banks/loader.js";
import { createTaxonomyIndex, assertQuestionTaxonomy } from "../server/question-banks/taxonomy.js";
import { createStore } from "../server/store.js";
import { createApp } from "../server/index.js";

const certificate = certificates.find((item) => item.id === "network-engineer");
const questions = bundledQuestions().filter((q) => q.certificates.includes(certificate.id));
const report = JSON.parse(fs.readFileSync(new URL(
  "../server/question-banks/network-engineer/reports/taxonomy-review-20260926.json",
  import.meta.url,
), "utf8"));
const classification = ({ chapter, knowledgeSection, knowledgePoint }) =>
  ({ chapter, knowledgeSection, knowledgePoint });

test("every network question has one canonical path and the reviewed moves are effective", () => {
  const index = createTaxonomyIndex(certificate.taxonomy);
  assert.equal(questions.length, 1182);
  assert.equal(new Set(questions.map((q) => q.id)).size, questions.length);
  for (const q of questions) assertQuestionTaxonomy(q, index);
  const byId = new Map(questions.map((q) => [q.id, q]));
  for (const change of report.changes)
    assert.deepEqual(classification(byId.get(change.id)), change.after, change.id);
  const points = certificate.taxonomy.modules.flatMap((m) => m.sections.flatMap((s) =>
    s.knowledgePoints.map((point) => ({ ...point, chapter: m.name, section: s.name }))));
  for (const point of points) {
    assert.equal(point.questionCount, questions.filter((q) =>
      q.chapter === point.chapter && q.knowledgeSection === point.section && q.knowledgePoint === point.name,
    ).length, point.name);
  }
  assert.equal(byId.get("practice-1").knowledgePoint, "OSI七层模型");
  assert.equal(byId.get("ne-20260923-058").knowledgePoint, "TCP/IP四层模型与映射");
  assert.equal(byId.get("ne-20260923-059").knowledgePoint, "分层原则、协议与数据封装");
  assert.equal(byId.get("practice-21").knowledgePoint, "DHCP");
  assert.equal(byId.get("lastset-general-2026h1-q017").knowledgePoint, "VRRP与网关冗余");
  assert.equal(byId.get("intake-2026-spring-q018").knowledgePoint, "数据链路层流量控制与ARQ");
});

test("duplicate labels, aliases, codes and sibling order are rejected before import", () => {
  for (const label of ["OSI七层模型", "OSI 七层模型", "ｏｓｉ七层模型", "OSI参考模型"]) {
    const taxonomy = structuredClone(certificate.taxonomy);
    taxonomy.modules[0].sections[0].knowledgePoints[0].name = label;
    assert.throws(() => createTaxonomyIndex(taxonomy), /名称或别名重复/);
  }
  const duplicateCode = structuredClone(certificate.taxonomy);
  duplicateCode.modules[0].sections[0].knowledgePoints[1].code = "01.01.01";
  assert.throws(() => createTaxonomyIndex(duplicateCode), /编码重复/);
  const duplicateOrder = structuredClone(certificate.taxonomy);
  duplicateOrder.modules[0].sections[1].order = 1;
  assert.throws(() => createTaxonomyIndex(duplicateOrder), /排序编号无效或重复/);
  const index = createTaxonomyIndex(certificate.taxonomy);
  const original = questions.find((q) => q.id === "practice-1");
  for (const changes of [
    { chapter: "综合布线与网络规划" },
    { knowledgeSection: undefined },
    { knowledgePoint: "OSI模型" },
  ]) assert.throws(() => assertQuestionTaxonomy({ ...original, ...changes }, index), /不在标准目录/);
});

test("shared network stems retain child classifications while veterinary cases stay together", () => {
  const group = questions.filter((q) => q.sharedGroupId === "sealed-morning-en-q71-q75");
  assert.equal(group.length, 5);
  assert.equal(group.find((q) => q.id.endsWith("q071")).chapter, "网络体系结构与TCP/IP");
  assert.equal(group.find((q) => q.id.endsWith("q072")).chapter, "路由与广域网技术");
  assert.equal(group.find((q) => q.id.endsWith("q075")).chapter, "综合布线与网络规划");
  const normalize = (text) => text.replace(/\s+/g, " ").trim();
  const stem = group.find((q) => q.sharedStem).sharedStem;
  assert.ok(group.every((q) => normalize(q.question).startsWith(normalize(stem))));
  const veterinaryGroups = new Map();
  for (const q of bundledQuestions()) {
    if (!q.certificates.includes("veterinary-practitioner") || !q.sharedGroupId) continue;
    if (!veterinaryGroups.has(q.sharedGroupId)) veterinaryGroups.set(q.sharedGroupId, new Set());
    veterinaryGroups.get(q.sharedGroupId).add(q.chapter);
  }
  assert.ok(veterinaryGroups.size > 0);
  assert.ok([...veterinaryGroups.values()].every((chapters) => chapters.size === 1));
});

test("web and mobile catalogs agree after an existing database is upgraded without losing study records", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aceexam-taxonomy-"));
  let store = createStore(directory);
  let app;
  let server;
  t.after(async () => {
    app?.locals.stop();
    if (server) await new Promise((resolve) => server.close(resolve));
    store.db.close();
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("aceexam-taxonomy-"));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const q = store.getQ("practice-1");
  const move = report.changes.find((change) => change.id === q.id);
  store.db.prepare("UPDATE questions SET data=? WHERE id=?").run(
    JSON.stringify({ ...q, ...move.before }), q.id,
  );
  store.recordAttempt(q.id, ["A"], 1800);
  store.setQuestionFavorite("local", q.id, true);
  const attempts = store.allA("local");
  const reviews = store.db.prepare("SELECT * FROM user_reviews").all();
  const mistakes = store.db.prepare("SELECT * FROM user_mistakes").all();
  const expectedTotal = store.allQ().length;
  store.db.close();
  store = createStore(directory);
  assert.equal(store.allQ().length, expectedTotal);
  assert.deepEqual(classification(store.getQ(q.id)), move.after);
  assert.deepEqual(store.allA("local"), attempts);
  assert.deepEqual(store.db.prepare("SELECT * FROM user_reviews").all(), reviews);
  assert.deepEqual(store.db.prepare("SELECT * FROM user_mistakes").all(), mistakes);
  assert.ok(store.favoriteQuestionIds("local").has(q.id));
  assert.equal(store.getQ(q.id).question, q.question);
  assert.deepEqual(store.getQ(q.id).answer, q.answer);

  app = await createApp({ store, withFrontend: false, authRequired: true });
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  // Authenticate/select a certificate so both catalog implementations use the
  // actual three-level network taxonomy rather than the all-certificate mode.
  const registered = await fetch(base + "/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "taxonomy_catalog", password: "taxonomy-test-123" }),
  });
  assert.equal(registered.status, 200);
  const cookie = registered.headers.get("set-cookie").split(";")[0];
  const selected = await fetch(base + "/auth/certificate", {
    method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ certificateId: "network-engineer" }),
  });
  assert.equal(selected.status, 200, await selected.text());
  const getForCertificate = async (url) => {
    const response = await fetch(base + url, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    return response.json();
  };
  const web = await getForCertificate("/dashboard");
  const mobile = await getForCertificate("/practice/catalog");
  assert.equal(mobile.total, 1182);
  assert.equal(mobile.chapters.length, 10);
  assert.equal(mobile.chapters.reduce((sum, chapter) => sum + chapter.questionCount, 0), 1182);
  for (const chapter of mobile.chapters) {
    const webChapter = web.chapters.find((c) => c.name === chapter.name);
    assert.equal(webChapter.total, chapter.questionCount);
    assert.equal(chapter.sections.reduce((sum, s) => sum + s.questionCount, 0), chapter.questionCount);
    for (const section of chapter.sections) {
      const webSection = webChapter.sections.find((s) => s.name === section.name);
      assert.equal(webSection.total, section.questionCount);
      assert.deepEqual(section.knowledgePoints.map((p) => [p.name, p.questionCount]).sort(),
        webSection.knowledgePoints.map((p) => [p.name, p.total]).sort());
    }
  }
  const osi = mobile.chapters.flatMap((c) => c.knowledgePoints).filter((p) => /osi/i.test(p.name));
  assert.deepEqual(osi.map((p) => p.name), ["OSI七层模型"]);
  for (const point of ["OSI七层模型", "TCP/IP四层模型与映射", "分层原则、协议与数据封装"]) {
    const query = new URLSearchParams({ chapter: "网络体系结构与TCP/IP", knowledgeSection: "网络模型与分层", knowledgePoint: point });
    const result = await getForCertificate(`/questions?${query}`);
    assert.deepEqual(result.map((q) => q.id).sort(), questions.filter((q) => q.knowledgePoint === point).map((q) => q.id).sort());
  }
});
