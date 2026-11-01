import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createStore } from "../server/store.js";
import { createApp } from "../server/index.js";
import { hasCertificateQuestion } from "../server/certificates.js";

Object.assign(process.env, {
  ALLOWED_HOSTS: "127.0.0.1,localhost",
  COOKIE_SECURE: "0",
});
const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "aceexam-knowledge-ui-"),
  ),
  store = createStore(directory);
const user = await store.registerAsync("knowledge-ui", "fixture-password-123"),
  peer = await store.registerAsync("knowledge-peer", "fixture-password-123");
for (const u of [user, peer]) store.selectCertificate(u.id, "network-engineer");
store.saveAccountEntitlement(user.id, {
  plan: "vip",
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
});
const question = store
  .allQ()
  .find(
    (q) =>
      hasCertificateQuestion(q, "network-engineer") &&
      q.type === "single_choice",
  );
assert(question);
store.setQuestionFavorite(user.id, question.id, true);
const token = store.createAuthSession(user.id),
  otherToken = store.createAuthSession(peer.id),
  app = await createApp({ store, production: true }),
  server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;
const version = JSON.parse(
  fs.readFileSync(new URL("../mobile/package.json", import.meta.url)),
).version;
fs.mkdirSync("test-output", { recursive: true });
let browser, page;
const checks = [],
  errors = [];
const api = async (url, body, auth = token) => {
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
    } catch {
      /* Initial blank documents have an opaque origin. */
    }
  }, version);
  c.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
  return c;
};
const knowledgeTab = async (p) =>
  p
    .getByRole("navigation", { name: "收藏内容类型" })
    .getByRole("button", { name: /^知识点/ })
    .click();
const list = () => page.getByRole("region", { name: "收藏知识点列表" });
const save = (id) =>
  api("/knowledge-favorites/" + encodeURIComponent(id), { favorite: true });
