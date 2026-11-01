import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createLocationLearning } from "../server/location-learning.js";
import { createStore } from "../server/store.js";
import { createApp } from "../server/index.js";

function fixture(t, { count = 35, groups = false } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE fixture_attempts(id TEXT PRIMARY KEY,question TEXT,correct INTEGER,user TEXT)",
  );
  t.after(() => db.close());
  let time = Date.parse("2026-10-24T01:00:00Z");
  const hidden = new Set();
  const questions = Array.from({ length: count }, (_, i) => ({
    id: "fixture-" + i,
    certificates: ["network-engineer"],
    chapter: "Fixture chapter",
    knowledgeSection: "Fixture section",
    knowledgePoint: "Fixture leaf",
    type: "single_choice",
    question: "Fixture question " + i,
    options: { A: "Correct", B: "Incorrect" },
    answer: ["A"],
    analysis: "Synthetic fixture explanation, not real exam content.",
    ...(groups
      ? {
          sharedGroupId: "group-" + Math.floor(i / 4),
          sharedStem: "Shared fixture material",
        }
      : {}),
  }));
  const store = {
    db,
    getQ: (id) => questions.find((q) => q.id === id),
    isQuestionHidden: (id) => hidden.has(id),
    attemptedQuestionIds(user) { return new Set(db.prepare("SELECT question FROM fixture_attempts WHERE user=?").all(user).map(r=>r.question)); },
    recordAttempt(id, selected, _ms, _mode, user = "learner") {
      const q = this.getQ(id),
        correct = JSON.stringify(selected) === JSON.stringify(q.answer);
      db.prepare("INSERT INTO fixture_attempts VALUES(?,?,?,?)").run(
        crypto.randomUUID(),
        id,
        correct ? 1 : 0,
        user,
      );
      return { correct, answer: q.answer, analysis: q.analysis };
    },
  };
  const service = createLocationLearning(store, {
    now: () => time,
    questionsForCertificate: (certificate) =>
      questions.filter(
        (q) => q.certificates.includes(certificate) && !hidden.has(q.id),
      ),
  });
  const context = ["learner", "network-engineer"],
    start = () =>
      service.start(...context, service.status(...context).points[0].id);
  function dwell(status, ms) {
    let current = status;
    const s = status.session,
      leaseId = crypto.randomUUID(),
      body = {
        questionId: s.question.id,
        challenge: s.challenge,
        phase: s.phase,
        leaseId,
      };
    current = service.present(...context, s.id, body);
    for (let elapsed = 0, sequence = 1; elapsed < ms; sequence++) {
      const delta = Math.min(1500, ms - elapsed);
      time += delta;
      elapsed += delta;
      current = service.pulse(...context, s.id, { ...body, sequence });
    }
    return current;
  }
  const answer = (status, selected = ["B"]) =>
    service.answer(...context, status.session.id, {
      questionId: status.session.question.id,
      challenge: status.session.challenge,
      selected,
    });
  const advance = (status) =>
    service.advance(...context, status.session.id, {
      questionId: status.session.question.id,
      challenge: status.session.challenge,
    });
  return {
    db,
    store,
    service,
    context,
    questions,
    hidden,
    start,
    dwell,
    answer,
    advance,
    tick: (ms) => {
      time += ms;
    },
  };
}
test("location learning uses one exact current-certificate leaf and hides answers before submission", (t) => {
  const f = fixture(t),
    status = f.start();
  assert.equal(status.policy.count, 10);
  assert.equal(status.unlocked, false);
  assert.equal(status.session.total, 10);
  assert.equal(status.session.question.answer, undefined);
  assert.equal(status.session.question.analysis, undefined);
  const internal = JSON.parse(
    f.db.prepare("SELECT data FROM location_learning_sessions").get().data,
  );
  assert.equal(new Set(internal.questions.map((q) => q.id)).size, 10);
  assert.ok(
    internal.questions.every((q) => q.knowledgePoint === "Fixture leaf"),
  );
});
test("fewer than ten unseen questions exempts the gate, but indivisible groups do not falsely satisfy ten", t => {
  const small=fixture(t,{count:9}), state=small.service.status(...small.context);
  assert.equal(state.remainingCount,9);assert.equal(state.unlocked,true);
  assert.equal(state.exemption,'insufficient_unseen_questions');
  assert.ok(small.service.permit(...small.context).permit);
  const grouped=fixture(t,{count:32,groups:true});
  assert.equal(grouped.service.status(...grouped.context).unlocked,false);
  assert.throws(()=>grouped.start(),/10/);
});

