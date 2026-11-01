import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { chromium, expect } from "@playwright/test";

const base =
  process.env.ACEEXAM_DEMO_URL || "http://127.0.0.1:4177/demo/home-blue/";
const origin = new URL(base).origin,
  prefix = origin + "/api/demo/tutor/v1";
const output = path.resolve("outputs/home-blue-demo");
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  proxy: { server: "http://127.0.0.1:9", bypass: "localhost,127.0.0.1" },
});
const contexts = [],
  pageErrors = [],
  external = [],
  passed = [];
async function open(route = "ai", options = {}) {
  const c = await browser.newContext({
    viewport: { width: 1672, height: 941 },
    timezoneId: "Asia/Shanghai",
    ...options,
  });
  contexts.push(c);
  const p = await c.newPage();
  p.on("pageerror", (error) => pageErrors.push(error.message));
  p.on("request", (r) => {
    if (!r.url().startsWith(origin) && !r.url().startsWith("data:"))
      external.push(r.url());
  });
  await p.goto(base + "#" + route, { waitUntil: "networkidle" });
  return p;
}
const action = (p, name) =>
  p.locator(`#ai-page [data-tutor-action="${name}"]`).first().click();
const phase = (p, value) =>
  expect(p.locator(".tutor-shell[data-tutor-phase]")).toHaveAttribute(
    "data-tutor-phase",
    value,
  );
