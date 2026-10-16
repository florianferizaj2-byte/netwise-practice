import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium, expect } from "@playwright/test";
import {
  ipv4OriginalVersions,
  ipv4CorrectedVersions,
  subnetOriginalVersions,
  subnetCorrectedVersions,
} from "../scripts/home-blue-ai-corrections.mjs";
const originalVersions = { ...ipv4OriginalVersions, ...subnetOriginalVersions };
const correctedVersions = {
  ...ipv4CorrectedVersions,
  ...subnetCorrectedVersions,
};
const names = { "01": "addresses", "02": "ranges", "03": "vlsm", "04": "cidr" };
const stems = {
  "01": "历史有类编址",
  "02": "主机位至少2位",
  "03": "主机位数",
  "04": "斜杠数字",
};
const browser = await chromium.launch({
  headless: true,
  proxy: { server: "http://127.0.0.1:9", bypass: "localhost,127.0.0.1" },
});
const p = await browser.newPage({ viewport: { width: 1672, height: 941 } }),
  errors = [],
  completed = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.emulateMedia({ reducedMotion: "reduce" });
try {
  await p.goto("http://127.0.0.1:4177/demo/home-blue/?v=tutor-39#ai", {
    waitUntil: "networkidle",
  });
  for (const [id, old] of Object.entries(originalVersions)) {
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
      { id, old },
    );
    await expect(p.locator("#ai-tab-lesson")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const state = (await p.evaluate(() => AceAiStudyDemo.snapshot())).progress[
      id
    ];
    assert.equal(state.version, correctedVersions[id]);
    assert.equal(state.learnedAt, null);
    assert.equal(state.readStep, 0);
    assert.equal(state.index, 0);
    assert.deepEqual(state.results, {});
    assert.deepEqual(state.drafts, {});
    await p.reload({ waitUntil: "networkidle" });
    assert.equal(
      (await p.evaluate(() => AceAiStudyDemo.current())).version,
      correctedVersions[id],
    );
    await p.locator("#ai-tab-practice").click();
    const lesson = await p.evaluate(() => AceAiStudyDemo.current());
    for (let i = 0; i < lesson.questions.length; i++) {
      const q = lesson.questions[i];
      if (i === 0)
        await expect(p.locator("#ai-study-body")).toContainText(
          stems[id.slice(-2)],
        );
      for (const blank of q.blanks)
        await p.locator("#ai-blank-" + blank.id).fill(blank.answer);
      await p.locator("#ai-practice-form button[type=submit]").click();
      await expect(p.locator(".ai-blank-result.correct")).toHaveCount(
        q.blanks.length,
      );
      if (i < lesson.questions.length - 1)
        await p.locator('[data-ai-action="next-question"]').click();
    }
    await p.reload({ waitUntil: "networkidle" });
    const restored = (await p.evaluate(() => AceAiStudyDemo.snapshot()))
      .progress[id];
    assert.equal(Object.keys(restored.results).length, 6);
    assert.equal(restored.index, 5);
    await p.evaluate(
      (id) => AceAiStudyDemo.openLesson("network-engineer", id, "tutor"),
      id,
    );
    await expect(p.locator('[data-tutor-action="start"]')).toBeEnabled();
    await p.locator('[data-tutor-action="start"]').click();
    await expect(p.locator(".tutor-shell")).toHaveAttribute(
      "data-tutor-phase",
      "explanation",
    );
    await expect(p.locator(".tutor-comparison")).toBeVisible();
    await p.screenshot({
      path: `outputs/home-blue-demo/tutor-ipv4-${names[id.slice(-2)]}.png`,
      fullPage: true,
      animations: "disabled",
    });
    completed.push({
      id,
      oldVersionInvalidated: true,
      ordinaryAnswers: 6,
      refreshRestored: true,
      interactiveTable: true,
    });
  }
  assert.deepEqual(errors, []);
  const report = { completed, errors };
  fs.writeFileSync(
    "outputs/home-blue-demo/tutor-ipv4-e2e.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
