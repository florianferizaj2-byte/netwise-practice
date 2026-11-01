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
const contexts = [],
  errors = [],
  external = [],
  failed = [],
  passed = [];
async function open(route = "settings", clock = false) {
  const c = await browser.newContext({
    viewport: { width: 1672, height: 941 },
    timezoneId: "Asia/Shanghai",
    colorScheme: "light",
  });
  contexts.push(c);
  const p = await c.newPage();
  if (clock)
    await p.clock.install({ time: new Date("2026-10-10T14:00:00+08:00") });
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  p.on("request", (r) => {
    if (
      !r.url().startsWith(base.split("/demo/")[0]) &&
      !r.url().startsWith("data:")
    )
      external.push(r.url());
  });
  p.on("response", (r) => {
    if (r.status() >= 400) failed.push(r.url());
  });
  await p.goto(base + "#" + route, { waitUntil: "networkidle" });
  return p;
}
const state = (p) => p.evaluate(() => structuredClone(AceStudyFlow.state()));
const stored = (p) =>
  p.evaluate(() =>
    JSON.parse(localStorage.getItem("aceexam.home-blue.study.v1")),
  );
const pref = (p, key) => p.locator('#settings-page [data-pref="' + key + '"]');
async function setting(p, key, value) {
  const controls = pref(p, key);
  const type = await controls.first().getAttribute("type");
  if (type === "checkbox") await controls.setChecked(value);
  else if (type === "radio")
    await p
      .locator(
        '#settings-page [data-pref="' + key + '"][value="' + value + '"]',
      )
      .check();
  else if ((await controls.evaluate((el) => el.tagName)) === "SELECT")
    await controls.selectOption(value);
  else await controls.fill(value);
}
async function save(p) {
  await p.locator("#settings-save").click();
  await expect(p.locator("#settings-status")).toContainText("设置已保存");
}
async function settings(p) {
  await p.locator('.sidebar [data-action="settings"]').click();
  await expect(p.locator("#settings-page")).toBeVisible();
}
async function answer(p) {
  const q = await p.evaluate(() => {
    const s = AceStudyFlow.activeSession();
    return studyQuestionData.find((q) => q.id === s.qids[s.index]);
  });
  for (const i of q.answers)
    await p.locator('[data-study-option="' + i + '"]').click();
  await p.locator('[data-study-action="primary"]').click();
}
async function aiAnswer(p) {
  const q = await p.evaluate(() => {
    const n = AceAiStudyDemo.current();
    return n.questions[AceAiStudyDemo.snapshot().progress[n.id].index];
  });
  for (const b of q.blanks) await p.locator("#ai-blank-" + b.id).fill(b.answer);
  await p.locator("#ai-practice-form button[type=submit]").click();
  return q.blanks.length;
}
try {
  const p = await open("settings", true);
  await expect(p.locator(".sidebar [data-action=settings]")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(p.locator(".settings-panel")).toHaveCount(4);
  await expect(p.locator(".settings-member")).toContainText("未开通");
  await setting(p, "theme", "dark");
  await expect(p.locator("html")).toHaveAttribute("data-theme", "dark");
  assert.equal((await stored(p)).settingsDemo.prefs.theme, "light");
  await expect(p.locator("#settings-status")).toContainText("未保存");
  for (const [key, value] of Object.entries({
    font: "larger",
    questionCount: "20",
    showAnalysis: false,
    autoNext: true,
    reduceMotion: true,
    reminderTime: "19:30",
    notifications: false,
  }))
    await setting(p, key, value);
  await save(p);
  let s = await stored(p);
  assert.equal(s.config.count, "20");
  assert.equal(s.collection.practice.count, "20");
  assert.equal(s.plan.reminderTime, "19:30");
  await p.reload({ waitUntil: "networkidle" });
  await expect(p.locator('[data-pref="theme"][value="dark"]')).toBeChecked();
  await expect(p.locator('[data-pref="font"][value="larger"]')).toBeChecked();
  await expect(pref(p, "showAnalysis")).not.toBeChecked();
  await expect(pref(p, "autoNext")).toBeChecked();
  await expect(pref(p, "notifications")).not.toBeChecked();
  await expect(pref(p, "reminderTime")).toHaveValue("19:30");
  assert.equal(
    await p
      .locator(".settings-panel")
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgb(23, 34, 55)",
  );
  passed.push("独立设置页、即时外观预览、保存与各项偏好刷新恢复");

  await p.locator('.sidebar [data-action="chapters"]').click();
  await expect(
    p.locator('[data-setting="count"][data-value="20"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await p.locator('[data-action="configured-practice"]').first().click();
  assert.equal(
    await p.evaluate(() => AceStudyFlow.activeSession().qids.length),
    20,
  );
  await answer(p);
  await expect(p.locator(".study-analysis")).toHaveCount(0);
  await expect(p.locator(".study-analysis-collapsed")).toBeVisible();
  await expect(p.locator(".demo-auto-next")).toBeVisible();
  await p.locator('[data-study-action="analysis"]').click();
  await expect(p.locator(".study-analysis")).toBeVisible();
  await expect(p.locator(".demo-auto-next")).toHaveCount(0);
  await p.clock.fastForward(3200);
  assert.equal(await p.evaluate(() => AceStudyFlow.activeSession().index), 0);
  await p.locator('[data-study-action="primary"]').click();
  await answer(p);
  const completed = await p.evaluate(
    () => AceStudyFlow.state().stats.answeredTotal,
  );
  await p.clock.fastForward(3200);
  assert.equal(await p.evaluate(() => AceStudyFlow.activeSession().index), 2);
  assert.equal(
    await p.evaluate(() => AceStudyFlow.state().stats.answeredTotal),
    completed,
  );
  await answer(p);
  await settings(p);
  const index = await p.evaluate(() => AceStudyFlow.activeSession().index);
  await p.clock.fastForward(3500);
  assert.equal(
    await p.evaluate(() => AceStudyFlow.activeSession().index),
    index,
  );
  await setting(p, "autoNext", false);
  await setting(p, "questionCount", "30");
  await save(p);
  await p.locator('.sidebar [data-action="favorites"]').click();
  await expect(
    p.locator('#favorite-count-options [data-value="30"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await p.locator('[data-library-action="favorites-practice"]').click();
  assert.equal(
    await p.evaluate(() => AceStudyFlow.activeSession().qids.length),
    12,
  );
  passed.push("题量联动、解析手动展开、3秒切题/留题/离开取消及不重复计分");

  await p.locator('.sidebar [data-action="ai"]').click();
  await expect(p.locator("#ai-lesson-title")).toBeVisible();
  await p.locator("#ai-tab-practice").click();
  const blanks = await aiAnswer(p);
  await expect(p.locator(".ai-blank-result")).toHaveCount(0);
  await p.locator('[data-ai-action="reveal"]').click();
  await expect(p.locator(".ai-blank-result.correct")).toHaveCount(blanks);
  await settings(p);
  await setting(p, "autoNext", true);
  await save(p);
  await p.locator('.sidebar [data-action="ai"]').click();
  await expect(p.locator("#ai-tab-practice")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await p.locator('[data-ai-action="next-question"]').click();
  await aiAnswer(p);
  await expect(p.locator(".demo-auto-next")).toBeVisible();
  await p.clock.fastForward(3200);
  assert.equal(
    await p.evaluate(
      () =>
        AceAiStudyDemo.snapshot().progress[AceAiStudyDemo.current().id].index,
    ),
    2,
  );
  passed.push("AI 逐空练习遵循解析与自动切题偏好");

  const profile = await open();
  await profile.locator('[data-settings-action="profile"]').click();
  await profile.locator("#settings-nickname").fill("x");
  await profile.locator("#settings-profile-form button[type=submit]").click();
  await expect(profile.locator("#settings-profile-error")).toBeVisible();
  await profile.locator("#settings-nickname").fill("认真学习的人");
  const bio = '<img src=x onerror="window.PROFILE_XSS=1">';
  await profile.locator("#settings-bio").fill(bio);
  await profile.locator("input[name=avatarColor][value=purple]").check();
  await profile.locator("#settings-profile-form button[type=submit]").click();
  await expect(profile.locator(".settings-profile-name")).toHaveText(
    "认真学习的人",
  );
  await expect(profile.locator(".settings-profile-copy > p")).toHaveText(bio);
  assert.equal(await profile.locator(".settings-profile-copy img").count(), 0);
  assert.equal(await profile.evaluate(() => window.PROFILE_XSS), undefined);
  await profile.reload({ waitUntil: "networkidle" });
  await expect(profile.locator(".profile-button")).toContainText(
    "认真学习的人",
  );
  await profile.locator('[data-settings-action="password"]').click();
  await profile.locator("#settings-password-form button[type=submit]").click();
  await expect(profile.locator("#settings-password-current")).toBeFocused();
  const oldPassword = "Old_secret_do_not_save_2026",
    newPassword = "New_secret_do_not_save_2026";
  await profile.locator("#settings-password-current").fill(oldPassword);
  await profile.locator("#settings-password-new").fill(newPassword);
  await profile.locator("#settings-password-confirm").fill("Mismatch_2026");
  await profile.locator("#settings-password-form button[type=submit]").click();
  await expect(
    profile.locator("#settings-password-error-confirm"),
  ).toContainText("不一致");
  await profile.locator("#settings-password-confirm").fill(newPassword);
  await profile.locator("#settings-password-form button[type=submit]").click();
  await expect(profile.locator("#toast")).toContainText("未修改正式账号");
  for (const secret of [oldPassword, newPassword])
    assert.equal(
      await profile.evaluate(
        (secret) =>
          JSON.stringify(localStorage).includes(secret) ||
          JSON.stringify(sessionStorage).includes(secret),
        secret,
      ),
      false,
    );
  await profile.locator('[data-settings-action="password"]').click();
  await profile.locator("#settings-password-current").fill(oldPassword);
  await profile.locator(".close-dialog").click();
  await expect(profile.locator("#settings-password-current")).toHaveValue("");
  for (const action of ["devices", "terms", "privacy", "about"]) {
    await profile.locator('[data-settings-action="' + action + '"]').click();
    await expect(profile.locator("#demo-dialog")).toBeVisible();
    await profile.locator(".close-dialog").click();
  }
  await profile.evaluate(() =>
    localStorage.setItem(
      "aceexam.home-blue.access.v1",
      JSON.stringify({ demo: true, enteredAt: Date.now() }),
    ),
  );
  const recordsBefore = (await state(profile)).records;
  await profile.locator('[data-settings-action="logout"]').click();
  await expect(profile.locator("body")).toHaveAttribute("data-page", "login");
  assert.equal(
    await profile.evaluate(() =>
      localStorage.getItem("aceexam.home-blue.access.v1"),
    ),
    null,
  );
  assert.deepEqual((await state(profile)).records, recordsBefore);
  passed.push(
    "资料/配色/恢复与文本安全、密码校验不保存、账号入口、退出保留学习记录",
  );

  const notice = await open();
  await notice.locator(".settings-notice-button").click();
  await expect(notice.locator(".settings-notice-item")).toHaveCount(1);
  await notice.locator(".close-dialog").click();
  await expect(notice.locator(".settings-notice-badge")).toBeHidden();
  await setting(notice, "notifications", false);
  await save(notice);
  await notice.evaluate(() =>
    AceDemoSettings.notify("不应显示", "通知已关闭", "disabled-test"),
  );
  assert.equal((await state(notice)).settingsDemo.notices.length, 1);
  await setting(notice, "notifications", true);
  await save(notice);
  await notice.evaluate(() =>
    AceDemoSettings.notify(
      "新的学习进展",
      "已经完成一个小目标",
      "enabled-test",
    ),
  );
  await expect(notice.locator(".settings-notice-badge")).toHaveText("1");
  await notice.locator(".settings-notice-button").click();
  await expect(notice.locator(".settings-notice-item")).toHaveCount(2);
  await notice.locator('[data-settings-action="notices-clear"]').click();
  await expect(notice.locator("#demo-dialog")).toContainText("还没有消息");
  await notice.locator(".close-dialog").click();
  await notice.reload({ waitUntil: "networkidle" });
  assert.equal((await state(notice)).settingsDemo.notices.length, 0);
  passed.push("消息开关、未读/已读状态与清空后不重新填充");

  const remembered = await open("chapters");
  await remembered
    .locator('[data-action="configured-practice"]')
    .first()
    .click();
  await remembered.locator('[data-question-jump="4"]').click();
  const sessionId = await remembered.evaluate(
    () => AceStudyFlow.activeSession().id,
  );
  await remembered.goto(base, { waitUntil: "networkidle" });
  await expect(remembered.locator("body")).toHaveAttribute(
    "data-page",
    "practice",
  );
  assert.equal(
    await remembered.evaluate(() => AceStudyFlow.activeSession().index),
    4,
  );
  assert.equal(
    await remembered.evaluate(() => AceStudyFlow.activeSession().id),
    sessionId,
  );
  await settings(remembered);
  await setting(remembered, "rememberPosition", false);
  await setting(remembered, "defaultCourse", "软考 · 网络工程师");
  await save(remembered);
  const prior = (await state(remembered)).records;
  await remembered.goto(base + "#practice", { waitUntil: "networkidle" });
  await remembered.reload({ waitUntil: "networkidle" });
  assert.equal(
    await remembered.evaluate(() => AceStudyFlow.activeSession().index),
    0,
  );
  assert.deepEqual((await state(remembered)).records, prior);
  await remembered.goto(base, { waitUntil: "networkidle" });
  await expect(remembered.locator("body")).toHaveAttribute("data-page", "ai");
  await expect(remembered.locator("#course")).toHaveValue("软考 · 网络工程师");
  await expect(remembered.locator("#ai-lesson-title")).toHaveText("进制互转");
  await remembered.goto(base + "#login", { waitUntil: "networkidle" });
  await remembered.locator("#auth-account").fill("demo_student");
  await remembered.locator("#auth-password").fill("demo_secret");
  await remembered.locator("#auth-submit").click();
  await expect(remembered.locator("body")).toHaveAttribute("data-page", "ai");
  passed.push(
    "恢复同一学习会话、关闭位置记忆保留记录、默认备考方向和登录后进入空间",
  );

  const direction = await open("chapters");
  assert.ok((await state(direction)).settingsDemo.lastLearning);
  await settings(direction);
  await setting(direction, "defaultCourse", "软考 · 网络工程师");
  await save(direction);
  assert.equal((await state(direction)).settingsDemo.lastLearning, null);
  await direction.goto(base, { waitUntil: "networkidle" });
  await expect(direction.locator("body")).toHaveAttribute("data-page", "ai");
  await expect(direction.locator("#course")).toHaveValue("软考 · 网络工程师");

  const examPrefs = await open("settings", true);
  await setting(examPrefs, "rememberPosition", false);
  await setting(examPrefs, "autoNext", true);
  await save(examPrefs);
  await examPrefs.locator('.sidebar [data-action="exam"]').click();
  await examPrefs.locator('[data-library-action="exam-start"]').click();
  await examPrefs.locator('[data-question-jump="4"]').click();
  await examPrefs.locator('[data-study-option="0"]').click();
  const draftExam = await examPrefs.evaluate(() =>
    structuredClone(AceStudyFlow.activeSession()),
  );
  await examPrefs.clock.fastForward(4000);
  assert.equal(
    await examPrefs.evaluate(() => AceStudyFlow.activeSession().index),
    4,
  );
  await expect(
    examPrefs.locator(
      ".demo-auto-next,.study-analysis,.answer-jump.correct,.answer-jump.wrong",
    ),
  ).toHaveCount(0);
  await examPrefs.reload({ waitUntil: "networkidle" });
  const recoveredExam = await examPrefs.evaluate(() =>
    structuredClone(AceStudyFlow.activeSession()),
  );
  assert.equal(recoveredExam.id, draftExam.id);
  assert.equal(recoveredExam.index, 4);
  assert.equal(recoveredExam.examDeadlineAt, draftExam.examDeadlineAt);
  assert.deepEqual(recoveredExam.selections, draftExam.selections);
  assert.deepEqual(recoveredExam.responses, draftExam.responses);
  await expect(
    examPrefs.locator(".demo-auto-next,.study-analysis"),
  ).toHaveCount(0);
  passed.push(
    "变更备考方向优先于旧位置、关闭位置记忆仍保留未交卷考试草稿和截止时间",
  );
  const alarm = await open("settings", true);
  await setting(alarm, "reminderTime", "14:01");
  await save(alarm);
  await alarm.locator('.sidebar [data-action="plan"]').click();
  await expect(alarm.locator("#plan-reminder-time")).toHaveValue("14:01");
  await alarm.clock.fastForward(61000);
  await expect(alarm.locator("#toast")).toContainText("到学习时间了");
  const reminded = (await state(alarm)).plan.remindedDate;
  await alarm.clock.fastForward(3000);
  assert.equal((await state(alarm)).plan.remindedDate, reminded);
  await alarm.locator("#plan-reminder-time").fill("21:15");
  await alarm.locator("#plan-reminder-time").dispatchEvent("change");
  await settings(alarm);
  await expect(pref(alarm, "reminderTime")).toHaveValue("21:15");
  await setting(alarm, "reminder", false);
  await save(alarm);
  await expect(pref(alarm, "reminderTime")).toBeDisabled();
  await alarm.locator('.sidebar [data-action="plan"]').click();
  await expect(alarm.locator("#plan-reminder-switch")).not.toBeChecked();
  passed.push("设置/计划共享提醒、到点提示、每日一次与关闭后禁用时间");

  const layout = await open();
  const panels = {
    home: ".continue-card",
    chapters: ".practice-settings",
    practice: "#study-question-card",
    plan: ".plan-hero",
    exam: ".library-panel",
    favorites: ".favorite-card",
    wrong: ".wrong-card",
    vip: ".vip-plan-card",
    ai: ".ai-panel",
    login: ".landing-auth-card",
  };
  await setting(layout, "theme", "dark");
  await setting(layout, "reduceMotion", true);
  await setting(layout, "font", "large");
  await save(layout);
  for (const [route, panel] of Object.entries(panels)) {
    await layout.goto(base + "#" + route, { waitUntil: "networkidle" });
    if (route === "ai")
      await expect(layout.locator("#ai-lesson-title")).toBeVisible();
    await expect(layout.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(layout.locator(panel).first()).toBeVisible();
    assert.notEqual(
      await layout
        .locator(panel)
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor),
      "rgb(255, 255, 255)",
      route,
    );
    assert.ok(
      await layout.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      route + " overflow",
    );
  }
  await layout.goto(base + "#settings", { waitUntil: "networkidle" });
  for (const width of [1920, 1672, 1440, 1280, 1024, 768, 393, 320]) {
    await layout.setViewportSize({ width, height: 941 });
    assert.ok(
      await layout.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "settings large dark " + width,
    );
    if ([1920, 1672, 1280].includes(width))
      await layout.screenshot({
        path: path.join(output, "settings-dark-large-" + width + ".png"),
        fullPage: true,
        animations: "disabled",
      });
  }
  await layout.setViewportSize({ width: 1672, height: 941 });
  await setting(layout, "theme", "system");
  await setting(layout, "font", "standard");
  await save(layout);
  await layout.emulateMedia({ colorScheme: "dark" });
  await expect(layout.locator("html")).toHaveAttribute("data-theme", "dark");
  await layout.emulateMedia({ colorScheme: "light" });
  await expect(layout.locator("html")).toHaveAttribute("data-theme", "light");
  await setting(layout, "reduceMotion", false);
  await save(layout);
  await layout.emulateMedia({ reducedMotion: "reduce" });
  await expect(layout.locator("body")).toHaveAttribute(
    "data-reduced-motion",
    "true",
  );
  await layout.locator(".sidebar [data-action=home]").click();
  await layout.locator("#home-page .continue-card").hover();
  assert.equal(
    await layout.evaluate(
      () =>
        document.getAnimations().filter((a) => a.playState === "running")
          .length,
    ),
    0,
  );
  await layout.goto(base + "#settings", { waitUntil: "networkidle" });
  await layout.emulateMedia({ reducedMotion: "no-preference" });
  await layout.locator('[data-settings-action="defaults"]').click();
  await save(layout);
  await layout.screenshot({
    path: path.join(output, "settings-light-final.png"),
    fullPage: true,
    animations: "disabled",
  });
  await setting(layout, "theme", "dark");
  await save(layout);
  await layout.screenshot({
    path: path.join(output, "settings-dark-final.png"),
    fullPage: true,
    animations: "disabled",
  });
  passed.push("十个已有页面深色主题、大号字和八种窗口、跟随系统与减少动画");

  const failures = await open();
  await pref(failures, "reminderTime").fill("");
  await failures.locator("#settings-save").click();
  await expect(failures.locator("#settings-time-error")).toBeVisible();
  await expect(pref(failures, "reminderTime")).toBeFocused();
  await pref(failures, "reminderTime").fill("20:00");
  await failures.evaluate(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
  });
  await failures.locator("#settings-save").click();
  await expect(failures.locator("#settings-status")).toContainText("未能保存");
  await failures.reload({ waitUntil: "networkidle" });
  await failures.locator('[data-settings-action="reset"]').click();
  await expect(failures.locator("#demo-dialog")).toContainText("清除");
  await failures.locator('#demo-dialog [data-action="reset"]').click();
  await expect(failures.locator("body")).toHaveAttribute("data-page", "home");
  await settings(failures);
  await expect(pref(failures, "showAnalysis")).toBeChecked();
  await expect(pref(failures, "autoNext")).not.toBeChecked();
  await failures.locator("#search").fill("设置");
  await failures.locator('.search-result[data-action="settings"]').click();
  await expect(failures.locator("#settings-page")).toBeVisible();
  passed.push("提醒时间校验、存储失败反馈、恢复默认与重置确认、全局搜索入口");
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  assert.deepEqual(failed, []);
  console.log(
    JSON.stringify(
      {
        passed,
        pageErrors: errors,
        externalRequests: external,
        failedRequests: failed,
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  for (const c of contexts) await c.close();
  await browser.close();
}
