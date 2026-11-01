import test from "node:test";
import assert from "node:assert/strict";
import {
  practiceStorageKey,
  readPracticeProgress,
  restorePracticeProgress,
  loadPracticeProgress,
  savePracticeProgress,
  practiceReturnPage,
  practiceReturnLabel,
} from "../src/practice-progress.js";

const question = (id) => ({
  id,
  type: "single_choice",
  question: `Question ${id}`,
  options: { A: "one", B: "two" },
});
const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};
const session = {
  title: "网络体系结构",
  questions: [question("a"), question("b"), question("c")],
};

test("memorize mode and an unacknowledged submission survive a checkpoint", () => {
  const storage = memoryStorage();
  const response = { selected: ["A"], saveStatus: "pending", submitted: false,
    attemptPayload: { questionId: "b", selected: ["A"], clientAttemptId: "kept-token", timeMs: 123 } };
  savePracticeProgress(storage, "memory", session, 1, { b: response }, false, "memorize");
  const restored = restorePracticeProgress(readPracticeProgress(storage, "memory"), session.questions);
  assert.equal(restored.mode, "memorize");
  assert.equal(restored.progress.index, 1);
  assert.deepEqual(restored.progress.responses.b.attemptPayload, response.attemptPayload);
  assert.equal(restored.progress.responses.b.submitted, false);
});

test("practice resumes its real origin and round start; old or invalid origins safely return home", () => {
  const storage = memoryStorage(),
    startedAt = Date.now() - 5000;
  for (const returnPage of [
    "wrong",
    "chapters",
    "favorites",
    "training",
    "community",
    "home",
  ]) {
    savePracticeProgress(
      storage,
      "origin",
      { ...session, returnPage, startedAt },
      1,
      {},
      false,
    );
    const restored = restorePracticeProgress(
      readPracticeProgress(storage, "origin"),
      session.questions,
    );
    assert.equal(practiceReturnPage(restored), returnPage);
    assert.equal(restored.startedAt, startedAt);
  }
  assert.equal(practiceReturnPage({}), "home");
  for (const returnPage of ["https://example.test", "admin", "__proto__", null])
    assert.equal(practiceReturnPage({ returnPage }), "home");
  assert.equal(
    practiceReturnPage({ returnPage: "wrong", planTask: {} }),
    "plan",
  );
  assert.equal(practiceReturnLabel({ returnPage: "wrong" }), "返回错题本");
});

test("practice resume restores the current question and already submitted answers", () => {
  const storage = memoryStorage();
  const key = practiceStorageKey("user", "network");
  const responses = {
    a: {
      selected: ["A"],
      submitted: true,
      result: { answer: ["B"], questionId: "a", correct: false },
    },
    b: { selected: ["B"] },
  };
  savePracticeProgress(storage, key, session, 1, responses, false);
  const restored = restorePracticeProgress(
    readPracticeProgress(storage, key),
    session.questions,
  );
  assert.equal(restored.progress.index, 1);
  assert.deepEqual(restored.progress.responses, responses);
  assert.equal(restored.title, session.title);
});

test("saved practice is isolated by account and certificate", () => {
  const storage = memoryStorage();
  savePracticeProgress(
    storage,
    practiceStorageKey("one", "network"),
    session,
    0,
    {},
    false,
  );
  assert.equal(
    readPracticeProgress(storage, practiceStorageKey("two", "network")),
    null,
  );
  assert.equal(
    readPracticeProgress(storage, practiceStorageKey("one", "office")),
    null,
  );
  assert.equal(practiceStorageKey(null, "network"), null);
  assert.notEqual(
    practiceStorageKey("one:two", "three"),
    practiceStorageKey("one", "two:three"),
  );
});

test("removed questions preserve the current question when it is still available", () => {
  const storage = memoryStorage();
  savePracticeProgress(storage, "key", session, 2, {}, false);
  const saved = readPracticeProgress(storage, "key");
  assert.equal(
    restorePracticeProgress(saved, session.questions.slice(1)).progress.index,
    1,
  );
  assert.equal(
    restorePracticeProgress(saved, [question("a")]).progress.index,
    0,
  );
  assert.equal(restorePracticeProgress(saved, []), null);
});

