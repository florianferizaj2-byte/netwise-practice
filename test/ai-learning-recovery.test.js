import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {createStore} from "../server/store.js";
import {createAiLearning} from "../server/ai-learning.js";
import {createAiScheduler} from "../server/ai-tasks.js";
import {withPointsTask} from "../server/ai-points/runtime.js";
import {learningFixture} from "./helpers/ai-learning.js";
import {validateQuestion} from "../server/domain.js";
import {normalizeGeneratedQuestion,questionFailureFeedback,AI_QUESTION_REQUIRED_FIELDS,questionGenerationContract} from "../server/ai-question-contract.js";

const canonical={type:"single_choice",question:"所有检查已经完成时，事务应采用哪种方式一次性提交这些变更？",
 options:{A:"确认全部变更后统一提交",B:"先删除全部检查记录",C:"无视错误直接覆盖",D:"把其他用户状态合并"},answer:["A"],
 analysis:"隔离测试夹具：只有全部前置检查成功时，才将本次事务的变更一起提交。",
 chapter:"合成章节",knowledgePoint:"合成知识点",difficulty:"easy",tags:["合成测试"]};
test("generated question aliases and unambiguous wrappers preserve the actual stem without inventing content",()=>{
 for(const key of ["question_text","questionText","stem_text","stemText","题干内容","题目内容"]){
  const raw={...canonical,[key]:canonical.question};delete raw.question;
  assert.equal(validateQuestion(normalizeGeneratedQuestion(raw)).question,canonical.question);
 }
 for(const raw of [{data:{...canonical}},{question:{...canonical}},{item:{...canonical}},JSON.stringify(canonical),
  {...canonical,question:{text:canonical.question}}]){
  assert.equal(validateQuestion(normalizeGeneratedQuestion(raw)).question,canonical.question);
 }
 const absent={...canonical};delete absent.question;
 const draft=normalizeGeneratedQuestion(absent,{chapter:canonical.chapter,knowledgePoint:canonical.knowledgePoint});
 assert.equal(draft.question,undefined);
 const noSeedFallback=normalizeGeneratedQuestion({},canonical);
 assert.equal(noSeedFallback.question,undefined);assert.equal(noSeedFallback.analysis,undefined);
 assert.throws(()=>validateQuestion(draft));
 assert.throws(()=>validateQuestion(normalizeGeneratedQuestion({...canonical,answer:["Z"]})));
 assert.throws(()=>validateQuestion(normalizeGeneratedQuestion({...canonical,question:"TODO"})));
 const failure=questionFailureFeedback({issues:[{path:["question"],code:"invalid_type"}]});
 assert.equal(failure.code,"AI_QUESTION_SCHEMA_INVALID");assert.match(failure.correction,/question/);
 for(const field of AI_QUESTION_REQUIRED_FIELDS)assert.ok(questionGenerationContract().includes(field));
});
async function fixture(t,transformQuestion,count=30){
 const parent=path.resolve("tmp"),dir=fs.mkdtempSync(path.join(parent,"ai-learning-recovery-"));
 const store=createStore(dir),user=store.register("recovery_fixture","fixture-password-123");store.selectCertificate(user.id,"network-engineer");
 const model=learningFixture(store,{delayMs:0,transformQuestion});store.aiServices.policy=()=>({managed:false});
 const scheduler=createAiScheduler({concurrency:2});let clock=Date.now();
 const service=createAiLearning({store,provider:model.provider,scheduler,questions:model.questions,autoStart:false,now:()=>clock,
  ai:(uid,run,options)=>scheduler.run(uid,()=>withPointsTask(store,uid,run,options),{userId:uid}),
  pricing:()=>({available:true,scale:1000,primaryModelId:"synthetic",models:[{id:"synthetic",services:[{id:"questions-1",sampleUnits:1}]}]})});
 t.after(async()=>{service.stop();await service.settle();await scheduler.stop();store.db.close();
  assert.equal(path.dirname(dir),parent);assert.ok(path.basename(dir).startsWith("ai-learning-recovery-"));fs.rmSync(dir,{recursive:true,force:true});});
 const setup={kind:"exam",count,strategy:"weakness",durationMinutes:40,pointIds:[]};
 const quote=service.quote(user.id,"network-engineer",setup);
 const job=service.create(user.id,"network-engineer",{...setup,requestId:crypto.randomUUID(),profileRevision:quote.profileRevision,acceptedPricing:true});
 return {store,user,model,service,id:job.id,advance:ms=>{clock+=ms;},view:()=>service.view(job.id,user.id,"network-engineer"),
  pump:async()=>{await service.pump();await service.settle();}};
}
test("thirty questions finish with real generation/review orchestration even when fields change after the fourth question",async t=>{
 const f=await fixture(t,(q,{index,system})=>{
  for(const field of AI_QUESTION_REQUIRED_FIELDS)assert.ok(system.includes(field));
  if(index<4)return q;
  const next={...q,question_text:q.question};delete next.question;return next;
 });
 for(let i=0;i<30;i++)await f.pump();
 const state=f.view();assert.equal(state.status,"completed");assert.equal(state.readyCount,30);
 assert.equal(new Set(state.questions.map(q=>q.id)).size,30);assert.equal(f.model.reviews,30);
 assert.ok(state.questions.every(q=>typeof q.question==="string"&&q.answer===undefined&&q.analysis===undefined));
 assert.equal(f.store.points.wallet(f.user.id).heldUnits,0);assert.equal(f.store.points.audit().passed,true);
});
test("legacy four-of-thirty blocked jobs recover missing slots with unique billing keys and pause fault time",async t=>{
 let malformed=true;
 const f=await fixture(t,(q,{index})=>{if(index<4||!malformed)return q;const next={...q};delete next.question;return next;});
 for(let i=0;i<4;i++)await f.pump();
 const ready=f.view().questions.map(q=>q.id);
 const begun=f.service.start(f.id,f.user.id,"network-engineer");
 f.service.saveAnswers(f.id,f.user.id,"network-engineer",{expectedVersion:begun.answersVersion,answers:{[ready[0]]:["A"],[ready[1]]:["A"]}});
 const charges=f.view().billing.chargedUnits,available=f.store.points.wallet(f.user.id).availableUnits;
 f.advance(10000);
 for(let i=0;i<3;i++){await f.pump();f.advance(9000);}
 let state=f.view();assert.equal(state.status,"blocked");assert.equal(state.readyCount,4);
 assert.equal(state.retryable,false);assert.equal(state.errorCode,"AI_QUESTION_SCHEMA_INVALID");assert.doesNotMatch(state.error,/invalid_type|received undefined/);
 assert.equal(state.billing.chargedUnits,charges);assert.equal(f.store.points.wallet(f.user.id).availableUnits,available);
 assert.equal(f.store.points.wallet(f.user.id).heldUnits,0);
 assert.throws(()=>f.service.retry(f.id,f.user.id,"network-engineer"),e=>e.code==="AI_LEARNING_RETRY_LIMIT");
 const stored=JSON.parse(f.store.db.prepare("SELECT data FROM ai_learning_jobs WHERE id=?").get(f.id).data);
 delete stored.generatorRevision;
 const block=Date.parse(f.store.db.prepare("SELECT created_at FROM ai_learning_events WHERE job_id=? AND event_type='blocked' ORDER BY seq DESC LIMIT 1").get(f.id).created_at);
 stored.error='AI 已修正 2 轮，仍有 1 道题未通过质量审核：[{"expected":"string","code":"invalid_type","path":["question"],"message":"expected string, received undefined"}]';
 stored.errorCode="AI_LEARNING_GENERATION_FAILED";stored.waiting=false;stored.spentMs=0;stored.runningSince=block-10000;
 f.store.db.prepare("UPDATE ai_learning_jobs SET data=? WHERE id=?").run(JSON.stringify(stored),f.id);
 f.advance(3600000);state=f.view();
 assert.equal(state.retryable,true);assert.equal(state.recoveryAvailable,true);assert.equal(state.waiting,true);
 assert.equal(state.remainingMs,40*60000-10000);assert.doesNotMatch(state.error,/invalid_type/);
 malformed=false;const resumed=f.service.retry(f.id,f.user.id,"network-engineer");
 assert.equal(resumed.readyCount,4);assert.equal(resumed.answers[ready[0]][0],"A");
 assert.throws(()=>f.service.retry(f.id,f.user.id,"network-engineer"));
 for(let i=0;i<26;i++)await f.pump();
 state=f.view();assert.equal(state.readyCount,30);assert.equal(state.status,"completed");
 assert.deepEqual(state.questions.slice(0,4).map(q=>q.id),ready);assert.equal(Object.keys(state.answers).length,2);
 const slot=f.store.db.prepare("SELECT attempts FROM ai_learning_slots WHERE job_id=? AND position=5").get(f.id);
 assert.equal(slot.attempts,4);
 const bills=f.store.db.prepare("SELECT logical_key,state,charged_units FROM ai_points_operations WHERE logical_key LIKE ? ORDER BY created_at").all("ai-learning:"+f.id+":5:%");
 assert.equal(bills.length,4);assert.equal(bills.filter(b=>b.state==="refunded").length,3);
 assert.equal(bills.filter(b=>b.state==="settled").length,1);assert.equal(new Set(bills.map(b=>b.logical_key)).size,4);
 assert.equal(f.store.points.wallet(f.user.id).heldUnits,0);assert.equal(f.store.points.audit().passed,true);
});

test("ten-question generation repairs a genuinely absent fifth stem using full-object correction, not a seed fallback",async t=>{
 let sawCorrection=false;
 const f=await fixture(t,(q,{index,payload})=>{
  if(index===4){const next={...q};delete next.question;return next;}
  if(index===5){assert.match(payload.specs[0].correction,/question/);sawCorrection=true;}
  return q;
 },10);
 for(let i=0;i<10;i++)await f.pump();
 const state=f.view();assert.equal(state.status,"completed");assert.equal(state.readyCount,10);
 assert.equal(sawCorrection,true);assert.equal(f.model.generated,11);assert.equal(f.model.reviews,10);
 assert.ok(state.questions.every(q=>q.question!==f.model.seed.question));
 assert.equal(f.store.points.wallet(f.user.id).heldUnits,0);assert.equal(f.store.points.audit().passed,true);
});
