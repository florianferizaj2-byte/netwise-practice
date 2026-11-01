import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  proxy: { server: "http://127.0.0.1:9", bypass: "localhost,127.0.0.1" },
});
const p = await browser.newPage({ viewport: { width: 1672, height: 941 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
const node = "network-engineer:02.02.04";
const open = (id, tab = "lesson") =>
  p.evaluate(
    ({ id, tab }) => AceAiStudyDemo.openLesson("network-engineer", id, tab),
    { id, tab },
  );
try {
  await p.goto("http://127.0.0.1:4177/demo/home-blue/?v=tutor-entry#ai", {
    waitUntil: "networkidle",
  });
  await open(node);
  const banner = p.locator(".ai-tutor-banner");
  await expect(banner).toContainText("信号质量与眼图 · 互动精讲");
  await expect(
    p.locator(`[data-ai-node="${node}"] [data-course-format="ready"]`),
  ).toHaveText("互动精讲");
  await banner.locator('[data-ai-tab="tutor"]').click();
  await expect(p.locator("#tutor-intro-title")).toBeVisible();
  await expect(banner).toBeHidden();
  await p.locator('[data-tutor-action="start"]').click();
  await expect(p.locator(".tutor-shell")).toHaveAttribute(
    "data-tutor-phase",
    "explanation",
  );
  const before = await p.evaluate(() => AceTutorDemo.snapshot());
  assert.equal(before.course.nodeId, node);
  await open(node);
  await expect(banner).toContainText("继续互动精讲");
  await p.reload({ waitUntil: "networkidle" });
  await expect(banner).toContainText("继续互动精讲");
  await banner.locator('[data-ai-tab="tutor"]').click();
  await expect(p.locator(".tutor-shell")).toHaveAttribute(
    "data-tutor-phase",
    "explanation",
  );
  const after = await p.evaluate(() => AceTutorDemo.snapshot());
  assert.equal(after.id, before.id);
  assert.equal(after.revision, before.revision);
  for (const theme of ["light", "dark"]) {
    await p.evaluate(
      (t) => (document.documentElement.dataset.theme = t),
      theme,
    );
    for (const width of [320, 375, 768, 1672]) {
      await p.setViewportSize({ width, height: 941 });
      await open(node);
      await expect(banner.locator('[data-ai-tab="tutor"]')).toBeVisible();
      const layout = await p.evaluate(() => ({
        viewport: innerWidth,
        width: document.documentElement.scrollWidth,
      }));
      assert(layout.width <= layout.viewport + 2, JSON.stringify(layout));
    }
  }
  await p.setViewportSize({ width: 1672, height: 941 });
  await p.evaluate(() => (document.documentElement.dataset.theme = "light"));
  await p.screenshot({
    path: "outputs/home-blue-demo/tutor-entry.png",
    animations: "disabled",
  });
  await open("network-engineer:02.03.05");
  await expect(
    p.locator(
      '[data-ai-node="network-engineer:02.03.05"] [data-course-format="pending"]',
    ),
  ).toHaveText("分段精讲");
  await expect(banner).toContainText("本节提供分段精讲与巩固练习");
  await expect(p.locator("#ai-tab-tutor")).toBeHidden();
  await expect(banner.locator('[data-tutor-action="pilot"]')).toBeVisible();
  await open("network-engineer:03.02.01");
  await expect(
    p.locator(
      '[data-ai-node="network-engineer:03.02.01"] [data-course-format="partial"]',
    ),
  ).toHaveText("互动示范课");
  await expect(banner).toContainText("VLAN 广播域 · 互动示范课");
  assert.deepEqual(errors, []);
  const report = {
    currentCourse: node,
    restore: true,
    coverageLabels: ["ready", "partial", "pending"],
    widths: [320, 375, 768, 1672],
    themes: ["light", "dark"],
    errors,
  };
  fs.writeFileSync(
    "outputs/home-blue-demo/tutor-entry-e2e.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
