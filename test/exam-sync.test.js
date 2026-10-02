import test from "node:test";
import assert from "node:assert/strict";
import { createExamSync } from "../src/exam-sync.js";
const session = () => ({
  id: "exam",
  expiresAt: new Date(Date.now() + 60000).toISOString(),
  answers: {},
  answersVersion: 0,
  questions: ["one", "two"].map((id) => ({
    id,
    type: "single_choice",
    options: { A: "甲", B: "乙" },
  })),
});
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
};

test("exam saves serialize edits made during an earlier request with the latest server version", async () => {
  const first = deferred(),
    calls = [];
  const sync = createExamSync(async (_url, body) => {
    calls.push(body);
    if (calls.length === 1) await first.promise;
    return { saved: true, version: calls.length };
  });
  sync.restore(session());
  sync.choose("one", ["A"]);
  const saving = sync.save();
  sync.choose("one", ["B"]);
  sync.choose("two", ["A"]);
  assert.equal(sync.save(), saving);
  first.resolve();
  await saving;
  assert.equal(calls.length, 2);
  assert.equal(calls[1].expectedVersion, 1);
  assert.deepEqual(calls[1].answers, { one: ["B"], two: ["A"] });
  assert.equal(sync.snapshot().status, "saved");
});
test("network failures preserve pending answers through restart and retry", async () => {
  let fail = true;
  const request = async () => {
    if (fail) throw new Error("offline");
    return { saved: true, version: 1 };
  };
  const sync = createExamSync(request);
  sync.restore(session());
  sync.choose("one", ["B"]);
  assert.equal(await sync.save(), false);
  assert.equal(sync.snapshot().status, "error");
  const resumed = createExamSync(request);
  resumed.restore(session(), sync.checkpoint());
  assert.deepEqual(resumed.snapshot().answers.one, ["B"]);
  fail = false;
  assert.equal(await resumed.save(), true);
});
test("a second device cannot overwrite local pending answers without an explicit conflict choice", async () => {
  let calls = 0;
  const sync = createExamSync(async (_url, body) => {
    if (++calls === 1)
      throw Object.assign(new Error("conflict"), {
        code: "EXAM_ANSWERS_CONFLICT",
        details: { version: 2, answers: { two: ["B"] } },
      });
    assert.equal(body.expectedVersion, 2);
    assert.deepEqual(body.answers, { one: ["A"], two: ["B"] });
    return { saved: true, version: 3 };
  });
  sync.restore(session());
  sync.choose("one", ["A"]);
  await sync.save();
  assert.equal(sync.snapshot().status, "conflict");
  assert.deepEqual(sync.checkpoint().pending, { one: ["A"] });
  sync.resolveConflict("local");
  await sync.save();
  assert.equal(sync.snapshot().version, 3);
});
test("restore uses server answers and treats outdated unsaved checkpoints as conflicts", () => {
  const sync = createExamSync(() => {}),
    server = { ...session(), answersVersion: 3, answers: { two: ["B"] } };
  sync.restore(server);
  assert.deepEqual(sync.snapshot().answers, server.answers);
  sync.restore(server, {
    id: "exam",
    version: 1,
    pending: { one: ["A"], other: ["B"] },
  });
  assert.equal(sync.snapshot().status, "conflict");
  sync.resolveConflict("server");
  assert.deepEqual(sync.snapshot().answers, server.answers);
  assert.deepEqual(sync.checkpoint().pending, {});
});
test("submission refuses to lose unsaved answers and expiry uses the server deadline", async () => {
  let submissions = 0;
  const sync = createExamSync(async (url) => {
    if (url.endsWith("/answers")) throw new Error("offline");
    submissions++;
    return { score: 0 };
  });
  sync.restore(session());
  sync.choose("one", ["A"]);
  await assert.rejects(sync.submit(), /有答案尚未保存/);
  assert.equal(submissions, 0);
  const expired = {
    ...session(),
    expiresAt: new Date(Date.now() - 1000).toISOString(),
  };
  sync.restore(expired, { id: "exam", version: 0, pending: { one: ["A"] } });
  await sync.submit();
  assert.equal(submissions, 1);
});
test("a late save response from an old exam cannot change a newly opened exam", async () => {
  const gate = deferred(),
    sync = createExamSync(async () => {
      await gate.promise;
      return { saved: true, version: 99 };
    });
  sync.restore(session());
  sync.choose("one", ["A"]);
  const saving = sync.save();
  sync.restore({ ...session(), id: "new-exam" });
  gate.resolve();
  await saving;
  assert.equal(sync.snapshot().session.id, "new-exam");
  assert.equal(sync.snapshot().version, 0);
});
