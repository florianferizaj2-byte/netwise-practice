import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import { pointsError } from './money.js';

const tasks=new AsyncLocalStorage(),requests=new AsyncLocalStorage();
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const runPointsRequest=(request,run)=>requests.run({request,index:0},run);
export function commitPointsResult(store,userId,result,commit) {
  const context=currentPointsTask(store,userId);
  if(!context)throw pointsError('AI 任务缺少结算上下文','AI_POINTS_CONTEXT_MISSING',503);
  return store.points.transaction(()=>{
    commit();
    const settled=store.points.finish(context.operationId,{success:true,result});
    if(settled.state!=='settled')
      throw pointsError('上游用量未能核实，积分已退还','AI_POINTS_USAGE_UNVERIFIED',503);
    return result;
  });
}
export function currentPointsTask(store,userId) {
  const context=tasks.getStore();
  if(!context?.active||context.store!==store)return null;
  if(userId!==context.userId&&userId!==context.usageUserId)
    throw pointsError('AI 任务计费账号不一致','AI_POINTS_ACCOUNT_MISMATCH',403);
  return context;
}
const requestIdentity=()=>{
  const context=requests.getStore();
  if(!context)return {};
  const req=context.request;
  const supplied=req.headers['x-ai-request-id']||req.body?.requestId;
  if(supplied&&(typeof supplied!=='string'||!/^[a-zA-Z0-9:_-]{8,150}$/.test(supplied)))
    throw pointsError('AI 请求编号无效','AI_POINTS_INVALID_REQUEST_ID',400);
  const feature=`${req.method} ${req.route?.path||req.path}`;
  const index=context.index++;
  return {requestKey:`http:${supplied||crypto.randomUUID()}:${feature}:${index}`,
    signature:digest({method:req.method,path:req.path,body:req.body,certificateId:req.user?.certificateId}),
    feature,certificateId:req.user?.certificateId||null,retryFailed:true};
};
export async function withPointsTask(store,userId,run,options={}) {
  const inherited=tasks.getStore();
  if(inherited?.active&&inherited.store===store&&!options.forceNew){
    currentPointsTask(store,userId);return run();
  }
  if(!store.points)throw pointsError('积分结算尚未就绪，请联系管理员','AI_POINTS_UNAVAILABLE',503);
  const metadata={...requestIdentity(),...options};
  const {created,operation}=store.points.begin({userId,requestKey:metadata.requestKey||crypto.randomUUID(),
    signature:metadata.signature||digest({userId,feature:metadata.feature||'ai'}),
    feature:metadata.feature||'ai',certificateId:metadata.certificateId||null,retryFailed:!!metadata.retryFailed});
  if(!created){
    if(operation.state==='settled'){
      const result=JSON.parse(operation.result);
      metadata.onReplay?.(result);
      const response=requests.getStore()?.request?.res;
      if(response&&!response.headersSent)response.setHeader('X-AI-Points-Changed','1');
      return result;
    }
    if(operation.state==='refunded')throw pointsError('上次任务已失败并退还积分，请重新发起','AI_POINTS_PREVIOUS_FAILED',409);
    throw pointsError('该 AI 请求仍在处理中，请稍候','AI_POINTS_REQUEST_IN_PROGRESS',409);
  }
  const context={store,userId,usageUserId:metadata.usageUserId||userId,operationId:operation.id,active:true};
  return tasks.run(context,async()=>{
    try {
      const result=await run();
      const settled=store.points.finish(operation.id,{success:true,result});
      if(settled.state!=='settled')
        throw pointsError('上游用量未能核实，积分已退还；请管理员核对服务配置','AI_POINTS_USAGE_UNVERIFIED',503);
      return result;
    } catch(error) {
      store.points.finish(operation.id,{success:false,error:error?.message||'AI 任务失败'});
      throw error;
    } finally {
      context.active=false;
      const response=requests.getStore()?.request?.res;
      if(response&&!response.headersSent)response.setHeader('X-AI-Points-Changed','1');
    }
  });
}
