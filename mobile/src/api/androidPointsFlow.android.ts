import type { MobileRequestContext, MobileRequestHooks } from './client';
import type { PointWallet, PointReceipt, PointServicesResponse } from './pointsTypes';

export type SpendService = {name:string;priceId?:string;maybeFree?:string;asyncJob?:boolean;skipPrompt?:boolean};
export function androidSpendService(context: MobileRequestContext): SpendService|null {
  if(context.method!=='POST')return null;
  let body:Record<string,unknown>={};
  try { if(typeof context.body==='string'){const parsed=JSON.parse(context.body);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))body=parsed;} } catch { /* Server validates the request. */ }
  if(context.path==='/ai/teacher')return String(body.action).includes('提示')
    ?{name:'分步提示',priceId:'hint'}:{name:'题目讲解',priceId:'explanation'};
  if(context.path==='/ai/analyze')return {name:'错因分析',priceId:'mistake'};
  if(['/ai/train','/ai/train/stream','/ai/questions/draft/stream','/ai/questions/generations'].includes(context.path)) {
    const count=Number(body.count);
    return {name:'AI 出题',priceId:[1,3,5,10].includes(count)?`questions-${count}`:undefined,
      asyncJob:context.path==='/ai/questions/generations'};
  }
  if(/^\/study\/(practice-sessions\/[^/]+\/attempts|attempts\/[^/]+\/retry)$/.test(context.path))
    return {name:'主观题复核',priceId:'grading',maybeFree:'完全匹配与确定性判分免费，只有实际调用 AI 复核才扣积分。'};
  if(context.path==='/study/teacher') {
    if(!body.questionId&&['simple','example'].includes(String(body.action)))return {name:'已有课程讲解',skipPrompt:true};
    return {name:'AI 老师答疑',priceId:'study-teacher',maybeFree:'已有讲解、例子或安全提示可能直接返回缓存，缓存不扣积分。'};
  }
  if(context.path==='/ai/daily')return {name:'AI 学习计划',priceId:'plan'};
  if(context.path==='/settings/test'||/^\/admin\/ai-services\/[^/]+\/test$/.test(context.path))return {name:'接口连接测试',priceId:'connection'};
  return null;
}
const creditPath=(path:string)=>['/account/check-in','/account/redeem'].includes(path);
export const formatPointUnits=(units:number,scale=1000)=>(units/scale).toLocaleString('zh-CN',{maximumFractionDigits:3});
export type SpendPrompt = SpendService & {requestId:string};
export type AndroidPointsState = {
  ownerKey:string|null;revision:number;wallet:PointWallet|null;prices:PointServicesResponse|null;
  refreshing:boolean;error:string;message:string;prompt:SpendPrompt|null;running:number;updated:number;detailsOpen:boolean;presentationHost:string;
};
type Dependencies = {
  context:()=>{token:string|null;revision:number};
  wallet:()=>Promise<{wallet:PointWallet}>;services:()=>Promise<PointServicesResponse>;
  receipt:(lookup:{requestId?:string;jobId?:string})=>Promise<PointReceipt>;
  notify?:(message:string)=>void;
  schedule?:(callback:()=>void,ms:number)=>ReturnType<typeof setTimeout>;
  clearSchedule?:(timer:ReturnType<typeof setTimeout>)=>void;
};

