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
const key = "aceexam.home-blue.study.v1";
async function open(route = "ai", monitor = true) {
  const c = await browser.newContext({
    viewport: { width: 1672, height: 941 },
    timezoneId: "Asia/Shanghai",
  });
  contexts.push(c);
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  if (monitor) {
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
  }
  await p.goto(base + "#" + route, { waitUntil: "networkidle" });
  if (route === "ai") await expect(p.locator("#ai-lesson-title")).toBeVisible();
  return p;
}
const aiState = (p) => p.evaluate(() => AceAiStudyDemo.snapshot());
const state = (p) => p.evaluate(() => AceStudyFlow.state());
const lesson = (p) => p.evaluate(() => AceAiStudyDemo.current());
const click = (p, action) =>
  p.locator('#ai-page [data-ai-action="' + action + '"]').click();
async function changeCourse(p, id) {
  await p.locator("#certificate-switch").click();
  await p.locator('.cert-radio[value="' + id + '"]').check();
  await p.locator('#cert-current [data-cert-route="ai"]').click();
}
async function changeChapter(p, name) {
  await p.locator("#ai-chapter-toggle").click();
  await p
    .locator("[data-ai-chapter]")
    .filter({
      has: p.locator("strong", {
        hasText: name === "all" ? /^全部章节$/ : name,
      }),
    })
    .click();
  await expect(p.locator("#ai-chapter-options")).toBeHidden();
}
async function exact(p) {
  const n = await lesson(p);
  const s = await aiState(p),
    q = n.questions[s.progress[n.id].index];
  for (const b of q.blanks) await p.locator("#ai-blank-" + b.id).fill(b.answer);
  await p.locator("#ai-practice-form button[type=submit]").click();
  await expect(p.locator(".ai-blank-result.correct")).toHaveCount(
    q.blanks.length,
  );
  return q;
}
try {
  const p = await open();
  await expect(p.locator(".sidebar [data-action=ai]")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(p.locator("#ai-lesson-title")).toHaveText(
    "路由优先级、管理距离与度量值",
  );
  await expect(p.locator("#course")).toHaveValue("软考 · 网络工程师");
  await expect(p.locator(".ai-key-point")).toHaveCount(1);
  await expect(p.locator(".ai-example")).toHaveCount(0);
  await p.locator(".ai-point-detail summary").first().click();
  await expect(p.locator(".ai-point-detail").first()).toHaveAttribute(
    "open",
    "",
  );
  await expect(p.locator(".ai-point-detail").first()).toContainText("直连");
  await p.locator(".ai-point-detail summary").first().click();
  assert.equal(
    await p
      .locator(
        "#ai-study-body figure, #ai-study-body canvas, #ai-study-body img",
      )
      .count(),
    0,
  );
  const original = await state(p);
  await changeChapter(p, "all");
  await expect(p.locator("[data-ai-node]")).toHaveCount(147);
  const catalog = await p.evaluate(() => AceAiStudyDemo.catalog());
  assert.equal(catalog.chapters.length, 10);
  assert.equal(new Set(catalog.lessons.map((n) => n.id)).size, 147);
  for (const n of catalog.lessons) {
    assert.ok(n.lesson.points.length >= 1 && n.lesson.points.length <= 3);
    assert.equal(n.questions.length, 6);
    for (const stage of ["基础", "理解", "应用"])
      assert.equal(n.questions.filter((q) => q.stage === stage).length, 2);
    for (const q of n.questions) {
      assert.equal(
        [...q.stem.matchAll(/\{\{b[1-3]\}\}/g)].length,
        q.blanks.length,
      );
      assert.ok(q.blanks.every((b) => b.answer && b.label));
    }
  }
  const osi = catalog.lessons.filter((n) => n.parent === "OSI七层模型");
  assert.equal(osi.length, 7);
  assert.deepEqual(
    osi.map((n) => n.unit.order),
    [1, 2, 3, 4, 5, 6, 7],
  );
  await p.locator("#ai-node-search").fill("物理层");
  await expect(p.locator("[data-ai-node]")).toHaveCount(1);
  await p.locator("[data-ai-node]").click();
  await expect(p.locator("#ai-unit-caption")).toContainText("第 1 / 7 小节");
  await expect(p.locator("#ai-lesson-title")).toHaveText("物理层");
  await p.locator("#ai-node-search").fill("这里没有这个知识点");
  await expect(p.locator(".ai-empty")).toContainText("没有匹配");
  await click(p, "clear-filter");
  await expect(p.locator("[data-ai-node]")).toHaveCount(147);
  await p.locator('[data-ai-node="network-engineer:04.01.02"]').click();
  passed.push(
    "完整十章/147小节、OSI七层独立拆分、目录搜索与空筛选、分点卡片及展开说明",
  );

  await click(p, "favorite");
  await expect(p.locator("#ai-favorite")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await p.locator("#ai-favorite-filter").click();
  await expect(p.locator("[data-ai-node]")).toHaveCount(1);
  await p.reload({ waitUntil: "networkidle" });
  await expect(p.locator("#ai-favorite")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  let snapshot = await aiState(p);
  assert.equal(snapshot.progress["network-engineer:04.01.02"].learnedAt, null);
  await p.locator("#ai-tab-lesson").focus();
  await p.keyboard.press("ArrowRight");
  await expect(p.locator("#ai-tab-practice")).toBeFocused();
  await expect(p.locator("#ai-tab-practice")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await p.locator("#ai-tab-lesson").click();
  await click(p, "learn-practice");
  snapshot = await aiState(p);
  assert.ok(snapshot.progress["network-engineer:04.01.02"].learnedAt);
  await expect(p.locator("#ai-progress-caption")).toContainText("已学 1 / 16");
  await expect(p.locator("[data-ai-index]")).toHaveCount(6);
  await p.locator("#ai-practice-form button[type=submit]").click();
  await expect(p.locator("#ai-blank-b1")).toBeFocused();
  await expect(p.locator("#ai-error-b1")).toBeVisible();
  await expect(p.locator("#ai-error-b2")).toBeVisible();
  await p.locator("#ai-blank-b1").fill("管理距离");
  await p.keyboard.press("Enter");
  await expect(p.locator("#ai-blank-b2")).toBeFocused();
  await p.locator("#ai-blank-b2").fill("尚未提交的草稿");
  await p.locator('[data-ai-index="2"]').click();
  await p.locator('[data-ai-index="0"]').click();
  await expect(p.locator("#ai-blank-b2")).toHaveValue("尚未提交的草稿");
  await p.reload({ waitUntil: "networkidle" });
  await expect(p.locator("#ai-blank-b2")).toHaveValue("尚未提交的草稿");
  const answer = await exact(p);
  await expect(p.locator(".ai-answer-explanation")).toContainText(
    answer.explanation,
  );
  await expect(p.locator("#ai-blank-b1")).toHaveAttribute("readonly", "");
  await expect(p.locator("#ai-blank-results")).toBeFocused();
  let after = await state(p);
  assert.deepEqual(after.stats, original.stats);
  assert.deepEqual(after.records, original.records);
  assert.deepEqual(after.wrongBook, original.wrongBook);
  const result =
    after.aiStudyDemo.progress["network-engineer:04.01.02"].results.q1;
  await p
    .locator("#ai-practice-form")
    .evaluate((el) =>
      el.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
  after = await state(p);
  assert.deepEqual(
    after.aiStudyDemo.progress["network-engineer:04.01.02"].results.q1,
    result,
  );
  passed.push(
    "收藏恢复、显式学完才计进度、键盘标签切换、逐空校验、草稿刷新、完全一致直接得分与重复提交保护",
  );

  await click(p, "next-question");
  await p.locator("#ai-blank-b1").fill("metric"); // An alias must not bypass semantic review.
  await p.locator("#ai-blank-b2").fill("小");
  await p.locator("#ai-practice-form button[type=submit]").click();
  await expect(p.locator(".ai-blank-result.pending")).toHaveCount(1);
  await expect(p.locator(".ai-blank-result.correct")).toHaveCount(1);
  await expect(p.locator(".ai-blank-result.pending")).toContainText(
    "不同写法不会直接判错",
  );
  await p.reload({ waitUntil: "networkidle" });
  await expect(p.locator(".ai-blank-result.pending")).toHaveCount(1);
  await click(p, "retry");
  await p.locator("#ai-blank-b1").fill("度量值 ");
  await p.locator("#ai-practice-form button[type=submit]").click();
  await expect(p.locator(".ai-blank-result.pending")).toHaveCount(1);
  await click(p, "retry");
  await p.locator("#ai-blank-b1").fill('<img src=x onerror="window.XSS=true">');
  await p.locator("#ai-practice-form button[type=submit]").click();
  assert.equal(await p.locator(".ai-blank-result img").count(), 0);
  assert.equal(await p.evaluate(() => window.XSS), undefined);
  await click(p, "next-question");
  await click(p, "recall");
  await expect(p.locator(".ai-lesson-intro")).toBeVisible();
  await p.locator("#ai-tab-practice").click();
  await expect(p.locator(".ai-question-position")).toContainText("第 3 / 6");
  for (let i = 2; i < 6; i++) await click(p, "skip");
  await expect(p.locator(".ai-report")).toBeVisible();
  await expect(p.locator(".ai-report-stats")).toContainText("2 / 6");
  await expect(p.locator(".ai-report")).toContainText("跳过 4 题");
  await expect(p.locator(".ai-report")).toContainText("待复核内容不计为答错");
  await p.locator('[data-ai-index="2"]').click();
  await exact(p);
  after = await state(p);
  assert.equal(
    after.aiStudyDemo.progress["network-engineer:04.01.02"].skipped.q3,
    undefined,
  );
  await click(p, "report");
  await expect(p.locator(".ai-report")).toContainText("跳过 3 题");
  await click(p, "next-node");
  await expect(p.locator("#ai-lesson-title")).toHaveText("路由协议类型与算法");
  assert.equal(
    (await aiState(p)).progress["network-engineer:04.01.03"].learnedAt,
    null,
  );
  passed.push(
    "别名与空格不绕过复核、文本安全、回看精讲、跳题/补答、逐空报告和下一知识点",
  );

  await changeCourse(p, "sichuan-upgrading-computer");
  await expect(p.locator("#ai-lesson-title")).toHaveText(
    "计算机特点与信息处理",
  );
  const sc = await p.evaluate(() => AceAiStudyDemo.catalog());
  assert.equal(sc.lessons.length, 141);
  assert.equal(sc.chapters.length, 7);
  await changeChapter(p, "办公自动化");
  await expect(p.locator("#ai-unit-caption")).toBeVisible();
  const office = sc.lessons.filter((n) => n.chapter === "办公自动化");
  assert.ok(office.length > 20);
  assert.equal(await p.locator("[data-ai-node]").count(), office.length);
  assert.ok(office.every((n) => n.unit && n.unit.total > 0));
  // Exercise a real lesson from every chapter and check it renders its own independent content.
  for (const c of sc.chapters) {
    await changeChapter(p, c.name);
    const current = await lesson(p);
    await expect(p.locator("#ai-lesson-title")).toHaveText(current.name);
    await expect(p.locator(".ai-key-point")).toHaveCount(1);
    for (let step = 0; step < current.lesson.points.length; step++)
      await click(p, "read-next");
    await expect(p.locator(".ai-example")).toContainText(
      current.lesson.example.split(/[。；]/)[0],
    );
    await expect(p.locator(".ai-pitfall")).toContainText(
      current.lesson.pitfall.split(/[。；]/)[0],
    );
  }
  await p.reload({ waitUntil: "networkidle" });
  await expect(p.locator("#course")).toHaveValue("四川专升本 · 计算机");
  await changeCourse(p, "network-engineer");
  await expect(p.locator("#ai-lesson-title")).toHaveText("路由协议类型与算法");
  assert.ok(
    (await aiState(p)).progress["network-engineer:04.01.02"].results.q1,
  );
  passed.push(
    "两门课程共288小节、四川办公章节逐点拆分、各章真实内容渲染与课程进度隔离",
  );

  const revised = await open();
  await revised.evaluate(() => {
    const oldNode = AceAiStudyDemo.catalog().lessons.find(
      (n) => n.id === "network-engineer:04.01.01",
    );
    AceStudyFlow.state().aiStudyDemo.progress[oldNode.id] = {
      version: "previous-curriculum",
      learnedAt: Date.now(),
      index: 0,
      tab: "practice",
      drafts: { q1: { b1: "旧版答案" } },
      results: {
        q1: {
          answers: { b1: "旧版答案" },
          verdicts: ["correct"],
          submittedAt: Date.now(),
        },
      },
      skipped: {},
    };
    AceStudyFlow.save();
  });
  await revised.reload({ waitUntil: "networkidle" });
  const revisedNode = revised.locator(
    '[data-ai-node="network-engineer:04.01.01"]',
  );
  await expect(revisedNode).not.toContainText("已练");
  await expect(revised.locator("#ai-progress-caption")).toContainText("已学 0");
  await revisedNode.click();
  const revisedProgress = (await aiState(revised)).progress[
    "network-engineer:04.01.01"
  ];
  assert.notEqual(revisedProgress.version, "previous-curriculum");
  assert.equal(revisedProgress.learnedAt, null);
  assert.deepEqual(revisedProgress.drafts, {});
  assert.deepEqual(revisedProgress.results, {});
  passed.push("课程内容版本变化后旧作答与完成状态不冒充当前进度");

  const member = await open();
  await click(member, "teacher");
  await expect(member.locator("#demo-dialog")).toContainText("开通 VIP");
  await member.locator('#demo-dialog [data-ai-action="membership"]').click();
  await expect(member.locator("body")).toHaveAttribute("data-page", "vip");
  await member.locator('[data-member-action="purchase"]').click();
  await member.locator('[data-member-action="issue"]').click();
  await member.locator('[data-member-action="fill"]').click();
  await member.locator('#vip-redeem-form button[type="submit"]').click();
  await expect(member.locator("#demo-dialog")).toContainText("已开通");
  await member.locator(".close-dialog").click();
  await member.locator('.sidebar [data-action="ai"]').click();
  await expect(member.locator("#ai-membership")).toContainText("300");
  let used = (await state(member)).memberDemo.active.used;
  assert.equal(used, 0);
  await click(member, "teacher");
  assert.equal((await state(member)).memberDemo.active.used, used);
  await member
    .locator('[data-ai-action="teacher-preset"][data-preset="0"]')
    .click();
  await expect(member.locator(".ai-teacher-answer")).toContainText(
    "分开看要点",
  );
  assert.equal((await state(member)).memberDemo.active.used, used + 1);
  await expect(
    member.locator('[data-ai-action="teacher-preset"][data-preset="0"]'),
  ).toBeDisabled();
  const chatText = "AI_CHAT_DO_NOT_STORE_2026";
  await member.locator("#ai-teacher-question").fill(chatText);
  await member.locator("#ai-teacher-form button[type=submit]").click();
  await expect(member.locator(".ai-teacher-messages")).toContainText(
    "没有扣除额度",
  );
  assert.equal((await state(member)).memberDemo.active.used, used + 1);
  assert.equal(
    await member.evaluate(
      (text) => JSON.stringify(localStorage).includes(text),
      chatText,
    ),
    false,
  );
  await member
    .locator('[data-ai-action="teacher-preset"][data-preset="1"]')
    .click();
  assert.equal((await state(member)).memberDemo.active.used, used + 2);
  await member.screenshot({
    path: path.join(output, "ai-teacher-1672.png"),
    animations: "disabled",
  });
  await member.locator(".close-dialog").click();
  await click(member, "learn-practice");
  await exact(member);
  assert.equal((await state(member)).memberDemo.active.used, used + 2);
  await member.locator(".sidebar [data-action=home]").click();
  await expect(member.locator("#ai-page")).toBeHidden();
  await expect(member.locator("#course")).toHaveValue("软考 · 网络工程师");
  await expect(member.locator("#certificate-unavailable")).toBeVisible();
  await member.goBack();
  await expect(member.locator("body")).toHaveAttribute("data-page", "ai");
  await expect(member.locator("#course")).toHaveValue("软考 · 网络工程师");
  await member.locator("#ai-membership .ai-quota").click();
  await expect(member.locator("#demo-dialog")).toContainText("不扣额度");
  await member.locator(".close-dialog").click();
  await member.evaluate(() => {
    AceStudyFlow.state().memberDemo.active.used = 300;
    AceStudyFlow.save();
  });
  await click(member, "teacher");
  await expect(member.locator("#demo-dialog")).toContainText("额度已用完");
  await member.locator(".close-dialog").click();
  await member.evaluate(() => {
    AceStudyFlow.state().memberDemo.active.expiresAt = Date.now() - 1;
    AceStudyFlow.save();
  });
  await click(member, "teacher");
  await expect(member.locator("#demo-dialog")).toContainText("开通 VIP");
  await member.locator(".close-dialog").click();
  passed.push(
    "会员门槛、真实演示卡兑换、按主动新回答扣额、练习/自由提问不扣额、聊天不保存与过期/用尽",
  );

  const layout = await open();
  await layout.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [1920, 1672, 1440, 1280, 1024, 768, 393, 320]) {
    await layout.setViewportSize({ width, height: 941 });
    const bounds = await layout.evaluate(() => {
      const rect = (s) => {
        const r = document.querySelector(s).getBoundingClientRect();
        return { x: r.x, right: r.right, bottom: r.bottom, width: r.width };
      };
      return {
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
        content: rect(".ai-content"),
        directory: rect(".ai-directory"),
        missingIcons: [...document.querySelectorAll("#ai-page use")].filter(
          (e) => !document.querySelector(e.getAttribute("href")),
        ).length,
      };
    });
    assert.ok(bounds.scroll <= width + 1, JSON.stringify({ width, bounds }));
    assert.ok(bounds.content.right <= width + 1 && bounds.content.width > 200);
    assert.equal(bounds.missingIcons, 0);
    if ([1920, 1672, 1280].includes(width)) {
      await layout.screenshot({
        path: path.join(output, "ai-lesson-" + width + ".png"),
        fullPage: true,
        animations: "disabled",
      });
      await layout.locator("#ai-tab-practice").click();
      const overflow = await layout.evaluate(
        () => document.documentElement.scrollWidth,
      );
      assert.ok(overflow <= width + 1);
      await layout.screenshot({
        path: path.join(output, "ai-practice-" + width + ".png"),
        fullPage: true,
        animations: "disabled",
      });
      await layout.locator("#ai-tab-lesson").click();
    }
  }
  await layout.setViewportSize({ width: 1672, height: 941 });
  await layout.locator(".ai-key-point").first().hover();
  assert.equal(
    await layout
      .locator("#ai-page")
      .evaluate(
        (el) =>
          el
            .getAnimations({ subtree: true })
            .filter((a) => a.playState === "running").length,
      ),
    0,
  );
  passed.push("八种 Web 窗口尺寸、图标完整、精讲/练习无横向溢出与减少动态效果");

  const fault = await open("home", false);
  await fault.route("**/ai-content-network-engineer.json?*", (route) =>
    route.abort(),
  );
  await changeCourse(fault, "network-engineer");
  await expect(fault.locator("#ai-page")).toContainText("没有加载成功");
  await fault.unroute("**/ai-content-network-engineer.json?*");
  await click(fault, "reload");
  await expect(fault.locator("#ai-lesson-title")).toBeVisible();
  await fault.route(
    "**/ai-content-sichuan-upgrading-computer.json?*",
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      await route.continue();
    },
  );
  await changeCourse(fault, "sichuan-upgrading-computer");
  await changeCourse(fault, "network-engineer");
  await expect(fault.locator("#ai-lesson-title")).toHaveText(
    "路由优先级、管理距离与度量值",
  );
  await fault.waitForLoadState("networkidle");
  assert.equal(
    (await fault.evaluate(() => AceAiStudyDemo.catalog())).course.id,
    "network-engineer",
  );
  await fault.locator(".sidebar [data-action=home]").click();
  await fault.locator("#search").fill("AI");
  await fault.locator('.search-result[data-action="ai"]').click();
  await expect(fault.locator("#ai-page")).toBeVisible();
  await fault.locator(".sidebar [data-action=settings]").click();
  await fault.locator('#settings-page [data-settings-action="reset"]').click();
  await fault.locator('#demo-dialog [data-action="reset"]').click();
  await expect(fault.locator("body")).toHaveAttribute("data-page", "home");
  await fault.locator('.sidebar [data-action="ai"]').click();
  assert.equal((await aiState(fault)).favorites.length, 0);
  await expect(fault.locator("#ai-progress-caption")).toContainText("已学 0");
  passed.push(
    "加载失败重试、快速切换课程防串页、全局搜索入口、返回导航与重置演示",
  );

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
