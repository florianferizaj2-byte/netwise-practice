import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { createStudyStore } from "./study-store.js";
import { createStudyAI } from "./study-ai.js";
import { studyNodes, studyNode, studyError, publicStudyQuestion, teacherAnswerSchema,
  studyPackageSchema, studyReviewSchema, acceptedStudyReview } from "./study-content.js";
import { gradeStudyQuestion, summarizeStudyGrade } from "./study-grading.js";
import { checkAiCancellation, positiveInteger } from "./ai-tasks.js";
import { redact } from "./security.js";
import { normalizeStudyText, studyPromptAttack, unsafeStudyTeacherAnswer } from "./study-security.js";

const deploymentStudySeeds = JSON.parse(
  readFileSync(new URL("./study-seeds/network-engineer.json", import.meta.url), "utf8"),
);
if (deploymentStudySeeds.schemaVersion !== 1 || !Array.isArray(deploymentStudySeeds.packages))
  throw new Error("网络工程师课程部署种子格式无效");

export function registerStudyRoutes({ route, store, provider, requireAdmin, requestUserId, ai, requireAiService,
  studyAI, studySeeds = deploymentStudySeeds.packages }) {
  const content = createStudyStore(store.db);
  if (studySeeds) content.installPublishedSeeds(studySeeds);
  const teacher = studyAI || createStudyAI(provider, store);
  const worker = crypto.randomUUID(), active = new Set();
  const configuredDailyLimit = positiveInteger(process.env.STUDY_GENERATION_DAILY_LIMIT, 20, 200);
  let generationDailyLimit = configuredDailyLimit;
  let stopped = false;
  const paidStudyPlans = new Set(["vip", "svip", "ssvip"]);
  const member = (req) => {
    if (!req.user) throw studyError("请先登录", 401);
    const userId = requestUserId(req), entitlement = store.accountEntitlement(userId);
    if (!paidStudyPlans.has(entitlement.plan))
      throw studyError("AI 精讲与练习仅限有效 VIP 会员，请先开通或续期", 403, "STUDY_MEMBERSHIP_REQUIRED");
    return { userId, plan: entitlement.plan };
  };
  const nodeFor = (req, id) => studyNode(id, req.user?.certificateId);
  const referenceForNode = (node) => {
    const target = node.parentName || node.name;
    const aliases = new Set([target, ...(node.aliases || [])].map((value) => String(value).trim()).filter(Boolean));
    const layerPatterns = {
      physical: /物理层|比特|信号|集线器|中继器|光纤|双绞线|无线介质|物理介质|hub|repeater/i,
      "data-link": /数据链路层|链路层|数据帧|帧同步|MAC地址|MAC寻址|网桥|交换机|CRC/i,
      network: /网络层|网际层|IP地址|路由|分组转发|路由器|网络协议/i,
      transport: /传输层|端到端|TCP|UDP|端口|传输控制/i,
      session: /会话层|会话管理|对话控制|会话同步/i,
      presentation: /表示层|表示转换|数据表示|字符编码|压缩|加密|解密/i,
      application: /应用层|应用协议|HTTP|DNS|FTP|SMTP|网络服务/i,
    };
    const layerPattern = node.sublesson ? layerPatterns[node.sublesson.id] : null;
    const questions = store.allQ().filter((question) => {
      if (!["practice", "network_engineer_supplement"].includes(question.source) ||
          !question.certificates?.includes(node.certificateId) || question.chapter !== node.chapter) return false;
      const tags = [question.targetKnowledgePoint, question.knowledgePoint].flatMap((value) => Array.isArray(value) ? value : [value]).filter(Boolean);
      if (!tags.some((tag) => aliases.has(String(tag).trim()))) return false;
      if (!layerPattern) return true;
      const options = Object.values(question.options || {}).join(" ");
      return layerPattern.test([question.question, question.expectedAnswer, question.analysis, options].join(" "));
    }).slice(0, 6);
    const prefix = `已审核考纲范围（用于限定本课，不作为事实证据）：${node.scope}`;
    const sourceNote = questions.length
      ? `本站已复核的${node.chapter}练习题，可用于核对常见考点；仍须以知识原理独立审核。`
      : "当前没有匹配到已复核练习题。请只讲解稳定、基础且明确属于本知识点的内容；有疑问的事实应在 AI 审核中拒绝，并由管理员补充资料。";
    const material = questions.map((question, index) => {
      const expected = question.expectedAnswer || (Array.isArray(question.answer) ? question.answer : [])
        .map((letter) => question.options?.[letter]).filter(Boolean).join("；");
      return `参考${index + 1}（本站已复核练习）：\n${question.question}\n${expected}\n${question.analysis}`;
    }).join("\n\n");
    return { reference: [prefix, sourceNote, material].filter(Boolean).join("\n\n").slice(0, 6000), count: questions.length,
      referenceMode: questions.length ? "question-bank" : "outline-only" };
  };
  const published = (node) => {
    const item = content.published(node);
    if (!item) throw studyError("本课正在准备中，请先学习其他已发布知识点", 404, "STUDY_LESSON_NOT_READY");
    return item;
  };
  const ownedSession = (req, id) => {
    const { userId } = member(req);
    const session = content.session(id, userId);
    if (!session) throw studyError("练习不存在", 404);
    nodeFor(req, session.node_id);
    const item = content.package(session.package_id);
    if (item?.status !== "published") throw studyError("这组内容已下架，请重新选择练习", 409, "STUDY_CONTENT_SUSPENDED");
    return { session, item, userId };
  };
  const attemptView = (item) => ({ id: item.id, questionId: item.question_id,
    answers: item.data.answers, ...item.data.result, status: item.status,
    // The row's processing state takes precedence over an unfinished result.
    processing: item.status === "processing", reviewNote: item.data.reviewNote || "",
    retryable: item.status === "pending_review" || (item.status === "processing" && item.lease_until < new Date().toISOString()),
  });
  const sessionView = (session, item) => ({ id: session.id, nodeId: session.node_id, packageId: item.id,
    questions: session.data.questionIds.map((id) => publicStudyQuestion(item.data.bundle.questions.find((q) => q.id === id))),
    attempts: content.attempts(session.id, session.user_id).map(attemptView),
    mastery: content.mastery(session.user_id, session.node_id),
  });
  const drain = () => {
    if (stopped) return;
    while (active.size < 1) {
      const job = content.claimJob(worker,
        generationDailyLimit);
      if (!job) break;
      const operation = ai(`study-content:${job.id}`, async () => {
        requireAiService();
        const node = studyNode(job.node_id);
        if (node.version !== job.data.node.version) throw studyError("课程范围已改变，请重新生成", 409);
        const generated = await teacher.generate(node, job.data.reference, job.created_by);
        checkAiCancellation();
        const bundle = studyPackageSchema.parse(generated.bundle);
        const review = studyReviewSchema.parse(generated.review);
        const current = content.job(job.id);
        if (current.status !== "running" || current.worker !== worker) return;
        const accepted = acceptedStudyReview(bundle, review);
        const item = content.savePackage(node, { bundle, review, accepted }, job.data.reference, job.created_by);
        const completed = accepted ? content.publish(item.id, job.created_by, node) : item;
        content.finishJob(job.id, worker, completed);
      }).catch((error) => content.finishJob(job.id, worker, null, redact(error.message).slice(0, 300) || "生成未完成，请重试"))
        .finally(() => { active.delete(operation); });
      active.add(operation);
    }
  };
  const timer = setInterval(drain, 1500);
  timer.unref();

  route("get", "/api/study/catalog", (req) => {
    if (!req.user) throw studyError("请先登录", 401);
    const userId = requestUserId(req), entitlement = store.accountEntitlement(userId);
    const nodes = studyNodes.filter((node) => node.certificateId === req.user.certificateId);
    if (!paidStudyPlans.has(entitlement.plan)) return { access: false, supported: nodes.length > 0, nodes: [] };
    const progress = content.progress(userId);
    return { access: true, expiresAt: entitlement.expiresAt,
      supported: nodes.length > 0,
      nodes: nodes.map((node) => {
        const item = content.published(node), row = progress.find((p) => p.node_id === node.id);
        return { ...node, available: !!item, packageId: item?.id || null,
          completed: !!row?.completed_at, progressVersion: row?.version || 0,
          mastery: content.mastery(userId, node.id) };
      }),
    };
  });
  route("get", "/api/study/lessons/:nodeId", (req) => {
    member(req);
    const node = nodeFor(req, req.params.nodeId), item = published(node);
    return { node, packageId: item.id, lesson: item.data.bundle.lesson, questionCount: item.data.bundle.questions.length };
  });
  route("post", "/api/study/lessons/:nodeId/complete", (req) => {
    const { userId } = member(req), node = nodeFor(req, req.params.nodeId);
    published(node);
    const { version } = z.object({ version: z.number().int().nonnegative() }).strict().parse(req.body);
    return content.complete(userId, node, version);
  });
  route("post", "/api/study/practice-sessions", (req) => {
    const { userId } = member(req);
    const body = z.object({ nodeId: z.string(), resume: z.boolean().default(true) }).strict().parse(req.body);
    const node = nodeFor(req, body.nodeId), item = published(node);
    if (!content.progress(userId).some((row) => row.node_id === node.id && row.completed_at))
      throw studyError("请先阅读本课并点击“我学完了”，再开始练习", 409, "STUDY_LEARNING_REQUIRED");
    const old = body.resume ? content.recentSession(userId, node.id, item.id) : null;
    if (old) return sessionView(old, item);
    const history = store.db.prepare("SELECT question_id,status,data FROM study_attempts WHERE user_id=? AND package_id=? ORDER BY created_at").all(userId, item.id);
    const weights = { "基础": 0, "理解": 1, "应用": 2 };
    const mastered = content.mastery(userId, node.id).mastered;
    const questions = [...item.data.bundle.questions].sort((a, b) => {
      const rank = (q) => {
        const attempts = history.filter((row) => row.question_id === q.id);
        const wrong = attempts.some((row) => row.status === "graded" && !JSON.parse(row.data).result.correct);
        return (wrong ? -10 : attempts.length ? 10 : 0) + (mastered ? 2 - weights[q.stage] : weights[q.stage]);
      };
      return rank(a) - rank(b);
    });
    return sessionView(content.createSession(userId, node, item, questions.slice(0, 5).map((q) => q.id)), item);
  });
  route("get", "/api/study/practice-sessions/:id", (req) => {
    const { session, item } = ownedSession(req, req.params.id);
    return sessionView(session, item);
  });
  const grade = async (attempt, item, question) => {
    let results = gradeStudyQuestion(question, attempt.data.answers), error = "";
    if (results.some((row) => row.verdict === "uncertain")) {
      try {
        requireAiService();
        results = await ai(attempt.user_id, () => teacher.grade(question, results, item.data.reference, attempt.user_id));
        // A test adapter or upstream result must not alter already-decided
        // blanks, manufacture points, or return a missing/duplicate blank.
        const deterministic = gradeStudyQuestion(question, attempt.data.answers);
        if (results.length !== deterministic.length || new Set(results.map((r) => r.blankId)).size !== results.length)
          throw new Error("判分空号不一致");
        results = deterministic.map((original) => {
          if (original.verdict !== "uncertain") return original;
          const candidate = results.find((r) => r.blankId === original.blankId);
          if (!candidate || !["correct", "incorrect", "uncertain"].includes(candidate.verdict)) throw new Error("判分结果无效");
          return { ...original, verdict: candidate.verdict, score: candidate.verdict === "correct" ? 1 : 0,
            reason: String(candidate.reason).slice(0, 120) };
        });
      } catch (failure) {
        error = redact(failure.message).slice(0, 300);
        results = gradeStudyQuestion(question, attempt.data.answers);
      }
    }
    const result = { ...summarizeStudyGrade(results), explanation: question.explanation, hint: question.hint };
    return attemptView(content.finishAttempt(attempt, result, error));
  };
  route("post", "/api/study/practice-sessions/:id/attempts", async (req) => {
    const { session, item, userId } = ownedSession(req, req.params.id);
    const body = z.object({ questionId: z.string(), requestId: z.string().uuid(),
      answers: z.record(z.string().regex(/^b[1-3]$/), z.string().max(400)),
    }).strict().parse(req.body);
    const question = item.data.bundle.questions.find((q) => q.id === body.questionId && session.data.questionIds.includes(q.id));
    if (!question || Object.keys(body.answers).some((id) => !question.blanks.some((blank) => blank.id === id)))
      throw studyError("题目或空号不属于这次练习");
    const answers = Object.fromEntries(question.blanks.map((blank) => [blank.id, body.answers[blank.id] || ""]));
    const initial = summarizeStudyGrade(gradeStudyQuestion(question, answers));
    const saved = content.createAttempt(userId, session, question.id, body.requestId, answers, initial);
    return saved.created ? grade(saved.attempt, item, question) : attemptView(saved.attempt);
  });
  route("get", "/api/study/attempts/:id", (req) => {
    const { userId } = member(req), attempt = content.attempt(req.params.id, userId);
    if (!attempt) throw studyError("作答不存在", 404);
    nodeFor(req, attempt.node_id);
    return attemptView(attempt);
  });
  route("post", "/api/study/attempts/:id/retry", async (req) => {
    const { userId } = member(req), old = content.attempt(req.params.id, userId);
    if (!old) throw studyError("作答不存在", 404);
    const { item } = ownedSession(req, old.session_id);
    const claimed = content.claimAttempt(old.id, userId);
    return claimed ? grade(claimed, item, item.data.bundle.questions.find((q) => q.id === old.question_id)) : attemptView(old);
  });
  route("post", "/api/study/attempts/:id/feedback", (req) => {
    const { userId } = member(req), attempt = content.attempt(req.params.id, userId);
    if (!attempt) throw studyError("作答不存在", 404);
    nodeFor(req, attempt.node_id);
    const { note } = z.object({ note: z.string().trim().min(2).max(500) }).strict().parse(req.body);
    content.feedback(userId, attempt, note);
    return { saved: true };
  });
  route("get", "/api/study/teacher/history", (req) => {
    const { userId } = member(req), node = nodeFor(req, String(req.query.nodeId)), item = published(node);
    return { messages: content.teacherHistory(userId, item.id) };
  });
  route("post", "/api/study/teacher", async (req) => {
    const { userId, plan } = member(req);
    const body = z.object({ nodeId: z.string(), requestId: z.string().uuid(),
      message: z.string().trim().min(2).max(600),
      action: z.enum(["ask", "simple", "example", "hint"]).default("ask"),
      sessionId: z.string().uuid().optional(), questionId: z.string().optional(),
    }).strict().parse(req.body);
    body.message = normalizeStudyText(body.message);
    if (body.message.length < 2) throw studyError("请填写你的知识问题");
    if (body.message.length > 600) throw studyError("问题太长，请拆成几个短问题");
    if (studyPromptAttack(body.message))
      throw studyError("请提问课程知识；更改规则、索取内部信息或强行给分的要求无法处理。", 400, "STUDY_PROMPT_REJECTED");
    const node = nodeFor(req, body.nodeId), item = published(node), lesson = item.data.bundle.lesson;
    let question = null, submitted = false;
    if (body.sessionId || body.questionId) {
      if (!body.sessionId || !body.questionId) throw studyError("练习信息不完整");
      const owned = ownedSession(req, body.sessionId);
      if (owned.session.node_id !== node.id || owned.item.id !== item.id) throw studyError("练习版本已经变化，请重新打开", 409);
      question = item.data.bundle.questions.find((q) => q.id === body.questionId && owned.session.data.questionIds.includes(q.id));
      if (!question) throw studyError("题目不属于这组练习", 404);
      submitted = content.attempts(body.sessionId, userId).some((attempt) => attempt.question_id === question.id);
      if (!submitted) content.hint(body.sessionId, question.id);
    }
    // Approved simple explanations/examples/hints are shared content, not
    // fresh AI calls. Unsubmitted practice never uses lesson answer shortcuts.
    if (question && !submitted && body.action !== "ask")
      return { answer: { conclusion: question.hint, points: [], example: "" }, cached: true };
    if (!question && body.action === "simple")
      return { answer: { conclusion: lesson.summary, points: lesson.points.slice(0, 2), example: "" }, cached: true };
    if (!question && body.action === "example")
      return { answer: { conclusion: "看这个例子。", points: [], example: lesson.example }, cached: true };
    const context = { nodeId: node.id, packageId: item.id, message: body.message,
      action: body.action, sessionId: body.sessionId || null, questionId: body.questionId || null };
    const limit = positiveInteger(process.env.STUDY_TEACHER_DAILY_LIMIT, { vip: 20, svip: 40, ssvip: 80 }[plan], 1000);
    const reservation = content.reserveTeacher(userId, node, item.id, body.requestId, context, limit);
    if (!reservation.created) {
      if (reservation.row.status === "processing") throw studyError("这个问题正在回答，请稍后再试", 409);
      return { answer: reservation.row.data.answer, cached: true };
    }
    try {
      requireAiService();
      let answer = await ai(userId, () => teacher.teacher({ node, lesson,
        reference: item.data.reference, message: body.message,
        history: content.teacherHistory(userId, item.id),
        ...(question ? { question: submitted ? question : publicStudyQuestion(question), submitted } : {}),
      }, userId));
      answer = teacherAnswerSchema.parse(answer);
      if (unsafeStudyTeacherAnswer(answer)) throw studyError("老师的回答需要重新整理，请稍后重试。", 503, "STUDY_TEACHER_UNSAFE");
      // Conservative answer-leak guard. If a contextual reply names a blank's
      // answer, return the independently reviewed hint instead.
      if (question && !submitted) {
        const response = [answer.conclusion, ...answer.points, answer.example].join(" ").normalize("NFKC").toLowerCase();
        if (question.blanks.some((blank) => [blank.answer, ...blank.aliases].some((value) => response.includes(value.normalize("NFKC").toLowerCase()))))
          answer = { conclusion: question.hint, points: [], example: "" };
      }
      content.finishTeacher(reservation.row, answer);
      return { answer, cached: false };
    } catch (error) {
      content.finishTeacher(reservation.row, null, redact(error.message).slice(0, 300));
      if (error.code === "AI_OUTPUT_TRUNCATED")
        throw studyError("老师这次没能完整回答，请再点一次“问老师”。你的问题已保留。", 503, "STUDY_TEACHER_INCOMPLETE");
      throw error;
    }
  });

  route("get", "/api/admin/study/overview", (req) => {
    requireAdmin(req);
    const topics = new Set(studyNodes.map((node) => node.parentId || node.id));
    return { nodes: studyNodes, topicCount: topics.size, chapterCount: new Set(studyNodes.map((node) => node.chapter)).size,
      packages: content.packages().map((item) => ({ ...item,
        current: content.published(studyNode(item.node_id))?.id === item.id,
      })), jobs: content.jobs(), feedback: content.feedbackList(),
      dailyGenerationLimit: generationDailyLimit, configuredDailyGenerationLimit: configuredDailyLimit };
  });
  route("get", "/api/admin/study/reference/:nodeId", (req) => {
    requireAdmin(req);
    const node = studyNode(req.params.nodeId);
    return { ...referenceForNode(node), nodeId: node.id };
  });
  route("post", "/api/admin/study/generations", (req) => {
    requireAdmin(req);
    const body = z.object({ nodeId: z.string(), reference: z.string().trim().min(30).max(6000),
      regenerate: z.boolean().default(false),
    }).strict().parse(req.body);
    const node = studyNode(body.nodeId), existing = content.published(node);
    if (existing && !body.regenerate) return { existing: true, packageId: existing.id };
    const ready = !body.regenerate && content.packages().find((item) => item.node_id === node.id &&
      item.curriculum_version === node.version && item.status === "awaiting_review" && item.data.reference === body.reference);
    if (ready) return { existing: true, packageId: ready.id };
    requireAiService();
    const result = content.createJob(node, body.reference, requestUserId(req),
      positiveInteger(process.env.STUDY_GENERATION_DAILY_LIMIT, 20, 200));
    drain();
    return { jobId: result.job.id, reused: !result.created };
  });
  route("post", "/api/admin/study/generations/bulk", (req) => {
    requireAdmin(req);
    const body = z.object({ chapters: z.array(z.string().min(1).max(120)).max(10).optional() }).strict().parse(req.body || {});
    const chapterFilter = body.chapters?.length ? new Set(body.chapters) : null;
    const selected = studyNodes.filter((node) => node.certificateId === "network-engineer" &&
      (!chapterFilter || chapterFilter.has(node.chapter)));
    const references = selected.map((node) => ({ node, ...referenceForNode(node) }));
    const packages = content.packages();
    let published = 0, awaitingReview = 0;
    const entries = references.filter((entry) => {
      const current = content.published(entry.node);
      if (current) { published++; return false; }
      const draft = packages.find((item) => item.node_id === entry.node.id &&
        item.curriculum_version === entry.node.version && item.status === "awaiting_review" &&
        item.data.reference === entry.reference);
      if (draft) { awaitingReview++; return false; }
      return true;
    });
    requireAiService();
    const dailyLimit = positiveInteger(process.env.STUDY_GENERATION_DAILY_LIMIT, 20, 200);
    const queued = content.queueBulk(entries, requestUserId(req), dailyLimit);
    drain();
    return { ...queued, selected: selected.length, published, awaitingReview, outlineOnly: references.filter((item) => item.referenceMode === "outline-only").length,
      questionBacked: references.filter((item) => item.referenceMode === "question-bank").length, dailyLimit,
      batchesApproxDays: Math.ceil((queued.queued + queued.reused) / dailyLimit) };
  });
  route("get", "/api/admin/study/generations/:id", (req) => {
    requireAdmin(req);
    const job = content.job(req.params.id);
    if (!job) throw studyError("任务不存在", 404);
    return job;
  });
  route("post", "/api/admin/study/generations/run-queued", (req) => {
    requireAdmin(req);
    requireAiService();
    const result = content.releaseQueuedJobs(requestUserId(req));
    // This admin action runs the authorized backlog immediately, one lesson at a time.
    // New batches continue to use the configured daily limit.
    generationDailyLimit = 200;
    drain();
    return { ...result, dailyLimit: generationDailyLimit };
  });
  route("post", "/api/admin/study/packages/publish-accepted", (req) => {
    requireAdmin(req);
    const actor = requestUserId(req);
    const handled = new Set();
    let publishedCount = 0, skipped = 0;
    for (const item of content.packages().filter((row) => row.status === "awaiting_review")) {
      if (handled.has(item.node_id)) { skipped++; continue; }
      handled.add(item.node_id);
      const bundle = studyPackageSchema.safeParse(item.data.bundle);
      const checked = studyReviewSchema.safeParse(item.data.review);
      if (!bundle.success || !checked.success || !acceptedStudyReview(bundle.data, checked.data)) { skipped++; continue; }
      let node;
      try { node = studyNode(item.node_id); } catch { skipped++; continue; }
      if (item.curriculum_version !== node.version) { skipped++; continue; }
      content.publish(item.id, actor, node);
      publishedCount++;
    }
    return { published: publishedCount, skipped };
  });
  route("post", "/api/admin/study/packages/:id/publish", (req) => {
    requireAdmin(req);
    const item = content.package(req.params.id);
    if (!item) throw studyError("内容不存在", 404);
    const bundle = studyPackageSchema.parse(item.data.bundle), checked = studyReviewSchema.safeParse(item.data.review);
    if (!checked.success || !acceptedStudyReview(bundle, checked.data))
      throw studyError("AI 审核未通过或缺少知识正确性、知识点匹配结果，请修正参考资料后重新生成");
    return content.publish(item.id, requestUserId(req), studyNode(item.node_id));
  });
  route("post", "/api/admin/study/packages/:id/suspend", (req) => {
    requireAdmin(req);
    content.suspend(req.params.id, requestUserId(req));
    return { saved: true };
  });
  route("post", "/api/admin/study/feedback/:id/resolve", (req) => {
    requireAdmin(req);
    const body = z.object({ note: z.string().trim().min(2).max(300),
      blanks: z.array(z.object({ blankId: z.string(), correct: z.boolean() }).strict()).min(1).max(3),
    }).strict().parse(req.body);
    const feedback = content.feedbackList().find((row) => row.id === req.params.id);
    if (!feedback) throw studyError("复核记录不存在", 404);
    const original = feedback.attempt_data.result.results;
    if (body.blanks.length !== original.length || new Set(body.blanks.map((row) => row.blankId)).size !== original.length ||
        original.some((row) => !body.blanks.some((b) => b.blankId === row.blankId))) throw studyError("评分空号不一致");
    const results = original.map((row) => ({ ...row,
      verdict: body.blanks.find((b) => b.blankId === row.blankId).correct ? "correct" : "incorrect", reason: body.note }));
    content.resolveFeedback(feedback.id, requestUserId(req), { ...feedback.attempt_data.result, ...summarizeStudyGrade(results) }, body.note);
    return { saved: true };
  });
  return { content, stop: () => { stopped = true; clearInterval(timer); }, settle: () => Promise.allSettled([...active]) };
}
