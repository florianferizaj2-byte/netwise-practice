import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createApp } from "../server/index.js";
import { createStore } from "../server/store.js";
import { OpenAICompatibleProvider } from "../server/ai.js";
import { mockAI } from "./ai-fixture.js";
import { launchTestBrowser } from "./helpers/browser.js";

// Use an isolated database and fake upstream credentials, even if .env exists.
Object.assign(process.env, {
  AI_MASTER_KEY: crypto.randomBytes(32).toString("base64"),
  AI_SERVICE_API_KEY: "e2e-fixture-key",
  AI_SERVICE_BASE_URL: "https://ai.example.test/v1",
  AI_SERVICE_MODEL: "fixture",
  ALLOWED_HOSTS: "127.0.0.1,localhost",
  COOKIE_SECURE: "0",
});
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aceexam-e2e-"));
const store = createStore(directory);
const app = await createApp({
  store,
  provider: new OpenAICompatibleProvider(store, { fetch: mockAI() }),
  production: true,
});
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
fs.mkdirSync("test-output", { recursive: true });
let browser, page;
const errors = [];
const version = JSON.parse(
  fs.readFileSync(new URL("../mobile/package.json", import.meta.url), "utf8"),
).version;
const dismissAnnouncement = (key) => localStorage.setItem(key, "seen");
const normalize = (value) => value.replace(/\s+/g, "").trim();
try {
  browser = await launchTestBrowser();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.addInitScript(
    dismissAnnouncement,
    `netwise-announcement-v${version}`,
  );
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /ReferenceError|React error/i.test(message.text())
    )
      errors.push(message.text());
  });
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto(base);
  await expect(page.getByRole("heading", { name: /把每一道题/ })).toBeVisible();
  const trial = page.getByRole("region", { name: "免登录免费体验五道题" });
  await trial.getByRole("radio").first().check();
  await trial.getByRole("button", { name: "确认答案", exact: true }).click();
  await expect(page.locator(".desk-trial-feedback")).toBeVisible();
  await page.reload();
  await expect(trial).toContainText("已完成 1 / 5");
  await trial.getByRole("button", { name: /第 1 题/ }).click();
  await expect(page.locator(".desk-trial-feedback")).toBeVisible();
  await page.screenshot({
    path: "test-output/home-desktop.png",
    fullPage: true,
  });

  await page
    .getByRole("button", { name: "开始学习", exact: true })
    .first()
    .click();
  const registration = page.getByRole("dialog", { name: "创建考匠账号" });
  await registration.getByLabel("账号", { exact: true }).fill("e2e_learner");
  await registration
    .getByLabel("密码", { exact: true })
    .fill("fixture-password-123");
  await registration
    .getByLabel("确认密码", { exact: true })
    .fill("fixture-password-123");
  await registration
    .getByRole("button", { name: "创建账号", exact: true })
    .click();
  await page
    .getByRole("button", { name: /网络工程师/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "从第一组练习开始", exact: true }),
  ).toBeVisible();
  const user = store.allUsers().find((item) => item.username === "e2e_learner");
  assert.ok(user);

  await page
    .getByRole("button", { name: "开始 10 题练习", exact: true })
    .click();
  await expect(page.locator(".question-text")).toBeVisible();
  const questionText = normalize(
    await page.locator(".question-text").textContent(),
  );
  const question = store
    .allQ()
    .find((item) => normalize(item.question) === questionText);
  assert.ok(question, "practice renders a question from the isolated store");
  const wrongOption = Object.keys(question.options).find(
    (key) => !question.answer.includes(key),
  );
  await page
    .locator(".option")
    .filter({
      has: page.locator(".option-letter", {
        hasText: new RegExp(`^${wrongOption}$`),
      }),
    })
    .click();
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await expect(page.locator(".result-block")).toBeVisible();
  await page.reload();
  await expect(page.locator(".result-block")).toBeVisible();
  await page.screenshot({
    path: "test-output/practice-desktop.png",
    fullPage: true,
  });
  await page.goto(base + "/#wrong");
  await expect(
    page.getByRole("heading", { name: "错题本", exact: true }),
  ).toBeVisible();
  assert.equal(store.wrongQuestions(user.id).length, 1);

  await page.goto(base + "/#exam");
  await page.getByRole("button", { name: "全范围模拟", exact: true }).click();
  await page.getByRole("button", { name: "开始考试", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "答题卡", exact: true }),
  ).toBeVisible();
  // A failed save must retain the answer across reload and expose a retry.
  const saveRoute = "**/api/exams/*/answers";
  await page.route(saveRoute, (route) => route.abort("internetdisconnected"));
  await page.locator(".option").first().click();
  await expect(page.locator(".exam-sync-message")).toContainText(
    "答案暂未同步",
  );
  await page.reload();
  await expect(page.locator(".option.chosen")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "重试保存", exact: true }),
  ).toBeVisible();
  await page.unroute(saveRoute);
  await page.getByRole("button", { name: "重试保存", exact: true }).click();
  await expect(page.locator(".exam-sync-message")).toContainText("答案已保存");
  const exam = store.examSessions(user.id, "network-engineer")[0];
  assert.equal(exam.answersVersion, 1);

  // A new device has cookies but no local exam checkpoint.
  const fresh = await browser.newContext({
    viewport: { width: 1367, height: 900 },
  });
  await fresh.addCookies(await context.cookies());
  await fresh.addInitScript(
    dismissAnnouncement,
    `netwise-announcement-v${version}`,
  );
  const freshPage = await fresh.newPage();
  freshPage.on("pageerror", (error) => errors.push(error.message));
  await freshPage.goto(base + "/#exam");
  await freshPage.getByRole("button", { name: /继续作答/ }).click();
  await expect(freshPage.locator(".option.chosen")).toHaveCount(1);
  await fresh.close();

  // An edit on another device cannot be silently overwritten by this page.
  const secondId = exam.questionIds[1];
  const otherSave = await page.request.put(
    `${base}/api/exams/${exam.id}/answers`,
    {
      data: {
        answers: { ...exam.answers, [secondId]: ["A"] },
        expectedVersion: 1,
      },
    },
  );
  assert.equal(otherSave.status(), 200);
  await page.locator(".option").nth(1).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "其他页面已更新" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "合并本机作答", exact: true }).click();
  await expect(page.locator(".exam-sync-message")).toContainText("答案已保存");
  assert.deepEqual(store.session(exam.id).answers[secondId], ["A"]);
  assert.equal(store.session(exam.id).answersVersion, 3);
  await page.screenshot({
    path: "test-output/exam-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "交卷", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "考试结果", exact: true }),
  ).toBeVisible();
  assert.equal(store.allA(user.id).length, exam.questionIds.length + 1);

  for (const [route, heading] of [
    ["guide", "考试与证书指南"],
    ["community", "共享 AI 题库"],
    ["chat", "考匠社区"],
    ["settings", "设置"],
    ["admin", "管理员面板"],
    ["chapters", "章节练习"],
  ]) {
    await page.goto(`${base}/#${route}`);
    await expect(
      page.getByRole("heading", { name: heading, exact: true }).first(),
    ).toBeVisible();
  }
  // The badge renders after the API returns a populated membership list.
  await page.goto(base + "/#admin");
  await page.getByRole("tab", { name: "兑换码", exact: true }).click();
  const membershipRows = page.locator(".membership-admin tbody tr");
  await expect(membershipRows).toHaveCount(30);
  await expect(membershipRows.locator(".member-tier")).toHaveCount(30);
  for (const plan of ["vip", "svip", "ssvip"]) {
    const badges = membershipRows.locator(`.member-tier-${plan}`);
    await expect(badges).toHaveCount(10);
    await expect(badges.first()).toHaveText(plan.toUpperCase());
  }
  await expect(
    page.getByRole("heading", { name: "页面暂时无法打开", exact: true }),
  ).toHaveCount(0);
  assert.deepEqual(
    errors,
    [],
    "a populated membership table must not throw during rendering",
  );
  await page.screenshot({
    path: "test-output/admin-membership-codes.png",
    fullPage: true,
  });

  await page.goto(base + "/#training");
  await expect(
    page.getByRole("heading", { name: "暂无待完成的训练", exact: true }),
  ).toBeVisible();
  await page.goto(base + "/#vip");
  await expect(page.locator(".vip-page")).toBeVisible();
  await page.getByRole("combobox", { name: "切换备考目标", exact: true }).selectOption("sichuan-upgrading-computer");
  await expect(page.getByRole("combobox", { name: "切换备考目标", exact: true })).toHaveValue("sichuan-upgrading-computer");
  await page.goto(base + "/#guide");
  await expect(page.getByRole("heading", { name: "四川专升本 · 计算机基础", exact: true })).toBeVisible();
  await expect(page.locator(".guide-knowledge-grid article")).toHaveCount(7);
  await expect(page.locator(".guide-knowledge-grid")).toContainText("参考分值约 35%");
  await page.screenshot({ path: "test-output/sichuan-guide-desktop.png", fullPage: true });
  await page.goto(base + "/#chapters");
  await expect(page.getByRole("heading", { name: "章节练习", exact: true }).first()).toBeVisible();
  await page.screenshot({ path: "test-output/sichuan-chapters-desktop.png", fullPage: true });
  await page.goto(base + "/#home");
  await page.getByRole("button", { name: "开始 10 题练习", exact: true }).click();
  await expect(page.locator(".question-text")).toBeVisible();
  const upgradingText = normalize(await page.locator(".question-text").textContent());
  const upgradingQuestion = store.allQ().find((item) => normalize(item.question) === upgradingText);
  assert.ok(upgradingQuestion?.certificates.includes("sichuan-upgrading-computer"));
  await page.screenshot({ path: "test-output/sichuan-practice-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/#downloads");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "download page fits mobile viewport",
  );
  await page.screenshot({
    path: "test-output/downloads-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "Browser regression passed: guest trial, real authentication, practice, offline exam recovery, cross-device conflict, non-empty membership table, lazy pages and responsive downloads.",
  );
} catch (error) {
  if (page && !page.isClosed()) {
    await page
      .screenshot({ path: "test-output/e2e-failure.png", fullPage: true })
      .catch(() => {});
    fs.writeFileSync(
      "test-output/e2e-failure.txt",
      `${error.stack}\n\n${await page
        .locator("body")
        .innerText()
        .catch(() => "")}\n\nPage errors: ${errors.join("\n")}`,
    );
  }
  throw error;
} finally {
  await browser?.close();
  await app.locals.stop();
  await new Promise((resolve) => server.close(resolve));
  store.db.close();
  assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
  assert.ok(path.basename(directory).startsWith("aceexam-e2e-"));
  fs.rmSync(directory, { recursive: true, force: true });
}
