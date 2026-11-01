// 采集 aceexam.top 公开页面的高清截图、元素截图与交互录屏（仅访问免登录页面）
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = 'public/shots';
const REC = 'assets/recordings';
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(REC, { recursive: true });
const log = [];
const shot = async (target, name, opts = {}) => {
  try {
    await target.screenshot({ path: `${OUT}/${name}.png`, ...opts });
    log.push(`ok ${name}`);
  } catch (e) {
    log.push(`FAIL ${name}: ${e.message.split('\n')[0]}`);
  }
};

const browser = await chromium.launch();

// ---------- 电脑端 ----------
{
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2, locale: 'zh-CN',
    recordVideo: { dir: REC, size: { width: 1600, height: 1000 } },
  });
  const page = await ctx.newPage();
  await page.goto('https://aceexam.top/?desktop=1', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  await shot(page, 'd-hero');
  await shot(page, 'd-full', { fullPage: true });
  await shot(page.locator('#desk-guest-trial'), 'd-trial-q1');
  await shot(page.locator('#desk-method'), 'd-method');
  await shot(page.locator('#desk-features'), 'd-features');
  await shot(page.locator('#desk-certificates'), 'd-certificates');
  await shot(page.locator('#desk-devices'), 'd-devices');
  await shot(page.locator('.desk-bottom-cta'), 'd-bottom-cta');
  await shot(page.locator('header').first(), 'd-header');

  // 免登录试做：选错一题，查看结果（基础解析为静态内容）
  const trial = page.locator('#desk-guest-trial');
  await trial.getByText('网络层', { exact: true }).click();
  await page.waitForTimeout(600);
  await shot(trial, 'd-trial-q1-selected');
  await trial.getByRole('button', { name: /确认答案/ }).click();
  await page.waitForTimeout(2500);
  await shot(trial, 'd-trial-q1-result');
  fs.writeFileSync(`${OUT}/trial-result.txt`, await trial.innerText());
  // 页面内的 AI 解析按钮：免费体验功能，每日限额内正常使用一次
  const aiBtn = trial.getByRole('button', { name: /AI/ }).first();
  if (await aiBtn.count()) {
    await aiBtn.click();
    await page.waitForTimeout(15000);
    await shot(trial, 'd-trial-q1-ai');
    fs.writeFileSync(`${OUT}/trial-ai.txt`, await trial.innerText());
  }
  await page.waitForTimeout(1000);

  // 多端下载页
  await page.goto('https://aceexam.top/?desktop=1#downloads', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await shot(page, 'd-downloads');
  fs.writeFileSync(`${OUT}/downloads.txt`, await page.locator('body').innerText());
  await ctx.close();
}

// ---------- 指南页 ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2, locale: 'zh-CN' });
  const page = await ctx.newPage();
  await page.goto('https://aceexam.top/guide/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot(page, 'g-hero');
  fs.writeFileSync(`${OUT}/guide.txt`, await page.locator('body').innerText());
  await ctx.close();
}

// ---------- 移动端（iPhone 网页 /app/）----------
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'zh-CN',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  await page.goto('https://aceexam.top/app/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);
  await shot(page, 'm-entry');
  fs.writeFileSync(`${OUT}/mobile.txt`, await page.locator('body').innerText());
  await ctx.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'zh-CN' });
  const page = await ctx.newPage();
  await page.goto('https://aceexam.top/?desktop=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await shot(page, 'm-home');
  await ctx.close();
}

await browser.close();
console.log(log.join('\n'));
