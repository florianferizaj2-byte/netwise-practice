import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createStore } from "../server/store.js";
import { createApp } from "../server/index.js";
import { planToday } from "../server/learning-plan.js";

Object.assign(process.env, {
  ALLOWED_HOSTS: "127.0.0.1,localhost",
  COOKIE_SECURE: "0",
});
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aceexam-plan-ui-")),
  store = createStore(directory);
const user = await store.registerAsync("plan-ui", "fixture-password-123");
store.selectCertificate(user.id, "network-engineer");
const token = store.createAuthSession(user.id),
  app = await createApp({ store, production: true }),
  server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;
fs.mkdirSync("test-output", { recursive: true });
const version = JSON.parse(
  fs.readFileSync(new URL("../mobile/package.json", import.meta.url)),
).version;
const errors = [],
  checks = [];
let browser, page;
const api = async (url, body, auth = token) => {
  const r = await fetch(base + "/api" + url, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${auth}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal(r.status, 200, await r.clone().text());
  return r.json();
};
const contextFor = async (auth = token, width = 1672) => {
  const context = await browser.newContext({
    viewport: { width, height: 941 },
  });
  await context.addCookies([
    {
      name: "netwise_session",
      value: auth,
      url: base,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await context.addInitScript(
    (v) => localStorage.setItem("netwise-announcement-v" + v, "seen"),
    version,
  );
  return context;
};
const answer = async (page, q, selected = q.answer) => {
  for (const key of selected)
    await page
      .locator(".option")
      .filter({
        has: page
          .locator(".option-letter")
          .filter({ hasText: new RegExp("^" + key + "$") }),
      })
      .click();
  await page.getByRole("button", { name: /^提交(?:答案|本题)$/ }).click();
};
try {
  browser = await chromium.launch({
    headless: true,
    proxy: { server: "http://127.0.0.1:9", bypass: "localhost,127.0.0.1" },
  });
  const context = await contextFor();
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/learning-plan", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "计划服务暂时不可用" }),
    }),
  );
  await page.goto(base + "/#plan", { waitUntil: "networkidle" });
  await expect(page.locator(".lp-error")).toContainText("计划服务暂时不可用");
  await expect(page.locator(".lp-banner")).toHaveCount(0);
  await expect(page.locator(".lp-empty")).toHaveCount(0);
  await page.unroute("**/api/learning-plan");
  await page.getByRole("button", { name: "重新读取", exact: true }).click();
  await expect(page.locator(".lp-empty")).toBeVisible();
  checks.push("initial API failure and retry without fabricated progress");

  await page
    .getByRole("button", { name: "建立我的学习计划", exact: true })
    .click();
  await page.getByLabel("计划周期", { exact: true }).selectOption("1");
  const createBodies = [];
  await page.route("**/api/learning-plan", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    createBodies.push(route.request().postDataJSON());
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    if (createBodies.length === 1) await route.abort("failed");
    else await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "保存安排", exact: true }).click();
  await expect(page.locator(".lp-form-error")).toBeVisible();
  await page.getByRole("button", { name: "保存安排", exact: true }).click();
  await expect(page.locator(".lp-dialog")).not.toBeVisible();
  assert.equal(createBodies.length, 2);
  assert.deepEqual(createBodies[0], createBodies[1]);
  assert.equal(
    store.db
      .prepare("SELECT count(*) n FROM user_learning_plans WHERE user_id=?")
      .get(user.id).n,
    1,
  );
  await page.unroute("**/api/learning-plan");
  await expect(page.locator(".lp-banner")).toContainText("1 周章节复习计划");
  const initial = (await api("/learning-plan")).plan;
  assert.equal(initial.tasks.length, 7);
  await expect(page.locator(".lp-task")).toHaveCount(1);
  checks.push("create acknowledgement loss retries the same operation");

  await page.getByRole("button", { name: "添加任务", exact: true }).click();
  await page.getByLabel("本次题量", { exact: true }).fill("2");
  const addBodies = [];
  await page.route("**/api/learning-plan/tasks", async (route) => {
    addBodies.push(route.request().postDataJSON());
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    if (addBodies.length === 1)
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "网关响应暂时中断" }),
      });
    else await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "保存安排", exact: true }).click();
  await expect(page.locator(".lp-form-error")).toBeVisible();
  await page.getByRole("button", { name: "保存安排", exact: true }).click();
  await expect(page.locator(".lp-dialog")).not.toBeVisible();
  assert.deepEqual(addBodies[0], addBodies[1]);
  await page.unroute("**/api/learning-plan/tasks");
  const plan = (await api("/learning-plan")).plan,
    task = plan.tasks.at(-1);
  assert.equal(plan.tasks.length, 8);
  assert.equal(task.count, 2);
  checks.push("custom task acknowledgement loss adds one task");
  await page
    .locator(`[data-plan-task="${task.id}"]`)
    .getByRole("button", { name: "开始练习", exact: true })
    .click();
  await expect(page.locator(".question-text")).toBeVisible();
  const text = await page.locator(".question-text").textContent();
  const q = store.allQ().find((q) => q.question === text);
  assert(q);
  const privatePlan = JSON.parse(
    store.db
      .prepare("SELECT data FROM user_learning_plans WHERE id=?")
      .get(plan.id).data,
  );
  const ids = privatePlan.tasks.find((t) => t.id === task.id).questionIds;
  assert.equal(q.id, ids[0]);
  const second = store.getQ(ids[1]);
  let lostAttempt = false;
  await page.route("**/api/attempts", async (route) => {
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    assert.equal(route.request().postDataJSON().planTask.taskId, task.id);
    lostAttempt = true;
    await route.abort("failed");
  });
  await answer(page, q);
  await expect.poll(() => lostAttempt).toBe(true);
  // The newer practice flow grades from the prefetched reveal immediately,
  // but a lost acknowledgement must remain visibly unsynced, never "saved".
  await expect(page.locator(".result-block")).toBeVisible();
  await expect(page.locator(".practice-save-status")).toContainText("尚未保存到账号");
  await expect(page.getByRole("button", { name: "重试保存", exact: true })).toBeVisible();
  assert.equal(store.allA(user.id).length, 1);
  assert.equal((await api("/learning-plan")).plan.tasks.at(-1).answered, 1);
  await page.unroute("**/api/attempts");
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(".question-text")).toHaveText(second.question);
  await expect(page.locator(".result-block")).toHaveCount(0);
  assert.equal(store.allA(user.id).length, 1);
  checks.push(
    "lost answer acknowledgement restores trusted progress after refresh",
  );
  const wrong =
    second.answer.length === 1
      ? [Object.keys(second.options).find((k) => !second.answer.includes(k))]
      : [second.answer[0]];
  await answer(page, second, wrong);
  await expect(page.locator(".result-block")).toBeVisible();
  assert.equal(store.allA(user.id).length, 2);
  assert.equal(
    store.allA(user.id).find((a) => a.questionId === second.id).correct,
    false,
  );
  assert(store.wrongQuestions(user.id).some((q) => q.id === second.id));
  await page.getByRole("button", { name: "返回学习计划", exact: true }).click();
  await expect(page.locator(`[data-plan-task="${task.id}"]`)).toContainText(
    "已答 2 / 2 题",
  );
  await expect(page.locator(`[data-plan-task="${task.id}"]`)).toHaveClass(
    /complete/,
  );
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(`[data-plan-task="${task.id}"]`)).toHaveClass(
    /complete/,
  );
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: "test-output/learning-plan-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  checks.push(
    "correct and wrong grades update real task completion and wrong-answer records",
  );

  await page
    .locator(`[data-plan-task="${task.id}"]`)
    .getByRole("button", { name: "取消任务", exact: true })
    .click();
  await expect(page.locator(`[data-plan-task="${task.id}"]`)).toHaveClass(
    /canceled/,
  );
  await page
    .locator(`[data-plan-task="${task.id}"]`)
    .getByRole("button", { name: "恢复任务", exact: true })
    .click();
  await expect(page.locator(`[data-plan-task="${task.id}"]`)).toHaveClass(
    /complete/,
  );
  checks.push("cancel and restore preserve submitted answers");
  const widths = [];
  for (const width of [320, 375, 768, 1280, 1672]) {
    await page.setViewportSize({ width, height: 941 });
    await expect(page.locator(".app-shell.desk-workspace")).toHaveCount(
      width >= 900 ? 1 : 0,
    );
    await expect(page.locator(".lp-days button")).toHaveCount(7);
    await expect(page.locator(".lp-route")).toBeVisible();
    await expect(page.locator(".lp-tasks footer span")).toBeVisible();
    const sizes = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    if (sizes.width > sizes.viewport + 2) {
      const elements = await page.evaluate(() =>
        [...document.querySelectorAll("body *")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.right > innerWidth + 2 && r.width > 0;
          })
          .map((el) => ({
            tag: el.tagName,
            class: el.className,
            width: el.getBoundingClientRect().width,
            right: el.getBoundingClientRect().right,
            text: el.textContent?.slice(0, 70),
          })),
      );
      fs.writeFileSync(
        "test-output/learning-plan-overflow.json",
        JSON.stringify(elements, null, 2),
      );
    }
    assert(sizes.width <= sizes.viewport + 2, JSON.stringify(sizes));
    widths.push(width);
  }
  await page.setViewportSize({ width: 375, height: 844 });
  await page.getByRole("button", { name: "添加任务", exact: true }).click();
  await expect(page.locator(".lp-dialog")).toBeVisible();
  const modalSize = await page
    .locator(".lp-dialog")
    .evaluate((el) => ({ width: el.scrollWidth, client: el.clientWidth }));
  assert(modalSize.width <= modalSize.client + 2);
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.screenshot({
    path: "test-output/learning-plan-narrow-web.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .locator(`[data-plan-task="${task.id}"]`)
    .getByRole("button", { name: "回顾本次作答", exact: true })
    .click();
  await expect(page.locator(".result-block")).toBeVisible();
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(".result-block")).toBeVisible();
  assert.equal(store.allA(user.id).length, 2);
  await page.getByRole("button", { name: "返回学习计划", exact: true }).click();
  checks.push(
    "narrow Web restores linked practice and all responsive widths fit",
  );

  const fresh = await contextFor(),
    newPage = await fresh.newPage();
  newPage.on("pageerror", (e) => errors.push(e.message));
  await newPage.goto(base + "/#plan", { waitUntil: "networkidle" });
  await newPage
    .locator(`[data-plan-task="${task.id}"]`)
    .getByRole("button", { name: "回顾本次作答", exact: true })
    .click();
  await expect(newPage.locator(".result-block")).toBeVisible();
  assert.equal(store.allA(user.id).length, 2);
  await fresh.close();
  checks.push("fresh browser restores grades without local progress");

  await page.setViewportSize({ width: 1672, height: 941 });
  await page.getByRole("button", { name: "调整计划", exact: true }).click();
  await page.getByLabel("计划周期", { exact: true }).selectOption("2");
  await page.getByLabel("每日章节题量", { exact: true }).selectOption("20");
  await page.getByRole("button", { name: "保存安排", exact: true }).click();
  await expect(page.locator(".lp-dialog")).not.toBeVisible();
  await expect(page.locator(".lp-banner")).toContainText("2 周章节复习计划");
  const next = (await api("/learning-plan")).plan;
  assert.notEqual(next.id, plan.id);
  assert.equal(next.tasks.filter((t) => t.kind === "chapter").length, 14);
  assert(next.tasks.some((t) => t.kind === "wrong"));
  assert.equal(
    store.db
      .prepare("SELECT active FROM user_learning_plans WHERE id=?")
      .get(plan.id).active,
    0,
  );
  assert.equal(
    store.db
      .prepare(
        "SELECT count(*) n FROM learning_plan_submissions WHERE plan_id=?",
      )
      .get(plan.id).n,
    2,
  );
  await page.getByRole("button", { name: "上一周", exact: true }).click();
  await expect(page.locator(".lp-no-tasks")).toBeVisible();
  await page.getByRole("button", { name: "添加一项练习", exact: true }).click();
  await expect(page.getByLabel("任务日期", { exact: true })).toHaveValue(
    next.startDate,
  );
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  checks.push(
    "adjustment archives existing progress and out-of-range additions default to a valid date",
  );

  const other = await store.registerAsync(
    "plan-other-ui",
    "fixture-password-123",
  );
  store.selectCertificate(other.id, "network-engineer");
  const isolated = await contextFor(store.createAuthSession(other.id)),
    isolatedPage = await isolated.newPage();
  await isolatedPage.goto(base + "/#plan", { waitUntil: "networkidle" });
  await expect(isolatedPage.locator(".lp-empty")).toBeVisible();
  await expect(isolatedPage.locator(".lp-banner")).toHaveCount(0);
  await isolated.close();
  checks.push("another real account receives an empty plan");

  const vet = await store.registerAsync("plan-vet-ui", "fixture-password-123");
  store.selectCertificate(vet.id, "veterinary-practitioner");
  const vetToken = store.createAuthSession(vet.id);
  const vetPlan = await api(
    "/learning-plan",
    {
      requestId: crypto.randomUUID(),
      expectedPlanId: null,
      revision: 0,
      startDate: planToday(),
      weeks: 1,
      dailyCount: 10,
    },
    vetToken,
  );
  const vetContext = await contextFor(vetToken),
    vetPage = await vetContext.newPage();
  vetPage.on("pageerror", (e) => errors.push(e.message));
  await vetPage.goto(base + "/#plan", { waitUntil: "networkidle" });
  await vetPage
    .locator(`[data-plan-task="${vetPlan.tasks[0].id}"]`)
    .getByRole("button", { name: "开始练习", exact: true })
    .click();
  await expect(vetPage.locator(".blue-vet-practice")).toBeVisible();
  await expect(vetPage.locator(".blue-practice-heading")).toContainText("执业兽医");
  const vetPrivate = JSON.parse(
    store.db
      .prepare("SELECT data FROM user_learning_plans WHERE id=?")
      .get(vetPlan.id).data,
  );
  const vetQ = store.getQ(vetPrivate.tasks[0].questionIds[0]);
  await answer(vetPage, vetQ);
  await expect(vetPage.locator(".result-block")).toBeVisible();
  assert.equal(
    (await api("/learning-plan", undefined, vetToken)).plan.tasks[0].answered,
    1,
  );
  await vetPage.getByRole("button", { name: "返回学习计划", exact: true }).click();
  await expect(
    vetPage.locator(`[data-plan-task="${vetPlan.tasks[0].id}"]`),
  ).toContainText("已答 1 / 10 题");
  await vetContext.close();
  checks.push("veterinary-specific practice reports plan progress");

  assert.deepEqual(errors, []);
  const report = {
    runAt: new Date().toISOString(),
    passed: true,
    checks,
    widths,
    pageErrors: errors,
    serverGraded: true,
    isolatedDatabase: true,
    liveDeployment: false,
  };
  fs.writeFileSync(
    "test-output/learning-plan-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  if (page)
    await page
      .screenshot({
        path: "test-output/learning-plan-failure.png",
        fullPage: true,
      })
      .catch(() => {});
  throw error;
} finally {
  await browser?.close();
  await app.locals.stop();
  await new Promise((r) => server.close(r));
  store.db.close();
  assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
  assert(path.basename(directory).startsWith("aceexam-plan-ui-"));
  fs.rmSync(directory, { recursive: true, force: true });
}
