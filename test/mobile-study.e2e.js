// Run after npm run build:mobile-web. All accounts and AI responses are local fixtures.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { chromium, webkit, expect } from "@playwright/test";
import { createApp } from "../server/index.js";
import { createStore } from "../server/store.js";
import { OpenAICompatibleProvider } from "../server/ai.js";
import { studyNodes } from "../server/study-content.js";
import { deploymentStudySeeds } from "../server/study-seeds/index.js";
import { mockAI } from "./ai-fixture.js";
import {
  mockStudyAI,
  fixtureStudyBundle,
  fixtureStudyReview,
  studyReference,
} from "./study-fixture.js";

Object.assign(process.env, {
  AI_MASTER_KEY: crypto.randomBytes(32).toString("base64"),
  AI_SERVICE_API_KEY: "mobile-study-fixture",
  AI_SERVICE_BASE_URL: "https://ai.example.test/v1",
  AI_SERVICE_MODEL: "fixture",
  ALLOWED_HOSTS: "127.0.0.1,localhost",
  COOKIE_SECURE: "0",
});
const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "aceexam-mobile-study-"),
);
const store = createStore(directory),
  fake = mockStudyAI();
const app = await createApp({
  store,
  provider: new OpenAICompatibleProvider(store, { fetch: mockAI() }),
  studyAI: fake,
  studySeeds: deploymentStudySeeds.filter((item) => item.nodeId.startsWith("sichuan-upgrading-computer:")),
  production: true,
});
const lessonNode = studyNodes[0],
  bundle = fixtureStudyBundle();
const publication = app.locals.study.savePackage(
  lessonNode,
  { bundle, review: fixtureStudyReview(bundle), accepted: true },
  studyReference,
  "fixture",
);
app.locals.study.publish(publication.id, "fixture", lessonNode);
// Drop a successful response at the server boundary, including when a service worker controls the page.
const gateway = express(),
  requestIds = [];
