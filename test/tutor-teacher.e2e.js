import assert from "node:assert/strict";
import fs from "node:fs";
import { expect } from "@playwright/test";
import { teacherFixture } from "./helpers/tutor-teacher.js";
import { launchTestBrowser } from "./helpers/browser.js";

const cleanups = [],
  report = { passed: false, checks: [], errors: [] };
const f = await teacherFixture({ after: (fn) => cleanups.push(fn) }, true);
let browser, page;
fs.mkdirSync("test-output", { recursive: true });
const panel = () =>
  page.getByRole("complementary", { name: "AI 老师", exact: true });
try {
  const session = await f.start();
  browser = await launchTestBrowser();
  const context = await browser.newContext({
    viewport: { width: 1672, height: 941 },
  });
  await context.addCookies([
    {
      name: "netwise_session",
      value: f.tokens[1],
      url: f.base,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const version = JSON.parse(
    fs.readFileSync("mobile/package.json", "utf8"),
  ).version;
  await context.addInitScript(
    (v) => localStorage.setItem(`netwise-announcement-v${v}`, "seen"),
    version,
  );
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.goto(f.base + "/#tutor");
  await expect(page.locator(".tutor-shell")).toHaveAttribute(
    "data-session-id",
    session.id,
  );
  const teacherPath = `**/api/tutor/v1/sessions/${session.id}/teacher`;
  await page.route(teacherPath, (route) =>
    route.request().method() === "GET"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "fixture history failure" }),
        })
      : route.continue(),
  );
  await page.getByRole("button", { name: "问 AI 老师", exact: true }).click();
  await expect(panel()).toContainText("已保存的问答暂时无法读取");
  await page.unroute(teacherPath);
  await panel()
    .getByRole("button", { name: "重试读取问答", exact: true })
    .click();
  const initialQuota = (await f.req(f.url(session))).data.quota;
  assert.equal(initialQuota.unit, "points");
  assert.equal(initialQuota.requestLimits.used, 0);
  assert.equal(initialQuota.requestLimits.limit, 1000);
  await expect(panel()).toContainText(`可用积分 ${initialQuota.remaining}，按实际 AI 用量结算。`);
  let dropped = false;
  const sent = [];
  await page.route(teacherPath, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    sent.push(route.request().postDataJSON().requestId);
    if (dropped) return route.continue();
    dropped = true;
    const reply = await route.fetch();
    assert.equal(reply.status(), 200);
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "答疑应答丢失测试" }),
    });
  });
  const message = panel().getByRole("textbox", {
    name: "你的问题",
    exact: true,
  });
  await message.fill("帧和广播域分别是什么意思？");
  await panel().getByRole("button", { name: "问老师", exact: true }).click();
  await expect(panel()).toContainText("答疑应答丢失测试");
  await expect(message).toHaveValue("帧和广播域分别是什么意思？");
  assert.equal(f.control.calls.length, 2);
  const committedQuota = (await f.req(f.url(session))).data.quota;
  assert(committedQuota.availableUnits < initialQuota.availableUnits);
  await panel().getByRole("button", { name: "问老师", exact: true }).click();
  await expect(panel().locator(".ss-teacher-answer")).toContainText(
    "以太网中传输的一份数据",
  );
  const retriedQuota = (await f.req(f.url(session))).data.quota;
  assert.equal(retriedQuota.availableUnits, committedQuota.availableUnits, "A committed reply retry must not debit points twice");
  assert.equal(retriedQuota.requestLimits.used, 1);
  await expect(panel()).toContainText(`可用积分 ${retriedQuota.remaining}，按实际 AI 用量结算。`);
  assert.equal(sent[0], sent[1]);
  assert.equal(f.control.calls.length, 2);
  assert.equal((await f.req(f.url(session))).data.messages.length, 1);
  report.checks.push(
    "Teacher history failure retries; a dropped committed reply retains the question and retries the same ID without another model call or quota debit",
  );
  for (const width of [320, 375, 768, 900, 1280, 1672]) {
    await page.setViewportSize({ width, height: 941 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      )
      .toBeLessThanOrEqual(2);
    if (width === 1672 || width === 375)
      await page.screenshot({
        path: `test-output/tutor-teacher-${width}.png`,
        fullPage: true,
        animations: "disabled",
      });
  }
  await page.reload();
  await page.getByRole("button", { name: "问 AI 老师", exact: true }).click();
  await expect(panel().locator(".ss-teacher-answer")).toHaveCount(1);
  await expect(panel()).toContainText(
    "帧和广播域分别是什么意思？".normalize("NFKC"),
  );
  await page.evaluate(() => {
    document.documentElement.dataset.webTheme = "dark";
    document.documentElement.dataset.theme = "dark";
  });
  await page.screenshot({
    path: "test-output/tutor-teacher-dark.png",
    fullPage: true,
    animations: "disabled",
  });
  const contrast = await panel()
    .locator(".ss-chat-turn")
    .evaluate((node) => {
      const luminance = (color) => {
        const rgb = color
          .match(/[\d.]+/g)
          .slice(0, 3)
          .map(Number)
          .map((v) => {
            v /= 255;
            return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          });
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      };
      const fg = luminance(getComputedStyle(node.querySelector("p")).color),
        bg = luminance(getComputedStyle(node).backgroundColor);
      return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    });
  assert(contrast >= 4.5, `Teacher dark-theme text contrast ${contrast}`);
  report.checks.push(
    "Persisted private questions and structured answers restore after refresh; teacher panel fits 320–1672px and renders in dark mode",
  );
  const beforeOutageQuota = (await f.req(f.url(session))).data.quota;
  f.control.mode = "outage";
  await panel()
    .getByRole("textbox", { name: "你的问题", exact: true })
    .fill("为什么要确定广播的范围？");
  await panel().getByRole("button", { name: "问老师", exact: true }).click();
  await expect(panel()).toContainText("老师暂时未能完成答疑");
  assert.equal((await f.req(f.url(session))).data.quota.requestLimits.used, 1);
  const failedQuota = (await f.req(f.url(session))).data.quota;
  assert.equal(failedQuota.availableUnits, beforeOutageQuota.availableUnits, "Synthetic upstream outage must release reserved points");
  assert.equal(failedQuota.heldUnits, 0);
  const failedId = (await f.req(f.url(session))).data.draft.requestId;
  await page.reload();
  await page.getByRole("button", { name: "问 AI 老师", exact: true }).click();
  await expect(
    panel().getByRole("textbox", { name: "你的问题", exact: true }),
  ).toHaveValue("为什么要确定广播的范围？".normalize("NFKC"));
  f.control.mode = "ok";
  await panel().getByRole("button", { name: "问老师", exact: true }).click();
  await expect(panel().locator(".ss-teacher-answer")).toHaveCount(2);
  assert.equal((await f.req(f.url(session))).data.draft, null);
  assert.equal(sent.at(-1), failedId);
  assert.equal((await f.req(f.url(session))).data.quota.requestLimits.used, 2);
  await page.getByRole("button", { name: "收起 AI 老师", exact: true }).click();
  for (
    let i = 0;
    i < 20 &&
    (await page.locator(".tutor-shell").getAttribute("data-phase")) ===
      "explanation";
    i++
  ) {
    const revision = await page
      .locator(".tutor-shell")
      .getAttribute("data-revision");
    await page.locator(".formal-tutor-actions .formal-tutor-primary").click();
    await expect(page.locator(".tutor-shell")).not.toHaveAttribute(
      "data-revision",
      revision,
    );
  }
  await expect(page.locator(".tutor-shell")).toHaveAttribute(
    "data-phase",
    "awaiting_answer",
  );
  const calls = f.control.calls.length;
  await page.getByRole("button", { name: "问 AI 老师", exact: true }).click();
  await expect(
    panel().getByRole("textbox", { name: "你的问题", exact: true }),
  ).toBeDisabled();
  await expect(panel()).toContainText("先完成当前小测");
  await panel().getByRole("button", { name: "给点提示", exact: true }).click();
  await expect(panel().locator(".ss-teacher-answer")).toHaveCount(3);
  await expect(panel().locator(".ss-teacher-answer").last()).toContainText(
    "先回看",
  );
  assert.equal(f.control.calls.length, calls);
  assert.equal((await f.req(f.url(session))).data.quota.requestLimits.used, 2);
  const source = await page.locator(".tutor-shell").innerHTML();
  assert(!source.includes('"correctId"'));
  report.checks.push(
    "A model outage preserves the question and request ID across refresh without consuming a completed-answer allowance; retry succeeds; the lesson still advances; pending quizzes allow reviewed hints only and never call the model",
  );
  await page.request.put(f.base + "/api/auth/certificate", { data: { certificateId: "ncre-l2-c-programming" } });
  await page.reload();
  await expect(page.locator(".formal-tutor-gate")).toContainText("这类证书的精讲课程尚未开放");
  await page.getByRole("button", { name: "进入章节练习", exact: true }).click();
  await expect(page.locator(".blue-chapter-grid .blue-chapter-card")).toHaveCount(12);
  assert.equal(f.control.calls.length, calls);
  report.checks.push("The new C certificate has an honest unavailable-course state and returns to its 12 real practice chapters without calling AI");
  assert.deepEqual(report.errors, []);
  report.passed = true;
  await context.close();
} catch (e) {
  report.failure = e.stack;
  process.exitCode = 1;
  if (page && !page.isClosed())
    await page
      .screenshot({
        path: "test-output/tutor-teacher-failure.png",
        fullPage: true,
      })
      .catch(() => {});
} finally {
  fs.writeFileSync(
    "test-output/tutor-teacher-report.json",
    JSON.stringify({ ...report, runAt: new Date().toISOString() }, null, 2),
  );
  await browser?.close();
  for (const cleanup of cleanups.reverse()) await cleanup();
  console.log(JSON.stringify(report));
}
