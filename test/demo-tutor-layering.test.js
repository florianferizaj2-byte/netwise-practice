import { test } from "node:test";
import assert from "node:assert/strict";
import { getBundle, catalogue } from "../server/demo-tutor/registry.js";
const bundles = ["02.01.02", "02.01.03"].map((s) =>
  getBundle("network-engineer:" + s),
);
const all = bundles.flatMap((b) =>
  b.quizzes.flatMap((q) => [q.main, ...q.variants]),
);
const find = (id) => all.find((q) => q.id === id);
const label = (q) => q.options.find((o) => o.id === q.answer).text;
test("model mapping and encapsulation are independent complete lessons", () => {
  assert.deepEqual(
    bundles.map((b) => b.course.concepts.length),
    [3, 4],
  );
  assert.equal(all.length, 21);
  for (const b of bundles)
    assert.equal(
      catalogue().knowledgePoints.find((n) => n.nodeId === b.course.id).status,
      "ready",
    );
});
test("stated header lengths independently reconstruct the complete frame boundary", () => {
  for (const id of [
    "layer-length-check",
    "layer-length-v1",
    "layer-length-v2",
  ]) {
    const q = find(id),
      match = q.prompt.match(
        /IPv4\/(TCP|UDP).*应用数据(\d+)B.*IPv4首部(\d+)B.*首部(\d+)B.*头(\d+)B.*FCS(\d+)B/,
      );
    assert(match, id);
    const [, protocol, ...sizes] = match;
    const values = sizes.map(Number);
    assert.equal(values[1], 20);
    assert.equal(values[2], protocol === "TCP" ? 20 : 8);
    assert.equal(
      Number.parseInt(label(q)),
      values.reduce((a, b) => a + b, 0),
    );
    const expected = new Set([
      values[0] + values[1] + values[2],
      values.reduce((a, b) => a + b, 0) - 4,
      values.reduce((a, b) => a + b, 0) + 20,
    ]);
    assert.deepEqual(
      new Set(
        q.options
          .filter((o) => o.id !== q.answer)
          .map((o) => Number.parseInt(o.text)),
      ),
      expected,
    );
  }
  assert.equal(label(find("layer-length-check")), "158 B");
  assert.equal(label(find("layer-length-v1")), "308 B");
  assert.equal(label(find("layer-length-v2")), "246 B");
});
test("trusted layer relationships, directions and exceptions are not conflated", () => {
  const expected = {
    "model-order-v1": "应用层 → 传输层 → 网际层 → 网络接口层",
    "model-order-v2": "传输层",
    "layer-relations-check": "协议",
    "layer-relations-v1": "服务",
    "layer-relations-v2": "接口",
    "model-mapping-check": "应用层",
    "model-mapping-v1": "应用层",
    "model-mapping-v2": "网络接口层",
    "model-roles-check": "网际层",
    "model-roles-v1": "传输层",
    "model-roles-v2": "网络接口层",
    "layer-encapsulation-check": "应用数据 → TCP段 → IP分组 → 以太网帧",
    "layer-encapsulation-v1": "应用数据 → UDP数据报 → IP分组 → 以太网帧",
    "layer-hop-v1": "不是，TTL等转发相关字段会变化",
    "layer-hop-v2": "不能，应按具体改写或封装机制分析",
  };
  for (const [id, text] of Object.entries(expected))
    assert.equal(label(find(id)), text, id);
  for (const q of all) {
    assert.equal(Object.keys(q.branches).length, 3);
    assert.equal(
      new Set(Object.values(q.branches).map((f) => f.explanation)).size,
      3,
    );
  }
});
