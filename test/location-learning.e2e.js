// Renders the Android-only RN gate in an isolated browser test harness. No
// shipping Web App imports this gate. Native access
// enforcement is independently verified by the Android tests, not this harness.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { expect } from "@playwright/test";
import { createStore } from "../server/store.js";
import { createApp } from "../server/index.js";
import { launchTestBrowser } from "./helpers/browser.js";

const parent = path.resolve("tmp"),
  directory = fs.mkdtempSync(path.join(parent, "location-learning-browser-")),
  out = path.resolve("tmp/location-learning-gate-20261024/browser");
fs.mkdirSync(out, { recursive: true });
const root = process.cwd(),
  mobile = path.join(root, "mobile"),
  store = createStore(path.join(directory, "data")),
  owner = store.register("location_browser_user", "fixture-password-123");
store.selectCertificate(owner.id, "network-engineer");
const template = store
  .allQ()
  .find(
    (q) =>
      q.certificates?.includes("network-engineer") &&
      q.type === "single_choice",
  );
for (const [leaf, count] of [
  ["专项学习验收知识点", 35],
  ["不足三十验收知识点", 29],
])
  for (let i = 0; i < count; i++)
    store.addQ({
      ...template,
      id: `gate-browser-${count}-${i}`,
      certificates: ["network-engineer"],
      certificateScopes: undefined,
      chapter: "专项学习验收章节",
      knowledgeSection: "专项学习验收分类",
      knowledgePoint: leaf,
      sharedGroupId: undefined,
      sharedStem: undefined,
      question:
        `${leaf}合成验收题 ${i + 1}：请选择本题正确选项。` +
        "先阅读题干中给出的条件与选项，再判断作答。".repeat(6),
      options: {
        A: "正确选项",
        B: "用于核对错题阅读流程",
        C: "其他选项",
        D: "其他选项",
      },
      answer: ["A"],
      analysis:
        "这是一段合成测试解析，用于验证答错后需要阅读、允许答错并继续学习，不代表真实考试知识。",
    });
let clock = Date.parse("2026-10-24T01:00:00Z"),
  pulseCount = 0;
const backend = await createApp({
  store,
  withFrontend: false,
  accountSecurity: { enabled: false },
  locationLearningNow: () => clock,
});
const token = store.createAuthSession(owner.id),
  entry = path.join(directory, "harness");
fs.mkdirSync(entry);
const source = (file) =>
  "/@fs/" + path.join(mobile, file).replaceAll("\\", "/");
fs.writeFileSync(
  path.join(entry, "index.html"),
  '<!doctype html><html><meta name="viewport" content="width=device-width, initial-scale=1"><body style="margin:0"><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>',
);
fs.writeFileSync(
  path.join(entry, "storage.ts"),
  `export default {async getItem(k){return localStorage.getItem(k)},async setItem(k,v){localStorage.setItem(k,v)},async removeItem(k){localStorage.removeItem(k)},async multiRemove(keys){keys.forEach(k=>localStorage.removeItem(k))}}`,
);
fs.writeFileSync(
  path.join(entry, "native.ts"),
  `export async function updateRoutePlayerIdentity() {}`,
);
fs.writeFileSync(
  path.join(entry, "stream.ts"),
  `export const fetch=(...args)=>globalThis.fetch(...args);`,
);
fs.writeFileSync(
  path.join(entry, "audio.ts"),
  `export async function prepareUiSounds(){} export function setUiSoundSettings(){} export function playUiSound(){} export function previewUiSound(){}`,
);
fs.writeFileSync(
  path.join(entry, "alert.ts"),
  `export const AppAlert={alert(title,message,buttons){if(window.confirm(message))buttons?.at(-1)?.onPress?.()}};export function AppAlertHost(){return null}`,
);
fs.writeFileSync(
  path.join(entry, "main.tsx"),
  `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider}from ${JSON.stringify(source("src/theme.ts"))};import{LocationLearningGate}from ${JSON.stringify(source("src/screens/LocationLearningGate.android.tsx"))};import{setSessionToken}from ${JSON.stringify(source("src/api/client.ts"))};import{locationLearningApi as mobileApi}from ${JSON.stringify(source("src/api/locationLearning.android.ts"))};
function Harness(){const[visible,setVisible]=useState(true),[entered,setEntered]=useState(false);return <ThemeProvider><button onClick={()=>setVisible(true)}>重新进入专项学习</button>{entered&&<p role="status">已通过服务端通行凭据验证</p>}<LocationLearningGate visible={visible} onClose={()=>setVisible(false)} onEnter={async()=>{const c=await mobileApi.locationLearningOpenCredentials();const response=await fetch(c.apiBaseUrl+'/location-learning/consume',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+c.sessionToken},body:JSON.stringify({permit:c.permit})});if(!response.ok)throw Error('fixture permit rejected');setEntered(true)}}/></ThemeProvider>};await setSessionToken(${JSON.stringify(token)});createRoot(document.getElementById('root')).render(<Harness/>);`,
);
const alias = [
  {
    find: /^react-native$/,
    replacement: path.join(mobile, "node_modules/react-native-web"),
  },
  { find: /^react$/, replacement: path.join(mobile, "node_modules/react") },
  {
    find: /^react-dom(\/.*)?$/,
    replacement: path.join(mobile, "node_modules/react-dom") + "$1",
  },
  {
    find: "@react-native-async-storage/async-storage",
    replacement: path.join(entry, "storage.ts"),
  },
  {
    find: "../../modules/route-player/index.android",
    replacement: path.join(entry, "native.ts"),
  },
  { find: "expo/fetch", replacement: path.join(entry, "stream.ts") },
  { find: /^\.\.?\/audioFeedback$/, replacement: path.join(entry, "audio.ts") },
  {
    find: /^\.\.?\/components\/AppAlert$/,
    replacement: path.join(entry, "alert.ts"),
  },
];
const vite = await createServer({
  configFile: false,
  root: entry,
  plugins: [react()],
  define: { "process.env.EXPO_PUBLIC_API_URL": '""' },
  resolve: { alias, dedupe: ["react", "react-dom"] },
  server: { middlewareMode: true, hmr: false, fs: { allow: [root, directory] } },
  logLevel: "error",
});
const app = express();
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    if (req.path.endsWith("/pulse")) {
      clock += 1000;
      pulseCount++;
    }
    return backend(req, res, next);
  }
  next();
});
app.use(vite.middlewares);
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const checks = [],
  errors = [];
