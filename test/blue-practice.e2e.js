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
  path.join(os.tmpdir(), "aceexam-blue-practice-ui-"),
);
const store = createStore(directory),
  report = { passed: false, checks: [], errors: [] };
const user = store.register("practice_fixture", "fixture-password-123"),
  other = store.register("other_fixture", "fixture-password-123");
store.selectCertificate(user.id, "sichuan-upgrading-computer");
store.selectCertificate(other.id, "sichuan-upgrading-computer");
const unique = new Map(
  store
    .allQ()
    .filter(
      (q) =>
        q.type === "single_choice" &&
        hasCertificateQuestion(q, "sichuan-upgrading-computer"),
    )
    .map((q) => {
      const item = questionForCertificate(q, "sichuan-upgrading-computer");
      return [item.question, item];
    }),
);
const questions = [...unique.values()],
  office = questions.filter((q) => q.chapter === "办公自动化");
const seeded = [
  ...office.slice(0, 3),
  ...questions.filter((q) => q.chapter !== "办公自动化").slice(0, 4),
];
assert.equal(seeded.length, 7);
const bad = (q) => [Object.keys(q.options).find((k) => !q.answer.includes(k))];
for (const [i, q] of seeded.entries()) {
  store.recordAttempt(q.id, bad(q), 1000, "practice", user.id);
  if (i === 0) store.recordAttempt(q.id, bad(q), 1000, "practice", user.id);
  const row = store.db
    .prepare("SELECT data FROM user_reviews WHERE user_id=? AND question_id=?")
    .get(user.id, q.id);
  const review = {
    ...JSON.parse(row.data),
    dueAt: new Date(Date.now() + (i < 3 ? -86400000 : 86400000)).toISOString(),
  };
  store.db
    .prepare("UPDATE user_reviews SET data=? WHERE user_id=? AND question_id=?")
    .run(JSON.stringify(review), user.id, q.id);
}
const network = store
  .allQ()
  .find(
    (q) =>
      q.type === "single_choice" &&
      hasCertificateQuestion(q, "network-engineer") &&
      !hasCertificateQuestion(q, "sichuan-upgrading-computer"),
  );