const view = (p) => p.evaluate(() => AceTutorDemo.snapshot());
async function pilot(p, foundation = "review") {
  await expect(p.locator('[data-tutor-action="pilot"]')).toBeVisible();
  await action(p, "pilot");
  await expect(p.locator("#tutor-intro-title")).toBeVisible();
  await expect(p.locator('[data-tutor-action="start"]')).toBeEnabled();
  await p
    .locator(`input[name="tutor-foundation"][value="${foundation}"]`)
    .check();
  await action(p, "start");
  await phase(p, "explanation");
}
async function answer(p, option) {
  await p.locator(`#tutor-quiz-form input[value="${option}"]`).check();
  await p.locator("#tutor-quiz-form button[type=submit]").click();
  await phase(p, "feedback");
}
async function proceed(p, target) {
  for (let step = 0; step < 10; step++) {
    const before = await view(p);
    await action(p, "next");
    await p.waitForFunction((r) => AceTutorDemo.snapshot()?.revision > r, before.revision);
    if (target !== "awaiting_answer" || (await view(p)).phase !== "explanation") break;
  }
  await phase(p, target);
}
async function showDiagram(p) {
  for (let step = 0; step < 9; step++) {
    const s = await view(p);
    if (s.lesson.components.some((c) => c.type === "NetworkDiagram")) return;
    assert.equal(s.phase, "explanation");
    const revision = s.revision;
    await action(p, "next");
    await p.waitForFunction((r) => AceTutorDemo.snapshot()?.revision > r, revision);
  }
  throw new Error("没有在已解锁的讲解步骤中找到图解");
}
async function noOverflow(p) {
  const size = await p.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    overflow: [
      ...document.querySelectorAll(
        "#ai-page .tutor-shell, #ai-page .tutor-network, #ai-page .tutor-option",
      ),
    ]
      .filter((el) => el.scrollWidth > el.clientWidth + 2)
      .map((el) => el.className),
  }));
  assert.ok(size.document <= size.viewport + 2, JSON.stringify(size));
  assert.deepEqual(size.overflow, []);
}
async function shot(p, name) {
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: path.join(output, name), fullPage: true });
}
async function contrast(p) {
  const result = await p.evaluate(() => {
    const color = (value) => {
      const values = value.match(/[\d.]+/g)?.map(Number);
      return values?.length >= 3
        ? [values[0], values[1], values[2], values[3] ?? 1]
        : [0, 0, 0, 0];
    };
    const luminosity = (rgb) =>
      rgb
        .slice(0, 3)
        .map((v) => v / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const background = (el) => {
      const layers = [];
      for (let parent = el; parent; parent = parent.parentElement)
        layers.push(color(getComputedStyle(parent).backgroundColor));
      let result =
        document.documentElement.dataset.theme === "dark"
          ? [16, 25, 43]
          : [255, 255, 255];
      for (const layer of layers.reverse())
        result = result.map((v, i) => layer[i] * layer[3] + v * (1 - layer[3]));
      return result;
    };
    const nodes = [
      ...document.querySelectorAll(
        "#ai-page .tutor-shell p, #ai-page .tutor-shell h3, #ai-page .tutor-shell small, #ai-page .tutor-shell li, #ai-page .tutor-shell legend, #ai-page .tutor-shell span, #ai-page .tutor-shell .ai-button",
      ),
    ].filter(
      (el) =>
        (el.childElementCount === 0 || el.matches(".ai-button")) &&
        el.textContent.trim() &&
        el.getBoundingClientRect().width > 0 &&
        el.getBoundingClientRect().height > 0 &&
        !el.closest("svg"),
    );
    const issues = [];
    for (const el of nodes) {
      const style = getComputedStyle(el),
        bg = background(el),
        fg = color(style.color);
      const a = luminosity(
          fg.map((v, i) => (i < 3 ? v * fg[3] + bg[i] * (1 - fg[3]) : v)),
        ),
        b = luminosity(bg);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const large =
        parseFloat(style.fontSize) >= 24 ||
        (parseFloat(style.fontSize) >= 18.66 &&
          Number(style.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5))
        issues.push({
          text: el.textContent.trim().slice(0, 30),
          ratio: Number(ratio.toFixed(2)),
          color: style.color,
        });
    }
    return { measured: nodes.length, issues };
  });
  assert.deepEqual(result.issues, []);
  return result;
}

try {
  const p = await open();
  await expect(p.locator(".ai-key-point")).toHaveCount(1);
  await expect(p.locator(".ai-example")).toHaveCount(0);
  await p.locator('[data-ai-action="read-next"]').click();
  await expect(p.locator(".ai-reading-progress")).toContainText("第 2");
  await p.reload({ waitUntil: "networkidle" });
  await expect(p.locator(".ai-reading-progress")).toContainText("第 2");
  passed.push("现有精讲每次展示一个要点，阅读位置刷新恢复");

  await pilot(p, "beginner");
  await expect(p.locator("#ai-lesson-title")).toHaveText("VLAN 广播域");
  await expect(p.locator("#ai-tab-tutor")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(p.locator(".tutor-explanation")).toHaveCount(1);
  await expect(p.locator(".tutor-stage")).not.toContainText("Access 端口通常");
  await expect(p.locator(".tutor-network")).toHaveCount(0);
  const firstCard = await view(p);
  await action(p, "next");
  await p.waitForFunction((r) => AceTutorDemo.snapshot()?.revision > r, firstCard.revision);
  await expect(p.locator(".tutor-reading")).toContainText("第 2 / 4 步");
  const reading = await view(p);
  await p.reload({ waitUntil: "networkidle" });
  await phase(p, "explanation");
  assert.equal((await view(p)).stepId, reading.stepId);
  assert.equal((await view(p)).revision, reading.revision);
  await action(p, "back");
  await p.waitForFunction((r) => AceTutorDemo.snapshot()?.revision > r, reading.revision);
  assert.equal((await view(p)).stepId, firstCard.stepId);
  await expect(p.locator(".tutor-network")).toHaveCount(0);
  passed.push("概念内逐卡片展开，阅读位置刷新恢复，上一段由服务端保存");
  await shot(p, "tutor-guided-reading-desktop.png");
  await showDiagram(p);
  await shot(p, "tutor-forwarding-desktop.png");
  await p.locator('.tutor-network [data-source="A"]').click();
  await expect(p.locator(".tutor-network-result")).toContainText(
    "B、C、D 收到",
  );
  await expect(
    p.locator('.tutor-topology.is-desktop [data-host="A"]'),
  ).toHaveAttribute("data-receives", "false");
  await expect(
    p.locator('.tutor-topology.is-desktop [data-host="B"]'),
  ).toHaveAttribute("data-receives", "true");
  await proceed(p, "awaiting_answer");
  await expect(p.locator(".tutor-network-controls")).toHaveCount(0);
  await expect(p.locator(".tutor-correct-answer")).toHaveCount(0);
  const first = await view(p),
    q = first.lesson.components.find((c) => c.type === "MiniQuiz");
  assert.equal(q.id, "forwarding-check");
  assert.ok(!("answer" in q) && !("branches" in q) && !("correctId" in q));
  await p.locator("#tutor-quiz-form button[type=submit]").click();
  await expect(p.locator("#tutor-answer-error")).toContainText("先选一个答案");
  await p.locator('input[name="tutor-answer"][value="c"]').check();
  await p.reload({ waitUntil: "networkidle" });
  await phase(p, "awaiting_answer");
  await expect(
    p.locator('input[name="tutor-answer"][value="c"]'),
  ).toBeChecked();
  await p.locator("#tutor-quiz-form button[type=submit]").click();
  await phase(p, "feedback");
  await expect(p.locator(".tutor-feedback.correct")).toBeVisible();
  await expect(p.locator(".tutor-feedback")).toBeFocused();
  await proceed(p, "variant");
  await answer(p, "a");
  await proceed(p, "explanation");
  assert.equal((await view(p)).conceptIndex, 1);
  passed.push("入口可用、教学逐段展开、小测答案隐藏、选择与服务端课程位置恢复");

  await showDiagram(p);
  await p.locator('.tutor-network [data-source="A"]').click();
  await expect(p.locator(".tutor-network-result")).toContainText("B 收到");
  await expect(
    p.locator('.tutor-topology.is-desktop [data-host="C"]'),
  ).toHaveAttribute("data-receives", "false");
  await p.locator('.tutor-network [data-source="C"]').click();
  await expect(p.locator(".tutor-network-result")).toContainText("D 收到");
  await shot(p, "tutor-vlan-desktop.png");
  await proceed(p, "awaiting_answer");
  await answer(p, "a");
  await expect(p.locator("#tutor-feedback-title")).toHaveText(
    "把同一交换机当成同一广播域",
  );
  await shot(p, "tutor-correction-desktop.png");
  await proceed(p, "remediation");
  await expect(p.locator(".tutor-explanation")).toContainText("两个广播域");
  const correction = await view(p);
  await p.reload({ waitUntil: "networkidle" });
  await phase(p, "remediation");
  assert.equal((await view(p)).id, correction.id);
  assert.equal((await view(p)).stepId, correction.stepId);
  await proceed(p, "variant");
  await expect(
    p.locator('.tutor-stage .tutor-topology.is-desktop [data-host="C"]'),
  ).toContainText("本图发送端");
  await answer(p, "d");
  await proceed(p, "explanation");
  await showDiagram(p);
  await expect(p.locator(".tutor-access-path")).toBeVisible();
  await proceed(p, "awaiting_answer");
  await answer(p, "a");
  await proceed(p, "variant");
  await answer(p, "c");
  await proceed(p, "complete");
  await expect(p.locator("#tutor-summary-title")).toContainText("都通过了检验");
  await expect(p.locator(".tutor-mastery-tag.mastered")).toHaveCount(3);
  await expect(
    p.locator('[data-ai-node="network-engineer:03.02.01"] .is-learned'),
  ).toHaveCount(0); // The pilot covers only part of this knowledge point.
  await expect(p.locator(".tutor-error-summary")).toContainText(
    "已通过后续检验",
  );
  await shot(p, "tutor-summary-desktop.png");
  const usageResponse = await p.context().request.get(prefix + "/usage");
  const usage = (await usageResponse.json()).usage;
  assert.equal(usage.aiCalls, 0);
  assert.equal(usage.ruleSubmissions, 6);
  assert.equal(usage.totalTokens, 0);
  assert.equal(usage.costCny, 0);
  await p.reload({ waitUntil: "networkidle" });
  await phase(p, "complete");
  await action(p, "review");
  await expect(p.locator("#demo-dialog")).toBeVisible();
  await expect(p.locator("#dialog-content .tutor-review-dialog")).toContainText(
    "广播",
  );
  await p.locator(".close-dialog").click();
  passed.push(
    "广播图解与 VLAN 归属一致、针对性补课、变式判分、掌握总结与真实用量记录",
  );

  const legacy = await open();
  const oldResponse = await legacy.context().request.post(prefix + "/sessions", {
    data: { courseId: "vlan-broadcast-domain", foundation: "review", requestId: crypto.randomUUID() },
  });
  assert.equal(oldResponse.status(), 200);
  const oldSession = (await oldResponse.json()).session;
  await action(legacy, "pilot");
  await phase(legacy, "explanation");
  await action(legacy, "guide");
  await legacy.waitForFunction((id) => AceTutorDemo.snapshot()?.id === id && AceTutorDemo.snapshot()?.pacing === "guided", oldSession.id);
  assert.equal((await view(legacy)).reading.index, 0);
  assert.deepEqual((await view(legacy)).answers, oldSession.answers);
  await expect(legacy.locator(".tutor-network")).toHaveCount(0);
  passed.push("旧会话可切换分步讲解，保留会话与已保存成绩");

  const wrongTitles = [];
  for (const wrong of ["a", "b", "d"]) {
    const w = await open();
    await pilot(w);
    await proceed(w, "awaiting_answer");
    await answer(w, wrong);
    wrongTitles.push(await w.locator("#tutor-feedback-title").textContent());
    await proceed(w, "remediation");
    await expect(w.locator(".tutor-explanation")).toContainText(
      wrongTitles.at(-1),
    );
    await proceed(w, "variant");
    await answer(w, "a");
    await expect(w.locator(".tutor-feedback.correct")).toBeVisible();
  }
  assert.equal(new Set(wrongTitles).size, 3);
  passed.push("不同错误选项触发不同反馈与补课内容，不改变正确变式判分");

  const broken = await open();
  await pilot(broken);
  await proceed(broken, "awaiting_answer");
  const before = await view(broken);
  await broken.route("**/api/demo/tutor/v1/sessions/*/actions", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "TUTOR_UNAVAILABLE",
          message: "课程连接暂时不可用，已保留当前进度。",
        },
      }),
    }),
  );
  await broken.locator('input[name="tutor-answer"][value="c"]').check();
  await broken.locator("#tutor-quiz-form button[type=submit]").click();
  await expect(broken.locator(".tutor-connection")).toContainText("已保留");
  assert.equal((await view(broken)).revision, before.revision);
  await expect(
    broken.locator('input[name="tutor-answer"][value="c"]'),
  ).toBeChecked();
  await broken.unroute("**/api/demo/tutor/v1/sessions/*/actions");
  await action(broken, "retry-request");
  await phase(broken, "feedback");
  assert.equal((await view(broken)).usage.ruleSubmissions, 1);
  await broken.route("**/api/demo/tutor/v1/sessions/current*", (route) =>
    route.abort("failed"),
  );
  await broken.reload({ waitUntil: "networkidle" });
  await expect(broken.locator(".tutor-connection")).toBeVisible();
  await expect(broken.locator(".tutor-feedback.correct")).toBeVisible();
  await expect(broken.locator('[data-tutor-action="next"]')).toBeDisabled();
  await broken.unroute("**/api/demo/tutor/v1/sessions/current*");
  await action(broken, "reconnect");
  await expect(broken.locator('[data-tutor-action="next"]')).toBeEnabled();
  passed.push("API 失败保留当前选择与内容、阻止未经确认的判分、重试不重复记录");

  const exercise = await open("chapters");
  await exercise.locator('#chapter-catalogue [data-chapter="2"]').click();
  await exercise
    .locator('#chapters-page [data-action="configured-practice"]')
    .first()
    .click();
  await expect(exercise.locator("#study-question-text")).toBeVisible();
  await exercise.locator("[data-study-option]").first().click();
  const ordinary = await exercise.evaluate(() => ({
    session: structuredClone(AceStudyFlow.activeSession()),
    stats: structuredClone(AceStudyFlow.state().stats),
    wrong: structuredClone(AceStudyFlow.state().wrongBook),
  }));
  await exercise.locator("[data-study-tutor]").click();
  await expect(exercise.locator("#ai-lesson-title")).toBeVisible();
  assert.equal(
    (await exercise.evaluate(() => AceAiStudyDemo.current())).chapter,
    "办公自动化",
  );
  await action(exercise, "pilot");
  await expect(exercise.locator("#tutor-intro-title")).toBeVisible();
  await expect(
    exercise.locator('[data-tutor-action="return-question"]'),
  ).toBeVisible();
  await action(exercise, "return-question");
  await expect(exercise.locator("#study-question-text")).toBeVisible();
  const restored = await exercise.evaluate(() => ({
    session: structuredClone(AceStudyFlow.activeSession()),
    stats: structuredClone(AceStudyFlow.state().stats),
    wrong: structuredClone(AceStudyFlow.state().wrongBook),
  }));
  assert.equal(restored.session.id, ordinary.session.id);
  assert.equal(restored.session.index, ordinary.session.index);
  assert.deepEqual(restored.session.selections, ordinary.session.selections);
  const { studiedMs: beforeTime, ...beforeStats } = ordinary.stats;
  const { studiedMs: afterTime, ...afterStats } = restored.stats;
  assert.deepEqual(afterStats, beforeStats);
  assert.ok(afterTime >= beforeTime && afterTime - beforeTime < 5000);
  assert.deepEqual(restored.wrong, ordinary.wrong);
  await exercise.locator('[data-study-action="primary"]').click();
  await expect(exercise.locator(".study-analysis")).toBeVisible();
  passed.push(
    "普通题目可进入对应知识点精讲并返回，保留选择与位置，原有判分和错题流程可用",
  );

  const narrow = await open("ai", {
    viewport: { width: 375, height: 812 },
    reducedMotion: "reduce",
  });
  await pilot(narrow);
  await showDiagram(narrow);
  await narrow.locator('.tutor-network [data-source="A"]').click();
  await expect(narrow.locator(".tutor-topology.is-mobile")).toBeVisible();
  assert.equal(
    await narrow
      .locator(".tutor-flow.is-lit")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  const layouts = [];
  for (const width of [320, 375, 768, 1280, 1672, 1920]) {
    await narrow.setViewportSize({ width, height: width < 600 ? 812 : 941 });
    for (const theme of ["light", "dark"]) {
      await narrow.evaluate(
        ({ theme, width }) => {
          document.documentElement.dataset.theme = theme;
          document.documentElement.dataset.font =
            width < 600 ? "large" : "standard";
        },
        { theme, width },
      );
      await noOverflow(narrow);
      layouts.push({ width, theme, contrast: await contrast(narrow) });
      if (
        (width === 375 && theme === "light") ||
        (width === 1672 && theme === "dark")
      )
        await shot(narrow, `tutor-${theme}-${width}.png`);
    }
  }
  await narrow.setViewportSize({ width: 375, height: 812 });
  await proceed(narrow, "awaiting_answer");
  await noOverflow(narrow);
  await narrow.locator('#tutor-quiz-form input[value="c"]').focus();
  await narrow.keyboard.press("Space");
  await narrow.keyboard.press("Enter");
  await phase(narrow, "feedback");
  await noOverflow(narrow);
  passed.push(
    "六种浏览器宽度、浅深色、大字号、减少动画、键盘与窄屏作答检查通过",
  );

  const deep = await open("home");
  await deep.goto(base + "?v=tutor-23&lesson=vlan#ai", {
    waitUntil: "networkidle",
  });
  await expect(deep.locator("#tutor-intro-title")).toBeVisible();
  await expect(deep.locator("#certificate-switch")).toContainText("网络工程师");
  await expect(deep.locator("#ai-tab-tutor")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const injection = await deep.evaluate(() => {
    const host = document.createElement("div");
    host.innerHTML = AceTutorRenderer.render({
      schemaVersion: 1,
      components: [
        {
          type: "ExplanationCard",
          id: "safe-escape",
          title: "文本安全",
          paragraphs: [
            '<img src="x" onerror="window.tutorInjected=true">',
            "<script>window.tutorInjected=true</script>",
          ],
        },
      ],
    });
    document.body.append(host);
    const activeTags = host.querySelectorAll("script,img").length,
      visibleText = host.textContent;
    host.remove();
    let rejected = false;
    try {
      AceTutorRenderer.render({
        schemaVersion: 1,
        components: [
          { type: "HTML", id: "bad", html: "<script>run()</script>" },
        ],
      });
    } catch {
      rejected = true;
    }
    return {
      activeTags,
      visibleText,
      rejected,
      executed: !!window.tutorInjected,
    };
  });
  assert.equal(injection.activeTags, 0);
  assert.equal(injection.executed, false);
  assert.equal(injection.rejected, true);
  assert.match(injection.visibleText, /<script>/);
  await shot(deep, "tutor-intro-desktop.png");
  await deep.reload({ waitUntil: "networkidle" });
  await expect(deep.locator("#tutor-intro-title")).toBeVisible();
  await deep.evaluate(() => AceAiStudyDemo.nextNode());
  await expect(deep.locator("#ai-lesson-title")).toHaveText(
    "Access、Trunk与Hybrid端口",
  );
  await deep.reload({ waitUntil: "networkidle" });
  await expect(deep.locator("#ai-lesson-title")).toHaveText(
    "Access、Trunk与Hybrid端口",
  );
  passed.push("互动课程直达链接与客户端文本转义、未知组件拒绝验证通过");

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(external, []);
  fs.writeFileSync(
    path.join(output, "tutor-e2e-report.json"),
    JSON.stringify({ passed, layouts, usage, pageErrors, external }, null, 2),
  );
  console.log(JSON.stringify({ passed, pageErrors, external }, null, 2));
} catch (error) {
  fs.writeFileSync(
    path.join(output, "tutor-e2e-failure.json"),
    JSON.stringify(
      { error: error.stack, passed, pageErrors, external },
      null,
      2,
    ),
  );
  for (let i = 0; i < contexts.length; i++) {
    const p = contexts[i].pages()[0];
    if (p && !p.isClosed())
      await p
        .screenshot({
          path: path.join(output, `tutor-failure-${i}.png`),
          fullPage: true,
        })
        .catch(() => {});
  }
  throw error;
} finally {
  await browser.close();
}
