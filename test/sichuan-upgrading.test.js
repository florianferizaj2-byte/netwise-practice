import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { certificates, bundledQuestions, questionForCertificate } from "../server/question-banks/loader.js";
import { createStore } from "../server/store.js";
import { createApp } from "../server/index.js";

const certificateId = "sichuan-upgrading-computer";
const originalId = "ncre-office-word-001";

test("Sichuan scope reuses one canonical question with separate classifications and a complete focus guide", () => {
  const certificate = certificates.find((entry) => entry.id === certificateId);
  assert.equal(certificate.province, "四川省");
  assert.equal(certificate.subject, "计算机基础");
  assert.deepEqual(certificate.syllabus.modules.map((module) => module.weight), [15, 20, 35, 10, 10, 5, 5]);
  assert.equal(certificate.guide.knowledgeAreas.length, 7);
  assert.ok(certificate.guide.knowledgeAreas.every((area) => area.examFocus.length && area.practiceAdvice));
  const all = bundledQuestions();
  const scoped = all.filter((question) => question.certificates.includes(certificateId));
  const shared = scoped.filter((question) => question.certificateScopes?.[certificateId]);
  // 100 道原创练习 + 45 道共用题 + 61 道西昌学院 2011 真题（用户提供）
  assert.equal(scoped.length, 206);
  assert.equal(shared.length, 45);
  assert.equal(scoped.filter((question) => question.id.startsWith("sc-upgrading-computer-")).length, 100);
  assert.equal(scoped.filter((question) => question.id.startsWith("sc-2011-xichang-")).length, 61);
  assert.equal(all.filter((question) => question.id === originalId).length, 1);
  assert.deepEqual([...new Set(scoped.map((question) => questionForCertificate(question, certificateId).chapter))].sort(), certificate.syllabus.modules.map((module) => module.name).sort());
  for (const question of shared) {
    const view = questionForCertificate(question, certificateId);
    assert.equal(view.id, question.id);
    assert.deepEqual(view.options, question.options);
    assert.deepEqual(view.answer, question.answer);
    assert.equal(view.analysis, question.analysis);
    assert.ok(view.sourceVerification.includes(question.sourceLabel));
    assert.ok(question.certificates.some((id) => id !== certificateId));
  }
  const original = all.find((question) => question.id === originalId);
  assert.equal(questionForCertificate(original, "ncre-ms-office").chapter, "Word 文档处理");
  assert.equal(questionForCertificate(original, certificateId).chapter, "办公自动化");
  assert.equal(original.chapter, "Word 文档处理", "projection does not mutate the original classification");
});

