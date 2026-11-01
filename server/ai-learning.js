import crypto from "node:crypto";
import { z } from "zod";
import { learningProfile, learningBlueprint } from "./ai-personalization.js";
import { validateQuestion } from "./domain.js";
import { AI_QUESTION_GENERATOR_REVISION, learningErrorPresentation } from "./ai-question-contract.js";
import { questionSimilarity } from "./question-similarity.js";
import { checkAiCancellation } from "./ai-tasks.js";
import { commitPointsResult } from "./ai-points/runtime.js";
import { pointServicePrices } from "./ai-points/service-prices.js";
import { redact, safeLog } from "./security.js";

const fail = (message, status = 400, code = "AI_LEARNING_INVALID") => Object.assign(new Error(message), { status, code });
const uuid = () => crypto.randomUUID();
const digest = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const unpack = row => row ? { ...row, blueprint: JSON.parse(row.blueprint), data: JSON.parse(row.data) } : null;
const setupSchema = z.object({
  strategy: z.enum(["weakness", "challenge", "review", "balanced"]),
  count: z.union([z.literal(10), z.literal(20), z.literal(30), z.literal(50)]),
  kind: z.enum(["practice", "exam"]),
  durationMinutes: z.number().int().min(5).max(180).default(40),
  pointIds: z.array(z.string().regex(/^[a-f0-9]{24}$/)).max(8).default([]),
}).strict();
const createSchema = setupSchema.extend({
  requestId: z.string().uuid(), profileRevision: z.string().min(1).max(64), acceptedPricing: z.literal(true),
});
const activeStates = new Set(["queued", "running"]);
const choiceSchema = z.record(z.string().min(1).max(100), z.array(z.string().min(1).max(8)).max(8));

