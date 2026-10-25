// Android screen implementations rendered locally through RN Web for layout and
// interaction checks. Native system adapters are explicit fixtures, not proof of
// camera, APK installer, system bars or native route-player/device acceptance.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import { expect } from '@playwright/test';
import { createApp } from '../server/index.js';
import { createStore } from '../server/store.js';
import { completeFixtureProfile } from './helpers/mobile-profile.js';
import { launchTestBrowser } from './helpers/browser.js';

const root = process.cwd(), mobile = path.join(root, 'mobile');
const sourceHashes = () => {
  const files = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  return Object.fromEntries(files(path.join(mobile, 'src')).map(p => [path.relative(mobile, p), crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
};
const testedSources = sourceHashes();
const directory = fs.mkdtempSync(path.join(root, 'tmp/android-ui-browser-'));
process.env.ADMIN_USERNAME = 'android_ui_learner';
const out = path.resolve(process.env.ANDROID_UI_CASE_DIR||'tmp/android-ui-refactor-20261024','browser');
fs.mkdirSync(out, { recursive: true });
const store = createStore(path.join(directory, 'data'));
const user = store.register('android_ui_learner', 'fixture-password-123');
completeFixtureProfile(store, user);
store.selectCertificate(user.id, 'network-engineer');
const token = store.createAuthSession(user.id);
const other = store.register('android_ui_other', 'fixture-password-123');
completeFixtureProfile(store, other); store.selectCertificate(other.id, 'network-engineer');
const chapter = '安卓界面验收网络基础', leaf = '安卓验收子网划分';
for (let i = 0; i < 30; i++) store.addQ({
  id: 'android-ui-question-' + i, type: 'single_choice',
  question: `验收题 ${i + 1}：某 IPv4 子网采用 /26 掩码，通常可分配给主机的地址有多少个？`,
  chapter, knowledgeSection: '网络基础', knowledgePoint: leaf,
  options: { A: '62 个', B: '64 个', C: '126 个', D: '256 个' }, answer: ['A'],
  analysis: '主机位为 32−26=6 位，通常可分配地址数为 2⁶−2=62 个。',
  certificates: ['network-engineer'], difficulty: '基础',
});
for (let i = 0; i < 12; i++) store.recordAttempt('android-ui-question-' + i, [i < 2 ? 'B' : 'A'], 12000, 'practice', user.id);
store.recordAttempt('android-ui-question-0', ['B'], 13000, 'practice', user.id);
store.points.recordFinance({ key: 'synthetic-ui-income', kind: 'revenue', amountMicros: 1000000000, reference: 'isolated UI fixture, no real payment', createdBy: user.id });
store.points.grant({ userId: user.id, sourceKey: 'synthetic-ui-grant', units: 1000000, kind: 'test', requireFunded: true });
store.aiServices.policy = () => ({ managed: true });
store.aiServices.channels = () => [{ id: 'ui-flash', name: '界面验收接口', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', keyCipher: 'SYNTHETIC-UNUSED-KEY', priority: 1, enabled: true }];
const backend = await createApp({ store, withFrontend: false, authRequired: true, accountSecurity: { enabled: false }, announcementFile: path.join(directory, 'no-announcement.json') });
const entry = path.join(directory, 'harness'); fs.mkdirSync(entry);
const write = (name, text) => fs.writeFileSync(path.join(entry, name), text);
const source = file => '/@fs/' + path.join(mobile, file).replaceAll('\\', '/');
write('index.html', `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>
html,body,#root{height:100%;margin:0}#root{display:flex;flex-direction:column;overflow:hidden}*{box-sizing:border-box}
@font-face{font-family:KaojiangSans;src:url('${source('assets/fonts/NotoSansSC_400Regular.ttf')}');font-weight:400}
@font-face{font-family:KaojiangSans;src:url('${source('assets/fonts/NotoSansSC_500Medium.ttf')}');font-weight:500}
@font-face{font-family:KaojiangSans;src:url('${source('assets/fonts/NotoSansSC_700Bold.ttf')}');font-weight:700}
</style><div id="root"></div><script type="module" src="/main.tsx"></script>`);
write('storage.ts', 'export default {async getItem(k){return localStorage.getItem(k)},async setItem(k,v){localStorage.setItem(k,v)},async removeItem(k){localStorage.removeItem(k)},async multiRemove(ks){ks.forEach(k=>localStorage.removeItem(k))}}');
write('stream.ts', 'export const fetch=(...args)=>globalThis.fetch(...args)');
write('audio.ts', 'export async function prepareUiSounds(){} export function setUiSoundSettings(){} export function playUiSound(){} export function previewUiSound(){}');
write('status.tsx', 'export function StatusBar(){return null}');
write('native.ts', "export*from'react-native-web';import{Platform}from'react-native-web';Platform.OS='android';export const ToastAndroid={LONG:1,SHORT:0,show(){}};export const PermissionsAndroid={PERMISSIONS:{},RESULTS:{GRANTED:'granted'},async check(){return true},async request(){return 'granted'}};");
write('picker.ts', 'export async function launchImageLibraryAsync(){return {canceled:true,assets:[]}};export async function requestMediaLibraryPermissionsAsync(){return {granted:true}};');
write('file-system.ts', 'export const cacheDirectory=null,documentDirectory=null;export async function getInfoAsync(){return {exists:false}};export async function deleteAsync(){};');
write('intent.ts', 'export async function startActivityAsync(){};');
write('native-route.ts', 'export function routePlayerAvailable(){return true} export async function updateRoutePlayerIdentity(){} export async function openRoutePlayer(){throw Error("Native entry is not part of browser acceptance")};');
write('main.tsx', `import React from 'react';import {createRoot} from 'react-dom/client';
import {ThemeProvider} from ${JSON.stringify(source('src/theme.android.ts'))};
import {AppShell} from ${JSON.stringify(source('src/navigation/AppShell.android.tsx'))};
import {setSessionToken} from ${JSON.stringify(source('src/api/client.ts'))};
import {AppAlertHost} from ${JSON.stringify(source('src/components/AppAlert.tsx'))};
if(!localStorage.getItem('ui-initialized')){await setSessionToken(${JSON.stringify(token)});localStorage.setItem('ui-initialized','1')}
createRoot(document.getElementById('root')).render(<ThemeProvider><AppShell/><AppAlertHost/></ThemeProvider>);`);
const nativeScreens = {
  name: 'android-project-siblings', enforce: 'pre',
  transform(code,id){
    if(!id.replaceAll('\\','/').startsWith(mobile.replaceAll('\\','/')+'/src/'))return null;
    const next=code.replace(/require\((['"])([^'"]+\.(?:png|jpe?g|webp))\1\)/g,(_m,_q,file)=>'({uri:'+JSON.stringify('/@fs/'+path.resolve(path.dirname(id),file).replaceAll('\\','/'))+'})');
    return next===code?null:{code:next,map:null};
  },
  resolveId(id, importer) {
    if (!importer || !importer.replaceAll('\\', '/').startsWith(mobile.replaceAll('\\', '/') + '/src/') || !id.startsWith('.') || /\.(tsx?|jsx?)$/.test(id)) return null;
    const target = path.resolve(path.dirname(importer), id);
    for (const ext of ['.android.tsx', '.android.ts', '.tsx', '.ts']) if (fs.existsSync(target + ext)) return target + ext;
    return null;
  },
};
const vite = await createServer({
  configFile: false, root: entry, plugins: [nativeScreens, react()], logLevel: 'error',
  define: { 'process.env.EXPO_PUBLIC_API_URL': '""', global: 'globalThis', __DEV__: 'false' },
  optimizeDeps: { include: ['react-native-web'] },
  resolve: { dedupe: ['react', 'react-dom'], extensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.json'], alias: [
    { find: /^react-native$/, replacement: path.join(entry, 'native.ts') },
    { find: /^react-native-web$/, replacement: path.join(mobile, 'node_modules/react-native-web') },
    { find: /^react-native-svg$/, replacement: path.join(mobile, 'node_modules/react-native-svg/lib/module/elements.web.js') },
    { find: /^react$/, replacement: path.join(mobile, 'node_modules/react') },
    { find: /^react-dom(\/.*)?$/, replacement: path.join(mobile, 'node_modules/react-dom') + '$1' },
    { find: '@react-native-async-storage/async-storage', replacement: path.join(entry, 'storage.ts') },
    { find: 'expo/fetch', replacement: path.join(entry, 'stream.ts') },
    { find: 'expo-status-bar', replacement: path.join(entry, 'status.tsx') },
    { find: 'expo-image-picker', replacement: path.join(entry, 'picker.ts') },
    { find: 'expo-file-system/legacy', replacement: path.join(entry, 'file-system.ts') },
    { find: 'expo-intent-launcher', replacement: path.join(entry, 'intent.ts') },
    { find: /^\.\.?\/audioFeedback$/, replacement: path.join(entry, 'audio.ts') },
    { find: /^\.\.\/\.\.\/modules\/route-player\/index\.android$/, replacement: path.join(entry, 'native-route.ts') },
  ] }, server: { middlewareMode: true, fs: { allow: [root, directory] } },
});
const app = express(); app.use(express.json());
// This browser harness runs Android source and must retain native update policy.
app.use((req, _res, next) => { req.headers['x-app-platform'] = 'android'; next(); });
let aiRequests = 0, forceWalletExpired = false, versionFault = '';
const previousVersionEnvironment = { latest: process.env.MOBILE_LATEST_VERSION, minimum: process.env.MOBILE_MINIMUM_VERSION };
app.use('/api/mobile/version', (_req, res, next) => {
 if(versionFault==='offline') return res.status(503).json({error:'Synthetic connection outage'});
 if(versionFault==='legacy'){const send=res.json.bind(res);res.json=data=>send({...data,backend:undefined});}
 next();
});
app.use('/api/ai', (req, res, next) => { if(req.method==='GET')return next(); aiRequests++; res.status(503).json({ error: 'Synthetic UI test: no model call' }); });
app.get('/api/account/points/wallet', (_req, res, next) => forceWalletExpired ? res.status(401).json({ error: 'Synthetic session expiry' }) : next());
app.use((req, res, next) => req.path.startsWith('/api/') ? backend(req, res, next) : next());
app.use(vite.middlewares);
const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`, checks = [], errors = [], screenshots = [];
const issuedResponse = await fetch(base + '/api/admin/membership-codes', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: 'vip', quantity: 1, durationDays: 30, expiresAt: null, requestId: crypto.randomUUID() }) });
assert.ok(issuedResponse.ok, 'isolated admin creates one test membership code');
const issued = await issuedResponse.json(), redemptionCode = issued.codes?.[0]?.code;
assert.equal(typeof redemptionCode, 'string');
let browser, page;
const shot = async name => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  const file = path.join(out, name + '.jpg');
  await page.screenshot({ path: file, type: 'jpeg', quality: 78, animations: 'disabled' });
  assert.ok(fs.statSync(file).size <= 500000); screenshots.push(file);
};
const tab = async name => page.getByRole('button', { name: name + '导航', exact: true }).click();
try {
  browser = await launchTestBrowser();
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, hasTouch: true, reducedMotion: 'reduce' });
  await context.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base, { waitUntil: 'networkidle' });
  await expect(page.getByTestId('today-screen')).toBeVisible();
  await expect(page.getByText('今天，也要稳步向前', { exact: true })).toBeVisible();
  assert.equal(await page.locator('#app-tab-bar').getByRole('button').count(), 5);
  assert.ok((await page.getByText('今天，也要稳步向前', { exact: true }).evaluate(e => getComputedStyle(e).fontFamily)).includes('KaojiangSans'));
  await shot('01-today-393'); checks.push('native Today, bundled font and five-item navigation');
  await tab('练习');
  await expect(page.getByText('继续巩固知识点', { exact: true })).toBeVisible();
  await shot('02-practice-directory-393');
  await page.getByRole('button', { name: `展开 ${chapter} 的子知识点`, exact: true }).click();
  await page.getByRole('button', { name: '展开 网络基础 的考点', exact: true }).click();
  await shot('02b-expanded-directory-393');
  await page.getByRole('textbox', { name: '搜索知识点', exact: true }).fill(leaf);
  await expect(page.getByText(leaf, { exact: true })).toBeVisible();
  await shot('03-knowledge-search-393');
  await page.getByRole('button', { name: new RegExp('练习.*' + leaf) }).click();
  await expect(page.getByText('确认答案', { exact: true })).toBeVisible();
  await expect(page.locator('#app-tab-bar')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '上一题', exact: true })).toBeDisabled();
  assert.equal(await page.getByRole('button', { name: '确认答案', exact: true }).evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(40, 101, 238)');
  await shot('04-practice-question-393');
  await page.getByText('64 个', { exact: true }).click();
  await page.getByText('AI 提示', { exact: true }).click();
  await expect(page.getByRole('heading', { name: '使用 AI 前确认积分', exact: true })).toBeVisible();
  assert.equal(aiRequests, 0);
  await shot('05-ai-points-confirm-393');
  await page.getByRole('button', { name: '取消本次AI请求', exact: true }).click();
  await page.getByText('确认答案', { exact: true }).click();
  await expect(page.getByText('正确答案：', { exact: false }).first()).toBeVisible();
  await shot('06-practice-analysis-393'); checks.push('catalog search, practice, wrong answer, analysis and pre-AI consent/cancel');
  const answerCount = () => store.db.prepare('SELECT COUNT(*) AS count FROM attempts WHERE user_id=?').get(user.id).count;
  const recorded = answerCount();
  await page.getByRole('button', { name: '下一题', exact: true }).click();
  await page.getByRole('radio', { name: 'B：64 个', exact: true }).click();
  await page.getByRole('button', { name: '上一题', exact: true }).click();
  await expect(page.getByText('正确答案：', { exact: false }).first()).toBeVisible();
  assert.equal(answerCount(), recorded, 'reviewing the previous answer must not submit again');
  await page.getByRole('button', { name: '下一题', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'B：64 个', exact: true })).toBeChecked();
  await expect(page.getByRole('button', { name: '确认答案', exact: true })).toBeVisible();
  assert.equal(answerCount(), recorded, 'unsubmitted draft is restored without another grading request');
  await page.getByRole('button', { name: '返回题库目录', exact: true }).click();
  await expect(page.locator('#app-tab-bar').getByRole('button')).toHaveCount(5);
  checks.push('focused practice footer, previous-answer review and draft restoration without duplicate attempts');
  await tab('我的'); await shot('07-my-393');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByText('修改会立即生效', { exact: true })).toBeVisible();
  await shot('08-settings-393');
  const soundSwitch = page.getByRole('switch', { name: '开启交互音效', exact: true });
  await expect(soundSwitch).toBeChecked();
  await soundSwitch.click(); await expect(soundSwitch).not.toBeChecked();
  assert.equal(await page.evaluate(() => localStorage.getItem('kaojiang-ui-sound-enabled')), 'false');
  await soundSwitch.click(); await expect(soundSwitch).toBeChecked();
  await page.getByRole('radio', { name: '灵动', exact: true }).click();
  await expect(page.getByRole('radio', { name: '灵动', exact: true })).toBeChecked();
  await page.getByRole('radio', { name: '标准', exact: true }).click();
  await page.getByRole('radio', { name: '清脆', exact: true }).click();
  await expect(page.getByRole('radio', { name: '清脆', exact: true })).toBeChecked();
  await page.getByRole('radio', { name: '轻柔', exact: true }).click();
  await page.getByRole('radio', { name: '较强', exact: true }).click();
  await expect(page.getByRole('radio', { name: '较强', exact: true })).toBeChecked();
  await page.getByRole('radio', { name: '适中', exact: true }).click();
  await page.getByRole('button', { name: '试听当前音效', exact: true }).click();
  await page.getByRole('button', { name: '清理学习缓存', exact: true }).click();
  await expect(page.getByText('已清理', { exact: true })).toBeVisible();
  checks.push('settings animation/sound-style/volume/switch controls persist; cache cleanup preserves the signed-in account');
  await page.getByRole('button', { name: '关闭设置', exact: true }).click();
  await page.getByRole('button', { name: '编辑个人资料', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '名字', exact: true })).toBeVisible();
  await shot('09-profile-edit-393');
  await page.getByRole('textbox', { name: '名字', exact: true }).fill('安卓界面验收用户');
  await page.getByRole('button', { name: '保存资料', exact: true }).click();
  await expect(page.getByText('安卓界面验收用户', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '账号与安全设置', exact: true }).click();
  await expect(page.getByText('登录密码', { exact: true })).toBeVisible();
  await shot('10-account-security-393');
  await page.getByText('修改密码', { exact: true }).click();
  await expect(page.getByLabel('当前密码', { exact: true })).toBeVisible();
  await shot('10b-password-form-393');
  await page.getByText('确认修改密码', { exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByText('返回', { exact: true }).click();
  await page.getByText('兑换码', { exact: true }).click();
  await expect(page.getByText('兑换会员权益', { exact: true })).toBeVisible();
  await shot('11-redeem-393');
  await page.getByRole('textbox', { name: '会员兑换码', exact: true }).fill('INVALID-UI-FIXTURE');
  await page.getByRole('button', { name: '确认兑换', exact: true }).click();
  await expect(page.getByText(/兑换码.*(?:无效|不存在|错误)/).first()).toBeVisible();
  await shot('11b-invalid-redemption-393');
  await page.getByRole('textbox', { name: '会员兑换码', exact: true }).fill(redemptionCode);
  await page.getByRole('button', { name: '确认兑换', exact: true }).click();
  await expect(page.getByRole('button', { name: '完成', exact: true })).toBeVisible();
  await shot('11c-redemption-success-393');
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await expect(page.getByRole('button', { name: '查看可用AI积分、服务费用和积分记录', exact: true }).getByText('1,990 积分', { exact: true })).toBeVisible();
  await page.getByText('会员与 AI 积分', { exact: true }).click();
  await expect(page.getByText('选择会员套餐', { exact: true })).toBeVisible();
  await shot('12-membership-393');
  await page.getByRole('button', { name: '签到领积分', exact: true }).click();
  await expect(page.getByRole('button', { name: '已签到', exact: true })).toBeVisible();
  await expect(page.getByText('1,995', { exact: true })).toBeVisible();
  checks.push('real funded fixture redemption and check-in refresh balances immediately');
  await page.getByRole('button', { name: '服务价目', exact: false }).click();
  await expect(page.getByText('AI 服务积分价目', { exact: true })).toBeVisible();
  checks.push('My/settings/profile save/security/redeem/membership/pricing entries');
  await shot('13-service-prices-393');
  await page.getByRole('button', { name: '返回我的', exact: true }).click();
  await tab('考试');
  await expect(page.getByRole('heading', { name: '考试', exact: true })).toBeVisible();
  await shot('14-exam-setup-393');
  const clearSelection = page.getByText('取消全选', { exact: true });
  if (await clearSelection.count()) await clearSelection.click();
  await page.getByRole('checkbox').filter({ hasText: chapter }).click();
  await page.getByText('30 题', { exact: true }).click();
  await page.getByRole('button', { name: '组合试卷，开始考试 →', exact: true }).click();
  await expect(page.getByText('知识点模拟', { exact: true })).toBeVisible();
  await expect(page.locator('#app-tab-bar')).toHaveCount(0);
  await page.getByRole('radio').filter({ hasText: '62 个' }).click();
  await shot('15-exam-taking-393');
  await page.getByRole('button', { name: '答题卡', exact: true }).click();
  await page.getByRole('button', { name: '第30题，未答', exact: true }).click();
  await page.getByRole('radio').filter({ hasText: '64 个' }).click();
  await page.getByRole('button', { name: '检查并交卷', exact: true }).click();
  await expect(page.getByRole('heading', { name: '检查与交卷', exact: true })).toBeVisible();
  assert.equal(await page.getByRole('button', { name: /^第\d+题，/ }).count(), 30);
  await shot('16-exam-check-submit-393');
  await page.getByRole('button', { name: '确认交卷', exact: true }).click();
  await expect(page.getByRole('heading', { name: '考试结果', exact: true })).toBeVisible();
  await shot('17-exam-result-393');
  checks.push('real exam creation, answer saving, answer-sheet jump, incomplete confirmation and submission/result');
  await tab('错题');
  await expect(page.getByRole('heading', { name: '错题', exact: true })).toBeVisible();
  await shot('18-wrong-book-393');
  await page.getByRole('button', { name: '反复出错', exact: true }).click();
  await expect(page.getByText('当前筛选下没有错题', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '全部错题', exact: true }).click();
  checks.push('wrong book grouping and repeated-error filters');
  await tab('我的');
  await page.getByRole('button', { name: '考试与题库，切换证书', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '搜索考试证书', exact: true })).toBeVisible();
  await shot('19-certificate-picker-393');
  await page.getByRole('textbox', { name: '搜索考试证书', exact: true }).fill('HCIA-Datacom');
  await page.getByRole('button', { name: /HCIA-Datacom/i }).click();
  await page.getByRole('button', { name: '确认选择考试证书', exact: true }).click();
  await expect(page.getByTestId('today-screen')).toBeVisible();
  await tab('我的');
  await expect(page.getByRole('button', { name: '考试与题库，切换证书', exact: true })).toContainText(/HCIA-Datacom/i);
  await tab('错题');
  await expect(page.getByText('这里会记录你的薄弱点', { exact: true })).toBeVisible();
  await tab('我的');
  await page.getByRole('button', { name: '考试与题库，切换证书', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索考试证书', exact: true }).fill('软考中级网络工程师');
  await page.getByRole('button', { name: '软考中级网络工程师', exact: true }).click();
  await page.getByRole('button', { name: '确认选择考试证书', exact: true }).click();
  await expect(page.getByTestId('today-screen')).toBeVisible();
  checks.push('certificate search/confirmation and wrong-record isolation across certificate switches');
  await tab('练习');
  await page.getByRole('textbox', { name: '搜索知识点', exact: true }).fill('虚拟定位学习');
  await page.getByRole('button', { name: '虚拟定位学习', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '搜索专项学习知识点', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: '搜索专项学习知识点', exact: true }).fill(leaf);
  await page.getByRole('button', { name: `选择${leaf}，30道题`, exact: true }).click();
  await expect(page.getByText('专项学习 1 / 30', { exact: true })).toBeVisible();
  await shot('20-daily30-question-393');
  for (let i = 0; i < 30; i++) {
    await expect(page.getByText(`专项学习 ${i + 1} / 30`, { exact: true })).toBeVisible();
    const answer = page.getByRole('button', { name: '提交本题', exact: true });
    await page.getByRole('radio', { name: i === 0 ? 'B 64 个' : 'A 62 个', exact: true }).click();
    await answer.scrollIntoViewIfNeeded();
    if (i === 0) await expect(answer).toBeDisabled();
    await expect(answer).toBeEnabled({ timeout: 12000 });
    await answer.click();
    if (i === 0) await expect(page.getByText('本题答错了，阅读解析也算完成', { exact: true })).toBeVisible();
    const advance = page.getByRole('button', { name: i === 29 ? '确认阅读，完成 30 题' : '确认阅读，下一题', exact: true });
    await advance.scrollIntoViewIfNeeded();
    if (i === 0) { await expect(advance).toBeDisabled(); await shot('21-daily30-wrong-review-393'); }
    await expect(advance).toBeEnabled({ timeout: 12000 });
    await advance.click();
  }
  await expect(page.getByText('已解锁模拟定位学习', { exact: true })).toBeVisible();
  await shot('22-daily30-unlocked-393');
  await page.getByRole('button', { name: '退出专项学习', exact: true }).click();
  await page.getByRole('button', { name: '虚拟定位学习', exact: true }).click();
  await expect(page.getByText('已解锁模拟定位学习', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '退出专项学习', exact: true }).click();
  checks.push('daily30 real API: reading/answer/review delays, wrong answers allowed, thirty completions and same-day reopen');
  await tab('我的');
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(page.getByText('欢迎回来', { exact: true })).toBeVisible();
  await page.getByPlaceholder('输入账号', { exact: true }).fill(other.username);
  await page.getByPlaceholder('至少 8 位密码', { exact: true }).fill('fixture-password-123');
  await page.getByRole('button', { name: '登录', exact: true }).last().click();
  await expect(page.getByTestId('today-screen')).toBeVisible();
  await tab('错题');
  await expect(page.getByText('这里会记录你的薄弱点', { exact: true })).toBeVisible();
  await tab('我的');
  await expect(page.getByRole('button', { name: '查看可用AI积分、服务费用和积分记录', exact: true }).getByText('0 积分', { exact: true })).toBeVisible();
  await expect(page.getByText('安卓界面验收用户', { exact: true })).toHaveCount(0);
  await tab('练习');
  await page.getByRole('textbox', { name: '搜索知识点', exact: true }).fill('虚拟定位学习');
  await page.getByRole('button', { name: '虚拟定位学习', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '搜索专项学习知识点', exact: true })).toBeVisible();
  await expect(page.getByText('已解锁模拟定位学习', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '退出专项学习', exact: true }).click();
  checks.push('logout/login account isolation for profile, balance, wrong book and daily30 entitlement');
  await tab('我的');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByText('深色模式', { exact: true }).click();
  await page.getByRole('button', { name: '关闭设置', exact: true }).click();
  await tab('今日'); await shot('23-today-dark-393');
  await tab('我的');
  await page.getByText('会员与 AI 积分', { exact: true }).click();
  await shot('23b-membership-dark-393');
  const selectedPlan = page.getByRole('button', { name: 'SVIP，19.9元，每30天1990积分', exact: true });
  assert.equal(await selectedPlan.locator('svg').last().evaluate(e => getComputedStyle(e).stroke), 'rgb(16, 23, 34)');
  await page.getByRole('button', { name: '返回我的', exact: true }).click();
  await tab('练习');
  await page.getByRole('textbox', { name: '搜索知识点', exact: true }).fill('');
  await shot('23c-practice-dark-393');
  await tab('错题'); await shot('23d-wrong-dark-393');
  await tab('考试'); await shot('23e-exam-dark-393');
  await tab('今日');
  for (const [width, height] of [[320, 740], [800, 1100], [1024, 600]]) {
    await page.setViewportSize({ width, height });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const rect = await page.locator('#app-tab-bar').boundingBox();
    assert.ok(rect && rect.y + rect.height <= height + 1, 'bottom navigation remains in the viewport');
    await shot(`24-responsive-${width}`);
  }
  checks.push('dark theme and narrow phone/tablet/landscape layout with visible bottom navigation');
  await tab('我的');
  await page.getByRole('button', { name: '查看可用AI积分、服务费用和积分记录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '积分费用与记录', exact: true })).toBeVisible();
  await page.getByRole('button', {name:'关闭积分费用与记录',exact:true}).click();
  versionFault = 'legacy'; await page.reload();
  await expect(page.getByTestId('backend-connection-notice')).toContainText('服务端尚未完成 v1.0 升级');
  versionFault = ''; await page.getByRole('button',{name:'重新连接',exact:true}).click();
  await expect(page.getByTestId('backend-connection-notice')).toHaveCount(0);
  versionFault = 'offline'; await page.reload();
  await expect(page.getByTestId('backend-connection-notice')).toContainText('暂未连接到服务器');
  versionFault = ''; await page.getByRole('button',{name:'重新连接',exact:true}).click();
  await expect(page.getByTestId('backend-connection-notice')).toHaveCount(0);
  checks.push('v1 backend contract detects an old server and recovers from a connection outage without a fake zero balance');
  await tab('我的');
  await page.getByRole('button', { name: '查看可用AI积分、服务费用和积分记录', exact: true }).click();
  forceWalletExpired = true;
  await page.getByRole('button', { name: '刷新可用积分', exact: true }).click();
  await expect(page.getByText('欢迎回来', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '积分费用与记录', exact: true })).toHaveCount(0);
  checks.push('expired-session returns to sign-in and clears account-owned points presentation');
  process.env.MOBILE_LATEST_VERSION='9.0.0'; await page.reload();
  await expect(page.getByText('欢迎回来',{exact:true})).toBeVisible();
  await expect(page.getByText('请更新到最新版',{exact:true})).toHaveCount(0);
  process.env.MOBILE_MINIMUM_VERSION='9.0.0'; await page.reload();
  await expect(page.getByText('请更新到最新版',{exact:true})).toBeVisible();
  await expect(page.getByText('欢迎回来',{exact:true})).toHaveCount(0);
  checks.push('optional updates do not interrupt a supported app; unsupported versions enter the non-dismissible update screen');
  assert.equal(aiRequests, 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(sourceHashes(), testedSources, 'verified Android source must not change during acceptance');
  const unintendedWeb=[...vite.environments.client.moduleGraph.idToModuleMap.keys()].filter(id=>id.replaceAll('\\','/').startsWith(mobile.replaceAll('\\','/')+'/src/')&&/\.web\.tsx?(?:\?|$)/.test(id));
  assert.deepEqual(unintendedWeb,[], 'Android preview uses native or regular project sources, not Web siblings');
} catch (error) {
  if (page) {
    fs.writeFileSync(path.join(out, 'failure-dom.txt'), await page.locator('body').innerText().catch(() => ''));
    await shot('failure').catch(() => {});
  }
  fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({ error: error.stack, errors, checks }, null, 2));
  throw error;
} finally {
  for(const [key,value] of [['MOBILE_LATEST_VERSION',previousVersionEnvironment.latest],['MOBILE_MINIMUM_VERSION',previousVersionEnvironment.minimum]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ checks, errors, screenshots, aiRequests, testedSources, nativeSystemAdapters: 'fixtures; not native-device acceptance' }, null, 2));
  await browser?.close(); await vite.close(); await new Promise(resolve => server.close(resolve)); store.close?.();
}
console.log('Browser Android UI checks: ' + checks.length + '; screenshots: ' + screenshots.length + '; external model requests: ' + aiRequests);
