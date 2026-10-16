import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium, expect } from "@playwright/test";
import { allBundles } from "../server/demo-tutor/registry.js";
const base = "http://127.0.0.1:4177/demo/home-blue/";
const browser = await chromium.launch({
  headless: true,
  proxy: { server: "http://127.0.0.1:9", bypass: "localhost,127.0.0.1" },
});
const completed = [],
  errors = [];
const ready = allBundles().filter((b) =>
  b.course.id.startsWith("network-engineer:"),
);
const selectedIds = process.argv.slice(2);
for (const id of selectedIds)
  assert(
    ready.some((b) => b.course.id === id),
    "unknown complete course: " + id,
  );
async function layout(p) {
  const r = await p.evaluate(() => ({
    viewport: innerWidth,
    width: document.documentElement.scrollWidth,
    over: [
      ...document.querySelectorAll(
        ".tutor-shell,.tutor-option,.tutor-comparison,.tutor-intro-route",
      ),
    ]
      .filter((e) => e.scrollWidth > e.clientWidth + 2)
      .map((e) => e.className),
  }));
  assert(r.width <= r.viewport + 2, JSON.stringify(r));
  assert.deepEqual(r.over, []);
}
try {
  for (const b of ready.filter(
    (b) => !selectedIds.length || selectedIds.includes(b.course.id),
  )) {
    const c = await browser.newContext({
        viewport: { width: 1672, height: 941 },
      }),
      p = await c.newPage();
    p.on("pageerror", (e) =>
      errors.push({ course: b.course.id, error: e.message }),
    );
    await p.goto(base + "?v=tutor-25#ai", { waitUntil: "networkidle" });
    await p.evaluate(
      (id) => AceAiStudyDemo.openLesson("network-engineer", id, "tutor"),
      b.course.nodeId,
    );
    await expect(p.locator('[data-tutor-action="start"]')).toBeEnabled();
    assert.equal(
      await p.locator(".tutor-intro-route li").count(),
      b.course.concepts.length,
    );
    for (const width of [320, 375, 768, 1672]) {
      await p.setViewportSize({ width, height: 941 });
      await layout(p);
    }
    await p.locator('[data-tutor-action="start"]').click();
    await expect(p.locator(".tutor-shell[data-tutor-phase]")).toHaveAttribute(
      "data-tutor-phase",
      "explanation",
    );
    let wrongDone = false,
      restoreDone = false,
      steps = 0;
    while (true) {
      const v = await p.evaluate(() => AceTutorDemo.snapshot());
      assert(v);
      if (v.phase === "complete") break;
      assert(steps++ < 80);
      for (const width of [320, 1672]) {
        await p.setViewportSize({ width, height: 941 });
        await layout(p);
      }
      if (["awaiting_answer", "variant"].includes(v.phase)) {
        const q = v.lesson.components.find((c) => c.type === "MiniQuiz"),
          group = b.quizzes[v.conceptIndex],
          trusted = [group.main, ...group.variants].find((k) => k.id === q.id);
        assert(trusted);
        assert(!("answer" in q));
        const choice = wrongDone
          ? trusted.answer
          : trusted.options.find((o) => o.id !== trusted.answer).id;
        wrongDone = true;
        await p
          .locator(`input[name="tutor-answer"][value="${choice}"]`)
          .check();
        await p.locator("#tutor-quiz-form button[type=submit]").click();
        await expect(
          p.locator(".tutor-shell[data-tutor-phase]"),
        ).toHaveAttribute("data-tutor-phase", "feedback");
        if (choice !== trusted.answer)
          await expect(p.locator(".tutor-feedback")).toContainText(
            trusted.branches[choice].title,
          );
      } else {
        if (v.phase === "remediation" && !restoreDone) {
          await p.reload({ waitUntil: "networkidle" });
          await expect(
            p.locator(".tutor-shell[data-tutor-phase]"),
          ).toHaveAttribute("data-tutor-phase", "remediation");
          const restored = await p.evaluate(() => AceTutorDemo.snapshot());
          assert.equal(restored.id, v.id);
          assert.equal(restored.revision, v.revision);
          restoreDone = true;
        }
        const revision = v.revision;
        await p.locator('[data-tutor-action="next"]').click();
        await p.waitForFunction(
          (r) => AceTutorDemo.snapshot()?.revision > r,
          revision,
        );
      }
    }
    const result = await p.evaluate(() => AceTutorDemo.snapshot());
    assert(result.mastery.every((m) => m.status === "mastered"));
    assert.equal(result.mastery.length, b.course.concepts.length);
    assert.equal(result.answers.length, b.course.concepts.length * 2);
    assert(restoreDone);
    await expect(
      p.locator(`[data-ai-node="${b.course.nodeId}"] .is-learned`),
    ).toHaveCount(1);
    await expect(p.locator(".tutor-summary-stats")).toContainText(
      `${b.course.concepts.length} / ${b.course.concepts.length}`,
    );
    await p.reload({ waitUntil: "networkidle" });
    await expect(p.locator(".tutor-shell[data-tutor-phase]")).toHaveAttribute(
      "data-tutor-phase",
      "complete",
    );
    await p.evaluate(() => {
      document.activeElement?.blur();
      window.scrollTo(0, 0);
    });
    if (b.course.id.endsWith("01.01.02"))
      await p.screenshot({
        path: "outputs/home-blue-demo/tutor-integers-summary.png",
        fullPage: true,
      });
    if (b.course.id.endsWith("01.02.02"))
      await p.screenshot({
        path: "outputs/home-blue-demo/tutor-hamming-summary.png",
        fullPage: true,
      });
    completed.push({
      course: b.course.id,
      version: b.course.version,
      concepts: result.mastery.length,
      answers: result.answers.length,
      restore: true,
      layout: [320, 375, 768, 1672],
    });
    await c.close();
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    selectedIds.length
      ? "outputs/home-blue-demo/tutor-foundations-selected-e2e.json"
      : "outputs/home-blue-demo/tutor-foundations-e2e.json",
    JSON.stringify({ completed, errors }, null, 2),
  );
  console.log(JSON.stringify({ completed, errors }, null, 2));
} finally {
  await browser.close();
}