export function createAndroidPointsFlow(deps: Dependencies) {
  const initial=():AndroidPointsState=>({ownerKey:null,revision:-1,wallet:null,prices:null,refreshing:false,error:'',message:'普通刷题免费，AI 按实际用量结算。',prompt:null,running:0,updated:0,detailsOpen:false,presentationHost:'root'});
  let state=initial(),epoch=0,refreshRevision=0,appActive=true,latestWalletRevision=-1,latestWalletTime=-1;
  let presentationHosts:string[]=[];
  const listeners=new Set<()=>void>();
  type Waiting={context:MobileRequestContext;service:SpendService;resolve:()=>void;reject:(error:Error)=>void};
  let waiting:Waiting[]=[];
  const timers=new Set<ReturnType<typeof setTimeout>>();
  type Tracking={lookup:{requestId?:string;jobId?:string};service:SpendService;ok:boolean;rejected:boolean;attempts:number;epoch:number;busy?:boolean;scheduled?:boolean};
  const tracks=new Map<string,Tracking>();
  const schedule=deps.schedule||setTimeout,clearSchedule=deps.clearSchedule||clearTimeout;
  const publish=(patch:Partial<AndroidPointsState>)=>{state={...state,...patch};listeners.forEach(fn=>fn());};
  const selectWallet=(next:PointWallet)=>{
    if(next.ledgerRevision!==undefined){
      if(next.ledgerRevision<latestWalletRevision||next.ledgerRevision===latestWalletRevision&&(next.snapshotAt??0)<latestWalletTime)return state.wallet;
      if(next.ledgerRevision>latestWalletRevision)latestWalletTime=-1;
      latestWalletRevision=next.ledgerRevision;latestWalletTime=Math.max(latestWalletTime,next.snapshotAt??0);
    }
    return next;
  };
  const valid=(version=epoch)=>!!state.ownerKey&&version===epoch&&state.revision===deps.context().revision&&!!deps.context().token;
  const cancelled=()=>Object.assign(new Error('已取消，未发送 AI 请求，不扣积分。'),{name:'AiPointsCancelledError'});
  const showPrompt=()=>publish({prompt:waiting[0]?{...waiting[0].service,requestId:waiting[0].context.requestId!}:null});
  function stop(){epoch++;refreshRevision++;for(const timer of timers)clearSchedule(timer);timers.clear();tracks.clear();
    for(const item of waiting)item.reject(cancelled());waiting=[];presentationHosts=[];latestWalletRevision=-1;latestWalletTime=-1;state=initial();listeners.forEach(fn=>fn());}
  const later=(fn:()=>void,ms:number)=>{const timer=schedule(()=>{timers.delete(timer);fn();},ms);timers.add(timer);};
  async function refresh(){
    if(!valid())return;
    const version=epoch,id=++refreshRevision;publish({refreshing:true,error:''});
    const [wallet,prices]=await Promise.allSettled([deps.wallet(),deps.services()]);
    if(!valid(version)||id!==refreshRevision)return;
    publish({refreshing:false,wallet:wallet.status==='fulfilled'?selectWallet(wallet.value.wallet):null,
      prices:prices.status==='fulfilled'?prices.value:null,
      error:wallet.status==='rejected'?(Number(wallet.reason?.status)===404?'服务端尚未升级到 v1.0，请部署配套后端后重试。':'积分未同步，点击刷新；不会将未知余额显示为 0。'):''});
  }
  async function reconcile(key:string,track:Tracking){
    if(!valid(track.epoch)||!tracks.has(key)||!appActive||track.busy)return;
    track.busy=true;
    try {
      const receipt=await deps.receipt(track.lookup);
      if(!valid(track.epoch)||tracks.get(key)!==track)return;
      let message:string;
      const number=(n:number)=>formatPointUnits(n,receipt.wallet.scale);
      if(receipt.pending)message=`${track.service.name}：预扣 ${number(receipt.heldUnits)} 积分，正在结算。`;
      else if(receipt.chargedUnits>0)message=`${track.service.name}：实扣 ${number(receipt.chargedUnits)} 积分${receipt.releasedUnits?`，预扣差额 ${number(receipt.releasedUnits)} 已释放`:''}。`;
      else if(receipt.refundedUnits>0)message=`${track.service.name}：未完成，已退回 ${number(receipt.refundedUnits)} 积分。`;
      else if(receipt.found)message=track.ok?`${track.service.name}：本次 0 积分。`:`${track.service.name}：未完成，本次未扣积分。`;
      else if(track.rejected)message=`${track.service.name}：请求未通过校验，未新增积分账单。`;
      else if(track.ok&&!track.service.asyncJob)message=`${track.service.name}：本次 0 积分，未产生新的 AI 调用。`;
      else message=`${track.service.name}：账单尚未确认，正在核对，请勿重复提交。`;
      const finished=receipt.found&&!receipt.pending || (!receipt.found&&(track.rejected||track.ok&&!track.service.asyncJob));
      const changed=state.wallet?.availableUnits!==receipt.wallet.availableUnits||state.wallet?.heldUnits!==receipt.wallet.heldUnits;
      publish({wallet:selectWallet(receipt.wallet),message,error:'',updated:state.updated+(finished||changed?1:0)});
      if(finished){tracks.delete(key);try{deps.notify?.(message);}catch{/* A native toast failure cannot invalidate a verified bill. */}return;}
    }catch{
      if(!valid(track.epoch))return;
      publish({message:`${track.service.name}：账单暂未同步，尚不能确认扣费或退款。`,error:'可刷新积分或查看使用记录；不会自动重发 AI 请求。'});
    }finally{track.busy=false;}
    track.attempts++;
    if(track.attempts>=60){tracks.delete(key);publish({message:`${track.service.name}：账单待核对，请查看积分记录。`});return;}
    if(!track.scheduled){track.scheduled=true;later(()=>{track.scheduled=false;void reconcile(key,track);},3000);}
  }
  const hooks:MobileRequestHooks={
    handles:context=>!!androidSpendService(context)||creditPath(context.path),
    async before(context){
      const service=androidSpendService(context);if(!service)return;
      if(service.skipPrompt)return;
      if(!valid()||context.revision!==state.revision)throw cancelled();
      if(waiting.length>=3)throw new Error('请先处理当前的积分确认，再提交新的 AI 请求。');
      await new Promise<void>((resolve,reject)=>{waiting.push({context,service,resolve,reject});showPrompt();void refresh();});
    },
    after(context,outcome){
      if(!valid()||context.revision!==state.revision)return;
      if(creditPath(context.path)){if(outcome.ok){publish({message:'积分活动已完成，正在刷新可用积分。'});void refresh();}return;}
      const service=androidSpendService(context);if(!service||!context.requestId)return;
      if(!service.skipPrompt)publish({running:Math.max(0,state.running-1)});
      const data=outcome.data as {job?:{id?:string}}|undefined;
      const jobId=service.asyncJob?data?.job?.id:undefined;
      if(service.asyncJob&&outcome.ok&&!jobId){publish({message:'出题任务已提交，账单待核对；请到积分记录查看。'});void refresh();return;}
      const status=Number((outcome.error as {status?:number}|undefined)?.status);
      const key=jobId||context.requestId,track:Tracking={lookup:jobId?{jobId}:{requestId:context.requestId},service,ok:outcome.ok,rejected:!outcome.ok&&status>=400&&status<500,attempts:0,epoch};
      tracks.set(key,track);publish({message:jobId?'AI 出题任务已排队，完成后核对实际积分。':'正在核对本次积分账单…'});
      void reconcile(key,track);
    },
  };
  return {
    getSnapshot:()=>state,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},hooks,refresh,
    showDetails:()=>publish({detailsOpen:true}),hideDetails:()=>publish({detailsOpen:false}),
    presentOn(host:string){presentationHosts=presentationHosts.filter(value=>value!==host);presentationHosts.push(host);publish({presentationHost:host});
      return()=>{presentationHosts=presentationHosts.filter(value=>value!==host);publish({presentationHost:presentationHosts[presentationHosts.length-1]||'root'});};},
    activate(ownerKey:string){if(!deps.context().token){if(state.ownerKey)stop();return;}if(state.ownerKey===ownerKey&&valid())return;stop();publish({ownerKey,revision:deps.context().revision});void refresh();},
    deactivate(ownerKey?:string){if(!ownerKey||state.ownerKey===ownerKey)stop();},
    setAppActive(active:boolean){appActive=active;if(active){void refresh();for(const [key,track]of tracks)void reconcile(key,track);}},
    accept(){const item=waiting.shift();if(!item)return;showPrompt();if(!valid()||item.context.revision!==state.revision){item.reject(cancelled());return;}
      publish({running:state.running+1,message:`${item.service.name}请求中，积分以服务端账单为准。`});item.resolve();const version=epoch;later(()=>{if(valid(version))void refresh();},500);},
    cancel(){const item=waiting.shift();if(!item)return;item.reject(cancelled());showPrompt();publish({message:'已取消，未发送 AI 请求，不扣积分。'});},
  };
}
