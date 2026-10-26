// Android-only components + real shared request layer + real local points store.
// Model responses are explicit synthetic fixtures; no upstream request is made.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import express from 'express';import react from '@vitejs/plugin-react';import {createServer} from 'vite';import {expect as baseExpect} from '@playwright/test';
const expect=baseExpect.configure({timeout:15000});
import {createStore} from '../server/store.js';import {createPointsStore} from '../server/ai-points/store.js';import {createApp} from '../server/index.js';import {aiOutputBudget} from '../server/ai-output-policy.js';import {launchTestBrowser} from './helpers/browser.js';
const root=process.cwd(),mobile=path.join(root,'mobile'),parent=path.resolve('tmp'),dir=fs.mkdtempSync(path.join(parent,'points-flow-browser-'));
const out=path.resolve('tmp/android-points-ux-20261024/browser');fs.mkdirSync(out,{recursive:true});const store=createStore(path.join(dir,'data'));
// Freeze this UI receipt fixture at a verified peak rate; the HTTP billing tests cover time-band changes.
store.points=createPointsStore(store.db,{now:()=>Date.parse('2026-10-26T03:00:00Z')});
const users=[store.register('flow_browser_one','fixture-password-123'),store.register('flow_browser_two','fixture-password-123')];
for(const user of users)store.selectCertificate(user.id,'network-engineer');
const settings={baseUrl:'https://api.deepseek.com',model:'deepseek-flash',keyCipher:'SYNTHETIC-UNUSED-KEY'};
store.aiServices.policy=()=>({managed:true});store.aiServices.channels=()=>[{...settings,id:'flash',name:'Flash 验收接口',priority:1,enabled:true}];
store.points.recordFinance({key:'synthetic-income',kind:'revenue',amountMicros:1000000000,reference:'synthetic flow fixture, no real payment',createdBy:users[0].id});
store.points.grant({userId:users[0].id,sourceKey:'synthetic-grant',units:1000000,kind:'test',requireFunded:true});
const backend=await createApp({store,withFrontend:false,authRequired:true,accountSecurity:{enabled:false}}),tokens=users.map(user=>store.createAuthSession(user.id));
const entry=path.join(dir,'harness');fs.mkdirSync(entry);const write=(name,text)=>fs.writeFileSync(path.join(entry,name),text);
const source=file=>'/@fs/'+path.join(mobile,file).replaceAll('\\','/');
write('index.html','<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{height:100%;margin:0}button{min-height:48px}</style><div id="root"></div><script type="module" src="/main.tsx"></script>');
write('storage.ts','export default {async getItem(k){return localStorage.getItem(k)},async setItem(k,v){localStorage.setItem(k,v)},async removeItem(k){localStorage.removeItem(k)},async multiRemove(ks){ks.forEach(k=>localStorage.removeItem(k))}}');
write('stream.ts','export const fetch=(...args)=>globalThis.fetch(...args)');
write('audio.ts','export async function prepareUiSounds(){} export function setUiSoundSettings(){} export function playUiSound(){} export function previewUiSound(){}');
write('subjective.tsx','export function SubjectiveStudyScreen(){return null}');
write('alert.tsx','export const AppAlert={alert(){}};export function AppAlertHost(){return null}');
write('native.ts',"export*from'react-native-web';import{Platform}from'react-native-web';Platform.OS='android';export const ToastAndroid={LONG:1,SHORT:0,show(){}};");
const profiles=users.map(user=>({id:user.id,username:user.username,certificateId:'network-engineer'}));
write('main.tsx',`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ThemeProvider,useTheme}from ${JSON.stringify(source('src/theme.ts'))};import{AndroidPointsBar}from ${JSON.stringify(source('src/components/AndroidPointsBar.android.tsx'))};import{TeacherSheet}from ${JSON.stringify(source('src/screens/subjective-study/TeacherSheet.android.tsx'))};import{mobileApi,setSessionToken}from ${JSON.stringify(source('src/api/client.ts'))};
function Harness(){const[user,setUser]=useState(${JSON.stringify(profiles[0])}),[result,setResult]=useState(''),[teacher,setTeacher]=useState(false),{setMode}=useTheme();const run=async(fn)=>{try{await fn();setResult('请求已完成')}catch(e){setResult(e.message)}};return <div style={{height:'100%',display:'flex',flexDirection:'column'}}><div><button onClick={()=>setMode('dark')}>深色验收</button><button onClick={()=>setMode('light')}>浅色验收</button><button onClick={async()=>{await setSessionToken(${JSON.stringify(tokens[1])});setUser(${JSON.stringify(profiles[1])})}}>切换测试账号</button></div><AndroidPointsBar key={user.id} userId={user.id} certificateId={user.certificateId} appActive={true}/><div style={{overflow:'auto',flex:1}}><button onClick={()=>run(()=>mobileApi.teacher('fixture','详细讲解',[]))}>测试题目讲解</button><button onClick={()=>run(()=>mobileApi.trainStream('fixture',3,()=>{}))}>测试流式出题</button><button onClick={()=>run(()=>mobileApi.createAiQuestionGeneration({count:3,chapter:'合成章节',knowledgePoint:'合成知识点'}))}>测试后台出题</button><button onClick={()=>setTeacher(true)}>打开老师答疑</button><p role="status">{result}</p></div><TeacherSheet open={teacher} active={true} nodeId="synthetic-node" nodeTitle="合成验收知识点" context={null} onClose={()=>setTeacher(false)} onFailure={()=>false}/></div>};await setSessionToken(${JSON.stringify(tokens[0])});createRoot(document.getElementById('root')).render(<ThemeProvider><Harness/></ThemeProvider>);`);
const vite=await createServer({configFile:false,root:entry,plugins:[react()],logLevel:'error',define:{'process.env.EXPO_PUBLIC_API_URL':'""',global:'globalThis'},optimizeDeps: { include: ['react-native-web','react-native-safe-area-context'], esbuildOptions: { resolveExtensions: ['.web.tsx','.web.ts','.web.jsx','.web.js','.tsx','.ts','.jsx','.js','.json'] } },
  resolve:{extensions:['.web.tsx','.web.ts','.web.jsx','.web.js','.tsx','.ts','.jsx','.js','.json'],dedupe:['react','react-dom'],alias:[
    {find:/^react-native$/,replacement:path.join(entry,'native.ts')},{find:/^react-native-web$/,replacement:path.join(mobile,'node_modules/react-native-web')},
    {find:/^react$/,replacement:path.join(mobile,'node_modules/react')},{find:/^react-dom(\/.*)?$/,replacement:path.join(mobile,'node_modules/react-dom')+'$1'},
    {find:'@react-native-async-storage/async-storage',replacement:path.join(entry,'storage.ts')},{find:'expo/fetch',replacement:path.join(entry,'stream.ts')},
    {find:/^\.\.?\/audioFeedback$/,replacement:path.join(entry,'audio.ts')},{find:/^\.\/?subjective-study\/SubjectiveStudyScreen$/,replacement:path.join(entry,'subjective.tsx')},
    {find:/^\.\.?\/components\/AppAlert$/,replacement:path.join(entry,'alert.tsx')},
  ]},server:{middlewareMode:true,hmr:false,fs:{allow:[root,dir]}}});
