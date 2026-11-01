import { test } from "node:test";
import assert from "node:assert/strict";
import { getBundle } from "../server/demo-tutor/registry.js";
import {
  validateLesson,
  lessonJSONSchema,
} from "../server/demo-tutor/protocol.js";
const b = getBundle("network-engineer:02.02.04"),
  qs = b.quizzes.flatMap((q) => [q.main, ...q.variants]);
const label = (id) => {
  const q = qs.find((q) => q.id === id);
  assert(q);
  return q.options.find((o) => o.id === q.answer).text;
};
test("eye diagrams only accept registered finite parameters, never model-supplied paths or code", () => {
  for (const scenario of ["amplitude-noise", "timing-jitter"]) {
    const c = {
      type: "EyeDiagram",
      id: "eye-test",
      title: "对照示意",
      scenario,
      caption: "非测量数据",
    };
    assert.equal(validateLesson([c]).components[0].scenario, scenario);
    for (const extra of [
      { svg: "<svg/>" },
      { script: "alert(1)" },
      { paths: ["M0 0"] },
    ])
      assert.throws(() => validateLesson([{ ...c, ...extra }]));
    assert.throws(() =>
      validateLesson([{ ...c, scenario: "custom-model-code" }]),
    );
  }
  assert(JSON.stringify(lessonJSONSchema).includes("EyeDiagram"));
});
test("signal standards distinguish origins, margins and limited diagnostic conclusions", () => {
  const expected = {
    "signal-damage-check": "串扰",
    "signal-damage-v1": "衰减",
    "signal-damage-v2": "时序抖动",
    "signal-eye-check": "电压判决余量",
    "signal-eye-v1": "时间判决余量",
    "signal-eye-v2": "不能，应先统一或核对比较条件与指标",
    "signal-diagnosis-check": "通常有更大判决余量，但不能据此保证零误码",
    "signal-diagnosis-v1": "不能，需结合其他测量区分多种可能原因",
    "signal-diagnosis-v2": "保持采集条件一致，改变邻线活动并结合误码与波形测量",
  };
  for (const [id, v] of Object.entries(expected)) assert.equal(label(id), v);
  assert.equal(qs.length, 9);
  for (const q of qs)
    assert.equal(
      new Set(Object.values(q.branches).map((f) => f.explanation)).size,
      3,
    );
  assert.equal(
    b.teaching[1].find((c) => c.type === "EyeDiagram").scenario,
    "amplitude-noise",
  );
  assert.equal(
    b.teaching[2].find((c) => c.type === "EyeDiagram").scenario,
    "timing-jitter",
  );
});
