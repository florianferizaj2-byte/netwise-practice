import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { expect } from "@playwright/test";
import { createApp } from "../server/index.js";
import { createStore } from "../server/store.js";
import { launchTestBrowser } from "./helpers/browser.js";
for (const key of Object.keys(process.env))
  if (/^(AI_SERVICE_|AUTHOR_|WECHAT_)/.test(key)) delete process.env[key];
Object.assign(process.env, {
  ALLOWED_HOSTS: "127.0.0.1",
  COOKIE_SECURE: "0",
  AI_MASTER_KEY: crypto.randomBytes(32).toString("base64"),
});
const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "ace-console-browser-"),
  ),
  store = createStore(directory);
const admin = store.register("browser_console_admin", "fixture-password-123"),
  learner = store.register("browser_console_learner", "fixture-password-123");
store.db.prepare("UPDATE users SET is_admin=? WHERE id=?").run(1, admin.id);
store.db.prepare("UPDATE users SET is_admin=? WHERE id=?").run(0, learner.id);
for (const user of [admin, learner])
  store.selectCertificate(user.id, "network-engineer");
const tokens = [admin, learner].map((u) => store.createAuthSession(u.id));
let modelCalls = 0;
const app = await createApp({
  store,
  production: true,
  accountSecurity: { enabled: false },
  provider: {
    call: async () => {
      modelCalls++;
      throw new Error("external calls disabled");
    },
    generateBankExpansion: async () => {
      modelCalls++;
      throw new Error("external calls disabled");
    },
  },
});
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`,
  errors = [],
  checks = [];
let browser;
const output = "test-output/admin-console";
fs.mkdirSync(output, { recursive: true });
try {
  browser = await launchTestBrowser();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
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
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (dialog) => dialog.accept());
  const goto = async (id) => {
    await page.goto(base + "/#admin/" + id);
    await expect(page.locator('[data-testid="admin-console"]')).toBeVisible();
  };
  for (const [id, title] of [
    ["overview", "总览工作台"],
    ["catalog", "证书与目录"],
    ["questions", "题库管理"],
    ["documents", "导入与审核"],
    ["quality", "质量检查"],
    ["teaching", "AI 教学管理"],
    ["users", "用户管理"],
    ["memberships", "会员与兑换码"],
    ["announcement", "公告管理"],
    ["feedback", "用户反馈"],
    ["jobs", "任务中心"],
    ["config", "AI 服务配置"],
    ["usage", "用量与成本"],
    ["audit", "操作审计"],
    ["system", "运行状态"],
  ]) {
    await goto(id);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(page.locator('.ac-state[role="status"]')).toHaveCount(0, {
      timeout: 15000,
    });
    assert.equal(
      await page.locator(".ac-state.ac-error").count(),
      0,
      id + " API loaded",
    );
    checks.push("route:" + id);
  }
  await goto("overview");
  await expect(page.locator(".ac-metrics")).toBeVisible();
  await page.screenshot({
    path: output + "/overview-desktop.png",
    fullPage: true,
  });
  await page.route("**/api/admin/console/questions?*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Synthetic temporary service outage" }),
    }),
  );
  await goto("questions");
  await expect(
    page.getByText("Synthetic temporary service outage"),
  ).toBeVisible();
  await page.unroute("**/api/admin/console/questions?*");
  await page.getByRole("button", { name: "重新读取", exact: true }).click();
  await expect(page.locator(".ac-table tbody tr").first()).toBeVisible();
  checks.push("API failure and recovery");
  const bank = store
    .allQ()
    .filter((q) => q.certificates?.includes("network-engineer"));
  const q = bank.find(
    (q) => bank.filter((other) => other.id.includes(q.id)).length === 1,
  );
  await page
    .getByRole("combobox", { name: "管理证书范围" })
    .selectOption("network-engineer");
  await page.getByPlaceholder("题干、题号、知识点；支持 * 和 ?").fill(q.id);
  await page.getByPlaceholder("题干、题号、知识点；支持 * 和 ?").press("Enter");
  await expect(page.locator(".ac-table tbody tr")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".ac-table tbody tr")).toHaveCount(1);
  assert.ok(page.url().includes("search="));
  checks.push("filters and refresh");
  store.recordAttempt(q.id, q.answer, 1000, "practice", learner.id);
  await page
    .getByRole("checkbox", { name: "选择题目 " + q.id, exact: true })
    .check();
  await page.getByRole("button", { name: "下架所选", exact: true }).click();
  await page
    .getByLabel("操作原因", { exact: true })
    .fill("浏览器验收下架与历史保留");
  await page.getByRole("button", { name: "预览影响", exact: true }).click();
  await expect(
    page.getByText("影响预览：1 道题", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "确认下架 1 题", exact: true })
    .click();
  await expect(
    page.locator(".ac-table tbody .ac-status-interrupted"),
  ).toHaveText("已下架");
  assert.ok(store.getQ(q.id));
  assert.equal(store.allA(learner.id).length, 1);
  await page
    .getByRole("checkbox", { name: "选择题目 " + q.id, exact: true })
    .check();
  await page.getByRole("button", { name: "恢复所选", exact: true }).click();
  await page.getByLabel("操作原因", { exact: true }).fill("浏览器验收恢复题目");
  await page.getByRole("button", { name: "预览影响", exact: true }).click();
  await page
    .getByRole("button", { name: "确认恢复 1 题", exact: true })
    .click();
  await expect(page.locator(".ac-table tbody .ac-status-completed")).toHaveText(
    "使用中",
  );
  checks.push("bulk preview, hide and restore preserve learning history");
  await page.getByRole("button", { name: "查看", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".ac-answer")).toContainText(q.answer.join("、"));
  await page.getByRole("button", { name: "创建修订草稿", exact: true }).click();
  await expect(page.getByLabel("批次名称")).toBeVisible();
  const edited = "浏览器测试修订：" + q.question;
  await page.getByLabel("题干", { exact: true }).fill(edited);
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(
    page.getByText("草稿已保存，运行中的题库未改变", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("题干", { exact: true })).toHaveValue(edited);
  assert.equal(store.getQ(q.id).question, q.question);
  checks.push("revision persistence without mutating published question");
  await page.getByRole("tab", { name: "差异与检查", exact: true }).click();
  await page.getByRole("button", { name: "执行质量检查", exact: true }).click();
  await expect(
    page.getByText("检查未通过，发布导出已阻止", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  checks.push("missing review fails closed");
  await goto("users");
  await page.getByPlaceholder("搜索账号或昵称").fill(learner.username);
  await page.getByPlaceholder("搜索账号或昵称").press("Enter");
  await expect(page.locator(".ac-table tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "管理", exact: true }).click();
  await page.getByLabel("昵称", { exact: true }).fill("浏览器验收昵称");
  await page.getByLabel("会员等级", { exact: true }).selectOption("vip");
  await page.getByRole("button", { name: "保存账号设置", exact: true }).click();
  await expect(
    page.getByText("账号资料与会员权益已保存", { exact: true }),
  ).toBeVisible();
  assert.equal(store.userById(learner.id).communityName, "浏览器验收昵称");
  assert.equal(store.accountEntitlement(learner.id).plan, "vip");
  await page.keyboard.press("Escape");
  checks.push("user profile and membership saved");
  await goto("teaching");
  await page
    .getByRole("button", { name: "静态互动课覆盖", exact: true })
    .click();
  await page
    .getByRole("button", { name: "预览课程", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("dialog", { name: "互动课内容预览" }),
  ).toBeVisible();
  await expect(page.locator(".ac-tutor-preview")).toBeVisible();
  await page.keyboard.press("Escape");
  checks.push("controlled course preview");
  await goto("announcement");
  await page
    .getByLabel("公告标题", { exact: true })
    .fill("管理员浏览器测试公告");
  await page
    .getByLabel("公告正文", { exact: true })
    .fill("纯文本测试\n<script>不执行脚本</script>");
  await page.getByRole("switch", { name: "公开显示公告" }).check();
  await page.getByRole("button", { name: "保存并发布", exact: true }).click();
  await expect(page.getByText("公告已发布", { exact: true })).toBeVisible();
  checks.push("announcement saved");
  const learnerContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  await learnerContext.addCookies([
    {
      name: "netwise_session",
      value: tokens[1],
      url: base,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const learnerPage = await learnerContext.newPage();
  await learnerPage.goto(base + "/#admin/overview");
  await expect(learnerPage.getByText("仅管理员可访问管理中心")).toBeVisible();
  assert.equal(
    await learnerPage.locator('[data-testid="admin-console"]').count(),
    0,
  );
  checks.push("learner denied");
  await learnerPage.goto(base + "/#home");
  const versionModal = learnerPage.getByRole("button", {
    name: "关闭网站公告",
  });
  if (await versionModal.isVisible()) await versionModal.click();
  await expect(
    learnerPage.locator(".workspace-managed-announcement"),
  ).toContainText("管理员浏览器测试公告");
  await learnerContext.close();
  checks.push("Web announcement reads shared service");
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const id of [
      "overview",
      "questions",
      "documents",
      "users",
      "memberships",
      "announcement",
      "teaching",
      "system",
    ]) {
      await goto(id);
      await expect(page.locator('.ac-state[role="status"]')).toHaveCount(0, {
        timeout: 15000,
      });
      const overflow = await page.evaluate(() => ({
        viewport: innerWidth,
        body: document.documentElement.scrollWidth,
      }));
      assert.ok(
        overflow.body <= overflow.viewport + 2,
        `${id} overflow at ${width}: ${JSON.stringify(overflow)}`,
      );
      if (width === 375 && id === "overview")
        await page.screenshot({
          path: output + "/overview-narrow.png",
          fullPage: true,
        });
    }
    checks.push("layout:" + width);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await goto("questions");
  await expect(page.locator(".ac-table tbody tr").first()).toBeVisible();
  await page.screenshot({
    path: output + "/questions-desktop.png",
    fullPage: true,
  });
  assert.equal(
    modelCalls,
    0,
    "navigation and inspection must not call a model",
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      { ok: true, checks, modelCalls, screenshots: output },
      null,
      2,
    ),
  );
} catch (e) {
  console.error(e);
  if (browser) {
    for (const c of browser.contexts())
      for (const p of c.pages())
        await p
          .screenshot({ path: output + "/failure.png", fullPage: true })
          .catch(() => {});
  }
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await app.locals.stop();
  await new Promise((r) => server.close(r));
  store.db.close();
  assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
  assert.ok(path.basename(directory).startsWith("ace-console-browser-"));
  fs.rmSync(directory, { recursive: true, force: true });
  fs.writeFileSync(
    output + "/report.json",
    JSON.stringify(
      { ok: !process.exitCode, checks, errors, modelCalls },
      null,
      2,
    ),
  );
}
