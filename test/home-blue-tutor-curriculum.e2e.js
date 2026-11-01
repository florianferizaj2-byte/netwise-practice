import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium, expect } from "@playwright/test";
import { allBundles } from "../server/demo-tutor/registry.js";
const base = "http://127.0.0.1:4177/demo/home-blue/";
const browser = await chromium.launch({
  headless: true,
  proxy: { server: "http://127.0.0.1:9", bypass: "localhost,127.0.0.1" },
});
const faults = [];
const checked = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1672, height: 941 },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => faults.push(e.message));
  await page.goto(base + "#ai", { waitUntil: "networkidle" });
  const open = async (id) => {
    await page.evaluate(
      (id) => AceAiStudyDemo.openLesson("network-engineer", id, "tutor"),
      id,
    );
    await expect(page.locator('[data-tutor-action="start"]')).toBeEnabled();
    await page.locator('[data-tutor-action="start"]').click();
    await expect(
      page.locator(".tutor-shell[data-tutor-phase]"),
    ).toHaveAttribute("data-tutor-phase", "explanation");
  };
  const next = async () => {
    const old = await page.evaluate(() => AceTutorDemo.snapshot().revision);
    await page.locator('[data-tutor-action="next"]').click();
    await page.waitForFunction(
      (old) => AceTutorDemo.snapshot()?.revision > old,
      old,
    );
  };
  const answer = async (option) => {
    for (let step = 0; step < 9; step++) {
      const s = await page.evaluate(() => AceTutorDemo.snapshot());
      if (s.phase !== "explanation") break;
      await next();
    }
    await page.locator(`input[name="tutor-answer"][value="${option}"]`).check();
    await page.locator("#tutor-quiz-form button[type=submit]").click();
    await expect(
      page.locator(".tutor-shell[data-tutor-phase]"),
    ).toHaveAttribute("data-tutor-phase", "feedback");
  };
  const records = allBundles().filter(
    (b) => b.course.id !== "vlan-broadcast-domain",
  );
  await open(records[0].course.id);
  while ((await page.evaluate(() => AceTutorDemo.snapshot())).phase === "explanation") await next();
  const saved = await page.evaluate(() => AceTutorDemo.snapshot());
  await open(records[1].course.id);
  await next();
  const wrong = records[1].quizzes[0].main.options.find(
    (o) => o.id !== records[1].quizzes[0].main.answer,
  );
  await answer(wrong.id);
  await expect(page.locator(".tutor-feedback")).toContainText(
    records[1].quizzes[0].main.branches[wrong.id].title,
  );
  await next();
  await expect(page.locator(".tutor-shell[data-tutor-phase]")).toHaveAttribute(
    "data-tutor-phase",
    "remediation",
  );
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(".tutor-shell[data-tutor-phase]")).toHaveAttribute(
    "data-tutor-phase",
    "remediation",
  );
  checked.push("浮点数错因补课刷新恢复");
  await page.evaluate(
    (id) => AceAiStudyDemo.openLesson("network-engineer", id, "tutor"),
    records[0].course.id,
  );
  await expect(page.locator(".tutor-shell[data-tutor-phase]")).toHaveAttribute(
    "data-tutor-phase",
    "awaiting_answer",
  );
  assert.equal(
    (await page.evaluate(() => AceTutorDemo.snapshot())).id,
    saved.id,
  );
  checked.push("跨知识点独立恢复");
  for (const width of [320, 375, 768, 1672]) {
    await page.setViewportSize({ width, height: 941 });
    const layout = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      over: [
        ...document.querySelectorAll(
          ".tutor-shell,.tutor-option,.tutor-comparison",
        ),
      ]
        .filter((e) => e.scrollWidth > e.clientWidth + 2)
        .map((e) => e.className),
    }));
    assert(layout.scroll <= layout.width + 2, JSON.stringify(layout));
    assert.deepEqual(layout.over, []);
  }
  checked.push("四种屏幕宽度无溢出");
  await page.setViewportSize({ width: 1672, height: 941 });
  while (true) {
    const v = await page.evaluate(() => AceTutorDemo.snapshot());
    if (v.phase === "complete") break;
    if (["awaiting_answer", "variant"].includes(v.phase)) {
      const group = records[0].quizzes[v.conceptIndex];
      const q = v.lesson.components.find((c) => c.type === "MiniQuiz");
      const privateQ = [group.main, ...group.variants].find(
        (p) => p.id === q.id,
      );
      assert(!("answer" in q));
      await answer(privateQ.answer);
    } else await next();
  }
  const complete = await page.evaluate(() => AceTutorDemo.snapshot());
  assert.equal(complete.mastery.length, 4);
  assert(complete.mastery.every((m) => m.status === "mastered"));
  await expect(page.locator(".tutor-summary-stats")).toContainText("4 / 4");
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(".tutor-shell[data-tutor-phase]")).toHaveAttribute(
    "data-tutor-phase",
    "complete",
  );
  checked.push("四段课程完整判分与总结恢复");
  await page.screenshot({
    path: "outputs/home-blue-demo/tutor-numerals-desktop.png",
    fullPage: true,
  });
  assert.deepEqual(faults, []);
  console.log(JSON.stringify({ passed: checked, pageErrors: faults }, null, 2));
  fs.writeFileSync(
    "outputs/home-blue-demo/tutor-curriculum-e2e.json",
    JSON.stringify({ passed: checked, pageErrors: faults }, null, 2),
  );
} finally {
  await browser.close();
}
