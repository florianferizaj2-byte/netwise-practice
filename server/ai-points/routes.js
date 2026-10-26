import {z} from 'zod';
import {cnyMicros,pointUnits} from './money.js';
import {ensureAccountPoints,accountPointsPlans} from './account.js';
import {readCheckInPolicy,updateCheckInPolicy} from './check-in-policy.js';
import {pointsUsageReport,userPointOperations,userPointReceipt,pointWalletSnapshot} from './reports.js';
import {officialRateCards} from './pricing.js';
import {pointServicePrices} from './service-prices.js';

const pagination={limit:z.coerce.number().int().min(1).max(100).default(30),offset:z.coerce.number().int().min(0).max(1000000).default(0)};
const money=z.string().regex(/^(0|[1-9]\d{0,8})(\.\d{1,6})?$/);
export function registerPointsRoutes({route,store,requestUserId,requireAdmin}) {
  route('get','/api/account/points/wallet',req=>store.points.transaction(()=>{
    const userId=requestUserId(req);
    return {wallet:pointWalletSnapshot(store,userId,ensureAccountPoints(store,userId))};
  }));
  route('get','/api/account/points/services',req=>{
    requestUserId(req);
    return pointServicePrices(store);
  });
  route('get','/api/account/points',req=>({wallet:ensureAccountPoints(store,requestUserId(req)),plans:accountPointsPlans(store),
    billingMode:'points',policy:{pointScale:1000,pointsPerCny:100,refundOnFailure:true,earliestExpiryFirst:true}}));
  route('get','/api/account/points/transactions',req=>{
    const query=z.object(pagination).strict().parse(req.query);
    return {entries:store.points.journal(requestUserId(req),query),...query};
  });
  route('get','/api/account/points/operations',req=>userPointOperations(store,requestUserId(req),z.object(pagination).strict().parse(req.query)));
  route('get','/api/account/points/receipt',req=>{
    const query=z.object({requestId:z.string().uuid().optional(),jobId:z.string().uuid().optional()})
      .strict().refine(value=>!!value.requestId!==!!value.jobId,'提供一个请求或任务编号').parse(req.query);
    return userPointReceipt(store,requestUserId(req),query);
  });
  const admin=(method,path,fn)=>route(method,'/api/admin/points'+path,req=>{requireAdmin(req);return fn(req);});
  const audit=(req,action,id,data)=>store.audit(req.user.id,action,'ai_points',id,data);
  admin('get','/usage',req=>pointsUsageReport(store,z.object({...pagination,days:z.coerce.number().int().min(1).max(365).default(30),search:z.string().trim().max(100).default('')}).strict().parse(req.query)));
  admin('get','/users/:id',req=>userPointOperations(store,req.params.id,z.object(pagination).strict().parse(req.query)));
  admin('get','/configuration',()=>({plans:accountPointsPlans(store),checkInPolicy:readCheckInPolicy(store),officialRateCards,customRateCards:store.db.prepare('SELECT data,paused FROM ai_points_rates ORDER BY provider,model').all().map(row=>({...JSON.parse(row.data),paused:!!row.paused})),finance:store.points.finance()}));
  admin('get','/check-in-policy',()=>({policy:readCheckInPolicy(store)}));
  admin('put','/check-in-policy',req=>store.points.transaction(()=>{
    const result=updateCheckInPolicy(store,req.body,req.user.id);
    if(!result.replayed)audit(req,'points_check_in_policy_updated',String(result.appliedRevision),{revision:result.appliedRevision,dailyPoints:result.policy.dailyPoints,enabled:result.policy.enabled,requireFunded:result.policy.requireFunded,reason:req.body.reason});
    return result;
  }));
  admin('post','/finance',req=>{
    const body=z.object({requestId:z.string().uuid(),kind:z.enum(['revenue','expense']),amountCny:money,
      userId:z.string().max(150).nullable().default(null),reference:z.string().trim().min(8).max(500)}).strict().parse(req.body);
    const result=store.points.transaction(()=>{
      const record=store.points.recordFinance({key:'admin-finance:'+body.requestId,kind:body.kind,amountMicros:cnyMicros(body.amountCny),userId:body.userId,reference:body.reference,createdBy:req.user.id});
      if(record.created)audit(req,'points_finance_recorded',body.requestId,body);
      return record;
    });
    return {finance:result};
  });
  admin('post','/grants',req=>{
    const body=z.object({requestId:z.string().uuid(),userId:z.string().min(1).max(150),points:z.string().regex(/^(0|[1-9]\d{0,8})(\.\d{1,3})?$/),expiresAt:z.string().datetime().nullable().default(null),reason:z.string().trim().min(8).max(500)}).strict().parse(req.body);
    if(!store.userById(body.userId))throw Object.assign(new Error('账号不存在'),{status:404});
    return store.points.transaction(()=>{
      const result=store.points.grant({userId:body.userId,sourceKey:'admin-grant:'+body.requestId,units:pointUnits(body.points),kind:'operator-grant',expiresAt:body.expiresAt,requireFunded:true});
      if(result.created)audit(req,'points_granted',body.userId,body);
      return {wallet:result};
    });
  });
  admin('post','/rates',req=>{
    const body=z.object({provider:z.string().url().max(1000),model:z.string().trim().min(1).max(200),inputCnyPerMillion:money,outputCnyPerMillion:money,cachedCnyPerMillion:money,
      source:z.string().trim().min(8).max(1000),verifiedAt:z.string().datetime(),expiresAt:z.string().datetime()}).strict().parse(req.body);
    return store.points.transaction(()=>{
      const card={id:'operator-rate:'+store.points.signature(body),provider:body.provider,model:body.model,source:body.source,verifiedAt:body.verifiedAt,expiresAt:body.expiresAt,
        inputMicrosPerMillion:cnyMicros(body.inputCnyPerMillion),outputMicrosPerMillion:cnyMicros(body.outputCnyPerMillion),cachedMicrosPerMillion:cnyMicros(body.cachedCnyPerMillion)};
      const result=store.points.saveRateCard(card,req.user.id);audit(req,'points_rate_confirmed',body.model,card);return {rateCard:result};
    });
  });
  admin('post','/calls/:id/reconcile',req=>{
    const body=z.object({requestId:z.string().uuid(),costCny:money,reference:z.string().trim().min(8).max(500)}).strict().parse(req.body);
    return store.points.transaction(()=>{
      const result=store.points.reconcileCall(req.params.id,{costMicros:cnyMicros(body.costCny),reference:body.reference,requestKey:body.requestId,actor:req.user.id});
      audit(req,'points_cost_reconciled',req.params.id,body);return {callId:result.id,costMicros:result.cost_micros};
    });
  });
}
