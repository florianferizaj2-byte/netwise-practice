// Renders the Android-only access gate in an isolated browser harness.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
import { expect } from "@playwright/test";
import { createStore } from "../server/store.js";
import { createApp } from "../server/index.js";
import { launchTestBrowser } from "./helpers/browser.js";

const root = process.cwd(),
  parent = path.resolve("tmp"),
  directory = fs.mkdtempSync(path.join(parent, "location-learning-browser-")),
  output = path.resolve("tmp/location-learning-gate-20261024/browser");
fs.mkdirSync(output, { recursive: true });
const mobile = path.join(root, "mobile"),
  store = createStore(path.join(directory, "data")),
  owner = store.register("location_browser_user", "fixture-password-123");
store.selectCertificate(owner.id, "network-engineer");
const template = store
  .allQ()
  .find((q) => q.certificates?.includes("network-engineer") && q.type === "single_choice");
assert.ok(template, "runtime certificate has a single-choice question");
const addAttempt = () =>
  store.recordAttempt(
    template.id,
    template.answer,
    0,
    "practice",
    owner.id,
    undefined,
    undefined,
    "network-engineer",
  );
for (let i = 0; i < 10; i++) addAttempt();

let clock = Date.now();
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
  "export default {async getItem(k){return localStorage.getItem(k)},async setItem(k,v){localStorage.setItem(k,v)},async removeItem(k){localStorage.removeItem(k)},async multiRemove(keys){keys.forEach(k=>localStorage.removeItem(k))}}",
);
fs.writeFileSync(
  path.join(entry, "native.ts"),
  "export*from'react-native-web';import{Platform}from'react-native-web';Platform.OS='android';",
);
fs.writeFileSync(path.join(entry, "native-route.ts"), "export async function updateRoutePlayerIdentity(){}");
fs.writeFileSync(
  path.join(entry, "safe-area-context.ts"),
  "import{View}from'react-native';export const initialWindowMetrics=null;export function SafeAreaProvider({children}){return children}export const SafeAreaView=View;",
);
fs.writeFileSync(path.join(entry, "stream.ts"), "export const fetch=(...args)=>globalThis.fetch(...args);");
fs.writeFileSync(
  path.join(entry, "audio.ts"),
  "export async function prepareUiSounds(){} export function setUiSoundSettings(){} export function playUiSound(){} export function previewUiSound(){}",
);
fs.writeFileSync(
  path.join(entry, "main.tsx"),
  `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ThemeProvider}from ${JSON.stringify(source("src/theme.ts"))};import{LocationLearningGate}from ${JSON.stringify(source("src/screens/LocationLearningGate.android.tsx"))};import{setSessionToken}from ${JSON.stringify(source("src/api/client.ts"))};import{locationLearningApi}from ${JSON.stringify(source("src/api/locationLearning.android.ts"))};
function Harness(){const[visible,setVisible]=useState(true),[entered,setEntered]=useState(false);return <ThemeProvider><button onClick={()=>setVisible(true)}>重新进入专项学习</button>{entered&&<p role="status">已通过服务端通行凭据验证</p>}<LocationLearningGate visible={visible} onClose={()=>setVisible(false)} onEnter={async()=>{const c=await locationLearningApi.locationLearningOpenCredentials();const r=await fetch(c.apiBaseUrl+'/location-learning/consume',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+c.sessionToken},body:JSON.stringify({permit:c.permit})});if(!r.ok)throw Error('fixture permit rejected');setEntered(true)}}/></ThemeProvider>};await setSessionToken(${JSON.stringify(token)});createRoot(document.getElementById('root')).render(<Harness/>);`,
);
const aliases = [
  {
    find: /^react-native$/,
    replacement: path.join(entry, "native.ts"),
  },
  {
    find: /^react-native-web$/,
    replacement: path.join(mobile, "node_modules/react-native-web"),
  },
  {
    find: /^react-native-svg$/,
    replacement: path.join(mobile, "node_modules/react-native-svg/lib/module/elements.web.js"),
  },
  {
    find: /^react-native-safe-area-context$/,
    replacement: path.join(entry, "safe-area-context.ts"),
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
    replacement: path.join(entry, "native-route.ts"),
  },
  { find: "expo/fetch", replacement: path.join(entry, "stream.ts") },
  { find: /^\.\.?\/audioFeedback$/, replacement: path.join(entry, "audio.ts") },
];
const vite = await createViteServer({
  configFile: false,
  root: entry,
  plugins: [react()],
  define: { "process.env.EXPO_PUBLIC_API_URL": '""', global: "globalThis", __DEV__: "false" },
  optimizeDeps: {
    include: ["react-native-web"],
    esbuildOptions: {
      alias: { "react-native": path.join(entry, "native.ts") },
      resolveExtensions: [".web.tsx", ".web.ts", ".tsx", ".ts", ".jsx", ".js", ".json"],
    },
  },
  resolve: { alias: aliases, dedupe: ["react", "react-dom"] },
  server: { middlewareMode: true, hmr: false, fs: { allow: [root, directory] } },
  logLevel: "error",
});
const app = express();
app.use((req, res, next) =>
  req.path.startsWith("/api/") ? backend(req, res, next) : next(),
);
app.use(vite.middlewares);
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`,
  checks = [],
  errors = [];
let browser, page;
async function shot(name) {
  const file = path.join(output, name + ".png");
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
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base, { waitUntil: "networkidle" });
  await expect(page.getByTestId("location-learning-today-count")).toHaveText("10题");
  await expect(page.getByText("今日条件未满足", { exact: true })).toBeVisible();
  await expect(page.getByText("今日答题数需大于 10 题；还需完成 1 题。", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "进入模拟定位学习", exact: true })).toHaveCount(0);
  await shot("locked-at-10-390");
  checks.push("exactly ten same-day answers remain locked and the APK gate reports one remaining question");

  await page.getByRole("button", { name: "退出专项学习", exact: true }).click();
  addAttempt();
  await page.getByRole("button", { name: "重新进入专项学习", exact: true }).click();
  await expect(page.getByTestId("location-learning-today-count")).toHaveText("11题");
  await expect(page.getByText("今日条件已满足", { exact: true })).toBeVisible();
  await shot("unlocked-at-11-390");
  await expect(page.getByRole("button", { name: "进入模拟定位学习", exact: true })).toBeVisible();
  checks.push("the eleventh same-day answer unlocks the entry without a dedicated quiz");

  await page.getByRole("button", { name: "重新进入专项学习", exact: true }).click();
  await expect(page.getByTestId("location-learning-today-count")).toHaveText("11题");
  await expect(page.getByRole("button", { name: "进入模拟定位学习", exact: true })).toBeVisible();
  checks.push("same-day re-entry uses the current server count without repeating a dedicated quiz");

  await page.getByRole("button", { name: "退出专项学习", exact: true }).click();
  clock += 86400000;
  await page.getByRole("button", { name: "重新进入专项学习", exact: true }).click();
  await expect(page.getByTestId("location-learning-today-count")).toHaveText("0题");
  await expect(page.getByRole("button", { name: "进入模拟定位学习", exact: true })).toHaveCount(0);
  checks.push("the count resets at the next server day");
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    path.join(output, "result.json.new"),
    JSON.stringify({ passed: true, checks, errors, viewports: ["390x844"], nativeRuntime: "not exercised" }, null, 2),
  );
  fs.renameSync(path.join(output, "result.json.new"), path.join(output, "result.json"));
  console.log("Browser acceptance passed: " + checks.length + " Android gate checks");
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
