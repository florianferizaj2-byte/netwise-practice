import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStore } from "../server/store.js";
import { createApp } from "../server/index.js";
import { planToday, addPlanDays } from "../server/learning-plan.js";
import {
  certificates,
  hasCertificateQuestion,
  questionForCertificate,
} from "../server/certificates.js";

async function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aceexam-plan-"));
  let store, app, server;
  const open = async () => {
    store = createStore(directory);
    app = await createApp({ store, withFrontend: false });
    server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
  };
  const close = async () => {
    await app.locals.stop();
    await new Promise((r) => server.close(r));
    store.db.close();
  };
  await open();
  t.after(async () => {
    await close();
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert(path.basename(directory).startsWith("aceexam-plan-"));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const a = await store.registerAsync("plan-a", "fixture-password-123");
  const b = await store.registerAsync("plan-b", "fixture-password-123");
  for (const u of [a, b]) store.selectCertificate(u.id, "network-engineer");
  const tokens = [a, b].map((u) => store.createAuthSession(u.id));
  const req = async (url, body, token = tokens[0], method) => {
    const r = await fetch(
      `http://127.0.0.1:${server.address().port}/api${url}`,
      {
        method: method || (body ? "POST" : "GET"),
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    return {
      status: r.status,
      data: await r.json(),
      cache: r.headers.get("cache-control"),
    };
  };
  const create = (extra = {}) => ({
    requestId: crypto.randomUUID(),
    expectedPlanId: null,
    revision: 0,
    startDate: planToday(),
    weeks: 1,
    dailyCount: 10,
    ...extra,
  });
  const snapshot = async () => (await req("/learning-plan")).data.plan;
  const session = (p, task = p.tasks[0], token) =>
    req(`/learning-plan/${p.id}/tasks/${task.id}/session`, {}, token);
  const submit = (p, task, q, selected = q.answer) =>
    req("/attempts", {
      questionId: q.id,
      selected,
      timeMs: 1234,
      planTask: { planId: p.id, taskId: task.id },
    });
  return {
    get store() {
      return store;
    },
    a,
    b,
    tokens,
    req,
    create,
    snapshot,
    session,
    submit,
    async restart() {
      await close();
      await open();
    },
  };
}

test("plans use current certificate questions, require an account and keep unanswered grades private", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.req("/learning-plan", undefined, null)).status, 401);
  const empty = await f.req("/learning-plan");
  assert.equal(empty.status, 200);
  assert.equal(empty.cache, "no-store");
  assert.equal(empty.data.plan, null);
  assert(empty.data.chapters.length > 1);
  const input = f.create(),
    p = (await f.req("/learning-plan", input)).data;
  assert.equal(p.tasks.length, 7);
  assert(
    p.tasks.every((task) => task.answered === 0 && task.status === "pending"),
  );
  assert(!JSON.stringify(p).includes("questionIds"));
  assert(!JSON.stringify(p).includes("questionVersions"));
  const s = await f.session(p);
  assert.equal(s.status, 200);
  assert.equal(s.data.questions.length, p.tasks[0].count);
  assert.deepEqual(s.data.progress.responses, {});
  for (const q of s.data.questions) {
    assert.equal(q.chapter, p.tasks[0].chapter);
    for (const key of [
      "answer",
      "analysis",
      "expectedAnswer",
      "ownerUserId",
      "grading",
    ])
      assert(!(key in q));
  }
  assert.equal((await f.session(p, p.tasks[0], f.tokens[1])).status, 404);
  assert.equal(
    (await f.req("/learning-plan", undefined, f.tokens[1])).data.plan,
    null,
  );
  const attempts = f.store.allA(f.b.id).length;
  assert.equal(
    (
      await f.req(
        "/attempts",
        {
          questionId: s.data.questions[0].id,
          selected: ["A"],
          timeMs: 0,
          planTask: s.data.planTask,
        },
        f.tokens[1],
      )
    ).status,
    404,
  );
  assert.equal(f.store.allA(f.b.id).length, attempts);
  f.store.selectCertificate(f.a.id, "sichuan-upgrading-computer");
  assert.equal((await f.req("/learning-plan")).data.plan, null);
  assert.equal((await f.session(p)).status, 404);
  f.store.selectCertificate(f.a.id, "network-engineer");
  assert.equal((await f.snapshot()).id, p.id);
  assert.equal(
    (await f.req("/learning-plan", f.create({ startDate: "2026-02-30" })))
      .status,
    400,
  );
  assert.equal(
    (await f.req("/learning-plan", f.create({ html: "<script>" }))).status,
    400,
  );
});

