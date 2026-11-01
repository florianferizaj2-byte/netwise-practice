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
const out = path.resolve(process.env.ANDROID_UI_VISUAL_DIR || 'tmp/android-ui-polish-20261025/visual-browser');
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
write('native.ts', `export*from'react-native-web';import React from'react';import{Platform,StyleSheet,Text as BaseText,TextInput as BaseInput,useWindowDimensions as baseDimensions}from'react-native-web';Platform.OS='android';
const Scale=React.createContext(1);export function TestFontScaleProvider({children}){const [scale,setScale]=React.useState(1);React.useLayoutEffect(()=>{window.__setFontScale=setScale},[]);return React.createElement(Scale.Provider,{value:scale},children)}
const scaled=(style,scale)=>{const s=StyleSheet.flatten(style)||{};return [style,typeof s.fontSize==='number'?{fontSize:s.fontSize*scale}:null,typeof s.lineHeight==='number'?{lineHeight:s.lineHeight*scale}:null]};
export const Text=React.forwardRef((props,ref)=>React.createElement(BaseText,{...props,ref,style:scaled(props.style,React.useContext(Scale))}));export const TextInput=React.forwardRef((props,ref)=>React.createElement(BaseInput,{...props,ref,style:scaled(props.style,React.useContext(Scale))}));export const useWindowDimensions=()=>({...baseDimensions(),fontScale:React.useContext(Scale)});
export const Alert={alert(title,message,buttons=[]){window.__lastNativeAlert={title,message,buttons}}};export const ToastAndroid={LONG:1,SHORT:0,show(){}};export const PermissionsAndroid={PERMISSIONS:{},RESULTS:{GRANTED:'granted'},async check(){return true},async request(){return 'granted'}};`);
write('picker.ts', 'export async function launchImageLibraryAsync(){return {canceled:true,assets:[]}};export async function requestMediaLibraryPermissionsAsync(){return {granted:true}};');
write('file-system.ts', 'export const cacheDirectory=null,documentDirectory=null;export async function getInfoAsync(){return {exists:false}};export async function deleteAsync(){};');
write('intent.ts', 'export async function startActivityAsync(){};');
write('native-route.ts', 'export function routePlayerAvailable(){return true} export async function updateRoutePlayerIdentity(){} export async function openRoutePlayer(){throw Error("Native entry is not part of browser acceptance")};');
write('main.tsx', `import React from 'react';import {TestFontScaleProvider} from './native';import {createRoot} from 'react-dom/client';
import {ThemeProvider} from ${JSON.stringify(source('src/theme.android.ts'))};
import {AppShell} from ${JSON.stringify(source('src/navigation/AppShell.android.tsx'))};
import {setSessionToken} from ${JSON.stringify(source('src/api/client.ts'))};
import {AppAlertHost} from ${JSON.stringify(source('src/components/AppAlert.tsx'))};
if(!localStorage.getItem('ui-initialized')){await setSessionToken(${JSON.stringify(token)});localStorage.setItem('ui-initialized','1')}
createRoot(document.getElementById('root')).render(<TestFontScaleProvider><ThemeProvider><AppShell/><AppAlertHost/></ThemeProvider></TestFontScaleProvider>);`);
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
let aiRequests = 0, forceWalletExpired = false, failWallet=false,holdAnswer=false,releaseAnswer=null,holdAi=false,releaseAi=null;
app.use('/api/ai', (req, res, next) => { if(req.method==='GET')return next(); aiRequests++; if(holdAi){holdAi=false;releaseAi=()=>res.json({text:'合成缓存讲解，未调用模型',cached:true});return;}res.status(503).json({ error: 'Synthetic UI test: no model call' }); });
app.get('/api/account/points/wallet', (_req, res, next) => forceWalletExpired?res.status(401).json({error:'Synthetic session expiry'}):failWallet?res.status(503).json({error:'Synthetic wallet offline'}):next());
app.use((req,res,next)=>{if(holdAnswer&&req.method==='POST'&&/^\/api\/attempts?$/.test(req.path)){holdAnswer=false;const end=res.end.bind(res);res.end=(...args)=>{releaseAnswer=()=>end(...args);return res;};}next();});
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

