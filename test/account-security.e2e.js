import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "@playwright/test";
import { createApp } from "../server/index.js";
import { createStore } from "../server/store.js";
import { certificates } from "../server/certificates.js";
import { launchTestBrowser } from "./helpers/browser.js";
import { accountTestMailbox } from "./helpers/account-mail.js";
import {
  dismissLaunchAnnouncement,
  completeFixtureProfile,
} from "./helpers/mobile-profile.js";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aceexam-account-ui-"));
const store = createStore(directory),
  mailbox = accountTestMailbox();
store.register("fixture_admin", "fixture-admin-password");
const legacy = store.register("legacy_fixture", "legacy-password-123");
store.selectCertificate(legacy.id, "network-engineer");
let time = Date.now(),
  deliveryFails = false;
const deliver = mailbox.sendCode;
mailbox.sendCode = async (message) => {
  if (deliveryFails) throw new Error("upstream unavailable");
  await deliver(message);
};
const app = await createApp({
  store,
  production: true,
  accountSecurity: { enabled: true, mailer: mailbox, now: () => time },
});
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const report = { passed: false, checks: [], errors: [] };
let browser, page;
fs.mkdirSync("test-output", { recursive: true });
const screenshot = (name) =>
  page.screenshot({
    path: `test-output/account-security-${name}.png`,
    fullPage: true,
  });
