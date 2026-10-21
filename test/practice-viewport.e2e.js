import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "@playwright/test";
import { createApp } from "../server/index.js";
import { createStore } from "../server/store.js";
import {
  hasCertificateQuestion,
  questionForCertificate,
} from "../server/certificates.js";
import {
  practiceStorageKey,
  savePracticeProgress,
} from "../src/practice-progress.js";
import { launchTestBrowser } from "./helpers/browser.js";

const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "ace-practice-viewport-"),
);
const store = createStore(directory);
const certificateId = "sichuan-upgrading-computer";
const template = store
  .allQ()
  .find(
    (q) =>
      hasCertificateQuestion(q, certificateId) && q.type === "single_choice",
  );
const fixtures = Array.from({ length: 8 }, (_, index) => ({
  ...template,
  id: `viewport-fixture-${index}`,
  question: `滚动定位测试 ${index + 1}：请选择最后一个选项。${index % 2 ? "这是一道稍长的题目，用于确认题干换行后仍能看到全部选项。" : ""}`,
  options: {
    A: "测试选项甲",
    B: "测试选项乙",
    C: "测试选项丙",
    D: "测试选项丁",
  },
  answer: ["D"],
  analysis: "这是隔离测试数据的解析。".repeat(45),
  images:
    index === 6
      ? [{ src: "/media/viewport-fixture.svg", alt: "延迟加载的测试题图" }]
      : [],
}));
fixtures[7].question =
  "这是一道长题，必须保留题干开头，不能为了展示最后一个选项而跳过题干。\n".repeat(
    25,
  );
for (const fixture of fixtures) store.addQ(fixture);
const questions = fixtures.map((q) => questionForCertificate(q, certificateId));
const user = await store.registerAsync(
  "viewport_fixture",
  "fixture-password-123",
);
store.selectCertificate(user.id, certificateId);
const app = await createApp({
  store,
  production: true,
  accountSecurity: { enabled: false },
});
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const report = { passed: false, checks: [], errors: [], views: [] };
const version = JSON.parse(
  fs.readFileSync("mobile/package.json", "utf8"),
).version;
fs.mkdirSync("test-output", { recursive: true });
let browser, page;

async function seed(
  items,
  { mode = "practice", certificate = certificateId } = {},
) {
  if (new URL(page.url()).origin !== base) await page.goto(base);
  assert.equal(
    (
      await page.request.put(base + "/api/auth/certificate", {
        data: { certificateId: certificate },
      })
    ).status(),
    200,
  );
  await page.goto(base + "/#home");
  await page.reload({ waitUntil: "networkidle" });
  let value;
  const key = practiceStorageKey(user.id, certificate);
  savePracticeProgress(
    { setItem: (_, saved) => (value = saved) },
    key,
    {
      title: "刷题阅读定位验证",
      returnPage: "chapters",
      questions: items,
      startedAt: Date.now(),
    },
    0,
    {},
    false,
    mode,
  );
  await page.evaluate(
    ([key, value]) => localStorage.setItem(key, value),
    [key, value],
  );
  await page.goto(base + "/#practice");
  await expect(page.locator(".question-text")).toBeVisible();
}

async function readingView() {
  return page.evaluate(() => {
    const panel = document.querySelector(".question-panel");
    const rect = (selector) =>
      panel.querySelector(selector)?.getBoundingClientRect();
    const start = rect(".vet-shared-card, .question-meta");
    const stem = rect(".question-text");
    const bar = rect(".practice-mode-bar");
    const actions = rect(".question-actions");
    const last = [...panel.querySelectorAll(".option")]
      .at(-1)
      ?.getBoundingClientRect();
    const correct = [...panel.querySelectorAll(".option.correct")].map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    });
    return {
      scrollY,
      width: innerWidth,
      height: innerHeight,
      barTop: bar.top,
      barBottom: bar.bottom,
      start: start.top,
      stemTop: stem.top,
      stemBottom: stem.bottom,
      lastBottom: last?.bottom,
      actionsTop: actions?.top,
      correct,
      overflow: document.documentElement.scrollWidth - innerWidth,
      heroBottom: document
        .querySelector(".blue-practice-heading")
        .getBoundingClientRect().bottom,
    };
  });
}

