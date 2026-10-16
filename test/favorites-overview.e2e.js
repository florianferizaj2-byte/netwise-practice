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
    path.join(os.tmpdir(), "aceexam-favorites-ui-"),
  ),
  store = createStore(directory);
const user = await store.registerAsync("favorite-ui", "fixture-password-123");
store.selectCertificate(user.id, "network-engineer");
const qs = store
  .allQ()
  .filter(
    (q) =>
      q.type === "single_choice" &&
      hasCertificateQuestion(q, "network-engineer"),
  )
  .slice(0, 12);
assert.equal(qs.length, 12);
for (let i = 0; i < qs.length; i++) {
  store.setQuestionFavorite(user.id, qs[i].id, true);
  store.db
    .prepare(
      "UPDATE question_favorites SET created_at=? WHERE user_id=? AND question_id=?",
    )
    .run(
      `2026-10-${String(i + 1).padStart(2, "0")}T12:00:00.000Z`,
      user.id,
      qs[i].id,
    );
}
const token = store.createAuthSession(user.id),
  app = await createApp({ store, production: true }),
  server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
const errors = [];
try {
  browser = await chromium.launch({
    headless: true,
    proxy: { server: "http://127.0.0.1:9", bypass: "localhost,127.0.0.1" },
  });
  const context = await browser.newContext({
    viewport: { width: 1672, height: 941 },
  });
  await context.addCookies([
    {
      name: "netwise_session",
      value: token,
      url: base,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const version = JSON.parse(
    fs.readFileSync(new URL("../mobile/package.json", import.meta.url)),
  ).version;
  await context.addInitScript(
    (v) => localStorage.setItem("netwise-announcement-v" + v, "seen"),
    version,
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/favorites", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "收藏服务暂时不可用" }),
    }),
  );
  await page.goto(base + "/#favorites", { waitUntil: "networkidle" });
  await expect(page.locator(".favorites-error")).toBeVisible();
  await expect(page.locator(".favorites-banner")).toContainText("—");
  await expect(page.locator(".favorites-view .empty")).toHaveCount(0);
  await page.unroute("**/api/favorites");
  await page.getByRole("button", { name: "重新读取", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "我的收藏", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".favorite-question")).toHaveCount(8);
  assert.equal(
    await page
      .locator(".favorite-question")
      .first()
      .getAttribute("data-favorite-question"),
    qs[11].id,
  );
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.locator(".favorite-question")).toHaveCount(4);
  await page.getByRole("button", { name: "上一页", exact: true }).click();
  await page
    .getByRole("searchbox", { name: "搜索收藏内容" })
    .fill(qs[11].question);
  await expect(page.locator(".favorite-question")).toHaveCount(1);
  await page.getByRole("searchbox", { name: "搜索收藏内容" }).fill("");
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: "test-output/favorites-overview.png",
    fullPage: false,
    animations: "disabled",
  });
  const first = qs[11],
    second = qs[10];
  await page
    .getByRole("checkbox", {
      name: "选择收藏题目：" + first.question,
      exact: true,
    })
    .check();
  await page
    .getByRole("checkbox", {
      name: "选择收藏题目：" + second.question,
      exact: true,
    })
    .check();
  const failing = `**/api/questions/${second.id}/favorite`;
  await page.route(failing, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "收藏服务暂时不可用" }),
    }),
  );
  await page.getByRole("button", { name: "取消收藏", exact: true }).click();
  await expect(page.locator(".favorites-batch")).toContainText("已选 1 题");
  assert(!store.favoriteQuestions(user.id).some((q) => q.id === first.id));
  assert(store.favoriteQuestions(user.id).some((q) => q.id === second.id));
  await page.unroute(failing);
  await page.getByRole("button", { name: "取消收藏", exact: true }).click();
  await expect(page.locator(".favorites-batch")).toContainText("已选 0 题");
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(store.favoriteQuestions(user.id).length, 10);
  for (const width of [375, 768, 1280, 1672]) {
    await page.setViewportSize({ width, height: 941 });
    const sizes = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    assert(sizes.width <= sizes.viewport + 2, JSON.stringify(sizes));
  }
  await page.setViewportSize({ width: 1672, height: 941 });
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "章节练习", exact: true })
    .click();
  await page
    .getByRole("button", { name: /^我的收藏/ })
    .filter({ has: page.locator("svg") })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "我的收藏", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "顺序练习", exact: true }).click();
  await page.getByRole("button", { name: "开始练习", exact: true }).click();
  await expect(page.locator(".question-text")).toBeVisible();
  const currentText = await page.locator(".question-text").textContent();
  const q = store.allQ().find((q) => q.question === currentText);
  assert(q);
  await page
    .locator(".option")
    .filter({
      has: page
        .locator(".option-letter")
        .filter({ hasText: new RegExp("^" + q.answer[0] + "$") }),
    })
    .click();
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await expect(page.locator(".result-block")).toBeVisible();
  assert(store.allA(user.id).some((a) => a.questionId === q.id && a.correct));
  assert.deepEqual(errors, []);
  const report = {
    realAccount: true,
    recency: true,
    pagination: true,
    partialFailureRecovery: true,
    refresh: true,
    actualGrading: true,
    initialFailureRetry: true,
    chapterOverviewEntry: true,
    widths: [375, 768, 1280, 1672],
    errors,
  };
  fs.writeFileSync(
    "test-output/favorites-overview-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  if (browser) await browser.close();
  await app.locals.stop();
  await new Promise((r) => server.close(r));
  store.db.close();
  assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
  assert(path.basename(directory).startsWith("aceexam-favorites-ui-"));
  fs.rmSync(directory, { recursive: true, force: true });
}