test("a revised question drops its stale answer while retaining unchanged answers", () => {
  const storage = memoryStorage();
  savePracticeProgress(
    storage,
    "key",
    session,
    0,
    { a: { selected: ["A"] }, b: { selected: ["B"] } },
    false,
  );
  const questions = [
    { ...question("a"), question: "Revised question" },
    question("b"),
  ];
  const restored = restorePracticeProgress(
    readPracticeProgress(storage, "key"),
    questions,
  );
  assert.deepEqual(restored.progress.responses, { b: { selected: ["B"] } });
});

test("corrupt or unavailable storage does not block starting practice", () => {
  const storage = memoryStorage();
  for (const value of [
    "broken",
    "null",
    JSON.stringify({
      version: 1,
      title: "test",
      questionIds: ["a"],
      index: 99,
      responses: {},
    }),
    JSON.stringify({
      version: 1,
      title: "test",
      questionIds: ["a"],
      index: 0,
      responses: { a: { selected: "A" } },
    }),
  ]) {
    storage.setItem("key", value);
    assert.equal(readPracticeProgress(storage, "key"), null);
  }
  for (const response of [
    { submitted: true },
    { teacher: { invalid: true } },
    { result: { answer: ["A"], analysis: {} } },
    { selected: [null] },
  ]) {
    savePracticeProgress(storage, "key", session, 0, { a: response }, false);
    assert.equal(readPracticeProgress(storage, "key"), null);
  }
  const blocked = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("full");
    },
  };
  assert.equal(readPracticeProgress(blocked, "key"), null);
  assert.doesNotThrow(() =>
    savePracticeProgress(blocked, "key", session, 0, {}, false),
  );
});

test("completed sessions are removed from the continue entry", () => {
  const storage = memoryStorage();
  savePracticeProgress(storage, "key", session, 0, {}, false);
  assert.ok(readPracticeProgress(storage, "key"));
  savePracticeProgress(storage, "key", session, 2, {}, true);
  assert.equal(readPracticeProgress(storage, "key"), null);
});

test("shared questions are restored on demand and withdrawn questions are omitted", async () => {
  const storage = memoryStorage();
  savePracticeProgress(storage, "key", session, 1, {}, false);
  const saved = readPracticeProgress(storage, "key");
  const restored = await loadPracticeProgress(
    saved,
    [question("a")],
    async () => [question("b")],
  );
  assert.deepEqual(
    restored.questions.map((item) => item.id),
    ["a", "b"],
  );
  assert.equal(restored.progress.index, 1);
  await loadPracticeProgress(saved, session.questions, async () =>
    assert.fail("ordinary practice needs no extra request"),
  );
  await assert.rejects(
    loadPracticeProgress(saved, [], async () => {
      throw new Error("offline");
    }),
    /offline/,
  );
});

test("plan resume takes submitted grades only from the server and keeps safe unfinished drafts", async () => {
  const storage = memoryStorage();
  const planTask = {
    planId: "8c006f26-c45f-4bb4-ac27-ae4db58bfbb1",
    taskId: "9c006f26-c45f-4bb4-ac27-ae4db58bfbb1",
  };
  const grade = { questionId: "a", answer: ["B"], correct: false };
  savePracticeProgress(
    storage,
    "plan",
    { ...session, planTask },
    1,
    {
      a: {
        submitted: true,
        selected: ["A"],
        result: { ...grade, correct: true },
      },
      b: {
        selected: ["B"],
        result: { questionId: "b", answer: ["B"], correct: true },
        revealed: true,
      },
      c: {
        submitted: true,
        selected: ["A"],
        result: { questionId: "c", answer: ["A"], correct: true },
      },
    },
    false,
  );
  const saved = readPracticeProgress(storage, "plan");
  assert.deepEqual(saved.planTask, planTask);
  const restored = await loadPracticeProgress(
    saved,
    [],
    () => assert.fail("plan never falls back to ordinary practice"),
    async (reference) => {
      assert.deepEqual(reference, planTask);
      return {
        ...session,
        planTask,
        progress: {
          index: 1,
          responses: { a: { submitted: true, selected: ["A"], result: grade } },
        },
      };
    },
  );
  assert.equal(restored.progress.index, 1);
  assert.deepEqual(restored.progress.responses, {
    a: { submitted: true, selected: ["A"], result: grade },
    b: { selected: ["B"] },
  });
  assert.equal(
    await loadPracticeProgress(saved, session.questions, async () => []),
    null,
  );
  await assert.rejects(
    loadPracticeProgress(
      saved,
      session.questions,
      async () => [],
      async () => {
        throw new Error("plan unavailable");
      },
    ),
    /plan unavailable/,
  );
});
