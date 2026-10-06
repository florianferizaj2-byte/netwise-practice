import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "@playwright/test";
import { createStore } from "../server/store.js";
import { createApp } from "../server/index.js";
import { OpenAICompatibleProvider } from "../server/ai.js";
import { mockAI } from "./ai-fixture.js";
import { mockStudyAI, studyReference } from "./study-fixture.js";
import { launchTestBrowser } from "./helpers/browser.js";

Object.assign(process.env, { AI_MASTER_KEY: crypto.randomBytes(32).toString("base64"),
  AI_SERVICE_API_KEY: "study-browser-fixture", AI_SERVICE_BASE_URL: "https://ai.example.test/v1",
  AI_SERVICE_MODEL: "fixture", ALLOWED_HOSTS: "127.0.0.1,localhost", COOKIE_SECURE: "0" });
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aceexam-study-browser-"));
const store = createStore(directory), fake = mockStudyAI();
const owner = await store.register("study_browser_owner", "fixture-password-123");
const learner = await store.register("study_browser_learner", "fixture-password-123");
const free = await store.register("study_browser_free", "fixture-password-123");
store.db.prepare("UPDATE users SET is_admin=1 WHERE id=?").run(owner.id);
for (const user of [owner, learner, free]) store.selectCertificate(user.id, "network-engineer");
store.saveAccountEntitlement(learner.id, { plan: "vip", expiresAt: new Date(Date.now() + 86400000).toISOString() });
const app = await createApp({ store, provider: new OpenAICompatibleProvider(store, { fetch: mockAI() }),
  studyAI: fake, studySeeds: null, production: true });
