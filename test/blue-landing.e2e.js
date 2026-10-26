import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "@playwright/test";
import { createApp } from "../server/index.js";
import { certificates } from "../server/certificates.js";
import { createStore } from "../server/store.js";
import { launchTestBrowser } from "./helpers/browser.js";
import { accountTestMailbox } from "./helpers/account-mail.js";

const report = {
  passed: false,
  checks: [],
  errors: [],
  emailRequestsWhileOff: 0,
};
const resources = [];
let browser, page;
fs.mkdirSync("test-output", { recursive: true });
async function fixture(enabled) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aceexam-landing-ui-"));
  const store = createStore(dir),
    mailbox = accountTestMailbox();
  store.register("fixture_owner", "owner-password-123");
  const learner = store.register("returning_learner", "learner-password-123");
  store.selectCertificate(learner.id, "network-engineer");
  const legacy = store.register("历史学习者", "legacy-password-123");
  store.selectCertificate(legacy.id, "network-engineer");
  const app = await createApp({
    store,
    production: true,
    accountSecurity: { enabled, mailer: mailbox },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const result = {
    dir,
    store,
    mailbox,
    app,
    server,
    base: `http://127.0.0.1:${server.address().port}`,
  };
  resources.push(result);
  return result;
}
async function open(base, options = {}) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    ...options,
  });
  await context.addInitScript(
    (version) =>
      localStorage.setItem(`netwise-announcement-v${version}`, "seen"),
    JSON.parse(fs.readFileSync("mobile/package.json", "utf8")).version,
  );
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto(base);
  await expect(page.locator(".blue-landing")).toBeVisible();
  return context;
}
const auth = () =>
  page.getByRole("region", { name: "登录与注册", exact: true });
