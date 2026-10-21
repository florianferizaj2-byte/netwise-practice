import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
const base =
  process.env.ACEEXAM_DEMO_URL || "http://127.0.0.1:4177/demo/home-blue/";
const out = path.resolve("outputs/home-blue-demo");
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  proxy: { server: "http://127.0.0.1:9", bypass: "localhost,127.0.0.1" },
});
const contexts = [],
  errors = [],
  passed = [];
async function open(route = "exam", width = 1672) {
  const c = await browser.newContext({ viewport: { width, height: 941 } });
  contexts.push(c);
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await p.goto(base + "#" + route, { waitUntil: "networkidle" });
  return p;
}
const stored = (p) =>
  p.evaluate(() =>
    JSON.parse(localStorage.getItem("aceexam.home-blue.study.v1")),
  );
const active = (p) => p.evaluate(() => AceStudyFlow.activeSession());
const question = (p) =>
  p.evaluate(() => {
    const s = AceStudyFlow.activeSession();
    return AceStudyFlow.questionMap.get(s.qids[s.index]);
  });
async function route(p, name) {
  await p.locator('.sidebar [data-action="' + name + '"]').click();
  await expect(p.locator("body")).toHaveAttribute("data-page", name);
}
async function correctDraft(p) {
  const q = await question(p);
  for (const n of q.answers)
    await p.locator('[data-study-option="' + n + '"]').click();
  return q;
}
async function expectNoAnalysis(p) {
  await expect(p.locator(".study-analysis")).toHaveCount(0);
  await expect(
    p.locator(".answer-jump.correct,.answer-jump.wrong"),
  ).toHaveCount(0);
}
try {
  const p = await open();
  await expect(p.locator(".knowledge-group")).toHaveCount(7);
  await expect(p.locator("[data-exam-knowledge]")).toHaveCount(18);
  assert.equal((await stored(p)).collection.builder.selected.length, 4);
  const total = await p.locator(".knowledge-tile small").allTextContents();
  assert.equal(
    total.reduce((n, s) => n + Number(s.match(/\d+/)[0]), 0),
    206,
  );
  await p.locator("#exam-more-chapters").selectOption("6");
  await expect(p.locator(".knowledge-group")).toHaveCount(1);
  await expect(p.locator(".knowledge-group-heading")).toContainText(
    "计算机新技术",
  );
  await p.locator('[data-exam-chapter="all"]').click();
  await p.locator("#exam-knowledge-search").fill("数据库");
  await expect(p.locator(".knowledge-group")).toHaveCount(1);
  await expect(p.locator(".knowledge-group")).toContainText("数据库技术");
  await p.locator("#exam-knowledge-search").fill("找不到的内容");
  await expect(p.locator("#exam-knowledge-groups")).toContainText("没有找到");
  await p.locator('[data-library-action="exam-search-reset"]').click();
  await p.locator('[data-library-action="exam-clear"]').click();
  await expect(p.locator('[data-library-action="exam-start"]')).toBeDisabled();
  await p.locator('[data-exam-group="6"]').check();
  await expect(p.locator("#exam-selected-count")).toHaveText("4");
  await expect(p.locator("#exam-capacity-note")).toContainText("可用");
  await p.locator("#exam-name").fill("a");
  await expect(p.locator('[data-library-action="exam-start"]')).toBeDisabled();
  await p.locator("#exam-name").fill("新技术专项测验");
  await p.locator('[data-exam-type="multiple_choice"]').check();
  await p
    .locator('[data-library-setting="exam-count"][data-value="50"]')
    .click();
  const small = (await stored(p)).collection.builder;
  assert.equal(small.selected.length, 4);
  await p.locator('[data-library-action="exam-start"]').click();
  let session = await active(p);
  assert.equal(session.qids.length, 7);
  assert.equal(new Set(session.qids).size, 7);
  assert.ok(
    (
      await p.evaluate(() =>
        AceStudyFlow.activeSession().qids.map(
          (id) => AceStudyFlow.questionMap.get(id).chapterIndex,
        ),
      )
    ).every((i) => i === 6),
  );
  await expect(p.locator("#practice-title")).toHaveText("新技术专项测验");
  await correctDraft(p);
  await expectNoAnalysis(p);
  await expect(p.locator("#practice-answered")).toHaveText("1");
  const one = await active(p);
  await route(p, "exam");
  await expect(p.locator("#exam-ongoing")).toBeVisible();
  await p.locator('[data-library-action="exam-start"]').click();
  assert.equal((await active(p)).id, one.id, "未交卷考试不能被新考试覆盖");
  await p.locator('[data-study-option="0"]').click();
  await expect(p.locator('[data-study-option="0"]')).toBeEnabled();
  await expectNoAnalysis(p);
  const savedDraft = (await active(p)).selections;
  await p.reload({ waitUntil: "networkidle" });
  session = await active(p);
  assert.deepEqual(session.selections, savedDraft);
  assert.equal(session.id, one.id);
  assert.equal(session.examDeadlineAt, one.examDeadlineAt);
  await expect(p.locator('[data-study-option="0"]')).toHaveAttribute(
    "aria-pressed",
    String((session.selections[session.qids[session.index]] || []).includes(0)),
  );
  passed.push("七章 18 个知识点、搜索/切换/全选、实际题量与考试恢复");

  const exam = await open();
  const preview = await exam.locator(".allocation-row b").allTextContents();
  assert.equal(
    preview.reduce((n, t) => n + Number(t.match(/\d+/)[0]), 0),
    30,
  );
  await exam.locator('[data-library-action="exam-start"]').click();
  session = await active(exam);
  const originalSession = session;
  assert.equal(session.qids.length, 30);
  assert.equal(new Set(session.qids).size, 30);
  const distribution = await exam.evaluate(() => {
    const s = AceStudyFlow.activeSession(),
      b = AceStudyFlow.state().collection.builder;
    const areas = AceStudyFlow.pools.flatMap((pool, ch) =>
      [...new Set(pool.map((q) => q.section || q.point || q.chapter))].map(
        (sec, i) => ({
          id: "k-" + ch + "-" + i,
          ids: pool
            .filter((q) => (q.section || q.point || q.chapter) === sec)
            .map((q) => q.id),
        }),
      ),
    );
    const allocation = Object.fromEntries(
      b.selected.map((id) => [
        id,
        s.qids.filter((qid) => areas.find((k) => k.id === id).ids.includes(qid))
          .length,
      ]),
    );
    return {
      valid: s.qids.every(
        (id) =>
          b.types.includes(AceStudyFlow.questionMap.get(id).type) &&
          areas
            .filter((k) => b.selected.includes(k.id))
            .some((k) => k.ids.includes(id)),
      ),
      allocation,
      preview: s.allocation,
    };
  });
  assert.ok(distribution.valid);
  assert.deepEqual(distribution.allocation, distribution.preview);
  const q0 = await correctDraft(exam);
  await exam
    .locator(
      '[data-study-option="' +
        q0.options.findIndex((_, i) => !q0.answers.includes(i)) +
        '"]',
    )
    .click();
  // A draft is editable; restore the correct answer before submission.
  await exam.locator('[data-study-option="' + q0.answers[0] + '"]').click();
  await exam.locator('[data-study-action="primary"]').click();
  const q1 = await question(exam);
  const wrong = q1.options.findIndex((_, i) => !q1.answers.includes(i));
  await exam.locator('[data-study-option="' + wrong + '"]').click();
  await expectNoAnalysis(exam);
  await expect(exam.locator("#sheet-accuracy")).toHaveText("交卷后显示");
  assert.equal(
    (await stored(exam)).stats.answeredTotal,
    21,
    "草稿不应计入作答统计",
  );
  await exam.locator('[data-study-action="primary"]').click();
  await exam.locator(".study-primary").click(); // Allow an unanswered question to be skipped.
  await expect(exam.locator("#study-question-card")).toContainText("第 4 题");
  await route(exam, "plan");
  const remainingBefore = await exam.evaluate(() =>
    AceStudyFlow.remaining(AceStudyFlow.activeSession()),
  );
  await exam.waitForTimeout(1100);
  await route(exam, "exam");
  await exam.locator('[data-library-action="exam-resume"]').click();
  const remainingAfter = await exam.evaluate(() =>
    AceStudyFlow.remaining(AceStudyFlow.activeSession()),
  );
  assert.ok(remainingAfter < remainingBefore, "离开考试页面不应暂停倒计时");
  await exam.reload({ waitUntil: "networkidle" });
  session = await active(exam);
  assert.equal(session.examDeadlineAt, originalSession.examDeadlineAt);
  assert.deepEqual(session.qids, originalSession.qids);
  await exam.locator('[data-study-action="finish"]').click();
  await expect(exam.locator("#demo-dialog")).toContainText("28 题未答");
  await exam.locator('[data-study-action="finish-confirm"]').click();
  await expect(exam.locator("#report-title")).toHaveText("模拟考试报告");
  session = await active(exam);
  assert.equal(session.examScore, 3.3);
  assert.equal(session.finished, true);
  assert.equal((await stored(exam)).stats.answeredTotal, 23);
  await expect(exam.locator(".exam-result-stats")).toContainText("28");
  await exam
    .locator('#report-page [data-library-action="exam-history"]')
    .click();
  await expect(exam.locator(".library-history-row")).toHaveCount(1);
  await exam.locator(".library-history-row").click();
  await exam.locator('[data-library-action="exam-review"]').click();
  await expect(exam.locator(".study-analysis")).toBeVisible();
  await expect(exam.locator('[data-study-option="0"]')).toBeDisabled();
  await exam.locator('[data-study-action="finish"]').click();
  const statsAfter = (await stored(exam)).stats.answeredTotal;
  await exam.reload({ waitUntil: "networkidle" });
  assert.equal((await stored(exam)).stats.answeredTotal, statsAfter);
  await exam.locator('[data-library-action="exam-wrong-practice"]').click();
  assert.equal((await active(exam)).mode, "wrong");
  assert.equal((await active(exam)).qids.length, 1);
  await expect(exam.locator(".study-analysis")).toHaveCount(0);
  passed.push(
    "组卷分配与题型一致、答案回改、草稿隐藏解析、交卷判分、考试历史和错题再练",
  );

  const timed = await open();
  await timed.locator('[data-library-action="exam-start"]').click();
  await correctDraft(timed);
  const beforeTimeout = (await stored(timed)).stats.answeredTotal;
  await timed.evaluate(() => {
    const s = AceStudyFlow.activeSession();
    s.examStartedAt = Date.now() - s.examMinutes * 60000;
    s.examDeadlineAt = Date.now() - 100;
    AceStudyFlow.save();
  });
  await timed.reload({ waitUntil: "networkidle" });
  await expect(timed.locator("#report-title")).toHaveText("模拟考试报告", {
    timeout: 5000,
  });
  await expect(timed.locator(".exam-result-hero")).toContainText("已自动交卷");
  session = await active(timed);
  assert.equal(session.finishReason, "timeout");
  assert.equal(session.examScore, 3.3);
  assert.equal((await stored(timed)).stats.answeredTotal, beforeTimeout + 1);
  await timed.reload({ waitUntil: "networkidle" });
  assert.equal((await stored(timed)).stats.answeredTotal, beforeTimeout + 1);
  passed.push("超时刷新自动交卷，成绩与答题统计只记一次");

  const library = await open("favorites");
  await expect(library.locator("#favorites-question-count")).toHaveText("12");
  await expect(library.locator("#favorites-knowledge-count")).toHaveText("4");
  await expect(library.locator("#favorites-week-count")).toHaveText("3");
  await expect(library.locator(".favorite-card")).toHaveCount(3);
  await library.locator('[data-favorite-page="2"]:not([aria-label])').click();
  await expect(
    library.locator('[data-favorite-page="2"]:not([aria-label])'),
  ).toHaveAttribute("aria-current", "page");
  await library.locator("#favorites-search").fill("OSI");
  await expect(library.locator(".favorite-card")).toHaveCount(1);
  await library.locator("#favorites-chapter-filter").selectOption("2");
  await expect(library.locator(".favorite-card")).toHaveCount(0);
  await library
    .locator('[data-library-action="favorites-filter-reset"]')
    .click();
  await library.locator("#favorites-type-filter").selectOption("true_false");
  const filteredTypes = await library
    .locator(".favorite-card-tag:not(.chapter)")
    .allTextContents();
  assert.ok(filteredTypes.every((t) => t === "判断题"));
  await library.locator("#favorites-type-filter").selectOption("all");
  await library.locator("#favorites-sort").selectOption("oldest");
  const oldTop = await library
    .locator("[data-favorite-select]")
    .first()
    .getAttribute("data-favorite-select");
  await library.locator("#favorites-sort").selectOption("recent");
  assert.notEqual(
    await library
      .locator("[data-favorite-select]")
      .first()
      .getAttribute("data-favorite-select"),
    oldTop,
  );
  await library.locator('[data-library-action="favorites-manage"]').click();
  await library.locator("[data-favorite-select]").nth(0).check();
  await library.locator("[data-favorite-select]").nth(1).check();
  await expect(library.locator("#favorites-selected-count")).toHaveText("2");
  const ids = (await stored(library)).favorites;
  await library
    .locator('[data-library-action="favorites-remove-selected"]')
    .click();
  await expect(library.locator("#favorites-question-count")).toHaveText("10");
  await library.locator('[data-library-action="favorite-undo"]').click();
  assert.deepEqual((await stored(library)).favorites, ids);
  await library.locator("#favorites-search").fill("OSI");
  await library.locator("#favorites-select-all").check();
  await expect(library.locator("#favorites-selected-count")).toHaveText("1");
  await library
    .locator('[data-library-action="favorites-practice-selected"]')
    .click();
  await expect(library.locator("#practice-title")).toHaveText("所选收藏练习");
  assert.equal((await active(library)).qids.length, 1);
  assert.equal((await active(library)).origin, "favorites");
  passed.push("收藏分类、搜索/章节/题型/排序/分页、批量取消撤销、所选题目练习");

  await route(library, "favorites");
  await library.locator("#favorites-search").fill("");
  await library.locator("#favorites-chapter-filter").selectOption("all");
  await library.locator("#favorites-type-filter").selectOption("all");
  const viewId = await library
    .locator('[data-library-action="favorite-detail"]')
    .first()
    .getAttribute("data-id");
  await library
    .locator('[data-library-action="favorite-detail"]')
    .first()
    .click();
  await expect(library.locator(".library-detail-analysis")).toBeVisible();
  await library.locator(".close-dialog").click();
  await library
    .locator('[data-library-action="favorite-menu"]')
    .first()
    .click();
  await expect(library.locator(".library-menu-actions")).toBeVisible();
  await library
    .locator('[data-library-action="favorite-practice-one"]')
    .click();
  assert.equal((await active(library)).qids[0], viewId);
  await library.locator('[data-study-action="favorite"]').click();
  await expect(
    library.locator('[data-study-action="favorite"]'),
  ).toHaveAttribute("aria-pressed", "false");
  await route(library, "favorites");
  assert.equal((await stored(library)).favorites.includes(viewId), false);
  await library
    .locator('[data-library-action="favorites-knowledge-all"]')
    .click();
  await expect(
    library.locator('[data-library-tab="knowledge"]'),
  ).toHaveAttribute("aria-selected", "true");
  await expect(library.locator("#favorites-type-label")).not.toBeVisible();
  await library
    .locator('[data-library-action="knowledge-detail"]')
    .first()
    .click();
  await expect(library.locator(".knowledge-detail-note")).toContainText(
    "复习要点",
  );
  await library.locator(".close-dialog").click();
  await library
    .locator("#favorites-list [data-favorite-select]")
    .first()
    .check();
  await library
    .locator('[data-library-setting="favorite-count"][data-value="all"]')
    .click();
  const pickedK = await library
    .locator("[data-favorite-select]")
    .first()
    .getAttribute("data-favorite-select");
  const selectedKnowledge = (
    await stored(library)
  ).collection.knowledgeFavorites.find((id) => id === pickedK);
  assert.ok(selectedKnowledge);
  await library
    .locator('[data-library-action="favorites-practice-selected"]')
    .click();
  const pointSession = await active(library);
  assert.ok(pointSession.qids.length > 1);
  assert.equal(new Set(pointSession.qids).size, pointSession.qids.length);
  await expect(library.locator("#practice-title")).toHaveText("收藏知识点练习");
  await route(library, "favorites");
  await library.locator('[data-library-action="knowledge-add"]').click();
  const newPoint = library
    .locator(
      '[data-library-action="knowledge-picker-toggle"][aria-pressed="false"]',
    )
    .first();
  const pointId = await newPoint.getAttribute("data-id");
  await newPoint.click();
  await expect(
    library.locator(
      '[data-library-action="knowledge-picker-toggle"][data-id="' +
        pointId +
        '"]',
    ),
  ).toHaveAttribute("aria-pressed", "true");
  await library.locator(".close-dialog").click();
  assert.ok(
    (await stored(library)).collection.knowledgeFavorites.includes(pointId),
  );
  await library.reload({ waitUntil: "networkidle" });
  assert.ok(
    (await stored(library)).collection.knowledgeFavorites.includes(pointId),
  );
  passed.push(
    "题目详情与菜单、刷题星标同步、知识点收藏/详情/持久保存/专项练习",
  );

  const empty = await open("favorites");
  await empty.locator("#favorites-select-all").check();
  await empty
    .locator('[data-library-action="favorites-remove-selected"]')
    .click();
  await expect(empty.locator("#favorites-question-count")).toHaveText("0");
  await expect(
    empty.locator('[data-library-action="favorites-practice"]'),
  ).toBeDisabled();
  await empty.reload({ waitUntil: "networkidle" });
  await expect(empty.locator("#favorites-question-count")).toHaveText("0");
  await expect(empty.locator("#favorites-list")).toContainText(
    "把重要内容收进来",
  );
  await empty.locator('[data-library-action="favorite-seed"]').click();
  await expect(empty.locator("#favorites-question-count")).toHaveText("12");
  await empty
    .locator('[data-library-setting="favorite-range"][data-value="new"]')
    .click();
  await empty
    .locator('[data-library-setting="favorite-count"][data-value="10"]')
    .click();
  await empty
    .locator('[data-library-setting="favorite-order"][data-value="sequential"]')
    .click();
  const beforePractice = await stored(empty);
  await empty.locator('[data-library-action="favorites-practice"]').click();
  session = await active(empty);
  assert.equal(session.order, "sequential");
  assert.ok(session.qids.every((id) => !beforePractice.records[id]));
  assert.equal(
    session.qids.length,
    Math.min(
      10,
      beforePractice.favorites.filter((id) => !beforePractice.records[id])
        .length,
    ),
  );
  passed.push("空收藏刷新不重新填充、示例加载、未练范围/题量/练习顺序");

  const preserved = await open("favorites");
  const kept = (await stored(preserved)).favorites[0];
  await preserved.evaluate((id) => {
    const s = AceStudyFlow.state();
    s.favorites = [id];
    delete s.collection;
    delete s.favoriteSeedPending;
    AceStudyFlow.save();
  }, kept);
  await preserved.reload({ waitUntil: "networkidle" });
  assert.deepEqual((await stored(preserved)).favorites, [kept]);
  passed.push("旧版收藏数据升级后保留");

  const layout = await open();
  for (const width of [1280, 1440, 1672, 1920]) {
    await layout.setViewportSize({ width, height: 941 });
    for (const name of ["exam", "favorites"]) {
      await route(layout, name);
      const bounds = await layout.evaluate(() => {
        const page = document.querySelector(
          "#" + document.body.dataset.page + "-page",
        );
        return {
          scroll: document.documentElement.scrollWidth,
          width: window.innerWidth,
          panels: [...page.querySelectorAll(".library-panel")].map((e) => {
            const r = e.getBoundingClientRect();
            return { right: r.right, left: r.left, width: r.width };
          }),
          start: [...page.querySelectorAll(".library-start")].every(
            (e) => e.getBoundingClientRect().width > 200,
          ),
        };
      });
      assert.ok(
        bounds.scroll <= bounds.width + 1,
        name + " " + width + " 不应水平溢出",
      );
      assert.ok(
        bounds.panels.every(
          (r) => r.left >= 0 && r.right <= width + 1 && r.width > 250,
        ),
        name + " " + width + " 面板应在视口内",
      );
      assert.ok(bounds.start, name + " " + width + " 主按钮应保持可用宽度");
      if (width === 1672)
        await layout.screenshot({
          path: path.join(
            out,
            name === "exam"
              ? "exam-builder-final.png"
              : "favorites-page-final.png",
          ),
          fullPage: true,
        });
    }
  }
  passed.push("1280 / 1440 / 1672 / 1920 桌面布局，无水平溢出");
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        passed,
        errors,
        screenshots: ["exam-builder-final.png", "favorites-page-final.png"],
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
