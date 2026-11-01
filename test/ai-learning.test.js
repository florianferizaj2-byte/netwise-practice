import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createStore } from "../server/store.js";
import { createAiScheduler } from "../server/ai-tasks.js";
import { withPointsTask, currentPointsTask } from "../server/ai-points/runtime.js";
import { fundAiFixture } from "./helpers/ai-points.js";
import { createAiLearning } from "../server/ai-learning.js";
import { learningProfile, learningBlueprint } from "../server/ai-personalization.js";

test("personalization uses distinct question evidence and never treats repeated correct answers as stable mastery",()=>{
  const qs=Array.from({length:6},(_,i)=>({id:"q"+i,type:"single_choice",chapter:"章",knowledgePoint:"点",source:"original"}));
  const now=Date.now(),a=(id,correct,index)=>({id:"a"+index,questionId:id,correct,createdAt:new Date(now-index*1000).toISOString()});
  let p=learningProfile(qs,Array.from({length:20},(_,i)=>a("q0",true,i)),"cert",now);
  assert.equal(p.stats.answered,1);assert.equal(p.stats.correct,1);assert.equal(p.points[0].stable,false);
  assert.equal(learningBlueprint(p,{strategy:"challenge",count:10}).diagnostic,true);
  assert.ok(learningBlueprint(p,{strategy:"challenge",count:10}).slots.every(s=>s.difficulty!=="hard"));
  p=learningProfile(qs,qs.map((q,i)=>a(q.id,true,i)),"cert",now);
  assert.equal(p.points[0].stable,true);assert.equal(learningBlueprint(p,{strategy:"challenge",count:10}).diagnostic,false);
  assert.equal(learningProfile(qs,[a("other-certificate",false,0)],"cert",now).stats.answered,0);
  assert.equal(learningBlueprint(learningProfile(qs,[],"cert",now),{count:10}).slots.length,10);
  assert.throws(()=>learningBlueprint(p,{pointIds:["not-present"]}));
  const mixed=learningProfile([...qs.map(q=>({...q,knowledgePoint:"熟练点"})),{...qs[0],id:"unseen",knowledgePoint:"未学点"}],
    qs.map((q,i)=>a(q.id,true,i)),"cert",now);
  assert.equal(learningBlueprint(mixed,{pointIds:[mixed.points.find(p=>p.knowledgePoint==="未学点").id]}).diagnostic,true);
  const many=Array.from({length:12},(_,i)=>({...qs[0],id:"recent"+i}));
  const rows=many.map((q,i)=>({id:"recent-attempt"+i,questionId:q.id,correct:true,createdAt:new Date(now-24000+i*1000).toISOString()}));
  rows.push({id:"revisited",questionId:many[0].id,correct:false,createdAt:new Date(now-500).toISOString()});
  assert.equal(learningProfile(many,rows,"cert",now).points[0].recentWrong,1);
  const shared={...qs[0],id:"shared",certificates:["cert","other"]};
  const scoped=learningProfile([shared],[
    {...a("shared",true,0),certificateId:"cert"},
    {...a("shared",false,1),certificateId:"other"},
    a("shared",false,2),
  ],"cert",now);
  assert.equal(scoped.stats.answered,1);assert.equal(scoped.stats.correct,1);
  assert.equal(scoped.stats.ambiguousRecords,1);
});

