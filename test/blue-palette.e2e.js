import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { expect } from "@playwright/test";
import { createStore } from "../server/store.js";
import { createApp } from "../server/index.js";
import { OpenAICompatibleProvider } from "../server/ai.js";
import { launchTestBrowser } from "./helpers/browser.js";

// Exercise real pages and API responses in a temporary account. Never use the
// developer's model service, even when the checkout has a configured .env file.
for (const name of Object.keys(process.env))
  if (/^(AI_SERVICE_|AUTHOR_|AI_USAGE_)/.test(name)) delete process.env[name];
Object.assign(process.env, {
  AI_MASTER_KEY: crypto.randomBytes(32).toString("base64"),
  ALLOWED_HOSTS: "127.0.0.1,localhost",
  COOKIE_SECURE: "0",
  AUTH_EMAIL_VERIFICATION_ENABLED: "0",
});
const parent = fs.realpathSync(os.tmpdir());
const directory = fs.mkdtempSync(path.join(parent, "ace-palette-ui-"));
const store = createStore(directory);
const admin = await store.registerAsync(
  "palette-admin",
  "fixture-password-123",
);
const learner = await store.registerAsync(
  "palette-learner",
  "fixture-password-123",
);
store.db.prepare("UPDATE users SET is_admin=? WHERE id=?").run(1, admin.id);
store.db.prepare("UPDATE users SET is_admin=? WHERE id=?").run(0, learner.id);
for (const u of [admin, learner])
  store.selectCertificate(u.id, "network-engineer");
store.saveAccountEntitlement(learner.id, {
  plan: "svip",
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
});
const q = store
  .allQ()
  .find(
    (q) =>
      q.certificates?.includes("network-engineer") &&
      q.type === "single_choice",
  );
store.setQuestionFavorite(learner.id, q.id, true);
store.recordAttempt(
  q.id,
  [Object.keys(q.options).find((key) => !q.answer.includes(key))],
  1000,
  "practice",
  learner.id,
);
const tokens = [learner, admin].map((u) => store.createAuthSession(u.id));
let modelCalls = 0;
const app = await createApp({
  store,
  production: true,
  accountSecurity: { enabled: false },
  provider: new OpenAICompatibleProvider(store, {
    fetch: async () => {
      modelCalls++;
      throw new Error("External models disabled in palette test");
    },
  }),
});
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;
const version = JSON.parse(
  fs.readFileSync(new URL("../mobile/package.json", import.meta.url)),
).version;
const legacyColors = [
  "899e86",
  "16251e",
  "10251a",
  "32610f",
  "67ac33",
  "123921",
  "3a7350",
  "254f3c",
  "254632",
  "0e2a23",
  "153e35",
  "1f6650",
  "2f7d65",
  "12352c",
  "e8f1ec",
  "cfe2d9",
  "f3f8f5",
  "1d2723",
  "4b5852",
  "6b7872",
  "dce2df",
  "edf0ee",
  "f6f8f7",
];
const checks = [],
  errors = [];