const server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
const errors = [];
const version = JSON.parse(fs.readFileSync(new URL("../mobile/package.json", import.meta.url), "utf8")).version;
fs.mkdirSync("test-output", { recursive: true });
async function userPage(user, viewport = { width: 1580, height: 1100 }) {
  const context = await browser.newContext({ viewport });
  await context.addCookies([{ name: "netwise_session", value: store.createAuthSession(user.id), url: base }]);
  await context.addInitScript((key) => localStorage.setItem(key, "seen"), `netwise-announcement-v${version}`);
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  return page;
}
try {
  browser = await launchTestBrowser();
  const admin = await userPage(owner);
  await admin.goto(`${base}/#admin`);
  await expect(admin.getByRole("heading", { name: "管理员面板", exact: true })).toBeVisible();
  await admin.getByRole("tab", { name: "AI 精讲与练习", exact: true }).click();
  await expect(admin.getByRole("heading", { name: "精讲与练习内容", exact: true })).toBeVisible();
  const reference = admin.getByLabel("已确认的参考资料", { exact: true });
  await expect(reference).toBeEnabled(); await reference.fill(studyReference);
  await admin.getByRole("button", { name: "生成讲解与填空题", exact: true }).click();
  await expect(admin.locator(".ss-publication-status")).toHaveText("已发布", { timeout: 25000 });
  await expect(admin.locator(".ss-publish-actions")).toContainText("当前提供给会员的版本");
  assert.equal(fake.generationCalls, 1);
  await expect(admin.locator(".ss-question-preview")).toHaveCount(6);
  const audit = admin.getByRole("region", { name: "知识讲解 AI 审核", exact: true });
  await expect(audit).toContainText("知识正确性");
  await expect(audit).toContainText("知识点匹配");
  await expect(audit.locator("dd")).toHaveText(["通过", "通过"]);
  await admin.locator(".ss-question-preview summary").first().click();
  await admin.screenshot({ path: "test-output/subjective-admin.png", fullPage: true });
  const page = await userPage(learner);
  await page.goto(`${base}/#vip`);
  await page.getByRole("region", { name: "会员 AI 精讲与练习" }).getByRole("button", { name: "进入学习与练习", exact: true }).click();
  await expect(page.getByRole("heading", { name: "AI 精讲与练习", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "生成讲解与填空题", exact: true })).toHaveCount(0);
  await expect(page.locator(".ss-lesson")).toContainText("进制互转");
  const teacher = page.locator(".ss-teacher");
  await teacher.getByRole("button", { name: "举个例子", exact: true }).click();
  await expect(teacher.locator(".ss-teacher-example")).toContainText("8＋4＋1");
  assert.equal(fake.teacherCalls, 0);
  await teacher.getByLabel("你的问题", { exact: true }).fill("位权应该从哪里开始排列？");
  await teacher.getByRole("button", { name: "问老师", exact: true }).click();
  await expect(teacher.locator(".ss-teacher-answer").last()).toContainText("最右边");
  assert.equal(fake.teacherCalls, 1);
  await page.screenshot({ path: "test-output/subjective-learning.png", fullPage: true });
  await page.getByRole("button", { name: "我学完了，开始练习", exact: true }).click();
  await expect(page.locator("#ss-answer-q1-b1")).toBeVisible();
  await page.locator("#ss-answer-q1-b1").fill("1");
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await expect(page.locator(".ss-result")).toContainText("全部答对了");
  assert.equal(fake.gradeCalls, 0);
  await page.getByRole("button", { name: "下一题", exact: true }).click();
  await page.locator("#ss-answer-q2-b1").fill("数位的权值");
  await page.locator("#ss-answer-q2-b2").fill("2");
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await expect(page.locator(".ss-result")).toContainText("2 / 2 分");
  assert.equal(fake.gradeCalls, 1);
  await page.getByRole("button", { name: "下一题", exact: true }).click();
  await page.locator("#ss-answer-q3-b1").fill("13");
  await page.reload();
  await expect(page.getByRole("tab", { name: "练习", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#ss-answer-q3-b1")).toHaveValue("13");
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await expect(page.locator(".ss-result")).toContainText("全部答对了");
  await page.screenshot({ path: "test-output/subjective-practice.png", fullPage: true });
  await page.getByRole("button", { name: "申请复核", exact: true }).click();
  await page.getByLabel("哪里需要复核？", { exact: true }).fill("希望再解释一下位权的计算过程。" );
  await page.getByRole("button", { name: "提交复核", exact: true }).click();
  await expect(page.locator(".ss-notice")).toContainText("已提交复核");

  await admin.getByRole("button", { name: "刷新", exact: true }).click();
  await expect(admin.locator(".ss-grade-review")).toBeVisible();
  await admin.getByLabel("复核依据", { exact: true }).fill("按8＋4＋1计算得到13，原判分正确。" );
  await admin.getByRole("button", { name: "保存复核结果", exact: true }).click();
  await expect(admin.locator(".ss-grade-review")).toHaveCount(0);

  fake.rejectKnowledge = true;
  const nodeSelect = admin.getByLabel("章节、知识点与小节", { exact: true });
  const secondNode = await nodeSelect.locator("option").nth(1).getAttribute("value");
  await nodeSelect.selectOption(secondNode);
  await expect(reference).toBeEnabled(); await reference.fill(studyReference);
  await admin.getByRole("button", { name: "生成讲解与填空题", exact: true }).click();
  await expect(audit.locator("dd")).toHaveText(["未通过", "通过"], { timeout: 25000 });
  await expect(admin.getByRole("button", { name: "发布这份内容", exact: true })).toHaveCount(0);
  await expect(audit).toContainText("计算过程存在错误");
  await admin.screenshot({ path: "test-output/subjective-admin-rejected.png", fullPage: true });
  fake.rejectKnowledge = false;

  await admin.goto(`${base}/#study-admin`);
  await expect(admin.getByRole("heading", { name: "管理员面板", exact: true })).toBeVisible();
  await expect(admin.getByRole("tab", { name: "AI 精讲与练习", exact: true })).toHaveAttribute("aria-selected", "true");

  await page.setViewportSize({ width: 620, height: 1000 });
  await page.getByRole("tab", { name: "学习", exact: true }).click();
  await expect(page.getByLabel("知识点与小节", { exact: true })).toBeVisible();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "narrow web has no horizontal overflow");
  await page.screenshot({ path: "test-output/subjective-narrow.png", fullPage: true });

  const nonmember = await userPage(free);
  await nonmember.goto(`${base}/#study`);
  await expect(nonmember.getByRole("heading", { name: "会员专属的学习与练习", exact: true })).toBeVisible();
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log("AI 精讲与练习浏览器检查通过：管理员面板生成、知识正确性与知识点匹配审核、发布拦截、会员学习、短答老师、逐空判分、刷新恢复和窄屏布局。");
} finally {
  if (browser) await browser.close();
  await app.locals.stop(); await new Promise((resolve) => server.close(resolve)); store.db.close();
  assert.ok(path.resolve(directory).startsWith(path.join(os.tmpdir(), "aceexam-study-browser-")));
  fs.rmSync(directory, { recursive: true, force: true });
}