store.recordAttempt(network.id, bad(network), 1000, "practice", user.id);
const token = store.createAuthSession(user.id),
  app = await createApp({
    store,
    production: true,
    accountSecurity: { enabled: false },
  }),
  server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`,
  key = practiceStorageKey(user.id, "sichuan-upgrading-computer");
const version = JSON.parse(
  fs.readFileSync("mobile/package.json", "utf8"),
).version;
let browser, page;
fs.mkdirSync("test-output", { recursive: true });
async function contextFor(
  sessionToken = token,
  viewport = { width: 1672, height: 1000 },
) {
  const context = await browser.newContext({ viewport });
  await context.addCookies([
    {
      name: "netwise_session",
      value: sessionToken,
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
  return context;
}
const cards = () => page.locator(".blue-wrong-overview .wrong-item");
const saved = () =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
async function answer(choices) {
  for (const choice of choices)
    await page
      .locator(".option")
      .filter({
        has: page
          .locator(".option-letter")
          .filter({ hasText: new RegExp(`^${choice}$`) }),
      })
      .click();
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await expect(page.locator(".result-block")).toBeVisible();
  await expect(page.locator(".practice-save-status")).toContainText("作答已保存");
}
async function fit(width) {
  await page.setViewportSize({ width, height: 941 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    )
    .toBeLessThanOrEqual(2);
}
try {
  browser = await launchTestBrowser();
  const context = await contextFor();
  await page.goto(base + "/#wrong");
  await expect(page.locator(".blue-wrong-overview")).toBeVisible();
  await expect(page.locator(".question-text")).toHaveCount(0);
  await expect(cards()).toHaveCount(5);
  await expect(page.getByRole("region", { name: "错题概览" })).toContainText(
    "7",
  );
  await page.getByRole("button", { name: "下一页错题", exact: true }).click();
  await expect(cards()).toHaveCount(2);
  await page.getByRole("button", { name: "上一页错题", exact: true }).click();
  await page.getByRole("button", { name: "今日到期 3", exact: true }).click();
  await expect(cards()).toHaveCount(3);
  await page.getByRole("button", { name: "全部错题 7", exact: true }).click();
  await page
    .getByRole("combobox", { name: "筛选章节", exact: true })
    .selectOption("办公自动化");
  await expect(cards()).toHaveCount(3);
  await page
    .getByRole("combobox", { name: "筛选章节", exact: true })
    .selectOption("");
  await page
    .getByRole("textbox", { name: "搜索错题", exact: true })
    .fill("此关键词无匹配-测试");
  await expect(
    page.getByText("没有符合条件的错题", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "查看全部错题", exact: true }).click();
  await expect(cards()).toHaveCount(5);
  await cards().first().locator("summary").click();
  await expect(
    cards()
      .first()
      .getByText(/上次错选/),
  ).toBeVisible();
  await cards().first().locator("summary").click();
  for (const width of [320, 375, 768, 900, 1280, 1672]) {
    await fit(width);
    if (width === 375 || width === 1672)
      await page.screenshot({
        path: `test-output/blue-wrong-${width}.png`,
        fullPage: true,
      });
  }
  report.checks.push(
    "Wrong navigation opens the overview without starting practice; due/chapter/search filters, review details and pagination use real account data and fit 320–1672px",
  );
  await page.route("**/api/wrong", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "错题服务暂时不可用" }),
    }),
  );
  await page.getByRole("button", { name: "刷新错题", exact: true }).click();
  await expect(
    page.getByText("错题服务暂时不可用", { exact: true }),
  ).toBeVisible();
  await expect(cards()).toHaveCount(5);
  await page.unroute("**/api/wrong");
  await page.getByRole("button", { name: "刷新错题", exact: true }).click();
  await expect(
    page.getByText("错题服务暂时不可用", { exact: true }),
  ).toHaveCount(0);
  report.checks.push(
    "A simulated wrong-list API failure keeps the existing list, shows the real error and can be retried",
  );
  for (let i = 0; i < 4; i++)
    await cards().nth(i).locator('input[type="checkbox"]').check();
  await page
    .getByRole("complementary", { name: "错题复习设置" })
    .getByRole("button", { name: "开始复习（4 题）", exact: true })
    .click();
  await expect(page.locator(".blue-practice")).toBeVisible();
  await expect(page.locator(".result-block")).toHaveCount(0);
  let progress = await saved();
  assert.equal(progress.questionIds.length, 4);
  assert.equal(progress.returnPage, "wrong");
  const roundStart = progress.startedAt;
  await expect
    .poll(() => page.locator(".blue-round-clock time").innerText())
    .not.toBe("00:00");
  const current = store.getQ(progress.questionIds[0]),
    attemptCount = store.allA(user.id).length;
  for (const choice of current.answer)
    await page
      .locator(".option")
      .filter({
        has: page
          .locator(".option-letter")
          .filter({ hasText: new RegExp(`^${choice}$`) }),
      })
      .click();
  await page.route("**/api/attempts", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "作答暂时无法保存" }),
    }),
  );
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await expect(
    page.locator(".practice-save-status"),
  ).toContainText("作答暂时无法保存");
  assert.equal(store.allA(user.id).length, attemptCount);
  assert.equal((await saved()).responses[current.id].submitted, false);
  await page.unroute("**/api/attempts");
  await page.getByRole("button", { name: "重试保存", exact: true }).click();
  await expect(page.locator(".practice-save-status")).toContainText("作答已保存");
  await expect(page.locator(".result-block")).toContainText("回答正确");
  assert.equal(store.allA(user.id).length, attemptCount + 1);
  await expect(
    page.getByRole("progressbar", { name: "本轮作答进度" }),
  ).toHaveAttribute("aria-valuenow", "1");
  await page.getByRole("button", { name: "移除错题", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "已移除错题", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(page.locator(".result-block")).toContainText("回答正确");
  assert.equal((await saved()).startedAt, roundStart);
  await page.getByRole("button", { name: "下一题", exact: true }).click();
  progress = await saved();
  const second = store.getQ(progress.questionIds[1]);
  await answer(bad(second));
  await expect(page.locator(".result-block")).toContainText("这道题还需要巩固");
  await expect(page.locator(".blue-answer-stats")).toContainText("50%");
  await page.getByRole("button", { name: "下一题", exact: true }).click();
  await page.getByRole("button", { name: "查看答案", exact: true }).click();
  await expect(page.locator(".result-block")).toContainText("答案解析");
  assert.equal(store.allA(user.id).length, attemptCount + 2);
  await page.getByRole("button", { name: "下一题", exact: true }).click();
  await page.locator(".question-text").click();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".result-block")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".result-block")).toHaveCount(0);
  for (const width of [320, 375, 768, 900, 1280, 1672]) {
    await fit(width);
    if (width === 375 || width === 1672)
      await page.screenshot({
        path: `test-output/blue-practice-${width}.png`,
        fullPage: true,
      });
  }
  await page.getByRole("button", { name: "结束本轮练习", exact: true }).click();
  await expect(page.locator(".blue-practice-summary")).toBeVisible();
  const stats = page.locator(".completion-stats strong");
  await expect(stats).toHaveCount(4);
  assert.deepEqual(await stats.allTextContents(), [
    "1答对",
    "1答错",
    "1查看答案",
    "1未作答",
  ]);
  await page.screenshot({ path: "test-output/blue-practice-summary.png", fullPage: true });
  await page.getByRole("button", { name: "返回错题本", exact: true }).click();
  await expect(page.locator(".blue-wrong-overview")).toBeVisible();
  await expect(
    page.locator(`[data-wrong-question="${current.id}"]`),
  ).toHaveCount(0);
  assert.equal(await saved(), null);
  report.checks.push(
    "Selected review uses trusted grading; failed saves are not counted as submitted and can retry; Enter/arrows work; refresh restores progress and round start; correct removal persists; summary separates graded, revealed and unanswered questions and returns to wrong overview",
  );
  await page
    .getByRole("button", { name: "再做一次", exact: true })
    .first()
    .click();
  await expect(page.locator(".question-text")).toBeVisible();
  await page.getByRole("button", { name: "返回错题本", exact: true }).click();
  await page.goto(base + "/#practice");
  await expect(page.locator(".question-text")).toBeVisible();
  await page.getByRole("button", { name: "返回错题本", exact: true }).click();
  await page.request.put(base + "/api/auth/certificate", {
    data: { certificateId: "network-engineer" },
  });
  await page.reload();
  const networkWrong = store
    .wrongQuestions(user.id)
    .filter((q) => hasCertificateQuestion(q, "network-engineer"));
  await expect(cards()).toHaveCount(Math.min(5, networkWrong.length));
  const visibleNetworkIds = await cards().evaluateAll((nodes) =>
    nodes.map((node) => node.dataset.wrongQuestion),
  );
  assert.ok(visibleNetworkIds.includes(network.id));
  assert.ok(
    visibleNetworkIds.every((id) => networkWrong.some((q) => q.id === id)),
  );
  await context.close();
  const otherContext = await contextFor(store.createAuthSession(other.id));
  await page.goto(base + "/#wrong");
  await expect(page.getByText("还没有错题记录", { exact: true })).toBeVisible();
  await expect(page.locator(".question-text")).toHaveCount(0);
  await otherContext.close();
  report.checks.push(
    "Return origin survives leaving and restoring a round; wrong lists stay isolated by certificate and account, including the empty state",
  );
  const typesContext = await contextFor();
  for (const [certificateId, type] of [
    ["sichuan-upgrading-computer", "multiple_choice"],
    ["network-engineer", "short_answer"],
    ["hcia-datacom", "single_choice"],
    ["ncre-ms-office", "single_choice"],
    ["ncre-l2-c-programming", "single_choice"],
    ["hcip-datacom-core", "single_choice"],
    ["hcip-datacom-advanced", "single_choice"],
  ]) {
    const original = store
      .allQ()
      .find((q) => q.type === type && hasCertificateQuestion(q, certificateId));
    assert.ok(original, `${certificateId} ${type} fixture`);
    const question = questionForCertificate(original, certificateId);
    assert.equal(
      (
        await page.request.put(base + "/api/auth/certificate", {
          data: { certificateId },
        })
      ).status(),
      200,
    );
    const storageKey = practiceStorageKey(user.id, certificateId);
    let serialized;
    savePracticeProgress(
      { setItem: (_key, value) => (serialized = value) },
      storageKey,
      {
        title: "题型回归",
        returnPage: "chapters",
        startedAt: Date.now(),
        questions: [question],
      },
      0,
      {},
      false,
    );
    await page.goto(base + "/#home");
    await page.reload();
    await expect(page.locator(".blue-home")).toBeVisible();
    await page.evaluate(
      ([k, value]) => localStorage.setItem(k, value),
      [storageKey, serialized],
    );
    await page.goto(base + "/#practice");
    await expect(page.locator(".question-text")).toHaveText(question.question);
    if (type === "short_answer") {
      await page
        .locator(".short-answer-editor textarea")
        .fill("这是隔离测试中的主观题自评作答。");
      await page.getByRole("button", { name: "我答对了", exact: true }).click();
      await page.getByRole("button", { name: "提交自评", exact: true }).click();
      await expect(page.locator(".result-block")).toContainText("参考答案");
    } else {
      await answer(question.answer);
      await expect(page.locator(".result-block")).toContainText("回答正确");
    }
    if (certificateId === "network-engineer") {
      await page.evaluate(() => {
        document.documentElement.dataset.webTheme = "dark";
        document.documentElement.dataset.theme = "dark";
      });
      await page.screenshot({
        path: "test-output/blue-practice-dark.png",
        fullPage: true,
      });
      assert.notEqual(
        await page
          .locator(".question-panel")
          .evaluate((node) => getComputedStyle(node).backgroundColor),
        "rgb(255, 255, 255)",
      );
      const labelContrast = await page
        .locator(".short-answer-editor > label")
        .evaluate((node) => {
          const luminance = (color) => {
            const channels = color
              .match(/[\d.]+/g)
              .slice(0, 3)
              .map(Number)
              .map((value) => {
                const s = value / 255;
                return s <= 0.04045
                  ? s / 12.92
                  : Math.pow((s + 0.055) / 1.055, 2.4);
              });
            return (
              0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
            );
          };
          const text = luminance(getComputedStyle(node).color),
            background = luminance(
              getComputedStyle(node.closest(".question-panel")).backgroundColor,
            );
          return (
            (Math.max(text, background) + 0.05) /
            (Math.min(text, background) + 0.05)
          );
        });
      assert.ok(
        labelContrast >= 4.5,
        `dark subjective label contrast ${labelContrast}`,
      );
    }
  }
  await typesContext.close();
  report.checks.push(
    "All seven non-veterinary certificates, including C and both HCIP banks, render their real practice; multiple-choice grading and subjective self-assessment retain their existing semantics, including a dark-theme rendering check",
  );
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) {
  report.failure = error.stack;
  process.exitCode = 1;
  if (page && !page.isClosed())
    await page
      .screenshot({
        path: "test-output/blue-practice-failure.png",
        fullPage: true,
      })
      .catch(() => {});
} finally {
  fs.writeFileSync(
    "test-output/blue-practice-report.json",
    JSON.stringify({ ...report, runAt: new Date().toISOString() }, null, 2),
  );
  await browser?.close();
  await app.locals.stop();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  store.db.close();
  assert.equal(path.dirname(directory), os.tmpdir());
  assert.ok(path.basename(directory).startsWith("aceexam-blue-practice-ui-"));
  fs.rmSync(directory, { recursive: true, force: true });
  console.log(JSON.stringify(report));
}
