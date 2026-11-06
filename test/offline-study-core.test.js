import assert from "node:assert/strict";
import test from "node:test";
import { buildOfflineExamQuestions, createOfflineExam, scoreOfflineExam } from "../mobile/src/offline/offlineExamCore.ts";
import { gradeOfflineAnswer, shanghaiStudyDay } from "../mobile/src/offline/offlineStudyCore.ts";
import { bundledQuestions, hasCertificateQuestion, questionForCertificate, syllabusForCertificate } from "../server/question-banks/loader.js";

test("practice grades each question type and uses Beijing midnight independent of device zone", () => {
  assert.equal(gradeOfflineAnswer({ type: "multiple_choice", options: { A: "甲", B: "乙", C: "丙" }, answer: ["B", "A"] }, ["A", "B"]), true);
  assert.throws(() => gradeOfflineAnswer({ type: "single_choice", options: { A: "甲" }, answer: ["A"] }, ["B"]));
  assert.equal(gradeOfflineAnswer({ type: "short_answer" }, ["A"], "我的作答"), true);
  assert.throws(() => gradeOfflineAnswer({ type: "short_answer" }, ["A"], ""));
  assert.equal(shanghaiStudyDay(Date.parse("2026-11-06T15:59:59Z")), "2026-11-06");
  assert.equal(shanghaiStudyDay(Date.parse("2026-11-06T16:00:00Z")), "2026-11-07");
});

test("offline veterinary mock applies the bundled fixed-module blueprint", () => {
  const id = "veterinary-practitioner";
  const questions = bundledQuestions().filter((q) => hasCertificateQuestion(q, id)).map((q) => questionForCertificate(q, id));
  const { examBlueprint, modules } = syllabusForCertificate(id);
  const pack = { questions, exam: { modules, blueprint: examBlueprint, secondsPerQuestion: 120 } };
  const paper = buildOfflineExamQuestions(pack, 400, [], () => 0.5);
  assert.equal(paper.questions.length, 400);
  assert.equal(paper.durationMs, 240 * 60 * 1000);
  assert.equal(paper.passingScore, 240);
  assert.equal(new Set(paper.questions.map((q) => q.id)).size, 400);
  for (const module of modules) assert.equal(paper.questions.filter((q) => q.chapter === module.name).length, 100);
  for (const group of new Set(paper.questions.map((q) => q.sharedGroupId).filter(Boolean)))
    assert.equal(paper.questions.filter((q) => q.sharedGroupId === group).length,
      questions.filter((q) => q.sharedGroupId === group).length);
});

test("local exam resume and score preserve IDs and do not count unanswered rows", () => {
  const q = (id) => ({ id, type: "single_choice", chapter: "甲", options: { A: "甲", B: "乙" }, answer: ["A"] });
  const pack = { questions: [q("q1"), q("q2")], exam: { modules: [], blueprint: null, secondsPerQuestion: 120 } };
  let id = 0;
  const exam = createOfflineExam(pack, "v1", 2, ["甲"], () => 0.99, () => "id" + ++id, 1000);
  exam.answers.q1 = ["A"];
  const resumed = JSON.parse(JSON.stringify(exam));
  const score = scoreOfflineExam(resumed, 2000);
  assert.equal(score.score, 1);
  assert.equal(score.total, 2);
  assert.equal(score.attempts.length, 1);
  assert.equal(score.attempts[0].id, exam.attemptIds[exam.questions.findIndex((q) => q.id === "q1")]);
  assert.equal(score.attempts[0].occurredAt, 2000);
  assert.deepEqual(scoreOfflineExam({ ...resumed, submittedAt: 2000 }, 9999), score);
});
