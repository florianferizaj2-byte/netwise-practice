import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium, expect } from "@playwright/test";
import {
  pcmNodeId,
  pcmOriginalVersion,
  pcmCorrectedVersion,
} from "../scripts/home-blue-ai-corrections.mjs";
const browser = await chromium.launch({
  headless: true,
  proxy: { server: "http://127.0.0.1:9", bypass: "localhost,127.0.0.1" },
});
const p = await browser.newPage({ viewport: { width: 1672, height: 941 } }),
  errors = [];
p.on("pageerror", (e) => errors.push(e.message));
try {
  await p.goto("http://127.0.0.1:4177/demo/home-blue/?v=tutor-33#ai", {
    waitUntil: "networkidle",
  });
  await p.evaluate(
    ({ id, old }) => {
      AceStudyFlow.state().aiStudyDemo.progress[id] = {
        version: old,
        learnedAt: Date.now(),
        index: 5,
        tab: "practice",
        readStep: 3,
        drafts: { q1: { b1: "old" } },
        results: { q1: { correct: true } },
        skipped: {},
      };
      AceStudyFlow.save();
      AceAiStudyDemo.openLesson("network-engineer", id, "lesson");
    },
    { id: pcmNodeId, old: pcmOriginalVersion },
  );
  await expect(p.locator("#ai-lesson-title")).toContainText("采样定理与PCM");
  const s = await p.evaluate(() => AceAiStudyDemo.snapshot());
  assert.equal(s.progress[pcmNodeId].version, pcmCorrectedVersion);
  assert.equal(s.progress[pcmNodeId].learnedAt, null);
  assert.equal(s.progress[pcmNodeId].index, 0);
  assert.equal(s.progress[pcmNodeId].readStep, 0);
  assert.deepEqual(s.progress[pcmNodeId].results, {});
  assert.deepEqual(s.progress[pcmNodeId].drafts, {});
  await expect(p.locator(".ai-key-point")).toContainText("奈奎斯特速率为2fmax");
  await expect(p.locator(".ai-key-point")).toContainText("奈奎斯特频率为fs/2");
  await p.screenshot({
    path: "outputs/home-blue-demo/tutor-pcm-corrected-reading.png",
    fullPage: true,
  });
  await p.reload({ waitUntil: "networkidle" });
  assert.equal(
    (await p.evaluate(() => AceAiStudyDemo.current())).version,
    pcmCorrectedVersion,
  );
  await p.locator("#ai-tab-practice").click();
  const lesson = await p.evaluate(() => AceAiStudyDemo.current());
  for (let i = 0; i < 6; i++) {
    const q = lesson.questions[i];
    for (const b of q.blanks)
      await p.locator("#ai-blank-" + b.id).fill(b.answer);
    await p.locator("#ai-practice-form button[type=submit]").click();
    await expect(p.locator(".ai-blank-result.correct")).toHaveCount(
      q.blanks.length,
    );
    if (i < 5) await p.locator('[data-ai-action="next-question"]').click();
  }
  await p.reload({ waitUntil: "networkidle" });
  const restored = (await p.evaluate(() => AceAiStudyDemo.snapshot())).progress[
    pcmNodeId
  ];
  assert.equal(restored.version, pcmCorrectedVersion);
  assert.equal(Object.keys(restored.results).length, 6);
  assert.equal(restored.index, 5);
  assert.deepEqual(errors, []);
  const report = {
    version: pcmCorrectedVersion,
    oldProgressInvalidated: true,
    correctedQuestions: 6,
    refreshRestored: true,
    errors,
  };
  fs.writeFileSync(
    "outputs/home-blue-demo/tutor-pcm-e2e.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
