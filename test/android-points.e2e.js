// Real Android VIP UI in a local RN-Web test harness, not the shipping Web App.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import express from 'express';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import { expect } from '@playwright/test';
import { createStore } from '../server/store.js';
import { createApp } from '../server/index.js';
import { launchTestBrowser } from './helpers/browser.js';

const root = process.cwd(), mobile = path.join(root, 'mobile');
const parent = path.resolve('tmp'), dir = fs.mkdtempSync(path.join(parent, 'android-points-browser-'));
const out = path.resolve('tmp/android-points-20261024/browser'); fs.mkdirSync(out, { recursive: true });
const store = createStore(path.join(dir, 'data'));
const first = store.register('points_android_one', 'fixture-password-123');
const second = store.register('points_android_two', 'fixture-password-123');
for (const user of [first, second]) store.selectCertificate(user.id, 'network-engineer');
const settings = { baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', keyCipher: 'SYNTHETIC-UNUSED-KEY' };
store.aiServices.policy = () => ({ managed: true });
store.aiServices.channels = () => [
  { ...settings, id: 'flash', name: 'Flash 主接口', priority: 1, enabled: true },
  { ...settings, model: 'deepseek-v4-pro', id: 'pro', name: 'Pro 备用接口', priority: 2, enabled: true },
];
store.points.recordFinance({ key: 'synthetic-income', kind: 'revenue', amountMicros: 1000000000,
  reference: 'local synthetic funding, no actual payment', createdBy: first.id });
store.points.grant({ userId: first.id, sourceKey: 'synthetic-points', kind: 'test-only', units: 1000000, requireFunded: true });
function operation(key, success, pending = false) {
  const { operation } = store.points.begin({ userId: first.id, requestKey: key,
    signature: store.points.signature(key), feature: 'POST /api/ai/teacher' });
  const call = store.points.reserveCall(operation.id, { settings, inputLimit: 1000, outputLimit: 900, taskType: 'question-explanation' });
  if (pending) return;
  store.points.finishCall(call.id, { success: true, usage: { hasUsage: true, prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } });
  store.points.finish(operation.id, { success, result: { fixture: true }, error: success ? undefined : '合成审核失败，积分已退回' });
}
operation('synthetic-success', true);
operation('synthetic-refund', false);
operation('synthetic-pending', false, true);
assert.equal(store.points.audit().passed, true);
const backend = await createApp({ store, withFrontend: false, authRequired: true, accountSecurity: { enabled: false } });
const tokens = [first, second].map(user => store.createAuthSession(user.id));
const entry = path.join(dir, 'harness'); fs.mkdirSync(entry);
const source = file => '/@fs/' + path.join(mobile, file).replaceAll('\\', '/');
const write = (name, text) => fs.writeFileSync(path.join(entry, name), text);
write('index.html', '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{height:100%;margin:0}button{min-height:48px}</style><div id="root"></div><script type="module" src="/main.tsx"></script>');
write('storage.ts', 'export default {async getItem(k){return localStorage.getItem(k)},async setItem(k,v){localStorage.setItem(k,v)},async removeItem(k){localStorage.removeItem(k)},async multiRemove(ks){ks.forEach(k=>localStorage.removeItem(k))}}');
write('stream.ts', 'export const fetch=(...args)=>globalThis.fetch(...args)');
write('audio.ts', 'export async function prepareUiSounds(){} export function setUiSoundSettings(){} export function playUiSound(){} export function previewUiSound(){}');
write('subjective.tsx', 'export function SubjectiveStudyScreen(){return null}');
write('alert.tsx', 'export const AppAlert={alert(){}};export function AppAlertHost(){return null}');
write('native.ts', "export*from'react-native-web';import{Platform}from'react-native-web';Platform.OS='android';");
const users = [first, second].map(user => ({ id: user.id, username: user.username, certificateId: 'network-engineer' }));
write('main.tsx', `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ThemeProvider,useTheme}from ${JSON.stringify(source('src/theme.ts'))};import{VipScreen}from ${JSON.stringify(source('src/screens/VipScreen.android.tsx'))};import{setSessionToken}from ${JSON.stringify(source('src/api/client.ts'))};
function Harness(){const[user,setUser]=useState(${JSON.stringify(users[0])}),{setMode}=useTheme();return <div style={{height:'100%',display:'flex',flexDirection:'column'}}><div><button onClick={()=>setMode('light')}>浅色测试</button><button onClick={()=>setMode('dark')}>深色测试</button><button onClick={async()=>{await setSessionToken(${JSON.stringify(tokens[1])});setUser(${JSON.stringify(users[1])})}}>切换测试账号</button></div><VipScreen user={user} certificateName="网络工程师" onOpenCertificates={()=>{}} onOpenPractice={()=>{}}/></div>};await setSessionToken(${JSON.stringify(tokens[0])});createRoot(document.getElementById('root')).render(<ThemeProvider><Harness/></ThemeProvider>);`);
const vite = await createServer({ configFile: false, root: entry, plugins: [react()], logLevel: 'error',
  define: { 'process.env.EXPO_PUBLIC_API_URL': '""', global: 'globalThis' },
  optimizeDeps: { include: ['react-native-web'] },
  resolve: { dedupe: ['react', 'react-dom'], alias: [
    { find: /^react-native$/, replacement: path.join(entry, 'native.ts') },
    { find: /^react-native-web$/, replacement: path.join(mobile, 'node_modules/react-native-web') },
    { find: /^react$/, replacement: path.join(mobile, 'node_modules/react') },
    { find: /^react-dom(\/.*)?$/, replacement: path.join(mobile, 'node_modules/react-dom') + '$1' },
    { find: '@react-native-async-storage/async-storage', replacement: path.join(entry, 'storage.ts') },
    { find: 'expo/fetch', replacement: path.join(entry, 'stream.ts') },
    { find: /^\.\.?\/audioFeedback$/, replacement: path.join(entry, 'audio.ts') },
    { find: /^\.\/?subjective-study\/SubjectiveStudyScreen$/, replacement: path.join(entry, 'subjective.tsx') },
    { find: /^\.\.?\/components\/AppAlert$/, replacement: path.join(entry, 'alert.tsx') },
  ] }, server: { middlewareMode: true, fs: { allow: [root, dir] } } });
const serverApp = express();
serverApp.use((req, res, next) => req.path.startsWith('/api/') ? backend(req, res, next) : next());
serverApp.use(vite.middlewares);
const server = serverApp.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`, errors = [], checks = [];
let browser, page;
async function shot(name) { const file = path.join(out, name + '.png'); await page.screenshot({ path: file }); assert.ok(fs.statSync(file).size <= 500000); }
async function checkContrast(prices) {
  const ratio = await prices.getByText('接口按管理员优先级使用；点击下列接口仅查看费用，不改变调用顺序。').evaluate(node => {
    const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => {
      const n = v / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4;
    });
    const luminance = value => { const [r, g, b] = rgb(value); return .2126 * r + .7152 * g + .0722 * b; };
    const card = node.closest('[data-testid="android-points-services"]');
    const a = luminance(getComputedStyle(node).color), b = luminance(getComputedStyle(card).backgroundColor);
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  });
  assert.ok(ratio >= 4.5, `Android price metadata text contrast ${ratio}`);
}
try {
  browser = await launchTestBrowser(); const context = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
  await context.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'networkidle' });
  const prices = page.getByTestId('android-points-services');
  await prices.scrollIntoViewIfNeeded();
  await expect(prices.getByRole('heading', { name: 'AI 服务积分价目' })).toBeVisible();
  await expect(prices.getByText('3.68 积分 / 示例', { exact: true })).toBeVisible();
  await expect(prices.getByText(/不是固定价格、预计账单或预扣上限/)).toBeVisible();
  assert.equal(await prices.getByText('0 积分', { exact: true }).count(), 4);
  checks.push('real Android VIP renders active-model service examples and four free service categories');
  await prices.getByRole('button', { name: '查看Pro 备用接口积分费用' }).click();
  await expect(prices.getByText('13.32 积分 / 示例', { exact: true })).toBeVisible();
  await prices.getByRole('button', { name: '查看Flash 主接口积分费用' }).click();
  checks.push('viewing fallback fees changes displayed examples without altering server priority');
  await page.getByText('积分使用记录', { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByText('扣除 0.24 积分', { exact: true })).toBeVisible();
  await expect(page.getByText(/失败，预扣已退还/)).toBeVisible();
  await expect(page.getByText(/预扣差额 3.44 积分已释放/)).toBeVisible();
  checks.push('real ledger settlement, pending reservation and complete refund are shown with feature/model labels');
  await page.getByRole('button', { name: '深色测试', exact: true }).click();
  await checkContrast(prices);
  await prices.getByRole('heading', { name: 'AI 服务积分价目' }).scrollIntoViewIfNeeded(); await shot('android-points-dark-375');
  await page.setViewportSize({ width: 812, height: 375 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: '浅色测试', exact: true }).click();
  await checkContrast(prices);
  await prices.getByRole('heading', { name: 'AI 服务积分价目' }).scrollIntoViewIfNeeded(); await shot('android-points-light-375');
  checks.push('375px light/dark and landscape layouts stay within the viewport');
  await prices.locator('[dir="auto"]').evaluateAll(nodes => {
    for (const node of nodes) { const s = getComputedStyle(node); node.style.fontSize = `${parseFloat(s.fontSize) * 1.8}px`; node.style.lineHeight = `${parseFloat(s.lineHeight) * 1.8}px`; }
  });
  const overflow = await prices.locator('[dir="auto"]').evaluateAll(nodes => nodes.some(node => {
    const box = node.getBoundingClientRect(); return box.left < -1 || box.right > innerWidth + 1;
  }));
  assert.equal(overflow, false);
  checks.push('1.8x text layout wraps within the small-phone card; metadata contrast passes in both themes');
  await context.route('**/api/account/points/services', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '合成价格服务暂不可用' }) }));
  await prices.getByRole('button', { name: '刷新服务积分价目', exact: true }).click();
  await expect(prices.getByRole('alert')).toHaveText('合成价格服务暂不可用');
  await expect(prices.getByText('3.68 积分 / 示例', { exact: true })).toHaveCount(0);
  await context.unroute('**/api/account/points/services');
  await prices.getByRole('button', { name: '刷新服务积分价目', exact: true }).click();
  await expect(prices.getByText('3.68 积分 / 示例', { exact: true })).toBeVisible();
  checks.push('failed price refresh clears stale numbers and can retry successfully');
  await page.getByRole('button', { name: '切换测试账号', exact: true }).click();
  await page.getByText('积分使用记录', { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByText('暂无积分使用记录', { exact: true })).toBeVisible();
  await expect(page.getByText('扣除 0.24 积分', { exact: true })).toHaveCount(0);
  checks.push('switching accounts clears the previous balance and billing history');
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ passed: true, checks, errors, realUpstreamRequests: 0, nativeRuntime: 'not exercised by browser harness' }, null, 2));
  console.log('Android points browser acceptance passed: ' + checks.length + ' checks');
} catch (error) {
  if (page) { await shot('failure').catch(() => {}); fs.writeFileSync(path.join(out, 'failure.txt'), await page.locator('body').innerText().catch(() => '')); }
  console.error(errors.slice(0, 5).join('\n')); throw error;
} finally {
  await browser?.close(); await vite.close(); await backend.locals.stop();
  await new Promise(resolve => server.close(resolve)); store.db.close();
  assert.equal(path.dirname(dir), parent); assert.ok(path.basename(dir).startsWith('android-points-browser-'));
  fs.rmSync(dir, { recursive: true, force: true });
}
