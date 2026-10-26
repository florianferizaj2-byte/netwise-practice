import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createStore } from "../server/store.js";
import { createApp } from "../server/index.js";
import {
  hasCertificateQuestion,
  questionForCertificate,
} from "../server/certificates.js";
import { practiceStorageKey } from "../src/practice-progress.js";
import { practicePreferenceKey } from "../src/blue-practice.js";

Object.assign(process.env, {
  ALLOWED_HOSTS: "127.0.0.1,localhost",
  COOKIE_SECURE: "0",
});
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aceexam-blue-ui-")),
  store = createStore(directory);
const user = await store.registerAsync("blue-ui", "fixture-password-123");
store.selectCertificate(user.id, "sichuan-upgrading-computer");
const sc = store
  .allQ()
  .filter((q) => hasCertificateQuestion(q, "sichuan-upgrading-computer"))
  .map((q) => questionForCertificate(q, "sichuan-upgrading-computer"));
const office = sc.filter((q) => q.chapter === "办公自动化");
const code = sc.find((q) => q.chapter === "算法与程序设计");
assert(office.length > 2 && code);
store.recordAttempt(office[0].id, office[0].answer, 1000, "practice", user.id);
store.recordAttempt(
  office[1].id,
  [office[1].answer[0] === "A" ? "B" : "A"],
  1000,
  "practice",
  user.id,
);
store.recordAttempt(code.id, code.answer, 1000, "practice", user.id);
const token = store.createAuthSession(user.id),
  app = await createApp({ store, production: true }),
  server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;
fs.mkdirSync("test-output", { recursive: true });
const catalog = JSON.parse(
  fs.readFileSync(
    new URL("../src/generated/chapter-art.json", import.meta.url),
  ),
);
const version = JSON.parse(
  fs.readFileSync(new URL("../mobile/package.json", import.meta.url)),
).version;
let browser, page;
const errors = [],
  checks = [],
  artChecks = [];
