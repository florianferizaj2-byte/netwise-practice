import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  chapterGroups,
  practicePool,
  practicePreferenceKey,
  readPracticePreferences,
} from "../src/blue-practice.js";
import { createStore } from "../server/store.js";
import { createApp } from "../server/index.js";
import {
  hasCertificateQuestion,
  questionForCertificate,
} from "../server/certificates.js";

test("chapter settings respect source, actual attempted flags and shared question boundaries", () => {
  const dashboard = {
    chapters: [
      { name: "A", attempted: 90, total: 100 },
      { name: "B" },
      { name: "Pending" },
    ],
  };
  const questions = [
    { id: "a", chapter: "A", source: "practice", attempted: true },
    { id: "b", chapter: "A", source: "collection" },
    { id: "c", chapter: "B", source: "practice" },
    { id: "private", chapter: "A", source: "ai_generated" },
  ];
  const shared = [
    { id: "shared", chapter: "A", source: "ai_generated", attempted: true },
    questions[0],
  ];
  const groups = chapterGroups(dashboard, questions);
  assert.equal(groups[0].total, 2);
  assert.equal(groups[0].attempted, 1);
  assert.equal(groups[0].status, "in-progress");
  assert.equal(groups[2].status, "unavailable");
  assert.deepEqual(
    chapterGroups(
      dashboard,
      questions,
      shared,
      "practice",
      true,
    )[0].questions.map((q) => q.id),
    ["a", "shared"],
  );
  assert.deepEqual(
    chapterGroups(
      dashboard,
      questions,
      shared,
      "collection",
      false,
    )[0].questions.map((q) => q.id),
    ["b"],
  );
  assert.deepEqual(
    practicePool(groups[0].questions, { range: "unattempted" }).map(
      (q) => q.id,
    ),
    ["b"],
  );
  assert.deepEqual(
    practicePool(groups[0].questions, {
      range: "wrong",
      wrongIds: new Set(["a", "private", "outside"]),
    }).map((q) => q.id),
    ["a"],
  );
  const before = groups[0].questions.map((q) => q.id);
  assert.deepEqual(
    new Set(
      practicePool(groups[0].questions, { order: "random", count: "all" }).map(
        (q) => q.id,
      ),
    ),
    new Set(before),
  );
  assert.deepEqual(
    groups[0].questions.map((q) => q.id),
    before,
  );
  assert.deepEqual(practicePool(groups[0].questions, { range: "wrong" }), []);
});

test("practice preferences are scoped and accept only supported display choices", () => {
  const map = new Map(),
    storage = { getItem: (key) => map.get(key) };
  const a = practicePreferenceKey("a", "network"),
    b = practicePreferenceKey("b", "network");
  map.set(
    a,
    JSON.stringify({
      order: "random",
      range: "wrong",
      count: "all",
      answer: ["A"],
    }),
  );
  assert.deepEqual(readPracticePreferences(storage, a), {
    order: "random",
    range: "wrong",
    count: "all",
  });
  assert.deepEqual(readPracticePreferences(storage, b), {
    order: "sequential",
    range: "all",
    count: 10,
  });
  assert.notEqual(a, practicePreferenceKey("a", "office"));
  assert.notEqual(
    practicePreferenceKey("one:two", "three"),
    practicePreferenceKey("one", "two:three"),
  );
  for (const value of [
    "broken",
    "null",
    JSON.stringify({ order: "run code", range: "all", count: 10 }),
    JSON.stringify({ order: "random", range: "wrong", count: 0 }),
  ]) {
    map.set(a, value);
    assert.deepEqual(readPracticePreferences(storage, a), {
      order: "sequential",
      range: "all",
      count: 10,
    });
  }
});

test("the authenticated dashboard returns only the latest visible practice in the active certificate", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aceexam-blue-")),
    store = createStore(directory),
    app = await createApp({ store, withFrontend: false }),
    server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    await app.locals.stop();
    await new Promise((r) => server.close(r));
    store.db.close();
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert(path.basename(directory).startsWith("aceexam-blue-"));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const a = await store.registerAsync("blue-a", "fixture-password-123"),
    b = await store.registerAsync("blue-b", "fixture-password-123");
  for (const u of [a, b]) store.selectCertificate(u.id, "network-engineer");
  const tokens = [a, b].map((u) => store.createAuthSession(u.id));
  const read = async (token = tokens[0]) => {
    const r = await fetch(
      `http://127.0.0.1:${server.address().port}/api/dashboard`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    assert.equal(r.status, 200);
    return r.json();
  };
  assert.equal((await read()).lastPractice, null);
  const qs = store
    .allQ()
    .filter(
      (q) =>
        hasCertificateQuestion(q, "network-engineer") &&
        q.type === "single_choice",
    )
    .slice(0, 3);
  const earlier = store.recordAttempt(
    qs[0].id,
    qs[0].answer,
    1000,
    "practice",
    a.id,
  );
  const later = store.recordAttempt(
    qs[1].id,
    qs[1].answer,
    1000,
    "practice",
    a.id,
  );
  store.recordAttempt(qs[2].id, qs[2].answer, 1000, "exam", a.id);
  const result = (await read()).lastPractice;
  assert.deepEqual(result, {
    chapter: questionForCertificate(qs[1], "network-engineer").chapter,
    questionId: qs[1].id,
    practicedAt: later.createdAt,
  });
  assert(!("answer" in result));
  assert(!("selected" in result));
  assert.equal((await read(tokens[1])).lastPractice, null);
  store.selectCertificate(a.id, "sichuan-upgrading-computer");
  assert.equal((await read()).lastPractice, null);
  store.selectCertificate(a.id, "network-engineer");
  assert.equal((await read()).lastPractice.questionId, qs[1].id);
  store.deleteQuestion(qs[1].id, a.id, "test withdrawal");
  assert.equal((await read()).lastPractice.questionId, earlier.questionId);
});