async function expectReading(
  label,
  { allOptions = true, correct = false } = {},
) {
  if (correct) await expect(page.locator(".option.correct")).not.toHaveCount(0);
  await expect
    .poll(
      async () => {
        const v = await readingView();
        return Math.abs(v.start - v.barBottom - 12);
      },
      { message: `${label}: question starts below the compact mode controls` },
    )
    .toBeLessThanOrEqual(2);
  const v = await readingView();
  assert.ok(v.scrollY > 100, `${label}: scroll past the chapter introduction`);
  assert.ok(
    v.heroBottom < 0,
    `${label}: chapter banner does not take reading space`,
  );
  assert.ok(v.overflow <= 2, `${label}: no horizontal overflow`);
  if (allOptions) {
    assert.ok(v.stemTop >= v.barBottom, `${label}: full question visible`);
    assert.ok(
      v.lastBottom <= Math.min(v.height, v.actionsTop) - 6,
      `${label}: all options visible above the action bar: ${JSON.stringify(v)}`,
    );
  }
  if (correct) {
    assert.ok(v.correct.length);
    for (const option of v.correct) {
      assert.ok(
        option.top >= v.barBottom && option.bottom <= v.actionsTop - 6,
        `${label}: correct choice visible`,
      );
    }
  }
  report.views.push({ label, ...v });
}

const optionD = () =>
  page
    .locator(".option")
    .filter({ has: page.locator(".option-letter").filter({ hasText: /^D$/ }) });
const twoFrames = () =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );

