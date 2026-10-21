import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, webkit } from "@playwright/test";
import { createStore } from "../server/store.js";
import { createApp } from "../server/index.js";
import { OpenAICompatibleProvider } from "../server/ai.js";
import { launchTestBrowser } from "./helpers/browser.js";
import {
  avatarBytes,
  dismissLaunchAnnouncement,
} from "./helpers/mobile-profile.js";

for (const key of Object.keys(process.env))
  if (/^(AI_SERVICE_|AUTHOR_|AI_USAGE_)/.test(key)) delete process.env[key];
Object.assign(process.env, {
  AI_MASTER_KEY: crypto.randomBytes(32).toString("base64"),
  ALLOWED_HOSTS: "127.0.0.1,localhost",
  COOKIE_SECURE: "0",
  AUTH_EMAIL_VERIFICATION_ENABLED: "0",
});
const parent = fs.realpathSync(os.tmpdir());
const directory = fs.mkdtempSync(path.join(parent, "ace-blue-profile-"));
const store = createStore(directory);
const user = await store.registerAsync(
  "profile-learner",
  "fixture-password-123",
);
const peer = await store.registerAsync("profile-peer", "fixture-password-123");
for (const u of [user, peer]) {
  store.db.prepare("UPDATE users SET is_admin=0 WHERE id=?").run(u.id);
  store.selectCertificate(u.id, "network-engineer");
}
store.updateCommunityName(user.id, "原有昵称");
store.updateCommunityName(peer.id, "其他账号");
store.saveAccountEntitlement(user.id, {
  plan: "svip",
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
});
const token = store.createAuthSession(user.id),
  peerToken = store.createAuthSession(peer.id);
let modelCalls = 0;
const app = await createApp({
  store,
  production: true,
  accountSecurity: { enabled: false },
  provider: new OpenAICompatibleProvider(store, {
    fetch: async () => {
      modelCalls++;
      throw new Error("Models disabled in profile test");
    },
  }),
});
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const version = JSON.parse(
  fs.readFileSync(new URL("../mobile/package.json", import.meta.url)),
).version;
const checks = [],
  errors = [];
let browser, page, context;
fs.mkdirSync("test-output", { recursive: true });
const readUser = async (auth = token) => {
  const response = await fetch(base + "/api/auth/me", {
    headers: { Authorization: `Bearer ${auth}` },
  });
  assert.equal(response.status, 200);
  return (await response.json()).user;
};
async function contextFor(engine, auth = token, options = {}) {
  const c = await engine.newContext({
    viewport: { width: 1672, height: 1000 },
    ...options,
  });
  await c.route("**/*", (route) =>
    route
      .request()
      .url()
      .startsWith(base + "/")
      ? route.continue()
      : route.abort(),
  );
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
  c.on("page", (p) => {
    p.setDefaultTimeout(15000);
    p.on("pageerror", (error) => errors.push(error.message));
  });
  return c;
}
const profile = () =>
  page.getByRole("region", { name: "个人资料", exact: true });
const editor = () =>
  page.getByRole("dialog", { name: "编辑个人资料", exact: true });
