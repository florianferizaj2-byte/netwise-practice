import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { allBundles, catalogue } from "../server/demo-tutor/registry.js";
import { crcRemainder } from "../server/demo-tutor/banks/error-codes.js";
import { createDemoTutorApp } from "../server/demo-tutor/app.js";
import { getBundle } from "../server/demo-tutor/registry.js";
import crypto from "node:crypto";
const all = allBundles().flatMap((b) =>
  b.quizzes.flatMap((q) => [q.main, ...q.variants]),
);
const answer = (id) => {
  const q = all.find((q) => q.id === id);
  assert(q, id);
  return q.options.find((o) => o.id === q.answer).text;
};
test("integer encodings independently decode to their specified negative values", () => {
  for (const [kind, prefix] of [
    ["sign", "int-sign"],
    ["ones", "int-ones"],
    ["twos", "int-twos"],
  ]) {
    for (const [suffix, number] of [
      ["check", -6],
      ["v1", -12],
    ]) {
      const a = answer(prefix + "-" + suffix);
      assert.equal(a.length, 8);
      const u = Number.parseInt(a, 2);
      const decoded =
        kind === "sign" ? -(u & 127) : kind === "ones" ? u - 255 : u - 256;
      assert.equal(decoded, number);
    }
    assert.equal(answer(prefix + "-v2"), "-19");
  }
  assert.equal(answer("int-range-check"), "−128～127");
  assert.equal(answer("int-range-v1"), "−8～7");
  assert.equal(answer("int-range-v2"), "−128");
  assert.equal(answer("int-bias-check"), "123");
  assert.equal(answer("int-bias-v1"), "2");
  assert.equal(answer("int-bias-v2"), "122");
  assert.equal(answer("int-overflow-check"), "-96，发生有符号溢出");
  assert.equal(answer("int-overflow-v1"), "106，发生有符号溢出");
  assert.equal(parseInt(answer("int-overflow-v2"), 2) - 65536, -10);
});
test("parity answers count complete codewords and distinguish detect from correct", () => {
  for (const [id, bits, odd] of [
    ["parity-build-check", "101100", false],
    ["parity-build-v1", "11010", true],
    ["parity-build-v2", "0110", true],
  ]) {
    const match = answer(id).match(/^校验位([01])，合计(\d+)个1$/);
    assert(match);
    const ones = [...bits].filter((b) => b === "1").length + Number(match[1]);
    assert.equal(ones, Number(match[2]));
    assert.equal(ones % 2, odd ? 1 : 0);
  }
  assert.equal(answer("parity-limits-check"), "不能检测到这次错误");
  assert.equal(answer("parity-limits-v1"), "一定检测到，但不能定位错误位");
});
test("Hamming minimum capacities, layout, syndrome and SECDED standard classifications", () => {
  for (const [id, m] of [
    ["hamming-capacity-check", 4],
    ["hamming-capacity-v1", 8],
    ["hamming-capacity-v2", 16],
  ]) {
    const r = Number(answer(id));
    assert(2 ** r >= m + r + 1);
    assert(2 ** (r - 1) < m + (r - 1) + 1);
  }
  assert.equal(answer("hamming-layout-check"), "1、2、4");
  assert.equal(answer("hamming-layout-v1"), "3、5、6、7");
  for (const [id, pos] of [
    ["hamming-syndrome-check", 5],
    ["hamming-syndrome-v1", 6],
    ["hamming-syndrome-v2", 3],
  ])
    assert.equal(Number(answer(id)), pos);
  assert.equal(answer("hamming-secded-check"), "报告双比特错误，不按S翻转纠正");
  assert.equal(answer("hamming-secded-v1"), "总体校验位自身发生单比特错误");
  assert.equal(
    answer("hamming-secded-v2"),
    "码体位置5发生单比特错误，可翻转后复检",
  );
});
// A separate polynomial arithmetic oracle; it does not use the authoring division implementation.
const degree = (p) => p.toString(2).length - 1;
function polynomialMod(dividend, divisor) {
  let a = BigInt(dividend),
    b = BigInt(divisor);
  while (a !== 0n && degree(a) >= degree(b))
    a ^= b << BigInt(degree(a) - degree(b));
  return a;
}
test("CRC division independently checked across all four-bit payloads and several generators", () => {
  for (const gen of ["1011", "1101", "10011", "111"])
    for (let data = 0; data < 16; data++) {
      const g = BigInt("0b" + gen),
        r = gen.length - 1,
        input = data.toString(2).padStart(4, "0");
      const expected = polynomialMod(BigInt(data) << BigInt(r), g)
        .toString(2)
        .padStart(r, "0");
      assert.equal(crcRemainder(input, gen), expected);
      assert.equal(polynomialMod(BigInt("0b" + input + expected), g), 0n);
    }
  assert.equal(answer("crc-calculate-check"), "010");
  assert.equal(answer("crc-calculate-v1"), "110");
  assert.equal(answer("crc-calculate-v2"), "001");
});
test("probability and AMAT values match independently calculated examples", () => {
  assert.equal(answer("frame-calculate-check"), "0.0952");
  assert.equal(answer("frame-calculate-v1"), "0.0956");
  assert.equal(answer("frame-calculate-v2"), "0.1900");
  assert.equal(answer("cache-amat-check"), "13ns");
  assert.equal(answer("cache-amat-v1"), "3ns");
  assert.equal(answer("cache-amat-v2"), "16ns");
  assert.equal(answer("cache-write-check"), "更新Cache并置脏，下一级稍后更新");
  assert.equal(answer("cache-write-v1"), "无需为这条干净行写回数据");
  assert.equal(answer("cache-write-v2"), "写穿");
});
test("generated public catalog matches authoritative availability and contains no private questions", () => {
  const context = { window: {} };
  vm.runInNewContext(
    fs.readFileSync("public/demo/home-blue/tutor-catalog.js", "utf8"),
    context,
  );
  const publicData = JSON.parse(JSON.stringify(context.window.AceTutorCatalog));
  assert.deepEqual(publicData, catalogue());
  assert(
    !/"(?:answer|branches|quizzes|correctId|selectedId)"\s*:/.test(
      JSON.stringify(publicData),
    ),
  );
});

