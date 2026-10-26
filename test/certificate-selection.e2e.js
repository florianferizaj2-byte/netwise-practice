import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createStore } from "../server/store.js";
import { createApp } from "../server/index.js";
import { certificates } from "../server/certificates.js";
import { practiceStorageKey } from "../src/practice-progress.js";

Object.assign(process.env, {
  ALLOWED_HOSTS: "127.0.0.1,localhost",
  COOKIE_SECURE: "0",
});
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aceexam-cert-ui-"));
const store = createStore(directory);
await store.registerAsync("cert-admin", "fixture-password-123");
const user = await store.registerAsync("cert-learner", "fixture-password-123");
const newcomer = await store.registerAsync(
  "cert-newcomer",
  "fixture-password-123",
);
store.selectCertificate(user.id, "sichuan-upgrading-computer");
const token = store.createAuthSession(user.id),
  newToken = store.createAuthSession(newcomer.id);
const app = await createApp({ store, production: true }),
  server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;
const version = JSON.parse(
  fs.readFileSync("mobile/package.json", "utf8"),
).version;
fs.mkdirSync("test-output", { recursive: true });
let browser, page;
const checks = [],
  errors = [];
const headers = (auth = token) => ({
  Authorization: `Bearer ${auth}`,
  "Content-Type": "application/json",
});
const me = async (auth = token) =>
  fetch(base + "/api/auth/me", { headers: headers(auth) }).then((r) =>
    r.json(),
  );
const contextFor = async (auth = token) => {
  const c = await browser.newContext({
    viewport: { width: 1672, height: 941 },
  });
  await c.addCookies([
    { name: "netwise_session", value: auth, url: base, httpOnly: true },
  ]);
  await c.addInitScript((v) => {
    try {
      localStorage.setItem("netwise-announcement-v" + v, "seen");
    } catch {}
  }, version);
  c.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
  return c;
};
const card = (p, id) =>
  p
    .locator(".blue-cert-card")
    .filter({ has: p.locator(`input[value="${id}"]`) });
