import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/index.js";
import { createStore } from "../server/store.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aceexam-modes-"));
const store = createStore(dir);
const app = await createApp({ store, production: true });
const server = app.listen(0, "127.0.0.1");
await new Promise(resolve => server.once("listening", resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: "chromium" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    window.audioContexts = [];
    window.audioTones = 0;
    window.AudioContext = class extends Native {
      constructor(...args) { super(...args); window.audioContexts.push(this); }
      createOscillator() { window.audioTones++; return super.createOscillator(); }
    };
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await page.request.post(base + "/api/auth/register", { data: { username: "mode_tester", password: "test-mode-password" } })).status(), 200);
  assert.equal((await page.request.put(base + "/api/auth/certificate", { data: { certificateId: "network-engineer" } })).status(), 200);
  await page.goto(base);
  await page.getByRole("button", { name: "知道了，开始学习" }).click();
  await page.getByRole("button", { name: "章节练习", exact: true }).click();
  await page.getByRole("button", { name: /网络体系结构.*题/ }).click();
  assert.equal(await page.locator('.practice-modes input[type="checkbox"]').count(), 0);
  assert.equal(await page.getByText("内卷模式").count(), 0);
  async function answer(correct) {
    const question = (await page.locator(".question-text").innerText()).trim();
    const q = store.allQ().find(q => q.question.trim() === question);
    assert.ok(q, question);
    const choices = correct ? q.answer : [Object.keys(q.options).find(key => !q.answer.includes(key))];
    for (const key of choices) await page.locator(".option").filter({ has: page.locator(".option-letter", { hasText: new RegExp(`^${key}$`) }) }).click();
    await page.getByRole("button", { name: "提交答案", exact: true }).click();
    await page.locator(".result-block").waitFor();
  }
  for (let count = 1; count <= 3; count++) {
    await answer(true);
    await page.getByText(`连续答对 ${count} 题`, { exact: true }).waitFor();
    await page.locator(".celebration-message").waitFor();
    if (count < 3) await page.getByRole("button", { name: /下一题/ }).click();
  }
  assert.equal(await page.locator(".confetti-field i").count(), 28);
  assert.ok(await page.evaluate(() => window.audioTones >= 10));
  fs.mkdirSync("test-output", { recursive: true });
  await page.screenshot({ path: "test-output/practice-modes-desktop.png", fullPage: true });
  await page.locator(".practice-celebration").waitFor({ state: "detached" });
  assert.equal(await page.locator(".practice-celebration").count(), 0);
  await page.getByRole("combobox", { name: "选择题号" }).selectOption("0");
  await page.getByText("连续答对 3 题", { exact: true }).waitFor();
  assert.equal(await page.locator(".practice-celebration").count(), 0);
  await page.getByRole("combobox", { name: "选择题号" }).selectOption("3");
  await answer(false);
  await page.getByText("连续答对 0 题", { exact: true }).waitFor();
  const wrongNumber = page.locator(".question-number-grid button").nth(3);
  assert.match(await wrongNumber.getAttribute("class"), /wrong/);
  await expect(wrongNumber).toHaveCSS("background-color", "rgb(181, 57, 57)");
  await page.getByRole("button", { name: /下一题/ }).click();
  await expect(wrongNumber).toHaveCSS("color", "rgb(181, 57, 57)");
  await answer(true);
  await page.getByRole("button", { name: /下一题/ }).click();
  await page.getByRole("button", { name: "查看答案", exact: true }).click();
  await page.getByText("连续答对 0 题", { exact: true }).waitFor();
  assert.equal(await page.getByRole("slider", { name: "庆祝音量" }).count(), 0);
  const beforeFixedVolumeReward = await page.evaluate(() => window.audioTones);
  await page.getByRole("button", { name: /下一题/ }).click();
  await answer(true);
  await page.locator(".celebration-message").waitFor();
  assert.ok(await page.evaluate((before) => window.audioTones > before, beforeFixedVolumeReward));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: "test-output/practice-modes-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "结束练习" }).click();
  await page.waitForFunction(() => window.audioContexts.every(ctx => ctx.state === "closed"));
  assert.deepEqual(errors, []);
  console.log("Practice rewards passed: automatic celebration, streak/reset, red wrong answers, revisit, audio cleanup, fixed 50% volume, mobile layout.");
} finally {
  await browser?.close();
  app.locals.stop();
  await new Promise(resolve => server.close(resolve));
  store.db.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
