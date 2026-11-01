import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createApp } from "../server/index.js";
import { createStore } from "../server/store.js";

Object.assign(process.env, {
  ALLOWED_HOSTS: "127.0.0.1,localhost",
  COOKIE_SECURE: "0",
});
const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "aceexam-blue-member-"),
);
const store = createStore(directory);
await store.registerAsync("member-admin", "fixture-password-123");
const user = await store.registerAsync(
  "member-learner",
  "fixture-password-123",
);
store.selectCertificate(user.id, "network-engineer");
const token = store.createAuthSession(user.id);
const app = await createApp({ store, production: true });
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;
const version = JSON.parse(
  fs.readFileSync("mobile/package.json", "utf8"),
).version;
fs.mkdirSync("test-output", { recursive: true });
const checks = [],
  errors = [];
let browser, page;
const appearance = async (theme, reducedMotion = false) => {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const current = await fetch(base + "/api/web-preferences", { headers }).then(
    (r) => r.json(),
  );
  const r = await fetch(base + "/api/web-preferences", {
    method: "PUT",
    headers,
    body: JSON.stringify({
      requestId: crypto.randomUUID(),
      version: current.version,
      certificateId: current.certificateId,
      values: { ...current.values, theme, reducedMotion },
    }),
  });
  assert.equal(r.status, 200, await r.text());
};
try {
  browser = await chromium.launch({
    headless: true,
    proxy: { server: "http://127.0.0.1:9", bypass: "localhost,127.0.0.1" },
  });
  const context = await browser.newContext({
    viewport: { width: 1672, height: 941 },
  });
  await context.addCookies([
    { name: "netwise_session", value: token, url: base, httpOnly: true },
  ]);
  await context.addInitScript(
    (v) => localStorage.setItem("netwise-announcement-v" + v, "seen"),
    version,
  );
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/#vip", { waitUntil: "networkidle" });
  await expect(page.locator(".vip-plan")).toHaveCount(3);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const tier of ["vip", "svip", "ssvip"]) {
    const card = page.locator(".vip-plan.vip-tone-" + tier);
    await expect(card.locator("[data-tier-art]")).toHaveAttribute(
      "data-tier-art",
      tier,
    );
    await card.hover();
    assert(
      await card
        .locator(".membership-tier-art")
        .evaluate((el) =>
          el
            .getAnimations({ subtree: true })
            .some((a) => a.playState === "running"),
        ),
    );
    await card.click();
    await expect(card.locator("input")).toBeChecked();
    await expect(
      page.locator(".vip-selected-plan [data-tier-art]"),
    ).toHaveAttribute("data-tier-art", tier);
    assert.equal(store.accountEntitlement(user.id).plan, "free");
  }
  const ids = await page
    .locator(".vip-page svg [id]")
    .evaluateAll((els) => els.map((el) => el.id));
  assert.equal(ids.length, new Set(ids).size);
  await page.locator('.vip-plan input[value="vip"]').focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('.vip-plan input[value="svip"]')).toBeChecked();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('.vip-plan input[value="ssvip"]')).toBeChecked();
  await expect(
    page.getByRole("link", { name: "购买会员兑换码", exact: true }),
  ).toHaveAttribute("href", "https://catfk.com/shop/aceexam");
  checks.push(
    "three fixed tier illustrations, independent motion, unique SVG IDs, keyboard selection and synchronized summary; selection grants no entitlement",
  );

  await page.getByLabel("会员兑换码", { exact: true }).fill("INVALID-CODE");
  await page.getByRole("button", { name: "确认兑换", exact: true }).click();
  await expect(page.locator("#vip-redeem-error")).toBeVisible();
  assert.equal(store.accountEntitlement(user.id).plan, "free");
  const code = store.generateMembershipCodes({
    plan: "vip",
    quantity: 1,
    durationDays: 30,
  }).codes[0].code;
  await page.getByLabel("会员兑换码", { exact: true }).fill(code);
  await page.getByRole("button", { name: "确认兑换", exact: true }).click();
  await expect(page.getByText("VIP 兑换成功", { exact: true })).toBeVisible();
  assert.equal(store.accountEntitlement(user.id).plan, "vip");
  await expect(
    page.getByRole("button", { name: "进入学习与练习", exact: true }),
  ).toBeVisible();
  await page.locator(".vip-history > summary").click();
  await expect(page.locator(".vip-history li")).toHaveCount(1);
  checks.push(
    "invalid codes do not activate membership; a real fixture code updates entitlements, plan selection and redemption history",
  );

  for (const theme of ["light", "dark"]) {
    await appearance(theme);
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator("html")).toHaveAttribute("data-web-theme", theme);
    for (const width of [320, 375, 768, 900, 1280, 1672]) {
      await page.setViewportSize({ width, height: 941 });
      await expect
        .poll(
          () =>
            page.evaluate(
              () => document.documentElement.scrollWidth - innerWidth,
            ),
          { message: `${theme}/${width}` },
        )
        .toBeLessThanOrEqual(2);
      const over = await page
        .locator(".vip-plan,.vip-plan-choice,.vip-redemption")
        .evaluateAll((els) =>
          els
            .filter((el) => el.scrollWidth > el.clientWidth + 2)
            .map((el) => el.className),
        );
      assert.deepEqual(over, [], `${theme}/${width} card overflow`);
      if (width === 1672 || width === 375)
        await page.screenshot({
          path: `test-output/blue-membership-${theme}-${width}.png`,
          fullPage: true,
          animations: "disabled",
        });
    }
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator(".vip-plan").first().hover();
  assert.equal(
    await page
      .locator(".vip-plan")
      .first()
      .evaluate((el) => el.getAnimations({ subtree: true }).length),
    0,
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await appearance("light", true);
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("html")).toHaveAttribute(
    "data-web-reduced-motion",
    "true",
  );
  await page.locator(".vip-plan").first().hover();
  await expect(page.locator(".vip-plan").first()).toHaveCSS(
    "transform",
    "none",
  );
  assert.equal(
    await page
      .locator(".vip-plan")
      .first()
      .evaluate((el) => el.getAnimations({ subtree: true }).length),
    0,
  );
  checks.push(
    "six Web widths, light and dark account appearance, OS and saved reduced-motion preferences",
  );
  store.saveAccountEntitlement(user.id, {
    plan: "vip",
    expiresAt: new Date(Date.now() - 86400000).toISOString(),
  });
  await page
    .getByRole("button", { name: "刷新会员权益与额度", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "开通 VIP 后学习", exact: true }),
  ).toBeVisible();
  assert.equal(store.accountEntitlement(user.id).plan, "free");
  checks.push("expiry refresh restores the real free-account learning gate");
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "test-output/blue-membership-report.json",
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
  console.log(JSON.stringify({ passed: true, checks }));
} catch (e) {
  await page
    ?.screenshot({
      path: "test-output/blue-membership-failure.png",
      fullPage: true,
    })
    .catch(() => {});
  fs.writeFileSync(
    "test-output/blue-membership-report.json",
    JSON.stringify(
      {
        passed: false,
        checks,
        pageErrors: errors,
        error: String(e),
        text: await page
          ?.locator("body")
          .innerText()
          .catch(() => ""),
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
  assert(path.basename(directory).startsWith("aceexam-blue-member-"));
  fs.rmSync(directory, { recursive: true, force: true });
}
