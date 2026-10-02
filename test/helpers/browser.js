import { chromium } from "@playwright/test";
export async function launchTestBrowser() {
  const channel = process.env.TEST_BROWSER_CHANNEL;
  const options = { headless: true, ...(channel ? { channel } : {}) };
  try {
    return await chromium.launch(options);
  } catch (error) {
    if (channel || process.platform !== "win32") throw error;
    try {
      return await chromium.launch({ headless: true, channel: "msedge" });
    } catch (fallback) {
      throw new AggregateError(
        [error, fallback],
        "无法启动测试浏览器；请安装 Playwright Chromium，或通过 TEST_BROWSER_CHANNEL 指定可用浏览器。",
      );
    }
  }
}