test('ten-question policy still selects whole material groups', t => {
  const f = fixture(t, {count:10,groups:true});
  const state = f.start();
  assert.equal(state.session.total,10);
  const stored=JSON.parse(f.db.prepare('SELECT data FROM location_learning_sessions').get().data);
  assert.equal(stored.questions.length,10);
  for(const q of stored.questions) assert.equal(stored.questions.filter(x=>x.sharedGroupId===q.sharedGroupId).length,
    f.questions.filter(x=>x.sharedGroupId===q.sharedGroupId).length);
});

function legacyRound(f, completed) {
  f.start();
  const stored=JSON.parse(f.db.prepare('SELECT data FROM location_learning_sessions').get().data);
  stored.questions=f.questions.slice(0,30);
  stored.index=completed; stored.phase='answer';
  stored.results=stored.questions.slice(0,completed).map(q=>({questionId:q.id,selected:['A'],...f.store.recordAttempt(q.id,['A'])}));
  f.db.prepare('UPDATE location_learning_sessions SET data=? WHERE id=?').run(JSON.stringify(stored),stored.id);
  return stored.id;
}

test('existing 30-question round keeps eight completed answers and finishes after two more', t => {
  const f=fixture(t), id=legacyRound(f,8);
  let state=f.service.status(...f.context);
  assert.equal(state.session.completedCount,8); assert.equal(state.session.total,10);
  for(let i=0;i<2;i++) state=f.advance(f.answer(f.dwell(state,1000),['A']));
  assert.equal(state.unlocked,true); assert.equal(state.session.completedCount,10);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM fixture_attempts').get().n,10);
  const saved=JSON.parse(f.db.prepare('SELECT data FROM location_learning_sessions WHERE id=?').get(id).data);
  assert.equal(saved.questions.length,30); assert.equal(saved.results.length,10);
});

