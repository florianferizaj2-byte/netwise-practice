import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStore } from "../server/store.js";
import { createApp } from "../server/index.js";
import { getBundle } from "../server/demo-tutor/registry.js";
import { TutorEngine } from "../server/demo-tutor/engine.js";
import { studyNode, studyNodes } from "../server/study-content.js";
import {
  hasCertificateQuestion,
  questionForCertificate,
} from "../server/certificates.js";

async function fixture(t) {
  process.env.ALLOWED_HOSTS = "127.0.0.1,localhost";
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "aceexam-tutor-api-"),
  );
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
    assert(path.basename(directory).startsWith("aceexam-tutor-api-"));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const users = [];
  for (const name of ["tutor-owner", "tutor-learner", "tutor-peer"]) {
    const u = await store.registerAsync(name, "fixture-password-123");
    store.selectCertificate(u.id, "network-engineer");
    users.push(u);
  }
  for (const u of users.slice(1))
    store.saveAccountEntitlement(u.id, {
      plan: "vip",
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
  const tokens = users.map((u) => store.createAuthSession(u.id));
  const req = async (url, body, token = tokens[1]) => {
    const r = await fetch(
      `http://127.0.0.1:${server.address().port}/api${url}`,
      {
        method: body ? "POST" : "GET",
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
  const start = async (courseId = "vlan-broadcast-domain", extra = {}) =>
    req("/tutor/v1/sessions", {
      courseId,
      foundation: "beginner",
      requestId: crypto.randomUUID(),
      ...extra,
    });
  const act = async (s, action = "next", optionId, extra = {}) =>
    req(`/tutor/v1/sessions/${s.id}/actions`, {
      requestId: crypto.randomUUID(),
      revision: s.revision,
      action,
      ...(optionId ? { optionId } : {}),
      ...extra,
    });
  const raw = (s) =>
    JSON.parse(
      store.db
        .prepare("SELECT data FROM interactive_tutor_sessions WHERE id=?")
        .get(s.id).data,
    );
  const waitQuiz = async (s) => {
    while (s.phase === "explanation") {
      const r = await act(s);
      assert.equal(r.status, 200);
      s = r.data.session;
    }
    return s;
  };
  const complete = async (s) => {
    const engine = new TutorEngine();
    while (s.phase !== "complete") {
      const r = ["awaiting_answer", "variant"].includes(s.phase)
        ? await act(s, "answer", engine.currentQuestion(raw(s)).answer)
        : await act(s);
      assert.equal(r.status, 200, JSON.stringify(r.data));
      s = r.data.session;
    }
    return s;
  };
  return {
    get store() {
      return store;
    },
    get app() {
      return app;
    },
    users,
    tokens,
    req,
    start,
    act,
    raw,
    waitQuiz,
    complete,
    async restart() {
      await close();
      await open();
    },
  };
}

test("real member access and certificate ownership protect every reviewed interactive course", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.req("/tutor/v1/catalog", undefined, null)).status, 401);
  assert.equal(
    (await f.req("/tutor/v1/catalog", undefined, f.tokens[0])).data.access,
    false,
    "administrators do not get free paid access",
  );
  assert.equal(
    (
      await f.req(
        "/tutor/v1/sessions",
        {
          courseId: "vlan-broadcast-domain",
          foundation: "beginner",
          requestId: crypto.randomUUID(),
        },
        f.tokens[0],
      )
    ).status,
    403,
  );
  const catalog = await f.req("/tutor/v1/catalog");
  assert.equal(catalog.cache, "no-store");
  assert.equal(
    catalog.data.nodes.filter((n) => n.status === "ready").length,
    39,
  );
  assert.equal(
    catalog.data.nodes.filter((n) => n.status === "partial").length,
    1,
  );
  assert.equal(catalog.data.nodes.length, 147);
  const questions = f.store
    .allQ()
    .filter((q) => hasCertificateQuestion(q, "network-engineer"))
    .map((q) => questionForCertificate(q, "network-engineer"));
  const pilotQuestion = questions.find(
    (q) =>
      q.knowledgePoint === "冲突域、广播域与网络设备" &&
      /VLAN/i.test(q.question) &&
      /广播/.test(q.question),
  );
  assert(pilotQuestion, "the pilot entry uses a real broadcast question");
  const path = `/tutor/v1/questions/${encodeURIComponent(pilotQuestion.id)}`;
  assert.equal((await f.req(path, undefined, null)).status, 401);
  assert.equal((await f.req(path, undefined, f.tokens[0])).status, 403);
  assert.deepEqual((await f.req(path)).data, {
    nodeId: "network-engineer:03.01.02",
    title: "冲突域、广播域与网络设备",
    courseId: "vlan-broadcast-domain",
  });
  const tags = questions.find(
    (q) => q.knowledgePoint === "802.1Q与VLAN标签" && !/广播/.test(q.question),
  );
  assert(tags);
  assert.equal(
    (await f.req(`/tutor/v1/questions/${encodeURIComponent(tags.id)}`)).data
      .courseId,
    null,
    "partial broadcast coverage must not pretend to teach unrelated tag questions",
  );
  const pending = questions.find((q) =>
    catalog.data.nodes.some(
      (n) =>
        n.status === "pending" &&
        n.chapter === q.chapter &&
        n.name === q.knowledgePoint,
    ),
  );
  assert(pending);
  assert.equal(
    (await f.req(`/tutor/v1/questions/${encodeURIComponent(pending.id)}`)).data
      .courseId,
    null,
  );
  const ambiguous = questions.find(
    (q) =>
      studyNodes.filter(
        (n) =>
          n.certificateId === "network-engineer" &&
          n.chapter === q.chapter &&
          [n.name, n.parentName, ...(n.aliases || [])].includes(
            q.targetKnowledgePoint || q.knowledgePoint,
          ),
      ).length !== 1,
  );
  if (ambiguous)
    assert.equal(
      (await f.req(`/tutor/v1/questions/${encodeURIComponent(ambiguous.id)}`))
        .data.code,
      "TUTOR_QUESTION_NOT_MAPPED",
    );
  for (const n of catalog.data.nodes.filter((n) => n.courseId)) {
    const r = await f.start(n.courseId);
    assert.equal(r.status, 200, n.id);
    const s = r.data.session;
    assert.equal(s.pacing, "guided");
    assert.equal(
      s.lesson.components.filter((c) => c.type !== "LessonProgress").length,
      1,
    );
    assert(!JSON.stringify(s).includes('"answer":'));
    assert(!JSON.stringify(s).includes('"branches":'));
    assert.equal(s.course.nodeId, n.id);
  }
  const s = (await f.start()).data.session;
  assert.equal(
    (await f.req(`/tutor/v1/sessions/${s.id}`, undefined, f.tokens[2])).status,
    404,
  );
  assert.equal(
    (
      await f.req(
        "/tutor/v1/sessions/current?courseId=vlan-broadcast-domain",
        undefined,
        f.tokens[2],
      )
    ).data.session,
    null,
  );
  f.store.selectCertificate(f.users[1].id, "sichuan-upgrading-computer");
  assert.equal((await f.req(path)).status, 404);
  assert.equal((await f.req(`/tutor/v1/sessions/${s.id}`)).status, 404);
  assert.equal((await f.req("/tutor/v1/catalog")).data.supported, false);
  f.store.selectCertificate(f.users[1].id, "network-engineer");
  assert.equal((await f.req(`/tutor/v1/sessions/${s.id}`)).status, 200);
  assert.equal(
    (await f.start("vlan-broadcast-domain", { pacing: "concept" })).status,
    400,
  );
  assert.equal(
    (await f.start("vlan-broadcast-domain", { html: "<script>" })).status,
    400,
  );
});

test("VLAN wrong options select different corrections; feedback is idempotent and the partial pilot never completes the whole node", async (t) => {
  const f = await fixture(t),
    q = getBundle("vlan-broadcast-domain").quizzes[0].main,
    wrong = q.options.filter((o) => o.id !== q.answer);
  const kinds = new Set();
  for (const o of wrong) {
    let s = (await f.start("vlan-broadcast-domain", { restart: true })).data
      .session;
    assert.equal(
      (await f.req(`/tutor/v1/sessions/${s.id}/concepts/isolation`)).status,
      403,
    );
    s = await f.waitQuiz(s);
    assert.equal(s.phase, "awaiting_answer");
    const quiz = s.lesson.components.find((c) => c.type === "MiniQuiz");
    assert(!("answer" in quiz));
    assert(!("branches" in quiz));
    const operation = {
      requestId: crypto.randomUUID(),
      revision: s.revision,
      action: "answer",
      optionId: o.id,
    };
    const result = await f.req(`/tutor/v1/sessions/${s.id}/actions`, operation);
    assert.equal(result.status, 200);
    const feedback = result.data.session;
    assert.equal(feedback.answers.at(-1).correct, false);
    assert.equal(feedback.answers.at(-1).errorType, q.branches[o.id].errorType);
    kinds.add(feedback.answers.at(-1).errorType);
    assert.deepEqual(
      (await f.req(`/tutor/v1/sessions/${s.id}/actions`, operation)).data,
      result.data,
    );
    assert.equal(f.raw(feedback).answers.length, 1);
    assert.equal((await f.act(s)).status, 409);
    const remedial = (await f.act(feedback)).data.session;
    assert.equal(remedial.phase, "remediation");
    assert(
      JSON.stringify(remedial.lesson).includes(q.branches[o.id].explanation),
    );
  }
  assert.equal(kinds.size, wrong.length);
  const before = f.store.db
    .prepare("SELECT * FROM user_usage WHERE user_id=?")
    .all(f.users[1].id);
  const done = await f.complete(
    (await f.start("vlan-broadcast-domain", { restart: true })).data.session,
  );
  assert(done.mastery.every((m) => m.status === "mastered"));
  assert.equal(
    f.store.db
      .prepare(
        "SELECT completed_at FROM study_progress WHERE user_id=? AND node_id=?",
      )
      .get(f.users[1].id, done.course.nodeId),
    undefined,
  );
  const usage = (await f.req("/tutor/v1/usage")).data.usage;
  assert(usage.ruleSubmissions > 0);
  assert.equal(usage.aiCalls, 0);
  assert.equal(usage.totalTokens, 0);
  assert.equal(usage.costCny, 0);
  assert.deepEqual(
    f.store.db
      .prepare("SELECT * FROM user_usage WHERE user_id=?")
      .all(f.users[1].id),
    before,
  );
});

test("a mastered full course updates real learning progress; saved states survive restart and commit failures roll back", async (t) => {
  const f = await fixture(t);
  let s = (await f.start("network-engineer:01.01.01")).data.session;
  s = await f.waitQuiz(s);
  const before = s;
  f.store.db.exec(
    "CREATE TRIGGER reject_tutor_request BEFORE INSERT ON interactive_tutor_requests BEGIN SELECT RAISE(FAIL,'fixture disk failure'); END;",
  );
  assert(
    (await f.act(s, "answer", getBundle(s.course.id).quizzes[0].main.answer))
      .status >= 400,
  );
  assert.deepEqual(
    (await f.req(`/tutor/v1/sessions/${s.id}`)).data.session,
    before,
  );
  f.store.db.exec("DROP TRIGGER reject_tutor_request");
  s = (await f.act(s, "answer", getBundle(s.course.id).quizzes[0].main.answer))
    .data.session;
  await f.restart();
  assert.deepEqual((await f.req(`/tutor/v1/sessions/${s.id}`)).data.session, s);
  const done = await f.complete(s);
  const progress = f.store.db
    .prepare("SELECT * FROM study_progress WHERE user_id=? AND node_id=?")
    .get(f.users[1].id, done.course.nodeId);
  assert(progress.completed_at);
  assert.equal(progress.certificate_id, "network-engineer");
  assert.equal(
    (await f.req("/tutor/v1/catalog")).data.nodes.find(
      (n) => n.id === done.course.nodeId,
    ).progress.mastered,
    true,
  );
  const pub = f.app.locals.study.published(studyNode(done.course.nodeId));
  f.app.locals.study.suspend(pub.id, f.users[0].id);
  const stopped = await f.req(`/tutor/v1/sessions/${done.id}`);
  assert.equal(stopped.status, 409);
  assert.equal(stopped.data.code, "STUDY_CONTENT_SUSPENDED");
  assert.equal(
    (await f.req("/tutor/v1/catalog")).data.nodes.find(
      (n) => n.id === done.course.nodeId,
    ).status,
    "pending",
  );
  f.store.saveAccountEntitlement(f.users[1].id, {
    plan: "vip",
    expiresAt: new Date(Date.now() - 1000).toISOString(),
  });
  assert.equal((await f.req(`/tutor/v1/sessions/${done.id}`)).status, 403);
  assert.equal((await f.req("/tutor/v1/catalog")).data.access, false);
});

test("user rate limits count request times, let lost-acknowledgement retries recover, and release old requests", async (t) => {
  const f = await fixture(t),
    start = {
      courseId: "vlan-broadcast-domain",
      foundation: "beginner",
      requestId: crypto.randomUUID(),
    };
  const s = (await f.req("/tutor/v1/sessions", start)).data.session;
  const insert = f.store.db.prepare(
    "INSERT INTO interactive_tutor_requests VALUES (?,?,?,?,?)",
  );
  for (let i = 0; i < 90; i++)
    insert.run(
      f.users[1].id,
      crypto.randomUUID(),
      s.id,
      "fixture",
      new Date().toISOString(),
    );
  assert.equal((await f.act(s)).status, 429);
  assert.equal((await f.req("/tutor/v1/sessions", start)).status, 200);
  f.store.db
    .prepare(
      "UPDATE interactive_tutor_requests SET created_at=? WHERE user_id=?",
    )
    .run(new Date(Date.now() - 90000).toISOString(), f.users[1].id);
  assert.equal((await f.act(s)).status, 200);
  assert.equal(
    (await f.act((await f.req(`/tutor/v1/sessions/${s.id}`)).data.session))
      .status,
    200,
  );
  const ordinary = f.store
    .allQ()
    .find(
      (q) =>
        q.certificates.includes("network-engineer") &&
        q.type === "single_choice",
    );
  const grade = await f.req("/attempts", {
    questionId: ordinary.id,
    selected: ordinary.answer,
    timeMs: 1,
  });
  assert.equal(grade.status, 200);
  assert.equal(grade.data.correct, true);
});