export function createAiLearning({ store, provider, ai, scheduler, questions, ensureReady = () => {}, now = Date.now,
  pricing = () => pointServicePrices(store), autoStart = true, tickMs = 1000, leaseMs = 300000 }) {
  const db = store.db;
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_learning_jobs (
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL,certificate_id TEXT NOT NULL,request_id TEXT NOT NULL,
      signature TEXT NOT NULL,kind TEXT NOT NULL,status TEXT NOT NULL,blueprint TEXT NOT NULL,data TEXT NOT NULL,
      group_id TEXT NOT NULL,lease_token TEXT,lease_until INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(user_id,certificate_id,request_id));
    CREATE UNIQUE INDEX IF NOT EXISTS ai_learning_active_owner ON ai_learning_jobs(user_id)
      WHERE status IN ('queued','running');
    CREATE TABLE IF NOT EXISTS ai_learning_slots (
      job_id TEXT NOT NULL,position INTEGER NOT NULL,question_id TEXT,attempts INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(job_id,position),UNIQUE(question_id));
    CREATE TABLE IF NOT EXISTS ai_learning_events (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,job_id TEXT NOT NULL,event_type TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS ai_learning_events_job_seq ON ai_learning_events(job_id,seq);
    CREATE INDEX IF NOT EXISTS ai_learning_jobs_owner ON ai_learning_jobs(user_id,certificate_id,created_at);
  `);
  const transaction = run => {
    db.exec("SAVEPOINT ai_learning");
    try { const result = run(); db.exec("RELEASE ai_learning"); return result; }
    catch (error) { db.exec("ROLLBACK TO ai_learning"); db.exec("RELEASE ai_learning"); throw error; }
  };
  const stamp = () => new Date(now()).toISOString();
  const row = id => unpack(db.prepare("SELECT * FROM ai_learning_jobs WHERE id=?").get(id));
  const owned = (id, user, certificate) => {
    const job = row(id);
    if (!job || job.user_id !== user || job.certificate_id !== certificate) throw fail("生成任务不存在或不属于当前账号与证书", 404);
    return job;
  };
  const event = (id, type, data = {}) => Number(db.prepare(
    "INSERT INTO ai_learning_events(job_id,event_type,data,created_at) VALUES(?,?,?,?)").run(id,type,JSON.stringify(data),stamp()).lastInsertRowid);
  const saveData = (job, data) => db.prepare("UPDATE ai_learning_jobs SET data=?,updated_at=? WHERE id=?")
    .run(JSON.stringify(data),stamp(),job.id);
  const slots = id => db.prepare("SELECT * FROM ai_learning_slots WHERE job_id=? ORDER BY position").all(id);
  const attemptLimit = (job, slot) => 3 + (job.data.recovery && slot && job.data.recovery.position === slot.position ? Number(job.data.recovery.attemptBase)||0 : 0);
  const protocolRecovery = (job, slot) => !!slot && job.data.generatorRevision !== AI_QUESTION_GENERATOR_REVISION &&
    !["AI_LEARNING_SEED_UNAVAILABLE","AI_LEARNING_QUESTION_WITHDRAWN"].includes(job.data.errorCode);
  const publicQ = q => {
    const { answer, analysis, expectedAnswer, ownerUserId, aiGroupId, certificateScopes, ...rest } = q;
    return rest;
  };
  const profile = (user, certificate) => learningProfile(questions(certificate,user),store.allA(user),certificate,now());
  const costView = () => {
    const prices = pricing(), model = prices.models?.find(m => m.id === prices.primaryModelId);
    return { available: prices.available === true, scale: prices.scale || 1000,
      sampleUnitsPerQuestion: model?.services?.find(s => s.id === "questions-1")?.sampleUnits ?? null,
      notice: "按生成与审核的实际用量逐题结算；价格示例不是账单或扣费上限，重试可能增加用量。失败题的预扣按既有规则退还，已交付题正常结算。" };
  };
  const quote = (user, certificate, raw) => {
    const setup = setupSchema.parse(raw), p = profile(user,certificate);
    if (setup.kind === "practice" && setup.count > 10) throw fail("日常练习每组 10 道；更多题目请使用 AI 考试");
    if (setup.pointIds.some(id => !p.points.some(point => point.id === id))) throw fail("所选知识范围已变化，请刷新");
    const blueprint = learningBlueprint(p,setup), cost = costView();
    return { blueprint, profileRevision: p.revision, pricing: {
      ...cost, sampleUnits: cost.sampleUnitsPerQuestion === null ? null : cost.sampleUnitsPerQuestion * setup.count,
    } };
  };
  const create = (user, certificate, raw) => transaction(() => {
    const body = createSchema.parse(raw), signature = digest(body);
    const old = unpack(db.prepare("SELECT * FROM ai_learning_jobs WHERE user_id=? AND certificate_id=? AND request_id=?")
      .get(user,certificate,body.requestId));
    if (old) {
      if (old.signature !== signature) throw fail("请求编号已用于其他方案",409,"AI_LEARNING_IDEMPOTENCY_CONFLICT");
      return view(old.id,user,certificate);
    }
    ensureReady(user);
    const existing = db.prepare("SELECT id FROM ai_learning_jobs WHERE user_id=? AND status IN ('queued','running')").get(user);
    if (existing) throw fail("已有个性化题组正在生成，请先继续该任务",409,"AI_LEARNING_ACTIVE");
    const {requestId,profileRevision,acceptedPricing,...setup} = body;
    const preview = quote(user,certificate,setup);
    if (preview.profileRevision !== profileRevision) throw fail("学习记录已更新，请重新确认推荐方案",409,"AI_LEARNING_PROFILE_CHANGED");
    if (!preview.pricing.available) throw fail("当前模型暂无可核验的价格，请联系管理员配置",503,"AI_LEARNING_PRICE_UNAVAILABLE");
    const id = uuid(), time = stamp();
    const groupId = store.createAiGroup(user,certificate,"个性化" + (setup.kind === "exam" ? "考试" : "练习"),setup.strategy === "challenge",
      {shared:false,groupType:"question_generation",metadata:{personalized:true,jobId:id,strategy:setup.strategy}});
    const data = { generatorRevision:AI_QUESTION_GENERATOR_REVISION, setup, pricing:preview.pricing, error:null, answers:{}, answersVersion:0,
      startedAt:null, durationMs:setup.durationMinutes * 60000, spentMs:0, runningSince:null, waiting:false, submitted:false, result:null };
    db.prepare(`INSERT INTO ai_learning_jobs(id,user_id,certificate_id,request_id,signature,kind,status,blueprint,data,group_id,created_at,updated_at)
      VALUES(?,?,?,?,?,?,'queued',?,?,?,?,?)`).run(id,user,certificate,requestId,signature,setup.kind,JSON.stringify(preview.blueprint),JSON.stringify(data),groupId,time,time);
    const insert = db.prepare("INSERT INTO ai_learning_slots(job_id,position) VALUES(?,?)");
    for (const slot of preview.blueprint.slots) insert.run(id,slot.position);
    event(id,"created",{targetCount:setup.count});
    return view(id,user,certificate);
  });
  const leaseOwned = (id, token) => {
    const job = row(id);
    if (!job || !activeStates.has(job.status) || job.lease_token !== token || job.lease_until <= now())
      throw fail("任务已由其他工作进程恢复，请重新读取进度",409,"AI_LEARNING_LEASE_LOST");
    return job;
  };
  // Normal buffering pauses only when all released questions are answered.
  // A blocked generator also pauses from its recorded failure time.
  const syncClock = (job, list = slots(job.id)) => {
    if (job.kind !== "exam" || !job.data.startedAt || job.data.submitted) return job;
    const d = {...job.data};
    const ready = list.filter(s => s.question_id);
    const generationBlocked = job.status === "blocked" && ready.length < job.blueprint.targetCount;
    const shouldWait = generationBlocked || ready.length < job.blueprint.targetCount &&
      ready.every(s => d.answers[s.question_id]?.length > 0);
    if (shouldWait && d.runningSince !== null) {
      const blocked = generationBlocked ? db.prepare("SELECT created_at FROM ai_learning_events WHERE job_id=? AND event_type='blocked' ORDER BY seq DESC LIMIT 1").get(job.id) : null;
      const pausedAt = blocked && Number.isFinite(Date.parse(blocked.created_at)) ? Math.min(now(),Date.parse(blocked.created_at)) : now();
      d.spentMs += Math.max(0,pausedAt - d.runningSince); d.runningSince = null;
    } else if (!shouldWait && d.runningSince === null) d.runningSince = now();
    if (d.waiting !== shouldWait || d.runningSince !== job.data.runningSince) {
      d.waiting = shouldWait; saveData(job,d); job = {...job,data:d};
    }
    return job;
  };
  const view = (id,user,certificate) => {
    let job = owned(id,user,certificate);
    const list = slots(id);
    job = syncClock(job,list);
    const elapsedMs = job.data.spentMs + (job.data.runningSince === null ? 0 : Math.max(0,now() - job.data.runningSince));
    const released = list.filter(s => s.question_id);
    const pending = list.find(s => !s.question_id), errorView = learningErrorPresentation(job.data.error,job.data.errorCode);
    // Never serialise the durable job JSON wholesale: it includes private results.
    return {
      id:job.id,kind:job.kind,status:job.status,strategy:job.blueprint.strategy,targetCount:job.blueprint.targetCount,
      readyCount:released.length,answeredCount:released.filter(s => job.data.answers[s.question_id]?.length).length,
      blueprint:{...job.blueprint,slots:job.blueprint.slots.map(({seedId,...s})=>s)}, groupId:job.group_id,
      questions:released.map(s => {
        const q=store.getQ(s.question_id);
        if(!q || store.isQuestionHidden(q.id))throw fail("本卷包含已下架题目，作答记录已保留，请联系管理员",409,"AI_LEARNING_QUESTION_WITHDRAWN");
        return {...publicQ(q),position:s.position};
      }),
      answers:job.data.answers,answersVersion:job.data.answersVersion,startedAt:job.data.startedAt,
      remainingMs:job.kind === "exam" ? Math.max(0,job.data.durationMs-elapsedMs) : null,
      waiting:job.data.waiting,submitted:job.data.submitted,result:job.data.submitted ? job.data.result : null,
      pricing:job.data.pricing,
      progress:job.data.progress||{stage:job.status==="completed"?"done":"queued",position:released.length+1},
      retryable:job.status==="blocked"&&!job.data.submitted&&!!pending&&(pending.attempts<attemptLimit(job,pending)||protocolRecovery(job,pending)),
      recoveryAvailable:job.status==="blocked"&&!job.data.submitted&&protocolRecovery(job,pending),
      errorCode:errorView.code,
      billing:{
        chargedUnits:Number(db.prepare("SELECT COALESCE(SUM(charged_units),0) AS n FROM ai_points_operations WHERE user_id=? AND logical_key LIKE ?").get(user,"ai-learning:"+job.id+":%").n),
        heldUnits:Number(db.prepare("SELECT COALESCE(SUM(held_units),0) AS n FROM ai_points_operations WHERE user_id=? AND logical_key LIKE ? AND state='pending'").get(user,"ai-learning:"+job.id+":%").n),
        scale:job.data.pricing.scale,
      },error:errorView.message,createdAt:job.created_at,updatedAt:job.updated_at,
      eventId:Number(db.prepare("SELECT COALESCE(MAX(seq),0) AS n FROM ai_learning_events WHERE job_id=?").get(id).n),
    };
  };
  const list = (user,certificate) => db.prepare("SELECT id FROM ai_learning_jobs WHERE user_id=? AND certificate_id=? ORDER BY created_at DESC LIMIT 30")
    .all(user,certificate).map(({id})=>{
      const v=view(id,user,certificate);
      return {id:v.id,kind:v.kind,status:v.status,strategy:v.strategy,targetCount:v.targetCount,readyCount:v.readyCount,
        answeredCount:v.answeredCount,submitted:v.submitted,createdAt:v.createdAt,error:v.error};
    });
  const events = (id,user,certificate,after=0) => {
    owned(id,user,certificate);
    if(!Number.isSafeInteger(after)||after<0)throw fail("续接事件编号无效");
    return db.prepare("SELECT seq,event_type,data FROM ai_learning_events WHERE job_id=? AND seq>? ORDER BY seq LIMIT 100")
      .all(id,after).map(e=>({id:Number(e.seq),type:e.event_type,data:JSON.parse(e.data)}));
  };
  const start = (id,user,certificate) => transaction(()=>{
    const job=owned(id,user,certificate);
    if(job.data.submitted)return view(id,user,certificate);
    const available=slots(id).filter(s=>s.question_id).length;
    if(!available || available < Math.min(3,job.blueprint.targetCount) && activeStates.has(job.status))throw fail("首批题目尚未通过审核，请稍候",409);
    if(!job.data.startedAt){
      saveData(job,{...job.data,startedAt:stamp(),runningSince:now()});
      event(id,"started");
    }
    return view(id,user,certificate);
  });
  const validateAnswers = (job,raw) => {
    const answers=choiceSchema.parse(raw), ready=new Set(slots(job.id).filter(s=>s.question_id).map(s=>s.question_id));
    for(const [id,selected] of Object.entries(answers)){
      const q=store.getQ(id);
      if(!ready.has(id)||!q||new Set(selected).size!==selected.length||selected.some(a=>!Object.hasOwn(q.options,a))||
        (q.type!=="multiple_choice"&&selected.length>1))throw fail("答案包含尚未就绪题目或无效选项");
    }
    return answers;
  };
  const saveAnswers = (id,user,certificate,raw) => transaction(()=>{
    const body=z.object({expectedVersion:z.number().int().nonnegative(),answers:choiceSchema}).strict().parse(raw);
    const job=syncClock(owned(id,user,certificate));
    if(!job.data.startedAt||job.data.submitted)throw fail("本次作答尚未开始或已经交卷",409);
    const patch=validateAnswers(job,body.answers);
    // Lost-ack retries may replay an identical delta even after its version advanced.
    const same=Object.entries(patch).every(([q,a])=>JSON.stringify(job.data.answers[q]||[])===JSON.stringify(a));
    if(body.expectedVersion!==job.data.answersVersion&&!same)
      throw fail("另一设备已更新作答，已保留服务器记录，请重新载入",409,"AI_LEARNING_ANSWERS_CONFLICT");
    if(same)return view(id,user,certificate);
    const elapsed=job.data.spentMs+(job.data.runningSince===null?0:now()-job.data.runningSince);
    if(job.kind==="exam"&&elapsed>=job.data.durationMs)throw fail("考试时间已到，请交卷",409,"AI_LEARNING_EXPIRED");
    if(!same){
      saveData(job,{...job.data,answers:{...job.data.answers,...patch},answersVersion:job.data.answersVersion+1});
      event(id,"answers-saved",{version:job.data.answersVersion+1});
    }
    return view(id,user,certificate);
  });
  const submit = (id,user,certificate,raw) => transaction(()=>{
    const body=z.object({expectedVersion:z.number().int().nonnegative(),partial:z.boolean().default(false)}).strict().parse(raw);
    let job=syncClock(owned(id,user,certificate));
    if(job.data.submitted)return view(id,user,certificate);
    if(!job.data.startedAt)throw fail("请先开始作答",409);
    if(body.expectedVersion!==job.data.answersVersion)throw fail("作答版本已更新，请先同步答案",409,"AI_LEARNING_ANSWERS_CONFLICT");
    const ready=slots(id).filter(s=>s.question_id);
    if(ready.length!==job.blueprint.targetCount&&!body.partial)throw fail("题目尚未全部就绪，可继续等待或明确选择部分交卷",409,"AI_LEARNING_INCOMPLETE");
    const elapsed=Math.min(job.data.durationMs,job.data.spentMs+(job.data.runningSince===null?0:Math.max(0,now()-job.data.runningSince)));
    const results=ready.map(s=>{
      const q=store.getQ(s.question_id);
      if(!q||store.isQuestionHidden(q.id))throw fail("试卷包含已下架题目，原记录已保留",409);
      const attempt=store.recordAttempt(q.id,job.data.answers[q.id]||[],Math.round(elapsed/Math.max(1,ready.length)),
        job.kind==="exam"?"exam":"practice",user,undefined,"ai-learning:"+id+":"+s.position,job.certificate_id);
      return {...publicQ(q),...attempt};
    });
    const partial=ready.length!==job.blueprint.targetCount;
    const result={score:results.filter(r=>r.correct).length,maxScore:ready.length,targetCount:job.blueprint.targetCount,
      partial,elapsed,results,notice:partial?"部分完成，不作为完整模拟考试成绩":"AI 个性化训练成绩，非官方考试评分"};
    saveData(job,{...job.data,submitted:true,result,runningSince:null,spentMs:elapsed,waiting:false});
    if(partial)db.prepare("UPDATE ai_learning_jobs SET status='canceled',lease_token=NULL,lease_until=0 WHERE id=?").run(id);
    event(id,"submitted",{partial});
    return view(id,user,certificate);
  });
  const cancel = (id,user,certificate) => transaction(()=>{
    const job=owned(id,user,certificate);
    if(activeStates.has(job.status)||job.status==="blocked"){
      db.prepare("UPDATE ai_learning_jobs SET status='canceled',lease_token=NULL,lease_until=0,updated_at=? WHERE id=?").run(stamp(),id);
      event(id,"canceled");
    }
    return view(id,user,certificate);
  });
  const retry = (id,user,certificate) => transaction(()=>{
    const job=syncClock(owned(id,user,certificate));
    if(job.status!=="blocked"||job.data.submitted)throw fail("当前任务不需要恢复",409);
    const next=slots(id).find(s=>!s.question_id);
    if(!next)throw fail("本组题目已交付",409);
    const outdated=protocolRecovery(job,next);
    if(next.attempts>=attemptLimit(job,next)&&!outdated)throw fail("已达到本轮重试上限，已交付题目与作答保留；请核对服务或调整方案后再生成",409,"AI_LEARNING_RETRY_LIMIT");
    ensureReady(user);
    if(db.prepare("SELECT 1 FROM ai_learning_jobs WHERE user_id=? AND id<>? AND status IN ('queued','running')").get(user,id))
      throw fail("账号已有其他生成任务",409);
    db.prepare("UPDATE ai_learning_jobs SET status='queued',lease_token=NULL,lease_until=0,next_at=0,updated_at=? WHERE id=?").run(stamp(),id);
    // Keep monotonically increasing attempts: old refunded billing keys must never be reused.
    const recovery=outdated&&next.attempts>=attemptLimit(job,next)?{position:next.position,attemptBase:next.attempts,revision:AI_QUESTION_GENERATOR_REVISION}:job.data.recovery;
    saveData(job,{...job.data,error:null,errorCode:null,generatorRevision:AI_QUESTION_GENERATOR_REVISION,
      ...(recovery?{recovery}:{}),progress:{position:next.position,stage:"queued"}});
    event(id,"resumed",{generatorRevision:AI_QUESTION_GENERATOR_REVISION,position:next.position});
    return view(id,user,certificate);
  });
  let stopping=false, pumping=false;
  const inflight=new Set(), streams=new Set();
  const claim = () => transaction(()=>{
    const candidates=db.prepare("SELECT id FROM ai_learning_jobs WHERE status IN ('queued','running') AND lease_until<=? AND next_at<=? ORDER BY updated_at,id LIMIT 50")
      .all(now(),now());
    for(const candidate of candidates){
      const job=row(candidate.id);
      if(scheduler.busy(job.user_id))continue;
      const token=uuid();
      const result=db.prepare("UPDATE ai_learning_jobs SET lease_token=?,lease_until=?,status='running',updated_at=? WHERE id=? AND lease_until<=? AND status IN ('queued','running')")
        .run(token,now()+leaseMs,stamp(),job.id,now());
      if(result.changes)return {...row(job.id),lease_token:token};
    }
    return null;
  });
  const runSlot = async claimed => {
    const token=claimed.lease_token;
    let attemptNumber=0;
    const heartbeat=setInterval(()=>{
      if(stopping)return;
      db.prepare("UPDATE ai_learning_jobs SET lease_until=? WHERE id=? AND lease_token=? AND status='running'")
        .run(now()+leaseMs,claimed.id,token);
    },Math.max(50,Math.min(15000,Math.floor(leaseMs/3))));
    heartbeat.unref?.();
    try{
      const job=leaseOwned(claimed.id,token);
      const slot=slots(job.id).find(s=>!s.question_id);
      if(!slot)throw fail("生成任务没有待处理题目",409);
      if(slot.attempts>=attemptLimit(job,slot))throw fail("已达到该题本轮重试上限",409,"AI_LEARNING_RETRY_LIMIT");
      attemptNumber=slot.attempts+1;
      db.prepare("UPDATE ai_learning_slots SET attempts=? WHERE job_id=? AND position=? AND question_id IS NULL")
        .run(attemptNumber,job.id,slot.position);
      const plan=job.blueprint.slots[slot.position-1];
      await ai(job.user_id,async()=>{
        checkAiCancellation();leaseOwned(job.id,token);
        const seed=questions(job.certificate_id,job.user_id).find(q=>q.id===plan.seedId);
        if(!seed)throw fail("参考题目已不可用，已保留本次生成成果",409,"AI_LEARNING_SEED_UNAVAILABLE");
        let lastStage="",lastProgressAt=0;
        saveData(leaseOwned(job.id,token),{...row(job.id).data,progress:{position:slot.position,stage:"prepare"}});
        const generated=await provider.generateBankExpansion(seed,1,{
          userId:job.user_id,certificateId:job.certificate_id,difficulty:plan.difficulty,maxRounds:2,
          learningGoal:{strategy:job.blueprint.strategy,stage:plan.stage},
          onProgress:progress=>{
            const stage=String(progress.stage||"").startsWith("review")?"review":progress.stage==="validate"?"validate":progress.stage==="generate"||progress.stage==="streaming"?"generate":"prepare";
            if(stage===lastStage&&now()-lastProgressAt<1200)return;
            const current=row(job.id);
            if(!current||current.lease_token!==token||!activeStates.has(current.status)||current.lease_until<=now())return;
            lastStage=stage;lastProgressAt=now();
            const status={position:slot.position,stage};
            saveData(current,{...current.data,progress:status});event(job.id,"progress",status);
          },
        });
        checkAiCancellation();leaseOwned(job.id,token);
        if(!Array.isArray(generated)||generated.length!==1)throw fail("生成结果题量不完整");
        const existing=store.allQ();
        const q=validateQuestion(generated[0],existing,seed);
        if(q.difficulty!==plan.difficulty)throw fail("题目难度与已确认方案不一致");
        if(existing.some(other=>questionSimilarity(q,other)>=0.9))throw fail("题目与已有内容重复，正在重试");
        const question={...q,id:"ai-learning-"+uuid(),source:"ai_generated",sourceLabel:"AI 个性化生成",
          ownerUserId:job.user_id,certificates:[job.certificate_id],targetKnowledgePoint:plan.knowledgePoint,
          chapter:plan.chapter,knowledgeSection:plan.knowledgeSection||undefined,knowledgePoint:plan.knowledgePoint,
          aiGroupId:job.group_id,createdAt:stamp(),learningStage:plan.stage};
        return commitPointsResult(store,job.user_id,{jobId:job.id,position:slot.position,questionId:question.id},()=>{
          leaseOwned(job.id,token);
          store.addQ(question);
          db.prepare("INSERT INTO queue(question_id,topic,user_id,group_id) VALUES(?,?,?,?)")
            .run(question.id,"ai-learning:"+job.id,job.user_id,job.group_id);
          const updated=db.prepare("UPDATE ai_learning_slots SET question_id=? WHERE job_id=? AND position=? AND question_id IS NULL")
            .run(question.id,job.id,slot.position);
          if(updated.changes!==1)throw fail("题目已由其他工作进程交付",409);
          const count=Number(db.prepare("SELECT COUNT(*) AS n FROM ai_learning_slots WHERE job_id=? AND question_id IS NOT NULL").get(job.id).n);
          const current=leaseOwned(job.id,token);
          saveData(current,{...current.data,error:null,errorCode:null,progress:{stage:count===job.blueprint.targetCount?"done":"queued",position:Math.min(count+1,job.blueprint.targetCount)}});
          db.prepare("UPDATE ai_learning_jobs SET status=?,lease_token=NULL,lease_until=0,next_at=0,updated_at=? WHERE id=? AND lease_token=?")
            .run(count===job.blueprint.targetCount?"completed":"queued",stamp(),job.id,token);
          // Readjust server time immediately when a new question becomes available,
          // even while the client is disconnected.
          syncClock(row(job.id));
          event(job.id,"question-ready",{position:slot.position,question:publicQ(question),readyCount:count});
          if(count===job.blueprint.targetCount)event(job.id,"completed",{readyCount:count});
        });
      },{forceNew:true,requestKey:"ai-learning:"+job.id+":"+slot.position+":"+attemptNumber,
        signature:digest({jobId:job.id,plan}),certificateId:job.certificate_id,feature:"ai-learning-question"});
    }catch(error){
      transaction(()=>{
        const current=row(claimed.id);
        if(!current||current.lease_token!==token)return;
        const detail=redact(error instanceof Error?error.message:"题目生成失败").slice(0,1000);
        const presentation=learningErrorPresentation(detail,error.code,error.issues),message=presentation.message;
        const currentSlot=slots(current.id).find(s=>!s.question_id);
        const blocked=!stopping&&(attemptNumber>=attemptLimit(current,currentSlot)||String(error.code||"").startsWith("AI_POINTS_")||
          ["AI_LEARNING_RETRY_LIMIT","AI_LEARNING_SEED_UNAVAILABLE"].includes(error.code));
        db.prepare("UPDATE ai_learning_jobs SET status=?,lease_token=NULL,lease_until=0,next_at=?,updated_at=? WHERE id=? AND lease_token=?")
          .run(blocked?"blocked":"queued",now()+(stopping?0:Math.min(30000,1000*2**attemptNumber)),stamp(),claimed.id,token);
        saveData(current,{...current.data,error:stopping?null:message,errorDetail:detail,errorCode:stopping?null:presentation.code,progress:{...current.data.progress,stage:blocked?"blocked":"retrying"}});
        event(claimed.id,blocked?"blocked":"retrying",{message:stopping?"任务将从已保存题目恢复":message});
        if(blocked)syncClock(row(current.id));
      });
    }finally{clearInterval(heartbeat);}
  };
  const pump = async()=>{
    if(stopping||pumping)return;
    pumping=true;
    try{
      while(!stopping&&scheduler.available>0){
        const job=claim();if(!job)break;
        const work=runSlot(job);inflight.add(work);
        work.finally(()=>inflight.delete(work)).catch(()=>{});
      }
    }finally{pumping=false;}
  };
  const interval=autoStart?setInterval(()=>void pump().catch(error=>safeLog("个性化任务调度失败："+redact(error.message))),tickMs):null;
  interval?.unref();
  const stop=()=>{stopping=true;if(interval)clearInterval(interval);for(const close of streams)close();};
  const settle=()=>Promise.allSettled([...inflight]);

  const register = ({app,route,requestUserId,requireCertificate,sessionUser})=>{
    const context=req=>({user:requestUserId(req),certificate:requireCertificate(req)});
    route("get","/api/ai-learning/profile",req=>{const c=context(req);return profile(c.user,c.certificate);});
    route("post","/api/ai-learning/preview",req=>{const c=context(req);return quote(c.user,c.certificate,req.body);});
    route("get","/api/ai-learning/jobs",req=>{const c=context(req);return {jobs:list(c.user,c.certificate)};});
    route("post","/api/ai-learning/jobs",req=>{const c=context(req);return create(c.user,c.certificate,req.body);});
    route("get","/api/ai-learning/jobs/:id",req=>{const c=context(req);return view(req.params.id,c.user,c.certificate);});
    for(const [action,fn] of [["start",start],["answers",saveAnswers],["submit",submit],["cancel",cancel],["retry",retry]]){
      route("post","/api/ai-learning/jobs/:id/"+action,req=>{const c=context(req);return fn(req.params.id,c.user,c.certificate,req.body);});
    }
    // The subscription has no ownership of the worker or its cancellation signal.
    app.get("/api/ai-learning/jobs/:id/events",(req,res,next)=>{
      let c,after;
      try{
        c=context(req);owned(req.params.id,c.user,c.certificate);
        after=Number(req.query.after||req.get("Last-Event-ID")||0);
        if(!Number.isSafeInteger(after)||after<0)throw fail("续接事件编号无效");
      }catch(error){next(error);return;}
      res.status(200).set({"Content-Type":"text/event-stream; charset=utf-8","Cache-Control":"no-cache, no-transform",
        "X-Accel-Buffering":"no","Connection":"keep-alive"});
      res.flushHeaders();
      let closed=false;
      const close=()=>{if(closed)return;closed=true;clearInterval(poll);clearInterval(beat);streams.delete(close);res.end();};
      const flush=()=>{
        if(closed)return;
        // Long-lived subscriptions must not outlive authentication or certificate changes.
        try{
          const user=sessionUser(req);
          if(!user||user.id!==c.user||user.bannedAt||user.certificateId!==c.certificate||res.writableLength>262144){close();return;}
          for(const e of events(req.params.id,c.user,c.certificate,after)){
            res.write("id: "+e.id+"\nevent: "+e.type+"\ndata: "+JSON.stringify(e)+"\n\n");after=e.id;
          }
          if(stopping)close();
        }catch{close();}
      };
      const poll=setInterval(flush,700),beat=setInterval(()=>{if(!closed)res.write(": heartbeat\n\n");},15000);
      streams.add(close);res.on("close",close);flush();
    });
  };
  return {profile,quote,create,view,list,events,start,saveAnswers,submit,cancel,retry,pump,stop,settle,register};
}
