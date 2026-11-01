import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { allBundles, catalogue } from "../server/demo-tutor/registry.js";
import { TutorEngine } from "../server/demo-tutor/engine.js";
import { createDemoTutorApp } from "../server/demo-tutor/app.js";
const engine = new TutorEngine();
const act = (s, action, optionId) =>
  engine.apply(s, { revision: s.revision, action, optionId });
test("all authored courses complete with variable concept counts and no early answer fields", () => {
  for (const b of allBundles()) {
    const s = engine.start("beginner", b.course.id);
    while (s.phase !== "complete") {
      const view = engine.view(s);
      assert.equal(view.lesson.components[0].total, b.course.concepts.length);
      if (["awaiting_answer", "variant"].includes(s.phase)) {
        assert.equal(view.lesson.components.at(-1).type, "MiniQuiz");
        for (const key of ["answer", "branches", "explanation", "correctId"])
          assert.equal(
            Object.hasOwn(view.lesson.components.at(-1), key),
            false,
          );
        act(s, "answer", engine.currentQuestion(s).answer);
      } else act(s, "next");
    }
    assert(s.mastery.every((m) => m === "mastered"));
    assert.equal(s.answers.length, 2 * b.course.concepts.length);
    assert.equal(
      engine.view(s).lesson.components[0].current,
      b.course.concepts.length,
    );
  }
});
test("every new incorrect option yields its exact error and remediation, including second variants", () => {
  for (const b of allBundles().filter(
    (b) => b.course.id !== "vlan-broadcast-domain",
  ))
    for (let i = 0; i < b.quizzes.length; i++) {
      const questions = [b.quizzes[i].main, ...b.quizzes[i].variants];
      for (let j = 0; j < questions.length; j++)
        for (const o of questions[j].options.filter(
          (o) => o.id !== questions[j].answer,
        )) {
          const s = engine.start("review", b.course.id);
          s.conceptIndex = i;
          s.quizKind = j ? "variant" : "check";
          s.variantIndex = Math.max(0, j - 1);
          s.phase = j ? "variant" : "awaiting_answer";
          act(s, "answer", o.id);
          const fault = questions[j].branches[o.id];
          assert.equal(s.feedback.errorType, fault.errorType);
          assert.equal(
            engine.view(s).lesson.components.at(-1).explanation,
            fault.explanation,
          );
          act(s, "next");
          engine.view(s);
          if (s.phase === "remediation")
            assert(
              engine
                .view(s)
                .lesson.components.some((c) => c.title === fault.title),
            );
        }
    }
});
test("independent mathematical reference checks match trusted answers", () => {
  const find = (id) =>
    allBundles()
      .flatMap((b) => b.quizzes.flatMap((q) => [q.main, ...q.variants]))
      .find((q) => q.id === id);
  const answer = (id) => {
    const q = find(id);
    return q.options.find((o) => o.id === q.answer).text;
  };
  assert.equal(answer("binary-check"), String(32 + 8 + 2 + 1));
  assert.equal(answer("binary-variant-1"), String(16 + 8 + 1));
  assert.equal(answer("binary-variant-2"), String(32 + 4 + 1));
  assert.equal(answer("hex-check"), "00111010");
  assert.equal(answer("hex-variant-1"), "F0");
  assert.equal(answer("hex-variant-2"), "00001111");
  assert.equal(answer("decimal-hex-check"), "AD");
  assert.equal(answer("decimal-hex-variant-2"), "43");
  assert.equal(answer("bcd-check"), "92");
  assert.equal(answer("bcd-variant-1"), "01000101");
  assert.equal(answer("bcd-variant-2"), "不是合法8421 BCD");
  assert.equal(answer("normalize-check"), "0.101×2^1");
  assert.equal(answer("normalize-variant-1"), "1.01×2^0");
  assert.equal(answer("normalize-variant-2"), "1.01×2^2");
  assert.equal(answer("float-value-check"), "5");
  assert.equal(answer("float-value-variant-1"), "6");
  assert.equal(answer("float-value-variant-2"), "0.375");
  assert.equal((1 / 8 + 1 / 32) * 2 ** 3, (1 / 2 + 1 / 8) * 2 ** 1);
  assert.equal((1 / 2 + 1 / 8) * 2 ** 3, (1 + 1 / 4) * 2 ** 2);
});
test("separate knowledge courses resume independently and count rule usage without model calls", async () => {
  const app = createDemoTutorApp();
  const server = await new Promise((r) => {
    const s = app.listen(0, "127.0.0.1", () => r(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/demo/tutor/v1`;
  let cookie = "";
  const request = async (route, body) => {
    const r = await fetch(base + route, {
      headers: {
        cookie,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
    });
    if (r.headers.get("set-cookie"))
      cookie = r.headers.get("set-cookie").split(";")[0];
    return { status: r.status, data: await r.json() };
  };
  try {
    const ids = ["network-engineer:01.01.01", "network-engineer:01.01.03"];
    const sessions = [];
    for (const courseId of ids) {
      const r = await request("/sessions", {
        courseId,
        foundation: "review",
        restart: false,
        requestId: crypto.randomUUID(),
      });
      assert.equal(r.status, 200);
      sessions.push(r.data.session);
    }
    const a = await request(`/sessions/${sessions[0].id}/actions`, {
      action: "next",
      revision: 0,
      requestId: crypto.randomUUID(),
    });
    assert.equal(a.status, 200);
    for (let i = 0; i < 2; i++) {
      const r = await request(
        "/sessions/current?courseId=" + encodeURIComponent(ids[i]),
      );
      assert.equal(r.data.session.id, sessions[i].id);
      assert.equal(r.data.session.phase, i ? "explanation" : "awaiting_answer");
    }
    const q = engine.currentQuestion({
      ...engine.start("review", ids[0]),
      phase: "awaiting_answer",
    });
    const graded = await request(`/sessions/${sessions[0].id}/actions`, {
      action: "answer",
      optionId: q.answer,
      revision: 1,
      requestId: crypto.randomUUID(),
    });
    assert.equal(graded.status, 200);
    const usage = (await request("/usage")).data.usage;
    assert.equal(usage.ruleSubmissions, 1);
    assert.equal(usage.aiCalls, 0);
    assert.equal(
      (
        await request("/sessions", {
          courseId: catalogue().knowledgePoints.find(
            (n) => n.status === "pending",
          ).nodeId,
          foundation: "review",
          restart: false,
          requestId: crypto.randomUUID(),
        })
      ).status,
      404,
    );
    assert.deepEqual(
      (await request("/catalog")).data.coverage,
      catalogue().coverage,
    );
  } finally {
    await new Promise((r) => server.close(r));
    app.locals.closeTutor();
  }
});
