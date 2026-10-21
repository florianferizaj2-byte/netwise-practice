import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { expect } from "@playwright/test";
import { createStore } from "../server/store.js";
import { createApp } from "../server/index.js";
import { OpenAICompatibleProvider } from "../server/ai.js";
import {
  hasCertificateQuestion,
  questionForCertificate,
} from "../server/certificates.js";
import { buildVeterinaryGroups } from "../src/question-utils.js";
import {
  practiceStorageKey,
  savePracticeProgress,
} from "../src/practice-progress.js";
import { launchTestBrowser } from "./helpers/browser.js";

for (const key of Object.keys(process.env))
  if (/^(AI_SERVICE_|AUTHOR_|AI_USAGE_)/.test(key)) delete process.env[key];
Object.assign(process.env, {
  AI_MASTER_KEY: crypto.randomBytes(32).toString("base64"),
  ALLOWED_HOSTS: "127.0.0.1,localhost",
  COOKIE_SECURE: "0",
  AUTH_EMAIL_VERIFICATION_ENABLED: "0",
});
const parent = fs.realpathSync(os.tmpdir());
const directory = fs.mkdtempSync(path.join(parent, "ace-review-flow-")),
  store = createStore(directory);
const user = await store.registerAsync(
  "review-fixture",
  "fixture-password-123",
);
store.db.prepare("UPDATE users SET is_admin=0 WHERE id=?").run(user.id);
store.selectCertificate(user.id, "sichuan-upgrading-computer");
const token = store.createAuthSession(user.id);
let modelCalls = 0;
const app = await createApp({
  store,
  production: true,
  accountSecurity: { enabled: false },
  provider: new OpenAICompatibleProvider(store, {
    fetch: async () => {
      modelCalls++;
      throw new Error("External models disabled in review test");
    },
  }),
});
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const version = JSON.parse(
  fs.readFileSync(new URL("../mobile/package.json", import.meta.url)),
).version;
const questions = store
  .allQ()
  .filter(
    (q) =>
      hasCertificateQuestion(q, "sichuan-upgrading-computer") &&
      q.type === "single_choice",
  )
  .slice(0, 7)
  .map((q) => questionForCertificate(q, "sichuan-upgrading-computer"));
assert.equal(questions.length, 7);
const checks = [],
  errors = [];
let browser,
  page,
  clockInstalled = false;
fs.mkdirSync("test-output", { recursive: true });
async function api(url, body, method) {
  const r = await fetch(base + "/api" + url, {
    method: method || (body ? "PUT" : "GET"),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal(r.status, 200, await r.clone().text());
  return r.json();
}
async function seedRound(certificateId, items) {
  if (clockInstalled) await page.clock.resume();
  const key = practiceStorageKey(user.id, certificateId);
  let serialized;
  savePracticeProgress(
    { setItem: (_, value) => (serialized = value) },
    key,
    {
      questions: items,
      title: "解析与切题验证",
      returnPage: "chapters",
      startedAt: Date.now(),
    },
    0,
    {},
    false,
  );
  await page.evaluate(
    ({ key, serialized }) => localStorage.setItem(key, serialized),
    { key, serialized },
  );
  await page.goto(base + "/#practice");
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(".question-top")).toContainText("第 1");
  await freeze();
}
const preferences = () =>
  page.getByRole("region", { name: "网页学习设置", exact: true });
async function configure(showAnalysis, autoNext) {
  if (clockInstalled) await page.clock.resume();
  await page.goto(base + "/#settings");
  await expect(page.locator("main")).toHaveAttribute("data-page", "settings");
  await expect(
    preferences().getByRole("switch", { name: "作答后展开解析", exact: true }),
  ).toBeEnabled();
  await preferences()
    .getByRole("switch", { name: "作答后展开解析", exact: true })
    .setChecked(showAnalysis);
  await preferences()
    .getByRole("switch", { name: "自动切换下一题", exact: true })
    .setChecked(autoNext);
  const save = preferences().getByRole("button", {
    name: "保存设置",
    exact: true,
  });
  if (await save.isEnabled()) {
    await save.click();
    await expect(save).toBeDisabled();
  }
  const actual = await api("/web-preferences");
  assert.equal(actual.values.showAnalysis, showAnalysis);
  assert.equal(actual.values.autoNext, autoNext);
  if (clockInstalled) await freeze();
}
async function answer(q, veterinary = false) {
  for (const letter of q.answer)
    await page
      .locator(".option")
      .filter({
        has: page
          .locator(".option-letter")
          .filter({ hasText: new RegExp(`^${letter}$`) }),
      })
      .click();
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/attempts") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", {
      name: veterinary ? "提交本题" : "提交答案",
      exact: true,
    })
    .click();
  assert.equal((await response).status(), 200);
  await expect(page.locator(".result-block")).toBeVisible();
}
async function tick(ms) {
  await page.clock.runFor(ms);
}
async function freeze() {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(new Date(now + 100));
}
async function indexIs(n) {
  await expect(page.locator(".question-top")).toContainText(`第 ${n}`);
}
const shot = (name) =>
  page.screenshot({
    path: `test-output/practice-review-${name}.png`,
    animations: "disabled",
  });