test("Sichuan selection, filtered practice, shared progress, wrong answers and exam all use the selected classification", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aceexam-sichuan-"));
  const store = createStore(directory);
  const app = await createApp({ store, withFrontend: false, authRequired: true });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    await app.locals.stop();
    await new Promise((resolve) => server.close(resolve));
    store.db.close();
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("aceexam-sichuan-"));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let cookie = "";
  const request = async (route, body, method) => {
    const response = await fetch(base + route, {
      method: method || (body ? "POST" : "GET"),
      headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    assert.equal(response.status, 200, `${route}: ${JSON.stringify(data)}`);
    if (response.headers.get("set-cookie")) cookie = response.headers.get("set-cookie").split(";")[0];
    return data;
  };
  const registration = await request("/auth/register", { username: "sichuan_learner", password: "fixture-password-123" });
  assert.ok(registration.certificates.some((entry) => entry.id === certificateId));
  await request("/auth/certificate", { certificateId }, "PUT");
  const catalog = await request("/practice/catalog");
  assert.equal(catalog.total, 206);
  assert.equal(catalog.chapters.length, 7);
  assert.equal(catalog.chapters.find((chapter) => chapter.name === "办公自动化").questionCount, 75);
  const questions = await request("/questions?bankOnly=1&chapter=" + encodeURIComponent("办公自动化"));
  assert.equal(questions.length, 75);
  assert.ok(questions.every((question) => question.chapter === "办公自动化"));
  assert.ok(questions.some((question) => question.id === originalId));
  const current = await request(`/questions/${originalId}`);
  assert.equal(current.knowledgeSection, "Word");
  assert.equal(current.knowledgePoint, "文档编辑与排版");
  assert.equal(current.certificateScopes, undefined);
  const canonical = store.getQ(originalId);
  const wrongOption = Object.keys(canonical.options).find((key) => !canonical.answer.includes(key));
  await request(`/questions/${originalId}/favorite`, { favorite: true }, "PUT");
  await request("/attempts", { questionId: originalId, selected: [wrongOption], timeMs: 1200 });
  const wrong = await request("/wrong");
  assert.equal(wrong.find((question) => question.id === originalId).chapter, "办公自动化");
  assert.equal((await request("/favorites"))[0].knowledgeSection, "Word");
  const dashboard = await request("/dashboard");
  assert.equal(dashboard.certificate.id, certificateId);
  assert.equal(dashboard.totalCount, 1);
  assert.ok(dashboard.mastery.some((point) => point.chapter === "办公自动化" && point.knowledgePoint === "文档编辑与排版"));
  await request("/auth/certificate", { certificateId: "ncre-ms-office" }, "PUT");
  const original = await request(`/questions/${originalId}`);
  assert.equal(original.chapter, "Word 文档处理");
  assert.equal(original.source, "syllabus_practice");
  assert.equal(original.attempted, true, "the same question keeps its existing learning record");
  assert.equal((await request("/practice/catalog")).total, 180);
  await request("/auth/certificate", { certificateId }, "PUT");
  // Include the entire selected pool so the shared fixture is always examined.
  const exam = await request("/exams", { count: questions.length, chapters: ["办公自动化"] });
  assert.equal(exam.questions.length, questions.length);
  assert.ok(exam.questions.every((question) => question.chapter === "办公自动化"));
  assert.equal(exam.questions.find((question) => question.id === originalId).knowledgeSection, "Word");
  const answers = Object.fromEntries(exam.questions.map((question) => [question.id, store.getQ(question.id).answer]));
  const result = await request(`/exams/${exam.id}/submit`, { answers });
  assert.equal(result.score, 100);
  assert.ok(result.results.every((attempt) => attempt.correct));
  assert.equal(store.db.prepare("SELECT COUNT(*) AS count FROM questions WHERE id=?").get(originalId).count, 1);
  store.db.prepare("UPDATE users SET is_admin=1 WHERE id=?").run(registration.user.id);
  const adminList = await request("/admin/questions?certificateId=" + certificateId + "&chapter=" + encodeURIComponent("办公自动化"));
  const listed = adminList.questions.find((question) => question.id === originalId);
  assert.equal(listed.chapter, "办公自动化");
  assert.equal(listed.classificationCertificateId, certificateId);
  const updated = await request(`/admin/questions/${originalId}`, {
    certificateId,
    type: canonical.type,
    question: canonical.question,
    options: canonical.options,
    answer: canonical.answer,
    analysis: canonical.analysis + " 两个备考目标共用此解析。",
    chapter: "办公自动化",
    knowledgeSection: "Word",
    knowledgePoint: "表格图文与邮件合并",
    difficulty: canonical.difficulty,
  }, "PUT");
  assert.equal(updated.question.chapter, "办公自动化");
  assert.equal(store.getQ(originalId).chapter, "Word 文档处理");
  assert.equal((await request(`/questions/${originalId}`)).knowledgePoint, "表格图文与邮件合并");
  await request("/auth/certificate", { certificateId: "ncre-ms-office" }, "PUT");
  const originalAfterEdit = await request(`/questions/${originalId}`);
  assert.equal(originalAfterEdit.chapter, "Word 文档处理");
  assert.equal(originalAfterEdit.knowledgePoint, canonical.knowledgePoint);
  assert.ok((await request(`/questions/${originalId}/reveal`, {})).analysis.endsWith("两个备考目标共用此解析。"));
});