let browser, page;
fs.mkdirSync("test-output", { recursive: true });
const scan = async (page, name) => {
  const result = await page.evaluate((colors) => {
    const needles = colors.map((hex) => {
      const n = parseInt(hex, 16);
      return [n >> 16, (n >> 8) & 255, n & 255].join(", ");
    });
    const scope = document.querySelector(
      ".blue-workspace, .blue-landing, .download-page",
    );
    if (!scope) throw new Error("Blue surface missing");
    let inspected = 0;
    const violations = [];
    for (const el of [
      scope,
      ...scope.querySelectorAll(
        "button,a,input,select,textarea,h1,h2,h3,p,label,small,strong,.badge,dialog",
      ),
    ]) {
      if (
        !el.getClientRects().length ||
        getComputedStyle(el).visibility === "hidden"
      )
        continue;
      inspected++;
      for (const pseudo of [
        null,
        "::before",
        "::after",
        ...(el.tagName === "DIALOG" && el.open ? ["::backdrop"] : []),
      ]) {
        const css = getComputedStyle(el, pseudo);
        if (
          pseudo &&
          pseudo !== "::backdrop" &&
          (!css.content || ["none", "normal"].includes(css.content))
        )
          continue;
        for (const prop of [
          "color",
          "backgroundColor",
          "borderTopColor",
          "outlineColor",
          "accentColor",
          "backgroundImage",
          "boxShadow",
        ]) {
          const value = css[prop];
          if (
            needles.some(
              (rgb) =>
                value?.includes("rgb(" + rgb + ")") ||
                value?.includes("rgba(" + rgb + ","),
            )
          )
            violations.push({
              tag: el.tagName,
              className:
                typeof el.className === "string" ? el.className : "svg",
              text: el.textContent?.trim().slice(0, 45),
              pseudo,
              prop,
              value,
            });
        }
      }
    }
    return { inspected, violations };
  }, legacyColors);
  checks.push({ name, ...result });
  fs.writeFileSync(
    "test-output/blue-palette-report.json",
    JSON.stringify({ complete: false, checks, errors, modelCalls }, null, 2) +
      "\n",
  );
};
const navigate = async (page, route, heading) => {
  await page.goto(base + "/#" + route);
  await expect(page.locator("main")).toHaveAttribute("data-page", route);
  const roots = {
    home: ".blue-home",
    study: ".subjective-study",
    tutor: ".formal-tutor",
    vip: ".vip-page",
  };
  if (roots[route])
    await expect(page.locator("main " + roots[route])).toBeVisible();
  await expect(page.locator("main h1").first()).toBeVisible();
  const titles = {
    tutor: "AI 互动精讲",
    training: "AI 专项训练",
    mastery: "知识掌握度",
    community: "共享 AI 题库",
    chat: "考匠社区",
    guide: "考试与证书指南",
    about: "关于考匠",
  };
  if (heading || titles[route])
    await expect(page.locator("main h1").first()).toContainText(
      heading || titles[route],
    );
  await page.waitForFunction(
    () => !document.querySelector("main .content-placeholder"),
  );
  await page.evaluate(() => new Promise(requestAnimationFrame));
};
try {
  browser = await launchTestBrowser();
  const context = await browser.newContext({
    viewport: { width: 1672, height: 1000 },
  });
  await context.route("**/*", (route) =>
    route.request().url().startsWith(base) ? route.continue() : route.abort(),
  );
  await context.addCookies([
    {
      name: "netwise_session",
      value: tokens[0],
      url: base,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await context.addInitScript(
    (version) =>
      localStorage.setItem("netwise-announcement-v" + version, "seen"),
    version,
  );
  page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [route, heading] of [
    ["settings", "设置"],
    ["home"],
    ["chapters", "章节练习"],
    ["study"],
    ["tutor"],
    ["wrong", "错题"],
    ["favorites", "我的收藏"],
    ["plan", "学习计划"],
    ["exam", "模拟考试"],
    ["vip"],
    ["training", "AI 专项训练"],
    ["mastery"],
    ["community"],
    ["chat"],
    ["guide"],
    ["about"],
  ]) {
    await navigate(page, route, heading);
    if (route === "settings")
      await expect(page.locator(".certificate-setting.selected")).toBeVisible();
    if (route === "study")
      await expect(
        page.locator(".ss-directory button.active").first(),
      ).toBeVisible();
    await scan(page, route + "-light");
    const button = page
      .locator("main button.primary:visible, main .text-button:visible")
      .first();
    if (await button.count()) {
      await button.hover();
      await scan(page, route + "-hover");
    }
    if (["settings", "study", "community"].includes(route)) {
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({
        path: `test-output/blue-palette-${route}.png`,
        fullPage: true,
      });
    }
  }
  await navigate(page, "settings");
  await page.keyboard.press("Control+k");
  await expect(
    page.getByRole("dialog", { name: "搜索功能与章节" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "搜索功能或章节" }).fill("章节");
  await scan(page, "search-dialog-focus");
  await page.screenshot({ path: "test-output/blue-palette-search.png" });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "修改密码", exact: true }).click();
  await page.getByLabel("当前密码", { exact: true }).focus();
  await scan(page, "password-form-focus");
  for (const width of [320, 375, 768, 900, 1280, 1672]) {
    await page.setViewportSize({ width, height: 1000 });
    await scan(page, "settings-width-" + width);
    try {
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth), {
          timeout: 3000,
        })
        .toBeLessThanOrEqual(width + 1);
    } catch (cause) {
      await page.screenshot({
        path: "test-output/blue-palette-overflow.png",
        fullPage: true,
      });
      fs.writeFileSync(
        "test-output/blue-palette-overflow.json",
        JSON.stringify(
          await page.evaluate(() =>
            [...document.querySelectorAll("main *")]
              .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
              .map((el) => ({
                tag: el.tagName,
                className: el.className,
                width: el.getBoundingClientRect().width,
                text: el.textContent.slice(0, 80),
              })),
          ),
          null,
          2,
        ),
      );
      throw cause;
    }
  }
  await page.setViewportSize({ width: 1672, height: 1000 });
  await page.goto(base + "/#downloads");
  await expect(page.locator(".download-page")).toBeVisible();
  await expect(page.locator(".download-code-area").first()).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await scan(page, "downloads");
  await page.screenshot({
    path: "test-output/blue-palette-downloads.png",
    fullPage: true,
  });
  // Open every management tab with an actual owner account; no data mutation.
  await context.addCookies([
    {
      name: "netwise_session",
      value: tokens[1],
      url: base,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.reload();
  await navigate(page, "admin", "总览工作台");
  for (const section of ["overview","questions","catalog","documents","quality","teaching","users","memberships","announcement","feedback","jobs","config","usage","audit","system"]) {
    await page.goto(base + "/#admin/" + section);
    await expect(page.locator(".ac-main h1")).toBeVisible();
    await expect(page.locator('.ac-state[role="status"]')).toHaveCount(0);
    await scan(page, "admin-" + section);
  }
  await page.screenshot({
    path: "test-output/blue-palette-admin.png",
    fullPage: true,
  });
  await context.addCookies([
    {
      name: "netwise_session",
      value: tokens[0],
      url: base,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.reload();
  await navigate(page, "favorites", "我的收藏");
  await page
    .locator(".favorites-practice")
    .getByRole("button", { name: /开始练习/ })
    .click();
  await expect(page.locator(".options .option").first()).toBeVisible();
  await page
    .locator(".option")
    .filter({
      has: page.locator(".option-letter", {
        hasText: new RegExp("^" + q.answer[0] + "$"),
      }),
    })
    .click();
  await page.getByRole("button", { name: /^(确认答案|提交答案)$/ }).click();
  await expect(page.locator(".option.correct").first()).toBeVisible();
  await scan(page, "practice-correct-feedback");
  const success = await page
    .locator(".option.correct")
    .first()
    .evaluate((el) => getComputedStyle(el).color.match(/\d+/g).map(Number));
  assert(
    success[1] > success[0] && success[1] > success[2],
    "Correct feedback keeps a distinct success green",
  );
  // Save the real account preference, then reload to test the lazy styles in dark mode.
  const prefs = await fetch(base + "/api/web-preferences", {
    headers: { Authorization: "Bearer " + tokens[0] },
  }).then((r) => r.json());
  const saved = await fetch(base + "/api/web-preferences", {
    method: "PUT",
    headers: {
      Authorization: "Bearer " + tokens[0],
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requestId: crypto.randomUUID(),
      version: prefs.version,
      certificateId: "network-engineer",
      values: { ...prefs.values, theme: "dark", reducedMotion: true },
    }),
  });
  assert.equal(saved.status, 200);
  await page.reload();
  for (const route of ["settings", "study", "training", "community", "vip"]) {
    await navigate(page, route);
    await expect(page.locator("html")).toHaveAttribute(
      "data-web-theme",
      "dark",
    );
    await scan(page, route + "-dark");
  }
  await navigate(page, "settings");
  await page.screenshot({
    path: "test-output/blue-palette-settings-dark.png",
    fullPage: true,
  });
  const guestContext = await browser.newContext({
    viewport: { width: 1672, height: 1000 },
  });
  await guestContext.route("**/*", (route) =>
    route.request().url().startsWith(base) ? route.continue() : route.abort(),
  );
  const guest = await guestContext.newPage();
  guest.on("pageerror", (e) => errors.push(e.message));
  await guest.goto(base);
  await expect(guest.locator(".blue-landing")).toBeVisible();
  await scan(guest, "public-landing");
  await guest
    .getByRole("button", { name: "登录", exact: true })
    .first()
    .click();
  await expect(guest.getByRole("dialog")).toBeVisible();
  await guest.getByRole("dialog").getByLabel("账号", { exact: true }).focus();
  await scan(guest, "public-login-dialog-focus");
  await guestContext.close();
  assert.equal(modelCalls, 0, "Palette browsing must not call a model");
  assert.deepEqual(errors, []);
  const violations = checks.flatMap((c) =>
    c.violations.map((v) => ({ page: c.name, ...v })),
  );
  fs.writeFileSync(
    "test-output/blue-palette-report.json",
    JSON.stringify(
      {
        complete: true,
        passed: !violations.length,
        checks,
        errors,
        modelCalls,
      },
      null,
      2,
    ) + "\n",
  );
  assert.equal(
    violations.length,
    0,
    JSON.stringify(violations.slice(0, 10), null, 2),
  );
  console.log(
    JSON.stringify({
      passed: true,
      checkedStates: checks.length,
      inspectedElements: checks.reduce((n, c) => n + c.inspected, 0),
      errors,
      modelCalls,
    }),
  );
} catch (cause) {
  if (page) {
    await page.screenshot({
      path: "test-output/blue-palette-failure.png",
      fullPage: true,
    });
    fs.writeFileSync(
      "test-output/blue-palette-failure.html",
      await page.content(),
    );
    console.error("Palette failure URL:", page.url());
  }
  throw cause;
} finally {
  await browser?.close();
  await app.locals.stop();
  await new Promise((r) => server.close(r));
  store.db.close();
  assert.equal(path.dirname(directory), parent);
  assert(path.basename(directory).startsWith("ace-palette-ui-"));
  fs.rmSync(directory, { recursive: true, force: true });
}
