import { test } from "node:test";
import assert from "node:assert/strict";
import { getBundle, catalogue } from "../server/demo-tutor/registry.js";
import { validateBundle } from "../server/demo-tutor/authoring.js";
const suffixes = ["transport", "session", "presentation", "application"];
const bundles = suffixes.map((s) =>
  getBundle(`network-engineer:02.01.01:${s}`),
);
const questions = bundles.flatMap((b) =>
  b.quizzes.flatMap((q) => [q.main, ...q.variants]),
);
const answer = (id) => {
  const q = questions.find((q) => q.id === id);
  assert(q, id);
  return q.options.find((o) => o.id === q.answer).text;
};
test("authoring rejects sources beyond the five-entry browser contract", () => {
  const bundle = bundles[3];
  assert.equal(bundle.course.sources.length, 5);
  const invalid = {
    ...bundle,
    course: {
      ...bundle.course,
      sources: [
        ...bundle.course.sources,
        { title: "extra", url: "local:extra" },
      ],
    },
  };
  assert.throws(() => validateBundle(invalid), /课程来源/);
});
test("all seven OSI lessons are registered individually with upper lessons containing 36 graded questions", () => {
  for (const s of ["physical", "data-link", "network", ...suffixes])
    assert.equal(
      catalogue().knowledgePoints.find(
        (n) => n.nodeId === `network-engineer:02.01.01:${s}`,
      ).status,
      "ready",
    );
  assert.equal(questions.length, 36);
  assert.equal(new Set(questions.map((q) => q.id)).size, 36);
  for (const b of bundles) {
    assert.equal(b.course.concepts.length, 3);
    assert(b.quizzes.every((q) => q.variants.length === 2));
  }
});
test("upper-layer trusted standards distinguish protocol semantics, representation, dialogue and endpoint delivery", () => {
  const standards = {
    "transport-endpoints-check": "传输层",
    "transport-endpoints-v2": "传输层",
    "transport-control-check": "流量控制",
    "transport-control-v1": "拥塞控制",
    "session-lifecycle-check": "会话层",
    "session-lifecycle-v1": "会话层",
    "session-dialogue-check": "会话层",
    "session-dialogue-v1": "会话层",
    "session-checkpoints-check": "会话层",
    "presentation-syntax-check": "表示层",
    "presentation-syntax-v1": "表示层",
    "presentation-compression-check": "表示层",
    "presentation-security-check": "表示层",
    "application-services-check": "DNS",
    "application-services-v1": "HTTP",
    "application-services-v2": "SMTP",
    "application-boundary-v2": "FTP",
    "application-outcome-v1": "应用层",
  };
  for (const [id, text] of Object.entries(standards))
    assert.equal(answer(id), text, id);
});
test("no connection, compression or encryption shortcut is accepted as a broader guarantee", () => {
  assert.equal(
    answer("transport-endpoints-v1"),
    "不能，双方IP和端口共同区分TCP连接",
  );
  for (const id of [
    "transport-services-check",
    "transport-services-v1",
    "transport-services-v2",
  ])
    assert.equal(
      answer(id),
      "TCP提供可靠有序字节流；UDP提供数据报且不内建可靠有序保证",
    );
  assert.equal(
    answer("session-lifecycle-v2"),
    "不能，应用会话还依赖自身协议与状态",
  );
  assert.equal(
    answer("session-checkpoints-v1"),
    "不必然，业务完成与持久化需应用协议确认",
  );
  assert.equal(
    answer("session-checkpoints-v2"),
    "不能，需要实际协议和保存状态支持",
  );
  assert.equal(answer("presentation-compression-v1"), "无损压缩");
  assert.equal(
    answer("presentation-compression-v2"),
    "不保证每种输入都变小，也不能用压缩替代加密",
  );
  assert.equal(
    answer("presentation-security-v1"),
    "不能，实际安全机制可在不同层实现",
  );
  assert.equal(
    answer("application-outcome-check"),
    "不能，还需检查应用响应与业务约定",
  );
  for (const q of questions) {
    assert.equal(Object.keys(q.branches).length, 3);
    assert.equal(
      new Set(Object.values(q.branches).map((f) => f.explanation)).size,
      3,
    );
  }
});