async function code(form, email, purpose) {
  time += 61000;
  await form.getByLabel("邮箱", { exact: true }).fill(email);
  await form.getByRole("button", { name: "获取验证码", exact: true }).click();
  await expect(
    form.getByRole("status").filter({ hasText: "验证码已发送" }),
  ).toBeVisible();
  return mailbox.latest(email, purpose).code;
}
async function login(form, username, password) {
  await form.getByLabel("账号", { exact: true }).fill(username);
  await form.getByLabel("密码", { exact: true }).fill(password);
  await form.getByRole("button", { name: "进入学习空间", exact: true }).click();
}
try {
  browser = await launchTestBrowser();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.addInitScript(
    (version) => {
      try {
        localStorage.setItem(`netwise-announcement-v${version}`, "seen");
      } catch {}
    },
    JSON.parse(fs.readFileSync("mobile/package.json", "utf8")).version,
  );
  page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto(base);
  await page
    .getByRole("button", { name: "开始学习", exact: true })
    .first()
    .click();
  let dialog = page.getByRole("dialog", { name: "创建考匠账号" });
  await dialog.getByLabel("账号", { exact: true }).fill("verified_fixture");
  await dialog
    .getByLabel("密码", { exact: true })
    .fill("original-password-123");
  await dialog
    .getByLabel("确认密码", { exact: true })
    .fill("original-password-123");
  const registrationCode = await code(
    dialog,
    "browser@example.test",
    "register",
  );
  await dialog
    .getByLabel("邮箱验证码", { exact: true })
    .fill(registrationCode === "000000" ? "000001" : "000000");
  await dialog.getByRole("button", { name: "创建账号", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("验证码");
  assert.equal(store.allUsers().length, 2);
  await screenshot("register");
  await dialog.getByLabel("邮箱验证码", { exact: true }).fill(registrationCode);
  await dialog.getByRole("button", { name: "创建账号", exact: true }).click();
  await expect(page.locator(".blue-cert-card")).toHaveCount(certificates.length);
  const created = store
    .allUsers()
    .find((user) => user.username === "verified_fixture");
  assert.ok(created);
  assert.equal(created.isAdmin, 0);
  const otherDevice = store.createAuthSession(created.id);
  await page.request.post(base + "/api/auth/logout");
  await page.goto(base);
  report.checks.push(
    "Real email registration, wrong code rejection, all installed certificates and no public admin grant",
  );

  await page.getByRole("button", { name: "登录", exact: true }).first().click();
  dialog = page.getByRole("dialog", { name: "登录考匠" });
  await dialog.getByRole("button", { name: "忘记密码？", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "找回密码" });
  await dialog.getByLabel("账号", { exact: true }).fill("verified_fixture");
  const recoveryCode = await code(dialog, "browser@example.test", "reset");
  await dialog.getByLabel("邮箱验证码", { exact: true }).fill(recoveryCode);
  await dialog.getByLabel("新密码", { exact: true }).fill("reset-password-123");
  await dialog
    .getByLabel("确认新密码", { exact: true })
    .fill("reset-password-123");
  await screenshot("recovery");
  await dialog
    .getByRole("button", { name: "验证并重置密码", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "密码已重置" }),
  ).toBeVisible();
  assert.equal(store.authUser(otherDevice), null);
  await dialog.getByRole("button", { name: "返回登录", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "登录考匠" });
  await login(dialog, "verified_fixture", "original-password-123");
  await expect(dialog.getByRole("alert")).toContainText("账号或密码不正确");
  await login(dialog, "verified_fixture", "reset-password-123");
  await expect(page.locator(".blue-cert-card")).toHaveCount(certificates.length);
  report.checks.push(
    "Forgot password resets real hash; old password and other device rejected, new password works",
  );

  await context.addCookies([
    {
      name: "netwise_session",
      value: store.createAuthSession(legacy.id),
      url: base,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto(base + "/#settings");
  await page.reload();
  const security = page.getByRole("region", {
    name: "账号与安全",
    exact: true,
  });
  await security.getByRole("button", { name: "绑定邮箱", exact: true }).click();
  await security
    .getByLabel("当前密码", { exact: true })
    .fill("wrong-password-123");
  await security
    .getByLabel("邮箱", { exact: true })
    .fill("legacy-ui@example.test");
  await security
    .getByRole("button", { name: "获取验证码", exact: true })
    .click();
  await expect(security.getByRole("alert")).toContainText("当前密码不正确");
  await security
    .getByLabel("当前密码", { exact: true })
    .fill("legacy-password-123");
  const bindCode = await code(security, "legacy-ui@example.test", "bind");
  await security.getByLabel("邮箱验证码", { exact: true }).fill(bindCode);
  await security
    .getByRole("button", { name: "验证并绑定邮箱", exact: true })
    .click();
  await expect(security.getByRole("status")).toContainText("邮箱已验证并绑定");
  await page.reload();
  await expect(security).toContainText("le***@example.test");
  await screenshot("settings");
  await security.getByRole("button", { name: "修改密码", exact: true }).click();
  await security
    .getByLabel("当前密码", { exact: true })
    .fill("legacy-password-123");
  await security
    .getByLabel("新密码", { exact: true })
    .fill("changed-password-123");
  await security
    .getByLabel("确认新密码", { exact: true })
    .fill("changed-password-123");
  await security
    .getByRole("button", { name: "确认修改密码", exact: true })
    .click();
  await expect(security.getByRole("status")).toContainText("密码已修改");
  assert.equal(
    (await page.request.get(base + "/api/auth/me").then((r) => r.json()))
      .authenticated,
    false,
  );
  await security.getByRole("button", { name: "重新登录", exact: true }).click();
  await expect(page.getByRole("heading", { name: /把每一道题/ })).toBeVisible();
  assert.ok(store.authenticate("legacy_fixture", "changed-password-123"));
  report.checks.push(
    "Legacy account binding requires original password; binding survives reload and changing password logs out",
  );

  await page
    .getByRole("button", { name: "开始学习", exact: true })
    .first()
    .click();
  dialog = page.getByRole("dialog", { name: "创建考匠账号" });
  await dialog.getByLabel("账号", { exact: true }).fill("duplicate_fixture");
  await dialog.getByLabel("密码", { exact: true }).fill("fixture-password-123");
  await dialog
    .getByLabel("确认密码", { exact: true })
    .fill("fixture-password-123");
  const duplicateCode = await code(dialog, "browser@example.test", "register");
  await dialog.getByLabel("邮箱验证码", { exact: true }).fill(duplicateCode);
  await dialog.getByRole("button", { name: "创建账号", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("该邮箱已绑定账号");
  assert.equal(store.allUsers().length, 3);
  await dialog
    .getByLabel("邮箱", { exact: true })
    .fill("delivery-fail@example.test");
  // New form has its own resend UI; server still enforces the persistent mailbox cooldown.
  await dialog.getByRole("button", { name: "关闭对话框", exact: true }).click();
  await page
    .getByRole("button", { name: "开始学习", exact: true })
    .first()
    .click();
  dialog = page.getByRole("dialog", { name: "创建考匠账号" });
  await dialog.getByLabel("账号", { exact: true }).fill("delivery_fixture");
  await dialog
    .getByLabel("邮箱", { exact: true })
    .fill("delivery-fail@example.test");
  deliveryFails = true;
  await dialog.getByRole("button", { name: "获取验证码", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("邮件发送失败");
  assert.equal(store.allUsers().length, 3);
  deliveryFails = false;
  report.checks.push(
    "Duplicate mailbox cannot create another account; failed email delivery shown without fake success",
  );

  await context.close();
  const narrow = await browser.newContext({
    viewport: { width: 375, height: 812 },
  });
  page = await narrow.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto(base);
  await page.getByRole("button", { name: "忘记密码？", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "找回密码", exact: true }),
  ).toBeVisible();
  for (const width of [320, 375, 768]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Recovery fits ${width}px`,
    );
    const box = await page
      .getByRole("dialog", { name: "找回密码" })
      .boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width);
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await screenshot("narrow-recovery");
  await narrow.close();

  const appContext = await browser.newContext({
    viewport: { width: 393, height: 852 },
    isMobile: true,
    hasTouch: true,
  });
  const appLegacy = store.register(
    "app_legacy_fixture",
    "app-original-password-123",
  );
  store.selectCertificate(appLegacy.id, "network-engineer");
  completeFixtureProfile(store, appLegacy);
  await appContext.addInitScript(
    (token) => localStorage.setItem("kaojiang-session-token", token),
    store.createAuthSession(appLegacy.id),
  );
  page = await appContext.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto(base + "/app/");
  await dismissLaunchAnnouncement(page);
  await page.getByRole("button", { name: "我的导航", exact: true }).click();
  await page
    .getByRole("button", { name: "账号与安全设置", exact: true })
    .click();
  await page.getByRole("button", { name: "绑定邮箱", exact: true }).click();
  await page
    .getByLabel("当前密码", { exact: true })
    .fill("app-original-password-123");
  await page
    .getByLabel("邮箱", { exact: true })
    .fill("app-legacy@example.test");
  time += 61000;
  await page.getByRole("button", { name: "获取验证码", exact: true }).click();
  await expect(page.getByText(/验证码已发送/)).toBeVisible();
  await page
    .getByLabel("邮箱验证码", { exact: true })
    .fill(mailbox.latest("app-legacy@example.test", "bind").code);
  await page
    .getByRole("button", { name: "验证并绑定邮箱", exact: true })
    .click();
  await expect(
    page.getByText("邮箱已验证并绑定，可用于找回密码", { exact: true }),
  ).toBeVisible();
  await screenshot("app-security");
  await page.getByRole("button", { name: "修改密码", exact: true }).click();
  await page
    .getByLabel("当前密码", { exact: true })
    .fill("app-original-password-123");
  await page
    .getByLabel("新密码", { exact: true })
    .fill("app-changed-password-123");
  await page
    .getByLabel("确认新密码", { exact: true })
    .fill("app-changed-password-123");
  await page.getByRole("button", { name: "确认修改密码", exact: true }).click();
  await expect(page.getByText(/密码已修改，请重新登录/)).toBeVisible();
  await page.getByRole("button", { name: "重新登录", exact: true }).click();
  await expect(page.getByText("欢迎回来", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "忘记密码？", exact: true }).click();
  await expect(page.getByText("找回密码", { exact: true })).toBeVisible();
  await page.getByLabel("账号", { exact: true }).fill("app_legacy_fixture");
  await page
    .getByLabel("邮箱", { exact: true })
    .fill("app-legacy@example.test");
  time += 61000;
  await page.getByRole("button", { name: "获取验证码", exact: true }).click();
  await expect(page.getByText(/验证码已发送/)).toBeVisible();
  await page
    .getByLabel("邮箱验证码", { exact: true })
    .fill(mailbox.latest("app-legacy@example.test", "reset").code);
  await page
    .getByLabel("新密码", { exact: true })
    .fill("app-reset-password-123");
  await page
    .getByLabel("确认密码", { exact: true })
    .fill("app-reset-password-123");
  await page.getByRole("button", { name: "重置密码", exact: true }).click();
  await expect(page.getByText(/密码已重置，请使用新密码登录/)).toBeVisible();
  assert.ok(store.authenticate("app_legacy_fixture", "app-reset-password-123"));
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await screenshot("app-recovery");
  await appContext.close();
  report.checks.push(
    "320/375/768 recovery layouts fit; App profile binding, password change, logout and email recovery update the same real account",
  );
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) {
  report.failure = error.stack;
  if (page && !page.isClosed())
    await page
      .screenshot({
        path: "test-output/account-security-failure.png",
        fullPage: true,
      })
      .catch(() => {});
  process.exitCode = 1;
} finally {
  fs.writeFileSync(
    "test-output/account-security-report.json",
    JSON.stringify({ ...report, runAt: new Date().toISOString() }, null, 2),
  );
  await browser?.close();
  await app.locals.stop();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  store.db.close();
  assert.equal(path.dirname(directory), os.tmpdir());
  assert.ok(path.basename(directory).startsWith("aceexam-account-ui-"));
  fs.rmSync(directory, { recursive: true, force: true });
  console.log(JSON.stringify(report));
}
