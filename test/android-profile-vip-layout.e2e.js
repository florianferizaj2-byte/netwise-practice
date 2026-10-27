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
import { expect as baseExpect } from '@playwright/test';
const expect=baseExpect.configure({timeout:15000});
import { createApp } from '../server/index.js';
import { createStore } from '../server/store.js';
import { completeFixtureProfile } from './helpers/mobile-profile.js';
import { launchTestBrowser } from './helpers/browser.js';

const root = process.cwd(), mobile = path.join(root, 'mobile');
const currentVersion = JSON.parse(fs.readFileSync(path.join(mobile, 'package.json'), 'utf8')).version;
const sourceHashes = () => {
  const files = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  return Object.fromEntries(files(path.join(mobile, 'src')).map(p => [path.relative(mobile, p), crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
};
const testedSources = sourceHashes();
const directory = fs.mkdtempSync(path.join(root, 'tmp/android-ui-browser-'));
process.env.ADMIN_USERNAME = 'layout_admin_not_the_learner';
const out = path.resolve('tmp/overdraft-instant-feedback-20261027/browser');
fs.mkdirSync(out, { recursive: true });
const store = createStore(path.join(directory, 'data'));
const user = store.register('android_ui_learner', 'fixture-password-123');
completeFixtureProfile(store, user);
store.selectCertificate(user.id, 'network-engineer');
let token = store.createAuthSession(user.id);
const other = store.register('android_ui_other', 'fixture-password-123');
completeFixtureProfile(store, other); store.selectCertificate(other.id, 'network-engineer'); token=store.createAuthSession(other.id);
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

const wrongFixtures=[
 {id:'ui-wrong-binary',question:'将二进制数 101101₂ 转换为十进制，结果是多少？',chapter:'计算机基础',knowledgePoint:'进制转换',mistakes:3},
 {id:'ui-wrong-excel',question:'Excel 中按 F9 时，选中的公式片段会发生什么？',chapter:'Office 应用',knowledgePoint:'电子表格基础',mistakes:2},
 {id:'ui-wrong-network',question:'交换机收到未知单播帧时，应如何转发？',chapter:'网络基础',knowledgePoint:'以太网交换',mistakes:1},
 {id:'ui-wrong-long',question:'使用二进制编码时，如果希望在不改变有效数值的前提下把较短的无符号整数扩展为更长的位数，应当在原有数字的哪一侧补充什么数字？请结合位权和数值范围进行判断。',chapter:'计算机基础',knowledgePoint:'进制转换',mistakes:1},
];
for(const fixture of wrongFixtures){
 store.addQ({...fixture,type:'single_choice',knowledgeSection:'界面验证专用',options:{A:'选项一',B:'选项二'},answer:['A'],analysis:'合成界面验证解析，不进入正式题库。',certificates:['network-engineer'],difficulty:'基础'});
 for(let n=0;n<fixture.mistakes;n++)store.recordAttempt(fixture.id,['B'],1000,'practice',other.id);
}

for(const id of ['ui-wrong-binary','ui-wrong-excel']){
 const row=store.db.prepare('SELECT data FROM user_reviews WHERE user_id=? AND question_id=?').get(other.id,id);
 const review={...JSON.parse(row.data),dueAt:new Date(Date.now()-60000).toISOString()};
 store.db.prepare('UPDATE user_reviews SET data=? WHERE user_id=? AND question_id=?').run(JSON.stringify(review),other.id,id);
}
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
import {ThemeProvider,useTheme} from ${JSON.stringify(source('src/theme.android.ts'))};
import {AppShell} from ${JSON.stringify(source('src/navigation/AppShell.android.tsx'))};
import {setSessionToken} from ${JSON.stringify(source('src/api/client.ts'))};
import {AppAlertHost} from ${JSON.stringify(source('src/components/AppAlert.tsx'))};
if(!localStorage.getItem('ui-initialized')){await setSessionToken(${JSON.stringify(token)});localStorage.setItem('ui-initialized','1')}
function ExposeTheme(){const {setMode}=useTheme();React.useEffect(()=>{window.__setThemeMode=setMode},[setMode]);return null;}
createRoot(document.getElementById('root')).render(<TestFontScaleProvider><ThemeProvider><ExposeTheme/><AppShell/><AppAlertHost/></ThemeProvider></TestFontScaleProvider>);`);
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
  optimizeDeps: { include: ['react-native-web','react-native-safe-area-context'], esbuildOptions: { resolveExtensions: ['.web.tsx','.web.ts','.web.jsx','.web.js','.tsx','.ts','.jsx','.js','.json'] } },
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
  ] }, server: { middlewareMode: true, hmr: false, fs: { allow: [root, directory] } },
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
let browser, page;
const shot = async name => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  const file = path.join(out, name + '.jpg');
  await page.screenshot({ path: file, type: 'jpeg', quality: 78, animations: 'disabled' });
  assert.ok(fs.statSync(file).size <= 500000); screenshots.push(file);
};
const tab = async name => page.getByRole('button', { name: name + '导航', exact: true }).click();

const observations=[];
async function utilityAudit(name){
  const card=page.getByTestId('profile-utilities');await card.scrollIntoViewIfNeeded();await page.waitForTimeout(100);
  const frame=await card.boundingBox();const entries=[];
  for(const label of ['关于考匠','赞助作者']){const button=card.getByRole('button',{name:label,exact:true});const b=await button.boundingBox();const text=await button.getByText(label,{exact:true}).boundingBox();assert.ok(Math.abs((text.y+text.height/2)-(b.y+b.height/2))<=3,label+' vertically centered');assert.ok(text.x>=b.x&&text.x+text.width<=b.x+b.width+1,label+' complete');assert.ok(b.width>=48&&b.height>=48);entries.push({label,width:b.width,height:b.height,centerOffset:(text.y+text.height/2)-(b.y+b.height/2)});}
  assert.ok(frame.height<(name.includes('large')?180:name.includes('320')?145:76),'no empty utility filler');observations.push({name,frame,entries});checks.push(name);await shot(name);
}
async function vipAudit(name,large=false){
  await expect(page.locator('#app-tab-bar')).toHaveCount(0);const footer=page.getByTestId('vip-purchase-footer');const f=await footer.boundingBox();assert.ok(f.height<=(large?230:96),'purchase footer stays compact');
  const cards=page.getByTestId('vip-plans').getByRole('button');assert.equal(await cards.count(),3);
  for(let i=0;i<3;i++){const card=cards.nth(i);const {b,text}=await card.evaluate(element=>{const r=element.getBoundingClientRect();return{b:{x:r.x,y:r.y,width:r.width,height:r.height},text:[...element.querySelectorAll('*')].filter(e=>!e.children.length&&e.textContent.trim()).map(e=>{const a=e.getBoundingClientRect();return{text:e.textContent,left:a.left,right:a.right,top:a.top,bottom:a.bottom}})}});for(const t of text){assert.ok(t.left>=b.x-1&&t.right<=b.x+b.width+1,'complete plan text: '+t.text)}assert.equal(await card.getByText('30 天',{exact:true}).count(),1);}
  const link=page.getByRole('link',{name:'购买会员兑换码',exact:true});const l=await link.boundingBox();assert.ok(l.y>=f.y&&l.y+l.height<=f.y+f.height+1,'purchase action inside footer');observations.push({name,footer:f,planCards:3});checks.push(name);await shot(name);
}
try{
  browser=await launchTestBrowser();const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:1,hasTouch:true,reducedMotion:'reduce'});await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});await expect(page.getByTestId('today-screen')).toBeVisible();
  await tab('我的');assert.equal(await page.getByText('管理中心',{exact:true}).count(),0);await utilityAudit('01-profile-bottom-393');
  await page.getByTestId('profile-utilities').getByRole('button',{name:'关于考匠',exact:true}).click();
  const about=page.getByTestId('android-about-screen');
  await expect(about.getByText('移动端 v'+currentVersion,{exact:true})).toBeVisible();
  await expect(page.locator('#app-tab-bar')).toHaveCount(0);
  await expect(about.getByTestId('about-full-letter')).toHaveCount(0);
  await expect(about.getByTestId('about-font-license')).toHaveCount(0);
  await expect(about.getByText('让学习回到每个人手里',{exact:true})).toBeVisible();
  await shot('10-about-approved-393');
  checks.push('approved About design uses the official vector logo, actual version and collapsed secondary details');
  await about.getByRole('button',{name:'阅读完整寄语',exact:true}).click();
  await expect(about.getByTestId('about-full-letter')).toContainText('暂时无力承担学费');
  await expect(about.getByTestId('about-full-letter')).toContainText('可通过每日签到或会员获取积分');
  await about.getByRole('button',{name:'收起完整寄语',exact:true}).click();
  await about.getByRole('button',{name:'字体与开源许可',exact:true}).click();
  assert.equal((await about.getByTestId('about-font-license').textContent()).replaceAll('\r',''),fs.readFileSync(path.join(mobile,'assets/fonts/OFL-NotoSansSC.txt'),'utf8').replaceAll('\r',''));
  await about.getByRole('button',{name:'字体与开源许可',exact:true}).click();
  await about.getByRole('button',{name:'版本信息',exact:true}).click();await expect(about.getByTestId('about-version-details')).toContainText(currentVersion);await about.getByRole('button',{name:'版本信息',exact:true}).click();
  checks.push('full author letter, verbatim bundled font license and live app version remain accessible');
  async function fits(scope,name){
    await page.evaluate(()=>document.fonts.ready);
    const overflow=await scope.evaluate(el=>{const b=el.getBoundingClientRect();return [...el.querySelectorAll('[dir=auto]')].filter(t=>{const r=t.getBoundingClientRect();return r.width>0&&(r.left<b.left-1||r.right>b.right+1)}).map(t=>t.textContent).slice(0,8)});
    assert.deepEqual(overflow,[],name+' horizontal text fit');await shot(name);
  }
  await page.setViewportSize({width:320,height:740});await fits(about,'11-about-320');
  await page.setViewportSize({width:393,height:852});await page.evaluate(()=>{window.__setFontScale(1.8);window.__setThemeMode('dark')});await page.waitForTimeout(100);await fits(about,'12-about-dark-large-text');
  await page.evaluate(()=>{window.__setFontScale(1);window.__setThemeMode('light')});
  checks.push('About supports 320px and 1.8x Android text in light/dark themes without horizontal clipping');
  await about.getByRole('button',{name:'关于页赞助作者',exact:true}).click();await expect(page.getByText('使用微信扫一扫',{exact:true})).toBeVisible();await page.getByRole('button',{name:'暂时关闭',exact:true}).click();await expect(page.locator('#app-tab-bar').getByRole('button')).toHaveCount(5);
  checks.push('About support action reaches the existing WeChat QR and restores root navigation');
  await page.getByTestId('profile-utilities').getByRole('button',{name:'赞助作者',exact:true}).click();await expect(page.getByText('使用微信扫一扫',{exact:true})).toBeVisible();await page.getByRole('button',{name:'暂时关闭',exact:true}).click();checks.push('sponsor action remains functional');
  await page.setViewportSize({width:320,height:740});await utilityAudit('02-profile-bottom-320');
  await page.setViewportSize({width:393,height:852});await page.evaluate(()=>window.__setFontScale(1.8));await utilityAudit('03-profile-large-text');await page.evaluate(()=>window.__setFontScale(1));
  await page.getByRole('button',{name:/^会员与 AI 积分/}).click();await expect(page.getByRole('heading',{name:'会员与 AI 积分',exact:true})).toBeVisible();await vipAudit('04-vip-393');
  await page.setViewportSize({width:320,height:740});await vipAudit('05-vip-320');
  await page.setViewportSize({width:393,height:852});await page.evaluate(()=>window.__setFontScale(1.8));await vipAudit('06-vip-large-text',true);await page.evaluate(()=>window.__setFontScale(1));
  await page.getByRole('button',{name:'返回我的',exact:true}).click();await expect(page.locator('#app-tab-bar').getByRole('button')).toHaveCount(5);checks.push('membership back restores root navigation');
  store.saveAccountEntitlement(other.id,{plan:'svip',expiresAt:new Date(Date.now()+30*86400000).toISOString()});
  await page.getByRole('button',{name:'签到领积分，进入每日签到页',exact:true}).click();
  const checkin=page.getByTestId('android-check-in-screen');
  await expect(checkin.getByRole('heading',{name:'每日签到',exact:true})).toBeVisible();
  await expect(checkin.getByTestId('check-in-reward')).toHaveText('+66');
  for(const [id,value]of [['free',1],['vip',33],['svip',66],['ssvip',133]])await expect(checkin.getByTestId('check-in-tier-'+id)).toContainText(String(value));
  await expect(checkin.getByTestId('check-in-rules')).toHaveCount(0);
  await checkin.getByRole('button',{name:'签到规则',exact:true}).click();await expect(checkin.getByTestId('check-in-rules')).toContainText('不会重复领取');
  await checkin.getByRole('button',{name:'签到规则',exact:true}).click();await shot('07-check-in-ready-393');
  checks.push('profile opens the reference-matched daily page with actual SVIP reward, all four configured tiers and collapsed rules');
  const beforeClaim=store.points.wallet(other.id).availableUnits;let checkInPosts=0;
  await page.route('**/api/account/check-in',async route=>{if(route.request().method()!=='POST')return route.continue();checkInPosts++;const response=await route.fetch();assert.equal(response.status(),200);await route.abort('failed');});
  await checkin.getByRole('button',{name:'签到领取 66 积分',exact:true}).evaluate(button=>{button.click();button.click();});
  await expect(checkin.getByRole('button',{name:'今日已签到',exact:true})).toBeDisabled();
  await expect(checkin.getByTestId('check-in-balance')).toHaveText(((beforeClaim+66000)/1000).toLocaleString('zh-CN',{maximumFractionDigits:3}));
  assert.equal(checkInPosts,1);assert.equal(store.points.wallet(other.id).availableUnits,beforeClaim+66000);
  assert.equal(store.db.prepare('SELECT count(*) n FROM ai_points_check_ins WHERE user_id=?').get(other.id).n,1);
  await page.unroute('**/api/account/check-in');
  checks.push('double tap plus a lost server acknowledgement recovers the real claimed state, grants exactly once and refreshes balance');
  await checkin.getByRole('button',{name:'查看签到后的积分记录',exact:true}).click();
  const details=page.getByTestId('android-points-details-sheet');await expect(details.getByRole('heading',{name:'积分',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'关闭积分费用与记录',exact:true}).click();await expect(checkin).toBeVisible();
  assert.equal(store.points.wallet(other.id).availableUnits,beforeClaim+66000);
  checks.push('daily check-in opens the same owned points/records screen inside its active native-modal presentation host');
  async function checkInFits(name){const result=await checkin.evaluate(el=>{const b=el.getBoundingClientRect();return [...el.querySelectorAll('[dir=auto]')].filter(t=>{const r=t.getBoundingClientRect();return r.width>0&&(r.left<b.left-1||r.right>b.right+1)}).map(t=>t.textContent).slice(0,8)});assert.deepEqual(result,[],name);await shot(name);}
  await page.setViewportSize({width:320,height:740});await checkInFits('08-check-in-320');
  await page.setViewportSize({width:393,height:852});await page.evaluate(()=>{window.__setFontScale(1.8);window.__setThemeMode('dark')});await page.waitForTimeout(150);await checkInFits('09-check-in-dark-large-text');
  await page.evaluate(()=>{window.__setFontScale(1);window.__setThemeMode('light')});
  checks.push('daily check-in fits 320px, 393px and 1.8x text with actual Android light/dark tokens');
  await checkin.getByRole('button',{name:'关闭每日签到',exact:true}).click();
  await page.route('**/api/account/entitlements',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'synthetic temporary entitlement outage'})}));
  await page.getByRole('button',{name:'签到领积分，进入每日签到页',exact:true}).click();
  await expect(checkin.getByRole('alert')).toContainText('synthetic temporary entitlement outage');
  await expect(checkin.getByTestId('check-in-balance')).toHaveText('—');await expect(checkin.getByTestId('check-in-reward')).toHaveText('—');
  await page.unroute('**/api/account/entitlements');await checkin.getByRole('button',{name:'重试同步签到信息',exact:true}).click();await expect(checkin.getByRole('button',{name:'今日已签到',exact:true})).toBeDisabled();
  await checkin.getByRole('button',{name:'关闭每日签到',exact:true}).click();
  checks.push('offline entitlement data never masquerades as zero points and retry restores authoritative claimed state');
  await page.getByRole('button',{name:/^会员与 AI 积分/}).click();await page.getByRole('button',{name:'已签到',exact:true}).click();await expect(checkin.getByRole('heading',{name:'每日签到',exact:true})).toBeVisible();
  await expect(checkin.getByRole('button',{name:'今日已签到',exact:true})).toBeDisabled();await checkin.getByRole('button',{name:'关闭每日签到',exact:true}).click();await page.getByRole('button',{name:'返回我的',exact:true}).click();
  assert.equal(store.db.prepare('SELECT count(*) n FROM ai_points_check_ins WHERE user_id=?').get(other.id).n,1);
  checks.push('member and profile entries share the daily page and reopening cannot claim twice');
  await tab('错题');
  const wrong=page.getByTestId('android-wrong-screen'),grid=wrong.getByTestId('wrong-knowledge-grid');
  await expect(wrong.getByTestId('wrong-metric-0')).toHaveText('4');await expect(wrong.getByTestId('wrong-metric-1')).toHaveText('2');await expect(wrong.getByTestId('wrong-metric-2')).toHaveText('3');
  await expect(grid.getByRole('button')).toHaveCount(2);await expect(wrong.getByTestId('wrong-due-count')).toHaveText('到期需复习 2 题');
  const rankCards=await grid.getByRole('button').all();const left=await rankCards[0].boundingBox(),right=await rankCards[1].boundingBox();assert.ok(Math.abs(left.y-right.y)<1&&right.x>left.x,'two compact side-by-side knowledge cards');
  const stem=wrong.getByTestId('wrong-question-stem').first();assert.equal(await stem.evaluate(e=>getComputedStyle(e).fontSize),'17px');
  await fits(wrong,'13-wrong-compact-393');
  checks.push('compact Wrong uses owned real API counts, two priority cards and readable 17sp stems');
  await wrong.getByRole('button',{name:'反复出错',exact:true}).click();await expect(wrong.getByTestId('wrong-question-stem')).toHaveCount(2);
  await grid.getByRole('button',{name:/电子表格基础/}).click();await expect(wrong.getByTestId('wrong-question-stem')).toHaveCount(1);await expect(stem).toHaveText(wrongFixtures[1].question);
  await wrong.getByRole('button',{name:'清除知识点筛选',exact:true}).click();await wrong.getByRole('button',{name:'全部错题',exact:true}).click();
  await wrong.getByRole('button',{name:'查看全部 3 个知识点',exact:true}).click();await expect(grid.getByRole('button')).toHaveCount(3);await grid.getByRole('button',{name:/以太网交换/}).click();await expect(stem).toHaveText(wrongFixtures[2].question);
  await wrong.getByRole('button',{name:'清除知识点筛选',exact:true}).click();await wrong.getByRole('button',{name:'收起知识点',exact:true}).click();
  checks.push('repeated errors, knowledge filters, clearing and all knowledge groups preserve real data and sorting');
  const long=wrong.getByTestId('wrong-question-stem').filter({hasText:wrongFixtures[3].question});await long.scrollIntoViewIfNeeded();assert.equal(await long.evaluate(e=>getComputedStyle(e).webkitLineClamp),'none');
  assert.ok((await long.boundingBox()).height>=75,'long actual stems wrap rather than clip');
  await page.setViewportSize({width:320,height:740});await fits(wrong,'14-wrong-320');await page.setViewportSize({width:393,height:852});await page.evaluate(()=>{window.__setFontScale(1.8);window.__setThemeMode('dark')});await page.waitForTimeout(100);await fits(wrong,'15-wrong-dark-large-text');
  await page.evaluate(()=>{window.__setFontScale(1);window.__setThemeMode('light')});
  checks.push('compact Wrong preserves complete long questions and adapts to 320px/large text without reducing font size');
  let wrongOutage=true;
  await page.route('**/api/wrong',route=>wrongOutage?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'synthetic wrong-list outage'})}):route.continue());
  await page.reload({waitUntil:'domcontentloaded'});await tab('错题');await expect(wrong.getByRole('alert')).toBeVisible();await expect(wrong.getByTestId('wrong-metric-0')).toHaveText('—');
  wrongOutage=false;await wrong.getByRole('button',{name:'重新同步错题',exact:true}).click();await expect(wrong.getByTestId('wrong-metric-0')).toHaveText('4');await page.unroute('**/api/wrong');
  checks.push('Wrong API failure exposes retry and unknown counts rather than fake zero statistics');
  await grid.getByRole('button',{name:/电子表格基础/}).click();
  await wrong.getByRole('button',{name:/复习所选知识点/}).click();
  await expect(page.getByRole('heading',{name:'错题复习',exact:true})).toBeVisible();await expect(page.getByText(wrongFixtures[1].question,{exact:true}).last()).toBeVisible();
  checks.push('filtered review CTA reaches the real practice loader with the selected owned question');
  await page.getByRole('button',{name:'返回题库目录',exact:true}).click();await tab('错题');
  await wrong.getByRole('button',{name:'清除知识点筛选',exact:true}).click();
  await wrong.getByRole('button',{name:wrongFixtures[0].question+'，已错3次，进入复习',exact:true}).click();
  await expect(page.getByRole('heading',{name:'错题复习',exact:true})).toBeVisible();await expect(page.getByText(wrongFixtures[0].question,{exact:true}).last()).toBeVisible();
  checks.push('individual question card opens the clicked owned question through the real practice API');
  const beforeInstant=store.allA(other.id).length;
  await page.getByRole('radio',{name:'B：选项二',exact:true}).click();holdAnswer=true;
  const immediateStart=Date.now();await page.getByRole('button',{name:'确认答案',exact:true}).evaluate(button=>{button.click();button.click();});
  await expect(page.getByText('再想一想',{exact:true})).toBeVisible({timeout:1000});
  const immediateMs=Date.now()-immediateStart;assert.ok(immediateMs<1000,'feedback before the held HTTP acknowledgement');
  await expect(page.getByRole('button',{name:'下一题',exact:true})).toBeEnabled();
  await page.waitForFunction(()=>!!document.querySelector('[data-testid="practice-record-sync"]'));
  await page.getByRole('button',{name:'下一题',exact:true}).click();await expect(page.getByText(wrongFixtures[1].question,{exact:true}).last()).toBeVisible();
  await page.getByRole('radio',{name:'B：选项二',exact:true}).click();await page.getByRole('button',{name:'确认答案',exact:true}).click();await expect(page.getByText('再想一想',{exact:true})).toBeVisible();
  await expect.poll(()=>typeof releaseAnswer).toBe('function');
  assert.equal(store.allA(other.id).length,beforeInstant+1,'only the first queued record is in transport; double tap does not duplicate it');
  await page.getByRole('button',{name:'返回题库目录',exact:true}).click();assert.equal(typeof releaseAnswer,'function');releaseAnswer();
  await expect.poll(()=>store.allA(other.id).length).toBe(beforeInstant+2);
  checks.push('instant prefetched feedback in '+immediateMs+'ms before a deliberately withheld acknowledgement; next/exit remain responsive and both queued answers sync exactly once');
  const debtOp=store.points.begin({userId:other.id,requestKey:'ui-negative-balance',signature:'synthetic-negative-balance',feature:'explanation'}).operation;
  const debtCall=store.points.reserveCall(debtOp.id,{settings:{baseUrl:'https://api.deepseek.com',model:'deepseek-flash'},inputLimit:2000,outputLimit:100000});
  store.points.finishCall(debtCall.id,{success:true,usage:{hasUsage:true,prompt_tokens:1000,completion_tokens:100000,total_tokens:101000,cached_prompt_tokens:0}});store.points.finish(debtOp.id,{success:true,result:{text:'synthetic measured explanation'}});
  const negative=store.points.wallet(other.id);assert.ok(negative.availableUnits<0);await tab('我的');await page.getByRole('button',{name:'查看可用AI积分、服务费用和积分记录',exact:true}).click();
  await page.getByRole('button',{name:'刷新积分余额和使用记录',exact:true}).click();await expect(page.getByTestId('points-debt-notice')).toBeVisible();await expect(page.getByTestId('android-points-balance').getByText((negative.availableUnits/negative.scale).toLocaleString('zh-CN',{maximumFractionDigits:3}),{exact:true})).toBeVisible();
  await shot('16-negative-wallet');await page.getByRole('button',{name:'关闭积分费用与记录',exact:true}).click();
  checks.push('the actual settled negative wallet is displayed without clamping and explains credit-first debt repayment');
  assert.deepEqual(errors,[]);assert.deepEqual(sourceHashes(),testedSources);fs.writeFileSync(path.join(out,'layout-metrics.json'),JSON.stringify({observations,checks},null,2));
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
console.log('Profile/member layout checks: ' + checks.length + '; screenshots: ' + screenshots.length + '; synthetic AI requests: ' + aiRequests);
