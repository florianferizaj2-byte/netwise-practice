import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { chromium, expect } from "@playwright/test";
import { createStore } from "../server/store.js";
import { createApp } from "../server/index.js";
import { OpenAICompatibleProvider } from "../server/ai.js";
import { webPreferenceDefaults } from "../server/web-preference-values.js";

Object.assign(process.env, {
  ALLOWED_HOSTS: "127.0.0.1,localhost",
  COOKIE_SECURE: "0",
  AUTH_EMAIL_VERIFICATION_ENABLED: "0",
});
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ace-reminder-ui-")),
  store = createStore(directory);
await store.registerAsync("reminder-admin", "fixture-password-123");
const users = [];
for (let i = 0; i < 5; i++) {
  const user = await store.registerAsync(
    `reminder-${i}`,
    "fixture-password-123",
  );
  store.selectCertificate(user.id, "network-engineer");
  users.push({ ...user, token: store.createAuthSession(user.id) });
}
let externalCalls = 0;
const app = await createApp({
  store,
  production: true,
  provider: new OpenAICompatibleProvider(store, {
    fetch: async () => {
      externalCalls++;
      throw new Error("External models disabled");
    },
  }),
});
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;
const version = JSON.parse(fs.readFileSync("mobile/package.json")).version;
fs.mkdirSync("test-output", { recursive: true });
const checks = [],
  errors = [];
