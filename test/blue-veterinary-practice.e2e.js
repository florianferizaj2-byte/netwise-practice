import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "@playwright/test";
import { createApp } from "../server/index.js";
import { createStore } from "../server/store.js";
import { OpenAICompatibleProvider } from "../server/ai.js";
import { hasCertificateQuestion } from "../server/certificates.js";
import {
  buildVeterinaryGroups,
  veterinaryModules,
  questionTextForGroup,
} from "../src/question-utils.js";
import {
  practiceStorageKey,
  savePracticeProgress,
} from "../src/practice-progress.js";
import { launchTestBrowser } from "./helpers/browser.js";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aceexam-blue-vet-")),
  store = createStore(directory);
const user = store.register("vet_browser", "fixture-password-123");
store.selectCertificate(user.id, "veterinary-practitioner");
const token = store.createAuthSession(user.id);
const app = await createApp({
    store,
    production: true,
    provider: new OpenAICompatibleProvider(store, {
      fetch: () => {
        throw new Error("Browser verification must not call external AI");
      },
    }),
  }),
  server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`,
  key = practiceStorageKey(user.id, "veterinary-practitioner");
const report = { passed: false, checks: [], errors: [] };
let browser, page;
fs.mkdirSync("test-output", { recursive: true });
const req = async (url) => {
  const r = await fetch(base + "/api" + url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(r.status, 200);
  return r.json();
};
const all = (await req("/questions")).filter((q) =>
  hasCertificateQuestion(q, "veterinary-practitioner"),
);
const groups = buildVeterinaryGroups(all),
  stem = groups.find(
    (g) => g.shared && g.kind === "stem" && g.stem && g.questions.length >= 2,
  ),
  paired = groups.find(
    (g) => g.shared && g.kind === "options" && g.questions.length >= 2,
  );
assert(stem && paired);
const selected = [...stem.questions, ...paired.questions];
for (const chapter of veterinaryModules) {
  const single = groups.find(
    (g) =>
      !g.shared &&
      g.questions[0].chapter === chapter &&
      !selected.some((q) => q.id === g.questions[0].id),
  );
  if (single) selected.push(single.questions[0]);
}
let serialized;
savePracticeProgress(
  {
    setItem: (_k, value) => {
      serialized = value;
    },
  },
  key,
  {
    title: "执兽病例与配伍练习",
    returnPage: "chapters",
    startedAt: Date.now() - 65000,
    questions: selected,
  },
  0,
  {},
  false,
);
const roundStart = JSON.parse(serialized).startedAt;
async function choose(letter) {
  await page
    .locator(".vet-options .option")
    .filter({
      has: page
        .locator(".option-letter")
        .filter({ hasText: new RegExp(`^${letter}$`) }),
    })
    .click();
}
async function jump(index) {
  await page
    .getByRole("spinbutton", { name: "输入执兽题号", exact: true })
    .fill(String(index + 1));
  await page
    .getByRole("spinbutton", { name: "输入执兽题号", exact: true })
    .press("Enter");
  await expect(page.locator(".question-top")).toContainText(`第 ${index + 1}`);
}
async function fit(width) {
  await page.setViewportSize({ width, height: 1000 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    )
    .toBeLessThanOrEqual(2);
}
try {
  browser = await launchTestBrowser();
  const context = await browser.newContext({
    viewport: { width: 1672, height: 1000 },
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
  const version = JSON.parse(
    fs.readFileSync("mobile/package.json", "utf8"),
  ).version;
  await context.addInitScript(
    ([k, value, v]) => {
      if (!localStorage.getItem(k)) localStorage.setItem(k, value);
      localStorage.setItem(`netwise-announcement-v${v}`, "seen");
    },
    [key, serialized, version],
  );
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.goto(base + "/#practice");
  await expect(page.locator(".blue-vet-practice")).toBeVisible();
  await expect(page.locator(".ace-chapter-art")).toHaveCount(0);
  await expect(page.locator(".vet-shared-card p")).toHaveText(stem.stem);
  await expect(
    page.getByRole("progressbar", { name: "本轮作答进度" }),
  ).toHaveAttribute("aria-valuenow", "0");
  await expect(page.locator(".result-block")).toHaveCount(0);
  const correct = store.getQ(selected[0].id).answer[0];
  await choose(correct);
  await page.route("**/api/attempts", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "病例作答保存失败测试" }),
    }),
  );
  await page.getByRole("button", { name: "提交本题", exact: true }).click();
  await expect(
    page.locator(".practice-save-status").filter({ hasText: "病例作答保存失败测试" }),
  ).toBeVisible();
  assert.equal(store.allA(user.id).length, 0);
  await expect(page.locator(".option.chosen")).toHaveCount(1);
  await expect(page.locator(".result-block")).toContainText("回答正确");
  await page.unroute("**/api/attempts");
  let attempts = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/attempts") && r.method() === "POST") attempts++;
  });
  await page.locator(".practice-save-status button").first().click();
  await expect(page.locator(".result-block")).toContainText("回答正确");
  await expect.poll(() => store.allA(user.id).length).toBe(1);
  await expect
    .poll(() => page.evaluate(
      ({ storageKey, questionId }) =>
        JSON.parse(localStorage.getItem(storageKey)).responses[questionId]?.submitted,
      { storageKey: key, questionId: selected[0].id },
    ))
    .toBe(true);
  assert.equal(attempts, 1);
  assert.equal(store.allA(user.id).length, 1);
  await page.reload();
  await expect(page.locator(".result-block")).toContainText("回答正确");
  await expect(
    page.getByRole("progressbar", { name: "本轮作答进度" }),
  ).toHaveAttribute("aria-valuenow", "1");
  assert.equal(
    await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)).startedAt,
      key,
    ),
    roundStart,
  );
  await page.locator(".question-text").click();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".vet-shared-card p")).toHaveText(stem.stem);
  const second = store.getQ(selected[1].id),
    wrong = Object.keys(second.options).find((k) => !second.answer.includes(k));
  await choose(wrong);
  await page.getByRole("button", { name: "提交本题", exact: true }).click();
  await expect(page.locator(".result-block")).toContainText("这道题还需要巩固");
  await expect(page.locator(".blue-answer-stats")).toContainText("50%");
  report.checks.push(
    "Real case material persists across subquestions; failed saves preserve the choice; rapid Enter records once; refresh restores graded progress and the round clock",
  );
  const pairIndex = stem.questions.length;
  await jump(pairIndex);
  await expect(page.locator(".vet-shared-card-head")).toContainText(
    "共用备选答案",
  );
  await expect(page.locator(".vet-options .option")).toHaveCount(
    Object.keys(selected[pairIndex].options).length,
  );
  const before = store.allA(user.id).length;
  await page.getByRole("button", { name: "查看答案", exact: true }).click();
  await expect(page.locator(".result-block")).toContainText("答案解析");
  await expect(
    page.locator(".vet-case-steps button[aria-current=step]"),
  ).toContainText("已查看");
  assert.equal(store.allA(user.id).length, before);
  await jump(1);
  for (const width of [320, 375, 768, 900, 1280, 1672]) {
    await fit(width);
    await expect(page.getByRole("button", { name: "结束本轮练习", exact: true })).toBeVisible();
    if (width === 375 || width === 1672)
      await page.screenshot({
        path: `test-output/blue-vet-${width}.png`,
        fullPage: true,
        animations: "disabled",
      });
  }
  await fit(375);
  await page.getByRole("button", { name: "打开题号", exact: true }).click();
  await page.locator(".vet-nav-toolbar select").nth(1).selectOption("wrong");
  await expect(
    page.locator(".vet-question-nav .question-number-grid button"),
  ).toHaveCount(stem.questions.length);
  await page.getByRole("button", { name: "收起题号", exact: true }).click();
  await fit(1672);
  await page.evaluate(() => {
    document.documentElement.dataset.webTheme = "dark";
    document.documentElement.dataset.theme = "dark";
  });
  const contrast = await page.locator(".vet-shared-card").evaluate((el) => {
    const l = (s) => {
      const v = s
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number)
        .map((x) => {
          x /= 255;
          return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        });
      return v[0] * 0.2126 + v[1] * 0.7152 + v[2] * 0.0722;
    };
    const fg = l(getComputedStyle(el.querySelector("p")).color),
      bg = l(getComputedStyle(el).backgroundColor);
    return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
  });
  assert(contrast >= 4.5, `Case text contrast ${contrast}`);
  await page.screenshot({
    path: "test-output/blue-vet-dark.png",
    fullPage: true,
    animations: "disabled",
  });
  report.checks.push(
    "Paired options stay complete; reveal is distinct from grading; six Web widths fit; narrow answer navigation keeps the whole case group; dark case text meets contrast requirements",
  );
  await page.getByRole("button", { name: "结束本轮练习", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "本轮专项练习已结束", exact: true }),
  ).toBeVisible();
  assert.deepEqual(
    await page.locator(".completion-stats strong").allTextContents(),
    ["1答对", "1答错", "1查看答案", `${selected.length - 3}未作答`],
  );
  await page.screenshot({
    path: "test-output/blue-vet-summary.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "返回章节练习", exact: true }).click();
  await expect(page.locator(".blue-catalog")).toBeVisible();
  report.checks.push(
    "Ending a partial round reports correct, wrong, revealed and unanswered totals separately and returns to the original chapter entry",
  );
  await context.close();
  for (const question of stem.questions) store.setQuestionFavorite(user.id, question.id, true);
  const legacy = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, reducedMotion: "reduce", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1" });
  await legacy.addCookies([{ name:"netwise_session",value:token,url:base,httpOnly:true }]);
  await legacy.addInitScript(([k,value,v])=>{if(!localStorage.getItem(k))localStorage.setItem(k,value);localStorage.setItem(`netwise-announcement-v${v}`,"seen");},[key,serialized,version]);
  page = await legacy.newPage(); page.on("pageerror",(e)=>report.errors.push(e.message));
  await page.goto(base+"/?desktop=1#favorites");
  await page.getByRole("button", { name: "开始练习", exact: true }).click();
  await expect(page.getByRole("heading",{name:"执业兽医专项刷题",exact:true})).toBeVisible();
  await expect(page.locator(".blue-vet-practice")).toHaveCount(0);
  await expect(page.locator(".vet-shared-card p")).toHaveText(stem.stem);
  const legacyText = await page.locator(".question-text").textContent();
  const legacyQuestion = stem.questions.find((q) => (questionTextForGroup(q, stem) || q.question) === legacyText);
  assert(legacyQuestion);
  await choose(store.getQ(legacyQuestion.id).answer[0]);
  await page.getByRole("button",{name:"提交本题",exact:true}).click();
  await expect(page.locator(".result-block")).toContainText("回答正确");
  await page.getByRole("button",{name:"结束练习",exact:true}).click();
  await expect(page.locator(".vet-practice-layout")).toHaveCount(0);
  report.checks.push("The existing Apple desktop escape presentation still displays the same case and grades normally without the blue redesign");
  assert.deepEqual(report.errors, []);
  report.passed = true;
  await legacy.close();
} catch (error) {
  report.failure = error.stack;
  process.exitCode = 1;
  if (page && !page.isClosed())
    await page
      .screenshot({ path: "test-output/blue-vet-failure.png", fullPage: true })
      .catch(() => {});
} finally {
  fs.writeFileSync(
    "test-output/blue-vet-report.json",
    JSON.stringify({ ...report, runAt: new Date().toISOString() }, null, 2),
  );
  await browser?.close();
  await app.locals.stop();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  store.db.close();
  assert.equal(path.dirname(directory), os.tmpdir());
  assert(path.basename(directory).startsWith("aceexam-blue-vet-"));
  fs.rmSync(directory, { recursive: true, force: true });
  console.log(JSON.stringify(report));
}