test("trusted plan grading is atomic, idempotent and durable; ordinary practice still works", async (t) => {
  const f = await fixture(t),
    p = (await f.req("/learning-plan", f.create())).data,
    task = p.tasks[0];
  const s = (await f.session(p)).data;
  const qs = s.questions.map((q) => f.store.getQ(q.id));
  const before = f.store.allA(f.a.id).length;
  const result = await f.submit(p, task, qs[0]);
  assert.equal(result.status, 200);
  assert.equal(result.data.correct, true);
  assert.deepEqual(result.data.answer, qs[0].answer);
  const repeat = await f.submit(p, task, qs[0]);
  assert.deepEqual(repeat.data, result.data);
  assert.equal(f.store.allA(f.a.id).length, before + 1);
  assert.equal(
    (await f.submit(p, task, qs[0], [qs[0].answer[0] === "A" ? "B" : "A"]))
      .status,
    409,
  );
  const wrong = [qs[1].answer[0] === "A" ? "B" : "A"];
  assert.equal((await f.submit(p, task, qs[1], wrong)).data.correct, false);
  assert(f.store.wrongQuestions(f.a.id).some((q) => q.id === qs[1].id));
  assert.equal((await f.snapshot()).tasks[0].answered, 2);
  assert.equal((await f.snapshot()).tasks[0].correct, 1);
  assert.equal((await f.snapshot()).tasks[0].timeMs, 2468);
  const outside = f.store
    .allQ()
    .find(
      (q) =>
        q.chapter !== task.chapter &&
        hasCertificateQuestion(q, "network-engineer") &&
        q.type === "single_choice",
    );
  assert(outside);
  assert.equal((await f.submit(p, task, outside)).status, 409);
  assert.equal(
    (await f.submit(p, { id: crypto.randomUUID() }, qs[2])).status,
    404,
  );
  const count = f.store.allA(f.a.id).length;
  f.store.db.exec(
    "CREATE TRIGGER reject_plan_save BEFORE INSERT ON learning_plan_submissions BEGIN SELECT RAISE(FAIL,'plan disk failure'); END;",
  );
  const reviews = f.store.db
    .prepare("SELECT count(*) n FROM user_reviews WHERE user_id=?")
    .get(f.a.id).n;
  assert(
    (await f.submit(p, task, qs[2], [qs[2].answer[0] === "A" ? "B" : "A"]))
      .status >= 400,
  );
  assert.equal(f.store.allA(f.a.id).length, count);
  assert.equal(
    f.store.db
      .prepare("SELECT count(*) n FROM user_reviews WHERE user_id=?")
      .get(f.a.id).n,
    reviews,
  );
  assert.equal((await f.snapshot()).tasks[0].answered, 2);
  f.store.db.exec("DROP TRIGGER reject_plan_save");
  for (const q of qs.slice(2))
    assert.equal((await f.submit(p, task, q)).status, 200);
  assert.equal((await f.snapshot()).tasks[0].status, "complete");
  const saved = (await f.session(p)).data;
  await f.restart();
  assert.deepEqual((await f.session(p)).data, saved);
  assert.equal((await f.snapshot()).tasks[0].status, "complete");
  assert.equal(
    (
      await f.req("/attempts", {
        questionId: qs[0].id,
        selected: qs[0].answer,
        timeMs: 0,
      })
    ).status,
    200,
  );
  assert.equal(f.store.allA(f.a.id).length, before + qs.length + 1);
});