const observations = [];
const audit = async name => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(220);
  const metrics = await page.evaluate(() => {
    const width = innerWidth;
    const leaves = [...document.querySelectorAll('body *')].filter(e => {
      const r = e.getBoundingClientRect(), s = getComputedStyle(e);
      return !e.children.length && e.textContent.trim() && !['SCRIPT', 'STYLE'].includes(e.tagName) && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && s.visibility !== 'hidden';
    });
    return { fontMin: Math.min(...leaves.map(e => parseFloat(getComputedStyle(e).fontSize))),
      overflowing: leaves.filter(e => { const r=e.getBoundingClientRect(); return r.left < -1 || r.right > width + 1; }).map(e => ({text:e.textContent.slice(0,60),left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right})),
      smallButtons: [...document.querySelectorAll('[role=button]')].filter(e => { const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&(r.width<47||r.height<47); }).map(e=>({label:e.getAttribute('aria-label')||e.textContent.slice(0,30),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})) };
  });
  observations.push({name,...metrics});
  assert.ok(metrics.fontMin>=14,name+': readable helper text');
  assert.deepEqual(metrics.overflowing,[],name+': horizontal text overflow');
  assert.deepEqual(metrics.smallButtons,[],name+': minimum touch targets');
  checks.push(name+': fonts, text bounds and touch targets');
};
try {
  browser=await launchTestBrowser();
  const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:1,hasTouch:true,reducedMotion:'no-preference'});
  await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
  page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'networkidle'});await expect(page.getByTestId('today-screen')).toBeVisible();
  await expect(page.getByTestId('android-page-header')).toContainText('今日');
  assert.equal(await page.getByRole('button',{name:/^当前证书：/}).count(),0);
  const accents=await page.getByTestId('today-screen').locator('svg').evaluateAll(nodes=>nodes.map(e=>e.getAttribute('stroke')).filter(Boolean));
  for(const color of ['#176F65','#604AA0','#AC4039','#78509C'])assert.ok(accents.includes(color),'semantic accent '+color);
  const card=page.getByRole('button',{name:/^知识点练习/}).first();
  assert.ok(await card.evaluate(e=>parseFloat(getComputedStyle(e).borderRadius))>=20);
  await audit('home-393');await shot('01-home-393');
  const optics=await page.getByTestId('daily-goal').first().evaluate(root=>{
    const circle=root.querySelector('[data-testid="daily-goal-circle"]').getBoundingClientRect();
    const numbers=root.querySelector('[data-testid="daily-goal-numbers"]');
    const numberBox=numbers.getBoundingClientRect();
    const caption=root.querySelector('[data-testid="daily-goal-caption"]').getBoundingClientRect();
    return {captionGap:caption.top-circle.bottom,numberPadding:Math.min(numberBox.left-circle.left,circle.right-numberBox.right,numberBox.top-circle.top,circle.bottom-numberBox.bottom),weights:[...numbers.children].map(e=>getComputedStyle(e).fontWeight)};
  });
  assert.ok(optics.captionGap>=9.5,'ring caption has a separate ten-point breathing gap');
  assert.ok(optics.numberPadding>=16,'ring numerals do not crowd the circle');
  assert.deepEqual(optics.weights,['500','400'],'number and denominator have deliberate weight hierarchy');
  observations.push({name:'ring-optical-spacing',...optics});checks.push('ring optical spacing and numeric hierarchy');
  const nav=page.getByRole('button',{name:'练习导航',exact:true});const bounds=await nav.boundingBox();
  await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down();await page.waitForTimeout(130);
  const pressed=await nav.evaluate(e=>new DOMMatrixReadOnly(getComputedStyle(e).transform).a);
  assert.ok(pressed<.999&&pressed>=.975,'press feedback is subtle but visible');
  await page.mouse.move(-10,-10);await page.mouse.up();await page.waitForTimeout(220);
  const released=await nav.evaluate(e=>new DOMMatrixReadOnly(getComputedStyle(e).transform).a);
  assert.ok(Math.abs(released-1)<.001,'cancelled press returns to its original size');
  checks.push('press-down scales subtly and cancels without accidental navigation');
  for(const width of [320,800]){await page.setViewportSize({width,height:width===800?1100:740});await tab('今日');await audit('home-'+width);await shot('02-home-'+width);}
  await page.setViewportSize({width:320,height:740});await page.evaluate(()=>window.__setFontScale(1.8));
  await audit('home-large-text');await shot('03-home-large-text');
  await tab('我的');await audit('profile-large-text');await shot('04-profile-large-text');
  await page.getByRole('button',{name:'设置',exact:true}).click();await expect(page.getByRole('heading',{name:'设置',exact:true})).toBeVisible();await audit('settings-large-text');await shot('05-settings-large-text');
  await page.getByRole('button',{name:'关闭设置',exact:true}).click();await page.evaluate(()=>window.__setFontScale(1));
  await tab('练习');await audit('practice-320');await shot('06-practice-320');
  await page.getByRole('textbox',{name:'搜索知识点',exact:true}).fill(leaf);await page.getByRole('button',{name:new RegExp('练习.*'+leaf)}).click();
  await expect(page.getByRole('heading',{name:'知识点练习',exact:true})).toBeVisible();await page.evaluate(()=>window.__setFontScale(1.8));await audit('question-large-text');await shot('07-question-large-text');
  await page.evaluate(()=>window.__setFontScale(1));await page.getByRole('radio',{name:'A：62 个',exact:true}).click();await page.getByRole('button',{name:'确认答案',exact:true}).click();await expect(page.getByText('正确答案：',{exact:false}).first()).toBeVisible();
  const progress=page.getByRole('progressbar').first();if(await progress.count()){const val=await progress.getAttribute('aria-valuenow');assert.ok(Number(val)>=0&&Number(val)<=100);}
  await shot('08-question-feedback');
  assert.deepEqual(errors,[]);assert.deepEqual(sourceHashes(),testedSources);fs.writeFileSync(path.join(out,'visual-metrics.json'),JSON.stringify({observations,checks},null,2));
} catch (error) {
  if (page) {
    fs.writeFileSync(path.join(out, 'failure-dom.txt'), await page.locator('body').innerText().catch(() => ''));
    await shot('failure').catch(() => {});
  }
  fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({ error: error.stack, errors, checks }, null, 2));
  throw error;
} finally {
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ checks, errors, screenshots, aiRequests, observations, testedSources, nativeSystemAdapters: 'fixtures; not native-device acceptance' }, null, 2));
  await browser?.close(); await vite.close(); await new Promise(resolve => server.close(resolve)); store.close?.();
}
console.log('Visual polish browser checks: ' + checks.length + '; screenshots: ' + screenshots.length + '; synthetic AI requests: ' + aiRequests);