const app=express();app.use(express.json());let mode='ok',paidRequests=0,streamRequests=0,pendingJob;
const caller=req=>{const index=tokens.indexOf(String(req.headers.authorization||'').replace(/^Bearer /,''));assert.ok(index>=0);return users[index];};
function begin(req,taskType,key){const user=caller(req),nonce=req.headers['x-ai-request-id'];assert.match(nonce,/^[a-f0-9-]{36}$/);
  const operation=store.points.begin({userId:user.id,requestKey:key||`http:${nonce}:POST ${req.path}:0`,signature:store.points.signature(req.body),feature:'POST '+req.path}).operation;
  const call=store.points.reserveCall(operation.id,{settings,inputLimit:1000,outputLimit:aiOutputBudget({taskType,outputItemCount:3}).maxTokens,taskType});
  return {user,operation,call};}
function finish(item,success=true){store.points.finishCall(item.call.id,{success:true,usage:{hasUsage:true,prompt_tokens:100,completion_tokens:50,total_tokens:150}});store.points.finish(item.operation.id,{success,result:{synthetic:true},error:success?null:'synthetic review rejection'});}
app.post('/api/ai/teacher',(req,res)=>{paidRequests++;if(mode==='cache')return res.json({text:'合成缓存讲解',cached:true});const item=begin(req,'question-explanation');finish(item,mode!=='fail');if(mode==='fail')return res.status(503).json({error:'合成任务失败，已退款'});
  store.points.grant({userId:item.user.id,sourceKey:'concurrent-gift:'+item.operation.id,units:50000,kind:'test',requireFunded:true});res.json({text:'合成已计费讲解'});});
