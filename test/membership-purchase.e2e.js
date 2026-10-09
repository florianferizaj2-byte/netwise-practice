import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, webkit, expect } from "@playwright/test";
import { createApp } from "../server/index.js";
import { createStore } from "../server/store.js";

process.env.ALLOWED_HOSTS = "127.0.0.1,localhost";
process.env.COOKIE_SECURE = "0";
const purchaseUrl = "https://catfk.com/shop/aceexam";
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aceexam-purchase-"));
const store = createStore(directory), app = await createApp({ store, production: true });
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const version = JSON.parse(fs.readFileSync("mobile/package.json", "utf8")).version;
fs.mkdirSync("test-output/purchase", { recursive: true });
const errors = [];
let browser;

async function shop(context, page, link) {
  await expect(link).toHaveAttribute("href", purchaseUrl);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
  const [purchasePage] = await Promise.all([context.waitForEvent("page"), link.click()]);
  await purchasePage.waitForURL(purchaseUrl);
  await purchasePage.waitForLoadState();
  assert.equal(await purchasePage.evaluate(() => window.opener), null);
  assert.ok(page.url().startsWith(base), "the purchase leaves the original learning page open");
  await purchasePage.close();
}
try {
  for (const [engine, type] of [["chromium", chromium], ["webkit", webkit]]) {
    browser = await type.launch({ headless: true, proxy: { server: "http://127.0.0.1:9", bypass: "127.0.0.1,localhost" } });
    for (const mobile of [false, true]) {
      const user = await store.register(`purchase_${engine}_${mobile ? "mobile" : "desktop"}`, "fixture-password-123");
      store.selectCertificate(user.id, "sichuan-upgrading-computer");
      const token = store.createAuthSession(user.id);
      const context = await browser.newContext(mobile ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true,
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1" }
        : { viewport: { width: 1440, height: 1000 } });
      await context.addCookies([{ name: "netwise_session", value: token, url: base }]);
      await context.addInitScript(({ token, version, theme }) => {
        localStorage.setItem("kaojiang-session-token", token);
        localStorage.setItem("kaojiang-theme-mode", theme);
        localStorage.setItem(`netwise-announcement-v${version}`, "seen");
      }, { token, version, theme: engine === "webkit" ? "dark" : "light" });
      // Verify the destination and return flow without placing a real order.
      await context.route("https://catfk.com/**", (route) => {
        assert.equal(route.request().headers().authorization, undefined);
        return route.fulfill({ contentType: "text/html", body: "<title>购买页导航测试</title><p>兑换码购买页测试</p>" });
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(mobile ? `${base}/app/` : `${base}/#vip`);
      if (mobile) await page.getByRole("button", { name: "VIP导航", exact: true }).click();
      const purchase = page.getByRole("link", { name: "购买会员兑换码", exact: true }).first();
      await shop(context, page, purchase);
      assert.equal(store.accountEntitlement(user.id).plan, "free", "opening the shop never activates membership");
      if (mobile) await page.getByRole("button", { name: "使用兑换码开通会员", exact: true }).click();
      else await page.getByRole("button", { name: "已有兑换码，立即兑换", exact: true }).click();
      const code = store.generateMembershipCodes({ plan: "vip", quantity: 1, durationDays: 30 }).codes[0].code;
      const input = page.getByLabel("会员兑换码", { exact: true });
      await input.fill(code);
      const formPurchase = mobile ? page.getByRole("link", { name: "购买会员兑换码", exact: true }).last()
        : page.getByRole("link", { name: "还没有兑换码？前往购买", exact: true });
      await shop(context, page, formPurchase);
      await expect(input).toHaveValue(code);
      await page.getByRole("button", { name: "确认兑换", exact: true }).click();
      await expect(page.getByText("VIP 兑换成功", { exact: true }).filter({ visible: true })).toBeVisible();
      assert.equal(store.accountEntitlement(user.id).plan, "vip");
      if (mobile) await page.getByRole("button", { name: "完成", exact: true }).click();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: `test-output/purchase/${engine}-${mobile ? "mobile" : "desktop"}.png`, fullPage: true });
      await context.close();
      console.log(`${engine} ${mobile ? "mobile" : "desktop"}: purchase in new tab, no automatic entitlement, return and redeem, draft preservation passed`);
    }
    await browser.close(); browser = null;
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close(); await app.locals.stop(); await new Promise((resolve) => server.close(resolve)); store.db.close();
  assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
  assert.ok(path.basename(directory).startsWith("aceexam-purchase-"));
  fs.rmSync(directory, { recursive: true, force: true });
}
