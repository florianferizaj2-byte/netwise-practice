import {createServer as createHttpServer} from 'node:http';
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
const out = path.resolve('test-output/ai-learning');
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
const backend = await createApp({ store, provider:fixture.provider, aiLearning:{questions:()=>[...fixture.questions(),...store.allQ().filter(q=>q.id.startsWith('android-ui-question-')||q.id.startsWith('ai-learning-'))],tickMs:50}, withFrontend: false, authRequired: true, accountSecurity: { enabled: false }, announcementFile: path.join(directory, 'no-announcement.json') });
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
write('answer-feedback.ts', `import{configurePracticeVoice}from'./practice-voice';let settings=null;export async function prepareAnswerFeedback(){} export function configureAnswerFeedback(s){settings=s;window.__answerFeedbackSettings=s;configurePracticeVoice(s)} export function stopAnswerFeedback(){} export function previewAnswerSound(current){if(!current||current())window.__builtinAuditions=(window.__builtinAuditions||0)+1} export function playCorrectAnswerFeedback(correct){if(!correct||!settings)return;window.__answerFeedbackEvents??=[];window.__answerFeedbackEvents.push({...settings})}`);
// Only device storage/player APIs are fixtures. Catalog, manifests and complete asset
// bytes are fetched from the real local backend and verified before being usable.
write('practice-voice.ts', `import{createVoiceEngine}from'${source('src/practiceVoiceEngine.ts')}';import{mobileApi,API_BASE_URL}from'${source('src/api/client.ts')}';import{DEFAULT_ANSWER_FEEDBACK}from'${source('src/answerFeedbackSettings.ts')}';let settings=DEFAULT_ANSWER_FEEDBACK;
const prefix='voice-ui-pack:',assets='voice-ui-asset:';const read=async id=>JSON.parse(localStorage.getItem(prefix+id)||'null');
const engine=createVoiceEngine({catalog:()=>mobileApi.voicePacks(),manifest:id=>mobileApi.voicePackManifest(id),read,save:async pack=>{localStorage.setItem(prefix+pack.id,JSON.stringify(pack))},list:async()=>{const rows=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith(prefix)){const p=JSON.parse(localStorage.getItem(key));rows.push({id:p.id,name:p.name,revision:p.revision,bytes:p.assets.reduce((s,a)=>s+a.bytes,0)})}}return rows},remove:async id=>localStorage.removeItem(prefix+id),prepare:async(a,download,signal)=>{
 if(download){window.__voiceAssetRequests=(window.__voiceAssetRequests||0)+1;const response=await fetch(new URL(a.url,API_BASE_URL),{signal});if(!response.ok)throw Error('audio download failed');const data=new Uint8Array(await response.arrayBuffer());const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(b=>b.toString(16).padStart(2,'0')).join('');if(hash!==a.sha256||data.length!==a.bytes)throw Error('audio integrity failed');localStorage.setItem(assets+a.id,hash)}
 if(localStorage.getItem(assets+a.id)!==a.sha256)throw Error('local audio missing');let released=false;return{ready:()=>!released,play:(volume,max,current)=>{if(released||!current())return false;window.__voicePlayback??=[];window.__voicePlayback.push({id:a.id,volume});return true},stop(){},release(){released=true}}},settings:()=>settings,active:()=>true,now:Date.now,random:()=>0});
export const practiceVoice={...engine,enter(scope,current){if(current&&!current())return false;window.__practiceVoiceEntries??=[];window.__practiceVoiceEntries.push(scope);return engine.enter(scope,current)}};export function configurePracticeVoice(next){settings=next;engine.select(next.voicePackId)}`);
write('status.tsx', 'export function StatusBar(){return null}');
write('native.ts', `export*from'react-native-web';import React from'react';import{PanResponder as requirePanResponder,Platform,StyleSheet,Text as BaseText,TextInput as BaseInput,useWindowDimensions as baseDimensions}from'react-native-web';Platform.OS='android';
const Scale=React.createContext(1);export function TestFontScaleProvider({children}){const [scale,setScale]=React.useState(1);React.useLayoutEffect(()=>{window.__setFontScale=setScale},[]);return React.createElement(Scale.Provider,{value:scale},children)}
const scaled=(style,scale)=>{const s=StyleSheet.flatten(style)||{};return[style,typeof s.fontSize==='number'?{fontSize:s.fontSize*scale}:null,typeof s.lineHeight==='number'?{lineHeight:s.lineHeight*scale}:null]};
export const Text=React.forwardRef((props,ref)=>React.createElement(BaseText,{...props,ref,style:scaled(props.style,React.useContext(Scale))}));export const TextInput=React.forwardRef((props,ref)=>React.createElement(BaseInput,{...props,ref,style:scaled(props.style,React.useContext(Scale))}));export const useWindowDimensions=()=>({...baseDimensions(),fontScale:React.useContext(Scale)});
export const PanResponder={...requirePanResponder,create(config){const wrapped={};for(const [key,fn]of Object.entries(config))wrapped[key]=(e,g)=>{const r=fn(e,g);window.__swipeDebug??=[];window.__swipeDebug.push({key,result:r,dx:g?.dx,dy:g?.dy,x0:g?.x0,touches:g?.numberActiveTouches,pageX:e?.nativeEvent?.pageX});return r};return requirePanResponder.create(wrapped)}};export const ToastAndroid={LONG:1,SHORT:0,show(){}};export const PermissionsAndroid={PERMISSIONS:{},RESULTS:{GRANTED:'granted'},async check(){return true},async request(){return'granted'}};`);
write('picker.ts', 'export async function launchImageLibraryAsync(){return {canceled:true,assets:[]}};export async function requestMediaLibraryPermissionsAsync(){return {granted:true}};');
write('file-system.ts', 'export const cacheDirectory=null,documentDirectory=null;export async function getInfoAsync(){return {exists:false}};export async function deleteAsync(){};');
write('intent.ts', 'export async function startActivityAsync(){};');
write('native-route.ts', 'export function routePlayerAvailable(){return true} export async function updateRoutePlayerIdentity(){} export async function openRoutePlayer(){throw Error("Native entry is not part of browser acceptance")};');
write('main.tsx', `import React from 'react';import {createRoot} from 'react-dom/client';import{TestFontScaleProvider}from'./native';
import {ThemeProvider,useTheme} from ${JSON.stringify(source('src/theme.android.ts'))};
import {AppShell} from ${JSON.stringify(source('src/navigation/AppShell.android.tsx'))};
import {setSessionToken} from ${JSON.stringify(source('src/api/client.ts'))};
import {AppAlertHost} from ${JSON.stringify(source('src/components/AppAlert.tsx'))};
if(!localStorage.getItem('ui-initialized')){await setSessionToken(${JSON.stringify(token)});localStorage.setItem('ui-initialized','1')}
window.__switchSession=async t=>{await setSessionToken(t)};function ThemeProbe(){const{setMode}=useTheme();React.useLayoutEffect(()=>{window.__setAndroidTheme=setMode},[setMode]);return null}
createRoot(document.getElementById('root')).render(<TestFontScaleProvider><ThemeProvider><ThemeProbe/><AppShell/><AppAlertHost/></ThemeProvider></TestFontScaleProvider>);`);
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
const app = express(); app.use(express.json());
const server=createHttpServer(app);
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
    { find: /^\.\.?\/answerFeedback$/, replacement: path.join(entry, 'answer-feedback.ts') },
    { find: /^\.\.?\/practiceVoice$/, replacement: path.join(entry,'practice-voice.ts') },
    { find: /^\.\.\/\.\.\/modules\/route-player\/index\.android$/, replacement: path.join(entry, 'native-route.ts') },
  ] }, server: { middlewareMode: true, hmr: {server}, fs: { allow: [root, directory] } },
});
app.use((req,res,next)=>{req.headers['x-app-platform']='android';next();});
let aiRequests = 0, forceWalletExpired = false, forceWalletError=false;
app.post('/api/ai-learning/jobs',(req,res,next)=>forceWalletError?res.status(402).json({error:'积分余额不足，请先补充积分。',code:'POINTS_INSUFFICIENT'}):next());
app.use('/api/ai', (req, res, next) => { if(req.method==='GET')return next(); aiRequests++; res.status(503).json({ error: 'Synthetic UI test: no model call' }); });
app.get('/api/account/points/wallet', (_req, res, next) => forceWalletExpired ? res.status(401).json({ error: 'Synthetic session expiry' }) : next());
app.use((req, res, next) => (req.path.startsWith('/api/')||req.path.startsWith('/voice-packs/assets/')) ? backend(req, res, next) : next());
app.use(vite.middlewares);
server.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`, checks = [], errors = [], screenshots = [];
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
  browser=await launchTestBrowser();page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:1});
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto(base,{waitUntil:"networkidle"});
  await expect(page.getByRole("button",{name:"AI 生成导航",exact:true})).toBeVisible({timeout:20000});
  const nav=await page.locator("#app-tab-bar [role=button]").allTextContents();
  assert.equal(nav.length,5);assert.match(nav[2],/AI 生成/);
  await tab("AI 生成");
  await expect(page.getByText("近30天学习画像",{exact:true})).toBeVisible();
  for(const name of ["攻克不会的","挑战更难的","巩固易忘的","综合提分"])await expect(page.getByRole("radio",{name,exact:true})).toBeAttached();
  await expect(page.getByRole("button",{name:"查看专属方案",exact:true})).toBeVisible();
  await shot("01-home");
  await page.getByRole("button",{name:"查看分析依据",exact:true}).click();
  await expect(page.getByText("你该练什么，",{exact:false})).toBeVisible();
  await shot("02-analysis");await page.getByRole("button",{name:"返回",exact:true}).click();
  await page.getByRole("button",{name:/^本次练习 /}).click();await shot("03-settings");
  await page.getByRole("button",{name:"保存设置",exact:true}).click();
  await page.getByRole("button",{name:"查看专属方案",exact:true}).click();
  await expect(page.getByText("积分使用确认",{exact:true})).toBeVisible();
  assert.equal(fixture.generated,0);await shot("04-plan");
  await page.getByRole("button",{name:"返回",exact:true}).click();
  checks.push("center navigation and separate home, evidence, settings and non-billed plan preview");

  await tab("考试");await page.getByRole("tab",{name:"AI 个性化",exact:true}).click();
  await page.getByRole("button",{name:/^考试设置 /}).click();
  await page.getByRole("radio",{name:"10题",exact:true}).click();await page.getByRole("button",{name:"保存设置",exact:true}).click();
  await shot("05-ai-exam-setup");
  await page.getByRole("button",{name:"查看组卷方案",exact:true}).click();
  await expect(page.getByRole("button",{name:"确认方案，开始生成",exact:true})).toBeEnabled();
  await page.getByRole("button",{name:"确认方案，开始生成",exact:true}).click();
  await expect(page.getByRole("button",{name:"开始作答",exact:true})).toBeEnabled({timeout:20000});
  await shot("06-monitor");
  let current=(await request("/ai-learning/jobs")).jobs.find(j=>j.kind==="exam");
  let state=await request("/ai-learning/jobs/"+current.id);
  assert.ok(state.readyCount>=3&&state.readyCount<10);
  assert.ok(state.questions.every(q=>q.answer===undefined&&q.analysis===undefined));
  const firstId=state.questions[0].id;
  let releaseOldSnapshot,capturedOldSnapshot;
  const oldGate=new Promise(resolve=>{releaseOldSnapshot=resolve;}),captured=new Promise(resolve=>{capturedOldSnapshot=resolve;});
  let intercepted=false;
  const snapshotPattern=/\/api\/ai-learning\/jobs\/[^/]+$/;
  await page.route(snapshotPattern,async route=>{
    if(route.request().method()==="GET"&&!intercepted){
      intercepted=true;const response=await route.fetch();capturedOldSnapshot();await oldGate;await route.fulfill({response});
    }else await route.continue();
  });
  await Promise.race([captured,new Promise((_,reject)=>setTimeout(()=>reject(Error("snapshot poll was not observed")),10000))]);
  await page.getByRole("button",{name:"开始作答",exact:true}).click();
  await expect(page.getByText("AI 个性化考试",{exact:true})).toBeVisible();
  releaseOldSnapshot();await page.waitForTimeout(500);await page.unroute(snapshotPattern);
  await expect(page.getByText("AI 个性化考试",{exact:true})).toBeVisible();
  checks.push("late pre-start snapshots cannot revert the active answer session");
  for(let i=0;i<4;i++){
    await expect(page.getByRole("radio").first()).toBeVisible({timeout:15000});
    await page.getByRole("radio").nth(i===1?1:0).click();
    await expect(page.getByText("当前作答已同步",{exact:true})).toBeVisible({timeout:10000});
    if(i===0)await shot("07-answer");
    await page.getByRole("button",{name:"下一题",exact:true}).click();
  }
  await expect(page.getByText("下一题正在准备中",{exact:true})).toBeVisible();
  await expect(page.getByText("服务器已暂停计时",{exact:true})).toBeVisible({timeout:12000});
  await shot("08-waiting");
  state=await request("/ai-learning/jobs/"+current.id);assert.equal(state.waiting,true);
  await page.getByRole("button",{name:"答题卡",exact:true}).click();await shot("09-answer-card");
  await page.getByRole("button",{name:"关闭",exact:true}).click();
  checks.push("first reviewed group is answerable before completion; real waiting pauses server exam time; pending answer card");

  await page.getByRole("button",{name:"回看已就绪题目",exact:true}).click();
  await page.context().setOffline(true);await page.getByRole("radio").nth(1).click();
  await expect(page.getByText("本机暂存，待同步",{exact:true})).toBeVisible({timeout:12000});
  await shot("10-pending-sync");
  const drafts=await page.evaluate(()=>Object.entries(localStorage).filter(([key])=>key.startsWith("kaojiang-ai-learning-draft:")));
  assert.ok(drafts.some(([,value])=>Object.keys(JSON.parse(value).answers).length>0));
  fixture.release();
  for(let i=0;i<200;i++){state=await request("/ai-learning/jobs/"+current.id);if(state.readyCount===10)break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(state.readyCount,10);assert.equal(state.questions[0].id,firstId);
  await page.context().setOffline(false);await page.reload({waitUntil:"networkidle"});
  await tab("考试");await page.getByRole("tab",{name:"AI 个性化",exact:true}).click();
  await expect(page.getByText("AI 个性化考试",{exact:true})).toBeVisible({timeout:20000});
  await expect(page.getByText("当前作答已同步",{exact:true})).toBeVisible({timeout:15000});
  state=await request("/ai-learning/jobs/"+current.id);assert.equal(Object.keys(state.answers).length,4);
  assert.deepEqual(state.answers[state.questions[3].id],["B"]);assert.ok(fixture.reviews>=10);
  checks.push("offline answer delta persists while server generates remaining questions; reload restores confirmed answers");

  await page.getByRole("button",{name:"答题卡",exact:true}).click();
  await page.getByRole("button",{name:"核对并交卷",exact:true}).click();
  await page.getByRole("button",{name:"确认交卷",exact:true}).click();
  await expect(page.getByText("本次成绩",{exact:true})).toBeVisible({timeout:15000});await shot("11-result");
  state=await request("/ai-learning/jobs/"+current.id);assert.equal(state.submitted,true);assert.equal(state.result.maxScore,10);assert.equal(state.result.partial,false);
  await page.getByRole("button",{name:"查看逐题解析",exact:true}).click();await shot("12-review");
  await page.getByRole("tab",{name:/^错题 /}).click();await expect(page.getByText("需要巩固",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"返回",exact:true}).click();await page.getByRole("button",{name:"返回",exact:true}).click();
  await page.getByRole("button",{name:"记录",exact:true}).click();
  await expect(page.getByText("已完成",{exact:true})).toBeVisible();await shot("13-history");
  await page.getByRole("tab",{name:"专属练习",exact:true}).click();
  await expect(page.getByText("还没有生成记录",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"返回",exact:true}).click();
  checks.push("full submission reveals score and separate explanations; history filters practice and exam by owner");

  await tab("AI 生成");fixture.reject();
  await page.getByRole("button",{name:"查看专属方案",exact:true}).click();
  await page.getByRole("button",{name:"确认方案，开始生成",exact:true}).click();
  await expect(page.getByText("后续题目暂未交付",{exact:true})).toBeVisible({timeout:30000});await shot("14-quality-blocked");
  const failed=(await request("/ai-learning/jobs")).jobs.find(j=>j.kind==="practice");
  const failedState=await request("/ai-learning/jobs/"+failed.id);assert.equal(failedState.readyCount,0);assert.equal(failedState.retryable,false);
  await page.getByRole("button",{name:"返回",exact:true}).click();forceWalletError=true;
  await page.getByRole("button",{name:"查看专属方案",exact:true}).click();
  await page.getByRole("button",{name:"确认方案，开始生成",exact:true}).click();
  await expect(page.getByText("积分准备好，再继续",{exact:true})).toBeVisible();await shot("15-wallet");
  await page.getByRole("button",{name:"关闭",exact:true}).click();forceWalletError=false;
  checks.push("quality failures retain checkpoints and bounded retry budget; insufficient points opens a non-fabricated wallet sheet");

  const empty=store.register("ai_cold_start","fixture-password-123");completeFixtureProfile(store,empty);store.selectCertificate(empty.id,"network-engineer");
  const emptyToken=store.createAuthSession(empty.id);
  await page.evaluate(async t=>window.__switchSession(t),emptyToken);await page.reload({waitUntil:"networkidle"});
  await tab("AI 生成");await expect(page.getByText("学习画像待建立",{exact:true})).toBeVisible({timeout:15000});
  await shot("16-cold-start");
  await page.setViewportSize({width:320,height:740});await page.evaluate(()=>window.__setFontScale(1.35));
  await expect(page.getByRole("button",{name:"查看诊断方案",exact:true})).toBeVisible();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  await shot("17-small-large-font");
  await page.setViewportSize({width:393,height:852});await page.evaluate(()=>{window.__setFontScale(1);window.__setAndroidTheme("dark");});
  await shot("18-dark");
  assert.equal(store.points.wallet(user.id).heldUnits,0);assert.equal(store.points.audit().passed,true);
  assert.deepEqual(errors,[]);assert.deepEqual(sourceHashes(),testedSources);
  checks.push("honest empty evidence, 320dp large-font layout, dark theme, no browser errors, intact financial ledger");
  fs.writeFileSync(path.join(out,"report.json"),JSON.stringify({passed:true,checks,screenshots,errors,syntheticModel:true,nativeDeviceAcceptance:false},null,2));
  console.log(JSON.stringify({passed:true,checks,screenshotCount:screenshots.length},null,2));
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
