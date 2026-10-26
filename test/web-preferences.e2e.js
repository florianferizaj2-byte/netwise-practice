import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createStore } from "../server/store.js";
import { createApp } from "../server/index.js";
import { OpenAICompatibleProvider } from "../server/ai.js";
import { hasCertificateQuestion } from "../server/certificates.js";
Object.assign(process.env, {
  ALLOWED_HOSTS: "127.0.0.1,localhost",
  COOKIE_SECURE: "0",
});
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aceexam-pref-ui-")),
  store = createStore(directory);
await store.registerAsync("pref-admin", "fixture-password-123");
const user = await store.registerAsync("pref-learner", "fixture-password-123"),
  peer = await store.registerAsync("pref-peer", "fixture-password-123");
for (const u of [user, peer]) store.selectCertificate(u.id, "network-engineer");
store.saveAccountEntitlement(user.id, {
  plan: "vip",
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
});
const q = store
  .allQ()
  .find(
    (q) =>
      hasCertificateQuestion(q, "network-engineer") &&
      q.type === "single_choice",
  );
assert(q);
store.setQuestionFavorite(user.id, q.id, true);
const token = store.createAuthSession(user.id),
  otherToken = store.createAuthSession(peer.id),
  app = await createApp({ store, production: true, provider: new OpenAICompatibleProvider(store, { fetch: async () => { throw new Error("External models disabled in preferences test"); } }) }),
  server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;
const version = JSON.parse(
  fs.readFileSync(new URL("../mobile/package.json", import.meta.url)),
).version;
fs.mkdirSync("test-output", { recursive: true });
const checks = [],
  errors = [];