async function credentials(form, username, password, confirm = false) {
  await form.getByLabel("账号", { exact: true }).fill(username);
  await form.getByLabel("密码", { exact: true }).fill(password);
  if (confirm)
    await form.getByLabel("确认密码", { exact: true }).fill(password);
}
try {
  const off = await fixture(false);
  browser = await launchTestBrowser();
  let context = await open(off.base);
  page.on("request", (request) => {
    if (request.url().includes("/api/auth/email-code"))
      report.emailRequestsWhileOff++;
  });
  await expect(auth().getByRole("button", { name: "忘记密码？" })).toHaveCount(
    0,
  );
  await expect(page.locator(".desk-certificate-list > button")).toHaveCount(certificates.length);
  await expect(page.locator(".desk-feature")).toHaveCount(6);
  await expect(page.locator(".desk-feature-extras button")).toHaveCount(5);
  const catalogue = (
    await (await page.request.get(off.base + "/api/auth/me")).json()
  ).certificates;
  for (const certificate of catalogue) {
    await page
      .locator(".desk-certificate-list > button")
      .filter({ hasText: certificate.shortName || certificate.name })
      .click();
    await expect(
      page.getByRole("dialog", { name: certificate.name, exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  const featureButtons = page.locator(
    ".desk-feature, .desk-feature-extras button",
  );
  for (let i = 0; i < (await featureButtons.count()); i++) {
    await featureButtons.nth(i).click();
    await expect(
      page.getByRole("dialog", { name: "登录考匠", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  report.checks.push(
    "Only the six real catalogue certificates appear; all previews open and close; eleven existing learning tools remain reachable",
  );
  for (const width of [900, 1024, 1280, 1440, 1672]) {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(() => scrollTo(0, 0));
    await expect(
      auth().getByRole("button", { name: "登录，开始学习", exact: true }),
    ).toBeInViewport();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      `overflow at ${width}`,
    );
    const overlapping = await page.evaluate(() => {
      const a = document
          .querySelector(".desk-hero-copy")
          .getBoundingClientRect(),
        b = document.querySelector(".desk-auth-card").getBoundingClientRect();
      return a.right > b.left;
    });
    assert.equal(overlapping, false, `auth overlaps hero text at ${width}`);
    if ([900, 1440].includes(width))
      await page.screenshot({
        path: `test-output/blue-landing-${width}.png`,
        fullPage: true,
      });
  }
  const svgIds = await page
    .locator(".blue-landing svg [id]")
    .evaluateAll((nodes) => nodes.map((n) => n.id));
  assert.equal(new Set(svgIds).size, svgIds.length);
  await page.locator(".desk-hero-art").hover();
  assert.notEqual(
    await page
      .locator(".desk-hero-art .badge-ai")
      .evaluate((n) => getComputedStyle(n).animationName),
    "none",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator(".desk-hero-art .badge-ai")
      .evaluate((n) => getComputedStyle(n).animationName),
    "none",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(
    () => (document.documentElement.dataset.webReducedMotion = "true"),
  );
  await page
    .locator(".desk-certificate-list > button")
    .filter({ hasText: "NCRE 二级 MS Office" })
    .hover();
  assert.equal(
    await page
      .locator(".desk-certificate-list .office-w")
      .evaluate((n) => getComputedStyle(n).animationName),
    "none",
  );
  await page.evaluate(
    () => delete document.documentElement.dataset.webReducedMotion,
  );
  report.checks.push(
    "900/1024/1280/1440/1672px layouts fit, login remains visible, SVG IDs are unique and reduced motion stops the finite hover animation",
  );
  await page
    .getByRole("button", { name: "免费试做 5 道题", exact: true })
    .click();
  const trial = page.getByRole("region", {
    name: "免登录免费体验五道题",
    exact: true,
  });
  await trial.getByRole("radio").first().check();
  await trial.getByRole("button", { name: "确认答案", exact: true }).click();
  await expect(trial.locator(".desk-trial-feedback")).toBeVisible();
  await page.reload();
  await expect(trial).toContainText("已完成 1 / 5");
  await trial.getByRole("button", { name: /第 1 题/ }).click();
  await expect(trial.locator(".desk-trial-feedback")).toBeVisible();
  report.checks.push(
    "The relocated five-question trial uses server grading and restores the answer after reload",
  );
  let aiFailures = 0;
  await page.route("**/api/guest-trial/questions/*/ai", (route) => {
    aiFailures++;
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "AI 服务暂时不可用，请稍后重试" }),
    });
  });
  await trial.getByRole("button", { name: "AI 详细解析", exact: true }).click();
  const reader = page.getByRole("dialog", { name: "AI 详细解析", exact: true });
  await expect(reader.getByRole("alert")).toContainText("AI 服务暂时不可用");
  await reader.getByRole("button", { name: "重新读取", exact: true }).click();
  await expect(
    reader.getByRole("button", { name: "重新读取", exact: true }),
  ).toBeVisible();
  assert.equal(aiFailures, 2);
  await page.keyboard.press("Escape");
  await page.unroute("**/api/guest-trial/questions/*/ai");
  for (let i = 1; i < 5; i++) {
    await trial
      .getByRole("button", { name: "继续下一题", exact: true })
      .click();
    await trial.getByRole("radio").first().check();
    await trial.getByRole("button", { name: "确认答案", exact: true }).click();
    await expect(trial.locator(".desk-trial-feedback")).toBeVisible();
  }
  await trial
    .getByRole("button", { name: "查看体验结果", exact: true })
    .click();
  await expect(trial.locator(".desk-trial-summary")).toBeVisible();
  await expect(trial).toContainText("已完成 5 / 5");
  await page.screenshot({
    path: "test-output/blue-landing-trial-summary.png",
    fullPage: true,
  });
  await page.route("**/api/guest-trial", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "体验题暂时不可用" }),
    }),
  );
  await page.reload();
  await expect(trial).toContainText("体验题暂时不可用");
  await page.unroute("**/api/guest-trial");
  await trial
    .getByRole("button", { name: "重新加载体验题", exact: true })
    .click();
  await expect(trial).toContainText("已完成 5 / 5");
  report.checks.push(
    "All five answers produce a real result; simulated AI and trial-load outages show retry controls without losing graded progress or calling a paid model",
  );
  await credentials(auth(), "returning_learner", "incorrect-password");
  await auth()
    .getByRole("button", { name: "登录，开始学习", exact: true })
    .click();
  await expect(auth().getByRole("alert")).toBeVisible();
  await credentials(auth(), "returning_learner", "learner-password-123");
  await auth()
    .getByRole("button", { name: "登录，开始学习", exact: true })
    .click();
  await expect(page.locator(".blue-home")).toBeVisible();
  await page.goto(off.base + "/#welcome");
  await expect(
    page.getByRole("region", { name: "继续学习", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "登录与注册", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("region", { name: "继续学习", exact: true })
    .getByRole("button", { name: "继续学习", exact: true })
    .click();
  await expect(page.locator(".blue-home")).toBeVisible();
  await context.close();
  report.checks.push(
    "Inline login rejects an incorrect password, enters the actual workspace and an authenticated welcome page returns to study",
  );
  context = await open(off.base);
  await credentials(auth(), "历史学习者", "legacy-password-123");
  await auth()
    .getByRole("button", { name: "登录，开始学习", exact: true })
    .click();
  await expect(page.locator(".blue-home")).toBeVisible();
  await context.close();
  report.checks.push(
    "Existing non-ASCII usernames can still log in; the stricter naming rule applies to new registration",
  );
  context = await open(off.base);
  await auth().getByRole("button", { name: "选择注册", exact: true }).click();
  await credentials(auth(), "inline_signup", "fixture-password-123", true);
  await auth()
    .getByLabel("确认密码", { exact: true })
    .fill("mismatch-password");
  await auth().getByRole("button", { name: "创建账号", exact: true }).click();
  await expect(auth().getByRole("alert")).toContainText("两次输入的密码不一致");
  assert.equal(
    off.store.allUsers().some((u) => u.username === "inline_signup"),
    false,
  );
  await auth()
    .getByLabel("确认密码", { exact: true })
    .fill("fixture-password-123");
  await auth().getByRole("button", { name: "创建账号", exact: true }).click();
  await expect(page.locator(".blue-cert-card")).toHaveCount(certificates.length);
  assert.equal(
    off.store.allUsers().find((u) => u.username === "inline_signup").isAdmin,
    0,
  );
  await context.close();
  context = await open(off.base);
  await page.route("**/api/auth/security-config", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "注册设置暂时不可用" }),
    }),
  );
  await page.reload();
  await auth().getByRole("button", { name: "选择注册", exact: true }).click();
  await expect(
    auth().getByRole("button", { name: "创建账号", exact: true }),
  ).toBeDisabled();
  await expect(auth().getByRole("alert")).toContainText("注册设置暂时不可用");
  await page.unroute("**/api/auth/security-config");
  await auth().getByRole("button", { name: "重新读取", exact: true }).click();
  await expect(
    auth().getByRole("button", { name: "创建账号", exact: true }),
  ).toBeEnabled();
  await credentials(auth(), "INLINE_SIGNUP", "fixture-password-123", true);
  await auth().getByRole("button", { name: "创建账号", exact: true }).click();
  await expect(auth().getByRole("alert")).toContainText("已存在");
  assert.equal(off.store.allUsers().length, 4);
  assert.equal(off.mailbox.messages.length, 0);
  assert.equal(report.emailRequestsWhileOff, 0);
  await context.close();
  report.checks.push(
    "Inline registration validates password confirmation, rejects duplicate accounts, grants no admin role, retries policy failures and sends no mail while disabled",
  );
  const on = await fixture(true);
  context = await open(on.base);
  await auth().getByRole("button", { name: "忘记密码？", exact: true }).click();
  await expect(
    auth().getByRole("heading", { name: "找回密码", exact: true }),
  ).toBeVisible();
  await auth().getByRole("button", { name: "返回登录", exact: true }).click();
  await auth().getByRole("button", { name: "选择注册", exact: true }).click();
  await credentials(auth(), "verified_inline", "fixture-password-123", true);
  await auth().getByLabel("邮箱", { exact: true }).fill("inline@example.test");
  await auth().getByRole("button", { name: "获取验证码", exact: true }).click();
  await expect(auth().getByRole("status")).toContainText("验证码已发送");
  await auth()
    .getByLabel("邮箱验证码", { exact: true })
    .fill(on.mailbox.latest("inline@example.test", "register").code);
  await auth().getByRole("button", { name: "创建账号", exact: true }).click();
  await expect(page.locator(".blue-cert-card")).toHaveCount(certificates.length);
  await context.close();
  report.checks.push(
    "Retained opt-in email verification also works in the inline form; recovery navigation is available only when enabled",
  );
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) {
  report.failure = error.stack;
  process.exitCode = 1;
  if (page && !page.isClosed())
    await page
      .screenshot({
        path: "test-output/blue-landing-failure.png",
        fullPage: true,
      })
      .catch(() => {});
} finally {
  fs.writeFileSync(
    "test-output/blue-landing-report.json",
    JSON.stringify({ ...report, runAt: new Date().toISOString() }, null, 2),
  );
  await browser?.close();
  for (const { app, server, store, dir } of resources.reverse()) {
    await app.locals.stop();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    store.db.close();
    assert.equal(path.dirname(dir), os.tmpdir());
    assert.ok(path.basename(dir).startsWith("aceexam-landing-ui-"));
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(JSON.stringify(report));
}