test("extended Hamming standard classifications hold for every single and double error on all 16 data words", () => {
  const groups = [
    [1, 3, 5, 7],
    [2, 3, 6, 7],
    [4, 5, 6, 7],
  ];
  const diagnose = (w) => ({
    syndrome: groups.reduce(
      (s, g, i) => s + g.reduce((p, k) => p ^ w[k], 0) * (1 << i),
      0,
    ),
    overall: w.slice(1).reduce((a, b) => a ^ b, 0),
  });
  for (let data = 0; data < 16; data++) {
    const w = Array(9).fill(0);
    [3, 5, 6, 7].forEach((p, i) => (w[p] = (data >> i) & 1));
    groups.forEach((g, i) => (w[1 << i] = g.reduce((v, p) => v ^ w[p], 0)));
    w[8] = w.slice(1, 8).reduce((a, b) => a ^ b, 0);
    assert.deepEqual(diagnose(w), { syndrome: 0, overall: 0 });
    for (let a = 1; a <= 8; a++) {
      const single = [...w];
      single[a] ^= 1;
      assert.deepEqual(diagnose(single), {
        syndrome: a === 8 ? 0 : a,
        overall: 1,
      });
      for (let b = a + 1; b <= 8; b++) {
        const pair = [...single];
        pair[b] ^= 1;
        const d = diagnose(pair);
        assert.equal(d.overall, 0);
        assert.notEqual(d.syndrome, 0);
      }
    }
  }
});

test("a revised course rejects obsolete actions and can start a fresh version without a server error", async () => {
  const app = createDemoTutorApp(),
    record = getBundle("network-engineer:01.01.02"),
    original = record.course.version;
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
    const input = {
      courseId: record.course.id,
      foundation: "review",
      restart: false,
      requestId: crypto.randomUUID(),
    };
    const old = (await request("/sessions", input)).data.session;
    record.course.version = original + "-test-update";
    const stale = await request(`/sessions/${old.id}/actions`, {
      revision: 0,
      action: "next",
      requestId: crypto.randomUUID(),
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.data.error.code, "TUTOR_VERSION_CHANGED");
    assert.equal(
      (
        await request(
          "/sessions/current?courseId=" + encodeURIComponent(record.course.id),
        )
      ).data.session,
      null,
    );
    const fresh = await request("/sessions", {
      ...input,
      requestId: crypto.randomUUID(),
    });
    assert.equal(fresh.status, 200);
    assert.notEqual(fresh.data.session.id, old.id);
    assert.equal(fresh.data.session.course.version, record.course.version);
  } finally {
    record.course.version = original;
    await new Promise((r) => server.close(r));
    app.locals.closeTutor();
  }
});
