import { test } from "node:test";
import assert from "node:assert/strict";
import { getBundle, catalogue } from "../server/demo-tutor/registry.js";
const bundles = ["02.02.01", "02.02.03"].map((s) =>
  getBundle("network-engineer:" + s),
);
const all = bundles.flatMap((b) =>
  b.quizzes.flatMap((q) => [q.main, ...q.variants]),
);
const find = (id) => {
  const q = all.find((q) => q.id === id);
  assert(q, id);
  return q;
};
const label = (q) => q.options.find((o) => o.id === q.answer).text;
test("coding and capacity independently provide seven concepts and 21 distinct questions", () => {
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
  for (const q of all) {
    assert.equal(new Set(q.options.map((o) => o.text)).size, 4);
    assert.equal(
      new Set(Object.values(q.branches).map((f) => f.explanation)).size,
      3,
    );
  }
});
test("symbol rates use the count of binary decisions, not the number of states", () => {
  for (const id of [
    "rate-symbols-check",
    "rate-symbols-v1",
    "rate-symbols-v2",
  ]) {
    const q = find(id),
      [, states, baud] = q.prompt.match(/使用(\d+)种.*速率(\d+)Baud/);
    let binaryDecisions = 0;
    for (let n = Number(states); n > 1; n /= 2) {
      assert.equal(n % 2, 0);
      binaryDecisions++;
    }
    assert.equal(label(q), `${Number(baud) * binaryDecisions} bit/s`);
  }
});
test("noiseless and noisy numerical standards are separately reconstructed from question conditions", () => {
  for (const id of [
    "rate-nyquist-check",
    "rate-nyquist-v1",
    "rate-nyquist-v2",
  ]) {
    const q = find(id),
      [, bandwidth, states] = q.prompt.match(/B=(\d+)Hz.*采用(\d+)种/);
    assert.equal(
      label(q),
      `${2 * Number(bandwidth) * Math.log2(Number(states))} bit/s`,
    );
  }
  for (const id of ["rate-shannon-check", "rate-shannon-v1"]) {
    const q = find(id),
      [, bandwidth, snr] = q.prompt.match(/B=(\d+)Hz.*S\/N=(\d+)/);
    assert.equal(
      label(q),
      `${Number(bandwidth) * Math.log2(1 + Number(snr))} bit/s`,
    );
  }
  assert.equal(Number(label(find("rate-shannon-v2"))), 10 ** (20 / 10));
});
test("effective rates respect the percentage denominator rather than a universal subtraction", () => {
  assert.equal(
    label(find("rate-effective-check")),
    `${12000 * (1 - 25 / 100)} bit/s`,
  );
  assert.equal(
    label(find("rate-effective-v1")),
    `${12000 / (1 + 20 / 100)} bit/s`,
  );
  assert.equal(
    label(find("rate-effective-v2")),
    "不能，仍受对应有噪声信道容量等条件限制",
  );
});
test("modulation parameters and clock recovery retain their stated conventions", () => {
  assert.equal(label(find("coding-modulation-check")), "FSK");
  assert.equal(label(find("coding-modulation-v1")), "PSK");
  assert.equal(label(find("coding-modulation-v2")), "QAM");
  for (const id of ["coding-clock-v1", "coding-clock-v2"])
    assert.equal(
      label(find(id)),
      "每个比特中间都有跳变，便于提取时钟；跳变方向与比特值按约定解释",
    );
  assert.equal(label(find("coding-efficiency-v2")), "4 bit");
});