const api = async (url, body) => {
  const r = await fetch(base + "/api" + url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    method: body ? "POST" : "GET",
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal(r.status, 200, await r.clone().text());
  return r.json();
};
const fit = async (width) => {
  await page.setViewportSize({ width, height: 941 });
  await expect(page.locator(".app-shell.desk-workspace")).toHaveCount(
    width >= 900 ? 1 : 0,
  );
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    )
    .toBeLessThanOrEqual(2);
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
    {
      name: "netwise_session",
      value: token,
      url: base,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await context.addInitScript(
    (v) => localStorage.setItem("netwise-announcement-v" + v, "seen"),
    version,
  );
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/questions", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "题库服务暂时不可用" }),
    }),
  );
  await page.goto(base + "/#home", { waitUntil: "networkidle" });
  await expect(page.locator(".question-load-error")).toBeVisible();
  await expect(page.locator(".blue-home")).toHaveCount(0);
  await page.unroute("**/api/questions");
  await page.getByRole("button", { name: "重新读取题库", exact: true }).click();
  await expect(page.locator(".blue-home")).toBeVisible();
  await expect(page.locator(".blue-home-next h2")).toHaveText("算法与程序设计");
  await expect(
    page.locator(".blue-home-next [data-chapter-visual]"),
  ).toHaveAttribute("data-chapter-visual", "code");
  await expect(page.locator(".blue-home-stats")).toContainText("今日作答 3 题");
  await page.screenshot({
    path: "test-output/blue-home-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  checks.push(
    "initial failure has a retry and the home hero uses actual recent practice",
  );
  await page.locator('.blue-home [data-blue-chapter="办公自动化"]').click();
  await expect(page.locator(".blue-catalog")).toBeVisible();
  await expect(page.locator(".blue-catalog-hero h2")).toHaveText("办公自动化");
  const current = await api("/questions");
  assert(
    current.every(
      (q) => !["answer", "analysis", "expectedAnswer"].some((key) => key in q),
    ),
  );
  const actualOffice = current.filter(
    (q) => q.chapter === "办公自动化" && q.source !== "ai_generated",
  );
  await expect(
    page.locator('.blue-chapter-grid [data-blue-chapter="办公自动化"]'),
  ).toContainText(`已练 2 / ${actualOffice.length} 题`);
  await page.screenshot({
    path: "test-output/blue-chapters-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("searchbox", { name: "搜索章节或知识点" })
    .fill("没有这个章节");
  await expect(
    page.locator(".blue-chapter-grid .blue-chapter-card"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "没有找到匹配章节" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "清除章节筛选", exact: true }).click();
  await expect(
    page.locator(".blue-chapter-grid .blue-chapter-card"),
  ).toHaveCount(7);
  await page
    .locator('[aria-label="章节进度筛选"]')
    .getByRole("button", { name: /^进行中/ })
    .click();
  await expect(
    page.locator(".blue-chapter-grid .blue-chapter-card"),
  ).toHaveCount(2);
  await page
    .locator('[aria-label="章节进度筛选"]')
    .getByRole("button", { name: /^全部/ })
    .click();
  checks.push(
    "real progress tabs and chapter search preserve all configured chapters",
  );

  for (const cert of catalog.certificates) {
    await page
      .getByRole("combobox", { name: "切换备考目标", exact: true })
      .selectOption(cert.id);
    await expect(page.locator(".blue-home")).toBeVisible();
    await page.goto(base + "/#chapters", { waitUntil: "networkidle" });
    await expect(
      page.locator(".blue-chapter-grid .blue-chapter-card"),
    ).toHaveCount(cert.chapters.length);
    for (const ch of cert.chapters) {
      const card = page
        .locator(".blue-chapter-grid .blue-chapter-card")
        .filter({
          has: page.locator(".blue-chapter-copy > strong").filter({
            hasText: new RegExp(
              "^" + ch.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$",
            ),
          }),
        });
      await expect(card).toHaveCount(1);
      await card.click();
      await expect(page.locator(".blue-catalog-hero h2")).toHaveText(ch.title);
      for (const where of [
        card,
        page.locator(".blue-catalog-hero"),
        page.locator(".blue-settings-chapter"),
      ])
        await expect(where.locator("[data-chapter-visual]")).toHaveAttribute(
          "data-chapter-visual",
          ch.kind,
        );
      await card.hover();
      const names = await card
        .locator(".ace-chapter-art")
        .evaluate((el) =>
          [...el.querySelectorAll("*")]
            .map((n) => getComputedStyle(n).animationName)
            .filter((n) => n !== "none"),
        );
      assert(
        names.length > 0,
        cert.id + "/" + ch.title + " needs its hover motion",
      );
      artChecks.push({
        certificate: cert.id,
        chapter: ch.title,
        kind: ch.kind,
        largeAndSmall: true,
        animated: true,
      });
    }
    const ids = await page
      .locator(".ace-chapter-art [id]")
      .evaluateAll((nodes) => nodes.map((n) => n.id));
    assert.equal(new Set(ids).size, ids.length);
    const references = await page
      .locator(".ace-chapter-art")
      .evaluateAll((roots) =>
        roots.flatMap((root) =>
          [...root.querySelectorAll("*")].flatMap((node) =>
            [...node.attributes].flatMap((a) =>
              [...a.value.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]),
            ),
          ),
        ),
      );
    assert(references.every((id) => ids.includes(id)));
    for (const width of [320, 375, 768, 900, 1280, 1672]) await fit(width);
    if (cert.id === "ncre-l2-c-programming") {
      await page.mouse.move(0, 0);
      await page.screenshot({ path: "test-output/blue-c-chapters-1672.png", fullPage: true, animations: "disabled" });
      await fit(375);
      await expect.poll(() => page.locator(".sidebar").evaluate((node) => node.getBoundingClientRect().right)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: "test-output/blue-c-chapters-375.png", fullPage: true, animations: "disabled" });
      await fit(1672);
    }
  }
  assert.equal(artChecks.length, catalog.certificates.reduce((sum, cert) => sum + cert.chapters.length, 0));
  assert.deepEqual(new Set(artChecks.map(row => row.certificate)), new Set(catalog.certificates.map(cert => cert.id)));
  assert.equal(
    artChecks.filter((row) => row.certificate === "ncre-l2-c-programming")
      .length,
    12,
  );
  checks.push(
    `${artChecks.length} chapter cards share the correct large/small animated illustrations across ${catalog.certificates.length} real certificates, including all 12 C chapters`,
  );

  await page
    .getByRole("combobox", { name: "切换备考目标", exact: true })
    .selectOption("sichuan-upgrading-computer");
  await expect(page.locator(".blue-home")).toBeVisible();
  await page.goto(base + "/#chapters", { waitUntil: "networkidle" });
  await expect(
    page.locator(".blue-chapter-grid .blue-chapter-card"),
  ).toHaveCount(7);
  await page
    .locator('.blue-chapter-grid [data-blue-chapter="办公自动化"]')
    .click();
  await page
    .locator('[aria-label="练习方式"]')
    .getByRole("button", { name: "随机练习", exact: true })
    .click();
  await page
    .locator('[aria-label="题目范围"]')
    .getByRole("button", { name: "错题重练", exact: true })
    .click();
  await expect(page.locator(".blue-setting-note")).toContainText("可练 1 题");
  await page.reload({ waitUntil: "networkidle" });
  await page
    .locator('.blue-chapter-grid [data-blue-chapter="办公自动化"]')
    .click();
  await expect(
    page
      .locator('[aria-label="练习方式"]')
      .getByRole("button", { name: "随机练习", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page
      .locator('[aria-label="题目范围"]')
      .getByRole("button", { name: "错题重练", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.locator(".blue-start-practice").click();
  await expect(page.locator(".question-text")).toHaveText(office[1].question);
  await expect(page.locator(".result-block")).toHaveCount(0);
  await fit(375);
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(".question-text")).toHaveText(office[1].question);
  await page.getByRole("button", { name: "返回章节练习", exact: true }).click();
  await expect(page.locator(".blue-catalog")).toBeVisible();
  await page.goto(base + "/#home", { waitUntil: "networkidle" });
  await expect(
    page.locator(".blue-home-next [data-chapter-visual]"),
  ).toHaveAttribute("data-chapter-visual", "office");
  await page.getByRole("button", { name: "继续上次练习", exact: true }).click();
  await expect(page.locator(".question-text")).toHaveText(office[1].question);
  for (const key of office[1].answer)
    await page
      .locator(".option")
      .filter({
        has: page
          .locator(".option-letter")
          .filter({ hasText: new RegExp("^" + key + "$") }),
      })
      .click();
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await expect(page.locator(".result-block")).toBeVisible();
  assert(
    store.allA(user.id).some((a) => a.questionId === office[1].id && a.correct),
  );
  await page.getByRole("button", { name: "完成练习", exact: true }).click();
  await page.getByRole("button", { name: "返回章节练习", exact: true }).click();
  await expect(page.locator(".blue-catalog")).toBeVisible();
  await page.goto(base + "/#chapters", { waitUntil: "networkidle" });
  await page
    .locator('.blue-chapter-grid [data-blue-chapter="办公自动化"]')
    .click();
  await page
    .locator('[aria-label="题目范围"]')
    .getByRole("button", { name: "全部题目", exact: true })
    .click();
  await page.screenshot({
    path: "test-output/blue-chapters-narrow-web.png",
    fullPage: true,
    animations: "disabled",
  });
  checks.push(
    "wrong-answer practice, safe pre-answer state and narrow Web continuation use the old trusted grader",
  );

  await fit(1672);
  await page
    .getByRole("combobox", { name: "切换备考目标", exact: true })
    .selectOption("network-engineer");
  await expect(page.locator(".blue-home")).toBeVisible();
  await page.goto(base + "/#chapters", { waitUntil: "networkidle" });
  await expect(
    page.locator(".blue-chapter-grid .blue-chapter-card"),
  ).toHaveCount(10);
  await expect(
    page
      .locator('[aria-label="练习方式"]')
      .getByRole("button", { name: "顺序练习", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const network = await api("/questions");
  const first = network.find(
    (q) => q.knowledgeSection && q.source !== "ai_generated",
  );
  assert(first);
  await page
    .locator(".blue-chapter-grid .blue-chapter-card")
    .filter({
      has: page
        .locator(".blue-chapter-copy > strong")
        .filter({ hasText: first.chapter }),
    })
    .click();
  await page
    .getByRole("combobox", { name: "筛选知识分类", exact: true })
    .selectOption(first.knowledgeSection);
  await page
    .getByRole("combobox", { name: "选择练习知识点", exact: true })
    .selectOption(first.targetKnowledgePoint || first.knowledgePoint);
  const expected = network.filter(
    (q) =>
      q.chapter === first.chapter &&
      q.knowledgeSection === first.knowledgeSection &&
      (q.targetKnowledgePoint || q.knowledgePoint) ===
        (first.targetKnowledgePoint || first.knowledgePoint) &&
      q.source !== "ai_generated",
  );
  await page.locator(".blue-start-practice").click();
  await expect(page.locator(".question-text")).toBeVisible();
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    practiceStorageKey(user.id, "network-engineer"),
  );
  assert.deepEqual(
    saved.questionIds,
    expected.slice(0, 10).map((q) => q.id),
  );
  await page.getByRole("button", { name: "返回章节练习", exact: true }).click();
  await page.goto(base + "/#chapters", { waitUntil: "networkidle" });
  const bank = store
    .allQ()
    .find(
      (q) =>
        hasCertificateQuestion(q, "network-engineer") &&
        q.source === "user_collection",
    );
  assert(bank);
  await page
    .getByRole("combobox", { name: "题库来源", exact: true })
    .selectOption("user_collection");
  const shown = await page
    .locator(".blue-catalog-stat strong")
    .allTextContents();
  assert.equal(
    Number(shown[1]),
    network.filter((q) => q.source === "user_collection").length,
  );
  await page
    .getByRole("combobox", { name: "题库来源", exact: true })
    .selectOption("all");
  checks.push(
    "knowledge classification, individual point scope and real bank source counts are preserved",
  );

  await page.emulateMedia({ reducedMotion: "reduce" });
  const motionCard = page
    .locator(".blue-chapter-grid .blue-chapter-card")
    .first();
  await motionCard.hover();
  assert.deepEqual(
    await motionCard
      .locator(".ace-chapter-art")
      .evaluate((el) =>
        [...el.querySelectorAll("*")]
          .map((n) => getComputedStyle(n).animationName)
          .filter((n) => n !== "none"),
      ),
    [],
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(base + "/#home", { waitUntil: "networkidle" });
  for (const width of [320, 375, 768, 900, 1280, 1672]) await fit(width);
  await page
    .locator(".blue-home-links")
    .getByRole("button", { name: /^我的收藏/ })
    .click();
  await expect(page.locator(".favorites-view")).toBeVisible();
  await page.goto(base + "/#home", { waitUntil: "networkidle" });
  await page
    .locator(".blue-home-links")
    .getByRole("button", { name: /^学习计划/ })
    .click();
  await expect(page.locator(".learning-plan-view")).toBeVisible();
  checks.push(
    "responsive home, reduced motion and favorites/plan overview navigation work",
  );

  await page
    .getByRole("combobox", { name: "切换备考目标", exact: true })
    .selectOption("veterinary-practitioner");
  await expect(page.locator(".blue-home")).toBeVisible();
  await page.goto(base + "/#chapters", { waitUntil: "networkidle" });
  assert.equal(
    await page
      .locator(
        ".blue-chapter-grid [data-chapter-visual]:not([data-chapter-visual=book])",
      )
      .count(),
    0,
  );
  await page.locator(".blue-start-practice").click();
  await expect(page.locator(".blue-vet-practice")).toBeVisible();
  await expect(page.locator(".blue-practice-title h1")).toHaveText("基础科目");
  await expect(page.locator(".vet-question-text")).toBeVisible();
  checks.push(
    "veterinary practice stays available and has no new chapter illustrations",
  );
  const blocked = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  await blocked.addCookies([
    {
      name: "netwise_session",
      value: token,
      url: base,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await blocked.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("browser storage disabled");
      },
    }),
  );
  const privatePage = await blocked.newPage();
  privatePage.on("pageerror", (e) => errors.push(e.message));
  await privatePage.goto(base + "/#chapters", { waitUntil: "networkidle" });
  await expect(privatePage.locator(".blue-catalog")).toBeVisible();
  await expect(privatePage.locator(".blue-start-practice")).toBeEnabled();
  await blocked.close();
  checks.push(
    "disabled browser storage still allows chapter selection and practice",
  );
  assert.deepEqual(errors, []);
  const preferences = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    practicePreferenceKey(user.id, "sichuan-upgrading-computer"),
  );
  assert.equal(preferences.order, "random");
  const report = {
    runAt: new Date().toISOString(),
    passed: true,
    checks,
    chapters: artChecks,
    artCount: artChecks.length,
    widths: [320, 375, 768, 900, 1280, 1672],
    pageErrors: errors,
    realAccount: true,
    liveDeployment: false,
  };
  fs.writeFileSync(
    "test-output/blue-workspace-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        passed: report.passed,
        checks,
        artCount: report.artCount,
        widths: report.widths,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (page) {
    const diagnostics = await page
      .evaluate(() => ({
        page: location.href,
        overflow: [...document.querySelectorAll("body *")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.right > innerWidth + 2;
          })
          .map((el) => ({
            tag: el.tagName,
            class: el.className,
            width: el.getBoundingClientRect().width,
            right: el.getBoundingClientRect().right,
            text: el.textContent?.slice(0, 50),
          })),
      }))
      .catch(() => null);
    fs.writeFileSync(
      "test-output/blue-workspace-failure.json",
      JSON.stringify(diagnostics, null, 2),
    );
    await page
      .screenshot({
        path: "test-output/blue-workspace-failure.png",
        fullPage: true,
        animations: "disabled",
      })
      .catch(() => {});
  }
  throw error;
} finally {
  await browser?.close();
  await app.locals.stop();
  await new Promise((r) => server.close(r));
  store.db.close();
  assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
  assert(path.basename(directory).startsWith("aceexam-blue-ui-"));
  fs.rmSync(directory, { recursive: true, force: true });
}
