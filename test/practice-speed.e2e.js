import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
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

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ace-practice-speed-"));
const store = createStore(directory);
const user = await store.registerAsync("speed-fixture", "fixture-password-123");
store.selectCertificate(user.id, "sichuan-upgrading-computer");
const token = store.createAuthSession(user.id);
const app = await createApp({
  store,
  production: true,
  accountSecurity: { enabled: false },
});
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const report = { passed: false, checks: [], errors: [], timings: {} };
const version = JSON.parse(fs.readFileSync("mobile/package.json")).version;
fs.mkdirSync("test-output", { recursive: true });
let browser;
try {
  browser = await launchTestBrowser();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await context.addCookies([
    {
      name: "netwise_session",
      value: token,
      url: base,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await context.addInitScript(
    (v) => localStorage.setItem(`netwise-announcement-v${v}`, "seen"),
    version,
  );
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => report.errors.push(e.message));
  page.on("dialog", (dialog) => dialog.accept());
  const warmed = new Set();
  const requests = [];
  page.on("request", (r) => requests.push(new URL(r.url()).pathname));
  page.on("response", async (r) => {
    if (r.url().endsWith("/reveal") && r.status() === 200) {
      await r.finished();
      warmed.add(new URL(r.url()).pathname);
    }
  });
  const questions = store
    .allQ()
    .filter(
      (q) =>
        hasCertificateQuestion(q, "sichuan-upgrading-computer") &&
        q.type === "single_choice",
    )
    .slice(0, 230)
    .map((q) => questionForCertificate(q, "sichuan-upgrading-computer"));
  assert.equal(questions.length, 230);
  const key = practiceStorageKey(user.id, "sichuan-upgrading-computer");
  const checkpoint = () =>
    page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
  async function seed(certificateId, items, warm = true, reload = true) {
    if (new URL(page.url()).origin !== base) await page.goto(base);
    if (reload) {
      assert.equal(
        (
          await page.request.put(base + "/api/auth/certificate", {
            data: { certificateId },
          })
        ).status(),
        200,
      );
      await page.goto(base + "/#home");
      await page.reload({ waitUntil: "networkidle" });
    }
    let value;
    const storageKey = practiceStorageKey(user.id, certificateId);
    savePracticeProgress(
      { setItem: (_, v) => (value = v) },
      storageKey,
      {
        title: "刷题速度与背题验证",
        returnPage: "chapters",
        startedAt: Date.now(),
        questions: items,
      },
      0,
      {},
      false,
    );
    warmed.clear();
    await page.evaluate(
      ([k, v]) => localStorage.setItem(k, v),
      [storageKey, value],
    );
    await page.goto(base + "/#practice");
    await expect(page.locator(".question-text")).toBeVisible();
    if (warm)
      await expect
        .poll(() => warmed.has(`/api/questions/${items[0].id}/reveal`))
        .toBe(true);
  }
  const option = (key) =>
    page.locator(".option").filter({
      has: page
        .locator(".option-letter")
        .filter({ hasText: new RegExp(`^${key}$`) }),
    });
  await seed("sichuan-upgrading-computer", questions);
  await expect.poll(() => warmed.size).toBe(3);
  const before = store.allA(user.id).length;
  const startRequests = requests.length;
  const releases = new Map();
  await page.route("**/api/attempts", async (route) => {
    const id = route.request().postDataJSON().questionId;
    await new Promise((resolve) => releases.set(id, resolve));
    await route.fulfill({ response: await route.fetch() });
  });
  await option(questions[0].answer[0]).click();
  await page.locator(".practice-primary").evaluate((button) => {
    performance.mark("submit-start");
    button.click();
  });
  await expect(page.locator(".result-block")).toContainText("回答正确", {
    timeout: 800,
  });
  report.timings.localFeedbackMs = await page.evaluate(() =>
    Math.round(
      performance.now() -
        performance.getEntriesByName("submit-start").at(-1).startTime,
    ),
  );
  assert.ok(report.timings.localFeedbackMs < 800);
  assert.equal(store.allA(user.id).length, before);
  await page.keyboard.press("Enter");
  await expect(page.locator(".question-top")).toContainText("第 2");
  assert.equal(
    (await checkpoint()).responses[questions[0].id].submitted,
    false,
  );
  const bad = Object.keys(questions[1].options).find(
    (k) => !questions[1].answer.includes(k),
  );
  await option(bad).click();
  // Enter must work while the option retains keyboard focus.
  await page.keyboard.press("Enter");
  await expect(page.locator(".result-block")).toContainText("这道题还需要巩固");
  await page.keyboard.press("Enter");
  await expect(page.locator(".question-top")).toContainText("第 3");
  await expect(page.locator(".result-block")).toHaveCount(0);
  await expect.poll(() => releases.size).toBe(2);
  releases.get(questions[1].id)();
  await expect.poll(() => store.allA(user.id).length).toBe(before + 1);
  releases.get(questions[0].id)();
  await expect
    .poll(async () => (await checkpoint()).responses[questions[0].id].submitted)
    .toBe(true);
  await expect(page.locator(".blue-answer-stats")).toContainText("50%");
  const answered = await checkpoint();
  assert.equal(answered.responses[questions[0].id].result.correct, true);
  assert.equal(answered.responses[questions[1].id].result.correct, false);
  assert.equal(answered.responses[questions[2].id], undefined);
  assert.deepEqual(
    requests
      .slice(startRequests)
      .filter((p) =>
        ["/api/questions", "/api/dashboard", "/api/wrong"].includes(p),
      ),
    [],
  );
  report.checks.push(
    "Held save responses: immediate local grading and Enter navigation; out-of-order acknowledgements update the right question; zero full-bank/dashboard/wrong-list reloads per answer",
  );
  await page.unroute("**/api/attempts");

  // Commit, then lose the acknowledgement: retry must use the same stable token.
  await page.route("**/api/attempts", async (route) => {
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "保存回执丢失（测试）" }),
    });
  });
  await option(questions[2].answer[0]).click();
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await expect(page.locator(".practice-save-status")).toContainText(
    "保存回执丢失",
  );
  assert.equal(store.allA(user.id).length, before + 3);
  assert.equal(
    (await checkpoint()).responses[questions[2].id].submitted,
    false,
  );
  await page.unroute("**/api/attempts");
  await page.reload({ waitUntil: "networkidle" });
  await expect(
    page.getByRole("button", { name: "重试保存", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "重试保存", exact: true }).click();
  await expect(page.locator(".practice-save-status")).toContainText(
    "作答已保存",
  );
  assert.equal(store.allA(user.id).length, before + 3);
  report.checks.push(
    "Lost acknowledgement survives refresh; retry reconciles with the server without duplicating an attempt",
  );

  await page.getByRole("button", { name: "下一题", exact: true }).click();
  await page.getByRole("button", { name: "背题模式", exact: true }).click();
  await expect(page.locator(".result-block")).toContainText("答案解析");
  for (const letter of questions[3].answer)
    await expect(option(letter)).toHaveClass(/correct/);
  await page.keyboard.press("Enter");
  await expect(page.locator(".question-top")).toContainText("第 5");
  await page.keyboard.press("Enter");
  await expect(page.locator(".question-top")).toContainText("第 6");
  await expect(page.locator(".result-block")).toContainText("答案解析");
  await page.reload({ waitUntil: "networkidle" });
  await expect(
    page.getByRole("button", { name: "背题模式", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".question-top")).toContainText("第 6");
  await expect(page.locator(".result-block")).toContainText("答案解析");
  await page.getByRole("button", { name: "下一题", exact: true }).click();
  await expect(page.locator(".question-top")).toContainText("第 7");
  assert.equal(store.allA(user.id).length, before + 3);
  report.checks.push(
    "Memorize mode shows answers and analysis, supports repeated Enter and buttons, restores mode/index on refresh, and never adds correct answers or attempts",
  );
  const progress = await page.locator(".blue-round-progress").boundingBox();
  const panel = await page.locator(".question-panel").boundingBox();
  assert.ok(
    panel.y - progress.y - progress.height <= 16,
    "No stretched grid gap before the question",
  );
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      )
      .toBeLessThanOrEqual(2);
    if (width === 1440) {
      const action = await page.locator(".practice-primary").boundingBox();
      assert.ok(
        action.y + action.height <= 900,
        "Next stays reachable without scrolling past the analysis",
      );
    }
    await page.screenshot({
      path: `test-output/practice-speed-${width}.png`,
      fullPage: true,
    });
  }
  report.checks.push(
    "Compact question layout fits 375/768/1440px and removes the stretched gap between progress and question",
  );

  // A failed warmup falls back to normal server grading, with a retry in study mode.
  await page.route("**/api/questions/*/reveal", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "答案暂不可用（测试）" }),
    }),
  );
  await seed("sichuan-upgrading-computer", questions.slice(10, 14), false);
  await option(questions[10].answer[0]).click();
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await expect(page.locator(".practice-save-status")).toContainText(
    "作答已保存",
  );
  await expect(page.locator(".result-block")).toContainText("回答正确");
  await page.getByRole("button", { name: "下一题", exact: true }).click();
  await page.getByRole("button", { name: "背题模式", exact: true }).click();
  await expect(page.locator(".practice-save-status")).toContainText(
    "答案暂不可用",
  );
  await expect(
    page.getByRole("button", { name: "重新加载答案", exact: true }),
  ).toBeVisible();
  await page.unroute("**/api/questions/*/reveal");
  await page.getByRole("button", { name: "重新加载答案", exact: true }).click();
  await expect(page.locator(".result-block")).toContainText("答案解析");
  report.checks.push(
    "Answer preparation failure falls back to server grading; memorize errors are explicit and retryable",
  );

  // Complete a pending write after the component has unmounted.
  await seed("sichuan-upgrading-computer", questions.slice(20, 24));
  let releaseSave;
  await page.route("**/api/attempts", async (route) => {
    await new Promise((resolve) => (releaseSave = resolve));
    await route.fulfill({ response: await route.fetch() });
  });
  await option(questions[20].answer[0]).click();
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await expect(page.locator(".result-block")).toContainText("回答正确");
  await page.locator(".blue-practice-back").click();
  await expect(page.locator(".blue-catalog")).toBeVisible();
  await expect.poll(() => typeof releaseSave).toBe("function");
  releaseSave();
  await expect
    .poll(
      async () => (await checkpoint()).responses[questions[20].id].submitted,
    )
    .toBe(true);
  await page.unroute("**/api/attempts");
  await page.goto(base + "/#practice");
  await expect(page.locator(".result-block")).toContainText("回答正确");

  await page.getByRole("button", { name: "下一题", exact: true }).click();
  releaseSave = null;
  await page.route("**/api/attempts", async (route) => {
    await new Promise((resolve) => (releaseSave = resolve));
    await route.fulfill({ response: await route.fetch() });
  });
  await option(questions[21].answer[0]).click();
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await expect(page.locator(".result-block")).toContainText("回答正确");
  await page.locator(".blue-practice-back").click();
  await expect(page.locator(".blue-catalog")).toBeVisible();
  await seed(
    "sichuan-upgrading-computer",
    questions.slice(24, 28),
    true,
    false,
  );
  await expect.poll(() => typeof releaseSave).toBe("function");
  const previousCount = store.allA(user.id).length;
  releaseSave();
  await expect.poll(() => store.allA(user.id).length).toBe(previousCount + 1);
  assert.deepEqual(
    (await checkpoint()).questionIds,
    questions.slice(24, 28).map((q) => q.id),
  );
  assert.equal((await checkpoint()).responses[questions[21].id], undefined);
  await page.unroute("**/api/attempts");
  report.checks.push(
    "Late saves update their own checkpoint after leaving, and cannot overwrite a newly started round",
  );

  for (const certificateId of ["hcip-datacom-core", "hcip-datacom-advanced"]) {
    const items = store
      .allQ()
      .filter(
        (q) =>
          hasCertificateQuestion(q, certificateId) &&
          q.type === "single_choice",
      )
      .slice(0, 4);
    assert.equal(items.length, 4);
    await seed(certificateId, items);
    const count = store.allA(user.id).length;
    let release;
    await page.route("**/api/attempts", async (route) => {
      await new Promise((resolve) => (release = resolve));
      await route.fulfill({ response: await route.fetch() });
    });
    await option(items[0].answer[0]).click();
    await page.getByRole("button", { name: "提交答案", exact: true }).click();
    await expect(page.locator(".result-block")).toContainText("回答正确", {
      timeout: 800,
    });
    assert.equal(store.allA(user.id).length, count);
    await page.keyboard.press("Enter");
    await expect(page.locator(".question-top")).toContainText("第 2");
    await expect.poll(() => typeof release).toBe("function");
    release();
    const storageKey = practiceStorageKey(user.id, certificateId);
    await expect
      .poll(() =>
        page.evaluate(
          ([k, id]) =>
            JSON.parse(localStorage.getItem(k)).responses[id]?.submitted,
          [storageKey, items[0].id],
        ),
      )
      .toBe(true);
    await page.unroute("**/api/attempts");
    await page.getByRole("button", { name: "背题模式", exact: true }).click();
    await expect(page.locator(".result-block")).toContainText("答案解析");
    await page.keyboard.press("Enter");
    await expect(page.locator(".question-top")).toContainText("第 3");
    await expect(page.locator(".result-block")).toContainText("答案解析");
    assert.equal(store.allA(user.id).length, count + 1);
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth - innerWidth,
          ),
        )
        .toBeLessThanOrEqual(2);
      await page.screenshot({
        path: `test-output/practice-speed-${certificateId}-${width}.png`,
        fullPage: true,
      });
    }
    report.checks.push(
      `${certificateId}: actual bank questions, immediate grading under held save response, Enter navigation, memorize mode without extra attempts, and narrow/desktop layout`,
    );
  }

  // Shared veterinary questions use the same flow; no case material is lost.
  const vet = store
    .allQ()
    .filter(
      (q) =>
        hasCertificateQuestion(q, "veterinary-practitioner") && q.sharedGroupId,
    )
    .slice(0, 6);
  assert.ok(vet.length >= 3);
  await seed("veterinary-practitioner", vet);
  await page.getByRole("button", { name: "背题模式", exact: true }).click();
  await expect(page.locator(".vet-shared-card")).toBeVisible();
  await expect(page.locator(".result-block")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".question-top")).toContainText("第 2");
  await page.getByRole("button", { name: "练习模式", exact: true }).click();
  await expect(page.locator(".result-block")).toHaveCount(0);
  for (const letter of vet[1].answer) await option(letter).click();
  await page.getByRole("button", { name: "提交本题", exact: true }).click();
  await expect(page.locator(".practice-save-status")).toContainText(
    "作答已保存",
  );
  await expect(page.locator(".result-block")).toContainText("回答正确");
  report.checks.push(
    "Veterinary shared-stem questions support both modes and trusted grading",
  );
  assert.deepEqual(report.errors, []);
  report.passed = true;
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  await app.locals.stop();
  store.db.close();
  fs.writeFileSync(
    "test-output/practice-speed-report.json",
    JSON.stringify(report, null, 2),
  );
}
console.log(JSON.stringify(report, null, 2));
