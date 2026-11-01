import { test } from "node:test";
import assert from "node:assert/strict";
import { getBundle } from "../server/demo-tutor/registry.js";
const arq = getBundle("network-engineer:02.02.06"),
  sync = getBundle("network-engineer:02.02.02");
const questions = [arq, sync].flatMap((b) =>
  b.quizzes.flatMap((q) => [q.main, ...q.variants]),
);
const find = (id) => questions.find((q) => q.id === id),
  label = (q) => q.options.find((o) => o.id === q.answer).text;
test("retransmission ranges follow the independently simulated receiver rule and stated ACK conditions", () => {
  for (const id of [
    "arq-gbn-check",
    "arq-gbn-v1",
    "arq-selective-check",
    "arq-selective-v1",
  ]) {
    const q = find(id),
      [, scheme, list, missing] = q.prompt.match(
        /教材(GBN|SR)模型：已发送帧([\d、]+)，帧(\d+)丢失/,
      );
    const frames = list.split("、").map(Number),
      lost = Number(missing);
    let expected = frames[0],
      accepted = [];
    for (const f of frames) {
      if (f === lost) continue;
      if (scheme === "SR" || f === expected) {
        accepted.push(f);
        if (f === expected) expected++;
      }
    }
    const retry = frames.filter((f) => !accepted.includes(f));
    assert.equal(label(q), retry.join("、"));
    if (scheme === "SR") assert(q.prompt.includes("其余帧的分别确认"));
    else assert(q.prompt.includes("尚无推进发送基序号"));
  }
  assert.equal(label(find("arq-gbn-v2")), "帧4");
  assert.equal(
    label(find("arq-stop-v1")),
    "识别为重复，不再次交付载荷，并按协议再次确认",
  );
  assert.equal(label(find("arq-stop-v2")), `${(2 / (2 + 4 + 4)) * 100}%`);
});
test("equal SR windows fit non-overlapping old and following sequence sets", () => {
  for (let m = 2; m <= 6; m++) {
    const n = 2 ** m;
    for (let w = 1; w < n; w++) {
      const old = new Set(Array.from({ length: w }, (_, i) => i));
      const next = new Set(Array.from({ length: w }, (_, i) => (w + i) % n));
      const overlap = [...old].some((i) => next.has(i));
      assert.equal(!overlap, w <= n / 2);
    }
  }
  assert.equal(label(find("arq-window-check")), "7");
  assert.equal(label(find("arq-window-v1")), "8");
  assert.equal(label(find("arq-window-v2")), "4");
});
test("UART framing, duplex and multiplexing standards retain distinct dimensions", () => {
  assert.equal(
    label(find("sync-framing-check")),
    `${(8 / (1 + 8 + 1)) * 100}%`,
  );
  assert.equal(label(find("sync-framing-v2")), String(1 + 7 + 1 + 2));
  const expected = {
    "sync-duplex-check": "半双工",
    "sync-duplex-v1": "全双工",
    "sync-duplex-v2": "单工",
    "sync-multiplex-check": "FDM",
    "sync-multiplex-v1": "WDM",
  };
  for (const [id, right] of Object.entries(expected))
    assert.equal(label(find(id)), right);
  assert.equal(
    label(find("sync-multiplex-v2")),
    "仍可能占固定时隙，不能默认自动回收给其他路",
  );
  assert.equal(questions.length, 21);
  for (const q of questions)
    assert.equal(
      new Set(Object.values(q.branches).map((f) => f.explanation)).size,
      3,
    );
});