app.post('/api/ai/train/stream',(req,res)=>{streamRequests++;const item=begin(req,'question-generation');finish(item);res.type('text/event-stream').end('data: {"type":"done","result":{"questions":[],"cached":false}}\n\n');});
app.post('/api/ai/questions/generations',(req,res)=>{const jobId=crypto.randomUUID();pendingJob=begin(req,'question-generation','question-job:'+jobId);res.json({job:{id:jobId,status:'queued'}});});
app.get('/api/study/teacher/history',(_req,res)=>res.json({messages:[]}));
app.post('/api/study/teacher',(req,res)=>{const item=begin(req,'study-teacher');finish(item);res.json({answer:{conclusion:'合成老师答疑结果',points:[],example:''},cached:false});});
app.use((req,res,next)=>req.path.startsWith('/api/')?backend(req,res,next):next());app.use(vite.middlewares);
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`,checks=[],errors=[];
let browser,page;const confirm=async()=>{await expect(page.getByTestId('android-ai-confirm-sheet')).toBeVisible();await page.getByRole('button',{name:'继续使用AI，按实际用量结算',exact:true}).click();};
const message=pattern=>page.getByTestId('android-global-points').getByText(pattern);
async function shot(name){await page.waitForTimeout(400);const file=path.join(out,name+'.png');await page.screenshot({path:file});assert.ok(fs.statSync(file).size<=500000);}
try{
  browser=await launchTestBrowser();const context=await browser.newContext({viewport:{width:375,height:812},reducedMotion:'reduce'});
  await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
  page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
  await expect(page.getByText('可用积分 1,000',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'测试题目讲解',exact:true}).click();await expect(page.getByTestId('android-ai-confirm-sheet')).toBeVisible();
  assert.equal(paidRequests,0);await shot('confirm-light-375');await page.getByRole('button',{name:'取消本次AI请求',exact:true}).click();assert.equal(paidRequests,0);
  checks.push('confirmation is visible before transport; cancel sends no model request');
  await page.getByRole('button',{name:'测试题目讲解',exact:true}).click();await confirm();await expect(message(/实扣 0.24 积分/)).toBeVisible();
  assert.equal(paidRequests,1);await expect(page.getByText('可用积分 1,049.76',{exact:true})).toBeVisible();
  checks.push('exact receipt shows 0.24 points despite a concurrent 50-point gift');
  mode='cache';await page.getByRole('button',{name:'测试题目讲解',exact:true}).click();await confirm();await expect(message(/本次 0 积分/)).toBeVisible();
  checks.push('cached response is explicitly shown as zero, not charged at its sample price');
  mode='fail';await page.getByRole('button',{name:'测试题目讲解',exact:true}).click();await confirm();await expect(message(/已退回 3.68 积分/)).toBeVisible();
  checks.push('server-confirmed failed operation returns its whole reservation');
  await page.getByRole('button',{name:'测试流式出题',exact:true}).click();assert.equal(streamRequests,0);await confirm();await expect(message(/AI 出题：实扣 0.24/)).toBeVisible();assert.equal(streamRequests,1);
  checks.push('SSE generation uses the same confirmation and receipt flow');
  await page.getByRole('button',{name:'测试后台出题',exact:true}).click();await confirm();await expect(message(/AI 出题：预扣/)).toBeVisible();
  finish(pendingJob);await expect(message(/AI 出题：实扣 0.24/)).toBeVisible({timeout:15000});
  checks.push('background generation keeps polling its own job receipt until actual settlement');
  await page.getByRole('button',{name:'打开老师答疑',exact:true}).click();await expect(page.getByTestId('android-inline-points')).toBeVisible();
  await page.getByRole('textbox',{name:'向 AI 老师提问',exact:true}).fill('合成提问：为什么这样处理？');await page.getByRole('button',{name:'发送问题',exact:true}).click();await confirm();
  await expect(page.getByText('合成老师答疑结果',{exact:true})).toBeVisible();await expect(page.getByTestId('android-inline-points').getByText(/AI 老师答疑：实扣 0.24/)).toBeVisible();
  checks.push('teacher modal has its own readable points entry and exact result feedback');
  await page.getByRole('button',{name:'收起',exact:true}).click();await page.getByRole('button',{name:'查看积分费用与记录',exact:true}).click();
  await expect(page.getByRole('heading',{name:'积分费用与记录',exact:true})).toBeVisible();await expect(page.getByText('积分使用记录',{exact:true})).toBeVisible();
  await shot('ledger-light-375');await page.getByRole('button',{name:'关闭积分费用与记录',exact:true}).click();
  await page.getByRole('button',{name:'深色验收',exact:true}).click();await page.getByRole('button',{name:'测试题目讲解',exact:true}).click();await expect(page.getByTestId('android-ai-confirm-sheet')).toBeVisible();await shot('confirm-dark-375');
  await page.setViewportSize({width:812,height:375});await expect(page.getByRole('button',{name:'继续使用AI，按实际用量结算',exact:true})).toBeInViewport();
  await page.getByRole('button',{name:'取消本次AI请求',exact:true}).click();await page.setViewportSize({width:375,height:812});
  checks.push('fee and record entry is one tap away, with light/dark and landscape confirmation controls');
  await page.getByRole('button',{name:'切换测试账号',exact:true}).click();await expect(page.getByText('可用积分 0',{exact:true})).toBeVisible();
  mode='cache';await page.getByRole('button',{name:'测试题目讲解',exact:true}).click();await confirm();await expect(message(/本次 0 积分/)).toBeVisible();
  checks.push('account switching clears old wallet data and zero balance still permits a free cached result');
  assert.deepEqual(errors,[]);assert.equal(store.points.audit().passed,true);
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,checks,errors,realUpstreamRequests:0,nativeRuntime:'browser harness, not physical device'},null,2));console.log('Android points full-flow browser acceptance passed: '+checks.length+' checks');
}catch(error){if(page){await shot('failure').catch(()=>{});fs.writeFileSync(path.join(out,'failure.txt'),await page.locator('body').innerText().catch(()=>''));}console.error(errors.slice(0,4).join('\n'));throw error;}
finally{await browser?.close();await vite.close();await backend.locals.stop();await new Promise(resolve=>server.close(resolve));store.db.close();assert.equal(path.dirname(dir),parent);assert.ok(path.basename(dir).startsWith('points-flow-browser-'));fs.rmSync(dir,{recursive:true,force:true});}
