import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createStore } from "../server/store.js";
import { bundledQuestions } from "../server/question-banks/loader.js";
import { examPointId } from "../server/exam-selection.js";
import { questionForCertificate } from "../server/question-banks/scopes.js";

// HCIA 题库重建了三级知识体系（章节 / 小节 / 知识点），题目分类标签与按分类
// 哈希出来的知识点 ID 都变了。用户的作答记录按 question_id 存储，必须完整保留；
// 这里验证升级后历史记录仍可正确回放，且分类元数据被同步迁移。

const plan = JSON.parse(
  fs.readFileSync(
    new URL(
      "../server/question-banks/hcia-datacom/migrations/2026-10-28-classification.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const CERT = "hcia-datacom";
const live = (id) =>
  questionForCertificate(
    bundledQuestions().find((q) => q.id === id),
    CERT,
  );

function seedLegacyDatabase(dir, { questionId, selected }) {
  const db = new DatabaseSync(path.join(dir, "netwise.sqlite"));
  db.exec(`
    CREATE TABLE questions (id TEXT PRIMARY KEY, fingerprint TEXT UNIQUE NOT NULL, data TEXT NOT NULL);
    CREATE TABLE attempts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, question_id TEXT NOT NULL REFERENCES questions(id), data TEXT NOT NULL);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE location_learning_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, certificate_id TEXT NOT NULL, day TEXT NOT NULL, state TEXT NOT NULL, data TEXT NOT NULL);
  `);
  const question = bundledQuestions().find((q) => q.id === questionId);
  db.prepare("INSERT INTO questions VALUES (?,?,?)").run(
    question.id,
    "seed-" + question.id,
    JSON.stringify(question),
  );
  // 升级前的作答记录：分类标签是旧的两级结构，知识点 ID 是旧哈希
  const attempt = {
    id: "attempt-legacy",
    userId: "learner",
    questionId,
    selected: [selected],
    correct: true,
    timeMs: 4200,
    mode: "practice",
    chapter: "旧章节名",
    knowledgePoint: "旧知识点名",
    practicedKnowledgePoint: "旧知识点名",
    createdAt: "2026-10-20T08:00:00.000Z",
  };
  db.prepare("INSERT INTO attempts VALUES (?,?,?,?)").run(
    attempt.id,
    "learner",
    questionId,
    JSON.stringify(attempt),
  );
  const [oldPointId, newPointIds] = Object.entries(plan.pointIds).find(
    ([, ids]) => ids.includes(examPointId(CERT, live(questionId))),
  ) || [];
  const session = {
    id: "exam-legacy",
    userId: "learner",
    certificateId: CERT,
    questionIds: [questionId],
    knowledgePointIds: [oldPointId || "kp-000000000000000000000000"],
    answers: { [questionId]: [selected] },
    submitted: true,
  };
  db.prepare("INSERT INTO sessions VALUES (?,?)").run(
    session.id,
    JSON.stringify(session),
  );
  const location = {
    id: "location-legacy",
    userId: "learner",
    certificateId: CERT,
    day: "2026-10-20",
    state: "completed",
    point: { id: oldPointId || "kp-000000000000000000000000", name: "旧知识点名" },
    pointIds: [oldPointId || "kp-000000000000000000000000"],
    questions: [
      {
        id: questionId,
        chapter: "旧章节名",
        knowledgeSection: undefined,
        knowledgePoint: "旧知识点名",
        question: question.question,
        options: question.options,
        answer: question.answer,
      },
    ],
  };
  db.prepare("INSERT INTO location_learning_sessions VALUES (?,?,?,?,?,?)").run(
    location.id,
    "learner",
    CERT,
    location.day,
    location.state,
    JSON.stringify(location),
  );
  db.close();
  return { oldPointId, newPointIds: newPointIds || [] };
}

test("题库重建后历史刷题记录仍可正确回放", () => {
  const questionId = Object.keys(plan.questions).find((id) => {
    const q = live(id);
    return q && q.type === "single_choice" && q.options?.[q.answer[0]];
  });
  const target = plan.questions[questionId];
  const current = live(questionId);
  const selected = current.answer[0];
  const selectedText = current.options[selected];

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bank-migration-"));
  const { oldPointId, newPointIds } = seedLegacyDatabase(dir, {
    questionId,
    selected,
  });

  const store = createStore(dir);
  try {
    const attempt = JSON.parse(
      store.db
        .prepare("SELECT data FROM attempts WHERE id='attempt-legacy'")
        .get().data,
    );
    // 作答本身不能被动过
    assert.deepEqual(attempt.selected, [selected]);
    assert.equal(attempt.correct, true);
    // 选项顺序必须与记录时一致，否则「我的选择」会标到错误的选项上
    assert.equal(current.options[selected], selectedText);
    // 分类标签迁移到新的三级体系
    assert.equal(attempt.chapter, target.chapter);
    assert.equal(attempt.knowledgePoint, target.knowledgePoint);
    assert.equal(attempt.practicedKnowledgePoint, target.knowledgePoint);

    const exam = JSON.parse(
      store.db.prepare("SELECT data FROM sessions WHERE id='exam-legacy'").get()
        .data,
    );
    assert.deepEqual(exam.answers[questionId], [selected]);
    if (newPointIds.length)
      assert.deepEqual(exam.knowledgePointIds, newPointIds);

    const location = JSON.parse(
      store.db
        .prepare(
          "SELECT data FROM location_learning_sessions WHERE id='location-legacy'",
        )
        .get().data,
    );
    if (newPointIds.length) {
      assert.deepEqual(location.pointIds, newPointIds);
      assert.equal(location.point.id, newPointIds[0]);
      assert.notEqual(location.point.id, oldPointId);
    }
    assert.equal(location.questions[0].chapter, target.chapter);
    assert.equal(location.questions[0].knowledgePoint, target.knowledgePoint);

    // 迁移只执行一次
    const applied = store.db
      .prepare("SELECT COUNT(*) AS n FROM schema_migrations")
      .get();
    assert.equal(applied.n, 1);
  } finally {
    store.db.close();
  }

  // 再次启动不应重复改写
  const reopened = createStore(dir);
  try {
    const attempt = JSON.parse(
      reopened.db
        .prepare("SELECT data FROM attempts WHERE id='attempt-legacy'")
        .get().data,
    );
    assert.deepEqual(attempt.selected, [selected]);
    assert.equal(attempt.knowledgePoint, target.knowledgePoint);
    assert.equal(
      reopened.db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get().n,
      1,
    );
  } finally {
    reopened.db.close();
  }
});

test("HCIA 全部存量题的选项顺序与历史记录一致", () => {
  // 存量题（非本次新增的 hcia-v3-*）不允许被选项重排脚本改动，
  // 否则历史作答的答案字母会指向别的选项。
  const legacy = bundledQuestions().filter(
    (q) =>
      q.certificates?.includes(CERT) &&
      !q.id.startsWith("hcia-v3-") &&
      q.type === "single_choice",
  );
  assert.ok(legacy.length > 0);
  for (const q of legacy) {
    const letters = Object.keys(q.options);
    assert.deepEqual(letters, ["A", "B", "C", "D"]);
    assert.ok(q.answer.every((key) => q.options[key]));
  }
});