async function open() {
  await profile()
    .getByRole("button", { name: "编辑资料", exact: true })
    .click();
  await expect(
    editor().getByRole("textbox", { name: "显示名称", exact: true }),
  ).toBeFocused();
}
async function chooseImage(
  buffer = avatarBytes,
  mimeType = "image/png",
  name = "avatar.png",
) {
  const chooser = page.waitForEvent("filechooser");
  await editor().getByRole("button", { name: "选择头像", exact: true }).click();
  await (await chooser).setFiles({ name, mimeType, buffer });
}
async function saved(name, endpoint = "/api/auth/profile") {
  const response = page.waitForResponse(
    (r) => r.url().endsWith(endpoint) && r.request().method() === "PUT",
  );
  await editor().getByRole("button", { name: "保存资料", exact: true }).click();
  assert.equal((await response).status(), 200);
  await expect(editor()).toHaveCount(0);
  await expect(
    profile().getByRole("heading", { name, exact: true }),
  ).toBeVisible();
  await expect(page.locator(".account-trigger strong")).toHaveText(name);
}
const fit = async (width) => {
  await page.setViewportSize({ width, height: 1000 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    )
    .toBeLessThanOrEqual(1);
  if (await editor().isVisible()) {
    const metrics = await editor().evaluate((el) => ({
      width: el.getBoundingClientRect().width,
      available: innerWidth,
      overflow: el.scrollWidth - el.clientWidth,
    }));
    assert(
      metrics.width <= metrics.available && metrics.overflow <= 1,
      JSON.stringify(metrics),
    );
  }
};
const shot = (name) =>
  page.screenshot({
    path: `test-output/blue-profile-${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
try {
  browser = await launchTestBrowser();
  context = await contextFor(browser);
  page = await context.newPage();
  await page.goto(base + "/#settings", { waitUntil: "networkidle" });
  await expect(page.locator("main")).toHaveAttribute("data-page", "settings");
  await expect(
    profile().getByRole("heading", { name: "原有昵称", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "修改密码", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".certificate-setting.selected")).toContainText(
    "网络工程师",
  );
  await shot("settings");
  let writes = 0;
  page.on("request", (request) => {
    if (
      request.method() === "PUT" &&
      /\/api\/(auth\/profile|community\/profile)$/.test(request.url())
    )
      writes++;
  });
  await open();
  await editor().getByLabel("显示名称", { exact: true }).fill("不会保存的草稿");
  await chooseImage();
  await expect(editor().locator(".blue-profile-preview img")).toHaveAttribute(
    "src",
    /^data:image\/png/,
  );
  await page.keyboard.press("Escape");
  await expect(editor()).toHaveCount(0);
  await expect(
    profile().getByRole("button", { name: "编辑资料", exact: true }),
  ).toBeFocused();
  assert.equal(writes, 0);
  assert.equal((await readUser()).communityName, "原有昵称");
  checks.push(
    "Cancel and Escape discard drafts without writing; focus returns to edit button",
  );

  // Existing avatarless users can continue to change their name without uploading a photo.
  await open();
  await editor().getByLabel("显示名称", { exact: true }).fill("只修改昵称");
  await saved("只修改昵称", "/api/community/profile");
  assert.equal((await readUser()).avatarUrl, null);
  assert.equal((await readUser()).username, user.username);
  checks.push(
    "Name-only save preserves avatarless accounts and login identity",
  );

  await open();
  await chooseImage(
    Buffer.from("<svg onload='alert(1)'/>"),
    "image/svg+xml",
    "avatar.svg",
  );
  await expect(editor().getByRole("alert")).toContainText("2 MB");
  await expect(
    editor().getByRole("button", { name: "保存资料", exact: true }),
  ).toBeDisabled();
  await chooseImage(
    Buffer.alloc(2 * 1024 * 1024 + 1),
    "image/png",
    "large.png",
  );
  await expect(editor().getByRole("alert")).toContainText("2 MB");
  await chooseImage(Buffer.from("not-a-png"));
  await expect(editor().getByRole("alert")).toContainText("无法打开");
  assert.equal(writes, 1);
  await chooseImage();
  await expect(editor().locator(".blue-profile-preview img")).toHaveAttribute(
    "src",
    /^data:image\/png/,
  );
  await editor().getByLabel("显示名称", { exact: true }).fill("蓝色学习者");
  await page.route("**/api/auth/profile", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "资料服务暂时不可用" }),
    }),
  );
  await editor().getByRole("button", { name: "保存资料", exact: true }).click();
  await expect(editor().getByRole("alert")).toContainText("资料服务暂时不可用");
  await expect(editor().getByLabel("显示名称", { exact: true })).toHaveValue(
    "蓝色学习者",
  );
  await expect(editor().locator(".blue-profile-preview img")).toHaveAttribute(
    "src",
    /^data:image\/png/,
  );
  assert.equal((await readUser()).communityName, "只修改昵称");
  await shot("retry");
  await page.unroute("**/api/auth/profile");
  await saved("蓝色学习者");
  const uploaded = await readUser();
  assert.equal(uploaded.profileComplete, true);
  assert.match(uploaded.avatarUrl, /^\/avatars\/[a-f0-9-]+\.png$/);
  const bytes = await fetch(base + uploaded.avatarUrl);
  assert.deepEqual(Buffer.from(await bytes.arrayBuffer()), avatarBytes);
  await expect
    .poll(() =>
      profile()
        .locator("img")
        .evaluate((el) => el.complete && el.naturalWidth > 0),
    )
    .toBe(true);
  assert.equal((await readUser(peerToken)).communityName, "其他账号");
  assert.equal((await readUser(peerToken)).avatarUrl, null);
  checks.push(
    "Reject SVG, oversized and corrupt images; preserve failed drafts and retry actual shared profile API with account isolation",
  );

  // A lost acknowledgement can follow a real commit. Retrying is safe for profile values
  // and the shared service removes the superseded avatar from the same account.
  await open();
  await editor()
    .getByLabel("显示名称", { exact: true })
    .fill("应答恢复后的昵称");
  await chooseImage();
  await expect(editor().locator(".blue-profile-preview img")).toHaveAttribute(
    "src",
    /^data:image\/png/,
  );
  await page.route("**/api/auth/profile", async (route) => {
    const committed = await route.fetch();
    assert.equal(committed.status(), 200);
    await route.abort("failed");
  });
  await editor().getByRole("button", { name: "保存资料", exact: true }).click();
  await expect(editor().getByRole("alert")).toContainText("可重试保存");
  assert.equal((await readUser()).communityName, "应答恢复后的昵称");
  await page.unroute("**/api/auth/profile");
  await saved("应答恢复后的昵称");
  assert.equal(fs.readdirSync(path.join(directory, "avatars")).length, 1);
  await page.reload({ waitUntil: "networkidle" });
  await expect(
    profile().getByRole("heading", { name: "应答恢复后的昵称", exact: true }),
  ).toBeVisible();
  assert.equal((await readUser()).username, user.username);
  checks.push(
    "Lost save response can be retried; refresh restores actual profile; no orphaned superseded avatar",
  );

  for (const width of [320, 375, 768, 900, 1280, 1672]) {
    await fit(width);
    await open();
    await fit(width);
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(() => !!document.activeElement.closest("dialog")),
      true,
    );
    if (width === 375) await shot("375-editor");
    await page.keyboard.press("Escape");
  }
  await fit(1672);
  const preferences = page.getByRole("region", {
    name: "网页学习设置",
    exact: true,
  });
  await preferences.getByRole("button", { name: "深色", exact: true }).click();
  await preferences
    .getByRole("switch", { name: "减少网页动画", exact: true })
    .check();
  await preferences
    .getByRole("button", { name: "保存设置", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-web-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute(
    "data-web-reduced-motion",
    "true",
  );
  await shot("dark-settings");
  await open();
  await shot("dark-editor");
  await page.keyboard.press("Escape");
  checks.push(
    "Settings and editor fit six widths, native modal keeps keyboard focus; persisted dark theme and reduced animation remain effective",
  );

  const fresh = await contextFor(browser);
  const newPage = await fresh.newPage();
  await newPage.goto(base + "/#settings", { waitUntil: "networkidle" });
  await expect(newPage.locator(".blue-profile-identity h2")).toHaveText(
    "应答恢复后的昵称",
  );
  await expect(newPage.locator("html")).toHaveAttribute(
    "data-web-theme",
    "dark",
  );
  await newPage
    .getByRole("button", { name: "会员与额度", exact: true })
    .click();
  await expect(newPage.locator("main")).toHaveAttribute("data-page", "vip");
  await fresh.close();
  const other = await contextFor(browser, peerToken);
  const otherPage = await other.newPage();
  await otherPage.goto(base + "/#settings", { waitUntil: "networkidle" });
  await expect(otherPage.locator(".blue-profile-identity h2")).toHaveText(
    "其他账号",
  );
  await expect(otherPage.locator(".blue-profile-avatar img")).toHaveCount(0);
  await otherPage
    .getByRole("button", { name: "浏览考试与证书", exact: true })
    .last()
    .click();
  await expect(otherPage.locator("main")).toHaveAttribute(
    "data-page",
    "certificates",
  );
  await other.close();
  checks.push(
    "New browser restores profile and theme; peer account remains separate; membership and certificate entries work",
  );

  // The existing /app/ Web build consumes exactly the same profile, without another setup step.
  const mobile = await contextFor(browser, token, {
    viewport: { width: 393, height: 852 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1",
  });
  await mobile.addInitScript((token) => {
    try {
      localStorage.setItem("kaojiang-session-token", token);
    } catch {}
  }, token);
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(base + "/app/", { waitUntil: "networkidle" });
  await dismissLaunchAnnouncement(mobilePage);
  await expect(mobilePage.getByTestId("today-screen")).toBeVisible();
  await expect(
    mobilePage.getByRole("heading", { name: "完善个人资料", exact: true }),
  ).toHaveCount(0);
  await mobilePage
    .getByRole("button", { name: "我的导航", exact: true })
    .click();
  await expect(
    mobilePage.getByText("应答恢复后的昵称", { exact: true }).first(),
  ).toBeVisible();
  await mobilePage
    .getByRole("button", { name: "个人资料设置", exact: true })
    .click();
  await expect(
    mobilePage.getByRole("textbox", { name: "名字", exact: true }),
  ).toHaveValue("应答恢复后的昵称");
  await expect(
    mobilePage
      .getByRole("button", { name: "选择头像", exact: true })
      .locator("img"),
  ).toBeVisible();
  await mobile.close();
  checks.push(
    "Existing /app/ mobile Web restores the Web-edited profile, skips setup and shows the saved name/avatar in its real profile screen",
  );

  await context.close();
  await browser.close();
  browser = null;
  browser = await webkit.launch({
    headless: true,
    proxy: { server: "http://127.0.0.1:9", bypass: "localhost,127.0.0.1" },
  });
  context = await contextFor(browser);
  page = await context.newPage();
  await page.goto(base + "/#settings", { waitUntil: "networkidle" });
  await open();
  await editor()
    .getByLabel("显示名称", { exact: true })
    .fill("WebKit 同步昵称");
  await chooseImage();
  await expect(editor().locator(".blue-profile-preview img")).toHaveAttribute(
    "src",
    /^data:image\/png/,
  );
  await saved("WebKit 同步昵称");
  await fit(375);
  await open();
  await fit(375);
  await page.keyboard.press("Escape");
  await expect(editor()).toHaveCount(0);
  checks.push(
    "WebKit native dialog, actual image selection/save and narrow layout pass",
  );
  assert.equal(modelCalls, 0);
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "test-output/blue-profile-report.json",
    JSON.stringify(
      { passed: true, checks, modelCalls, errors, productionDataUsed: false },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({ passed: true, checks: checks.length, modelCalls, errors }),
  );
} catch (cause) {
  if (page) {
    await shot("failure").catch(() => {});
    fs.writeFileSync(
      "test-output/blue-profile-failure.txt",
      await page
        .locator("body")
        .innerText()
        .catch(() => ""),
    );
  }
  throw cause;
} finally {
  await browser?.close();
  await app.locals.stop();
  await new Promise((resolve) => server.close(resolve));
  store.db.close();
  assert.equal(path.dirname(directory), parent);
  assert(path.basename(directory).startsWith("ace-blue-profile-"));
  fs.rmSync(directory, { recursive: true, force: true });
}
