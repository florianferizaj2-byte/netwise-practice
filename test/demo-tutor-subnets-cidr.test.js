import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getBundle, catalogue } from "../server/demo-tutor/registry.js";
import {
  correctHomeBlueLesson,
  subnetOriginalVersions,
  subnetCorrectedVersions,
} from "../scripts/home-blue-ai-corrections.mjs";
const bundles = ["network-engineer:02.03.03", "network-engineer:02.03.04"].map(
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
function ip(value) {
  return value
    .split(".")
    .map(Number)
    .reduce((n, b) => n * 256n + BigInt(b), 0n);
}
function block(value) {
  const [address, p] = value.split("/"),
    prefix = Number(p),
    size = 1n << BigInt(32 - prefix),
    input = ip(address),
    start = (input / size) * size;
  return {
    start,
    end: start + size - 1n,
    size,
    prefix,
    canonical: start === input,
  };
}
function overlap(a, b) {
  return a.start <= b.end && b.start <= a.end;
}
function smallestExact(networks) {
  const blocks = networks
    .map(block)
    .sort((a, b) => (a.start < b.start ? -1 : 1));
  const start = blocks[0].start,
    end = blocks.at(-1).end;
  for (let i = 1; i < blocks.length; i++)
    assert.equal(blocks[i].start, blocks[i - 1].end + 1n);
  const size = end - start + 1n;
  assert.equal(size & (size - 1n), 0n);
  assert.equal(start % size, 0n);
  return { start, end, size };
}
test("VLSM host capacity and equal split count are independently checked by prefix enumeration", () => {
  for (const q of questions.filter((q) => /^vlsm-capacity-/.test(q.id))) {
    const need = Number(q.prompt.match(/至少(\d+)个/)[1]);
    const prefixes = Array.from({ length: 31 }, (_, p) => p).filter(
      (p) => Number((1n << BigInt(32 - p)) - 2n) >= need,
    );
    assert.equal(label(q), "/" + Math.max(...prefixes));
    assert(q.prompt.includes("包含网关的需求已计入"));
  }
  for (const q of questions.filter((q) => /^vlsm-equal-/.test(q.id))) {
    const [, parent, child] = q.prompt.match(/\/(\d+) IPv4.*\/(\d+)子网/);
    const a = block("0.0.0.0/" + parent),
      b = block("0.0.0.0/" + child);
    assert.equal(label(q), String(a.size / b.size) + "个");
    assert(q.prompt.includes("所有子网块均计入"));
  }
});
test("VLSM allocations meet capacity, canonical alignment, parent inclusion and non-overlap", () => {
  for (const q of questions.filter((q) => /^vlsm-allocation-/.test(q.id))) {
    const [, parent, allocated, need] = q.prompt.match(
      /在([^内]+)内，已分配([^。]+)。下一.*至少(\d+)个/,
    );
    const root = block(parent),
      occupied = allocated.split("和").map(block);
    const options = q.options.map((o) => ({ label: o.text, ...block(o.text) }));
    const valid = options.filter(
      (b) =>
        b.canonical &&
        b.start >= root.start &&
        b.end <= root.end &&
        b.size - 2n >= BigInt(need) &&
        !occupied.some((a) => overlap(a, b)),
    );
    valid.sort((a, b) =>
      a.size === b.size
        ? a.start < b.start
          ? -1
          : 1
        : a.size < b.size
          ? -1
          : 1,
    );
    assert(valid.length);
    assert.equal(label(q), valid[0].label, q.id);
    const b = valid[0];
    assert(
      b.size / 2n - 2n < BigInt(need),
      "a smaller block should be insufficient",
    );
    const after =
      occupied.reduce((end, b) => (b.end > end ? b.end : end), root.start) + 1n;
    const first = ((after + b.size - 1n) / b.size) * b.size;
    assert.equal(
      b.start,
      first,
      "first free aligned block after the allocated leading region",
    );
  }
  const normalized = block("10.60.0.96/26");
  assert.equal(normalized.canonical, false);
  assert.equal(normalized.start, ip("10.60.0.64"));
  assert.equal(
    label(find("vlsm-alignment-check")),
    ".96不是/26网络边界，规范网络起点是.64",
  );
  assert.equal(label(find("vlsm-alignment-v1")), "10.60.0.160/27");
  assert.equal(label(find("vlsm-alignment-v2")), "10.60.9.128/25");
});
test("CIDR exact aggregation is verified as address-set equality including mixed prefix lengths", () => {
  for (const q of questions.filter((q) => /^cidr-prefix-/.test(q.id))) {
    const p = Number(q.prompt.match(/\/(\d+)前缀/)[1]);
    assert.equal(label(q), String(block("0.0.0.0/" + p).size) + "个");
  }
  for (const q of questions.filter((q) => /^cidr-exact-/.test(q.id))) {
    const cidrs = q.prompt.match(/\d+\.\d+\.\d+\.\d+\/\d+/g);
    const expected = smallestExact(cidrs),
      actual = block(label(q));
    assert(actual.canonical, q.id);
    for (const key of ["start", "end", "size"])
      assert.equal(actual[key], expected[key], q.id);
    for (const o of q.options.filter(
      (o) => o.id !== q.answer && /^\d+\./.test(o.text),
    )) {
      const wrong = block(o.text);
      assert(
        !wrong.canonical ||
          wrong.start !== actual.start ||
          wrong.size !== actual.size,
        "no equivalent canonical distractor",
      );
    }
  }
  const a = block("192.168.1.0/24"),
    b = block("192.168.2.0/24"),
    superset = block("192.168.0.0/22");
  assert.equal(a.end + 1n, b.start);
  assert.equal(superset.size, a.size + b.size + 512n);
  assert(label(find("cidr-cover-check")).startsWith("不精确"));
  assert(label(find("cidr-cover-v1")).startsWith("保留多个前缀"));
  assert(label(find("cidr-cover-v2")).includes("丢弃路由兜底"));
});
test("installed destination routes use longest matching prefix and distinct error branches", () => {
  const routes = [
    { ...block("10.30.0.0/16"), label: "A：10.30.0.0/16" },
    { ...block("10.30.4.0/24"), label: "B：10.30.4.0/24" },
    { ...block("0.0.0.0/0"), label: "C：0.0.0.0/0" },
  ];
  for (const q of questions.filter((q) => /^cidr-forwarding-/.test(q.id))) {
    const destination = ip(q.prompt.match(/目的(\d+\.\d+\.\d+\.\d+)/)[1]);
    const available = q.id.endsWith("v2")
      ? routes.filter((r) => r.prefix !== 24)
      : routes;
    const matching = available
      .filter((r) => destination >= r.start && destination <= r.end)
      .sort((a, b) => b.prefix - a.prefix);
    assert.equal(label(q), matching[0].label, q.id);
    assert(q.prompt.includes("已安装"));
    assert(q.prompt.includes("无策略路由"));
  }
  assert.equal(questions.length, 24);
  for (const q of questions) {
    assert.equal(
      new Set(Object.values(q.branches).map((f) => f.errorType)).size,
      3,
    );
    assert.equal(
      new Set(Object.values(q.branches).map((f) => f.explanation)).size,
      3,
    );
  }
});
test("demo corrections persist across export and isolate earlier ordinary-learning versions", () => {
  const catalog = JSON.parse(
    fs.readFileSync(
      new URL(
        "../public/demo/home-blue/ai-content-network-engineer.json",
        import.meta.url,
      ),
    ),
  );
  for (const b of bundles) {
    const n = catalog.lessons.find((n) => n.id === b.course.nodeId);
    assert.equal(n.version, subnetCorrectedVersions[n.id]);
    assert.equal(b.course.sourceVersion, n.version);
    assert.equal(
      catalogue().knowledgePoints.find((k) => k.nodeId === n.id).status,
      "ready",
    );
    assert.deepEqual(correctHomeBlueLesson(n), n);
    const oldNumericAnswers = new Set(
      n.questions.flatMap((q) => q.blanks.map((b) => b.answer)),
    );
    for (const q of b.quizzes.flatMap((group) => [
      group.main,
      ...group.variants,
    ]))
      if (/^\d+\.\d+\.\d+\.\d+\/\d+$/.test(label(q)))
        assert(
          !oldNumericAnswers.has(label(q)),
          "interactive numeric scenario must not reuse a publicly answered exercise: " +
            q.id,
        );
    assert.throws(() =>
      correctHomeBlueLesson({ ...n, version: "unknown-source" }),
    );
    const corrupt = structuredClone(n);
    corrupt.version = subnetOriginalVersions[n.id];
    corrupt.lesson.points[n.id.endsWith("03") ? 0 : 2] = "upstream changed";
    assert.throws(() => correctHomeBlueLesson(corrupt));
  }
  assert(
    catalog.lessons
      .find((n) => n.id.endsWith("02.03.03"))
      .questions.find((q) => q.id === "q4")
      .stem.includes("最长可行前缀"),
  );
  assert(
    catalog.lessons
      .find((n) => n.id.endsWith("02.03.04"))
      .lesson.points[2].includes("最小单一覆盖可能多包含地址"),
  );
});
