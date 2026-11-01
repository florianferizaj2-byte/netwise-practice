import { learningFixture } from "./helpers/ai-learning.js";
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
const directory = fs.mkdtempSync(path.join(root, 'tmp/ai-learning-browser-'));
process.env.ADMIN_USERNAME = 'android_ui_learner';
const out = path.resolve('tmp/ai-learning-20261029/browser');
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
store.aiServices.policy = () => ({ managed: false });
// The learning fixture uses an explicit synthetic plain key and stub transport; no real upstream is contacted.
const fixture = learningFixture(store,{delayMs:140,holdAfter:4});
const backend = await createApp({ store, provider:fixture.provider, aiLearning:{questions:fixture.questions,tickMs:50}, withFrontend: false, authRequired: true, accountSecurity: { enabled: false }, announcementFile: path.join(directory, 'no-announcement.json') });
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
import {AppAlertHost} from ${JSON.stringify(source('src/components/AppAlert.web.tsx'))};
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
    if(id.endsWith('/AppAlert'))return path.join(mobile,'src/components/AppAlert.web.tsx');
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
let aiRequests = 0, forceWalletExpired = false;
app.use('/api/ai', (req, res, next) => { if(req.method==='GET')return next(); aiRequests++; res.status(503).json({ error: 'Synthetic UI test: no model call' }); });
app.get('/api/account/points/wallet', (_req, res, next) => forceWalletExpired ? res.status(401).json({ error: 'Synthetic session expiry' }) : next());
app.get('/api/mobile/version', (_req, res) => res.json({ currentVersion: '0.4.8', latestVersion: '0.4.8', minimumVersion: '0.4.8', forceUpdate: false, updateAvailable: false }));
app.use((req, res, next) => req.path.startsWith('/api/') ? backend(req, res, next) : next());
app.use(vite.middlewares);
const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`, checks = [], errors = [], screenshots = [];
const issuedResponse = await fetch(base + '/api/admin/membership-codes', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: 'vip', quantity: 1, durationDays: 30, expiresAt: null, requestId: crypto.randomUUID() }) });
assert.ok(issuedResponse.ok, 'isolated admin creates one test membership code');
const issued = await issuedResponse.json(), redemptionCode = issued.codes?.[0]?.code;
assert.equal(typeof redemptionCode, 'string');

let browser,page;
const shot=async name=>{
  await page.evaluate(()=>document.fonts.ready);
  const file=path.join(out,name+".jpg");
  await page.screenshot({path:file,type:"jpeg",quality:78,animations:"disabled"});
  assert.ok(fs.statSync(file).size<500000);screenshots.push(file);
};
const tab=async name=>page.getByRole("button",{name:name+"导航",exact:true}).click();
const request=async url=>{
  const r=await fetch(base+"/api"+url,{headers:{Authorization:"Bearer "+token}});assert.equal(r.status,200);return r.json();
};
try{
  browser=await launchTestBrowser();
  page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:1});
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto(base,{waitUntil:"networkidle"});
  await expect(page.getByRole("button",{name:"AI 生成导航",exact:true})).toBeVisible();
  const nav=await page.locator("#app-tab-bar [role=button]").allTextContents();
  assert.equal(nav.length,5);assert.match(nav[2],/AI 生成/);
  await tab("AI 生成");
  for(const name of ["攻克不会的","挑战更难的","巩固易忘的","综合提分"])await expect(page.getByText(name,{exact:true})).toBeVisible();
  await expect(page.getByText("从你的每一次作答出发",{exact:true})).toBeVisible();
  await shot("01-ai-learning-center");
  await page.getByRole("button",{name:"生成专属练习",exact:true}).click();
  await expect(page.getByText("积分使用确认",{exact:true})).toBeVisible();
  assert.equal(fixture.generated,0);
  await page.getByRole("button",{name:"返回调整",exact:true}).click();
  checks.push("middle AI navigation, four strategies, evidence and explicit cost confirmation");

  await tab("考试");await page.getByRole("tab",{name:"AI 个性化",exact:true}).click();
  await expect(page.getByText("AI 个性化组卷",{exact:true})).toBeVisible();
  await page.getByRole("radio",{name:"10 题",exact:true}).click();
  await page.getByRole("button",{name:"生成 AI 试卷",exact:true}).click();
  await page.getByRole("button",{name:"同意积分规则，确认生成",exact:true}).click();
  await expect(page.getByRole("button",{name:"开始作答",exact:true})).toBeEnabled({timeout:30000});
  await page.getByRole("button",{name:"开始作答",exact:true}).click();
  await expect(page.getByText("AI 个性化考试",{exact:true})).toBeVisible();
  await expect(page.getByText(/已就绪 [34] \/ 10 题/)).toBeVisible();
  await page.getByRole("radio").first().click();
  await expect(page.getByText(/作答已保存 · 后台任务独立运行/)).toBeVisible({timeout:12000});
  await shot("02-progressive-ai-exam");
  let current=(await request("/ai-learning/jobs")).jobs.find(j=>j.kind==="exam");
  let state=await request("/ai-learning/jobs/"+current.id);
  assert.ok(state.readyCount>=3&&state.readyCount<10);
  assert.ok(state.questions.every(q=>q.answer===undefined&&q.analysis===undefined));
  const firstId=state.questions[0].id;
  checks.push("reviewed first batch is answerable while remaining slots are generating; no answer leakage");

  await page.context().setOffline(true);
  await page.getByRole("button",{name:"下一题",exact:true}).click();
  await page.getByRole("radio").first().click();
  await expect(page.getByText(/作答已暂存，待同步/)).toBeVisible({timeout:12000});
  const drafts=await page.evaluate(()=>Object.entries(localStorage).filter(([key])=>key.startsWith("kaojiang-ai-learning-draft:")));
  assert.ok(drafts.some(([,value])=>Object.keys(JSON.parse(value).answers).length>0));
  fixture.release();
  for(let i=0;i<120;i++){state=await request("/ai-learning/jobs/"+current.id);if(state.readyCount===10)break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(state.readyCount,10);
  assert.equal(state.questions[0].id,firstId);
  await page.context().setOffline(false);
  await page.reload({waitUntil:"networkidle"});
  await page.getByRole("button",{name:"考试导航",exact:true}).click();
  await page.getByRole("tab",{name:"AI 个性化",exact:true}).click();
  await expect(page.getByText("AI 个性化考试",{exact:true})).toBeVisible({timeout:20000});
  await expect(page.getByText(/作答已保存 · 后台任务独立运行/)).toBeVisible({timeout:20000});
  state=await request("/ai-learning/jobs/"+current.id);
  assert.equal(Object.keys(state.answers).length,2);
  assert.equal(state.readyCount,10);
  assert.ok(fixture.reviews>=10);
  checks.push("offline answer delta persists; server continues generation; reload restores and synchronizes answers");

  await page.getByRole("button",{name:"交卷",exact:true}).click();
  await page.getByRole("button",{name:"确认交卷",exact:true}).click();
  await expect(page.getByText("AI 个性化训练成绩，非官方考试评分",{exact:true})).toBeVisible({timeout:15000});
  await expect(page.getByRole("button",{name:"AI 生成导航",exact:true})).toBeVisible();
  state=await request("/ai-learning/jobs/"+current.id);
  assert.equal(state.submitted,true);assert.equal(state.result.maxScore,10);assert.equal(state.result.partial,false);
  assert.equal(store.points.wallet(user.id).heldUnits,0);
  assert.equal(store.points.audit().passed,true);
  assert.deepEqual(errors,[]);
  checks.push("exam submission reveals explanations, persists history and restores bottom navigation");
  fs.writeFileSync(path.join(out,"report.json"),JSON.stringify({passed:true,checks,screenshots,errors,syntheticModel:true,nativeDeviceAcceptance:false},null,2));
  console.log(JSON.stringify({passed:true,checks,screenshots},null,2));
 }catch(error){
  const diagnostics={generated:fixture.generated,reviews:fixture.reviews,jobs:await request("/ai-learning/jobs").catch(e=>({error:String(e)})),
    operations:store.db.prepare("SELECT feature,state,error FROM ai_points_operations ORDER BY created_at DESC LIMIT 4").all()};
  fs.writeFileSync(path.join(out,"diagnostics.json"),JSON.stringify(diagnostics,null,2));
  console.error("AI_LEARNING_DIAGNOSTICS "+JSON.stringify(diagnostics));
  if(page)await shot("failure").catch(()=>{});
  fs.writeFileSync(path.join(out,"report.json"),JSON.stringify({passed:false,checks,screenshots,errors,error:error.stack},null,2));
  throw error;
}finally{
  fixture.release();await backend.locals.stop();await browser?.close();await vite.close();
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));store.db.close();
  assert.equal(path.dirname(directory),path.join(root,"tmp"));assert.ok(path.basename(directory).startsWith("ai-learning-browser-"));
  fs.rmSync(directory,{recursive:true,force:true});
}