test('existing round with twelve completed answers immediately qualifies without deleting old attempts', t => {
  const f=fixture(t), id=legacyRound(f,12);
  const permit=f.service.permit(...f.context).permit;
  assert.equal(f.service.consume(...f.context,permit).allowed,true);
  assert.equal(f.service.status(...f.context).unlocked,true);
  const saved=JSON.parse(f.db.prepare('SELECT data FROM location_learning_sessions WHERE id=?').get(id).data);
  assert.equal(saved.state,'completed'); assert.equal(saved.questions.length,30); assert.equal(saved.results.length,12);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM fixture_attempts').get().n,12);
});
test("single-choice requires exactly 1 second and rejects invalid or duplicated selections", (t) => {
  const f = fixture(t);
  let state = f.start();
  assert.throws(
    () => f.answer(state),
    (error) => error.code === "LOCATION_LEARNING_TIME_REQUIRED",
  );
  assert.equal(
    f.db.prepare("SELECT count(*) AS n FROM fixture_attempts").get().n,
    0,
  );
  assert.equal(state.policy.answerMs, 1000);
  assert.equal(state.policy.pulseIntervalMs, 1000);
  assert.equal(state.session.requiredMs, 1000);
  state = f.dwell(state, 999);
  assert.equal(state.session.activeMs, 999);
  assert.throws(
    () => f.answer(state),
    (error) => error.code === "LOCATION_LEARNING_TIME_REQUIRED",
  );
  state = f.dwell(state, 1);
  assert.equal(state.session.activeMs, 1000);
  assert.throws(() => f.answer(state, ["A", "B"]), /题型/);
  assert.throws(() => f.answer(state, ["A", "A"]), /题型/);
  assert.equal(f.service.status(...f.context).session.completedCount, 0);
  state = f.answer(state, ["A"]);
  assert.equal(state.session.feedback.correct, true);
  assert.equal(f.advance(state).session.completedCount, 1);
});
test("client elapsed times, background gaps, duplicate pulses and overlapping pages do not bypass server timing", (t) => {
  const f = fixture(t),
    state = f.start(),
    s = state.session,
    body = {
      questionId: s.question.id,
      phase: s.phase,
      challenge: s.challenge,
      leaseId: crypto.randomUUID(),
    };
  f.service.present(...f.context, s.id, body);
  f.tick(60000);
  let next = f.service.pulse(...f.context, s.id, { ...body, sequence: 1 });
  assert.equal(next.session.activeMs, 0);
  f.tick(1500);
  next = f.service.pulse(...f.context, s.id, { ...body, sequence: 2 });
  assert.equal(next.session.activeMs, 1500);
  f.tick(1500);
  next = f.service.pulse(...f.context, s.id, { ...body, sequence: 2 });
  assert.equal(next.session.activeMs, 1500);
  f.service.pause(...f.context, s.id, body.leaseId);
  f.tick(60000);
  const second = { ...body, leaseId: crypto.randomUUID() };
  next = f.service.present(...f.context, s.id, second);
  assert.equal(next.session.activeMs, 1500);
  assert.throws(
    () => f.service.pulse(...f.context, s.id, { ...body, sequence: 3 }),
    (error) => error.code === "LOCATION_LEARNING_LEASE_CHANGED",
  );
});
test("wrong answers count after exactly 3 seconds of explanation reading, without a correction or accuracy threshold", (t) => {
  const f = fixture(t);
  let state = f.answer(f.dwell(f.start(), 1000));
  assert.equal(state.session.feedback.correct, false);
  assert.equal(state.session.completedCount, 0);
  assert.throws(
    () => f.advance(state),
    (error) => error.code === "LOCATION_LEARNING_REVIEW_REQUIRED",
  );
  assert.equal(state.policy.wrongReviewMs, 3000);
  assert.equal(state.session.requiredMs, 3000);
  state = f.dwell(state, 1500);
  const session = state.session,
    presence = {
      questionId: session.question.id,
      challenge: session.challenge,
      phase: session.phase,
      leaseId: session.leaseId,
    };
  f.tick(1499);
  state = f.service.pulse(...f.context, session.id, { ...presence, sequence: 2 });
  assert.equal(state.session.activeMs, 2999);
  assert.throws(
    () => f.advance(state),
    (error) => error.code === "LOCATION_LEARNING_REVIEW_REQUIRED",
  );
  f.tick(1);
  state = f.service.pulse(...f.context, session.id, { ...presence, sequence: 3 });
  assert.equal(state.session.activeMs, 3000);
  state = f.advance(state);
  assert.equal(state.session.completedCount, 1);
  assert.equal(state.session.correctCount, 0);
  assert.equal(state.session.phase, "answer");
});
test("correct answers may advance without the wrong-answer reading hold", (t) => {
  const f = fixture(t);
  const state = f.advance(f.answer(f.dwell(f.start(), 1000), ["A"]));
  assert.equal(state.session.completedCount, 1);
  assert.equal(state.session.correctCount, 1);
});
test("lost acknowledgement retries never duplicate an answer or completed question", (t) => {
  const f = fixture(t),
    ready = f.dwell(f.start(), 1000),
    body = {
      questionId: ready.session.question.id,
      challenge: ready.session.challenge,
      selected: ["A"],
    };
  let state = f.service.answer(...f.context, ready.session.id, body);
  assert.deepEqual(
    f.service.answer(...f.context, ready.session.id, body),
    state,
  );
  assert.throws(
    () =>
      f.service.answer(...f.context, ready.session.id, {
        ...body,
        selected: ["B"],
      }),
    /不能更换/,
  );
  const advance = {
    questionId: state.session.question.id,
    challenge: state.session.challenge,
  };
  state = f.service.advance(...f.context, state.session.id, advance);
  assert.equal(
    f.service.advance(...f.context, state.session.id, advance).session
      .completedCount,
    1,
  );
  assert.equal(
    f.db.prepare("SELECT count(*) AS n FROM fixture_attempts").get().n,
    1,
  );
});
test("10 wrong answers can unlock the day; permits are scoped, one-use and cannot be minted early", (t) => {
  const f = fixture(t);
  assert.throws(
    () => f.service.permit(...f.context),
    (error) => error.status === 403,
  );
  let state = f.start();
  for (let i = 0; i < 10; i++)
    state = f.advance(f.dwell(f.answer(f.dwell(state, 1000)), 3000));
  assert.equal(state.unlocked, true);
  assert.equal(state.session.completedCount, 10);
  assert.equal(state.session.correctCount, 0);
  assert.equal(f.service.status(...f.context).unlocked, true);
  const permit = f.service.permit(...f.context).permit;
  assert.throws(() => f.service.consume("other", f.context[1], permit));
  assert.throws(() =>
    f.service.consume(f.context[0], "sichuan-upgrading-computer", permit),
  );
  assert.equal(f.service.consume(...f.context, permit).allowed, true);
  assert.throws(() => f.service.consume(...f.context, permit));
  assert.ok(f.service.permit(...f.context).permit);
  assert.equal(
    f.db.prepare("SELECT count(*) AS n FROM fixture_attempts").get().n,
    10,
  );
  f.tick(86400000);
  assert.equal(f.service.status(...f.context).unlocked, false);
  assert.throws(() => f.service.permit(...f.context));
});
test("account and certificate isolation, abandonment and withdrawn questions preserve ordinary attempts", (t) => {
  const f = fixture(t);
  let state = f.start();
  assert.throws(
    () =>
      f.service.answer("other", f.context[1], state.session.id, {
        questionId: state.session.question.id,
        challenge: state.session.challenge,
        selected: ["B"],
      }),
    (error) => error.status === 404,
  );
  state = f.advance(f.answer(f.dwell(state, 1000), ["A"]));
  f.hidden.add(state.session.question.id);
  assert.equal(f.service.status(...f.context).session, null);
  assert.equal(
    f.db.prepare("SELECT count(*) AS n FROM fixture_attempts").get().n,
    1,
  );
});
test("permit expiry and model-free quiz traffic fail closed without consuming AI credits", (t) => {
  const f = fixture(t);
  let state = f.start();
  for (let i = 0; i < 10; i++)
    state = f.advance(f.answer(f.dwell(state, 1000), ["A"]));
  const permit = f.service.permit(...f.context).permit;
  f.tick(31000);
  assert.throws(
    () => f.service.consume(...f.context, permit),
    (error) => error.status === 403,
  );
  assert.equal(
    f.db.prepare("SELECT count(*) AS n FROM fixture_attempts").get().n,
    10,
  );
});

