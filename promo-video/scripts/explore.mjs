// 探索 aceexam.top 首页：截图 + 导出可见文本与链接，用于提炼真实 UI 文案
import { chromium } from 'playwright';
import fs from 'node:fs';

const out = 'assets/screenshots';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, locale: 'zh-CN' });
const page = await ctx.newPage();
await page.goto('https://aceexam.top/?desktop=1', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/desktop-home-hero.png` });
await page.screenshot({ path: `${out}/desktop-home-full.png`, fullPage: true });
const text = await page.evaluate(() => document.body.innerText);
const links = await page.evaluate(() => [...document.querySelectorAll('a,button')].map(a => `${a.tagName} | ${a.innerText.trim().replace(/\s+/g, ' ')} | ${a.getAttribute('href') || ''}`));
const sections = await page.evaluate(() => [...document.querySelectorAll('section,[id]')].map(s => `${s.tagName}#${s.id}.${s.className} top=${Math.round(s.getBoundingClientRect().top + scrollY)} h=${Math.round(s.getBoundingClientRect().height)}`));
fs.writeFileSync(`${out}/home-text.txt`, text + '\n\n=== LINKS ===\n' + links.join('\n') + '\n\n=== SECTIONS ===\n' + sections.join('\n'));
console.log('height', await page.evaluate(() => document.body.scrollHeight));
await browser.close();