const browse = async (p) => {
  await p
    .locator(".topbar")
    .getByRole("button", { name: "浏览考试与证书", exact: true })
    .click();
  await expect(p.locator(".blue-certificates")).toBeVisible();
};
const change = async (id, destination = "进入学习") => {
  await card(page, id).click();
  await page
    .locator(".blue-cert-preview")
    .getByRole("button", { name: destination, exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "切换备考目标", exact: true }),
  ).toHaveValue(id);
  await expect(page.locator(".blue-certificates")).toHaveCount(0);
};
try {
  browser = await chromium.launch({
    headless: true,
    proxy: { server: "http://127.0.0.1:9", bypass: "localhost,127.0.0.1" },
  });
  const nc = await contextFor(newToken),
    np = await nc.newPage();
  let writes = 0;
  np.on("request", (r) => {
    if (r.method() === "PUT" && r.url().endsWith("/api/auth/certificate"))
      writes++;
  });
  await np.goto(base + "/#home", { waitUntil: "networkidle" });
  await expect(
    np.getByRole("heading", { name: "选择备考目标", exact: true }),
  ).toBeVisible();
  await expect(np.locator(".blue-cert-card")).toHaveCount(certificates.length);
  await card(np, "ncre-ms-office").click();
  assert.equal((await me(newToken)).user.certificateId, null);
  assert.equal(writes, 0, "preview selection must not activate a certificate");
  await np.route("**/api/auth/certificate", async (route) => {
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    await route.abort("failed");
  });
  await np.getByRole("button", { name: "进入学习", exact: true }).click();
  await expect(np.locator(".blue-home")).toBeVisible();
  assert.equal((await me(newToken)).user.certificateId, "ncre-ms-office");
  assert.equal(
    writes,
    1,
    "lost acknowledgement is confirmed by reading auth, not a repeated write",
  );
  await nc.close();
  checks.push(
    "onboarding shows only six installed certificates; preview makes no mutation and a lost acknowledgement recovers the committed target",
  );

  const c = await contextFor();
  page = await c.newPage();
  page.setDefaultTimeout(15000);
  const banks = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/questions") banks.push(r.url());
  });
  await page.goto(base + "/#certificates", { waitUntil: "networkidle" });
  await expect(page.locator(".blue-cert-card")).toHaveCount(certificates.length);
  assert.deepEqual(
    banks,
    [],
    "browsing certificate metadata must not download the full question bank",
  );
  await expect(page.locator('input[value="software-designer"]')).toHaveCount(0);
  await page
    .getByRole("searchbox", { name: "搜索考试、证书或科目", exact: true })
    .fill("ＥＸＣＥＬ");
  await expect(page.locator(".blue-cert-card")).toHaveCount(1);
  await expect(page.locator(".blue-cert-card")).toContainText("NCRE");
  await page
    .getByRole("searchbox", { name: "搜索考试、证书或科目", exact: true })
    .fill("<img src=x onerror=alert(1)>");
  await expect(page.locator(".blue-cert-empty")).toBeVisible();
  await page.getByRole("button", { name: "清除筛选", exact: true }).click();
  await page
    .getByRole("combobox", { name: "按备考地区筛选", exact: true })
    .selectOption("sichuan");
  await expect(page.locator(".blue-cert-card")).toHaveCount(1);
  await page
    .getByRole("combobox", { name: "按备考地区筛选", exact: true })
    .selectOption("all");
  await card(page, "network-engineer").locator("input").focus();
  await page.keyboard.press("ArrowRight");
  await expect(card(page, "hcia-datacom").locator("input")).toBeChecked();
  assert.equal((await me()).user.certificateId, "sichuan-upgrading-computer");
  for (const id of [
    "network-engineer",
    "hcia-datacom",
    "ncre-ms-office",
    "sichuan-upgrading-computer",
    "ncre-l2-c-programming",
  ]) {
    await card(page, id).hover();
    assert(
      await card(page, id).evaluate((el) =>
        el
          .getAnimations({ subtree: true })
          .some((a) => a.playState === "running"),
      ),
    );
  }
  checks.push(
    "real catalogue only, aliases and Unicode search, safe empty state, region filter, keyboard preview and non-veterinary artwork motion",
  );

  for (const id of [
    "network-engineer",
    "hcia-datacom",
    "ncre-ms-office",
    "veterinary-practitioner",
    "sichuan-upgrading-computer",
    "ncre-l2-c-programming",
  ]) {
    await change(id, "章节练习");
    assert.equal((await me()).user.certificateId, id);
    await expect(page.locator(".blue-catalog")).toBeVisible();
    await expect(page.locator(".blue-start-practice")).toBeEnabled();
    await browse(page);
  }
  checks.push(
    "all six existing certificates, including veterinary and C, switch through the real service into their chapter entry",
  );
  await change("sichuan-upgrading-computer");
  await browse(page);
  await page
    .locator(".blue-cert-preview")
    .getByRole("button", { name: "章节练习", exact: true })
    .click();
  await expect(page.locator(".blue-catalog")).toBeVisible();
  await page.getByRole("button", { name: "开始练习", exact: true }).click();
  await expect(page.locator(".question-text")).toBeVisible();
  await page.locator(".option").first().click();
  const key = practiceStorageKey(user.id, "sichuan-upgrading-computer");
  await expect
    .poll(() =>
      page.evaluate(
        (k) => !!JSON.parse(localStorage.getItem(k))?.responses,
        key,
      ),
    )
    .toBe(true);
  await browse(page);
  const draft = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)),
    key,
  );
  assert(draft?.questionIds.length && Object.keys(draft.responses).length);
  await change("network-engineer");
  await browse(page);
  await change("sichuan-upgrading-computer");
  assert.deepEqual(
    await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key),
    draft,
  );
  checks.push(
    "ordinary practice drafts remain intact across preview, another certificate, and return to the original target",
  );

  await browse(page);
  await page.route("**/api/auth/certificate", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "切换服务暂时不可用" }),
    }),
  );
  await card(page, "network-engineer").click();
  await page
    .locator(".blue-cert-preview")
    .getByRole("button", { name: "进入学习", exact: true })
    .click();
  await expect(page.locator(".blue-cert-error")).toBeVisible();
  assert.equal((await me()).user.certificateId, "sichuan-upgrading-computer");
  await page.unroute("**/api/auth/certificate");
  await page.route("**/api/auth/certificate", async (route) => {
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    await route.abort("failed");
  });
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "状态暂时不可用" }),
    }),
  );
  await page
    .locator(".blue-cert-preview")
    .getByRole("button", { name: "进入学习", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("暂时无法确认切换结果");
  await expect(
    page.locator(".blue-certificates,.blue-home,.question-text"),
  ).toHaveCount(0);
  await page.unroute("**/api/auth/certificate");
  await page.unroute("**/api/auth/me");
  await page.getByRole("button", { name: "重新加载", exact: true }).click();
  await expect(page.locator(".blue-certificates")).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "切换备考目标", exact: true }),
  ).toHaveValue("network-engineer");
  assert.equal((await me()).user.certificateId, "network-engineer");
  checks.push(
    "definite failure keeps the old target; an unconfirmed server switch hides stale workspace data until authoritative reload",
  );

  for (const theme of ["light", "dark"]) {
    const current = await fetch(base + "/api/web-preferences", {
      headers: headers(),
    }).then((r) => r.json());
    const saved = await fetch(base + "/api/web-preferences", {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({
        version: current.version,
        requestId: crypto.randomUUID(),
        certificateId: current.certificateId,
        values: { ...current.values, theme },
      }),
    });
    assert.equal(saved.status, 200);
    await page.goto(base + "/#certificates", { waitUntil: "networkidle" });
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator("html")).toHaveAttribute("data-web-theme", theme);
    for (const width of [320, 375, 768, 900, 1280, 1672]) {
      await page.setViewportSize({ width, height: 941 });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth - innerWidth,
          ),
        )
        .toBeLessThanOrEqual(2);
      const over = await page
        .locator(".blue-cert-card,.blue-cert-preview,.blue-cert-searchbar")
        .evaluateAll((els) =>
          els
            .filter((el) => el.scrollWidth > el.clientWidth + 2)
            .map((el) => el.className),
        );
      assert.deepEqual(over, [], `${theme}/${width}`);
      if (width === 1672 || width === 375)
        await page.screenshot({
          path: `test-output/certificate-selection-${theme}-${width}.png`,
          fullPage: true,
          animations: "disabled",
        });
    }
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await card(page, "network-engineer").hover();
  assert.equal(
    await card(page, "network-engineer").evaluate(
      (el) => el.getAnimations({ subtree: true }).length,
    ),
    0,
  );
  const ids = await page
    .locator(".blue-certificates svg [id]")
    .evaluateAll((els) => els.map((el) => el.id));
  assert.equal(new Set(ids).size, ids.length);
  checks.push(
    "six Web widths, saved light and dark theme, reduced motion and unique SVG identifiers",
  );
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "test-output/certificate-selection-report.json",
    JSON.stringify(
      {
        passed: true,
        runAt: new Date().toISOString(),
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
      path: "test-output/certificate-selection-failure.png",
      fullPage: true,
    })
    .catch(() => {});
  fs.writeFileSync(
    "test-output/certificate-selection-report.json",
    JSON.stringify(
      { passed: false, checks, pageErrors: errors, error: String(e) },
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
  assert(path.basename(directory).startsWith("aceexam-cert-ui-"));
  fs.rmSync(directory, { recursive: true, force: true });
}
