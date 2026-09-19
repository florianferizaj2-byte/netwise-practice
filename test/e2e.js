import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/index.js";
import { createStore } from "../server/store.js";
import { OpenAICompatibleProvider } from "../server/ai.js";
import { mockAI } from "./ai-fixture.js";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "netwise-e2e-"));
const store = createStore(dir);
const app = await createApp({
  store,
  provider: new OpenAICompatibleProvider(store, { fetch: mockAI() }),
  production: true,
  authRequired: false,
});
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;
fs.mkdirSync("test-output", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.platform === "win32" ? { channel: "msedge" } : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(base);
  await page.getByRole("heading", { name: "今天，离掌握更近一步。" }).waitFor();
  await page.screenshot({
    path: "test-output/home-desktop.png",
    fullPage: true,
  });
  assert.equal(
    await page
      .locator("img")
      .evaluateAll((imgs) =>
        imgs.every((i) => i.complete && i.naturalWidth > 0),
      ),
    true,
  );
  await page.getByRole("button", { name: "章节练习", exact: true }).click();
  await page.getByRole("button", { name: /网络体系结构.*题/ }).click();
  await page.getByRole("button", { name: /A 网络层/ }).click();
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await page.getByRole("heading", { name: /这道题还需要巩固/ }).waitFor();
  await page.getByRole("button", { name: /下一题/ }).click();
  await page.getByRole("button", { name: /C 目的 MAC 地址/ }).click();
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await page.getByRole("heading", { name: /回答正确/ }).waitFor();
  await page.screenshot({
    path: "test-output/practice-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /错题本/ }).click();
  await page.getByText("错误 1 次", { exact: true }).waitFor();
  await page.getByRole("button", { name: "再做一次" }).click();
  await page.getByRole("button", { name: "给我提示 0/3" }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "请先在设置中配置 AI API Key" })
    .waitFor();
  await page.getByRole("button", { name: /B 传输层/ }).click();
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await page.getByRole("heading", { name: /回答正确/ }).waitFor();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page
    .getByRole("heading", { name: "AI 服务连接", exact: true })
    .waitFor();
  await page.screenshot({
    path: "test-output/settings-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "模拟考试", exact: true }).click();
  await page.getByRole("button", { name: "开始考试", exact: true }).click();
  await page.getByRole("heading", { name: "答题卡", exact: true }).waitFor();
  await page.locator(".option").first().click();
  await page.waitForTimeout(350);
  await page.reload();
  await page.getByRole("heading", { name: "答题卡", exact: true }).waitFor();
  assert.equal(await page.locator(".option.chosen").count(), 1);
  await page.getByRole("button", { name: "交卷", exact: true }).click();
  await page.getByRole("heading", { name: "考试结果", exact: true }).waitFor();
  assert.equal(store.allA().length, 23);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/#home");
  await page.getByRole("heading", { name: "今天，离掌握更近一步。" }).waitFor();
  await page.screenshot({
    path: "test-output/home-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  for (const route of [
    "home",
    "chapters",
    "wrong",
    "training",
    "mastery",
    "settings",
    "exam",
  ]) {
    await page.goto(base + "/#" + route);
    await page.waitForTimeout(150);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      `mobile horizontal overflow: ${route}`,
    );
  }
  await page.goto(base + "/#settings");
  await page
    .getByRole("heading", { name: "AI 服务连接", exact: true })
    .waitFor();
  await page.screenshot({
    path: "test-output/settings-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel("API Base URL").fill("https://fixture.example/v1");
  await page.getByLabel("API Key", { exact: true }).fill("e2e-private-key");
  assert.equal(
    await page.getByLabel("API Key", { exact: true }).getAttribute("type"),
    "password",
  );
  await page.getByRole("button", { name: "显示 API Key", exact: true }).click();
  assert.equal(
    await page.getByLabel("API Key", { exact: true }).getAttribute("type"),
    "text",
  );
  await page.getByLabel("模型名称").fill("fixture-model");
  await page.getByRole("button", { name: "保存配置", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "AI 配置已保存" }).waitFor();
  assert.equal(
    await page.getByLabel("API Key", { exact: true }).inputValue(),
    "",
  );
  await page.getByRole("button", { name: "测试连接", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "AI 服务连接成功" })
    .waitFor();
  await page.getByRole("button", { name: "AI 专项训练", exact: true }).click();
  await page.getByLabel("知识点", { exact: true }).selectOption("OSPF DR/BDR");
  await page.getByRole("button", { name: "3 题", exact: true }).click();
  await page.getByRole("button", { name: "生成训练", exact: true }).click();
  await page.getByText("AI 生成练习题", { exact: true }).waitFor();
  for (let level = 0; level < 3; level++) {
    await page
      .getByRole("button", { name: `给我提示 ${level}/3`, exact: true })
      .click();
    await page
      .getByRole("button", { name: `给我提示 ${level + 1}/3`, exact: true })
      .waitFor();
    assert.equal(await page.locator(".result-block").count(), 0);
  }
  await page.getByRole("button", { name: "查看答案", exact: true }).click();
  await page.getByRole("heading", { name: /答案解析/ }).waitFor();
  await page.getByRole("button", { name: "详细讲解", exact: true }).click();
  await page
    .locator(".teacher-response")
    .filter({ hasText: "选举资格决定设备" })
    .waitFor();
  await page.screenshot({
    path: "test-output/ai-practice-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "下一题", exact: true }).click();
  await page.locator(".option").nth(1).click();
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await page
    .locator(".teacher-response")
    .filter({ hasText: "用户可能将路由交换能力" })
    .waitFor();
  await page.getByRole("button", { name: "学习总览", exact: true }).click();
  await page.getByRole("button", { name: "生成今日计划", exact: true }).click();
  await page
    .getByText("今天重点复习 OSPF 选举、子网广播地址与 ACL 规则顺序。", {
      exact: true,
    })
    .waitFor();
  assert.equal(await page.locator(".plan-list button").count(), 3);
  await page.screenshot({
    path: "test-output/ai-home-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-output/ai-home-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "E2E passed: desktop/mobile layout, assets, answer flow, AI outage, mistakes, settings, exam resume/submission.",
  );
} finally {
  await browser.close();
  app.locals.stop();
  await app.locals.vite?.close();
  await new Promise((r) => server.close(r));
  store.db.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
