// Production UI and provider, isolated accounts and synthetic transport only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { expect } from "@playwright/test";
import { createStore } from "../server/store.js";
import { createApp } from "../server/index.js";
import { OpenAICompatibleProvider } from "../server/ai.js";
import { decrypt } from "../server/security.js";
import { launchTestBrowser } from "./helpers/browser.js";

Object.assign(process.env, {
  ALLOWED_HOSTS: "localhost,127.0.0.1",
  COOKIE_SECURE: "0",
  AI_SERVICE_API_KEY: "synthetic-browser-legacy-key",
  AI_SERVICE_MODEL: "deepseek-flash",
  AI_SERVICE_BASE_URL: "https://api.deepseek.com",
});
const parent = path.resolve("tmp"),
  directory = fs.mkdtempSync(path.join(parent, "ai-channels-browser-")),
  out = path.resolve("tmp/ai-model-services-20261024/browser");
fs.mkdirSync(out, { recursive: true });
const store = createStore(directory),
  owner = store.register("channels_browser_admin", "fixture-password-123"),
  learner = store.register("channels_browser_learner", "fixture-password-123");
store.db.prepare("UPDATE users SET is_admin=1 WHERE id=?").run(owner.id);
for (const user of [owner, learner])
  store.selectCertificate(user.id, "network-engineer");
store.points.recordFinance({
  key: "browser-fixture-receipt",
  kind: "revenue",
  amountMicros: 1000000000,
  reference: "synthetic browser receipt only",
  createdBy: owner.id,
});
for (const user of [owner, learner])
  store.points.grant({
    userId: user.id,
    sourceKey: "browser-fixture-points",
    units: 1000000,
  });
const requests = [],
  checks = [],
  errors = [],
  dialogs = [],
  leaks = [];
const provider = new OpenAICompatibleProvider(store, {
  fetch: async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ url, body });
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                text: "合成验收解析：先核对题干条件，再比较各个选项，保留必要公式与判断依据。",
              }),
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  },
});
const app = await createApp({
    store,
    provider,
    production: true,
    accountSecurity: { enabled: false },
  }),
  server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser, admin;
const version = JSON.parse(
  fs.readFileSync("mobile/package.json", "utf8"),
).version;
async function pageFor(user) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 860 },
    reducedMotion: "reduce",
  });
  await context.route("**/*", (route) =>
    ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort(),
  );
  await context.addCookies([
    {
      name: "netwise_session",
      value: store.createAuthSession(user.id),
      url: base,
      httpOnly: true,
    },
  ]);
  await context.addInitScript(
    (v) => localStorage.setItem("netwise-announcement-v" + v, "seen"),
    version,
  );
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.accept();
  });
  page.on("response", async (response) => {
    if (response.url().includes("/api/admin/ai-services") && response.ok())
      try {
        const text = await response.text();
        if (/synthetic-browser-(secret|legacy-key)|keyCipher/.test(text))
          leaks.push(response.url());
      } catch {}
  });
  return page;
}
const card = (name) =>
  admin.getByRole("article", { name: name + " 接口", exact: true });