test("plan mutation retries, conflicts and archived records preserve progress without duplicating tasks", async (t) => {
  const f = await fixture(t),
    input = f.create(),
    p = (await f.req("/learning-plan", input)).data;
  assert.deepEqual((await f.req("/learning-plan", input)).data, p);
  assert.equal((await f.req("/learning-plan", f.create())).status, 409);
  assert.equal(
    (await f.req("/learning-plan", { ...input, dailyCount: 20 })).status,
    409,
  );
  const add = {
    requestId: crypto.randomUUID(),
    planId: p.id,
    revision: p.revision,
    date: p.startDate,
    kind: "chapter",
    chapter: p.tasks[0].chapter,
    count: 1,
  };
  const added = (await f.req("/learning-plan/tasks", add)).data;
  assert.equal(added.tasks.length, 8);
  assert.deepEqual((await f.req("/learning-plan/tasks", add)).data, added);
  assert.equal(
    (
      await f.req("/learning-plan/tasks", {
        ...add,
        requestId: crypto.randomUUID(),
      })
    ).status,
    409,
  );
  assert.equal(
    (await f.req("/learning-plan/tasks", { ...add, count: 2 })).status,
    409,
  );
  assert.equal(
    (
      await f.req("/learning-plan/tasks", {
        ...add,
        requestId: crypto.randomUUID(),
        revision: added.revision,
        date: addPlanDays(p.startDate, 7),
      })
    ).status,
    400,
  );
  const task = added.tasks.at(-1),
    s = (await f.session(added, task)).data,
    q = f.store.getQ(s.questions[0].id);
  await f.submit(p, task, q);
  const latest = await f.snapshot();
  const cancel = { revision: latest.revision, canceled: true },
    url = `/learning-plan/${p.id}/tasks/${task.id}`;
  const canceled = (await f.req(url, cancel, undefined, "PUT")).data;
  assert.equal(canceled.tasks.at(-1).status, "canceled");
  assert.deepEqual((await f.req(url, cancel, undefined, "PUT")).data, canceled);
  assert.equal((await f.session(p, task)).status, 409);
  assert.equal((await f.submit(p, task, q)).status, 409);
  assert.equal(
    (await f.req(url, { revision: 0, canceled: false }, undefined, "PUT"))
      .status,
    409,
  );
  const restored = (
    await f.req(
      url,
      { revision: canceled.revision, canceled: false },
      undefined,
      "PUT",
    )
  ).data;
  assert.equal(restored.tasks.at(-1).status, "complete");
  const newInput = f.create({
    expectedPlanId: p.id,
    revision: restored.revision,
    weeks: 2,
  });
  const next = (await f.req("/learning-plan", newInput)).data;
  assert.equal(next.tasks.filter((t) => t.kind === "chapter").length, 14);
  assert.equal((await f.snapshot()).id, next.id);
  assert.equal((await f.req("/learning-plan", input)).data.id, p.id);
  assert.equal((await f.snapshot()).id, next.id);
  assert.equal(
    (await f.session(p, task)).data.progress.responses[q.id].result.correct,
    true,
  );
  assert.equal(
    (
      await f.req("/learning-plan/tasks", {
        ...add,
        requestId: crypto.randomUUID(),
        revision: 0,
      })
    ).status,
    409,
  );
  assert.equal((await f.req("/learning-plan/tasks", add)).data.id, p.id);
});

test("changed or withdrawn questions cannot contribute stale grades or false completion", async (t) => {
  const f = await fixture(t),
    p = (await f.req("/learning-plan", f.create())).data;
  const add = {
    requestId: crypto.randomUUID(),
    planId: p.id,
    revision: 0,
    date: p.startDate,
    kind: "chapter",
    chapter: p.tasks[0].chapter,
    count: 1,
  };
  const added = (await f.req("/learning-plan/tasks", add)).data,
    task = added.tasks.at(-1),
    s = (await f.session(added, task)).data,
    q = f.store.getQ(s.questions[0].id);
  await f.submit(p, task, q);
  f.store.updateQuestion(q.id, { question: q.question + "（题目修订）" });
  const adjusted = (await f.snapshot()).tasks.at(-1);
  assert.equal(adjusted.status, "unavailable");
  assert.equal(adjusted.answered, 0);
  assert.equal(adjusted.adjustedCount, 1);
  assert.equal((await f.session(p, task)).status, 409);
  assert.equal((await f.submit(p, task, q)).status, 409);
});

test("every installed certificate can arrange its real objective chapters without using AI credits", async (t) => {
  const f = await fixture(t);
  const beforeUsage = f.store.db
    .prepare("SELECT * FROM user_usage WHERE user_id=?")
    .all(f.a.id);
  for (const c of certificates) {
    f.store.selectCertificate(f.a.id, c.id);
    const qs = f.store
      .allQ()
      .filter(
        (q) =>
          hasCertificateQuestion(q, c.id) &&
          ["single_choice", "multiple_choice", "true_false"].includes(q.type),
      )
      .map((q) => questionForCertificate(q, c.id));
    const expected = new Map();
    for (const q of qs)
      expected.set(q.chapter, (expected.get(q.chapter) || 0) + 1);
    const view = (await f.req("/learning-plan")).data;
    assert.deepEqual(
      new Map(view.chapters.map((c) => [c.title, c.count])),
      expected,
      c.id,
    );
    assert.equal(view.plan, null);
    const p = (await f.req("/learning-plan", f.create())).data;
    assert.equal(p.certificateId, c.id);
    assert.equal(
      p.tasks[0].count,
      Math.min(10, expected.get(p.tasks[0].chapter)),
    );
    const s = await f.session(p);
    assert.equal(s.status, 200, c.id);
    assert(
      s.data.questions.every((q) =>
        hasCertificateQuestion(f.store.getQ(q.id), c.id),
      ),
    );
  }
  assert.deepEqual(
    f.store.db.prepare("SELECT * FROM user_usage WHERE user_id=?").all(f.a.id),
    beforeUsage,
  );
});
