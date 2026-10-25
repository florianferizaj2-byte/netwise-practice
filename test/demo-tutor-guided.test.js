import assert from "node:assert/strict";
import { test } from "node:test";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TutorEngine } from "../server/demo-tutor/engine.js";
import { createDemoTutorApp } from "../server/demo-tutor/app.js";
import { allBundles } from "../server/demo-tutor/registry.js";

test("guided teaching unlocks one card at a time for every reviewed course, then requires a quiz and variant", () => {
  const engine = new TutorEngine();
  for (const bundle of allBundles()) {
    const s = engine.start("beginner", bundle.course.id, "guided");
    const act = (action, optionId) =>
      engine.apply(s, { action, optionId, revision: s.revision });
    assert.throws(() => act("back"), /已读过/);
    for (let concept = 0; concept < bundle.course.concepts.length; concept++) {
      const expected = [
        bundle.foundations[concept],
        ...bundle.teaching[concept],
      ];
      const seen = new Set();
      for (let index = 0; index < expected.length; index++) {
        const v = engine.view(s);
        assert.equal(v.phase, "explanation");
        assert.equal(v.conceptIndex, concept);
        assert.deepEqual(v.lesson.components.slice(1), [expected[index]]);
        assert.equal(v.reading.index, index);
        assert.equal(v.reading.total, expected.length);
        assert(!seen.has(v.stepId));
        seen.add(v.stepId);
        assert.equal(
          engine.review(s, bundle.course.concepts[concept].id).components
            .length,
          index + 1,
        );
        if (concept + 1 < bundle.course.concepts.length)
          assert.throws(
            () => engine.review(s, bundle.course.concepts[concept + 1].id),
            /先学习/,
          );
        assert.throws(
          () => act("answer", bundle.quizzes[concept].main.answer),
          /未进入答题/,
        );
        if (index > 0) {
          act("back");
          assert.equal(
            engine.view(s).lesson.components[1].id,
            expected[index - 1].id,
          );
          act("next");
          assert.equal(engine.view(s).stepId, v.stepId);
        }
        act("next");
      }
      const quiz = engine
        .view(s)
        .lesson.components.find((c) => c.type === "MiniQuiz");
      assert.equal(quiz.id, bundle.quizzes[concept].main.id);
      for (const secret of ["answer", "correctId", "branches", "grading"])
        assert(!Object.hasOwn(quiz, secret));
      assert.throws(() => act("next"), /先完成当前小测/);
      assert.throws(() => act("back"), /已读过/);
      act("answer", bundle.quizzes[concept].main.answer);
      act("next");
      assert.equal(s.phase, "variant");
      act("answer", bundle.quizzes[concept].variants[0].answer);
      act("next");
    }
    assert.equal(s.phase, "complete");
    assert(s.mastery.every((m) => m === "mastered"));
    assert.equal(s.usage.ruleSubmissions, bundle.course.concepts.length * 2);
    assert.equal(s.usage.aiCalls, 0);
  }
});

test("guided API restores the exact reading card after a service restart, isolates learners, and deduplicates actions", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aceexam-tutor-guided-"));
  const databasePath = path.join(dir, "tutor.sqlite");
  let service;
  const listen = async () => {
    const app = createDemoTutorApp({ databasePath });
    const server = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    return {
      app,
      server,
      base: `http://127.0.0.1:${server.address().port}/api/demo/tutor/v1`,
    };
  };
  const close = async () => {
    if (!service) return;
    await new Promise((resolve) => service.server.close(resolve));
    service.app.locals.closeTutor();
    service = null;
  };
  let cookie = "";
  const request = async (route, body, owner = cookie) => {
    const res = await fetch(service.base + route, {
      method: body ? "POST" : "GET",
      headers: {
        ...(owner ? { cookie: owner } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!cookie) cookie = res.headers.get("set-cookie")?.split(";")[0] || "";
    return { status: res.status, body: await res.json() };
  };
  try {
    service = await listen();
    let s = (
      await request("/sessions", {
        courseId: "vlan-broadcast-domain",
        foundation: "beginner",
        pacing: "guided",
        requestId: crypto.randomUUID(),
      })
    ).body.session;
    const action = {
      action: "next",
      revision: s.revision,
      requestId: crypto.randomUUID(),
    };
    s = (await request(`/sessions/${s.id}/actions`, action)).body.session;
    const repeated = await request(`/sessions/${s.id}/actions`, action);
    assert.equal(repeated.status, 200);
    assert.equal(repeated.body.session.revision, s.revision);
    assert.equal(
      (
        await request(`/sessions/${s.id}/actions`, {
          ...action,
          action: "back",
        })
      ).status,
      409,
    );
    const latestCard = s.lesson.components[1].id;
    await close();
    service = await listen();
    const restored = (await request("/sessions/current")).body.session;
    assert.equal(restored.id, s.id);
    assert.equal(restored.stepId, s.stepId);
    assert.equal(restored.reading.index, 1);
    assert.equal(restored.lesson.components[1].id, latestCard);
    assert.equal(
      (
        await request(
          `/sessions/${s.id}`,
          null,
          "aceexam_tutor_demo=" + "0".repeat(64),
        )
      ).status,
      404,
    );
    const previous = await request(`/sessions/${s.id}/actions`, {
      action: "back",
      revision: restored.revision,
      requestId: crypto.randomUUID(),
    });
    assert.equal(previous.status, 200);
    assert.equal(previous.body.session.reading.index, 0);
    assert.equal(
      (
        await request(`/sessions/${s.id}/actions`, {
          action: "next",
          teachingIndex: 99,
          revision: previous.body.session.revision,
          requestId: crypto.randomUUID(),
        })
      ).status,
      400,
    );
    assert.equal((await request("/usage")).body.usage.ruleSubmissions, 0);
  } finally {
    await close();
    assert.equal(path.dirname(dir), path.resolve(os.tmpdir()));
    assert(path.basename(dir).startsWith("aceexam-tutor-guided-"));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("existing concept sessions can switch to guided reading without resetting answers or mastery", () => {
  const engine = new TutorEngine();
  const s = engine.start("review");
  s.conceptIndex = 1;
  s.mastery[0] = "mastered";
  s.answers.push({
    questionId: "previous",
    conceptId: "forwarding",
    correct: true,
  });
  const answers = structuredClone(s.answers);
  engine.apply(s, { action: "guide", revision: s.revision });
  assert.equal(s.conceptIndex, 1);
  assert.equal(s.mastery[0], "mastered");
  assert.deepEqual(s.answers, answers);
  assert.equal(engine.view(s).reading.index, 0);
  assert.equal(engine.view(s).lesson.components.length, 2);
  s.courseVersion = "obsolete";
  assert.throws(
    () => engine.review(s, "forwarding"),
    (error) => error.status === 409 && error.code === "TUTOR_VERSION_CHANGED",
  );
});