let loseResponse = false;
gateway.post("/api/study/practice-sessions/:id/attempts", (req, res, next) => {
  const json = res.json.bind(res);
  res.json = (data) => {
    requestIds.push(req.body.requestId);
    if (loseResponse) {
      loseResponse = false;
      return json.call(res.status(503), { error: "学习网络短暂中断" });
    }
    return json(data);
  };
  next();
});
gateway.use(app);
const server = gateway.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`,
  out = path.resolve("test-output/mobile-study");
fs.mkdirSync(out, { recursive: true });
let browser;
const errors = [];
const studyTraffic = [];
const mobile = {
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
};
async function userPage(user, theme = "light") {
  const context = await browser.newContext(mobile);
  await context.addInitScript(
    ({ token, theme }) => {
      localStorage.setItem("kaojiang-session-token", token);
      localStorage.setItem("kaojiang-theme-mode", theme);
    },
    { token: store.createAuthSession(user.id), theme },
  );
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/api/study/"))
      studyTraffic.push(
        `${request.method()} ${new URL(request.url()).pathname}`,
      );
  });
  page.on("response", (response) => {
    if (response.url().includes("/api/study/"))
      studyTraffic.push(
        `${response.status()} ${new URL(response.url()).pathname}`,
      );
  });
  await page.goto(`${base}/app/`);
  await page.getByRole("button", { name: "VIP导航", exact: true }).click();
  return page;
}
async function noOverflow(page) {
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
}
try {
  for (const [engine, type] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    if (
      process.env.TEST_BROWSER_ENGINE &&
      process.env.TEST_BROWSER_ENGINE !== engine
    )
      continue;
    studyTraffic.length = 0;
    browser = await type.launch({
      headless: true,
      proxy: { server: "http://127.0.0.1:9", bypass: "127.0.0.1,localhost" },
    });
    const learner = await store.register(
      `mobile_study_${engine}`,
      "fixture-password-123",
    );
    store.selectCertificate(learner.id, "network-engineer");
    store.saveAccountEntitlement(learner.id, {
      plan: "vip",
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    const page = await userPage(
      learner,
      engine === "webkit" ? "dark" : "light",
    );
    const text = (value) =>
      page.getByText(value, { exact: true }).filter({ visible: true });
    const button = (name) => page.getByRole("button", { name, exact: true });
    const shot = (name) =>
      page.screenshot({ path: path.join(out, `${engine}-${name}.png`) });
    const tab = (name) => button(`${name}导航`).click();
    await shot("vip");
    await button("进入 AI 精炼").click();
    await button("开始第一课").waitFor();
    await page.getByLabel("搜索知识点", { exact: true }).fill("OSI");
    await expect(text("OSI七层模型 · 第 1 / 7 课")).toBeVisible();
    await expect(button("物理层，准备中")).toBeDisabled();
    await page.getByLabel("搜索知识点", { exact: true }).fill("");
    await shot("directory");
    await button("开始第一课").click();
    await button("我学完了，开始练习").waitFor();
    await expect(
      page.getByRole("tab", { name: "填空练习", exact: true }),
    ).toBeDisabled();
    await text("先记住这一句").waitFor();
    await page.setViewportSize({ width: 320, height: 568 });
    await expect(button("我学完了，开始练习")).toBeInViewport();
    await noOverflow(page);
    await shot("lesson-small");
    await page.setViewportSize({ width: 375, height: 812 });
    await noOverflow(page);
    await shot("lesson");
    await button("问老师").click();
    const teacher = page.getByRole("dialog", { name: "AI 老师", exact: true });
    await teacher
      .getByRole("button", { name: "举个例子", exact: true })
      .click();
    await expect(teacher).toContainText("8＋4＋1");
    await expect(teacher).toContainText("再看一个例子");
    const prompt = teacher.getByLabel("向 AI 老师提问", { exact: true });
    const teacherBefore = fake.teacherCalls;
    await prompt.fill("位权应该从哪里开始排列？");
    fake.failTeacher = true;
    await teacher
      .getByRole("button", { name: "发送问题", exact: true })
      .click();
    await expect(teacher.getByRole("alert")).toContainText("问题已保留");
    await expect(prompt).toHaveValue("位权应该从哪里开始排列？");
    fake.failTeacher = false;
    await teacher
      .getByRole("button", { name: "发送问题", exact: true })
      .click();
    await expect(teacher).toContainText("先从最右边的一位开始看。");
    assert.equal(fake.teacherCalls, teacherBefore + 2);
    await prompt.fill("我想再确认一下计算顺序");
    await page.setViewportSize({ width: 812, height: 375 });
    await expect(prompt).toBeVisible();
    await expect(
      teacher.getByRole("button", { name: "发送问题", exact: true }),
    ).toBeInViewport();
    await noOverflow(page);
    await shot("teacher-landscape");
    await page.setViewportSize({ width: 375, height: 812 });
    await shot("teacher");
    await teacher.getByRole("button", { name: "收起", exact: true }).click();
    await expect(teacher).toHaveCount(0);
    await button("我学完了，开始练习").click();
    const blank = (number) =>
      page
        .getByLabel(`第 ${number} 空答案`, { exact: true })
        .filter({ visible: true });
    await blank(1).fill("1");
    const gradingBeforeExact = fake.gradeCalls;
    await expect(blank(1)).toHaveValue("1");
    requestIds.length = 0;
    loseResponse = true;
    await button("提交本题").click();
    await expect(page.getByRole("alert")).toContainText("你的填写已保留");
    await expect(blank(1)).toHaveValue("1");
    await button("提交本题").click();
    await text("全部答对了").waitFor();
    await expect(text("全部答对了")).toBeInViewport();
    assert.equal(
      fake.gradeCalls,
      gradingBeforeExact,
      "an exact mobile answer never calls AI",
    );
    assert.equal(requestIds[0], requestIds[1]);
    assert.equal(
      store.db
        .prepare("SELECT count(*) AS count FROM study_attempts WHERE user_id=?")
        .get(learner.id).count,
      1,
    );
    await button("下一题").click();
    await blank(1).fill("数位的权值");
    await blank(2).fill("2");
    fake.failGrade = true;
    await button("提交本题").click();
    await text("部分表达需要复核").waitFor();
    await expect(text("参考答案：位权")).toHaveCount(0);
    fake.failGrade = false;
    await button("重新判分").click();
    await text("2 / 2 分").waitFor();
    await button("下一题").click();
    await blank(1).fill("12");
    const gradingBeforeDifferentNumber = fake.gradeCalls;
    await button("提交本题").click();
    await text("参考答案：13").waitFor();
    assert.equal(
      fake.gradeCalls,
      gradingBeforeDifferentNumber + 1,
      "a different numeric answer enters AI grading",
    );
    await button("对评分有疑问").click();
    await page
      .getByLabel("评分反馈", { exact: true })
      .fill("希望再解释一下位权的计算过程。");
    await button("提交评分反馈").click();
    await text("已提交反馈，复核后会更新这次成绩。").waitFor();
    await shot("feedback");
    await button("下一题").click();
    await blank(1).fill("1101");
    await page.getByRole("tab", { name: "知识精讲", exact: true }).click();
    await page.getByRole("tab", { name: "填空练习", exact: true }).click();
    await expect(blank(1)).toHaveValue("1101");
    await tab("我的");
    await tab("VIP");
    await expect(blank(1)).toHaveValue("1101");
    await button("课程目录").click();
    await button("返回 VIP").click();
    await button("进入 AI 精炼").click();
    await button("继续本课").click();
    await expect(blank(1)).toHaveValue("1101");
    await button("问老师").click();
    await teacher
      .getByRole("button", { name: "给我提示", exact: true })
      .click();
    await expect(teacher).toContainText("先把这个数分解成几个不同的二进制位权");
    await teacher.getByRole("button", { name: "收起", exact: true }).click();
    await page.reload();
    await tab("VIP");
    await button("进入 AI 精炼").click();
    await expect(
      page.getByRole("tab", { name: "填空练习", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(blank(1)).toHaveValue("");
    await blank(1).fill("1101");
    await button("提交本题").click();
    await text("全部答对了").waitFor();
    await button("下一题").click();
    await blank(1).fill("1110");
    await blank(2).fill("100");
    await button("提交本题").click();
    await text("1 / 2 分").waitFor();
    await expect(text("1 / 2 分")).toBeInViewport();
    await text("这一组练完了").waitFor();
    await noOverflow(page);
    await shot("practice");
    await button("再练一组").click();
    await expect(blank(1)).toHaveValue("");
    await expect(
      text("二进制1101转换成十进制，其值是〔第 1 空〕。"),
    ).toBeVisible();
    assert.equal(
      store.db
        .prepare("SELECT count(*) AS count FROM study_feedback WHERE user_id=?")
        .get(learner.id).count,
      1,
    );
    const persisted = await page.evaluate(() =>
      Object.entries(localStorage).filter(([key]) =>
        key.includes("study-position"),
      ),
    );
    assert.ok(persisted.length > 0);
    assert.ok(
      persisted.every(([, value]) =>
        Object.keys(JSON.parse(value)).every((key) =>
          ["nodeId", "mode"].includes(key),
        ),
      ),
    );
    store.saveAccountEntitlement(learner.id, {
      plan: "vip",
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    await button("问老师").click();
    await text("把知识点，真正学进去").waitFor();
    await expect(
      page.getByRole("dialog", { name: "AI 老师", exact: true }),
    ).toHaveCount(0);
    await expect(blank(1)).toHaveCount(0);
    await button("去开通或续期").click();
    await expect(page.getByLabel("会员兑换码", { exact: true })).toBeVisible();
    await page.context().close();

    const free = await store.register(
      `mobile_study_free_${engine}`,
      "fixture-password-123",
    );
    store.selectCertificate(free.id, "network-engineer");
    const freePage = await userPage(free);
    await freePage
      .getByRole("button", { name: "进入 AI 精炼", exact: true })
      .click();
    await expect(
      freePage.getByText("把知识点，真正学进去", { exact: true }),
    ).toBeVisible();
    await expect(
      freePage.getByLabel("搜索知识点", { exact: true }),
    ).toHaveCount(0);
    await freePage.context().close();
    const other = await store.register(
      `mobile_study_other_${engine}`,
      "fixture-password-123",
    );
    store.selectCertificate(other.id, "hcia-datacom");
    store.saveAccountEntitlement(other.id, {
      plan: "vip",
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    const otherPage = await userPage(other);
    await otherPage
      .getByRole("button", { name: "进入 AI 精炼", exact: true })
      .click();
    await expect(
      otherPage.getByText("这个科目的课程正在准备", { exact: true }),
    ).toBeVisible();
    await otherPage
      .getByRole("button", { name: "切换备考目标", exact: true })
      .click();
    await expect(
      otherPage.getByRole("dialog").getByText("切换备考目标", { exact: true }),
    ).toBeVisible();
    await otherPage.context().close();

    const upgradingUser = await store.register(`mobile_sc_study_${engine}`, "fixture-password-123");
    store.selectCertificate(upgradingUser.id, "sichuan-upgrading-computer");
    store.saveAccountEntitlement(upgradingUser.id, { plan: "vip", expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const upgradingPage = await userPage(upgradingUser, engine === "webkit" ? "dark" : "light");
    await upgradingPage.getByRole("button", { name: "进入 AI 精炼", exact: true }).click();
    await upgradingPage.getByLabel("搜索知识点", { exact: true }).fill("ABS");
    await expect(upgradingPage.getByRole("button", { name: "Excel ABS：绝对值，未读", exact: true })).toBeVisible();
    await upgradingPage.getByRole("button", { name: "Excel ABS：绝对值，未读", exact: true }).click();
    await expect(upgradingPage.getByRole("tab", { name: "填空练习", exact: true })).toBeDisabled();
    await expect(upgradingPage.getByText("Excel ABS：绝对值", { exact: true }).filter({ visible: true })).toBeVisible();
    await upgradingPage.getByRole("button", { name: "我学完了，开始练习", exact: true }).click();
    await upgradingPage.getByLabel("第 1 空答案", { exact: true }).fill("ABS");
    await upgradingPage.getByRole("button", { name: "提交本题", exact: true }).click();
    await expect(upgradingPage.getByText("全部答对了", { exact: true }).filter({ visible: true })).toBeVisible();
    await noOverflow(upgradingPage);
    await upgradingPage.screenshot({ path: path.join(out, `${engine}-sichuan-practice.png`) });
    await upgradingPage.context().close();
    await browser.close();
    browser = null;
    console.log(
      `${engine}: VIP entry, Sichuan split lessons and practice, teacher recovery, grading, feedback, drafts, progress, membership and certificate gates passed`,
    );
  }
  assert.deepEqual(errors, []);
} catch (error) {
  console.error(studyTraffic.slice(-50).join("\n"));
  for (const context of browser?.contexts() || [])
    for (const page of context.pages()) {
      console.error((await page.locator("body").innerText()).slice(0, 8000));
      await page
        .screenshot({ path: path.join(out, "failure.png") })
        .catch(() => {});
    }
  throw error;
} finally {
  await browser?.close();
  await app.locals.stop();
  await new Promise((resolve) => server.close(resolve));
  store.db.close();
  if (
    path.dirname(directory) !== path.resolve(os.tmpdir()) ||
    !path.basename(directory).startsWith("aceexam-mobile-study-")
  )
    throw new Error("Unsafe cleanup");
  fs.rmSync(directory, { recursive: true, force: true });
}
