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
import { accountTestMailbox } from "./helpers/account-mail.js";

// HCIP-Datacom 目录驱动的页面验收：证书选择 → 练习判分与刷新恢复 → 全范围模拟组卷。
Object.assign(process.env, {
  AI_MASTER_KEY: crypto.randomBytes(32).toString("base64"),
  AI_SERVICE_API_KEY: "e2e-fixture-key",
  AI_SERVICE_BASE_URL: "https://ai.example.test/v1",
  AI_SERVICE_MODEL: "fixture",
  ALLOWED_HOSTS: "127.0.0.1,localhost",
  COOKIE_SECURE: "0",
});
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aceexam-hcip-e2e-"));
const store = createStore(directory);
const mailbox = accountTestMailbox();
const app = await createApp({
  store,
  accountSecurity: { enabled: true, mailer: mailbox },
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
const normalize = (value) => value.replace(/\s+/g, "").trim();
try {
  browser = await launchTestBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(
    (key) => localStorage.setItem(key, "seen"),
    `netwise-announcement-v${version}`,
  );
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /ReferenceError|React error/i.test(message.text())) errors.push(message.text());
  });
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto(base);
  await page.getByRole("button", { name: "开始学习", exact: true }).first().click();
  const registration = page.getByRole("dialog", { name: "创建考匠账号" });
  await registration.getByLabel("账号", { exact: true }).fill("hcip_learner");
  await registration.getByLabel("密码", { exact: true }).fill("fixture-password-123");
  await registration.getByLabel("确认密码", { exact: true }).fill("fixture-password-123");
  await registration.getByLabel("邮箱", { exact: true }).fill("hcip@example.test");
  await registration.getByRole("button", { name: "获取验证码", exact: true }).click();
  await expect(registration.getByRole("status")).toContainText("验证码已发送");
  await registration.getByLabel("邮箱验证码", { exact: true }).fill(mailbox.latest("hcip@example.test", "register").code);
  await registration.getByRole("button", { name: "创建账号", exact: true }).click();
  await page.locator(".blue-cert-card").first().waitFor();

  const user = store.allUsers().find((item) => item.username === "hcip_learner");
  assert.ok(user, "registered user exists in isolated store");

  await page
    .locator(".blue-cert-card")
    .filter({ has: page.locator('input[value="hcip-datacom-core"]') })
    .click();
  await page.getByRole("button", { name: "进入学习", exact: true }).click();
  await expect(page.getByRole("heading", { name: "从第一组练习开始", exact: true })).toBeVisible();

  // 练习：题目必须来自 HCIP 核心题库，判分后刷新仍保留结果。
  await page.getByRole("button", { name: /开始 \d+ 题练习/ }).click();
  await expect(page.locator(".question-text")).toBeVisible();
  const questionText = normalize(await page.locator(".question-text").textContent());
  const question = store.allQ().find((item) => normalize(item.question) === questionText);
  assert.ok(question, "practice question exists in loaded bank");
  assert.ok(question.certificates.includes("hcip-datacom-core"), "practice question belongs to HCIP core");
  const wrongOption = Object.keys(question.options).find((key) => !question.answer.includes(key)) ?? Object.keys(question.options)[0];
  await page
    .locator(".option")
    .filter({ has: page.locator(".option-letter", { hasText: new RegExp(`^${wrongOption}$`) }) })
    .click();
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await expect(page.locator(".result-block")).toBeVisible();
  await page.reload();
  await expect(page.locator(".result-block")).toBeVisible();
  await page.screenshot({ path: "test-output/hcip-practice-desktop.png", fullPage: true });

  // 模拟考试：按 HCIP 核心证书组卷，作答后交卷并返回成绩。
  await page.goto(base + "/#exam");
  await page.getByRole("button", { name: "全范围模拟", exact: true }).click();
  await page.getByRole("button", { name: "开始考试", exact: true }).click();
  await expect(page.getByRole("heading", { name: "答题卡", exact: true })).toBeVisible();
  await page.locator(".option").first().click();
  const sessions = store.examSessions(user.id, "hcip-datacom-core");
  assert.ok(sessions.length >= 1, "exam session created for HCIP core");
  assert.ok(sessions[0].questionIds.length >= 10, "HCIP exam has a usable question count");
  await page.getByRole("button", { name: /^交卷/ }).click();
  await page.getByRole("button", { name: /确认交卷|确定/ }).click().catch(() => {});
  await expect(page.getByText(/已交卷|成绩|得分/).first()).toBeVisible({ timeout: 20000 });
  await page.screenshot({ path: "test-output/hcip-exam-desktop.png", fullPage: true });

  assert.deepEqual(errors, []);
  console.log(
    `Browser HCIP check passed: ${sessions[0].questionIds.length}-question exam, practice scoring and reload recovery.`,
  );
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: "test-output/hcip-e2e-failure.png", fullPage: true }).catch(() => {});
    fs.writeFileSync(
      "test-output/hcip-e2e-failure.txt",
      `${error.stack}\n\n${await page.locator("body").innerText().catch(() => "")}\n\nPage errors: ${errors.join("\n")}`,
    );
  }
  throw error;
} finally {
  await browser?.close();
  await app.locals.stop();
  await new Promise((resolve) => server.close(resolve));
  store.db.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