async function save(dialog) {
  await dialog
    .getByRole("button", { name: "保存模型连接", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
}
async function prices(dialog, input, output) {
  await dialog
    .getByLabel("确认或更新此地址与模型的成本价格", { exact: true })
    .check();
  await dialog.getByLabel("输入价格", { exact: true }).fill(input);
  await dialog.getByLabel("输出价格", { exact: true }).fill(output);
  await dialog.getByLabel("缓存输入价格", { exact: true }).fill("0.04");
  await dialog
    .getByLabel("价格依据或账单说明", { exact: true })
    .fill("synthetic browser fixture prices, not a real vendor quote");
  await dialog
    .getByLabel("我已核对该地址、模型、区域与适用最高档价格", { exact: true })
    .check();
  await dialog
    .getByLabel(
      "此连接仅按输入 / 输出 / 缓存输入计费，无额外工具、缓存写入或存储费用",
      { exact: true },
    )
    .check();
}
async function shot(page, name) {
  const file = path.join(out, name + ".png");
  await page.screenshot({ path: file, fullPage: false });
  assert.ok(fs.statSync(file).size <= 500000, "preview exceeds 500 KB");
}
try {
  browser = await launchTestBrowser();
  admin = await pageFor(owner);
  await admin.goto(base + "/#admin/config", { waitUntil: "networkidle" });
  await expect(
    admin.getByRole("heading", { name: "当前调用方式", exact: true }),
  ).toBeVisible();
  await expect(
    admin.getByText("原单接口 · 保留现有配置", { exact: true }),
  ).toBeVisible();
  await expect(admin.locator(".ac-ai-presets button")).toHaveCount(7);
  assert.equal(requests.length, 0);
  checks.push(
    "six domestic provider presets plus custom; existing DeepSeek remains active without a paid request",
  );

  await admin.getByRole("button", { name: "智谱 · GLM", exact: true }).click();
  let dialog = admin.getByRole("dialog");
  await expect(
    dialog.getByText("官方参考价（非自动生效）", { exact: true }),
  ).toBeVisible();
  await dialog.getByLabel("连接名称", { exact: true }).fill("验收 GLM");
  await dialog.getByLabel(/^模型名称/).fill("fixture-glm-browser");
  await dialog.getByLabel(/^API Key/).fill("synthetic-browser-secret-a");
  await dialog.getByLabel(/^优先级/).fill("2");
  await save(dialog);
  await expect(card("验收 GLM")).toContainText("待核价");
  await expect(
    card("验收 GLM").getByRole("button", { name: "启用", exact: true }),
  ).toBeDisabled();
  await expect(
    card("验收 GLM").getByRole("button", { name: "测试连接", exact: true }),
  ).toBeDisabled();
  assert.equal(requests.length, 0);
  checks.push(
    "official reference and confirmed prices are distinct; unpriced disabled drafts cannot be activated or tested",
  );

  await card("验收 GLM")
    .getByRole("button", { name: "编辑连接", exact: true })
    .click();
  dialog = admin.getByRole("dialog");
  await expect(dialog.getByLabel(/^新 API Key/)).toHaveValue("");
  await prices(dialog, "2", "8");
  await dialog.getByLabel(/^保存后启用此连接/).check();
  await save(dialog);
  await expect(card("验收 GLM")).toContainText("¥ 2");
  await expect(card("验收 GLM")).toContainText("¥ 8");
  await expect(card("验收 GLM")).toContainText("约 4 积分");
  assert.equal(
    decrypt(store.aiServices.channels()[0].keyCipher),
    "synthetic-browser-secret-a",
  );
  assert.equal(requests.length, 0);
  checks.push(
    "real form confirms three-dimensional costs, expiry and billing contract; empty key edits preserve encryption",
  );

  await admin
    .getByRole("button", { name: "阿里云百炼 · 通义千问", exact: true })
    .click();
  dialog = admin.getByRole("dialog");
  await dialog.getByLabel("连接名称", { exact: true }).fill("验收 Qwen");
  await dialog.getByLabel(/^模型名称/).fill("fixture-qwen-browser");
  await dialog.getByLabel(/^API Key/).fill("synthetic-browser-secret-b");
  await dialog.getByLabel(/^优先级/).fill("3");
  await prices(dialog, "4", "12");
  await dialog.getByLabel(/^保存后启用此连接/).check();
  await save(dialog);
  await admin
    .getByRole("button", { name: "启用优先级模式", exact: true })
    .click();
  await expect(card("验收 GLM")).toContainText("当前首选");
  await admin
    .getByRole("button", { name: "提高 验收 Qwen 优先级", exact: true })
    .click();
  await expect(card("验收 Qwen")).toContainText("当前首选");
  await admin.reload({ waitUntil: "networkidle" });
  await expect(card("验收 Qwen")).toContainText("当前首选");
  assert.equal(store.aiServices.channels()[0].name, "验收 Qwen");
  assert.equal(requests.length, 0);
  checks.push(
    "opt-in priority mode overrides legacy only after confirmation; up/down order persists after reload",
  );

  const learnerBefore = store.points.wallet(learner.id).availableUnits,
    adminBefore = store.points.wallet(owner.id).availableUnits;
  await card("验收 GLM")
    .getByRole("button", { name: "测试连接", exact: true })
    .click();
  await expect(card("验收 GLM")).toContainText("最近测试成功");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.model, "fixture-glm-browser");
  assert.equal(requests[0].body.max_tokens, 256);
  assert.ok(dialogs.some((text) => text.includes("真实付费请求")));
  assert.equal(store.points.wallet(learner.id).availableUnits, learnerBefore);
  assert.ok(store.points.wallet(owner.id).availableUnits < adminBefore);
  await expect(card("验收 Qwen")).toContainText("当前首选");
  checks.push(
    "explicit paid connection test targets the chosen non-preferred model and charges only administrator points",
  );

  const learnerPage = await pageFor(learner);
  await learnerPage.goto(base + "/#home", { waitUntil: "networkidle" });
  await learnerPage
    .getByRole("button", { name: "开始 10 题练习", exact: true })
    .click();
  await expect(learnerPage.locator(".question-text")).toBeVisible();
  await learnerPage.locator(".option").first().click();
  await learnerPage
    .getByRole("button", { name: "提交答案", exact: true })
    .click();
  await expect(learnerPage.locator(".result-block")).toBeVisible();
  await learnerPage.locator(".teacher-open").click();
  await learnerPage
    .getByRole("button", { name: "详细讲解", exact: true })
    .click();
  await expect(learnerPage.locator(".teacher-response")).toContainText(
    "合成验收解析",
  );
  assert.equal(requests.at(-1).body.model, "fixture-qwen-browser");
  assert.equal(requests.at(-1).body.enable_thinking, false);
  assert.ok(store.points.wallet(learner.id).availableUnits < learnerBefore);
  const usage = JSON.parse(
    store.db
      .prepare(
        "SELECT data FROM user_usage WHERE user_id=? ORDER BY rowid DESC LIMIT 1",
      )
      .get(learner.id).data,
  );
  assert.equal(usage.serviceName, "验收 Qwen");
  assert.equal(usage.estimatedCostCny, 0.000044);
  checks.push(
    "ordinary learner teacher flow uses preferred Qwen connection, compatibility flags and exact confirmed cost rather than DeepSeek rates",
  );

  const qwen = card("验收 Qwen");
  await qwen.getByRole("button", { name: "停用", exact: true }).click();
  await expect(card("验收 GLM")).toContainText("当前首选");
  await qwen.getByRole("button", { name: "启用", exact: true }).click();
  await expect(qwen).toContainText("当前首选");
  await admin
    .getByRole("button", { name: "复制原连接到列表", exact: true })
    .click();
  await expect(
    admin.getByRole("article", {
      name: "现有 deepseek-flash 接口",
      exact: true,
    }),
  ).toContainText("已停用");
  checks.push(
    "channel state changes take effect immediately; legacy copy is disabled and never mutates original source",
  );
  await shot(admin, "desktop-1280");

  await admin.setViewportSize({ width: 390, height: 844 });
  await expect(
    admin.getByRole("heading", { name: "当前调用方式", exact: true }),
  ).toBeVisible();
  assert.ok(
    await admin.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "narrow view overflows",
  );
  await card("验收 Qwen")
    .getByRole("button", { name: "编辑连接", exact: true })
    .click();
  dialog = admin.getByRole("dialog");
  await expect(dialog.getByLabel(/^新 API Key/)).toHaveValue("");
  assert.ok(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
    "narrow dialog overflows",
  );
  const sizes = await dialog
    .locator("button")
    .evaluateAll((elements) =>
      elements
        .filter((element) => element.getClientRects().length)
        .map((element) => element.getBoundingClientRect().height),
    );
  assert.ok(sizes.every((height) => height >= 43));
  await shot(admin, "mobile-editor-390");
  await admin.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  checks.push(
    "390px layout and dialog do not overflow; visible dialog actions retain 44px targets and Escape closes safely",
  );

  await admin.setViewportSize({ width: 1280, height: 860 });
  await admin
    .getByRole("button", { name: "切回原单接口", exact: true })
    .click();
  await expect(
    admin.getByText("原单接口 · 保留现有配置", { exact: true }),
  ).toBeVisible();
  assert.equal(store.aiServices.policy().managed, 0);
  assert.equal(process.env.AI_SERVICE_API_KEY, "synthetic-browser-legacy-key");
  assert.equal(store.points.audit().passed, true);
  assert.deepEqual(leaks, []);
  assert.deepEqual(errors, []);
  checks.push(
    "legacy mode rollback preserves channels, no secrets leak into API responses and no browser errors occur",
  );
  fs.writeFileSync(
    path.join(out, "result.json") + ".new",
    JSON.stringify(
      { passed: true, checks, requestCount: requests.length, errors, leaks },
      null,
      2,
    ),
  );
  fs.renameSync(
    path.join(out, "result.json") + ".new",
    path.join(out, "result.json"),
  );
  console.log("Browser acceptance passed: " + checks.length + " checks");
} catch (error) {
  if (admin) await shot(admin, "failure").catch(() => {});
  throw error;
} finally {
  if (browser) await browser.close();
  await app.locals.stop();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  store.db.close();
  assert.equal(path.dirname(fs.realpathSync(directory)), parent);
  assert.ok(path.basename(directory).startsWith("ai-channels-browser-"));
  fs.rmSync(directory, { recursive: true, force: true });
}
