import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { build, preview } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const fixture = path.join(root, "test/fixtures/app-launch");
const mock = path.join(fixture, "platform-mocks.tsx");
await fs.mkdir(path.join(root, 'tmp'), { recursive: true });
const cacheDir = await fs.mkdtemp(path.join(root, 'tmp/app-launch-vite-'));
const outDir = path.join(cacheDir, 'dist');
// Compile the native launch fixture once. A static preview avoids Windows
// dependency-optimizer write races and still runs the unchanged native source.
await build({
  configFile: false,
  root: fixture,
  cacheDir,
  esbuild: { jsx: "automatic" },
  define: { global: 'globalThis', __DEV__: 'false' },
  build: { outDir, emptyOutDir: false, target: 'esnext', minify: false },
  resolve: {
    dedupe: ["react", "react-dom"],
    extensions: [
      ".web.tsx",
      ".web.ts",
      ".tsx",
      ".ts",
      ".web.js",
      ".js",
      ".json",
    ],
    alias: [
      { find: /^react$/, replacement: path.join(root, 'mobile/node_modules/react') },
      { find: /^react-dom(\/.*)?$/, replacement: path.join(root, 'mobile/node_modules/react-dom') + '$1' },
      {
        find: /^react-native$/,
        replacement: path.join(
          root,
          "mobile/node_modules/react-native-web/dist/index.js",
        ),
      },
      ...[
        "react-native-svg",
        "expo-status-bar",
        "expo-splash-screen",
        "../theme",
        "../announcements/current",
        "./AnnouncementDialog",
      ].map((find) => ({ find, replacement: mock })),
    ],
  },
});
const server = await preview({ configFile: false, root: fixture, build: { outDir },
  preview: { host: '127.0.0.1', port: 0 } });
const baseUrl = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ headless: true });
const results = [],
  errors = [];
async function scenario(name, query, check) {
  const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
  page.on("pageerror", (error) =>
    errors.push({ name, message: error.message }),
  );
  await page.goto(`${baseUrl}/?${query}`);
  const start = Date.now();
  await page.getByTestId("launch-splash").waitFor();
  await check(page);
  results.push({ name, elapsedMs: Date.now() - start });
  await page.close();
}

try {
  await scenario(
    "home loads under splash; announcement follows opening",
    "notice=1200",
    async (page) => {
      await page.getByTestId("fixture-home").waitFor();
      assert.equal(await page.getByTestId("launch-splash").count(), 1);
      assert.equal(await page.getByTestId("launch-announcement").count(), 0);
      assert.equal(
        await page
          .getByTestId("launch-content")
          .evaluate((el) => getComputedStyle(el).pointerEvents),
        "none",
      );
      await page
        .getByTestId("launch-splash")
        .waitFor({ state: "detached", timeout: 4500 });
      await page.getByTestId("launch-announcement").waitFor();
      await page.getByRole("button", { name: "关闭公告" }).click();
      assert.equal(
        await page.getByTestId("fixture-home").getAttribute("data-ready"),
        "true",
      );
      assert.equal(
        await page
          .getByTestId("launch-content")
          .evaluate((el) => getComputedStyle(el).pointerEvents),
        "auto",
      );
    },
  );
  await scenario(
    "slow home stays covered until ready",
    "home=3200",
    async (page) => {
      await page.waitForTimeout(2300);
      assert.equal(await page.getByTestId("launch-splash").count(), 1);
      await page
        .getByTestId("launch-splash")
        .waitFor({ state: "detached", timeout: 3500 });
      assert.equal(
        await page.getByTestId("fixture-home").getAttribute("data-ready"),
        "true",
      );
    },
  );
  await scenario(
    "unresponsive home cannot trap launch",
    "home=hang",
    async (page) => {
      await page
        .getByTestId("launch-splash")
        .waitFor({ state: "detached", timeout: 7500 });
      assert.equal(
        await page.getByTestId("fixture-home").getAttribute("data-ready"),
        "false",
      );
    },
  );
  await scenario(
    "unresponsive notice hydration uses cached notice",
    "notice=hang",
    async (page) => {
      await page
        .getByTestId("launch-splash")
        .waitFor({ state: "detached", timeout: 4500 });
      await page.getByTestId("launch-announcement").waitFor();
    },
  );
  await scenario(
    "replacing home releases its readiness gate",
    "home=hang&replace=1",
    async (page) => {
      await page.getByTestId("fixture-auth").waitFor();
      await page
        .getByTestId("launch-splash")
        .waitFor({ state: "detached", timeout: 3500 });
    },
  );
  await scenario(
    "reduced motion skips long intro and expansion",
    "reduced=1",
    async (page) => {
      await page
        .getByTestId("launch-splash")
        .waitFor({ state: "detached", timeout: 1400 });
      await page.getByTestId("launch-announcement").waitFor();
    },
  );
  assert.deepEqual(errors, []);
  const output = path.join(root, "test-output/app-launch");
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(
    path.join(output, "verification.json"),
    JSON.stringify({ results, errors }, null, 2),
  );
  console.log(JSON.stringify({ results, errors }));
} finally {
  await browser.close();
  server.httpServer.closeAllConnections();
  await new Promise(resolve => server.httpServer.close(resolve));
}
