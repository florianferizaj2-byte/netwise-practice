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
  passed = [];
async function open(route = "home", width = 1672) {
  const c = await browser.newContext({ viewport: { width, height: 941 } });
  contexts.push(c);
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  p.on("request", (r) => {
    if (!r.url().startsWith(new URL(base).origin)) external.push(r.url());
  });
  await p.goto(base + "#" + route, { waitUntil: "networkidle" });
  return p;
}
const state = (p) => p.evaluate(() => AceStudyFlow.state());
const session = (p) => p.evaluate(() => AceStudyFlow.activeSession());
const question = (p) =>
  p.evaluate(() => {
    const s = AceStudyFlow.activeSession();
    return AceStudyFlow.questionMap.get(s.qids[s.index]);
  });
async function route(p, name) {
  await p.locator('.sidebar [data-action="' + name + '"]').click();
  await expect(p.locator("body")).toHaveAttribute("data-page", name);
}
async function correct(p) {
  const q = await question(p);
  for (const n of q.answers)
    await p.locator('[data-study-option="' + n + '"]').click();
  await p.locator('[data-study-action="primary"]').click();
  return q;
}
async function issue(p, plan) {
  if (plan)
    await p.locator('input[name="vip-plan"][value="' + plan + '"]').check();
  await p.locator('[data-member-action="purchase"]').click();
  await expect(p.locator("#demo-dialog")).toContainText("不产生付款");
  await p.locator('[data-member-action="issue"]').click();
  const code = await p.locator("#vip-issued-code").inputValue();
  assert.match(code, /^DEMO-(BASIC|PLUS|PRO)-[A-Z0-9]{8}$/);
  await p.locator('[data-member-action="fill"]').click();
  await expect(p.locator("#vip-code")).toHaveValue(code);
  return code;
}
async function redeem(p) {
  await p.locator('#vip-redeem-form button[type="submit"]').click();
  await expect(p.locator("#demo-dialog")).toContainText("兑换成功");
  await p.locator(".close-dialog").click();
}
try {
  const wrong = await open();
  const before = (await state(wrong)).sessions.length;
  await route(wrong, "wrong");
  await expect(wrong.locator("#wrong-page")).toBeVisible();
  await expect(wrong.locator("#wrong-pending-total")).toHaveText("2");
  await expect(wrong.locator(".wrong-card")).toHaveCount(2);
  await expect(wrong.locator(".sidebar [data-action='wrong']")).toHaveAttribute(
    "aria-current",
    "page",
  );
  assert.equal(
    (await state(wrong)).sessions.length,
    before,
    "打开错题本不应启动复习",
  );
  await expect(wrong.locator("[data-wrong-chapter]")).toHaveCount(7);
  await wrong.reload({ waitUntil: "networkidle" });
  await expect(wrong.locator("#wrong-page")).toBeVisible();
  assert.equal((await state(wrong)).sessions.length, before);
  await wrong.locator('[data-wrong-chapter="0"]').click();
  await expect(wrong.locator(".wrong-card")).toHaveCount(0);
  await expect(wrong.locator('[data-wrong-action="practice"]')).toBeDisabled();
  await wrong.locator('[data-wrong-action="filter-reset"]').click();
  await wrong.locator('[data-wrong-tab="pending"]').click();
  await wrong.locator("#wrong-search").fill("Excel");
  await expect(wrong.locator(".wrong-card")).toHaveCount(1);
  await wrong.locator("#wrong-type-filter").selectOption("true_false");
  await expect(wrong.locator(".wrong-card")).toHaveCount(0);
  await wrong.locator("#wrong-type-filter").selectOption("all");
  await wrong.locator("#wrong-search").fill("");
  await wrong.locator('[data-wrong-action="practice"]').click();
  let s = await session(wrong);
  assert.equal(s.mode, "wrong");
  assert.equal(s.origin, "wrong");
  assert.equal(s.qids.length, 2);
  await expect(wrong.locator(".sidebar [data-action='wrong']")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    wrong.locator(".sidebar [data-action='chapters']"),
  ).not.toHaveAttribute("aria-current", "page");
  await expect(wrong.locator(".study-practice-heading .study-back")).toHaveText(
    "返回错题本",
  );
  await correct(wrong);
  const learned = s.qids[0];
  assert.equal(
    (await state(wrong)).wrongBook.entries[learned].status,
    "mastered",
  );
  await wrong.reload({ waitUntil: "networkidle" });
  await expect(wrong.locator(".sidebar [data-action='wrong']")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await wrong.locator('[data-study-action="finish"]').click();
  await wrong.locator('[data-study-action="finish-confirm"]').click();
  await expect(wrong.locator("#report-page")).toBeVisible();
  await expect(wrong.locator("#report-page .study-back")).toHaveText(
    "返回错题本",
  );
  await expect(
    wrong.locator(".study-report-actions [data-action='wrong']"),
  ).toHaveText("返回错题本");
  await wrong.locator("#report-page .study-back").click();
  await expect(wrong.locator("#wrong-pending-total")).toHaveText("1");
  await expect(wrong.locator("#wrong-mastered-total")).toHaveText("1");
  await expect(wrong.locator(".nav-badge")).toHaveText("1");
  await wrong.locator('[data-wrong-tab="mastered"]').click();
  await expect(wrong.locator(".wrong-card")).toHaveCount(1);
  await wrong.locator("[data-wrong-action='detail']").first().click();
  await expect(wrong.locator(".library-detail-analysis")).toContainText(
    "正确答案",
  );
  await wrong.locator('[data-wrong-action="status-dialog"]').click();
  await expect(wrong.locator("#wrong-pending-total")).toHaveText("2");
  await expect(wrong.locator(".nav-badge")).toHaveText("2");
  assert.equal(
    await wrong.evaluate(() => {
      const old = practiceConfig.range;
      practiceConfig.range = "wrong";
      const n = configuredQuestions().length;
      practiceConfig.range = old;
      return n;
    }),
    2,
    "重新加入的已答对题也应进入章节错题范围",
  );
  await wrong.locator('[data-wrong-action="undo"]').click();
  await expect(wrong.locator("#wrong-mastered-total")).toHaveText("1");
  passed.push(
    "错题入口先总览，七章筛选，复习/刷新/报告/返回保持错题导航，答对自动掌握",
  );

  await wrong.locator('[data-wrong-tab="pending"]').click();
  await wrong.locator('[data-wrong-action="manage"]').click();
  await wrong.locator("#wrong-select-all").check();
  await wrong.locator('[data-wrong-action="master-selected"]').click();
  await expect(wrong.locator("#wrong-pending-total")).toHaveText("0");
  await expect(wrong.locator(".nav-badge")).toHaveText("0");
  assert.equal(
    await wrong.evaluate(() => {
      const old = practiceConfig.range;
      practiceConfig.range = "wrong";
      const n = configuredQuestions().length;
      practiceConfig.range = old;
      return n;
    }),
    0,
    "手动掌握的题应从章节错题范围移出",
  );
  await wrong.locator('[data-wrong-action="undo"]').click();
  await expect(wrong.locator("#wrong-pending-total")).toHaveText("1");
  await wrong.locator("#wrong-select-all").check();
  await wrong.locator('[data-wrong-action="remove-selected"]').click();
  await expect(wrong.locator("#wrong-pending-total")).toHaveText("0");
  await wrong.reload({ waitUntil: "networkidle" });
  await expect(wrong.locator("#wrong-pending-total")).toHaveText("0");
  const removed = Object.entries((await state(wrong)).wrongBook.entries).find(
    ([, e]) => e.status === "removed",
  )[0];
  await wrong.evaluate((id) => {
    const q = AceStudyFlow.questionMap.get(id);
    AceStudyFlow.createSession("practice", q.chapterIndex, [q], {
      forceNew: true,
    });
  }, removed);
  await correct(wrong);
  await route(wrong, "wrong");
  assert.equal(
    (await state(wrong)).wrongBook.entries[removed].status,
    "removed",
    "移出后的题答对不应重新收录",
  );
  await route(wrong, "chapters");
  await wrong.evaluate((id) => {
    const q = AceStudyFlow.questionMap.get(id);
    AceStudyFlow.createSession("practice", q.chapterIndex, [q], {
      forceNew: true,
    });
  }, removed);
  let q = await question(wrong);
  const bad = q.options.findIndex((_, i) => !q.answers.includes(i));
  await wrong.locator('[data-study-option="' + bad + '"]').click();
  await wrong.locator('[data-study-action="primary"]').click();
  await route(wrong, "wrong");
  await expect(wrong.locator("#wrong-pending-total")).toHaveText("1");
  assert.equal((await state(wrong)).wrongBook.entries[removed].wrongCount, 2);
  await wrong.locator('[data-wrong-action="detail"]').first().click();
  await expect(wrong.locator(".library-detail-analysis")).toContainText(
    "上次错误选择",
  );
  const favoriteId = await wrong
    .locator('[data-wrong-action="favorite"]')
    .getAttribute("data-id");
  const wasFavorite = (await state(wrong)).favorites.includes(favoriteId);
  await wrong.locator('[data-wrong-action="favorite"]').click();
  assert.equal(
    (await state(wrong)).favorites.includes(favoriteId),
    !wasFavorite,
  );
  await wrong.locator(".close-dialog").click();
  await wrong.locator("#wrong-select-all").check();
  await wrong
    .locator('[data-wrong-setting="order"][data-value="random"]')
    .click();
  await wrong.locator('[data-wrong-setting="count"][data-value="5"]').click();
  await wrong.locator('[data-wrong-action="practice-selected"]').click();
  assert.equal((await session(wrong)).order, "random");
  assert.equal((await session(wrong)).qids.length, 1);
  passed.push(
    "错题掌握/移出/撤销、刷新保留、再次答错重收录、解析历史、收藏同步与所选复习",
  );

  const latest = await open("wrong");
  const latestId = await latest
    .locator("[data-wrong-select]")
    .first()
    .getAttribute("data-wrong-select");
  await latest.locator("[data-wrong-select]").first().check();
  await latest.locator('[data-wrong-action="master-selected"]').click();
  await latest.evaluate((id) => {
    const q = AceStudyFlow.questionMap.get(id);
    AceStudyFlow.createSession("practice", q.chapterIndex, [q], {
      forceNew: true,
    });
  }, latestId);
  await correct(latest);
  await latest.locator('[data-wrong-action="undo"]').click();
  assert.equal(
    (await state(latest)).wrongBook.entries[latestId].status,
    "mastered",
    "撤销旧管理操作不应覆盖最新作答结果",
  );
  passed.push("移出后的题答对保持移出，撤销不覆盖较新的作答状态");
  const migrated = await open("wrong");
  await migrated.evaluate(() => {
    delete AceStudyFlow.state().wrongBook;
    AceStudyFlow.save();
  });
  await migrated.reload({ waitUntil: "networkidle" });
  await expect(migrated.locator("#wrong-pending-total")).toHaveText("2");
  passed.push("旧错题记录迁移到总览并保留");

  const vip = await open("vip");
  await expect(vip.locator(".vip-plan-card")).toHaveCount(3);
  await expect(vip.locator("#vip-status")).toHaveText("当前会员：未开通");
  await vip.locator('input[name="vip-plan"][value="basic"]').check();
  await expect(vip.locator("#vip-selected-price")).toHaveText("¥19.00");
  await expect(vip.locator("#vip-selected-info")).toContainText("100 次");
  await vip.reload({ waitUntil: "networkidle" });
  await expect(
    vip.locator('input[name="vip-plan"][value="basic"]'),
  ).toBeChecked();
  await vip.locator("#vip-redeem-form button[type='submit']").click();
  await expect(vip.locator("#vip-code-error")).toContainText("请先输入");
  await expect(vip.locator("#vip-code")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await vip.locator("#vip-code").fill("invalid-code");
  await vip.locator("#vip-redeem-form button[type='submit']").click();
  await expect(vip.locator("#vip-code-error")).toContainText("未找到");
  await vip.locator('[data-member-action="ai"]').click();
  await expect(vip.locator("body")).toHaveAttribute("data-page", "ai");
  await vip.locator('#ai-page [data-ai-action="teacher"]').click();
  await expect(vip.locator("#demo-dialog")).toContainText("开通 VIP");
  await vip.locator(".close-dialog").click();
  await vip.locator('.sidebar [data-action="vip"]').click();
  const card = await issue(vip, "plus");
  await redeem(vip);
  await expect(vip.locator("#vip-status")).toHaveText("当前会员：进阶 VIP");
  await expect(vip.locator("#vip-ai-state")).toContainText("300 / 300");
  let m = (await state(vip)).memberDemo;
  assert.equal(m.redemptions.length, 1);
  assert.equal(m.active.planId, "plus");
  assert.ok(m.active.expiresAt > Date.now() + 29 * 86400000);
  await vip.reload({ waitUntil: "networkidle" });
  await expect(vip.locator("#vip-status")).toContainText("进阶 VIP");
  await vip.locator("#vip-code").fill(card);
  await vip.locator("#vip-redeem-form button[type='submit']").click();
  await expect(vip.locator("#vip-code-error")).toContainText("已经兑换");
  assert.equal((await state(vip)).memberDemo.redemptions.length, 1);
  await vip.locator('[data-member-action="history"]').click();
  await expect(vip.locator(".vip-history-card")).toHaveCount(1);
  await expect(vip.locator(".vip-history-card")).toContainText(card.slice(-4));
  await vip.locator(".close-dialog").click();
  await vip.locator('[data-member-action="help"]').click();
  await expect(vip.locator(".vip-help-list")).toContainText("不产生付款");
  await vip.locator(".close-dialog").click();
  await vip.locator('[data-member-action="ai"]').click();
  await expect(vip.locator("body")).toHaveAttribute("data-page", "ai");
  await vip.locator('#ai-page [data-ai-action="teacher"]').click();
  await expect(vip.locator("#demo-dialog")).toContainText("问 AI 老师");
  await vip
    .locator('[data-ai-action="teacher-preset"][data-preset="0"]')
    .click();
  await expect(vip.locator("#demo-dialog")).toContainText("剩余 299");
  assert.equal((await state(vip)).memberDemo.active.used, 1);
  await vip.locator(".close-dialog").click();
  await vip.locator('.sidebar [data-action="vip"]').click();
  passed.push(
    "三档会员、套餐状态恢复、空/无效/重复卡密校验、兑换开通/记录/说明与 AI 演示额度",
  );

  await issue(vip, "pro");
  await vip.locator("#vip-redeem-form button[type='submit']").click();
  await expect(vip.locator("#demo-dialog")).toContainText("更新演示会员");
  await vip.locator('[data-member-action="redeem-confirm"]').click();
  await vip.locator(".close-dialog").click();
  await expect(vip.locator("#vip-status")).toContainText("尊享 VIP");
  assert.equal((await state(vip)).memberDemo.active.quota, 1000);
  assert.equal((await state(vip)).memberDemo.redemptions.length, 2);
  await vip.evaluate(() => {
    const m = AceStudyFlow.state().memberDemo;
    m.active.used = m.active.quota;
    AceStudyFlow.save();
  });
  await vip.reload({ waitUntil: "networkidle" });
  await vip.locator('[data-member-action="ai"]').click();
  await expect(vip.locator("body")).toHaveAttribute("data-page", "ai");
  await vip.locator('#ai-page [data-ai-action="teacher"]').click();
  await expect(vip.locator("#demo-dialog")).toContainText("额度已用完");
  assert.equal((await state(vip)).memberDemo.active.used, 1000);
  await vip.locator(".close-dialog").click();
  await vip.locator('.sidebar [data-action="vip"]').click();
  await vip.evaluate(() => {
    AceStudyFlow.state().memberDemo.active.expiresAt = Date.now() - 100;
    AceStudyFlow.save();
  });
  await vip.reload({ waitUntil: "networkidle" });
  await expect(vip.locator("#vip-status")).toHaveText("当前会员：已到期");
  await vip.locator('[data-member-action="ai"]').click();
  await expect(vip.locator("body")).toHaveAttribute("data-page", "ai");
  await vip.locator('#ai-page [data-ai-action="teacher"]').click();
  await expect(vip.locator("#demo-dialog")).toContainText("开通 VIP");
  await vip.locator(".close-dialog").click();
  await vip.locator('.sidebar [data-action="vip"]').click();
  await issue(vip, "basic");
  await redeem(vip);
  await expect(vip.locator("#vip-status")).toContainText("基础 VIP");
  assert.equal((await state(vip)).memberDemo.active.used, 0);
  passed.push("新卡更新确认、演示额度用尽、会员到期及重新开通");

  const layout = await open("vip");
  for (const width of [1280, 1440, 1672, 1920]) {
    await layout.setViewportSize({ width, height: 941 });
    for (const name of ["vip", "wrong"]) {
      await route(layout, name);
      const bounds = await layout.evaluate(() => {
        const root = document.querySelector(
          "#" + document.body.dataset.page + "-page",
        );
        return {
          width: innerWidth,
          scroll: document.documentElement.scrollWidth,
          panels: [
            ...root.querySelectorAll(".library-panel,.vip-plan-card"),
          ].map((el) => {
            const r = el.getBoundingClientRect();
            return { left: r.left, right: r.right, width: r.width };
          }),
        };
      });
      assert.ok(
        bounds.scroll <= width + 1,
        name + " " + width + " 水平不应溢出",
      );
      assert.ok(
        bounds.panels.every(
          (r) => r.left >= 0 && r.right <= width + 1 && r.width >= 150,
        ),
        name + " " + width + " 面板可用",
      );
      if (width === 1672)
        await layout.screenshot({
          path: path.join(output, name + "-page-final.png"),
          fullPage: true,
        });
    }
  }
  const many = await open("wrong");
  await many.evaluate(() => {
    const s = AceStudyFlow.state();
    for (const [id, q] of AceStudyFlow.questionMap) {
      s.records[id] = { correct: false };
      s.wrongBook.entries[id] = {
        firstWrongAt: Date.now(),
        lastWrongAt: Date.now(),
        wrongCount: 1,
        status: "pending",
      };
    }
    AceStudyFlow.save();
  });
  await many.reload({ waitUntil: "networkidle" });
  await expect(many.locator("#wrong-pending-total")).toHaveText("206");
  await many.locator('[data-wrong-page="69"]').click();
  await expect(many.locator(".wrong-card")).toHaveCount(2);
  await many.locator("#wrong-select-all").check();
  await expect(many.locator("#wrong-selected-count")).toHaveText("206");
  passed.push("1280 / 1440 / 1672 / 1920 桌面布局与大量错题分页/全选");
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    JSON.stringify(
      {
        passed,
        pageErrors: errors,
        externalRequests: external,
        screenshots: ["vip-page-final.png", "wrong-page-final.png"],
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const c of contexts) await c.close();
  await browser.close();
}
