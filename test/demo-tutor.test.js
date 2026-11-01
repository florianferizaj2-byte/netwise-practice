import assert from "node:assert/strict";
import { test } from "node:test";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createDemoTutorApp } from "../server/demo-tutor/app.js";
import { TutorEngine } from "../server/demo-tutor/engine.js";
import { course, quizzes, teaching } from "../server/demo-tutor/content.js";
import {
  lessonJSONSchema,
  validateLesson,
} from "../server/demo-tutor/protocol.js";

const engine = new TutorEngine();
const act = (s, action, optionId) =>
  engine.apply(s, { action, optionId, revision: s.revision });
async function listen(databasePath) {
  const app = createDemoTutorApp({ databasePath });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  return {
    app,
    server,
    base: `http://127.0.0.1:${server.address().port}/api/demo/tutor/v1`,
    close: () =>
      new Promise((resolve) =>
        server.close(() => {
          app.locals.closeTutor();
          resolve();
        }),
      ),
  };
}
function client(service, initialCookie = "") {
  let cookie = initialCookie;
  return {
    cookie: () => cookie,
    request: async (route, body, options = {}) => {
      const r = await fetch(service.base + route, {
        method: options.method || (body ? "POST" : "GET"),
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...options.headers,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const set = r.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0];
      return { status: r.status, data: await r.json(), headers: r.headers };
    },
  };
}
const start = (c, more = {}) =>
  c.request("/sessions", {
    courseId: course.id,
    foundation: "beginner",
    requestId: crypto.randomUUID(),
    ...more,
  });
const submit = (c, s, action, optionId, more = {}) =>
  c.request(`/sessions/${s.id}/actions`, {
    action,
    ...(optionId ? { optionId } : {}),
    revision: s.revision,
    requestId: crypto.randomUUID(),
    ...more,
  });

test("reviewed component protocol rejects executable, unknown and malformed payloads", () => {
  assert.match(lessonJSONSchema.$schema, /2020-12/);
  assert.throws(() =>
    validateLesson([
      { type: "HTML", id: "bad", html: "<script>run()</script>" },
    ]),
  );
  assert.throws(() =>
    validateLesson([{ ...teaching[0][0], javascript: "run()" }]),
  );
  const q = {
    type: "MiniQuiz",
    id: "q",
    title: "问题",
    prompt: "请选择",
    kind: "check",
    options: [
      { id: "a", text: "甲" },
      { id: "b", text: "乙" },
    ],
    answer: "a",
  };
  assert.throws(() => validateLesson([q]));
  const diagram = structuredClone(
    teaching[0].find((c) => c.type === "NetworkDiagram"),
  );
  diagram.hosts[1].port = diagram.hosts[0].port;
  assert.throws(() => validateLesson([diagram]));
});

test("progressive engine hides future content and answers, and blocks skipping a quiz", () => {
  const s = engine.start();
  assert.equal(s.phase, "explanation");
  assert.equal(
    engine.view(s).lesson.components.filter((c) => c.type === "MiniQuiz")
      .length,
    0,
  );
  assert.ok(!JSON.stringify(engine.view(s)).includes("access-explain"));
  act(s, "next");
  const view = engine.view(s),
    quiz = view.lesson.components.find((c) => c.type === "MiniQuiz");
  assert.equal(quiz.id, "forwarding-check");
  assert.ok(
    !("answer" in quiz) && !("correctId" in quiz) && !("branches" in quiz),
  );
  assert.throws(() => act(s, "next"), /先完成当前小测/);
  assert.throws(() => act(s, "answer", "not-an-option"), /请选择/);
  assert.throws(() => engine.review(s, "access"), /先学习/);
});

test("every wrong choice has its own trusted error identification and remediation", () => {
  for (let stage = 0; stage < 3; stage++)
    for (const [kind, questions] of [
      ["check", [quizzes[stage].main]],
      ["variant", quizzes[stage].variants],
    ]) {
      for (let index = 0; index < questions.length; index++) {
        const q = questions[index];
        for (const wrong of q.options.filter((o) => o.id !== q.answer)) {
          const s = engine.start();
          Object.assign(s, {
            conceptIndex: stage,
            quizKind: kind,
            variantIndex: index,
            phase: kind === "check" ? "awaiting_answer" : "variant",
          });
          act(s, "answer", wrong.id);
          const feedback = engine
            .view(s)
            .lesson.components.find((c) => c.type === "FeedbackCard");
          assert.equal(feedback.correct, false);
          assert.equal(feedback.errorType, q.branches[wrong.id].errorType);
          assert.equal(feedback.correctId, q.answer);
          assert.equal(feedback.explanation, q.branches[wrong.id].explanation);
          if (kind === "check" || index === 0) {
            act(s, "next");
            assert.equal(s.phase, "remediation");
            const lesson = engine.view(s).lesson.components;
            assert.ok(
              lesson.some(
                (c) =>
                  c.type === "ExplanationCard" &&
                  c.title === q.branches[wrong.id].title,
              ),
            );
            act(s, "next");
            assert.equal(s.phase, "variant");
          }
        }
      }
    }
});

test("correct variant is required for mastery; repeated mistakes remain review in summary", () => {
  for (const pass of [true, false]) {
    const s = engine.start("review");
    for (let stage = 0; stage < 3; stage++) {
      assert.equal(s.phase, "explanation");
      act(s, "next");
      act(s, "answer", quizzes[stage].main.answer);
      act(s, "next");
      for (let variant = 0; variant < (pass ? 1 : 2); variant++) {
        const q = quizzes[stage].variants[variant];
        act(
          s,
          "answer",
          pass ? q.answer : q.options.find((o) => o.id !== q.answer).id,
        );
        act(s, "next");
        if (!pass && variant === 0) {
          assert.equal(s.phase, "remediation");
          act(s, "next");
        }
      }
    }
    assert.equal(s.phase, "complete");
    assert.deepEqual(s.mastery, Array(3).fill(pass ? "mastered" : "review"));
    assert.ok(s.completedAt);
    assert.equal(s.usage.ruleSubmissions, pass ? 6 : 9);
    assert.equal(s.usage.totalTokens, 0);
    assert.equal(s.usage.costCny, 0);
  }
});

test("API isolates anonymous learners, validates requests and rejects cross-origin mutation", async () => {
  const service = await listen();
  try {
    const a = client(service),
      b = client(service);
    const created = await start(a);
    assert.equal(created.status, 200);
    assert.match(created.headers.get("set-cookie"), /HttpOnly/);
    assert.match(created.headers.get("set-cookie"), /SameSite=Strict/);
    const s = created.data.session;
    assert.equal((await b.request(`/sessions/${s.id}`)).status, 404);
    assert.equal(
      (await b.request(`/sessions/${s.id}/concepts/forwarding`)).status,
      404,
    );
    const forbidden = await a.request(
      `/sessions/${s.id}/actions`,
      { action: "next", revision: s.revision, requestId: crypto.randomUUID() },
      { headers: { Origin: "https://other.example" } },
    );
    assert.equal(forbidden.status, 403);
    const bad = await a.request(`/sessions/${s.id}/actions`, {
      action: "next",
      revision: 0,
      requestId: crypto.randomUUID(),
      correctId: "c",
    });
    assert.equal(bad.status, 400);
    const after = await a.request("/sessions/current");
    assert.equal(after.data.session.revision, 0);
    assert.equal(after.headers.get("cache-control"), "no-store");
  } finally {
    await service.close();
  }
});

test("API submissions are idempotent and stale revisions cannot overwrite progress", async () => {
  const service = await listen();
  try {
    const c = client(service);
    let s = (await start(c)).data.session;
    s = (await submit(c, s, "next")).data.session;
    const requestId = crypto.randomUUID(),
      stale = s;
    const input = { requestId };
    const first = await submit(c, s, "answer", "b", input);
    assert.equal(first.status, 200);
    const repeated = await submit(c, stale, "answer", "b", input);
    assert.equal(repeated.status, 200);
    assert.equal(repeated.data.session.answers.length, 1);
    assert.equal(repeated.data.session.usage.ruleSubmissions, 1);
    assert.equal((await submit(c, stale, "answer", "c", input)).status, 409);
    const conflict = await submit(c, stale, "next");
    assert.equal(conflict.status, 409);
    assert.equal(conflict.data.session.phase, "feedback");
    assert.equal(
      conflict.data.session.answers[0].errorType,
      "ingress-reflection",
    );
    const usage = (await c.request("/usage")).data;
    assert.equal(usage.modelConnected, false);
    assert.equal(usage.usage.ruleSubmissions, 1);
    assert.equal(usage.usage.aiCalls, 0);
  } finally {
    await service.close();
  }
});

test("SQLite keeps exact step and correction after a service restart; reset clears only this learner", async () => {
  const dir = path.resolve("outputs/home-blue-demo");
  fs.mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, `tutor-test-${crypto.randomUUID()}.sqlite`);
  let service = await listen(dbPath),
    cookie,
    id;
  try {
    const c = client(service);
    let s = (await start(c)).data.session;
    s = (await submit(c, s, "next")).data.session;
    s = (await submit(c, s, "answer", "a")).data.session;
    s = (await submit(c, s, "next")).data.session;
    cookie = c.cookie();
    id = s.id;
    assert.equal(s.phase, "remediation");
    await service.close();
    service = await listen(dbPath);
    const restoredClient = client(service, cookie);
    const restored = (await restoredClient.request("/sessions/current")).data
      .session;
    assert.equal(restored.id, id);
    assert.equal(restored.phase, "remediation");
    assert.equal(restored.answers[0].errorType, "broadcast-as-unicast");
    const other = client(service);
    const otherSession = (await start(other)).data.session;
    assert.equal(
      (await restoredClient.request("/sessions", null, { method: "DELETE" }))
        .status,
      200,
    );
    assert.equal(
      (await restoredClient.request("/sessions/current")).data.session,
      null,
    );
    assert.equal(
      (await other.request("/sessions/current")).data.session.id,
      otherSession.id,
    );
  } finally {
    await service.close();
    for (const suffix of ["", "-wal", "-shm"])
      fs.rmSync(dbPath + suffix, { force: true });
  }
});

test("new-session daily quota and action rate limits preserve existing sessions", async () => {
  const service = await listen();
  try {
    const c = client(service);
    for (let i = 0; i < 20; i++)
      assert.equal((await start(c, { restart: true })).status, 200);
    assert.equal((await start(c, { restart: true })).status, 429);
    const current = (await c.request("/sessions/current")).data.session;
    assert.equal((await start(c)).data.session.id, current.id);
    let limited = false;
    for (let i = 0; i < 75; i++) {
      const r = await submit(c, current, "answer", "a");
      if (r.status === 429) {
        limited = true;
        assert.equal(r.headers.get("retry-after"), "60");
        break;
      }
    }
    assert.ok(limited);
    assert.equal(
      (await c.request("/sessions/current")).data.session.revision,
      current.revision,
    );
  } finally {
    await service.close();
  }
});