test("location learning API authenticates, validates strict timing payloads and records real ordinary attempts", async (t) => {
  const parent = path.resolve("tmp"),
    directory = fs.mkdtempSync(path.join(parent, "location-learning-api-")),
    store = createStore(directory);
  let clock = Date.parse("2026-10-24T01:00:00Z");
  const owner = store.register("location_gate_owner", "fixture-password-123"),
    other = store.register("location_gate_other", "fixture-password-123");
  for (const user of [owner, other])
    store.selectCertificate(user.id, "network-engineer");
  const token = store.createAuthSession(owner.id),
    otherToken = store.createAuthSession(other.id),
    app = await createApp({
      store,
      withFrontend: false,
      accountSecurity: { enabled: false },
      locationLearningNow: () => clock,
    }),
    server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    await app.locals.stop();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    store.db.close();
    assert.equal(path.dirname(fs.realpathSync(directory)), parent);
    assert.ok(path.basename(directory).startsWith("location-learning-api-"));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const req = async (url = "", body, auth = token) => {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/location-learning${url}`,
      {
        method: body ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          ...(auth ? { Authorization: "Bearer " + auth } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    return { status: response.status, data: await response.json() };
  };
  assert.equal((await req("", undefined, null)).status, 401);
  assert.equal((await req("/permit", {})).status, 403);
  const status = (await req()).data,
    point = status.points.find((p) => p.eligible);
  assert.ok(point, "runtime certificate must have a real eligible leaf");
  let state = (await req("/start", { pointId: point.id })).data;
  assert.equal(
    (await req("/start", { pointId: point.id, certificateId: "other" })).status,
    400,
  );
  const s = state.session,
    presence = {
      questionId: s.question.id,
      challenge: s.challenge,
      phase: "answer",
      leaseId: crypto.randomUUID(),
    };
  assert.equal(
    (await req("/" + s.id + "/present", presence, otherToken)).status,
    404,
  );
  assert.equal(
    (
      await req("/" + s.id + "/pulse", {
        ...presence,
        sequence: 1,
        timeMs: 6000,
      })
    ).status,
    400,
  );
  for (let i = 0; i < 10; i++) {
    let session = state.session;
    let body = {
      questionId: session.question.id,
      challenge: session.challenge,
      phase: session.phase,
      leaseId: crypto.randomUUID(),
    };
    await req("/" + session.id + "/present", body);
    for (let sequence = 1; sequence <= 4; sequence++) {
      clock += 1500;
      state = (await req("/" + session.id + "/pulse", { ...body, sequence }))
        .data;
    }
    const q = store.getQ(session.question.id),
      selected = Object.keys(q.options).find(
        (key) => JSON.stringify([key]) !== JSON.stringify(q.answer),
      );
    const result = await req("/" + session.id + "/answer", {
      questionId: q.id,
      challenge: session.challenge,
      selected: [selected],
    });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    state = result.data;
    assert.equal(state.session.feedback.correct, false);
    session = state.session;
    body = {
      questionId: q.id,
      challenge: session.challenge,
      phase: "review",
      leaseId: crypto.randomUUID(),
    };
    await req("/" + session.id + "/present", body);
    for (let sequence = 1; sequence <= 6; sequence++) {
      clock += 1500;
      state = (await req("/" + session.id + "/pulse", { ...body, sequence }))
        .data;
    }
    const advanced = await req("/" + session.id + "/advance", {
      questionId: q.id,
      challenge: session.challenge,
    });
    assert.equal(advanced.status, 200, JSON.stringify(advanced.data));
    state = advanced.data;
  }
  assert.equal(state.unlocked, true);
  assert.equal(store.allA(owner.id).length, 10);
  assert.equal(store.allA(owner.id).filter((a) => a.correct).length, 0);
  assert.equal(store.allA(other.id).length, 0);
  const permit = (await req("/permit", {})).data.permit;
  assert.equal((await req("/consume", { permit })).status, 200);
  assert.equal((await req("/consume", { permit })).status, 403);
  assert.equal(store.points.finance().aiSpentMicros, 0);
});

test('multiple short chapters compose ten unique unseen questions and attempts are shared across practice modes',t=>{
 const f=fixture(t,{count:18});
 f.questions.forEach((q,i)=>{q.chapter='Chapter '+Math.floor(i/6);q.knowledgePoint='Point '+Math.floor(i/6)});
 const first=f.questions[0];f.store.recordAttempt(first.id,['B'],0,'practice',f.context[0]);
 let state=f.service.status(...f.context);
 assert.equal(state.remainingCount,17);assert.equal(state.points[0].questionCount,5);
 assert.throws(()=>f.service.start(...f.context,[state.points[0].id]),/10/);
 state=f.service.start(...f.context,state.points.slice(0,2).map(p=>p.id));
 assert.equal(state.session.questions.length,10);
 assert.ok(!state.session.questions.some(q=>q.id===first.id));
 assert.equal(new Set(state.session.questions.map(q=>q.id)).size,10);
 assert.ok(!state.session.questions.some(q=>q.answer));
 const answered=f.answer(f.dwell(state,1000),['A']);
 assert.equal(f.store.attemptedQuestionIds(f.context[0]).size,2);
 assert.equal(f.service.status(...f.context).remainingCount,16);
 assert.equal(answered.session.reviews.length,1);
 assert.equal(f.service.status('other',f.context[1]).remainingCount,18);
 const pulse=f.dwell(answered,0);assert.equal(pulse.session.questions,undefined,'heartbeat does not resend all question bodies');
});
