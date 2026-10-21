import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium, expect } from "@playwright/test";
import { getBundle } from "../server/demo-tutor/registry.js";
const b = getBundle("network-engineer:02.02.04");
const browser = await chromium.launch({
  headless: true,
  proxy: { server: "http://127.0.0.1:9", bypass: "localhost,127.0.0.1" },
});
const p = await browser.newPage({ viewport: { width: 1672, height: 941 } }),
  errors = [],
  seen = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.emulateMedia({ reducedMotion: "reduce" });
try {
  await p.goto("http://127.0.0.1:4177/demo/home-blue/?v=tutor-35#ai", {
    waitUntil: "networkidle",
  });
  await p.evaluate(
    (id) => AceAiStudyDemo.openLesson("network-engineer", id, "tutor"),
    b.course.nodeId,
  );
  await p.locator("[data-tutor-action=start]").click();
  await expect(p.locator(".tutor-shell[data-tutor-phase]")).toHaveAttribute(
    "data-tutor-phase",
    "explanation",
  );
  for (let step = 0; step < 75; step++) {
    const s = await p.evaluate(() => AceTutorDemo.snapshot());
    assert(s);
    if (s.phase === "complete") break;
    if (s.phase === "explanation" && s.lesson.components.some((c) => c.type === "EyeDiagram")) {
      const diagram = s.lesson.components.find((c) => c.type === "EyeDiagram");
      assert(diagram);
      await expect(p.locator(".tutor-eye-panel")).toHaveCount(2);
      await expect(p.locator(".tutor-eye-panel svg[role=img]")).toHaveCount(2);
      assert.equal(
        await p
          .locator(".tutor-eye-panel")
          .nth(1)
          .getAttribute("data-eye-scenario"),
        diagram.scenario,
      );
      const ids = await p
        .locator(".tutor-eye-panel svg title")
        .evaluateAll((es) => es.map((e) => e.id));
      assert.equal(new Set(ids).size, 2);
      const paths = await p
        .locator(".tutor-eye-traces")
        .evaluateAll((es) => es.map((e) => e.innerHTML));
      assert.notEqual(paths[0], paths[1]);
      for (const width of [320, 375, 768, 1672]) {
        await p.setViewportSize({ width, height: 941 });
        for (const theme of ["light", "dark"]) {
          await p.evaluate(
            (t) => (document.documentElement.dataset.theme = t),
            theme,
          );
          assert(
            await p.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 2,
            ),
          );
        }
      }
      await p.evaluate(
        () => (document.documentElement.dataset.theme = "light"),
      );
      await p.screenshot({
        path: `outputs/home-blue-demo/tutor-eye-${diagram.scenario}.png`,
        fullPage: true,
      });
      seen.push(diagram.scenario);
    }
    const revision = s.revision;
    if (["awaiting_answer", "variant"].includes(s.phase)) {
      const group = b.quizzes[s.conceptIndex],
        q = [group.main, ...group.variants].find(
          (q) =>
            q.id === s.lesson.components.find((c) => c.type === "MiniQuiz").id,
        );
      await p.locator(`input[name=tutor-answer][value=${q.answer}]`).check();
      await p.locator("#tutor-quiz-form button[type=submit]").click();
    } else await p.locator("[data-tutor-action=next]").click();
    await p.waitForFunction(
      (r) => AceTutorDemo.snapshot()?.revision > r,
      revision,
    );
  }
  assert.deepEqual(seen, ["amplitude-noise", "timing-jitter"]);
  const escaped = await p.evaluate(() => {
    const c = {
      type: "EyeDiagram",
      id: "eye-xss-test",
      title: "示意",
      scenario: "timing-jitter",
      caption: '<img src=x onerror="globalThis.eyeInjected=true">',
    };
    const host = document.createElement("div");
    host.innerHTML = AceTutorRenderer.render({
      schemaVersion: 1,
      components: [c],
    });
    let rejected = false;
    try {
      AceTutorRenderer.validate({
        schemaVersion: 1,
        components: [{ ...c, svg: "<svg/>" }],
      });
    } catch {
      rejected = true;
    }
    return {
      text: host.textContent.includes("<img"),
      images: host.querySelectorAll("img").length,
      rejected,
      script: host.querySelectorAll("script").length,
    };
  });
  assert.deepEqual(escaped, {
    text: true,
    images: 0,
    rejected: true,
    script: 0,
  });
  assert.deepEqual(errors, []);
  const report = {
    seen,
    layouts: [320, 375, 768, 1672],
    themes: ["light", "dark"],
    escaped,
    errors,
  };
  fs.writeFileSync(
    "outputs/home-blue-demo/tutor-eye-e2e.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