let browser, page;
async function api(user, url, body, method = body ? "PUT" : "GET") {
  const response = await fetch(base + "/api" + url, {
    method,
    headers: {
      Authorization: `Bearer ${user.token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}
async function configure(
  user,
  updates = {
    reminderEnabled: true,
    reminderTime: "00:00",
    reminderTimeZone: "UTC",
  },
) {
  const current = await api(user, "/web-preferences");
  return api(user, "/web-preferences", {
    requestId: crypto.randomUUID(),
    version: current.version,
    certificateId: current.certificateId,
    values: { ...current.values, ...updates },
  });
}
async function contextFor(user, hidden = false) {
  const context = await browser.newContext({
    viewport: { width: 1672, height: 941 },
    timezoneId: "UTC",
  });
  await context.addCookies([
    {
      name: "netwise_session",
      value: user.token,
      url: base,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await context.addInitScript(
    ({ version, hidden }) => {
      try {
        localStorage.setItem("netwise-announcement-v" + version, "seen");
      } catch {}
      if (hidden) {
        window.reminderHidden = true;
        Object.defineProperty(document, "visibilityState", {
          get: () => (window.reminderHidden ? "hidden" : "visible"),
        });
      }
    },
    { version, hidden },
  );
  context.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
  return context;
}
const banner = (p) =>
  p.getByRole("region", { name: "每日学习提醒", exact: true });
const settings = (p) =>
  p.getByRole("region", { name: "网页学习设置", exact: true });
const focus = (p) => p.evaluate(() => window.dispatchEvent(new Event("focus")));
const noClaim = (user) =>
  assert.equal(
    store.db
      .prepare("SELECT COUNT(*) n FROM user_study_reminders WHERE user_id=?")
      .get(user.id).n,
    0,
  );
try {
  const privateCheck = await fetch(base + "/api/study-reminders/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: crypto.randomUUID(), version: 0 }),
  });
  assert.equal(privateCheck.status, 401);
  const invalidCheck = await fetch(base + "/api/study-reminders/check", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${users[0].token}`,
    },
    body: JSON.stringify({
      requestId: crypto.randomUUID(),
      version: 0,
      userId: users[1].id,
    }),
  });
  assert.equal(invalidCheck.status, 400);
  browser = await chromium.launch({
    headless: true,
    proxy: { server: "http://127.0.0.1:9", bypass: "localhost,127.0.0.1" },
  });
  const context = await contextFor(users[0]);
  page = await context.newPage();
  await page.goto(base + "/#settings", { waitUntil: "networkidle" });
  await expect(
    settings(page).getByRole("switch", { name: "每日学习提醒", exact: true }),
  ).not.toBeChecked();
  await expect(
    settings(page).getByLabel("提醒时间", { exact: true }),
  ).toBeDisabled();
  noClaim(users[0]);
  let committed,
    lostId,
    unavailable = true;
  await page.route("**/api/study-reminders/check", async (route) => {
    const body = route.request().postDataJSON();
    if (body.version === 0) return route.continue();
    if (unavailable)
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "提醒服务暂时不可用" }),
      });
    const response = await route.fetch();
    committed = await response.json();
    lostId = body.requestId;
    await route.abort();
  });
  await settings(page)
    .getByRole("switch", { name: "每日学习提醒", exact: true })
    .check();
  await settings(page).getByLabel("提醒时间", { exact: true }).fill("00:00");
  await settings(page)
    .getByRole("button", { name: "使用当前设备时区", exact: true })
    .click();
  await settings(page)
    .getByRole("button", { name: "保存设置", exact: true })
    .click();
  await expect(banner(page)).toContainText("学习提醒连接中断");
  noClaim(users[0]);
  unavailable = false;
  await banner(page).getByRole("button", { name: "重试学习提醒" }).click();
  await expect.poll(() => !!committed?.notice).toBe(true);
  await expect(banner(page)).toContainText("学习提醒连接中断");
  assert(committed.notice);
  assert.equal(committed.notice.id, lostId);
  const saved = await api(users[0], "/web-preferences");
  assert.equal(saved.values.reminderTimeZone, "UTC");
  await page.unroute("**/api/study-reminders/check");
  let retried;
  await page.route("**/api/study-reminders/check", async (route) => {
    retried = route.request().postDataJSON().requestId;
    await route.continue();
  });
  await banner(page).getByRole("button", { name: "重试学习提醒" }).click();
  await expect(banner(page)).toContainText("给今天的学习留一点时间");
  assert.equal(retried, lostId);
  checks.push(
    "real settings save enabled/time/zone; lost server acknowledgement retries the same daily operation without a duplicate row",
  );

  for (const width of [320, 375, 768, 900, 1280, 1672]) {
    await page.setViewportSize({ width, height: 941 });
    await expect(banner(page)).toBeInViewport();
    assert(
      (await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      )) <= 2,
    );
  }
  await page.screenshot({ path: "test-output/study-reminder-desktop.png" });
  await page.setViewportSize({ width: 375, height: 941 });
  await expect(page.locator(".app-shell")).not.toHaveClass(/desk-workspace/);
  await expect
    .poll(() =>
      page
        .locator(".sidebar")
        .evaluate((node) => node.getBoundingClientRect().right),
    )
    .toBeLessThanOrEqual(2);
  await page.screenshot({ path: "test-output/study-reminder-375.png" });
  await page.getByRole("button", { name: "编辑资料", exact: true }).click();
  await expect(page.locator("dialog[open]")).toBeVisible();
  await expect(banner(page)).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(banner(page)).toBeVisible();
  await banner(page)
    .getByRole("button", { name: "查看学习计划", exact: true })
    .click();
  await expect(page.locator(".learning-plan-view")).toBeVisible();
  await expect(banner(page)).toBeHidden();
  await page.reload({ waitUntil: "networkidle" });
  await expect(banner(page)).toBeHidden();
  const restore = await contextFor(users[0]),
    rp = await restore.newPage();
  await rp.goto(base + "/#settings", { waitUntil: "networkidle" });
  await expect(
    settings(rp).getByRole("switch", { name: "每日学习提醒", exact: true }),
  ).toBeChecked();
  await expect(
    settings(rp).getByLabel("提醒时间", { exact: true }),
  ).toHaveValue("00:00");
  await expect(banner(rp)).toBeHidden();
  await restore.close();
  checks.push(
    "six Web widths, modal avoidance, plan action, refresh and a new browser restore account preferences without repeating today's reminder",
  );

  await configure(users[1]);
  const multi = await contextFor(users[1]),
    a = await multi.newPage(),
    b = await multi.newPage();
  await Promise.all([
    a.goto(base + "/#home", { waitUntil: "networkidle" }),
    b.goto(base + "/#home", { waitUntil: "networkidle" }),
  ]);
  await expect
    .poll(async () => (await banner(a).count()) + (await banner(b).count()))
    .toBe(1);
  const winner = (await banner(a).count()) ? a : b;
  await configure(users[1], { reminderEnabled: false });
  await focus(winner);
  await expect(banner(winner)).toBeHidden();
  await multi.close();
  checks.push(
    "simultaneous tabs elect one winner; disabling on another client dismisses the active reminder after synchronization",
  );

  await configure(users[2]);
  const learning = await contextFor(users[2]),
    lp = await learning.newPage();
  await lp.goto(base + "/#exam", { waitUntil: "networkidle" });
  await expect(lp.locator(".blue-exam")).toBeVisible();
  noClaim(users[2]);
  await expect(banner(lp)).toBeHidden();
  await lp.evaluate(() => {
    location.hash = "chapters";
  });
  await expect(banner(lp)).toBeVisible();
  await banner(lp).getByRole("button", { name: "关闭本次学习提醒" }).click();
  await focus(lp);
  await expect(banner(lp)).toBeHidden();
  await learning.close();
  checks.push(
    "exam pages defer reminders without consuming the daily opportunity; closing a reminder suppresses it for the day",
  );

  await configure(users[3]);
  const hidden = await contextFor(users[3], true),
    hp = await hidden.newPage();
  await hp.goto(base + "/#home", { waitUntil: "networkidle" });
  noClaim(users[3]);
  await expect(banner(hp)).toBeHidden();
  await hp.evaluate(() => {
    window.reminderHidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(banner(hp)).toBeVisible();
  await configure(users[3], { theme: "dark" });
  await focus(hp);
  await expect(hp.locator("html")).toHaveAttribute("data-web-theme", "dark");
  await hp.setViewportSize({ width: 375, height: 941 });
  await expect(hp.locator(".app-shell")).not.toHaveClass(/desk-workspace/);
  await expect
    .poll(() =>
      hp
        .locator(".sidebar")
        .evaluate((node) => node.getBoundingClientRect().right),
    )
    .toBeLessThanOrEqual(2);
  await hp.screenshot({ path: "test-output/study-reminder-dark.png" });
  await hidden.close();
  checks.push(
    "hidden documents defer daily claims until visible; synchronized dark theme retains a readable narrow reminder",
  );

  await configure(users[4]);
  const stale = await contextFor(users[4]),
    sp = await stale.newPage();
  let release, captured, fulfilled;
  const delivered = new Promise((resolve) => {
    fulfilled = resolve;
  });
  const held = new Promise((resolve) => {
    release = resolve;
  });
  await sp.route("**/api/study-reminders/check", async (route) => {
    const response = await route.fetch();
    captured = await response.json();
    await held;
    await route.fulfill({ response });
    fulfilled();
  });
  await sp.goto(base + "/#settings", { waitUntil: "domcontentloaded" });
  await expect(
    settings(sp).getByRole("switch", { name: "每日学习提醒", exact: true }),
  ).toBeChecked();
  await expect.poll(() => !!captured?.notice).toBe(true);
  await settings(sp)
    .getByRole("switch", { name: "每日学习提醒", exact: true })
    .uncheck();
  await settings(sp)
    .getByRole("button", { name: "保存设置", exact: true })
    .click();
  await expect(
    settings(sp).getByRole("button", { name: "保存设置", exact: true }),
  ).toBeDisabled();
  release();
  await delivered;
  await sp.unroute("**/api/study-reminders/check");
  await focus(sp);
  await expect(banner(sp)).toBeHidden();
  await expect(
    settings(sp).getByRole("switch", { name: "每日学习提醒", exact: true }),
  ).not.toBeChecked();
  await stale.close();
  checks.push(
    "a response delayed past a local disable cannot resurrect the reminder or overwrite newer preferences",
  );
  assert.deepEqual(errors, []);
  assert.equal(externalCalls, 0);
  assert.equal(
    store.db.prepare("SELECT COUNT(*) n FROM user_study_reminders").get().n,
    5,
  );
  assert.deepEqual((await api(users[0], "/web-preferences")).values, {
    ...webPreferenceDefaults,
    reminderEnabled: true,
    reminderTime: "00:00",
    reminderTimeZone: "UTC",
  });
  fs.writeFileSync(
    "test-output/study-reminders-report.json",
    JSON.stringify(
      { passed: true, checks, pageErrors: errors, externalCalls },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: true, checks }, null, 2));
} catch (e) {
  await page
    ?.screenshot({
      path: "test-output/study-reminders-failure.png",
      fullPage: true,
    })
    .catch(() => {});
  fs.writeFileSync(
    "test-output/study-reminders-report.json",
    JSON.stringify(
      { passed: false, checks, error: String(e), pageErrors: errors },
      null,
      2,
    ),
  );
  throw e;
} finally {
  await browser?.close();
  await app.locals.stop();
  await new Promise((r) => server.close(r));
  store.db.close();
  assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
  assert(path.basename(directory).startsWith("ace-reminder-ui-"));
  fs.rmSync(directory, { recursive: true, force: true });
}
