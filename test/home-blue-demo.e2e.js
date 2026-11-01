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
const errors = [];
const passed = [];
const contexts = [];
async function open(route = "chapters", width = 1672) {
  const context = await browser.newContext({
    viewport: { width, height: 941 },
    timezoneId: "Asia/Shanghai",
  });
  contexts.push(context);
  const page = await context.newPage();
  // Keep the reference Saturday plan fixture stable across weekdays.
  await page.clock.setFixedTime(new Date("2026-10-10T12:00:00+08:00"));
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(base + "#" + route, { waitUntil: "networkidle" });
  return page;
}
const stored = (page) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("aceexam.home-blue.study.v1")),
  );
async function currentQuestion(page) {
  return page.evaluate(() => {
    const state = JSON.parse(
      localStorage.getItem("aceexam.home-blue.study.v1"),
    );
    const session = state.sessions.find(
      (item) => item.id === state.activeSessionId,
    );
    return studyQuestionData.find(
      (question) => question.id === session.qids[session.index],
    );
  });
}
async function startChapter(page, index) {
  await page.locator('.sidebar [data-action="chapters"]').click();
  await page
    .locator('#chapter-catalogue [data-chapter="' + index + '"]')
    .click();
  await page
    .locator('#chapters-page [data-action="configured-practice"]')
    .first()
    .click();
  await expect(page.locator("#practice-page")).toBeVisible();
}
async function answerCorrect(page) {
  const question = await currentQuestion(page);
  for (const index of question.answers)
    await page.locator('[data-study-option="' + index + '"]').click();
  await page.locator('[data-study-action="primary"]').click();
  await expect(page.locator(".study-analysis")).toContainText("回答正确");
}
try {
  const page = await open();
  const integrity = await page.evaluate(() => ({
    count: studyQuestionData.length,
    unique: new Set(studyQuestionData.map((question) => question.id)).size,
    types: [...new Set(studyQuestionData.map((question) => question.type))],
    valid: studyQuestionData.every(
      (question) =>
        question.answers.length &&
        question.answers.every(
          (index) => index >= 0 && index < question.options.length,
        ),
    ),
  }));
  assert.equal(integrity.count, 206);
  assert.equal(integrity.unique, 206);
  assert.equal(integrity.valid, true);
  assert.deepEqual(integrity.types.sort(), [
    "multiple_choice",
    "single_choice",
    "true_false",
  ]);
  await expect(page.locator("#chapter-catalogue .chapter-card")).toHaveCount(7);
  passed.push("七章 206 道题与三种题型");

  await startChapter(page, 0);
  await expect(page.locator("#practice-title")).toHaveText("计算机基础知识");
  await expect(page.locator("#practice-total")).toHaveText("10");
  const firstQuestion = await currentQuestion(page);
  const wrongOption = firstQuestion.options.findIndex(
    (_, index) => !firstQuestion.answers.includes(index),
  );
  await page.locator('[data-study-option="' + wrongOption + '"]').click();
  await page.locator('[data-study-action="primary"]').click();
  await expect(
    page.locator('.answer-jump[data-question-jump="0"]'),
  ).toHaveClass(/wrong/);
  await expect(page.locator(".study-analysis")).toContainText(
    "正确答案 " +
      firstQuestion.answers
        .map((index) => String.fromCharCode(65 + index))
        .join("、"),
  );
  await expect(page.locator(".nav-badge")).toHaveText("3");
  await page.locator('[data-study-action="primary"]').click();
  await answerCorrect(page);
  await expect(page.locator("#sheet-accuracy")).toHaveText("50%");
  await expect(page.locator("#practice-answered")).toHaveText("2");
  const favoritesBeforeClick = (await stored(page)).favorites;
  const favoriteQuestion = await currentQuestion(page);
  const favoriteCountAfterClick =
    favoritesBeforeClick.length +
    (favoritesBeforeClick.includes(favoriteQuestion.id) ? -1 : 1);
  await page.locator('[data-study-action="favorite"]').click();
  await expect(page.locator('[data-study-action="favorite"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator('[data-study-action="feedback"]').click();
  await page
    .locator("#study-feedback-form textarea")
    .fill("这道题的解析很清楚，保存一下演示反馈。");
  await page.locator('#study-feedback-form button[type="submit"]').click();
  await expect(page.locator("#demo-dialog")).not.toBeVisible();
  await page.locator('[data-study-action="primary"]').click();
  await page.locator('[data-study-option="2"]').click();
  const beforeReload = await stored(page);
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("#practice-answered")).toHaveText("2");
  await expect(page.locator('[data-study-option="2"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const restored = await stored(page);
  assert.equal(restored.feedback.length, 1);
  assert.equal(restored.favorites.length, favoriteCountAfterClick);
  assert.equal(restored.stats.todayCount, beforeReload.stats.todayCount);
  await page.locator('.sidebar [data-action="favorites"]').click();
  await expect(page.locator("#favorites-page")).toBeVisible();
  await expect(page.locator("#favorites-question-count")).toHaveText(
    String(favoriteCountAfterClick),
  );
  await page.goBack();
  await expect(page.locator("#practice-page")).toBeVisible();
  passed.push("单选判分、错题、收藏、反馈与刷新恢复");
  await page.locator('.sidebar [data-action="plan"]').click();
  const pausedState = await stored(page);
  const pausedElapsed = pausedState.sessions.find(
    (session) => session.id === pausedState.activeSessionId,
  ).elapsedMs;
  await page.waitForTimeout(1300);
  await page.locator('.sidebar [data-action="chapters"]').click();
  await page
    .locator('#chapters-page [data-action="configured-practice"]')
    .first()
    .click();
  const resumedState = await stored(page);
  const resumedElapsed = resumedState.sessions.find(
    (session) => session.id === resumedState.activeSessionId,
  ).elapsedMs;
  assert.ok(resumedElapsed - pausedElapsed < 600, "离开练习页时应暂停计时");
  passed.push("离开练习页自动暂停计时");

  await page.locator('[data-study-action="finish"]').click();
  await expect(page.locator("#demo-dialog")).toContainText("还有 8 题未完成");
  await page.locator('[data-study-action="finish-confirm"]').click();
  await expect(page.locator("#report-page")).toBeVisible();
  await expect(page.locator(".study-report-values")).toContainText("50%");
  await expect(page.locator(".report-question")).toHaveCount(10);
  await page.locator('[data-study-review="0"]').click();
  await expect(page.locator(".study-analysis")).toBeVisible();
  await expect(page.locator(".study-option:disabled")).toHaveCount(4);
  await page.locator('[data-study-action="finish"]').click();
  await page.locator('[data-study-action="retry-wrong"]').click();
  await expect(page.locator("#practice-total")).toHaveText("1");
  await answerCorrect(page);
  await page.locator('[data-study-action="primary"]').click();
  await expect(page.locator(".study-report-values")).toContainText("100%");
  await expect(page.locator(".nav-badge")).toHaveText("2");
  passed.push("提前结束、报告回顾和本轮错题重练");

  const multipleNegative = await open();
  await multipleNegative
    .locator('[data-setting="count"][data-value="all"]')
    .click();
  await startChapter(multipleNegative, 0);
  const incompleteIndex = await multipleNegative.evaluate(() => {
    const state = JSON.parse(
      localStorage.getItem("aceexam.home-blue.study.v1"),
    );
    const session = state.sessions.find(
      (item) => item.id === state.activeSessionId,
    );
    return session.qids.findIndex((id) => {
      const question = studyQuestionData.find((item) => item.id === id);
      return question.type === "multiple_choice" && question.answers.length > 1;
    });
  });
  assert.ok(incompleteIndex >= 0);
  await multipleNegative
    .locator('[data-question-jump="' + incompleteIndex + '"]')
    .click();
  const multiQuestion = await currentQuestion(multipleNegative);
  await multipleNegative
    .locator('[data-study-option="' + multiQuestion.answers[0] + '"]')
    .click();
  await multipleNegative.locator('[data-study-action="primary"]').click();
  await expect(multipleNegative.locator(".study-analysis")).toHaveClass(
    /is-wrong/,
  );
  await expect(multipleNegative.locator("#sheet-accuracy")).toHaveText("0%");
  passed.push("多选漏选按错误处理");

  const typed = await open();
  await typed.locator('[data-setting="count"][data-value="all"]').click();
  await startChapter(typed, 0);
  const typedIndices = await typed.evaluate(() => {
    const state = JSON.parse(
      localStorage.getItem("aceexam.home-blue.study.v1"),
    );
    const session = state.sessions.find(
      (item) => item.id === state.activeSessionId,
    );
    const questions = session.qids.map((id) =>
      studyQuestionData.find((question) => question.id === id),
    );
    return {
      multi: questions.findIndex(
        (question) => question.type === "multiple_choice",
      ),
      judge: questions.findIndex((question) => question.type === "true_false"),
    };
  });
  assert.ok(typedIndices.multi >= 0 && typedIndices.judge >= 0);
  await typed
    .locator('[data-question-jump="' + typedIndices.multi + '"]')
    .click();
  await expect(typed.locator(".question-type")).toHaveText("多选题");
  await answerCorrect(typed);
  await typed
    .locator('[data-question-jump="' + typedIndices.judge + '"]')
    .click();
  await expect(typed.locator(".question-type")).toHaveText("判断题");
  await typed.locator("#study-question-text").focus();
  const judge = await currentQuestion(typed);
  await typed.keyboard.press(String(judge.answers[0] + 1));
  await typed.keyboard.press("Enter");
  await expect(typed.locator(".study-analysis")).toContainText("回答正确");
  await typed.locator('[data-question-jump="0"]').click();
  const recordsBeforeBack = await stored(typed);
  await typed.locator('[data-study-mode="memorize"]').click();
  await expect(typed.locator(".study-analysis")).toContainText("参考答案");
  await expect(typed.locator(".study-primary")).toHaveText("标记已学");
  await typed.locator(".study-primary").click();
  await expect(typed.locator("#sheet-answered")).toHaveText("3");
  await expect(typed.locator("#sheet-accuracy")).toHaveText("100%");
  await typed.locator('[data-study-mode="practice"]').click();
  await expect(typed.locator("#practice-progress-label")).toHaveText("已完成");
  const recordsAfterBack = await stored(typed);
  assert.equal(
    recordsBeforeBack.stats.answeredTotal,
    recordsAfterBack.stats.answeredTotal,
  );
  passed.push("多选、判断、键盘快捷键与背题记录");

  await typed.locator('.sidebar [data-action="chapters"]').click();
  await typed.locator('[data-setting="count"][data-value="10"]').click();
  for (const index of [1, 2, 3, 4, 5, 6]) {
    await startChapter(typed, index);
    await expect(typed.locator("#practice-title")).toHaveText(
      [
        "计算机基础知识",
        "计算机软硬件基础",
        "办公自动化",
        "算法与程序设计",
        "数据库技术",
        "网络与信息安全",
        "计算机新技术",
      ][index],
    );
    await expect(typed.locator("#practice-total")).toHaveText(
      String([10, 10, 10, 10, 5, 10, 7][index]),
    );
  }
  await typed.locator('.sidebar [data-action="chapters"]').click();
  await typed.locator('#chapter-catalogue [data-chapter="1"]').click();
  await typed.locator('[data-setting="mode"][data-value="random"]').click();
  await typed.locator('[data-setting="range"][data-value="new"]').click();
  await typed.locator('[data-setting="count"][data-value="20"]').click();
  await typed
    .locator('#chapters-page [data-action="configured-practice"]')
    .first()
    .click();
  await expect(typed.locator("#practice-total")).toHaveText("20");
  const randomState = await stored(typed);
  const randomSession = randomState.sessions.find(
    (session) => session.id === randomState.activeSessionId,
  );
  assert.equal(new Set(randomSession.qids).size, 20);
  assert.equal(
    randomSession.qids.some((id) => randomState.records[id]),
    false,
  );
  passed.push("所有章节入口、随机、未做范围与题量设置");

  const plan = await open("plan");
  await expect(plan.locator("#plan-week-done")).toHaveText("8");
  await expect(plan.locator("#plan-week-total")).toHaveText("14");
  await expect(plan.locator("#plan-day-done")).toHaveText("1");
  await plan.mouse.move(1, 1);
  await plan.screenshot({
    path: path.join(output, "study-plan-final.png"),
    fullPage: true,
  });
  await plan.locator('[data-plan-task-start="today-office"]').click();
  await expect(plan.locator("#practice-answered")).toHaveText("3");
  await expect(plan.locator(".study-question-top")).toContainText("第 4 题");
  await plan.mouse.move(1, 1);
  await plan.screenshot({
    path: path.join(output, "practice-page-final.png"),
    fullPage: true,
  });
  for (let index = 3; index < 10; index++) {
    await answerCorrect(plan);
    await plan.locator('[data-study-action="primary"]').click();
  }
  await expect(plan.locator("#report-page")).toBeVisible();
  await plan.locator('#report-page [data-action="plan"]').click();
  await expect(plan.locator("#plan-day-done")).toHaveText("2");
  await plan.locator('[data-plan-task-start="today-review"]').click();
  const reviewCount = Number(
    await plan.locator("#practice-total").textContent(),
  );
  for (let index = 0; index < reviewCount; index++) {
    await answerCorrect(plan);
    await plan.locator('[data-study-action="primary"]').click();
  }
  await plan.locator('#report-page [data-action="plan"]').click();
  await expect(plan.locator("#plan-day-done")).toHaveText("3");
  await expect(plan.locator("#plan-day-percent")).toHaveText("100%");
  await plan.reload({ waitUntil: "networkidle" });
  await expect(plan.locator("#plan-day-done")).toHaveText("3");
  passed.push("计划任务续练、完成自动同步与刷新保留");

  const originalRange = await plan.locator("#plan-week-range").textContent();
  await plan.locator('[data-plan-week="1"]').click();
  assert.notEqual(
    await plan.locator("#plan-week-range").textContent(),
    originalRange,
  );
  await plan.locator('[data-action="plan-today"]').click();
  await expect(plan.locator("#plan-week-range")).toHaveText(originalRange);
  await plan.locator('[data-plan-phase="2"]').click();
  assert.notEqual(
    await plan.locator("#plan-week-range").textContent(),
    originalRange,
  );
  await plan.locator('[data-action="plan-today"]').click();
  await plan.locator('[data-action="add-plan-task"]').first().click();
  await plan
    .locator('#study-task-form select[name="kind"]')
    .selectOption("custom");
  await plan
    .locator('#study-task-form input[name="title"]')
    .fill("复习函数与快捷键");
  await plan.locator('#study-task-form input[name="minutes"]').fill("8");
  await plan.locator('#study-task-form button[type="submit"]').click();
  const added = plan
    .locator(".plan-task")
    .filter({ hasText: "复习函数与快捷键" });
  await expect(added).toHaveCount(1);
  await added.locator("[data-plan-task-start]").click();
  await expect(added).toContainText("已完成");
  await added.locator("[data-plan-remove]").click();
  await expect(added).toHaveCount(0);
  await plan.locator("[data-plan-undo]").click();
  await expect(added).toHaveCount(1);
  await plan.locator('[data-action="add-plan-task"]').first().click();
  await plan
    .locator('#study-task-form select[name="chapter"]')
    .selectOption("4");
  await plan
    .locator('#study-task-form input[name="title"]')
    .fill("数据库专项练习");
  await plan.locator('#study-task-form input[name="count"]').fill("2");
  await plan.locator('#study-task-form button[type="submit"]').click();
  const databaseTask = plan
    .locator(".plan-task")
    .filter({ hasText: "数据库专项练习" });
  await databaseTask.locator("[data-plan-task-start]").click();
  await expect(plan.locator("#practice-title")).toHaveText("数据库技术");
  await expect(plan.locator("#practice-total")).toHaveText("2");
  for (let index = 0; index < 2; index++) {
    await answerCorrect(plan);
    await plan.locator('[data-study-action="primary"]').click();
  }
  await plan.locator('#report-page [data-action="plan"]').click();
  await expect(databaseTask).toContainText("已完成");
  passed.push("手动添加章节任务与刷题联动");
  await plan.locator('[data-action="all-plan-tasks"]').click();
  await expect(plan.locator(".study-task-dialog-row")).toHaveCount(
    (await stored(plan)).plan.tasks.length,
  );
  await plan.locator(".close-dialog").click();
  await plan.locator('[data-action="adjust-plan"]').click();
  await plan.locator('#study-plan-form select[name="weeks"]').selectOption("6");
  await plan
    .locator('#study-plan-form select[name="dailyMinutes"]')
    .selectOption("45");
  await plan.locator('#study-plan-form button[type="submit"]').click();
  await expect(plan.locator("#plan-name")).toHaveText("6 周章节复习计划");
  await expect(plan.locator("#plan-route-list .plan-phase")).toHaveCount(6);
  await expect(added).toContainText("已完成");
  await plan.locator("#plan-reminder-switch").uncheck();
  await plan.locator("#plan-reminder-time").fill("19:30");
  await plan.reload({ waitUntil: "networkidle" });
  await expect(plan.locator("#plan-reminder-switch")).not.toBeChecked();
  await expect(plan.locator("#plan-reminder-time")).toHaveValue("19:30");
  passed.push("周历与路线、添加任务、完成、删除撤销、计划调整和提醒设置");

  await plan.locator('.sidebar [data-action="home"]').click();
  await plan.locator('.sidebar [data-action="plan"]').click();
  await plan.goBack();
  await expect(plan.locator("#home-page")).toBeVisible();
  await plan.goForward();
  await expect(plan.locator("#plan-page")).toBeVisible();
  await plan.keyboard.press("Control+k");
  await plan.locator("#search").fill("学习计划");
  await plan.locator('#search-results [data-action="plan"]').click();
  await expect(plan.locator("#plan-page")).toBeVisible();
  passed.push("导航历史与全局搜索");

  const layout = await open("practice");
  const sizes = [];
  for (const width of [1280, 1440, 1672, 1920]) {
    await layout.setViewportSize({ width, height: 1000 });
    await layout.mouse.move(1, 1);
    const bounds = await layout.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      totalDisplay: getComputedStyle(document.querySelector("#sheet-total"))
        .display,
      stageWidth: document
        .querySelector(".practice-aside")
        .getBoundingClientRect().width,
      optionOverlap:
        document.querySelector(".study-options").getBoundingClientRect().right >
        document.querySelector(".practice-aside").getBoundingClientRect().left,
    }));
    assert.equal(bounds.width, width);
    assert.equal(bounds.totalDisplay, "inline");
    assert.equal(bounds.optionOverlap, false);
    await layout.locator('.sidebar [data-action="plan"]').click();
    assert.equal(
      await layout.evaluate(() => document.documentElement.scrollWidth),
      width,
    );
    await layout.locator('.sidebar [data-action="chapters"]').click();
    await layout
      .locator('#chapters-page [data-action="configured-practice"]')
      .first()
      .click();
    sizes.push({ width, answerPanel: Math.round(bounds.stageWidth) });
  }
  passed.push("1280 / 1440 / 1672 / 1920 桌面布局");
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        passed,
        desktop: sizes,
        pageErrors: errors,
        screenshots: ["study-plan-final.png", "practice-page-final.png"],
      },
      null,
      2,
    ),
  );
} finally {
  await Promise.all(contexts.map((context) => context.close()));
  await browser.close();
}
