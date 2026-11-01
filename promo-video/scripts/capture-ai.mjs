// 补拍：AI 详细解析抽屉、AI 分析错题、第 2 题界面（免登录体验，正常使用）
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = 'public/shots';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2, locale: 'zh-CN' });
const page = await ctx.newPage();
await page.goto('https://aceexam.top/?desktop=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const trial = page.locator('#desk-guest-trial');
// 刷新后保留体验进度：若已作答则直接点 AI 按钮
if (await trial.getByText('网络层', { exact: true }).isEnabled().catch(() => false)) {
  await trial.getByText('网络层', { exact: true }).click().catch(() => {});
  await trial.getByRole('button', { name: /确认答案/ }).click().catch(() => {});
  await page.waitForTimeout(1500);
}
await trial.scrollIntoViewIfNeeded();
await trial.screenshot({ path: `${OUT}/d-trial-q1-result.png` });

await trial.getByRole('button', { name: /AI 详细解析/ }).click();
await page.waitForTimeout(12000);
const drawer = page.locator('.desk-trial-reader');
console.log('drawer count', await drawer.count(), await drawer.evaluate(e => e.className).catch(() => ''));
await page.screenshot({ path: `${OUT}/d-ai-explain-page.png` });
await drawer.screenshot({ path: `${OUT}/d-ai-explain.png` }).catch(e => console.log('drawer shot fail', e.message));
await page.keyboard.press('Escape');
await page.waitForTimeout(800);

await trial.getByRole('button', { name: /AI 分析错题/ }).click();
await page.waitForTimeout(15000);
await page.screenshot({ path: `${OUT}/d-ai-analyze-page.png` });
await drawer.screenshot({ path: `${OUT}/d-ai-analyze.png` }).catch(e => console.log('drawer2 fail', e.message));
fs.writeFileSync(`${OUT}/ai-analyze.txt`, await drawer.innerText().catch(() => ''));
await page.keyboard.press('Escape');
await page.waitForTimeout(800);

await trial.getByRole('button', { name: /继续下一题/ }).click();
await page.waitForTimeout(1200);
await trial.screenshot({ path: `${OUT}/d-trial-q2.png` });
fs.writeFileSync(`${OUT}/trial-q2.txt`, await trial.innerText());
await browser.close();

