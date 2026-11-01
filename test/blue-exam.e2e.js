import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "@playwright/test";
import { createApp } from "../server/index.js";
import { createStore } from "../server/store.js";
import { launchTestBrowser } from "./helpers/browser.js";

const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "aceexam-blue-exam-ui-"),
  ),
  store = createStore(directory);
const user = store.register("exam_browser", "fixture-password-123");
store.selectCertificate(user.id, "sichuan-upgrading-computer");
const token = store.createAuthSession(user.id),
  app = await createApp({
    store,
    production: true,
    accountSecurity: { enabled: false },
  }),
  server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const report = { passed: false, checks: [], errors: [] },
  version = JSON.parse(fs.readFileSync("mobile/package.json", "utf8")).version;
let browser, page;
fs.mkdirSync("test-output", { recursive: true });
async function contextFor() {
  const context = await browser.newContext({
    viewport: { width: 1672, height: 941 },
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
  return context;
}
async function fit(width) {
  await page.setViewportSize({ width, height: 941 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    )
    .toBeLessThanOrEqual(2);
}
const quiz = () => page.locator(".blue-exam-active");
try {
  browser = await launchTestBrowser();
  const context = await contextFor();
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => report.errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  await page.route("**/api/exams/catalog", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "考试目录读取失败测试" }),
    }),
  );
  await page.goto(base + "/#exam");
  await expect(
    page.getByRole("alert").filter({ hasText: "考试目录读取失败测试" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "开始考试", exact: true }),
  ).toBeDisabled();
  await page.unroute("**/api/exams/catalog");
  await page.getByRole("button", { name: "重新加载", exact: true }).click();
  const catalog = await (
    await page.request.get(base + "/api/exams/catalog")
  ).json();
  const all = catalog.chapters.flatMap((row) =>
      row.knowledgePoints.map((point) => ({ ...point, chapter: row.name })),
    ),
    points = all.filter((point) => point.types.single_choice >= 5).slice(0, 2);
  assert.equal(points.length, 2);
  await page
    .getByRole("checkbox", {
      name: `${points[0].chapter} / ${points[0].section} / ${points[0].name}`,
      exact: true,
    })
    .check();
  await page
    .getByRole("checkbox", {
      name: `${points[1].chapter} / ${points[1].section} / ${points[1].name}`,
      exact: true,
    })
    .check();
  const settings = page.getByRole("complementary", { name: "试卷设置" });
  await settings
    .getByRole("textbox", { name: "试卷名称" })
    .fill("我的专项模拟考试");
  await settings.getByRole("combobox", { name: "考试题量" }).selectOption("10");
  await settings
    .getByRole("checkbox", { name: "多选题", exact: true })
    .uncheck();
  await settings
    .getByRole("checkbox", { name: "判断题", exact: true })
    .uncheck();
  await settings.getByRole("button", { name: "45 分钟", exact: true }).click();
  await expect(
    settings.getByRole("button", { name: "开始考试", exact: true }),
  ).toBeEnabled();
  for (const width of [320, 375, 768, 900, 1280, 1672]) {
    await fit(width);
    if (width === 375 || width === 1672)
      await page.screenshot({
        path: `test-output/blue-exam-setup-${width}.png`,
        fullPage: true,
      });
  }
  report.checks.push(
    "Real knowledge-point catalogue failure blocks creation and retries; leaf selection, question types, count and duration work at 320–1672px",
  );
  let dropped = false;
  await page.route("**/api/exams", async (route) => {
    if (route.request().method() !== "POST" || dropped) return route.continue();
    dropped = true;
    const actual = await route.fetch();
    assert.equal(actual.status(), 200);
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "组卷应答丢失测试" }),
    });
  });
  await settings.getByRole("button", { name: "开始考试", exact: true }).click();
  await expect(
    page.getByText("组卷应答丢失测试", { exact: true }),
  ).toBeVisible();
  assert.equal(
    store.examSessions(user.id, "sichuan-upgrading-computer").length,
    1,
  );
  await page.unroute("**/api/exams");
  await settings.getByRole("button", { name: "开始考试", exact: true }).click();
  await expect(quiz()).toBeVisible();
  const exam = store.examSessions(user.id, "sichuan-upgrading-computer")[0];
  assert.equal(
    store.examSessions(user.id, "sichuan-upgrading-computer").length,
    1,
  );
  assert.equal(exam.durationMs, 45 * 60000);
  assert.equal(exam.questionIds.length, 10);
  assert.deepEqual(
    [...exam.knowledgePointIds].sort(),
    points.map((point) => point.id).sort(),
  );
  assert.ok(
    exam.questionIds.every((id) => store.getQ(id).type === "single_choice"),
  );
  const publicExam = await (
    await page.request.get(base + `/api/exams/${exam.id}`)
  ).json();
  for (const row of publicExam.questions) {
    assert.equal(row.answer, undefined);
    assert.equal(row.analysis, undefined);
  }
  await expect(page.locator(".result-block")).toHaveCount(0);
  const saveRoute = "**/api/exams/*/answers";
  await page.route(saveRoute, (route) => route.abort("internetdisconnected"));
  await quiz().locator(".option").first().click();
  await expect(page.locator(".exam-sync-message")).toContainText(
    "答案暂未同步",
  );
  await page.getByRole("button", { name: "下一题", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        (k) => JSON.parse(localStorage.getItem(k)).index,
        `kaojiang-exam-v2:${user.id}:sichuan-upgrading-computer`,
      ),
    )
    .toBe(1);
  await page.reload();
  await expect(quiz().locator(".question-text")).toHaveText(
    publicExam.questions[1].question,
  );
  await page.getByRole("button", { name: "上一题", exact: true }).click();
  await expect(page.locator(".option.chosen")).toHaveCount(1);
  await expect(page.locator(".exam-sync-message")).toContainText(
    "答案暂未同步",
  );
  await page.getByRole("button", { name: "保存并返回设置", exact: true }).click();
  await expect(page.getByText("答案尚未同步，请先完成保存后再返回考试设置", { exact: true })).toBeVisible();
  await expect(quiz()).toBeVisible();
  await page.unroute(saveRoute);
  await page.getByRole("button", { name: "重试保存", exact: true }).click();
  await expect(page.locator(".exam-sync-message")).toContainText("答案已保存");
  await page
    .getByRole("button", { name: "保存并返回设置", exact: true })
    .click();
  await expect(page.locator(".blue-exam-setup")).toBeVisible();
  await page.getByRole("button", { name: /继续作答/ }).click();
  await expect(page.locator(".option.chosen")).toHaveCount(1);
  for (const width of [375, 900, 1672]) {
    await fit(width);
    if (width !== 900)
      await page.screenshot({
        path: `test-output/blue-exam-active-${width}.png`,
        fullPage: true,
      });
  }
  const fresh = await contextFor(),
    freshPage = await fresh.newPage();
  freshPage.on("pageerror", (error) => report.errors.push(error.message));
  await freshPage.goto(base + "/#exam");
  await freshPage.getByRole("button", { name: /继续作答/ }).click();
  await expect(freshPage.locator(".option.chosen")).toHaveCount(1);
  await fresh.close();
  report.checks.push(
    "Lost create acknowledgement retries the same exam; server timing and selected leaf/type scope are real; no answer leaks; offline drafts restore the question position and recover on this or a fresh browser",
  );
  const attempts = store.allA(user.id).length;
  await page.getByRole("button", { name: "交卷", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "考试结果", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".blue-exam-review-options")).toHaveCount(10);
  assert.equal(store.allA(user.id).length, attempts + 10);
  const graded = store.session(exam.id).result;
  await page.request.post(base + `/api/exams/${exam.id}/submit`, {
    data: { answers: {} },
  });
  assert.equal(store.allA(user.id).length, attempts + 10);
  await page.getByRole("button", { name: "错题与未答", exact: true }).click();
  await expect(page.locator(".blue-exam-result .wrong-item")).toHaveCount(
    graded.results.filter((row) => !row.correct).length,
  );
  await page.screenshot({
    path: "test-output/blue-exam-result.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "再考一次", exact: true }).click();
  await page.getByRole("button", { name: "考试记录", exact: true }).click();
  const history = page.getByRole("region", { name: "考试记录", exact: true });
  await expect(history).toContainText("我的专项模拟考试");
  await history
    .getByRole("button")
    .filter({ hasText: "我的专项模拟考试" })
    .click();
  await expect(
    page.getByRole("heading", { name: "考试结果", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "再考一次", exact: true }).click();
  report.checks.push(
    "Submission records once, results expose trusted options and explanations only afterward, filters work and recent history opens the persisted result",
  );
  for (const certificateId of [
    "network-engineer",
    "hcia-datacom",
    "ncre-ms-office",
    "veterinary-practitioner",
    "sichuan-upgrading-computer",
    "ncre-l2-c-programming",
  ]) {
    assert.equal(
      (
        await page.request.put(base + "/api/auth/certificate", {
          data: { certificateId },
        })
      ).status(),
      200,
    );
    await page.reload();
    await expect(page.locator(".blue-exam-setup")).toBeVisible();
    await page.getByRole("button", { name: "全范围模拟", exact: true }).click();
    await expect(page.locator(".blue-exam-full-scope")).toBeVisible();
    if (certificateId === "veterinary-practitioner") {
      await expect(page.locator(".blue-exam-fixed")).toContainText("400");
      await expect(
        page.getByRole("checkbox", { name: "单选题", exact: true }),
      ).toHaveCount(0);
    }
    if (certificateId === "ncre-l2-c-programming") {
      await expect(
        page.getByRole("checkbox", { name: "多选题", exact: true }),
      ).toHaveCount(0);
      await expect(page.locator(".blue-exam-setup")).toContainText(
        "C 语言上机操作题未纳入",
      );
      await page.getByRole("combobox", { name: "考试题量" }).selectOption("10");
      await page.getByRole("button", { name: "开始考试", exact: true }).click();
      await expect(quiz()).toBeVisible();
      const cExam = store.examSessions(user.id, certificateId)[0];
      assert.equal(cExam.questionIds.length, 10);
      assert(
        cExam.questionIds.every(
          (id) =>
            store.getQ(id).type === "single_choice" &&
            store.getQ(id).certificates.includes(certificateId),
        ),
      );
      const correct = store.getQ(cExam.questionIds[0]).answer[0];
      await quiz()
        .locator(".option")
        .filter({
          has: page.locator(".option-letter", {
            hasText: new RegExp(`^${correct}$`),
          }),
        })
        .click();
      await expect(page.locator(".exam-sync-message")).toContainText(
        "答案已保存",
      );
      await page.reload();
      await expect(page.locator(".option.chosen")).toHaveCount(1);
      await page.getByRole("button", { name: "交卷", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "考试结果", exact: true }),
      ).toBeVisible();
      assert.equal(
        store.session(cExam.id).result.results.filter((row) => row.correct)
          .length,
        1,
      );
      await page.screenshot({
        path: "test-output/blue-exam-c-result.png",
        fullPage: true,
      });
      await page.getByRole("button", { name: "再考一次", exact: true }).click();
    }
  }
  await page.request.put(base + "/api/auth/certificate", {
    data: { certificateId: "network-engineer" },
  });
  await page.reload();
  await page.getByRole("button", { name: "全范围模拟", exact: true }).click();
  await page.getByRole("combobox", { name: "考试题量" }).selectOption("10");
  await page.getByRole("button", { name: "开始考试", exact: true }).click();
  await expect(quiz()).toBeVisible();
  const expiry = store.examSessions(user.id, "network-engineer")[0];
  expiry.expiresAt = new Date(Date.now() - 1000).toISOString();
  store.saveSession(expiry);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "考试结果", exact: true }),
  ).toBeVisible();
  assert.equal(store.session(expiry.id).result.score, 0);
  await page.getByRole("button", { name: "再考一次", exact: true }).click();
  await page.evaluate(() => {
    document.documentElement.dataset.webTheme = "dark";
    document.documentElement.dataset.theme = "dark";
  });
  await page.screenshot({
    path: "test-output/blue-exam-dark.png",
    fullPage: true,
  });
  assert.notEqual(
    await page
      .locator(".exam-scope-panel")
      .evaluate((node) => getComputedStyle(node).backgroundColor),
    "rgb(255, 255, 255)",
  );
  report.checks.push(
    "All six installed certificates keep their own setup; veterinary full exam stays fixed; expiration auto-submits only saved answers and the blue setup supports dark mode",
  );
  assert.deepEqual(report.errors, []);
  report.passed = true;
  await context.close();
} catch (error) {
  report.failure = error.stack;
  process.exitCode = 1;
  if (page && !page.isClosed())
    await page
      .screenshot({ path: "test-output/blue-exam-failure.png", fullPage: true })
      .catch(() => {});
} finally {
  fs.writeFileSync(
    "test-output/blue-exam-report.json",
    JSON.stringify({ ...report, runAt: new Date().toISOString() }, null, 2),
  );
  await browser?.close();
  await app.locals.stop();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  store.db.close();
  assert.equal(path.dirname(directory), os.tmpdir());
  assert.ok(path.basename(directory).startsWith("aceexam-blue-exam-ui-"));
  fs.rmSync(directory, { recursive: true, force: true });
  console.log(JSON.stringify(report));
}
