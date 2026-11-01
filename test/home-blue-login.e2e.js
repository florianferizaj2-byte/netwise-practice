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
async function open() {
  const context = await browser.newContext({
    viewport: { width: 1672, height: 941 },
  });
  contexts.push(context);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("request", (request) => {
    if (!request.url().startsWith(new URL(base).origin))
      external.push(request.url());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) failed.push(response.url());
  });
  await page.goto(base + "#login", { waitUntil: "networkidle" });
  return page;
}
async function currentQuestion(page) {
  return page.evaluate(() =>
    [...AceStudyFlow.questionMap.values()].find(
      (q) =>
        q.q === document.querySelector("#guest-question-title").textContent,
    ),
  );
}
async function storage(page) {
  return page.evaluate(() => ({
    local: Object.fromEntries(Object.entries(localStorage)),
    session: Object.fromEntries(Object.entries(sessionStorage)),
  }));
}
try {
  const auth = await open();
  await expect(auth.locator("body")).toHaveAttribute("data-page", "login");
  await expect(auth.locator(".sidebar")).toBeHidden();
  await expect(auth.locator(".workspace > .topbar")).toBeHidden();
  await expect(auth.locator("#landing-auth-form")).toBeVisible();
  await expect(auth.locator("#home-page")).toBeHidden();
  await auth.locator("#auth-submit").click();
  await expect(auth.locator("#auth-account")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(auth.locator("#auth-password-error")).toContainText("6 个字符");
  await expect(auth.locator("#auth-account")).toBeFocused();
  const account = "NeverPersistAccount_2026",
    password = "SecretMustNotPersist_2026";
  await auth.locator("#auth-account").fill(account);
  await auth.locator("#auth-password").fill(password);
  await auth.locator('[data-auth-toggle="auth-password"]').click();
  await expect(auth.locator("#auth-password")).toHaveAttribute("type", "text");
  await expect(
    auth.locator('[data-auth-toggle="auth-password"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await auth.locator("#auth-tab-login").focus();
  await auth.keyboard.press("ArrowRight");
  await expect(auth.locator("#auth-tab-register")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(auth.locator("#auth-tab-register")).toBeFocused();
  await expect(auth.locator("#auth-confirm")).toBeVisible();
  await expect(auth.locator("#auth-password")).toHaveValue("");
  await expect(auth.locator("#auth-password")).toHaveAttribute(
    "autocomplete",
    "new-password",
  );
  await auth.locator("#auth-password").fill(password);
  await auth.locator("#auth-confirm").fill("MismatchPassword_2026");
  await auth.locator("#auth-submit").click();
  await expect(auth.locator("#auth-confirm-error")).toHaveText(
    "两次输入的密码不一致",
  );
  await expect(auth.locator("#auth-agreement-error")).toBeVisible();
  await auth.locator("#auth-confirm").fill(password);
  await auth.locator("#auth-agree").check();
  await auth.locator("#auth-submit").click();
  await expect(auth.locator("body")).toHaveAttribute("data-page", "home");
  const saved = JSON.stringify(await storage(auth));
  assert.ok(!saved.includes(account) && !saved.includes(password));
  await expect(auth.locator("#auth-account")).toHaveValue("");
  await expect(auth.locator("#auth-password")).toHaveValue("");
  await expect(auth.locator("#auth-confirm")).toHaveValue("");
  passed.push(
    "登录/注册切换、密码显示、键盘标签页、错误提示与确认密码；账号密码不写入存储",
  );
  await auth.locator(".profile-button").click();
  await auth.locator('[data-action="login"]').click();
  await expect(auth.locator("body")).toHaveAttribute("data-page", "login");
  await expect(auth.locator("#landing-header-login")).toHaveText(
    "进入学习空间",
  );
  await auth.reload({ waitUntil: "networkidle" });
  await expect(auth.locator("#landing-header-login")).toHaveText(
    "进入学习空间",
  );
  await auth.locator('[data-landing-action="forgot"]').click();
  await expect(auth.locator("#demo-dialog")).toContainText("不发送验证码");
  await auth.locator('#demo-dialog [data-landing-action="demo"]').click();
  await expect(auth.locator("#demo-dialog")).not.toBeVisible();
  await expect(auth.locator("#auth-account")).toHaveValue("kaojiang_demo");
  await expect(auth.locator("#auth-password")).toHaveValue("demo123456");
  await auth
    .locator('.landing-auth-legal [data-landing-action="privacy"]')
    .click();
  await expect(auth.locator("#demo-dialog")).toContainText("不会发送");
  await auth.locator(".close-dialog").click();
  passed.push(
    "个人信息可进入登录页，刷新恢复体验状态，账号帮助与隐私说明可操作",
  );
  const sessionOnly = await open();
  await sessionOnly.locator("#auth-account").fill(account);
  await sessionOnly.locator("#auth-password").fill(password);
  await sessionOnly.locator("#auth-remember").uncheck();
  await sessionOnly.locator("#auth-submit").click();
  await expect(sessionOnly.locator("body")).toHaveAttribute(
    "data-page",
    "home",
  );
  const transient = await storage(sessionOnly);
  assert.equal(transient.local["aceexam.home-blue.access.v1"], undefined);
  assert.ok(transient.session["aceexam.home-blue.access.v1"]);
  assert.ok(!JSON.stringify(transient).includes(password));
  passed.push("不记住体验时仅保存当前会话标记，提交后不会保留输入值");
  const trial = await open();
  const before = await trial.evaluate(() => ({
    records: JSON.stringify(AceStudyFlow.state().records),
    sessions: AceStudyFlow.state().sessions.length,
  }));
  await trial.locator("#guest-primary").click();
  await expect(trial.locator("#guest-error")).toBeVisible();
  for (let index = 0; index < 5; index++) {
    const q = await currentQuestion(trial);
    assert.ok(q);
    const answers =
      index === 0
        ? [q.options.findIndex((_, option) => !q.answers.includes(option))]
        : q.answers;
    for (const answer of answers)
      await trial.locator("#guest-option-" + answer).check();
    await trial.locator("#guest-primary").click();
    await expect(trial.locator(".landing-guest-explanation")).toBeVisible();
    await expect(trial.locator(".landing-guest-explanation")).toContainText(
      index === 0 ? "再记牢一点" : "回答正确",
    );
    await expect(trial.locator(".landing-guest-option.is-correct")).toHaveCount(
      q.answers.length,
    );
    const controls = trial.locator("#guest-options input");
    for (let option = 0; option < (await controls.count()); option++)
      await expect(controls.nth(option)).toBeDisabled();
    await trial.locator("#guest-primary").click();
  }
  await expect(trial.locator(".landing-guest-report")).toBeVisible();
  await expect(trial.locator(".landing-guest-report p")).toContainText(
    /答对\s*4\s*道/,
  );
  const after = await trial.evaluate(() => ({
    records: JSON.stringify(AceStudyFlow.state().records),
    sessions: AceStudyFlow.state().sessions.length,
  }));
  assert.deepEqual(after, before, "免费体验不应改动已保存的章节作答和会话");
  await trial.locator('[data-guest-index="0"]').click();
  await expect(trial.locator(".landing-guest-explanation")).toContainText(
    "再记牢一点",
  );
  await trial.locator("#guest-subject").selectOption("network");
  await expect(trial.locator("#guest-question-title")).toContainText("端到端");
  await expect(trial.locator("#guest-nav button")).toHaveCount(5);
  await expect(trial.locator(".landing-guest-explanation")).toHaveCount(0);
  passed.push(
    "免费五题的单选/多选/判断判分、解析、回看与报告；切换题组，独立于学习记录",
  );
  await trial.keyboard.press("Control+k");
  await expect(trial.locator("#landing-direction-search")).toBeFocused();
  await trial.locator("#landing-direction-search").fill("没有这个考试");
  await expect(trial.locator("#landing-direction-status")).toContainText(
    "暂未找到",
  );
  await expect(trial.locator("[data-direction-search]:visible")).toHaveCount(0);
  await trial.locator("#landing-direction-search").fill("软考");
  await expect(trial.locator("[data-direction-search]:visible")).toHaveCount(1);
  await trial
    .locator('#landing-direction-grid [data-landing-direction="network"]')
    .click();
  await expect(trial.locator("#guest-subject")).toHaveValue("network");
  await trial.locator("#landing-direction-search").fill("");
  for (const route of [
    "chapters",
    "wrong",
    "exam",
    "plan",
    "home",
    "favorites",
    "vip",
  ]) {
    await trial
      .locator('[data-landing-route="' + route + '"]')
      .first()
      .click();
    await expect(trial.locator("body")).toHaveAttribute("data-page", route);
    await expect(trial.locator("#login-page")).toBeHidden();
    await trial.goBack();
    await expect(trial.locator("body")).toHaveAttribute("data-page", "login");
  }
  await trial.locator('.landing-feature[data-landing-route="ai"]').click();
  await expect(trial.locator("body")).toHaveAttribute("data-page", "ai");
  await expect(trial.locator("#ai-lesson-title")).toBeVisible();
  await trial.goBack();
  await expect(trial.locator("body")).toHaveAttribute("data-page", "login");
  await trial.locator('[data-landing-action="directions"]').click();
  await expect(trial.locator("#certificates-page")).toBeVisible();
  await expect(trial.locator(".cert-card")).toHaveCount(6);
  await trial
    .locator('.cert-radio[value="sichuan-upgrading-computer"]')
    .check();
  await trial.locator('#cert-current [data-cert-route="chapters"]').click();
  await expect(trial.locator("body")).toHaveAttribute("data-page", "chapters");
  await trial.goBack();
  passed.push(
    "备考搜索/空状态/快捷键，页面入口与浏览器返回、独立 AI 精讲页面与证书选择页",
  );
  const layout = await open();
  for (const width of [1280, 1440, 1672, 1920, 1024, 768, 393, 320]) {
    await layout.setViewportSize({ width, height: 941 });
    await layout.evaluate(() => scrollTo(0, 0));
    const bounds = await layout.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      form: (() => {
        const r = document
          .querySelector(".landing-auth-card")
          .getBoundingClientRect();
        return { left: r.left, right: r.right };
      })(),
      title: (() => {
        const r = document
          .querySelector("#landing-title")
          .getBoundingClientRect();
        return { left: r.left, right: r.right };
      })(),
      ids: [...document.querySelectorAll("[id]")].map((el) => el.id),
    }));
    assert.ok(bounds.scroll <= width + 1, width + " 页面不应横向溢出");
    assert.ok(
      bounds.form.left >= 0 && bounds.form.right <= width + 1,
      width + " 表单应完整",
    );
    assert.ok(
      bounds.title.left >= 0 && bounds.title.right <= width + 1,
      width + " 大标题应完整",
    );
    assert.equal(
      bounds.ids.length,
      new Set(bounds.ids).size,
      "SVG 和表单 ID 不重复",
    );
    if ([1280, 1672, 393].includes(width))
      await layout.screenshot({
        path: path.join(output, "login-page-" + width + ".png"),
        fullPage: true,
      });
    if (width === 1672) {
      await layout.screenshot({
        path: path.join(output, "login-first-final.png"),
      });
      await layout.locator("#auth-tab-register").click();
      await layout.screenshot({
        path: path.join(output, "login-register-final.png"),
      });
      await layout.locator("#auth-tab-login").click();
    }
  }
  await layout.setViewportSize({ width: 1672, height: 941 });
  await layout.emulateMedia({ reducedMotion: "reduce" });
  await layout.locator(".landing-hero-visual").hover();
  await layout.locator("#auth-tab-register").click();
  const running = await layout
    .locator("#login-page")
    .evaluate(
      (el) =>
        el
          .getAnimations({ subtree: true })
          .filter((a) => ["running", "pending"].includes(a.playState)).length,
    );
  assert.equal(running, 0);
  passed.push("四种桌面尺寸及窄浏览器布局、图标/表单 ID、系统减少动态效果");
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
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
}
