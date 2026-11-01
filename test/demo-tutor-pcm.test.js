import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { reviewedTutorSnapshot } from "./helpers/reviewed-tutor-snapshot.js";
import { getBundle, catalogue } from "../server/demo-tutor/registry.js";
import {
  correctHomeBlueLesson,
  pcmNodeId,
  pcmOriginalVersion,
  pcmCorrectedVersion,
} from "../scripts/home-blue-ai-corrections.mjs";
const bundle = getBundle(pcmNodeId),
  all = bundle.quizzes.flatMap((q) => [q.main, ...q.variants]);
const find = (id) => {
  const q = all.find((q) => q.id === id);
  assert(q, id);
  return q;
};
const label = (q) => q.options.find((o) => o.id === q.answer).text;
const snapshot = reviewedTutorSnapshot();
test("PCM snapshot corrections are durable, idempotent and invalidate older content versions", () => {
  const n = snapshot.lessons.find((n) => n.id === pcmNodeId);
  assert.equal(n.version, pcmCorrectedVersion);
  assert.notEqual(n.version, pcmOriginalVersion);
  assert.equal(bundle.course.sourceVersion, n.version);
  assert.equal(
    catalogue().knowledgePoints.find((n) => n.nodeId === pcmNodeId).status,
    "ready",
  );
  assert.deepEqual(correctHomeBlueLesson(n), n);
  assert.equal(n.questions.length, 6);
  assert(n.lesson.points[0].includes("奈奎斯特速率为2fmax"));
  assert(n.lesson.points[0].includes("奈奎斯特频率为fs/2"));
  assert(
    n.questions
      .find((q) => q.id === "q1")
      .explanation.includes("奈奎斯特速率为2fmax"),
  );
  assert(n.questions.find((q) => q.id === "q5").stem.includes("奈奎斯特速率"));
  assert.equal(n.questions.find((q) => q.id === "q5").blanks[0].answer, "8");
  assert.throws(
    () => correctHomeBlueLesson({ ...n, version: "unreviewed" }),
    /重新审核/,
  );
  assert.throws(
    () =>
      correctHomeBlueLesson({
        ...n,
        version: pcmOriginalVersion,
        lesson: { ...n.lesson, points: ["changed"] },
      }),
    /源内容变化/,
  );
  const other = snapshot.lessons[0];
  assert.equal(correctHomeBlueLesson(other), other);
});
test("critical sampling counterexample is actually indistinguishable from the zero waveform", () => {
  const f = 1000,
    fs = 2 * f;
  for (let n = 0; n < 24; n++)
    assert(Math.abs(Math.sin((2 * Math.PI * f * n) / fs)) < 1e-12);
  assert(Math.abs(Math.sin((2 * Math.PI * f) / (4 * f)) - 1) < 1e-12);
  assert.equal(label(find("pcm-sampling-check")), "5000 Hz");
  assert.equal(label(find("pcm-sampling-v1")), "7000 sample/s");
  assert(label(find("pcm-sampling-v2")).startsWith("不能，样值sin(πn)全为0"));
});
test("folded frequencies match sampled sinusoid values, with phase sign accounted for", () => {
  for (const id of ["pcm-aliasing-check", "pcm-aliasing-v1"]) {
    const q = find(id),
      [, input, sample] = q.prompt.match(/频率(\d+)Hz，以(\d+)sample/);
    const fin = Number(input),
      fs = Number(sample),
      alias = Number.parseFloat(label(q));
    assert(alias >= 0 && alias <= fs / 2);
    assert.equal(alias, Math.abs(fs - fin));
    for (let n = 0; n < 32; n++)
      assert(
        Math.abs(
          Math.sin((2 * Math.PI * fin * n) / fs) +
            Math.sin((2 * Math.PI * alias * n) / fs),
        ) < 1e-10,
      );
  }
  assert.equal(
    label(find("pcm-aliasing-v2")),
    "在ADC采样之前使用合适的抗混叠低通滤波",
  );
});
test("PCM raw rates independently account for samples, bit width and channels", () => {
  for (const id of ["pcm-rate-check", "pcm-rate-v1", "pcm-rate-v2"]) {
    const q = find(id),
      [, fs, bits, channels] = q.prompt.match(
        /采样率(\d+)sample.*样值(\d+)bit，共(\d+)个通道/,
      );
    assert.equal(
      label(q),
      `${Number(fs) * Number(bits) * Number(channels)} bit/s`,
    );
  }
  assert.equal(label(find("pcm-process-check")), "量化");
  assert.equal(label(find("pcm-process-v1")), "采样 → 量化 → 编码");
  assert.equal(Number(label(find("pcm-process-v2"))), 2 ** 8);
  assert.equal(all.length, 12);
  for (const q of all)
    assert.equal(
      new Set(Object.values(q.branches).map((f) => f.explanation)).size,
      3,
    );
});
