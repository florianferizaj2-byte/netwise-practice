import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { reviewedTutorSnapshot } from "./helpers/reviewed-tutor-snapshot.js";
import { getBundle, catalogue } from "../server/demo-tutor/registry.js";
import {
  correctHomeBlueLesson,
  ipv4OriginalVersions,
  ipv4CorrectedVersions,
} from "../scripts/home-blue-ai-corrections.mjs";
const bundles = ["network-engineer:02.03.01", "network-engineer:02.03.02"].map(
  (id) => getBundle(id),
);
const questions = bundles.flatMap((b) =>
  b.quizzes.flatMap((q) => [q.main, ...q.variants]),
);
const label = (q) => q.options.find((o) => o.id === q.answer).text;
const find = (id) => {
  const q = questions.find((q) => q.id === id);
  assert(q, id);
  return q;
};
// Independent representation: pad and slice the full 32-bit address string,
// instead of last-octet blocks or JavaScript signed 32-bit bitwise operators.
function bounds(ip, prefix) {
  const bits = ip
    .split(".")
    .map((s) => Number(s).toString(2).padStart(8, "0"))
    .join("");
  const network = bits.slice(0, prefix) + "0".repeat(32 - prefix);
  const broadcast = bits.slice(0, prefix) + "1".repeat(32 - prefix);
  const dot = (s) =>
    s
      .match(/.{8}/g)
      .map((b) => parseInt(b, 2))
      .join(".");
  return {
    network: dot(network),
    broadcast: dot(broadcast),
    count: Number(BigInt("0b" + broadcast) - BigInt("0b" + network) + 1n),
  };
}
test("IPv4 numeric standards independently recompute networks, broadcast and ordinary capacity", () => {
  const numeric = questions.filter((q) =>
    /^ipv4-(network|broadcast|hosts)-/.test(q.id),
  );
  assert.equal(numeric.length, 9);
  for (const q of numeric) {
    const m = q.prompt.match(/地址(\d+\.\d+\.\d+\.\d+)\/(\d+)/);
    assert(m, q.prompt);
    const b = bounds(m[1], Number(m[2]));
    const value = q.id.startsWith("ipv4-network-")
      ? b.network
      : q.id.startsWith("ipv4-broadcast-")
        ? b.broadcast
        : String(b.count - 2);
    assert.equal(label(q), value, q.id);
    assert(q.prompt.includes("不另扣网关"));
  }
  assert.deepEqual(bounds("200.10.5.6", 23), {
    network: "200.10.4.0",
    broadcast: "200.10.5.255",
    count: 512,
  });
  assert.equal(bounds("255.255.255.255", 32).count, 1);
  assert.equal(bounds("10.0.0.8", 31).count, 2);
  assert.equal(bounds("10.0.0.8", 30).count, 4);
  assert.equal(
    label(find("ipv4-address-mask-v1")),
    "192.168.10.64与192.168.10.127",
  );
});
test("historical classes and RFC1918 boundaries do not replace configured prefixes", () => {
  for (const q of questions.filter((q) => /^ipv4-class-/.test(q.id))) {
    const first = Number(q.prompt.match(/(\d+)\.\d+\.\d+\.\d+/)[1]);
    const bits = first.toString(2).padStart(8, "0");
    const category = bits.startsWith("0")
      ? "A"
      : bits.startsWith("10")
        ? "B"
        : bits.startsWith("110")
          ? "C"
          : bits.startsWith("1110")
            ? "D"
            : "E";
    assert.equal(label(q), category + "类");
    assert(q.prompt.includes("不推断当前网络的实际掩码"));
  }
  for (const q of questions.filter((q) => /^ipv4-private-/.test(q.id))) {
    const [a, b] = q.prompt
      .match(/(\d+\.\d+\.\d+\.\d+)/)[1]
      .split(".")
      .map(Number);
    const isPrivate =
      a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
    assert.equal(
      label(q),
      isPrivate ? "属于RFC1918私有地址" : "不属于RFC1918私有地址",
    );
    assert(q.prompt.includes("不等于必定可以公网路由"));
  }
  assert.equal(label(find("ipv4-address-mask-check")), "按明确的/26掩码计算");
});
test("special address and /31 /32 branches preserve the specified network context", () => {
  assert.equal(
    label(find("ipv4-special-check")),
    "IPv4链路本地，不属于RFC1918三段私有空间",
  );
  assert.equal(
    label(find("ipv4-special-v1")),
    "匹配所有IPv4地址的默认路由前缀",
  );
  assert.equal(label(find("ipv4-special-v2")), "本链路受限广播，路由器不转发");
  assert.equal(
    label(find("ipv4-exceptions-check")),
    "10.0.0.8与10.0.0.9都可作为两端地址",
  );
  assert.equal(label(find("ipv4-exceptions-v1")), "1个");
  assert.equal(
    label(find("ipv4-exceptions-v2")),
    "从4个降为2个，两端仍各有一个地址",
  );
  assert(
    find("ipv4-exceptions-check").prompt.includes("两端均支持RFC3021的点到点"),
  );
  assert.equal(questions.length, 24);
  for (const q of questions) {
    assert.equal(Object.keys(q.branches).length, 3);
    assert.equal(
      new Set(Object.values(q.branches).map((f) => f.explanation)).size,
      3,
    );
    assert.equal(
      new Set(Object.values(q.branches).map((f) => f.errorType)).size,
      3,
    );
  }
});
test("ordinary reading is corrected durably and old versions cannot be silently reused", () => {
  const seed = reviewedTutorSnapshot();
  for (const b of bundles) {
    const n = seed.lessons.find((n) => n.id === b.course.nodeId);
    assert.equal(n.version, ipv4CorrectedVersions[n.id]);
    assert.notEqual(n.version, ipv4OriginalVersions[n.id]);
    assert.equal(b.course.sourceVersion, n.version);
    assert.equal(
      catalogue().knowledgePoints.find((k) => k.nodeId === n.id).status,
      "ready",
    );
    assert.deepEqual(correctHomeBlueLesson(n), n);
    assert.throws(() => correctHomeBlueLesson({ ...n, version: "unreviewed" }));
    const damaged = structuredClone(n);
    damaged.version = ipv4OriginalVersions[n.id];
    damaged.lesson.points[2] = "changed by upstream";
    assert.throws(() => correctHomeBlueLesson(damaged));
    if (n.id.endsWith("02"))
      for (const id of ["q1", "q2", "q3"])
        assert(
          n.questions.find((q) => q.id === id).stem.includes("主机位至少2位"),
        );
  }
});
