import { expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/index.js";
import { createStore } from "../server/store.js";
import { launchTestBrowser } from "./helpers/browser.js";

process.env.ALLOWED_HOSTS = "127.0.0.1,localhost";
process.env.COOKIE_SECURE = "0";
delete process.env.ADMIN_USERNAME;
const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "aceexam-membership-e2e-"),
);
const store = createStore(directory);
const user = store.register("membership_admin", "fixture-password-123");
store.selectCertificate(user.id, "network-engineer");
const token = store.createAuthSession(user.id);
const app = await createApp({ store, production: true });
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
fs.mkdirSync("test-output", { recursive: true });
let browser, page;
const errors = [];

try {
  browser = await launchTestBrowser();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  await context.addCookies([
    { name: "netwise_session", value: token, url: base },
  ]);
  const version = JSON.parse(
    fs.readFileSync("mobile/package.json", "utf8"),
  ).version;
  await context.addInitScript((key) => {
    localStorage.setItem(key, "seen");
    // Exercise creation on deployments where randomUUID is unavailable.
    Object.defineProperty(window.crypto, "randomUUID", {
      value: undefined,
      configurable: true,
    });
  }, `netwise-announcement-v${version}`);
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /ReferenceError|React error|component.*error/i.test(message.text())
    )
      errors.push(message.text());
  });
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(base + "/#admin");
  await page.getByRole("tab", { name: "兑换码", exact: true }).click();
  const adminPage = page.locator(".membership-admin");
  const rows = adminPage.locator("tbody tr");
  const checkboxes = rows.locator('input[type="checkbox"]');
  const pagination = adminPage.locator(".membership-pagination");
  await expect(
    adminPage.getByRole("heading", { name: "批量创建会员兑换码", exact: true }),
  ).toBeVisible();
  await expect(rows).toHaveCount(30);
  await expect(rows.locator(".member-tier")).toHaveCount(30);
  await expect(
    adminPage.getByRole("checkbox", { name: "全选本页兑换码" }),
  ).toBeEnabled();
  assert.deepEqual(
    errors,
    [],
    "opening the non-empty code list must not crash",
  );

  const createButton = adminPage.getByRole("button", {
    name: "批量创建兑换码",
    exact: true,
  });
  await adminPage.getByLabel("生成兑换码等级").selectOption("svip");
  await adminPage.getByLabel("生成兑换码数量").fill("45");
  await adminPage.getByLabel("兑换会员天数").fill("90");
  await adminPage
    .getByLabel("兑换截止日期", { exact: true })
    .fill(new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10));
  let dropped = false;
  const requestIds = [];
  const createRoute = "**/api/admin/membership-codes";
  await page.route(createRoute, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    requestIds.push(route.request().postDataJSON().requestId);
    if (dropped) return route.continue();
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    dropped = true;
    return route.abort("failed"); // Server committed; the browser lost the response.
  });
  await createButton.click();
  await expect(adminPage.getByRole("alert")).toContainText("无法连接服务器");
  assert.equal(store.adminMembershipCodes().total, 75);
  await createButton.click();
  await expect(adminPage.locator(".membership-notice")).toContainText(
    "已找回上次生成的 45 个 SVIP",
  );
  assert.equal(requestIds.length, 2);
  assert.equal(requestIds[0], requestIds[1]);
  assert.equal(
    store.adminMembershipCodes().total,
    75,
    "retry cannot issue another batch",
  );
  await page.unroute(createRoute);
  await expect(pagination).toContainText("共 55 个兑换码");
  await expect(adminPage.getByLabel("筛选会员等级")).toHaveValue("svip");
  await expect(
    adminPage.getByRole("checkbox", { name: "全选本页兑换码" }),
  ).toBeEnabled();
  const allSvip = store.adminMembershipCodes({
    plan: "svip",
    limit: 100,
  }).codes;
  const batchId = allSvip[0].batchId;
  const batchCodes = allSvip
    .filter((code) => code.batchId === batchId)
    .map((code) => code.code);
  assert.equal(batchCodes.length, 45);

  async function download(button, name) {
    const pending = page.waitForEvent("download");
    await button.click();
    const file = await pending;
    assert.match(file.suggestedFilename(), /^kaojiang-membership-.*\.txt$/);
    const output = path.resolve("test-output", `membership-${name}.txt`);
    await file.saveAs(output);
    const bytes = fs.readFileSync(output);
    assert.deepEqual(
      [...bytes.subarray(0, 3)],
      [239, 187, 191],
      "UTF-8 BOM supports Windows text editors",
    );
    const content = bytes.toString("utf8").replace(/^\uFEFF/, "");
    assert.ok(content.endsWith("\r\n"));
    assert.ok(!/(^|[^\r])\n/.test(content), "Windows newlines are retained");
    return content.trim().split("\r\n");
  }
  const batchText = await download(
    adminPage.getByRole("button", { name: /导出本批 TXT/ }),
    "batch",
  );
  assert.equal(batchText.length, 45);
  assert.deepEqual(new Set(batchText), new Set(batchCodes));

  const selected = [];
  for (let index = 0; index < 2; index++) {
    selected.push(
      await rows.nth(index).locator(".membership-code").textContent(),
    );
    await checkboxes.nth(index).check();
  }
  assert.equal(
    await adminPage
      .getByRole("checkbox", { name: "全选本页兑换码" })
      .evaluate((element) => element.indeterminate),
    true,
  );
  await adminPage.getByRole("button", { name: "下一页兑换码" }).click();
  await expect(rows).toHaveCount(25);
  await expect(
    adminPage.getByRole("checkbox", { name: "全选本页兑换码" }),
  ).toBeEnabled();
  selected.push(await rows.first().locator(".membership-code").textContent());
  await checkboxes.first().check();
  await expect(
    adminPage.getByRole("status").filter({ hasText: "已选" }),
  ).toContainText("已选 3 个");
  const selectedText = await download(
    adminPage.getByRole("button", { name: "导出勾选 TXT", exact: true }),
    "selected",
  );
  assert.deepEqual(new Set(selectedText), new Set(selected));
  const allText = await download(
    adminPage.getByRole("button", { name: /导出筛选结果 TXT/ }),
    "filtered",
  );
  assert.equal(allText.length, 55, "filtered export includes both pages");
  assert.deepEqual(new Set(allText), new Set(allSvip.map((code) => code.code)));

  await adminPage.getByRole("button", { name: "上一页兑换码" }).click();
  await expect(rows).toHaveCount(30);
  await expect(checkboxes.first()).toBeChecked();
  await expect(checkboxes.nth(1)).toBeChecked();
  await adminPage.getByRole("checkbox", { name: "全选本页兑换码" }).check();
  await expect(
    adminPage.getByRole("status").filter({ hasText: "已选" }),
  ).toContainText("已选 31 个");
  await adminPage.getByRole("checkbox", { name: "全选本页兑换码" }).uncheck();
  await expect(
    adminPage.getByRole("status").filter({ hasText: "已选" }),
  ).toContainText("已选 1 个");

  await adminPage.getByLabel("筛选兑换码状态").selectOption("available");
  await expect(
    adminPage.getByRole("status").filter({ hasText: "已选" }),
  ).toContainText("已选 0 个");
  await expect(
    adminPage.getByRole("button", { name: "导出勾选 TXT", exact: true }),
  ).toBeDisabled();
  const revokedCode = await rows
    .first()
    .locator(".membership-code")
    .textContent();
  await rows.first().getByRole("button", { name: "作废", exact: true }).click();
  await expect(pagination).toContainText("共 54 个兑换码");
  await expect(
    adminPage.getByRole("button", { name: /导出筛选结果 TXT/ }),
  ).toBeEnabled();

  const exportRoute = "**/api/admin/membership-codes/export";
  await page.route(exportRoute, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "导出暂时不可用，请重试" }),
    }),
  );
  await adminPage.getByRole("button", { name: /导出筛选结果 TXT/ }).click();
  await expect(adminPage.getByRole("alert")).toContainText("导出暂时不可用");
  await expect(
    adminPage.getByRole("button", { name: /导出筛选结果 TXT/ }),
  ).toBeEnabled();
  await page.unroute(exportRoute);
  const availableText = await download(
    adminPage.getByRole("button", { name: /导出筛选结果 TXT/ }),
    "available",
  );
  assert.equal(availableText.length, 54);
  assert.ok(!availableText.includes(revokedCode));

  const listRoute = "**/api/admin/membership-codes?*";
  await page.route(listRoute, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "列表暂时不可用，请刷新重试" }),
    }),
  );
  await adminPage.getByRole("button", { name: "刷新", exact: true }).click();
  await expect(adminPage.getByRole("alert")).toContainText("列表暂时不可用");
  await expect(rows).toHaveCount(0);
  await expect(
    adminPage.getByRole("button", { name: /导出筛选结果 TXT/ }),
  ).toBeDisabled();
  await page.unroute(listRoute);
  await adminPage.getByRole("button", { name: "刷新", exact: true }).click();
  await expect(rows).toHaveCount(30);
  await expect(adminPage.getByRole("alert")).toHaveCount(0);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "test-output/membership-admin-desktop.png" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const viewport of [
    { width: 375, height: 900 },
    { width: 812, height: 375 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(createButton).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        ),
      )
      .toBeLessThanOrEqual(1);
    const layout = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      overflow: [...document.querySelectorAll("body *")]
        .filter(
          (element) =>
            element.getBoundingClientRect().right > window.innerWidth + 1 &&
            !element.closest(".table-scroll, .admin-tabs, .sidebar"),
        )
        .slice(0, 15)
        .map((element) => ({
          tag: element.tagName,
          className: element.className,
          width: element.getBoundingClientRect().width,
          right: element.getBoundingClientRect().right,
        })),
    }));
    assert.ok(
      layout.documentWidth <= layout.viewportWidth + 1,
      `the admin page fits the viewport: ${JSON.stringify(layout)}`,
    );
  }
  await page.setViewportSize({ width: 375, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "test-output/membership-admin-mobile.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: non-empty membership page, batch creation and safe retries, three TXT downloads, cross-page selection, filtered export, failure recovery and responsive layout.",
  );
} catch (error) {
  if (page && !page.isClosed())
    await page
      .screenshot({
        path: "test-output/membership-admin-failure.png",
        fullPage: true,
      })
      .catch(() => {});
  throw error;
} finally {
  await browser?.close();
  await app.locals.stop();
  await new Promise((resolve) => server.close(resolve));
  store.db.close();
  assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
  assert.ok(path.basename(directory).startsWith("aceexam-membership-e2e-"));
  fs.rmSync(directory, { recursive: true, force: true });
}
