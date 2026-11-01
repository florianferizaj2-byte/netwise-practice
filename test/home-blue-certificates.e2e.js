import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
const base =
  process.env.ACEEXAM_DEMO_URL || "http://127.0.0.1:4177/demo/home-blue/";
const output = path.resolve("outputs/home-blue-demo");
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  proxy: { server: "http://127.0.0.1:9", bypass: "localhost,127.0.0.1" },
});
const context = await browser.newContext({
  viewport: { width: 1672, height: 941 },
  timezoneId: "Asia/Shanghai",
});
const p = await context.newPage(),
  errors = [],
  failed = [],
  external = [],
  requests = [],
  passed = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
p.on("request", (r) => {
  requests.push(r.url());
  if (
    !r.url().startsWith(base.split("/demo/")[0]) &&
    !r.url().startsWith("data:")
  )
    external.push(r.url());
});
p.on("response", (r) => {
  if (r.status() >= 400) failed.push(r.url());
});
const state = () => p.evaluate(() => structuredClone(AceStudyFlow.state()));
const active = () => p.evaluate(() => AceCertificates.active().id);
const picker = () => p.locator("#certificate-switch").click();
const choose = (id) => p.locator('.cert-radio[value="' + id + '"]').check();
async function enter(id, route = null) {
  await picker();
  await choose(id);
  await p
    .locator(route ? '[data-cert-route="' + route + '"]' : "#cert-enter")
    .click();
}
try {
  await p.goto(base + "#home", { waitUntil: "networkidle" });
  await picker();
  await expect(p.locator("body")).toHaveAttribute("data-page", "certificates");
  await expect(p.locator("#certificate-switch")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(p.locator(".cert-card")).toHaveCount(8);
  await expect(p.locator(".cert-card.is-planned")).toHaveCount(6);
  await expect(p.locator("#cert-enter")).toBeEnabled();
  await p.screenshot({
    path: path.join(output, "certificates-light-1672.png"),
    fullPage: true,
    animations: "disabled",
  });
  const initial = await state(),
    planned = await p.evaluate(() =>
      AceCertificates.catalog()
        .filter((c) => !c.available)
        .map((c) => c.id),
    );
  for (const id of planned) {
    await choose(id);
    await expect(p.locator("#cert-current")).toContainText("准备中");
    await expect(p.locator("#cert-enter")).toBeDisabled();
    await expect(p.locator("#cert-current .cert-entry:disabled")).toHaveCount(
      3,
    );
    assert.equal(await active(), "sichuan-upgrading-computer");
  }
  assert.deepEqual((await state()).records, initial.records);
  assert.deepEqual(
    (await state()).certificateDemo.recent,
    initial.certificateDemo.recent,
  );
  await p.screenshot({
    path: path.join(output, "certificates-planned.png"),
    fullPage: true,
    animations: "disabled",
  });
  assert.equal(
    requests.some((u) => planned.some((id) => u.includes("ai-content-" + id))),
    false,
  );
  passed.push(
    "八个备考方向和六个预留状态，预览不会切换当前目标或请求未开放题库",
  );

  await p.locator("#cert-search").fill("软设");
  await expect(p.locator(".cert-card")).toHaveCount(1);
  await expect(p.locator(".cert-card")).toContainText("软件设计师");
  await p.locator("#cert-search").fill("NETWORK");
  await expect(p.locator(".cert-card")).toHaveCount(1);
  await expect(p.locator(".cert-card")).toContainText("网络工程师");
  await p.locator("#cert-search").fill('<img src=x onerror="throw 1">');
  await expect(p.locator("#cert-empty")).toBeVisible();
  await expect(p.locator("#cert-result-count")).toContainText("0");
  await p.locator('[data-cert-action="clear"]').click();
  await p.locator("#cert-region").selectOption("sichuan");
  await expect(p.locator(".cert-card")).toHaveCount(1);
  await p.locator("#cert-region").selectOption("general");
  await expect(p.locator(".cert-card")).toHaveCount(7);
  await p.locator('[data-cert-category="upgrade"]').click();
  await expect(p.locator("#cert-empty")).toBeVisible();
  await p.locator('[data-cert-action="clear"]').click();
  await p.locator('[data-cert-category="software"]').click();
  await expect(p.locator(".cert-card")).toHaveCount(5);
  await p.locator('[data-cert-category="all"]').click();
  await choose("sichuan-upgrading-computer");
  await p.locator('.cert-radio[value="sichuan-upgrading-computer"]').focus();
  await p.keyboard.press("ArrowRight");
  await expect(
    p.locator('.cert-radio[value="network-engineer"]'),
  ).toBeChecked();
  await expect(p.locator("#cert-current")).toContainText("网络工程师");
  assert.equal(await active(), "sichuan-upgrading-computer");
  await p.locator('[data-cert-card="network-engineer"]').hover();
  await expect(
    p.locator('[data-cert-card="network-engineer"] .cert-signal'),
  ).not.toHaveCSS("transform", "none");
  await p.emulateMedia({ reducedMotion: "reduce" });
  await expect(
    p.locator('[data-cert-card="network-engineer"] .cert-signal'),
  ).toHaveCSS("transform", "none");
  await p.emulateMedia({ reducedMotion: "no-preference" });
  await p.locator('[data-cert-action="about"]').click();
  await expect(p.locator(".cert-about-list > div")).toHaveCount(8);
  await expect(p.locator("#demo-dialog")).toContainText("仅预留入口");
  await p.locator('[data-cert-action="about-close"]').click();
  passed.push("搜索别名/空状态、分类和地区组合、键盘选择、说明及减少动画");

  await choose("sichuan-upgrading-computer");
  await p.locator('[data-cert-route="chapters"]').click();
  await p.locator('[data-action="configured-practice"]').first().click();
  await p.locator('[data-question-jump="4"]').click();
  await p.locator('[data-study-option="0"]').click();
  const prior = await state(),
    session = prior.sessions.find((s) => s.id === prior.activeSessionId);
  await enter("network-engineer", "ai");
  await expect(p.locator("#ai-lesson-title")).toBeVisible();
  assert.equal(await active(), "network-engineer");
  assert.equal(
    (await p.evaluate(() => AceAiStudyDemo.catalog())).course.id,
    "network-engineer",
  );
  await expect(p.locator("#certificate-switch")).toContainText("网络工程师");
  await picker();
  await expect(
    p.locator('#cert-current [data-cert-route="chapters"]'),
  ).toBeDisabled();
  await expect(p.locator('#cert-current [data-cert-route="ai"]')).toBeEnabled();
  await expect(
    p.locator('#cert-current [data-cert-route="exam"]'),
  ).toBeDisabled();
  await expect(p.locator(".cert-recent")).toHaveCount(2);
  await p.locator("#cert-enter").click();
  await expect(p.locator("#ai-lesson-title")).toBeVisible();
  for (const route of [
    "home",
    "chapters",
    "practice",
    "report",
    "plan",
    "exam",
    "favorites",
    "wrong",
  ]) {
    await p.goto(base + "#" + route, { waitUntil: "networkidle" });
    await expect(p.locator("#certificate-unavailable")).toBeVisible();
    await expect(p.locator("#" + route + "-page")).toBeHidden();
    assert.equal((await state()).sessions.length, prior.sessions.length);
    assert.deepEqual((await state()).records, prior.records);
  }
  await p.reload({ waitUntil: "networkidle" });
  await expect(p.locator("#certificate-unavailable")).toBeVisible();
  assert.equal(await active(), "network-engineer");
  const recovered = (await state()).sessions.find((s) => s.id === session.id);
  assert.deepEqual(recovered.selections, session.selections);
  assert.equal(recovered.index, 4);
  await p.locator('#certificate-unavailable [data-action="ai"]').click();
  await expect(p.locator("#ai-lesson-title")).toBeVisible();
  passed.push(
    "网络精讲和未开放页面保护，不混用四川题库、不新增刷题会话或丢失草稿",
  );

  await enter("sichuan-upgrading-computer", "ai");
  await expect(p.locator("#ai-lesson-title")).toBeVisible();
  assert.equal(
    (await p.evaluate(() => AceAiStudyDemo.catalog())).course.id,
    "sichuan-upgrading-computer",
  );
  await picker();
  await p.locator('[data-cert-recent="network-engineer"]').click();
  await expect(p.locator("#ai-lesson-title")).toBeVisible();
  assert.equal(await active(), "network-engineer");
  await p.locator('.sidebar [data-action="settings"]').click();
  await p
    .locator('[data-pref="defaultCourse"]')
    .selectOption("四川专升本 · 计算机");
  await p.locator("#settings-save").click();
  assert.equal(await active(), "sichuan-upgrading-computer");
  await p.locator('.sidebar [data-action="chapters"]').click();
  await expect(p.locator(".chapter-catalogue")).toBeVisible();
  await picker();
  await p.reload({ waitUntil: "networkidle" });
  assert.equal(await active(), "sichuan-upgrading-computer");
  await expect(p.locator(".cert-recent")).toHaveCount(2);
  await p.locator("#search").fill("证书");
  await p.locator('.search-result[data-action="certificates"]').click();
  await expect(p.locator("#certificates-page")).toBeVisible();
  await p.goto(base + "#login", { waitUntil: "networkidle" });
  await p.locator('[data-landing-action="directions"]').click();
  await expect(p.locator("#certificates-page")).toBeVisible();
  passed.push(
    "两门课程正确切换、最近备考与设置同步、刷新恢复、全局搜索和登录入口",
  );

  for (const width of [1920, 1672, 1440, 1280, 1024, 768, 393, 320]) {
    await p.setViewportSize({ width, height: 941 });
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "light overflow " + width,
    );
    if ([1920, 1280].includes(width))
      await p.screenshot({
        path: path.join(output, "certificates-light-" + width + ".png"),
        fullPage: true,
        animations: "disabled",
      });
  }
  await p.setViewportSize({ width: 1672, height: 941 });
  await p.locator('.sidebar [data-action="settings"]').click();
  await p.locator('[data-pref="theme"][value="dark"]').check();
  await p.locator('[data-pref="font"][value="large"]').check();
  await p.locator('[data-pref="reduceMotion"]').check();
  await p.locator("#settings-save").click();
  await picker();
  for (const width of [1920, 1672, 1440, 1280, 1024, 768, 393, 320]) {
    await p.setViewportSize({ width, height: 941 });
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "dark large overflow " + width,
    );
  }
  await p.setViewportSize({ width: 1672, height: 941 });
  await p.screenshot({
    path: path.join(output, "certificates-dark-large-1672.png"),
    fullPage: true,
    animations: "disabled",
  });
  await p.locator('.sidebar [data-action="settings"]').click();
  await p.locator('[data-pref="font"][value="standard"]').check();
  await p.locator("#settings-save").click();
  await picker();
  await p.screenshot({
    path: path.join(output, "certificates-dark-1672.png"),
    fullPage: true,
    animations: "disabled",
  });
  passed.push("八种 Web 窗口的浅色/深色与大字号，遵循系统和设置减少动画");

  await p.evaluate(() => {
    const s = AceStudyFlow.state();
    s.certificateDemo.active = "software-designer";
    s.certificateDemo.recent = [
      { id: "missing" },
      { id: "network-engineer" },
      { id: "network-engineer" },
      { id: "software-designer" },
    ];
    AceStudyFlow.save();
  });
  await p.reload({ waitUntil: "networkidle" });
  assert.equal(await active(), "sichuan-upgrading-computer");
  assert.equal((await state()).certificateDemo.recent.length, 1);
  await p.locator('.sidebar [data-action="settings"]').click();
  await p.locator('[data-settings-action="reset"]').click();
  await p.locator('#demo-dialog [data-action="reset"]').click();
  assert.equal(await active(), "sichuan-upgrading-computer");
  await picker();
  await expect(p.locator(".cert-card")).toHaveCount(8);
  await expect(p.locator(".cert-recent")).toHaveCount(1);
  passed.push("无效目标回退、最近备考去重过滤、重置恢复");
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  assert.deepEqual(external, []);
  console.log(
    JSON.stringify(
      {
        passed,
        pageErrors: errors,
        failedRequests: failed,
        externalRequests: external,
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