let browser, page;
const api = async (url = "/web-preferences", body, auth = token) => {
  const r = await fetch(base + "/api" + url, {
    method: body ? "PUT" : "GET",
    headers: {
      Authorization: `Bearer ${auth}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal(r.status, 200, await r.clone().text());
  return r.json();
};
const contextFor = async (auth = token) => {
  const c = await browser.newContext({
    viewport: { width: 1672, height: 941 },
  });
  await c.addCookies([
    {
      name: "netwise_session",
      value: auth,
      url: base,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await c.addInitScript((v) => {
    try {
      localStorage.setItem("netwise-announcement-v" + v, "seen");
    } catch {}
  }, version);
  c.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
  return c;
};
const prefs = () =>
  page.getByRole("region", { name: "网页学习设置", exact: true });
const choose = async (name) =>
  prefs().getByRole("button", { name, exact: true }).click();
const save = async () => {
  await choose("保存设置");
  await expect(
    prefs().getByRole("button", { name: "保存设置", exact: true }),
  ).toBeDisabled();
};
const html = () => page.locator("html");
const fit = async (width) => {
  await page.setViewportSize({ width, height: 941 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    )
    .toBeLessThanOrEqual(2);
};
try {
  browser = await chromium.launch({
    headless: true,
    proxy: { server: "http://127.0.0.1:9", bypass: "localhost,127.0.0.1" },
  });
  const context = await contextFor();
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.route("**/api/web-preferences", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "设置服务暂时不可用" }),
    }),
  );
  await page.goto(base + "/#settings", { waitUntil: "networkidle" });
  await expect(prefs().getByRole("alert")).toContainText("设置服务暂时不可用");
  await expect(
    prefs().getByRole("button", { name: "保存设置", exact: true }),
  ).toBeDisabled();
  await page.unroute("**/api/web-preferences");
  const readContrast = () =>
    page.evaluate(() => {
      const rgb = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      const luminance = (c) =>
        c
          .map((n) => n / 255)
          .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4))
          .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
      return [
        ...document.querySelectorAll(
          ".certificate-setting strong,.certificate-setting small,.web-preference-settings p,.vip-access-notice p,.community-profile-settings label",
        ),
      ]
        .filter(
          (n) =>
            n.getBoundingClientRect().width &&
            getComputedStyle(n).visibility !== "hidden",
        )
        .flatMap((n) => {
          let parent = n,
            bg;
          while (parent) {
            const v = getComputedStyle(parent).backgroundColor;
            if (v !== "transparent" && !v.endsWith(", 0)")) {
              bg = rgb(v);
              break;
            }
            parent = parent.parentElement;
          }
          if (!bg) return [];
          const fg = luminance(rgb(getComputedStyle(n).color)),
            back = luminance(bg),
            ratio = (Math.max(fg, back) + 0.05) / (Math.min(fg, back) + 0.05);
          return ratio < 4.5
            ? [{ text: n.textContent.slice(0, 50), ratio }]
            : [];
        });
    });
  assert.deepEqual(
    await readContrast(),
    [],
    "settings reading text must remain legible in light mode",
  );
  await choose("重新读取设置");
  await expect(
    prefs().getByRole("button", { name: "浅色", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: "test-output/web-preferences-light.png",
    fullPage: true,
    animations: "disabled",
  });
  await choose("深色");
  await choose("大号");
  await choose("30 题");
  await prefs()
    .getByRole("switch", { name: "减少网页动画", exact: true })
    .check();
  await expect(html()).toHaveAttribute("data-web-theme", "light");
  const bodies = [];
  await page.route("**/api/web-preferences", async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    bodies.push(route.request().postDataJSON());
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    if (bodies.length === 1) await route.abort("failed");
    else await route.fulfill({ response });
  });
  await choose("保存设置");
  await expect(
    prefs().getByRole("button", { name: "重试保存设置", exact: true }),
  ).toBeEnabled();
  await expect(
    prefs().getByRole("button", { name: "浅色", exact: true }),
  ).toBeDisabled();
  await choose("重试保存设置");
  await expect(html()).toHaveAttribute("data-web-theme", "dark");
  assert.deepEqual(bodies[0], bodies[1]);
  assert.equal((await api()).version, 1);
  await expect(html()).toHaveAttribute("data-web-text-size", "largest");
  await expect(html()).toHaveAttribute("data-web-reduced-motion", "true");
  await page.unroute("**/api/web-preferences");
  assert.deepEqual(
    await readContrast(),
    [],
    "settings reading text must remain legible in dark mode",
  );
  await page.screenshot({
    path: "test-output/web-preferences-dark.png",
    fullPage: true,
    animations: "disabled",
  });
  for (const width of [320, 375, 768, 900, 1280, 1672]) await fit(width);
  await page.setViewportSize({ width: 375, height: 941 });
  await page.screenshot({
    path: "test-output/web-preferences-narrow-web.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1672, height: 941 });
  checks.push(
    "read failures cannot overwrite unknown settings; edits apply only after a saved acknowledgement and retries do not duplicate writes",
  );
  await page.goto(base + "/#home", { waitUntil: "networkidle" });
  await expect(page.locator(".blue-home")).toBeVisible();
  await page.screenshot({
    path: "test-output/web-preferences-home-dark.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.goto(base + "/#chapters", { waitUntil: "networkidle" });
  await expect(page.locator(".blue-catalog")).toBeVisible();
  const countGroup = page
    .locator(".blue-practice-settings")
    .getByRole("button", { name: "30 题", exact: true });
  await expect(countGroup).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({
    path: "test-output/web-preferences-chapters-dark.png",
    fullPage: true,
    animations: "disabled",
  });
  const art = page.locator(".blue-chapter-card").first();
  await art.hover();
  assert(
    await art
      .locator("[data-chapter-visual] *")
      .evaluateAll((nodes) =>
        nodes.every((n) => getComputedStyle(n).animationName === "none"),
      ),
  );
  await page.goto(base + "/#favorites", { waitUntil: "networkidle" });
  await expect(
    page
      .locator(".favorites-practice")
      .getByRole("button", { name: "30题", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "开始练习", exact: true }).click();
  await expect(page.locator(".question-text")).toBeVisible();
  const large = await page
    .locator(".question-text")
    .evaluate((n) => parseFloat(getComputedStyle(n).fontSize));
  assert(large >= 27);
  await page.screenshot({
    path: "test-output/web-preferences-practice-dark.png",
    fullPage: true,
    animations: "disabled",
  });
  for (const width of [320, 375, 768, 1280, 1672]) await fit(width);
  for (const k of q.answer)
    await page
      .locator(".option")
      .filter({
        has: page
          .locator(".option-letter")
          .filter({ hasText: new RegExp("^" + k + "$") }),
      })
      .click();
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await expect(page.locator(".result-block")).toContainText("回答正确");
  checks.push(
    "account question counts reach chapter and favorite practice, reading text grows, reduced motion stops art, and trusted grading still works",
  );
  await page.goto(base + "/#study", { waitUntil: "networkidle" });
  await expect(page.locator(".ss-lesson")).toBeVisible();
  assert(
    (await page
      .locator(".ss-lesson p")
      .first()
      .evaluate((n) => parseFloat(getComputedStyle(n).fontSize))) >= 20,
  );
  await page.getByRole("button", { name: "分步互动精讲", exact: true }).click();
  await expect(page.locator(".formal-tutor-workspace")).toBeVisible();
  await page.getByRole("button", { name: "开始互动学习", exact: true }).click();
  await expect(page.locator(".tutor-explanation")).toBeVisible();
  checks.push(
    "reading preferences reach original lessons and the structured interactive tutor",
  );
  const themeAudit = [];
  for (const route of [
    "wrong",
    "exam",
    "vip",
    "community",
    "favorites",
    "plan",
    "plan-active",
  ]) {
    await page.goto(base + "/#" + (route === "plan-active" ? "plan" : route), {
      waitUntil: "networkidle",
    });
    if (route === "plan-active") {
      await page
        .getByRole("button", { name: "建立我的学习计划", exact: true })
        .click();
      await page.getByRole("button", { name: "保存安排", exact: true }).click();
      await expect(page.locator(".lp-banner")).toBeVisible();
    }
    await expect(page.locator("main h1").first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: `test-output/web-preferences-${route}-dark.png`,
      fullPage: true,
      animations: "disabled",
    });
    const low = await page.locator("main").evaluate((main) => {
      const rgb = (v) => (v.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      const lum = (c) =>
        c
          .map((x) => x / 255)
          .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
          .reduce((s, x, i) => s + x * [0.2126, 0.7152, 0.0722][i], 0);
      return [
        ...main.querySelectorAll("h1,h2,h3,p,strong,label,legend,small,span"),
      ]
        .filter(
          (n) =>
            n.getBoundingClientRect().width &&
            getComputedStyle(n).visibility !== "hidden" &&
            !n.closest("button:disabled,[aria-hidden=true],svg"),
        )
        .flatMap((n) => {
          if (!n.textContent.trim()) return [];
          if (
            n.matches("small,span") &&
            ![...n.childNodes].some(
              (c) => c.nodeType === Node.TEXT_NODE && c.textContent.trim(),
            )
          )
            return [];
          let parent = n,
            bg;
          while (parent) {
            const s = getComputedStyle(parent);
            if (s.backgroundImage !== "none") return [];
            if (
              s.backgroundColor !== "transparent" &&
              !s.backgroundColor.endsWith(", 0)")
            ) {
              bg = rgb(s.backgroundColor);
              break;
            }
            parent = parent.parentElement;
          }
          if (!bg) return [];
          const style = getComputedStyle(n),
            a = lum(rgb(style.color)),
            b = lum(bg),
            ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
            limit = parseFloat(style.fontSize) >= 24 ? 3 : 4.5;
          return ratio < limit
            ? [
                {
                  text: n.textContent.trim().slice(0, 65),
                  className: n.className,
                  parent: n.parentElement?.className,
                  color: style.color,
                  bg,
                  ratio,
                },
              ]
            : [];
        })
        .slice(0, 30);
    });
    themeAudit.push({ route, low });
  }
  fs.writeFileSync(
    "test-output/web-preferences-theme-audit.json",
    JSON.stringify(themeAudit, null, 2),
  );
  assert.deepEqual(
    themeAudit.flatMap((item) =>
      item.low.map((low) => ({ route: item.route, ...low })),
    ),
    [],
    "existing main views must remain readable after switching appearance",
  );
  await page.goto(base + "/#settings", { waitUntil: "networkidle" });
  await expect(prefs()).toBeVisible();
  await choose("较大");
  const old = await api();
  await api("/web-preferences", {
    version: old.version,
    requestId: crypto.randomUUID(),
    certificateId: old.certificateId,
    values: {
      theme: "light",
      textSize: "standard",
      reducedMotion: false,
      defaultCount: 20,
    },
  });
  await choose("保存设置");
  await expect(prefs().getByRole("alert")).toContainText(
    "设置已在其他窗口更新",
  );
  await expect(html()).toHaveAttribute("data-web-theme", "light");
  await expect(
    prefs().getByRole("button", { name: "20 题", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await choose("跟随系统");
  await choose("较大");
  await save();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html()).toHaveAttribute("data-web-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html()).toHaveAttribute("data-web-theme", "light");
  await page.reload({ waitUntil: "networkidle" });
  await expect(
    prefs().getByRole("button", { name: "较大", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const c2 = await contextFor(),
    p2 = await c2.newPage();
  await p2.goto(base + "/#settings", { waitUntil: "networkidle" });
  await expect(p2.locator("html")).toHaveAttribute(
    "data-web-text-size",
    "large",
  );
  await c2.close();
  checks.push(
    "concurrent edits recover the current version; system appearance, reload and a new browser restore actual saved preferences",
  );
  await page
    .getByRole("combobox", { name: "切换备考目标", exact: true })
    .selectOption("sichuan-upgrading-computer");
  await expect(page.locator(".blue-home")).toBeVisible();
  await page.goto(base + "/#settings", { waitUntil: "networkidle" });
  await expect(
    prefs().getByRole("button", { name: "10 题", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await choose("30 题");
  await save();
  await expect(html()).toHaveAttribute("data-web-text-size", "large");
  await page
    .getByRole("combobox", { name: "切换备考目标", exact: true })
    .selectOption("network-engineer");
  await expect(page.locator(".blue-home")).toBeVisible();
  await page.goto(base + "/#settings", { waitUntil: "networkidle" });
  await expect(
    prefs().getByRole("button", { name: "20 题", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  checks.push(
    "appearance follows the account while question count defaults remain separate for each certificate",
  );
  for (const manual of [false, true]) {
    const lc = await contextFor(),
      lp = await lc.newPage();
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    await lp.route("**/api/web-preferences", async (route) => {
      await gate;
      await route.continue();
    });
    await lp.goto(base + "/#chapters", { waitUntil: "domcontentloaded" });
    await expect(lp.locator(".blue-catalog")).toBeVisible();
    const group = lp.getByRole("group", { name: "每次题量", exact: true });
    if (manual)
      await group.getByRole("button", { name: "30 题", exact: true }).click();
    release();
    await expect(lp.locator("html")).toHaveAttribute(
      "data-web-text-size",
      "large",
    );
    await expect(
      group.getByRole("button", {
        name: manual ? "30 题" : "20 题",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await lc.close();
  }
  checks.push(
    "late preference responses supply fresh defaults while preserving question counts already chosen by the learner",
  );
  const pc = await contextFor(otherToken),
    pp = await pc.newPage();
  await pp.goto(base + "/#settings", { waitUntil: "networkidle" });
  await expect(pp.locator("html")).toHaveAttribute("data-web-theme", "light");
  await expect(pp.locator("html")).toHaveAttribute(
    "data-web-text-size",
    "standard",
  );
  await pc.close();
  await page.getByRole("button", { name: "pref-learner", exact: true }).click();
  await page.getByRole("menuitem", { name: "退出登录", exact: true }).click();
  await expect(html()).not.toHaveAttribute("data-web-theme", /./);
  await expect(html()).not.toHaveAttribute("data-web-text-size", /./);
  checks.push(
    "another account starts with its own defaults and logout clears the previous account's appearance",
  );
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "test-output/web-preferences-report.json",
    JSON.stringify(
      {
        runAt: new Date().toISOString(),
        passed: true,
        checks,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: true, checks }, null, 2));
} catch (e) {
  if (page)
    await page
      .screenshot({
        path: "test-output/web-preferences-failure.png",
        fullPage: true,
      })
      .catch(() => {});
  fs.writeFileSync(
    "test-output/web-preferences-report.json",
    JSON.stringify(
      {
        runAt: new Date().toISOString(),
        passed: false,
        checks,
        pageErrors: errors,
        error: String(e),
      },
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
  assert(path.basename(directory).startsWith("aceexam-pref-ui-"));
  fs.rmSync(directory, { recursive: true, force: true });
}
