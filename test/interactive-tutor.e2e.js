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
import { TutorEngine } from "../server/demo-tutor/engine.js";
import { getBundle } from "../server/demo-tutor/registry.js";
import { practiceStorageKey } from "../src/practice-progress.js";

Object.assign(process.env, {
  ALLOWED_HOSTS: "127.0.0.1,localhost",
  COOKIE_SECURE: "0",
});
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aceexam-tutor-ui-"));
const store = createStore(directory);
const user = await store.registerAsync("tutor-ui", "fixture-password-123");
store.selectCertificate(user.id, "network-engineer");
store.saveAccountEntitlement(user.id, {
  plan: "vip",
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
});
const questions = store
  .allQ()
  .filter((q) => hasCertificateQuestion(q, "network-engineer"))
  .map((q) => questionForCertificate(q, "network-engineer"));
const question = questions.find(
  (q) =>
    q.knowledgePoint === "冲突域、广播域与网络设备" &&
    /VLAN/i.test(q.question) &&
    /广播/.test(q.question),
);
assert(question);
store.setQuestionFavorite(user.id, question.id, true);
const token = store.createAuthSession(user.id),
  app = await createApp({ store, production: true }),
  server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const version = JSON.parse(
  fs.readFileSync(new URL("../mobile/package.json", import.meta.url)),
).version;
fs.mkdirSync("test-output", { recursive: true });
let browser, page;
const errors = [],
  checks = [],
  engine = new TutorEngine();
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
  const c = await browser.newContext({ viewport: { width, height: 941 } });
  await c.addCookies([
    {
      name: "netwise_session",
      value: auth,
      url: base,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await c.addInitScript(
    (v) => localStorage.setItem("netwise-announcement-v" + v, "seen"),
    version,
  );
  return c;
};
const shell = () => page.locator(".formal-tutor .tutor-shell");
const current = async (courseId = "vlan-broadcast-domain") =>
  (
    await api(
      "/tutor/v1/sessions/current?courseId=" + encodeURIComponent(courseId),
    )
  ).session;
const phase = async (value) =>
  expect(shell()).toHaveAttribute("data-phase", value);
const next = async () => {
  const rev = await shell().getAttribute("data-revision");
  await page.locator(".formal-tutor-actions .formal-tutor-primary").click();
  await expect(shell()).not.toHaveAttribute("data-revision", rev);
};
const untilQuiz = async () => {
  for (
    let i = 0;
    i < 12 && (await shell().getAttribute("data-phase")) === "explanation";
    i++
  )
    await next();
  await phase("awaiting_answer");
};
const answer = async (id, keyboard = false) => {
  const radio = page.locator(`#tutor-quiz-form input[value="${id}"]`);
  await radio.check();
  if (keyboard) await radio.press("Enter");
  else await page.locator("#tutor-quiz-form button[type=submit]").click();
  await phase("feedback");
};
const raw = (s) =>
  JSON.parse(
    store.db
      .prepare("SELECT data FROM interactive_tutor_sessions WHERE id=?")
      .get(s.id).data,
  );
const fit = async (width) => {
  await page.setViewportSize({ width, height: 941 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    )
    .toBeLessThanOrEqual(2);
  const svg = page.locator(".tutor-topology:visible");
  if (await svg.count())
    assert(
      await svg.evaluateAll((nodes) =>
        nodes.every(
          (n) =>
            n.getBoundingClientRect().right <= innerWidth + 2 &&
            n.getBoundingClientRect().left >= 0,
        ),
      ),
    );
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
  assert(
    !fs.existsSync(new URL("../dist/demo", import.meta.url)),
    "production assets must not include the standalone demo answer bank",
  );
  for (const pathname of [
    "/demo/home-blue/ai-content-network-engineer.json",
    "/%64emo/home-blue/ai-content-network-engineer.json",
    "/DEMO/home-blue/ai-content-network-engineer.json",
  ]) {
    const blocked = await fetch(base + pathname);
    assert.equal(blocked.status, 404);
    assert(!(await blocked.text()).includes("answer"));
  }
  checks.push(
    "production artifacts and encoded demo URLs cannot expose the local demonstration answer bank",
  );
  await page.goto(base + "/#favorites", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "开始练习", exact: true }).click();
  await expect(page.locator(".practice-layout")).toBeVisible();
  await expect(page.locator(".question-text")).toContainText(question.question);
  const oldKey = practiceStorageKey(user.id, "network-engineer");
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), oldKey))
    .not.toBeNull();
  await page.route("**/api/tutor/v1/sessions/current?*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "课程恢复暂时不可用" }),
    }),
  );
  await page
    .getByRole("button", { name: "AI 精讲这个知识点", exact: true })
    .click();
  await expect(page.locator(".formal-tutor-error")).toContainText(
    "课程恢复暂时不可用",
  );
  await expect(page.locator(".formal-tutor-lesson-heading h2")).toHaveText(
    "VLAN 广播域",
  );
  await page.unroute("**/api/tutor/v1/sessions/current?*");
  await page.getByRole("button", { name: "重新连接", exact: true }).click();
  await expect(page.locator(".formal-tutor-error")).toHaveCount(0);
  await page.getByRole("button", { name: "开始互动学习", exact: true }).click();
  await phase("explanation");
  const initial = await current();
  assert.equal(initial.pacing, "guided");
  assert.equal(
    initial.lesson.components.filter((c) => c.type !== "LessonProgress").length,
    1,
  );
  assert(!JSON.stringify(initial).includes('"answer":'));
  checks.push(
    "real practice question enters its reviewed broadcast course; API recovery failures can retry",
  );
  await page
    .getByRole("button", { name: "文字精讲与填空练习", exact: true })
    .click();
  await expect(page.locator(".subjective-study")).toBeVisible();
  await page.getByRole("button", { name: "分步互动精讲", exact: true }).click();
  await phase("explanation");
  assert.equal((await current()).id, initial.id);
  checks.push(
    "old text lessons and fill-in practice stay accessible and preserve the selected knowledge point",
  );
  for (
    let i = 0;
    i < 10 && !(await page.locator(".tutor-network").count());
    i++
  )
    await next();
  await expect(page.locator(".tutor-network")).toBeVisible();
  await page
    .getByRole("button", { name: "从主机 A 发广播", exact: true })
    .click();
  await expect(
    page.locator(".tutor-topology:visible [data-receives=true]"),
  ).toHaveCount(3);
  await page.screenshot({
    path: "test-output/interactive-tutor-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  for (const width of [320, 375, 768, 900, 1280, 1672]) await fit(width);
  await page.setViewportSize({ width: 375, height: 941 });
  await page.screenshot({
    path: "test-output/interactive-tutor-narrow-web.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1672, height: 941 });
  checks.push(
    "guided SVG topology and fixed chapter art fit six Web widths; one teaching card unfolds at a time",
  );
  await untilQuiz();
  await expect(page.locator(".tutor-network-controls")).toHaveCount(0);
  await expect(
    page.locator(".tutor-topology [data-receives=true]"),
  ).toHaveCount(0);
  const quiz = getBundle("vlan-broadcast-domain").quizzes[0].main;
  const wrong = quiz.options.find((o) => o.id !== quiz.answer).id;
  await answer(wrong, true);
  await expect(page.locator(".tutor-feedback")).toContainText(
    quiz.branches[wrong].explanation,
  );
  assert.equal((await current()).answers.length, 1);
  await next();
  await phase("remediation");
  await expect(page.locator(".formal-tutor-cards")).toContainText(
    quiz.branches[wrong].title,
  );
  await next();
  await phase("variant");
  await answer(engine.currentQuestion(raw(await current())).answer);
  await next();
  await phase("explanation");
  checks.push(
    "Enter submits the selected option; trusted wrong-answer feedback leads to targeted remediation and a variant",
  );
  for (
    let i = 0;
    i < 10 && !(await page.locator(".tutor-network").count());
    i++
  )
    await next();
  await page
    .getByRole("button", { name: "从主机 A 发广播", exact: true })
    .click();
  await expect(
    page.locator(".tutor-topology:visible [data-receives=true]"),
  ).toHaveCount(1);
  await expect(
    page.locator('.tutor-topology:visible [data-host="B"]'),
  ).toHaveAttribute("data-receives", "true");
  await page
    .getByRole("button", { name: "从主机 C 发广播", exact: true })
    .click();
  await expect(
    page.locator('.tutor-topology:visible [data-host="D"]'),
  ).toHaveAttribute("data-receives", "true");
  await expect(
    page.locator('.tutor-topology:visible [data-host="A"]'),
  ).toHaveAttribute("data-receives", "false");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert(
    await page
      .locator(".tutor-flow.is-lit")
      .evaluateAll((ns) =>
        ns.every((n) => getComputedStyle(n).animationName === "none"),
      ),
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  checks.push(
    "VLAN 10 and 20 broadcast isolation matches the diagram; reduced motion stops the packet animation",
  );
  await untilQuiz();
  const pre = await current(),
    correct = engine.currentQuestion(raw(pre)).answer,
    bodies = [];
  await page.route("**/api/tutor/v1/sessions/*/actions", async (route) => {
    const body = route.request().postDataJSON();
    bodies.push(body);
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    if (bodies.length === 1) await route.abort("failed");
    else await route.fulfill({ response });
  });
  await page.locator(`#tutor-quiz-form input[value="${correct}"]`).check();
  await page.locator("#tutor-quiz-form button[type=submit]").click();
  await expect(page.locator(".formal-tutor-error")).toBeVisible();
  await page.locator("#tutor-quiz-form button[type=submit]").click();
  await phase("feedback");
  assert.deepEqual(bodies[0], bodies[1]);
  assert.equal((await current()).answers.length, pre.answers.length + 1);
  await page.unroute("**/api/tutor/v1/sessions/*/actions");
  await page.reload({ waitUntil: "networkidle" });
  await phase("feedback");
  assert.equal((await current()).answers.length, pre.answers.length + 1);
  const second = await contextFor(),
    p2 = await second.newPage();
  await p2.goto(base + "/#tutor", { waitUntil: "networkidle" });
  await expect(p2.locator(".formal-tutor .tutor-shell")).toHaveAttribute(
    "data-session-id",
    pre.id,
  );
  await expect(p2.locator(".formal-tutor .tutor-shell")).toHaveAttribute(
    "data-phase",
    "feedback",
  );
  await second.close();
  checks.push(
    "a lost answer acknowledgement retries the same request exactly once; reload and a new browser restore server progress",
  );
  await next();
  await phase("variant");
  const beforeChange = await current(),
    pendingQuiz = engine.currentQuestion(raw(beforeChange));
  let changedPosts = 0;
  await page.route("**/api/tutor/v1/sessions/*/actions", async (route) => {
    changedPosts++;
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    await route.abort("failed");
  });
  await page
    .locator(`#tutor-quiz-form input[value="${pendingQuiz.answer}"]`)
    .check();
  await page.locator("#tutor-quiz-form button[type=submit]").click();
  await expect(page.locator(".formal-tutor-error")).toBeVisible();
  const changed = pendingQuiz.options.find(
    (o) => o.id !== pendingQuiz.answer,
  ).id;
  await page.locator(`#tutor-quiz-form input[value="${changed}"]`).check();
  await page.locator("#tutor-quiz-form button[type=submit]").click();
  await phase("feedback");
  await expect(page.locator(".formal-tutor-error")).toContainText(
    "已恢复当前步骤",
  );
  assert.equal(changedPosts, 1);
  assert.equal(
    (await current()).answers.length,
    beforeChange.answers.length + 1,
  );
  assert.equal((await current()).answers.at(-1).selectedId, pendingQuiz.answer);
  await page.unroute("**/api/tutor/v1/sessions/*/actions");
  checks.push(
    "changing the draft after a lost acknowledgement recovers the committed answer instead of submitting an obsolete selection",
  );
  for (let i = 0; i < 70 && (await current()).phase !== "complete"; i++) {
    const s = await current();
    if (["awaiting_answer", "variant"].includes(s.phase))
      await answer(engine.currentQuestion(raw(s)).answer);
    else await next();
  }
  await phase("complete");
  const done = await current();
  assert(done.mastery.every((m) => m.status === "mastered"));
  assert(
    !store.db
      .prepare("SELECT * FROM study_progress WHERE user_id=? AND node_id=?")
      .get(user.id, done.course.nodeId),
  );
  const usage = await api("/tutor/v1/usage");
  assert.equal(usage.usage.aiCalls, 0);
  assert.equal(usage.usage.costCny, 0);
  checks.push(
    "the complete pilot has a genuine summary without completing the wider knowledge point or inventing AI usage",
  );
  // The fresh browser has no inherited pending request or selection from the previous course.
  const catalog = await api("/tutor/v1/catalog"),
    full = catalog.nodes.find((n) => n.status === "ready");
  const fullPage = await context.newPage();
  await fullPage.goto(base + "/#tutor", { waitUntil: "networkidle" });
  await fullPage
    .getByRole("combobox", { name: "互动精讲章节", exact: true })
    .selectOption(full.chapter);
  await fullPage
    .locator(".formal-tutor-directory > button")
    .filter({ has: fullPage.getByText(full.name, { exact: true }) })
    .click();
  await fullPage
    .getByRole("button", { name: "开始互动学习", exact: true })
    .click();
  page = fullPage;
  for (
    let i = 0;
    i < 100 && (await current(full.courseId)).phase !== "complete";
    i++
  ) {
    const s = await current(full.courseId);
    if (["awaiting_answer", "variant"].includes(s.phase))
      await answer(engine.currentQuestion(raw(s)).answer);
    else await next();
  }
  await phase("complete");
  assert(
    store.db
      .prepare(
        "SELECT completed_at FROM study_progress WHERE user_id=? AND node_id=?",
      )
      .get(user.id, full.id).completed_at,
  );
  checks.push(
    "a fully covered course updates the existing authenticated study progress only after all concept checks pass",
  );
  await page.goto(base + "/#practice", { waitUntil: "networkidle" });
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
    "returning to ordinary practice restores the same question and uses the original trusted grader",
  );
  store.saveAccountEntitlement(user.id, {
    plan: "vip",
    expiresAt: new Date(Date.now() + 1500).toISOString(),
  });
  await page.goto(base + "/#tutor", { waitUntil: "networkidle" });
  await expect(page.locator(".formal-tutor-gate")).toContainText(
    "选择适合自己的学习额度",
    { timeout: 15000 },
  );
  await expect(page.locator(".tutor-shell")).toHaveCount(0);
  checks.push(
    "real membership expiry clears the displayed course and shows the account gate",
  );
  const free = await store.registerAsync("tutor-free", "fixture-password-123");
  store.selectCertificate(free.id, "network-engineer");
  const fc = await contextFor(store.createAuthSession(free.id)),
    fp = await fc.newPage();
  await fp.goto(base + "/#tutor", { waitUntil: "networkidle" });
  await expect(fp.locator(".formal-tutor-gate")).toContainText(
    "选择适合自己的学习额度",
  );
  await expect(fp.locator(".tutor-shell")).toHaveCount(0);
  await fc.close();
  checks.push(
    "a different free account sees the real membership gate and none of the other learner's course history",
  );
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    "test-output/interactive-tutor-report.json",
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
        path: "test-output/interactive-tutor-failure.png",
        fullPage: true,
      })
      .catch(() => {});
  fs.writeFileSync(
    "test-output/interactive-tutor-report.json",
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
  await new Promise((resolve) => server.close(resolve));
  store.db.close();
  assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
  assert(path.basename(directory).startsWith("aceexam-tutor-ui-"));
  fs.rmSync(directory, { recursive: true, force: true });
}