let browser, page;
async function nextPulse() {
  const response = page.waitForResponse(
    (response) =>
      response.url().endsWith("/pulse") &&
      response.request().method() === "POST",
  );
  await page.clock.runFor(1000);
  await response;
  await page.waitForTimeout(5);
}
async function dwell(count) {
  for (let i = 0; i < count; i++) await nextPulse();
}
async function present(action) {
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/present") && r.request().method() === "POST",
  );
  await action();
  await response;
}
async function shot(name) {
  const file = path.join(out, name + ".png");
  await page.screenshot({ path: file, fullPage: false });
  assert.ok(fs.statSync(file).size <= 500000);
}
try {
  browser = await launchTestBrowser();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await context.route("**/*", (route) =>
    ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort(),
  );
  await context.addInitScript(() => {
    window.__fixtureHidden = false;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => window.__fixtureHidden,
    });
  });
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(base, { waitUntil: "networkidle" });
  await expect(
    page.getByText("选择一个知识点，抽取 30 道", { exact: true }),
  ).toBeVisible();
  await page.clock.install();
  const search = page.getByRole("textbox", {
    name: "搜索专项学习知识点",
    exact: true,
  });
  await search.fill("不足三十验收知识点");
  await expect(
    page.getByRole("button", {
      name: "选择不足三十验收知识点，29道题，不足30道",
      exact: true,
    }),
  ).toBeDisabled();
  await search.fill("专项学习验收知识点");
  await present(() =>
    page
      .getByRole("button", {
        name: "选择专项学习验收知识点，35道题",
        exact: true,
      })
      .click(),
  );
  await expect(
    page.getByRole("button", { name: "提交本题", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("radio", { name: "B 用于核对错题阅读流程", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "提交本题", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText(/请先阅读题目，还需前台有效停留 1 秒/)).toBeVisible();
  await shot("question-390");
  checks.push(
    "real Android gate lists the current certificate, disables insufficient leaves and rejects selected answers before 1 second",
  );
  const before = pulseCount,
    pause = page.waitForResponse((r) => r.url().endsWith("/pause"));
  await page.evaluate(() => {
    window.__fixtureHidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await pause;
  clock += 60000;
  await page.clock.runFor(60000);
  assert.equal(pulseCount, before);
  await present(() =>
    page.evaluate(() => {
      window.__fixtureHidden = false;
      document.dispatchEvent(new Event("visibilitychange"));
    }),
  );
  await expect(page.getByText(/请先阅读题目，还需前台有效停留 1 秒/)).toBeVisible();
  await dwell(1);
  await expect(
    page.getByRole("button", { name: "提交本题", exact: true }),
  ).toBeEnabled();
  checks.push(
    "background visibility stops pulses and a minute in the background does not credit reading time",
  );
  await present(() =>
    page.getByRole("button", { name: "提交本题", exact: true }).click(),
  );
  await expect(
    page.getByText("本题答错了，阅读解析也算完成", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "确认阅读，下一题", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("请对照答案阅读解析，还需前台有效停留 3 秒", { exact: true }),
  ).toBeVisible();
  await shot("wrong-review-390");
  const offscreenPause = page.waitForResponse((r) =>
    r.url().endsWith("/pause"),
  );
  await page.getByTestId("location-learning-scroll").evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.clock.runFor(500);
  await offscreenPause;
  const offscreenCount = pulseCount;
  clock += 30000;
  await page.clock.runFor(30000);
  assert.equal(pulseCount, offscreenCount);
  await present(async () => {
    await page
      .getByText(
        "这是一段合成测试解析，用于验证答错后需要阅读、允许答错并继续学习，不代表真实考试知识。",
        { exact: true },
      )
      .scrollIntoViewIfNeeded();
    await page.clock.runFor(500);
  });
  checks.push(
    "an offscreen explanation does not accrue reading time; only visible reading resumes the review timer",
  );
  await dwell(1);
  await expect(
    page.getByRole("button", { name: "确认阅读，下一题", exact: true }),
  ).toBeDisabled();
  await dwell(2);
  await expect(
    page.getByRole("button", { name: "确认阅读，下一题", exact: true }),
  ).toBeEnabled();
  await present(() =>
    page.getByRole("button", { name: "确认阅读，下一题", exact: true }).click(),
  );
  checks.push(
    "a wrong answer is accepted and advances after 3 seconds of active explanation reading, without a correct retry",
  );
  for (let i = 1; i < 30; i++) {
    await dwell(1);
    await page.getByRole("radio", { name: "A 正确选项", exact: true }).click();
    await present(() =>
      page.getByRole("button", { name: "提交本题", exact: true }).click(),
    );
    if (i === 29) {
      await page
        .getByRole("button", { name: "确认阅读，完成 30 题", exact: true })
        .click();
    } else
      await present(() =>
        page
          .getByRole("button", { name: "确认阅读，下一题", exact: true })
          .click(),
      );
  }
  await expect(
    page.getByText("已解锁模拟定位学习", { exact: true }),
  ).toBeVisible();
  assert.equal(store.allA(owner.id).length, 30);
  assert.equal(store.allA(owner.id).filter((a) => !a.correct).length, 1);
  await shot("unlocked-390");
  await page
    .getByRole("button", { name: "进入模拟定位学习", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "已通过服务端通行凭据验证",
  );
  await page
    .getByRole("button", { name: "重新进入专项学习", exact: true })
    .click();
  await expect(
    page.getByText("已解锁模拟定位学习", { exact: true }),
  ).toBeVisible();
  assert.equal(store.allA(owner.id).length, 30);
  checks.push(
    "30 distinct submitted and reviewed questions unlock; repeated entry the same day mints a fresh server-verified permit without new questions",
  );
  await page.getByRole("button", { name: "退出专项学习", exact: true }).click();
  clock += 86400000;
  await page
    .getByRole("button", { name: "重新进入专项学习", exact: true })
    .click();
  await expect(
    page.getByText("选择一个知识点，抽取 30 道", { exact: true }),
  ).toBeVisible();
  checks.push(
    "the next server day requires a new set; no private answers persist as a local unlock flag",
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    path.join(out, "result.json.new"),
    JSON.stringify(
      {
        passed: true,
        checks,
        errors,
        viewports: ["390x844"],
        nativeRuntime: "separate Android tests, not exercised here",
      },
      null,
      2,
    ),
  );
  fs.renameSync(
    path.join(out, "result.json.new"),
    path.join(out, "result.json"),
  );
  console.log(
    "Browser acceptance passed: " + checks.length + " Android-screen harness checks",
  );
} catch (error) {
  if (page) await shot("failure").catch(() => {});
  throw error;
} finally {
  if (browser) await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await vite.close();
  await backend.locals.stop();
  store.db.close();
  assert.equal(path.dirname(fs.realpathSync(directory)), parent);
  assert.ok(path.basename(directory).startsWith("location-learning-browser-"));
  fs.rmSync(directory, { recursive: true, force: true });
}