test("durable AI learning checkpoints, billing, exam clock, delivery replay and submission stay consistent",async t=>{
  const parent=path.resolve("tmp"),dir=fs.mkdtempSync(path.join(parent,"ai-learning-unit-"));
  const store=createStore(dir),user=store.register("learning_fixture","fixture-password-123");
  store.selectCertificate(user.id,"network-engineer");fundAiFixture(store,user.id);
  const seed={id:"synthetic-learning-seed",type:"single_choice",question:"合成测试初始事务中，在所有变更成功之后应该执行哪项操作？",
    options:{A:"提交事务",B:"删除日志",C:"跳过校验",D:"忽略错误"},answer:["A"],analysis:"合成测试数据：事务的全部步骤成功之后才能统一提交。",
    chapter:"路由与广域网技术",knowledgePoint:"合成测试知识点",difficulty:"easy",tags:["合成测试"],certificates:["network-engineer"],source:"original"};
  store.addQ(seed);
  const settings={baseUrl:"https://fixture.invalid",model:"local-fixture"};
  store.points.saveRateCard({provider:settings.baseUrl,model:settings.model,inputMicrosPerMillion:1000000,outputMicrosPerMillion:1000000,cachedMicrosPerMillion:0,
    source:"synthetic-test-only",verifiedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()},"synthetic");
  let clock=Date.now(),index=0,invalid=false,outage=false,gate=null,onEntered=null,overrideQuestion=null;
  const stems=[
    "原子事务中的作答和交付日志同时写入，如果第二项写入失败，应该如何保持持久状态一致？",
    "客户端首次提交后没有收到确认，又带着相同请求编号发送相同内容，服务端应该如何处理？",
    "旧工作进程失去任务租约以后才返回计算结果，避免覆盖新进程成果需要检查哪个条件？",
    "手机断开事件流之后重新连接，可靠补收此前遗漏消息需要保存并携带什么信息？",
    "考试后台仍在出题而已有题目尚未作答，为避免错误暂停考试计时应当采用哪种判断依据？",
    "公开答题接口准备交付完整题目，在正式交卷之前需要移除哪一类内部字段？",
    "同一题连续记住答案并反复答对，用于评价知识掌握程度时应该怎样限制这类重复证据？",
    "不同证书中存在名称相同的知识点，保存用户学习画像时应如何限定数据的归属范围？",
    "审核发现一道候选题的选项互相矛盾而其他题目已经通过检查，恢复工作应该针对哪一部分？",
    "试卷只有部分题目完成生成就被用户主动结束，在成绩展示中应当如何标识完成情况？",
    "异步工作返回后发现用户已经主动终止任务，为防止旧结果再写入，应当在提交事务之前执行什么检查？",
  ];
  const provider={generateBankExpansion:async(_seed,count,options)=>{
    assert.equal(count,1);assert.equal(options.maxRounds,2);
    if(gate){onEntered?.();await gate;}
    if(outage)throw new Error("synthetic provider outage");
    if(invalid)return [{...seed,question:"TODO",difficulty:options.difficulty,id:undefined,source:undefined}];
    const question=overrideQuestion||stems[index++ % stems.length];
    return [{type:"single_choice",question,options:{A:"采用与题干相符的一致性控制",B:"丢弃全部持久记录",C:"忽略校验结果直接发布",D:"混用其他用户的状态"},
      answer:["A"],analysis:"合成夹具只检验任务与存储机制，不代表真实模型生成或独立内容审核。",chapter:seed.chapter,
      knowledgePoint:seed.knowledgePoint,difficulty:options.difficulty,tags:["合成测试"]}];
  }};
  let scheduler=createAiScheduler({concurrency:2}),service;
  const make=()=>{
    const ai=(uid,run,meta)=>scheduler.run(uid,()=>withPointsTask(store,uid,async()=>{
      const c=store.points.reserveCall(currentPointsTask(store,uid).operationId,{settings,inputLimit:20,outputLimit:20,taskType:"synthetic-engine-test"});
      store.points.finishCall(c.id,{success:true,usage:{hasUsage:true,prompt_tokens:2,completion_tokens:3,total_tokens:5}});
      return run();
    },meta));
    return createAiLearning({store,provider,ai,scheduler,questions:()=>[seed],now:()=>clock,autoStart:false,
      pricing:()=>({available:true,scale:1000,primaryModelId:"fixture",models:[{id:"fixture",services:[{id:"questions-1",sampleUnits:100}]}]})});
  };
  service=make();
  t.after(async()=>{service.stop();await scheduler.stop();await service.settle();store.db.close();assert.equal(path.dirname(dir),parent);fs.rmSync(dir,{recursive:true,force:true});});
  const setup={strategy:"weakness",kind:"exam",count:10,durationMinutes:40,pointIds:[]};
  const create=()=>{
    const quote=service.quote(user.id,"network-engineer",setup);
    return {body:{...setup,requestId:crypto.randomUUID(),profileRevision:quote.profileRevision,acceptedPricing:true}};
  };
  const {body}=create();
  const job=service.create(user.id,"network-engineer",body);
  assert.equal(service.create(user.id,"network-engineer",body).id,job.id);
  assert.throws(()=>service.create(user.id,"network-engineer",{...body,count:20}),/请求编号/);
  assert.throws(()=>service.view(job.id,"other-user","network-engineer"),/不存在/);
  assert.throws(()=>service.view(job.id,user.id,"other-certificate"),/不存在/);
  assert.throws(()=>service.start(job.id,user.id,"network-engineer"),/首批/);
  const tick=async()=>{await service.pump();await service.settle();clock+=1000;};
  for(let i=0;i<3;i++)await tick();
  let v=service.view(job.id,user.id,"network-engineer");
  assert.equal(v.readyCount,3);assert.ok(v.questions.every(q=>!("answer" in q)&&!("analysis" in q)));
  const firstIds=v.questions.map(q=>q.id),before=store.points.wallet(user.id).availableUnits;
  v=service.start(job.id,user.id,"network-engineer");
  clock+=10000;
  const answers=Object.fromEntries(v.questions.map(q=>[q.id,["A"]]));
  v=service.saveAnswers(job.id,user.id,"network-engineer",{expectedVersion:0,answers});
  assert.equal(v.waiting,true);
  const remain=v.remainingMs;clock+=30000;
  assert.equal(service.view(job.id,user.id,"network-engineer").remainingMs,remain);
  assert.equal(service.saveAnswers(job.id,user.id,"network-engineer",{expectedVersion:0,answers}).answersVersion,1);
  assert.throws(()=>service.saveAnswers(job.id,user.id,"network-engineer",{expectedVersion:0,answers:{[firstIds[0]]:["B"]}}),/另一设备/);
  assert.throws(()=>service.submit(job.id,user.id,"network-engineer",{expectedVersion:1}),/尚未全部/);
  const cursor=service.events(job.id,user.id,"network-engineer").at(-1).id;
  service.stop();await scheduler.stop();await service.settle();
  scheduler=createAiScheduler({concurrency:2});service=make();
  assert.equal(service.view(job.id,user.id,"network-engineer").readyCount,3);
  for(let i=0;i<7;i++)await tick();
  v=service.view(job.id,user.id,"network-engineer");
  assert.equal(v.readyCount,10);assert.equal(v.status,"completed");
  assert.deepEqual(v.questions.slice(0,3).map(q=>q.id),firstIds);
  assert.equal(v.waiting,false);
  const replay=service.events(job.id,user.id,"network-engineer",cursor);
  assert.equal(replay.filter(e=>e.type==="question-ready").length,7);
  assert.ok(replay.every(e=>!JSON.stringify(e.data).includes('"answer":')));
  assert.ok(store.points.wallet(user.id).availableUnits<before);
  assert.equal(store.points.audit().passed,true);
  clock+=40*60000;
  assert.throws(()=>service.saveAnswers(job.id,user.id,"network-engineer",{expectedVersion:1,answers:{[v.questions[9].id]:["A"]}}),/时间已到/);
  assert.equal(service.saveAnswers(job.id,user.id,"network-engineer",{expectedVersion:0,answers}).answersVersion,1);
  v=service.submit(job.id,user.id,"network-engineer",{expectedVersion:1});
  assert.equal(v.result.partial,false);assert.equal(v.result.maxScore,10);
  assert.equal(v.result.results.length,10);assert.equal(store.allA(user.id).length,10);
  service.submit(job.id,user.id,"network-engineer",{expectedVersion:1});
  assert.equal(store.allA(user.id).length,10);
  const balance=store.points.wallet(user.id).availableUnits;
  service.create(user.id,"network-engineer",body);
  assert.equal(store.points.wallet(user.id).availableUnits,balance);

  await t.test("invalid candidates are never released, retry budget is bounded, and failed questions refund",async()=>{
    invalid=true;const b=create().body,newJob=service.create(user.id,"network-engineer",b),balance=store.points.wallet(user.id).availableUnits;
    for(let i=0;i<3;i++){clock+=40000;await tick();}
    const v=service.view(newJob.id,user.id,"network-engineer");
    assert.equal(v.readyCount,0);assert.equal(v.status,"blocked");
    assert.equal(store.points.wallet(user.id).availableUnits,balance);
    assert.equal(store.points.wallet(user.id).heldUnits,0);
    assert.throws(()=>service.retry(newJob.id,user.id,"network-engineer"),/重试上限/);
    service.cancel(newJob.id,user.id,"network-engineer");invalid=false;
  });
  await t.test("cancel fences late writes while retaining completed questions",async()=>{
    const b=create().body,j=service.create(user.id,"network-engineer",b);
    await tick();assert.equal(service.view(j.id,user.id,"network-engineer").readyCount,1);
    const balance=store.points.wallet(user.id).availableUnits;
    let release,started;
    gate=new Promise(resolve=>{release=resolve;});
    const began=new Promise(resolve=>{started=resolve;});onEntered=started;
    await service.pump();await began;
    service.cancel(j.id,user.id,"network-engineer");release();await service.settle();gate=null;onEntered=null;
    assert.equal(service.view(j.id,user.id,"network-engineer").readyCount,1);
    assert.equal(store.points.wallet(user.id).availableUnits,balance);
    assert.equal(store.points.wallet(user.id).heldUnits,0);
    const startedView=service.start(j.id,user.id,"network-engineer");
    const partial=service.submit(j.id,user.id,"network-engineer",{expectedVersion:startedView.answersVersion,partial:true});
    assert.equal(partial.result.partial,true);assert.equal(partial.result.maxScore,1);assert.equal(partial.result.targetCount,10);
  });
  await t.test("expired worker leases recover only missing slots and fence an abandoned worker",async()=>{
    overrideQuestion="合成场景中，工作进程崩溃后持久任务的租约过期，新进程领取任务应如何避免未完成位置被永久搁置？";
    const j=service.create(user.id,"network-engineer",create().body),oldService=service,oldScheduler=scheduler;
    let release,entered;gate=new Promise(resolve=>{release=resolve;});
    const began=new Promise(resolve=>{entered=resolve;});onEntered=entered;
    await oldService.pump();await began;
    clock+=300001;gate=null;onEntered=null;
    scheduler=createAiScheduler({concurrency:2});service=make();
    await service.pump();await service.settle();
    assert.equal(service.view(j.id,user.id,"network-engineer").readyCount,1);
    release();await oldService.settle();oldService.stop();await oldScheduler.stop();
    const final=service.view(j.id,user.id,"network-engineer");
    assert.equal(final.readyCount,1);assert.ok(final.billing.chargedUnits>0);
    assert.equal(store.points.wallet(user.id).heldUnits,0);assert.equal(store.points.audit().passed,true);
    service.cancel(j.id,user.id,"network-engineer");
  });
});