try {
  browser = await chromium.launch({
    headless: true,
    proxy: { server: "http://127.0.0.1:9", bypass: "localhost,127.0.0.1" },
  });
  const context = await contextFor();
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.route("**/api/knowledge-favorites/*", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "收藏状态暂时不可用" }),
        })
      : route.continue(),
  );
  await page.goto(base + "/#study", { waitUntil: "networkidle" });
  const button = page.locator(".ss-workspace .knowledge-favorite-button");
  await expect(button).toHaveText("重试读取");
  await expect(page.locator(".knowledge-favorite-control")).toContainText(
    "收藏状态暂时不可用",
  );
  assert.equal((await api("/knowledge-favorites")).length, 0);
  await page.unroute("**/api/knowledge-favorites/*");
  await button.click();
  await expect(button).toHaveText("收藏");
  assert.equal(
    (await api("/knowledge-favorites")).length,
    0,
    "read retry must not create a favorite",
  );
  const bodies = [];
  await page.route("**/api/knowledge-favorites/*", async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    bodies.push(route.request().postDataJSON());
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    if (bodies.length === 1) await route.abort("failed");
    else await route.fulfill({ response });
  });
  await button.click();
  await expect(button).toHaveText("重试保存");
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[0], bodies[1]);
  await page.unroute("**/api/knowledge-favorites/*");
  const first = (await api("/knowledge-favorites"))[0];
  assert(first);
  const catalog = (await api("/knowledge-favorites/catalog")).nodes;
  const more = catalog
    .filter((n) => n.id !== first.id && n.lessonNodeId)
    .slice(0, 9);
  for (const item of more) await save(item.id);
  checks.push(
    "initial state errors retry a read; lost save acknowledgements retry the same idempotent write",
  );
  await page.route("**/api/knowledge-favorites", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "知识点列表暂时不可用" }),
    }),
  );
  await page.goto(base + "/#favorites", { waitUntil: "networkidle" });
  await knowledgeTab(page);
  await expect(list().getByRole("alert")).toContainText("知识点列表暂时不可用");
  await expect(
    list().getByText("还没有收藏知识点", { exact: true }),
  ).toHaveCount(0);
  await page.unroute("**/api/knowledge-favorites");
  await list()
    .getByRole("button", { name: "重新读取知识点", exact: true })
    .click();
  await expect(page.locator(".favorite-knowledge")).toHaveCount(8);
  await expect(
    page.getByRole("navigation", { name: "知识点收藏分页" }),
  ).toContainText("1 / 2");
  await page.screenshot({
    path: "test-output/knowledge-favorites-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("navigation", { name: "知识点收藏分页" })
    .getByRole("button", { name: "下一页" })
    .click();
  await expect(page.locator(".favorite-knowledge")).toHaveCount(2);
  await page
    .getByRole("searchbox", { name: "搜索收藏知识点", exact: true })
    .fill("不存在的知识点");
  await expect(
    list().getByText("没有匹配的知识点", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("searchbox", { name: "搜索收藏知识点", exact: true })
    .fill(first.title);
  await expect(page.locator(".favorite-knowledge")).toHaveCount(1);
  await page
    .locator(".favorite-knowledge")
    .getByRole("button", { name: "查看精讲", exact: true })
    .click();
  await expect(
    page.locator(".ss-workspace .knowledge-favorite-button"),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".ss-workspace-title h2")).toHaveText(first.title);
  await page.getByRole("button", { name: "分步互动精讲", exact: true }).click();
  await expect(
    page.locator(".formal-tutor-lesson-heading .knowledge-favorite-button"),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .locator(".formal-tutor-lesson-heading .knowledge-favorite-button")
    .click();
  await expect(
    page.locator(".formal-tutor-lesson-heading .knowledge-favorite-button"),
  ).toHaveAttribute("aria-pressed", "false");
  assert.equal((await api("/knowledge-favorites")).length, 9);
  checks.push(
    "real count, pagination, search and exact lesson navigation work; text and interactive tutors share the favorite state",
  );
  await save(first.id);
  const other = await contextFor(),
    p2 = await other.newPage();
  await p2.goto(base + "/#favorites", { waitUntil: "networkidle" });
  await knowledgeTab(p2);
  await expect(p2.locator(".favorite-knowledge")).toHaveCount(8);
  await other.close();
  const different = await contextFor(otherToken),
    p3 = await different.newPage();
  await p3.goto(base + "/#favorites", { waitUntil: "networkidle" });
  await knowledgeTab(p3);
  await expect(p3.getByText("还没有收藏知识点", { exact: true })).toBeVisible();
  await different.close();
  checks.push(
    "a new browser restores server favorites and another account has an independent empty list",
  );
  await page.goto(base + "/#favorites", { waitUntil: "networkidle" });
  await knowledgeTab(page);
  for (const width of [320, 375, 768, 900, 1280, 1672]) {
    await page.setViewportSize({ width, height: 941 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      )
      .toBeLessThanOrEqual(2);
  }
  await page.setViewportSize({ width: 375, height: 941 });
  await page.screenshot({
    path: "test-output/knowledge-favorites-narrow-web.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1672, height: 941 });
  await page
    .getByRole("checkbox", { name: "选择本页知识点", exact: true })
    .check();
  let deletes = 0;
  await page.route("**/api/knowledge-favorites/*", async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    deletes++;
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    if (deletes === 3)
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "本次更新暂时中断" }),
      });
    else await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "取消所选收藏", exact: true }).click();
  await expect(page.locator(".favorite-knowledge")).toHaveCount(7);
  assert.equal(
    (await api("/knowledge-favorites")).length,
    7,
    "three committed removals are reflected despite the third response failing",
  );
  await page.unroute("**/api/knowledge-favorites/*");
  await page.getByRole("button", { name: "取消所选收藏", exact: true }).click();
  await expect(page.locator(".favorite-knowledge")).toHaveCount(2);
  await page
    .getByRole("checkbox", { name: "选择本页知识点", exact: true })
    .check();
  await page.getByRole("button", { name: "取消所选收藏", exact: true }).click();
  await expect(
    list().getByText("还没有收藏知识点", { exact: true }),
  ).toBeVisible();
  checks.push(
    "all six widths fit; batch removal reflects partial commits and can finish from recovered server state",
  );
  await page
    .getByRole("combobox", { name: "切换备考目标", exact: true })
    .selectOption("sichuan-upgrading-computer");
  await expect(page.locator(".blue-home")).toBeVisible();
  const sc = (await api("/knowledge-favorites/catalog")).nodes.find(
    (n) => n.kind === "lesson" && n.available,
  );
  assert(sc);
  await save(sc.id);
  await page.goto(base + "/#favorites", { waitUntil: "networkidle" });
  await knowledgeTab(page);
  await expect(page.locator(".favorite-knowledge")).toHaveCount(1);
  await expect(page.locator(".favorite-knowledge h2")).toHaveText(sc.title);
  await page
    .locator(".favorite-knowledge")
    .getByRole("button", { name: "查看精讲", exact: true })
    .click();
  await expect(page.locator(".ss-current-sublesson")).toContainText(sc.title);
  await expect(
    page.locator(".ss-workspace .knowledge-favorite-button"),
  ).toHaveAttribute("aria-pressed", "true");
  store.saveAccountEntitlement(user.id, { plan: "free", expiresAt: null });
  await page.goto(base + "/#favorites", { waitUntil: "networkidle" });
  await knowledgeTab(page);
  await expect(page.locator(".favorite-knowledge")).toHaveCount(1);
  await page
    .locator(".favorite-knowledge")
    .getByRole("button", { name: "查看精讲", exact: true })
    .click();
  await expect(page.locator(".ss-gate")).toContainText("VIP 专属");
  checks.push(
    "certificate switching retains each list separately; Sichuan favorites open the exact sublesson and do not bypass expired membership",
  );
  await page
    .getByRole("combobox", { name: "切换备考目标", exact: true })
    .selectOption("network-engineer");
  await expect(page.locator(".blue-home")).toBeVisible();
  await page.goto(base + "/#favorites", { waitUntil: "networkidle" });
  await expect(page.locator(".favorite-question")).toHaveCount(1);
  await page.getByRole("button", { name: "开始练习", exact: true }).click();
  await expect(page.locator(".question-text")).toContainText(question.question);
  for (const key of question.answer)
    await page
      .locator(".option")
      .filter({
        has: page
          .locator(".option-letter")
          .filter({ hasText: new RegExp("^" + key + "$") }),
      })
      .click();
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await expect(page.locator(".result-block")).toContainText("回答正确");
  checks.push(
    "question favorites and the original trusted practice grading stay intact",
  );
  await page
    .getByRole("combobox", { name: "切换备考目标", exact: true })
    .selectOption("hcia-datacom");
  await expect(page.locator(".blue-home")).toBeVisible();
  await page.goto(base + "/#favorites", { waitUntil: "networkidle" });
  await knowledgeTab(page);
  await expect(
    list().getByText("当前证书暂未开放知识目录", { exact: true }),
  ).toBeVisible();
  await list()
    .getByRole("button", { name: "前往章节练习", exact: true })
    .click();
  await expect(page.locator(".blue-catalog")).toBeVisible();
  checks.push(
    "certificates without a knowledge catalog show their actual availability and retain the chapter practice path",
  );
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "test-output/knowledge-favorites-report.json",
    JSON.stringify(
      {
        runAt: new Date().toISOString(),
        passed: true,
        checks,
        widths: [320, 375, 768, 900, 1280, 1672],
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
        path: "test-output/knowledge-favorites-failure.png",
        fullPage: true,
      })
      .catch(() => {});
  fs.writeFileSync(
    "test-output/knowledge-favorites-report.json",
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
  assert(path.basename(directory).startsWith("aceexam-knowledge-ui-"));
  fs.rmSync(directory, { recursive: true, force: true });
}