try {
  browser = await launchTestBrowser();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  await context.addCookies([
    {
      name: "netwise_session",
      value: store.createAuthSession(user.id),
      url: base,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await context.addInitScript(
    (v) => localStorage.setItem(`netwise-announcement-v${v}`, "seen"),
    version,
  );
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => report.errors.push(error.message));

  await seed(questions.slice(0, 6));
  await expectReading("ordinary entry");
  await optionD().click();
  await page.keyboard.press("Enter");
  await expect(page.locator(".result-block")).toContainText("回答正确");
  await expectReading("ordinary submitted", { correct: true });
  const reward = await page.locator(".celebration-message").boundingBox();
  const stem = await page.locator(".question-text").boundingBox();
  assert.ok(
    reward.y + reward.height < stem.y,
    "Correct-answer encouragement stays above the question instead of covering it",
  );
  await page.keyboard.press("Enter");
  await expect(page.locator(".question-top")).toContainText("第 2");
  await expectReading("ordinary Enter next");
  await optionD().click();
  await page.locator(".practice-primary").click();
  await expect(page.locator(".result-block")).toContainText("回答正确");
  await page.locator(".practice-primary").click();
  await expect(page.locator(".question-top")).toContainText("第 3");
  await expectReading("ordinary button next");
  await page.getByLabel("选择题号").selectOption("3");
  await expect(page.locator(".question-top")).toContainText("第 4");
  await expectReading("direct question jump");
  report.checks.push(
    "Ordinary practice: first entry, submission, Enter, next button and direct jump all show the question and every option; long explanations do not displace them",
  );

  await page.getByRole("button", { name: "背题模式", exact: true }).click();
  await expect(page.locator(".result-block")).toContainText("答案解析");
  await expectReading("memorize switch", { correct: true });
  await page.keyboard.press("Enter");
  await expect(page.locator(".question-top")).toContainText("第 5");
  await expectReading("memorize Enter next", { correct: true });
  await page.locator(".practice-primary").click();
  await expect(page.locator(".question-top")).toContainText("第 6");
  await expectReading("memorize button next", { correct: true });
  await page.screenshot({ path: "test-output/practice-viewport-desktop.png" });
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(".question-top")).toContainText("第 6");
  await expectReading("restored memorize round", { correct: true });
  report.checks.push(
    "Memorize mode: switching, repeated Enter, mouse next and refresh restore a reading position with the last correct option visible",
  );

  const releases = new Map();
  await page.route("**/api/questions/*/reveal", async (route) => {
    await new Promise((resolve) =>
      releases.set(route.request().url().split("/").at(-2), resolve),
    );
    await route.fulfill({ response: await route.fetch() });
  });
  await seed(questions.slice(0, 3), { mode: "memorize" });
  await expectReading("pending memorize answer");
  await expect.poll(() => releases.has(questions[0].id)).toBe(true);
  releases.get(questions[0].id)();
  await expect(page.locator(".option.correct")).toHaveCount(1);
  await expectReading("late memorize answer", { correct: true });
  await page.keyboard.press("Enter");
  await expect(page.locator(".question-top")).toContainText("第 2");
  await expectReading("pending second answer");
  const beforeScroll = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, -180);
  await expect
    .poll(() => page.evaluate(() => scrollY))
    .toBeLessThan(beforeScroll - 100);
  const manualPosition = await page.evaluate(() => scrollY);
  await expect.poll(() => releases.has(questions[1].id)).toBe(true);
  releases.get(questions[1].id)();
  await expect(page.locator(".option.correct")).toHaveCount(1);
  await twoFrames();
  assert.ok(
    Math.abs((await page.evaluate(() => scrollY)) - manualPosition) <= 2,
    "Late answers must not override the learner's manual scrolling",
  );
  for (const release of releases.values()) release();
  await page.unrouteAll({ behavior: "wait" });
  report.checks.push(
    "Delayed answer reveal preserves the reading target; after a manual wheel scroll, a late answer does not pull the viewport back",
  );

  let releaseImage;
  await context.route(/\/media\/viewport-fixture\.svg$/, async (route) => {
    await new Promise((resolve) => (releaseImage = resolve));
    await route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="80"><rect width="800" height="80" fill="#dbe9ff"/></svg>',
    });
  });
  await seed(questions.slice(6, 8), { mode: "memorize" });
  await expect.poll(() => typeof releaseImage).toBe("function");
  releaseImage();
  await expect
    .poll(() =>
      page.locator(".question-images img").evaluate((img) => img.naturalWidth),
    )
    .toBe(800);
  await expectReading("late question image", { correct: true });
  await context.unroute(/\/media\/viewport-fixture\.svg$/);
  await page.keyboard.press("Enter");
  await expectReading("long question fallback", { allOptions: false });
  const longStart = await page.evaluate(() => scrollY);
  await page.keyboard.press("PageDown");
  await expect
    .poll(() => page.evaluate(() => scrollY))
    .toBeGreaterThan(longStart + 100);
  await twoFrames();
  assert.ok((await page.evaluate(() => scrollY)) > longStart + 100);
  report.checks.push(
    "Late images are included in the reading area; oversized questions keep their beginning visible and allow manual reading without snapping back",
  );

  for (const viewport of [
    { width: 1440, height: 720 },
    { width: 768, height: 900 },
    { width: 375, height: 812 },
  ]) {
    await page.setViewportSize(viewport);
    await seed(questions.slice(0, 3), { mode: "memorize" });
    await expect(page.locator(".option.correct")).toHaveCount(1);
    await expectReading(`${viewport.width}x${viewport.height} memorize`, {
      correct: true,
    });
    await page.keyboard.press("Enter");
    await expect(page.locator(".question-top")).toContainText("第 2");
    await expectReading(`${viewport.width}x${viewport.height} next`, {
      correct: true,
    });
    await page.screenshot({
      path: `test-output/practice-viewport-${viewport.width}.png`,
    });
    await page.getByRole("button", { name: "练习模式", exact: true }).click();
    await expectReading(`${viewport.width}x${viewport.height} ordinary`);
    await optionD().click();
    await page.locator(".practice-primary").click();
    await expect(page.locator(".result-block")).toContainText("回答正确");
    await expectReading(`${viewport.width}x${viewport.height} feedback`, {
      correct: true,
    });
    const rewardBox = await page.locator(".celebration-message").boundingBox();
    const controls = await page.locator(".practice-mode-bar").boundingBox();
    assert.ok(
      rewardBox.y >= controls.y &&
        rewardBox.y + rewardBox.height <= controls.y + controls.height,
      "Encouragement stays inside the mode bar on every screen size",
    );
    if (viewport.width === 375)
      await page.screenshot({
        path: "test-output/practice-viewport-narrow-feedback.png",
      });
  }
  report.checks.push(
    "1440x720, 768x900 and 375x812 keep the stem and choices visible without overflow, including reduced-motion mode",
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  const vet = store
    .allQ()
    .filter(
      (q) =>
        hasCertificateQuestion(q, "veterinary-practitioner") && q.sharedGroupId,
    )
    .slice(0, 6);
  await seed(vet, { certificate: "veterinary-practitioner", mode: "memorize" });
  await expect(page.locator(".vet-shared-card")).toBeVisible();
  await expectReading("veterinary shared case", { allOptions: false });
  await page.keyboard.press("Enter");
  await expect(page.locator(".question-top")).toContainText("第 2");
  await expectReading("veterinary next case question", { allOptions: false });
  report.checks.push(
    "Veterinary navigation uses the same positioning while retaining essential shared case material",
  );
  assert.deepEqual(report.errors, []);
  report.passed = true;
} finally {
  if (!report.passed && page)
    await page
      .screenshot({ path: "test-output/practice-viewport-failure.png" })
      .catch(() => {});
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  await app.locals.stop();
  store.db.close();
  fs.writeFileSync(
    "test-output/practice-viewport-report.json",
    JSON.stringify(report, null, 2),
  );
}
console.log(JSON.stringify({ ...report, views: report.views.length }, null, 2));
