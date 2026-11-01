import { test } from "node:test";
import assert from "node:assert/strict";
import { getBundle, catalogue } from "../server/demo-tutor/registry.js";
import { TutorEngine } from "../server/demo-tutor/engine.js";
const suffixes = ["physical", "data-link", "network"];
const bundles = suffixes.map((s) =>
  getBundle(`network-engineer:02.01.01:${s}`),
);
const questions = bundles.flatMap((b) =>
  b.quizzes.flatMap((q) => [q.main, ...q.variants]),
);
const find = (id) => questions.find((q) => q.id === id);
const label = (q) => q.options.find((o) => o.id === q.answer).text;
test("three separately addressable lower OSI lessons cover nine concepts and 27 questions", () => {
  for (const b of bundles) {
    assert.equal(
      catalogue().knowledgePoints.find((n) => n.nodeId === b.course.id).status,
      "ready",
    );
    assert.equal(b.course.concepts.length, 3);
    assert.equal(b.quizzes.length, 3);
  }
  assert.equal(questions.length, 27);
  assert.equal(new Set(questions.map((q) => q.id)).size, 27);
});
test("MAC learning answers independently follow source and incoming interface from each scenario", () => {
  for (const q of questions.filter((q) => q.prompt.includes("开启动态学习"))) {
    const [, port, source] = q.prompt.match(/在端口(\d+)收到源MAC=([^、]+)、/);
    assert.equal(label(q), `${source} → 端口${port}`);
  }
  assert.equal(label(find("link-switch-v1")), "端口2和3");
  assert.equal(label(find("link-switch-v2")), "仅向端口3转发");
  assert.equal(label(find("link-frame-check")), "本地网关在该链路上的MAC");
});
test("IP rules retain scope: routing is layer 3, endpoint ports layer 4, IPv6 routers do not fragment", () => {
  for (const id of [
    "network-routing-check",
    "network-routing-v1",
    "network-routing-v2",
  ])
    assert.equal(label(find(id)), "网络层");
  assert.equal(label(find("network-service-v2")), "传输层");
  assert.equal(label(find("network-service-check")), "不能，IP是尽力而为服务");
  assert.equal(
    label(find("network-service-v1")),
    "不在路由器上分片，按规范返回Packet Too Big",
  );
  assert.equal(
    label(find("network-hop-v2")),
    "最终目的IP通常保持，TTL递减，链路帧重新封装",
  );
  assert.equal(label(find("physical-bits-check")), "物理层");
});
test("every lower-layer distractor supplies its own factual explanation after grading, never before", () => {
  const engine = new TutorEngine();
  for (const b of bundles)
    for (let i = 0; i < b.quizzes.length; i++) {
      const group = b.quizzes[i];
      for (const [variant, q] of [group.main, ...group.variants].entries()) {
        assert.equal(
          new Set(Object.values(q.branches).map((f) => f.errorType)).size,
          3,
        );
        assert.equal(
          new Set(Object.values(q.branches).map((f) => f.explanation)).size,
          3,
        );
        for (const o of q.options.filter((o) => o.id !== q.answer)) {
          const s = engine.start("review", b.course.id);
          s.conceptIndex = i;
          s.quizKind = variant ? "variant" : "check";
          s.variantIndex = Math.max(0, variant - 1);
          s.phase = variant ? "variant" : "awaiting_answer";
          const publicQ = engine.view(s).lesson.components.at(-1);
          assert.equal(publicQ.type, "MiniQuiz");
          assert(!("answer" in publicQ));
          assert(!("branches" in publicQ));
          engine.apply(s, {
            revision: s.revision,
            action: "answer",
            optionId: o.id,
          });
          assert.equal(s.feedback.errorType, q.branches[o.id].errorType);
          assert.equal(
            engine.view(s).lesson.components.at(-1).explanation,
            q.branches[o.id].explanation,
          );
        }
      }
    }
});
