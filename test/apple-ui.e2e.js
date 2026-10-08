// Layout and accessibility regressions for the Apple web presentation.
// All accounts and learning data live in a disposable local database.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { webkit, chromium, expect } from "@playwright/test";
import { createApp } from "../server/index.js";
import { createStore } from "../server/store.js";
import { mockStudyAI } from "./study-fixture.js";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aceexam-ios-ui-"));
const store = createStore(directory);
await store.register("ios_ui_owner", "fixture-password-123");
const learner = await store.register("ios_ui_learner", "fixture-password-123");
store.selectCertificate(learner.id, "network-engineer");
store.saveAccountEntitlement(learner.id, {
  plan: "vip",
  expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
});
const app = await createApp({
  store,
  production: true,
  withFrontend: true,
  authRequired: true,
  studyAI: mockStudyAI(),
});
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const output = path.resolve("test-output/ios-ui");
fs.mkdirSync(output, { recursive: true });
const labels = ["今日", "练习", "错题", "考试", "VIP", "我的"];
const names = ["today", "practice", "wrong", "exam", "vip", "profile"];
const sizes = [
  ["phone", { width: 393, height: 852 }],
  ["small", { width: 320, height: 568 }],
  ["landscape", { width: 844, height: 390 }],
  ["tablet", { width: 1024, height: 768 }],
];
let browser;
try {
  for (const [engine, type] of [
    ["webkit", webkit],
    ["chromium", chromium],
  ]) {
    browser = await type.launch({
      headless: true,
      proxy: { server: "http://127.0.0.1:9", bypass: "127.0.0.1,localhost" },
    });
    const context = await browser.newContext({
      viewport: sizes[0][1],
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const text = (value) =>
      page.getByText(value, { exact: true }).filter({ visible: true });
    const tab = (label) =>
      page.getByRole("button", { name: `${label}导航`, exact: true });
    async function shot(name) {
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      await page.screenshot({
        path: path.join(output, `${engine}-${name}.png`),
      });
    }
    async function layout(name, navigation = true) {
      if (navigation) {
        for (const label of labels) {
          await expect(tab(label)).toBeVisible();
          const box = await tab(label).boundingBox();
          const viewport = page.viewportSize();
          assert.ok(
            box && box.width >= 44 && box.height >= 44,
            `${name}: ${label} needs a 44px target`,
          );
          assert.ok(
            box.x >= -1 && box.x + box.width <= viewport.width + 1,
            `${name}: ${label} overflows horizontally`,
          );
          assert.ok(
            box.y >= 0 && box.y + box.height <= viewport.height + 1,
            `${name}: ${label} is outside the viewport`,
          );
        }
      }
      const overflow = await page.evaluate(() => {
        const viewport = innerWidth;
        return Array.from(
          document.querySelectorAll(
            '[role="button"], [role="radio"], [role="checkbox"], input, textarea',
          ),
        )
          .filter((el) => !el.closest('[aria-hidden="true"]'))
          .filter((el) => {
            // A chapter strip intentionally scrolls horizontally within its bounds.
            for (
              let parent = el.parentElement;
              parent;
              parent = parent.parentElement
            ) {
              const style = getComputedStyle(parent);
              if (
                ["auto", "scroll"].includes(style.overflowX) &&
                parent.scrollWidth > parent.clientWidth + 1
              ) {
                const bounds = parent.getBoundingClientRect();
                if (bounds.left >= 0 && bounds.right <= viewport + 1)
                  return false;
              }
            }
            return true;
          })
          .map((el) => ({ el, rect: el.getBoundingClientRect() }))
          .filter(
            ({ rect }) =>
              rect.width > 0 &&
              rect.height > 0 &&
              rect.bottom > 0 &&
              rect.top < innerHeight,
          )
          .filter(({ rect }) => rect.left < -1 || rect.right > viewport + 1)
          .map(({ el, rect }) => ({
            label:
              el.getAttribute("aria-label") ?? el.textContent?.slice(0, 60),
            left: rect.left,
            right: rect.right,
          }));
      });
      assert.deepEqual(
        overflow,
        [],
        `${name}: visible controls must fit the viewport`,
      );
    }
    try {
      await page.goto(`${base}/app/`);
      await text("欢迎回来").waitFor();
      await layout("auth", false);
      await shot("auth");
      await page
        .getByRole("textbox", { name: "账号", exact: true })
        .fill("ios_ui_learner");
      await page
        .getByLabel("密码", { exact: true })
        .fill("fixture-password-123");
      await page
        .getByRole("button", { name: "登录", exact: true })
        .last()
        .click();
      await text("每一步，都有进度").waitFor();
      for (const [size, viewport] of sizes) {
        await page.setViewportSize(viewport);
        await page.waitForFunction(() => {
          const rect = document
            .querySelector("#app-tab-bar")
            ?.getBoundingClientRect();
          return rect && rect.height > 0 && rect.bottom <= innerHeight + 1;
        });
        for (let index = 0; index < labels.length; index++) {
          await tab(labels[index]).click();
          await expect(tab(labels[index])).toHaveAttribute(
            "aria-pressed",
            "true",
          );
          await layout(`${engine}-${size}-${names[index]}`);
          if (size === "phone" || size === "tablet" || index < 2)
            await shot(`${size}-${names[index]}`);
        }
        console.log(
          `${engine}: all six pages fit ${viewport.width} × ${viewport.height}`,
        );
      }
      await page.setViewportSize(sizes[0][1]);
      await tab("我的").click();
      await text("外观、动画与音效").click();
      await text("主题模式").waitFor();
      await shot("settings");
      const soundSwitch = page.getByRole("switch", {
        name: "开启交互音效",
        exact: true,
      });
      await soundSwitch.scrollIntoViewIfNeeded();
      const soundEnabled = await soundSwitch.isChecked();
      await soundSwitch.click();
      if (soundEnabled) await expect(soundSwitch).not.toBeChecked();
      else await expect(soundSwitch).toBeChecked();
      await soundSwitch.click();
      await text("深色模式").click();
      await page.getByRole("button", { name: "关闭设置", exact: true }).click();
      await page.waitForFunction(
        () => document.documentElement.dataset.appTheme === "dark",
      );
      for (let index = 0; index < labels.length; index++) {
        await tab(labels[index]).click();
        await layout(`${engine}-dark-${names[index]}`);
        await shot(`dark-${names[index]}`);
      }
      await tab("VIP").click();
      await page
        .getByRole("button", { name: "进入 AI 精炼", exact: true })
        .click();
      await page
        .getByRole("button", { name: "返回 VIP", exact: true })
        .waitFor();
      await text("课程目录").waitFor();
      await layout("study", false);
      await shot("study");
      await page
        .getByRole("button", { name: /^(开始第一课|继续本课)$/ })
        .click();
      await text("先记住这一句").waitFor();
      await layout("study-lesson", false);
      await shot("study-lesson");
      await page.getByRole("button", { name: "问老师", exact: true }).click();
      await page.getByLabel("向 AI 老师提问", { exact: true }).waitFor();
      await layout("study-teacher", false);
      await shot("study-teacher");
      await page.getByRole("button", { name: "收起", exact: true }).click();
      await page
        .getByRole("button", { name: /^(我学完了，开始练习|开始填空练习)$/ })
        .click();
      await page.getByLabel("第 1 空答案", { exact: true }).waitFor();
      await layout("study-practice", false);
      await shot("study-practice");
      await page.getByRole("button", { name: "课程目录", exact: true }).click();
      await page.getByRole("button", { name: "返回 VIP", exact: true }).click();
      await tab("我的").click();
      await text("考匠社区").click();
      await page
        .getByRole("button", { name: "返回我的", exact: true })
        .waitFor();
      await layout("community", false);
      await shot("community");
      const message = `界面检查-${engine}`;
      await page.getByPlaceholder("说点什么…").fill(message);
      await page.getByRole("button", { name: "发送消息", exact: true }).click();
      await expect(page.getByPlaceholder("说点什么…")).toHaveValue("");
      await text(message).waitFor();
      await shot("community-message");
      await page.getByRole("button", { name: "返回我的", exact: true }).click();
      await tab("我的").click();
      await text("兑换码").click();
      await page.getByLabel("会员兑换码", { exact: true }).waitFor();
      await layout("redeem", false);
      await shot("redeem");
      assert.deepEqual(errors, []);
      console.log(
        `${engine}: dark mode, settings, course entry, community and redemption; no uncaught errors`,
      );
    } catch (error) {
      await shot("failure").catch(() => undefined);
      fs.writeFileSync(
        path.join(output, `${engine}-failure.txt`),
        await page.locator("body").innerText(),
      );
      throw error;
    } finally {
      await context.close();
      await browser.close();
      browser = null;
    }
  }
} finally {
  await browser?.close();
  await app.locals.stop();
  await new Promise((resolve) => server.close(resolve));
  store.db.close();
  assert.equal(
    path.dirname(path.resolve(directory)),
    path.resolve(os.tmpdir()),
  );
  assert.ok(path.basename(directory).startsWith("aceexam-ios-ui-"));
  fs.rmSync(directory, { recursive: true, force: true });
}