try {
  browser = await launchTestBrowser();
  const context = await browser.newContext({
    viewport: { width: 1672, height: 1000 },
    reducedMotion: "reduce",
  });
  await context.route("**/*", (route) =>
    route
      .request()
      .url()
      .startsWith(base + "/")
      ? route.continue()
      : route.abort(),
  );
  await context.addCookies([
    {
      name: "netwise_session",
      value: token,
      url: base,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await context.addInitScript((v) => {
    try {
      localStorage.setItem("netwise-announcement-v" + v, "seen");
    } catch {}
  }, version);
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/#settings", { waitUntil: "networkidle" });
  await expect(
    preferences().getByRole("switch", { name: "作答后展开解析", exact: true }),
  ).toBeChecked();
  await expect(
    preferences().getByRole("switch", { name: "自动切换下一题", exact: true }),
  ).not.toBeChecked();
  await page.clock.install();
  clockInstalled = true;
  await configure(false, true);
  await seedRound("sichuan-upgrading-computer", questions);
  await answer(questions[0]);
  await expect(page.locator(".practice-auto-next")).toContainText("3 秒后");
  await expect(page.locator(".practice-auto-next")).toBeInViewport();
  await expect(page.locator(".result-block p")).toHaveCount(0);
  await shot("countdown");
  await tick(2100);
  await indexIs(1);
  await tick(1200);
  await indexIs(2);
  await expect(page.locator(".result-block")).toHaveCount(0);
  checks.push(
    "Default preferences preserve prior behavior; saved choices collapse explanations and advance after three seconds only after trusted grading",
  );

  await answer(questions[1]);
  await expect(page.locator(".practice-auto-next")).toBeVisible();
  await page.getByRole("button", { name: "留在本题", exact: true }).click();
  await tick(4000);
  await indexIs(2);
  await expect(page.locator(".practice-auto-next")).toHaveCount(0);
  await page.getByRole("button", { name: "展开答案解析", exact: true }).click();
  await expect(page.locator(".result-block p")).toHaveText(
    questions[1].analysis,
  );
  await page.clock.resume();
  await page.reload({ waitUntil: "networkidle" });
  await indexIs(2);
  await freeze();
  await indexIs(2);
  await tick(4000);
  await indexIs(2);
  await expect(page.locator(".practice-auto-next")).toHaveCount(0);
  checks.push(
    "Stay and manual explanation work; refresh restores answer without restarting countdown",
  );

  await page.getByRole("button", { name: "下一题", exact: true }).click();
  await indexIs(3);
  // Failed writes retain provisional feedback without starting the countdown.
  await page.route("**/api/attempts", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "作答保存失败" }),
    }),
  );
  for (const letter of questions[2].answer)
    await page
      .locator(".option")
      .filter({
        has: page
          .locator(".option-letter")
          .filter({ hasText: new RegExp(`^${letter}$`) }),
      })
      .click();
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await expect(page.locator(".practice-save-status")).toContainText("作答保存失败");
  await tick(4000);
  await indexIs(3);
  await expect(page.locator(".practice-auto-next")).toHaveCount(0);
  await expect(page.locator(".result-block")).toContainText("回答正确");
  await page.unroute("**/api/attempts");
  await page.getByRole("button", { name: "重试保存", exact: true }).click();
  await expect(page.locator(".practice-auto-next")).toBeVisible();
  await page.getByRole("button", { name: "展开答案解析", exact: true }).click();
  await tick(4000);
  await indexIs(3);
  checks.push(
    "Failed save stays on current question; retry can arm countdown; interaction cancels it",
  );

  await page.getByRole("button", { name: "下一题", exact: true }).click();
  await indexIs(4);
  await answer(questions[3]);
  await expect(page.locator(".practice-auto-next")).toBeVisible();
  await page.keyboard.press("Tab");
  await tick(4000);
  await indexIs(4);
  await page.getByRole("button", { name: "下一题", exact: true }).click();
  await answer(questions[4]);
  await expect(page.locator(".practice-auto-next")).toBeVisible();
  // Exercise the real visibility condition rather than merely firing an event.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await tick(4000);
  await indexIs(5);
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await tick(4000);
  await indexIs(5);
  checks.push(
    "Keyboard interaction and hidden page cancel countdown permanently for this answer",
  );

  await page.getByRole("button", { name: "下一题", exact: true }).click();
  await indexIs(6);
  await page.getByRole("button", { name: "查看答案", exact: true }).click();
  await expect(page.locator(".result-block p")).toHaveText(
    questions[5].analysis,
  );
  await tick(4000);
  await indexIs(6);
  await expect(page.locator(".practice-auto-next")).toHaveCount(0);
  await page.getByRole("button", { name: "下一题", exact: true }).click();
  await answer(questions[6]);
  await tick(4000);
  await indexIs(7);
  await expect(
    page.getByRole("button", { name: "完成练习", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".practice-auto-next")).toHaveCount(0);
  checks.push(
    "Explicit answer reveal always expands analysis; last question never auto-finishes",
  );

  await configure(true, false);
  await seedRound("sichuan-upgrading-computer", questions.slice(0, 2));
  await answer(questions[0]);
  await expect(page.locator(".result-block p")).toHaveText(
    questions[0].analysis,
  );
  await tick(4000);
  await indexIs(1);
  await expect(page.locator(".practice-auto-next")).toHaveCount(0);
  checks.push(
    "Switching preferences back restores expanded analysis and manual navigation",
  );

  await configure(false, true);
  await api("/auth/certificate", { certificateId: "veterinary-practitioner" });
  const veterinary = store
    .allQ()
    .filter((q) => hasCertificateQuestion(q, "veterinary-practitioner"));
  const group = buildVeterinaryGroups(veterinary).find(
    (g) => g.shared && g.kind === "stem" && g.questions.length >= 2,
  );
  assert(group);
  await seedRound("veterinary-practitioner", group.questions);
  await expect(page.locator(".blue-vet-practice")).toBeVisible();
  const sharedBefore = await page
    .locator(".vet-shared-card.stem > p")
    .textContent();
  await answer(group.questions[0], true);
  await expect(page.locator(".result-block p")).toHaveCount(0);
  await expect(page.locator(".practice-auto-next")).toBeVisible();
  for (const width of [320, 375, 768, 900, 1280, 1672]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      )
      .toBeLessThanOrEqual(1);
    await expect(page.locator(".practice-auto-next")).toBeInViewport();
  }
  await shot("veterinary");
  await tick(3300);
  await indexIs(2);
  await expect(page.locator(".vet-shared-card.stem > p")).toHaveText(
    sharedBefore,
  );
  await expect(page.locator(".result-block")).toHaveCount(0);
  await page.clock.resume();
  await page.reload({ waitUntil: "networkidle" });
  await indexIs(2);
  await freeze();
  await indexIs(2);
  checks.push(
    "Veterinary case questions use same preferences, preserve shared stem, fit six widths and restore next subquestion",
  );
  assert.equal(modelCalls, 0);
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "test-output/practice-review-report.json",
    JSON.stringify({ passed: true, checks, errors, modelCalls }, null, 2) +
      "\n",
  );
  console.log(
    JSON.stringify({ passed: true, checks: checks.length, errors, modelCalls }),
  );
} catch (cause) {
  await shot("failure").catch(() => {});
  if (page)
    fs.writeFileSync(
      "test-output/practice-review-failure.txt",
      await page
        .locator("body")
        .innerText()
        .catch(() => ""),
    );
  throw cause;
} finally {
  await browser?.close();
  await app.locals.stop();
  await new Promise((resolve) => server.close(resolve));
  store.db.close();
  assert.equal(path.dirname(directory), parent);
  assert(path.basename(directory).startsWith("ace-review-flow-"));
  fs.rmSync(directory, { recursive: true, force: true });
}
