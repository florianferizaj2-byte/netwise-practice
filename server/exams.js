import crypto from "node:crypto";
import { z } from "zod";
import { sampleExamQuestions } from "./syllabus.js";
import { questionForCertificate } from "./question-banks/scopes.js";
import {
  examPointId,
  examSelectionCatalog,
  wholeExamPool,
  sampleKnowledgeExam,
} from "./exam-selection.js";

const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });

export function registerExamRoutes({
  route,
  store,
  requireCertificate,
  requestUserId,
  certificateQuestions,
  syllabusForCertificate,
  publicQuestion,
}) {
  const examPool = (req) =>
    certificateQuestions(requireCertificate(req), requestUserId(req))
      .filter(
        (question) =>
          question.source !== "ai_generated" &&
          question.type !== "short_answer",
      )
      .map((question) =>
        question.chapter ? question : { ...question, chapter: "综合知识" },
      );
  const requireAvailableSession = (session) => {
    if (!session.submitted && session.questionIds.some((id) => store.isQuestionWithdrawn(id)))
      throw Object.assign(fail("这份试卷包含已下架题目，请重新组卷；原答题记录已保留", 409), {
        code: "EXAM_QUESTION_WITHDRAWN",
      });
  };
  const owned = (req) => {
    const session = store.session(req.params.id);
    if (
      !session ||
      (session.userId || "local") !== requestUserId(req) ||
      session.certificateId !== requireCertificate(req)
    )
      throw fail("考试不存在或不属于当前账号与题库", 404);
    requireAvailableSession(session);
    return session;
  };
  const summary = (session) => ({
    id: session.id,
    chapters: session.chapters || Object.keys(session.distribution || {}),
    count: session.questionIds.length,
    answeredCount: Object.values(session.answers || {}).filter(
      (answer) => answer.length,
    ).length,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    submitted: session.submitted,
    score: session.result?.score,
    maxScore: session.result?.maxScore,
    name: session.name || "模拟考试",
    durationMs: session.durationMs,
  });
  const view = ({ creationFingerprint, ...session }) => {
    requireAvailableSession(session);
    return {
      ...session,
      questions: session.questionIds.map((id) => {
      const question = questionForCertificate(
        store.getQ(id),
        session.certificateId,
      );
      if (!question) throw fail("试卷题目已变更，请联系管理员", 409);
      return publicQuestion(question);
      }),
    };
  };
  const answersFor = (session, raw) => {
    const answers = z
      .record(z.string(), z.array(z.string().min(1).max(8)).max(20))
      .parse(raw || {});
    for (const [id, values] of Object.entries(answers)) {
      const question = store.getQ(id);
      if (!session.questionIds.includes(id) || !question)
        throw fail("考试答案包含未知题目");
      if (
        new Set(values).size !== values.length ||
        values.some((value) => !Object.hasOwn(question.options, value)) ||
        (question.type !== "multiple_choice" && values.length > 1)
      )
        throw fail("考试答案格式不正确");
    }
    return answers;
  };
  const checkVersion = (session, raw) => {
    const expected = z.number().int().nonnegative().optional().parse(raw);
    const version = session.answersVersion || 0;
    if (expected !== undefined && expected !== version) {
      throw Object.assign(
        fail("这场考试的答案已在其他页面更新，请先同步后继续", 409),
        {
          code: "EXAM_ANSWERS_CONFLICT",
          details: { answers: session.answers, version },
        },
      );
    }
    return version;
  };

  route("get", "/api/exams/catalog", (req) => {
    return examSelectionCatalog(examPool(req), requireCertificate(req));
  });
  route("get", "/api/exams", (req) => ({
    sessions: store
      .examSessions(requestUserId(req), requireCertificate(req))
      .map(summary),
  }));
  route("post", "/api/exams", (req) => {
    const body = z
      .object({
        count: z.number().int().min(5).max(400).default(20),
        requestId: z.string().uuid().optional(),
        name: z.string().trim().min(1).max(80).optional(),
        durationMinutes: z.number().int().min(5).max(480).optional(),
        types: z
          .array(z.enum(["single_choice", "multiple_choice", "true_false"]))
          .min(1)
          .max(3)
          .optional(),
        knowledgePointIds: z
          .array(z.string().regex(/^kp-[a-f0-9]{24}$/))
          .min(1)
          .max(200)
          .optional(),
        chapters: z
          .array(z.string().trim().min(1).max(160))
          .min(1)
          .max(60)
          .optional(),
      })
      .strict()
      .parse(req.body || {});
    const userId = requestUserId(req),
      certificateId = requireCertificate(req);
    const signature = {
      ...body,
      types: body.types ? [...new Set(body.types)].sort() : undefined,
      chapters: body.chapters ? [...new Set(body.chapters)].sort() : undefined,
      knowledgePointIds: body.knowledgePointIds
        ? [...new Set(body.knowledgePointIds)].sort()
        : undefined,
    };
    delete signature.requestId;
    const creationFingerprint = crypto
      .createHash("sha256")
      .update(JSON.stringify(signature))
      .digest("hex");
    const hash =
      body.requestId &&
      crypto
        .createHash("sha256")
        .update(JSON.stringify([userId, certificateId, body.requestId]))
        .digest("hex");
    const id = hash
      ? `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
      : crypto.randomUUID();
    const previous = body.requestId && store.session(id);
    if (previous) {
      if (previous.creationFingerprint !== creationFingerprint)
        throw fail("本次组卷请求已用于其他设置，请重新开始", 409);
      return view(previous);
    }
    const chapters = body.chapters ? [...new Set(body.chapters)] : null;
    const pointIds = body.knowledgePointIds
      ? [...new Set(body.knowledgePointIds)]
      : null;
    if (chapters && pointIds)
      throw fail("请选择章节范围或知识点范围，不要同时提交");
    const fullPool = examPool(req);
    const syllabus = syllabusForCertificate(certificateId);
    const blueprint = chapters || pointIds ? null : syllabus?.examBlueprint;
    if (
      blueprint &&
      (body.types ||
        (body.durationMinutes !== undefined &&
          body.durationMinutes !== blueprint.durationMinutes))
    )
      throw fail(
        "全范围模拟使用固定题型与考试时长，自定义设置请改用自选知识点",
      );
    if (
      pointIds?.some(
        (id) => !fullPool.some((q) => examPointId(certificateId, q) === id),
      )
    )
      throw fail("所选知识点已变更或不属于当前证书，请刷新后重新选择");
    if (
      chapters?.some(
        (name) =>
          !fullPool.some(
            (question) => (question.chapter || "综合知识") === name,
          ),
      )
    )
      throw fail("所选知识点没有可用于考试的题目，请刷新后重新选择");
    if (!blueprint && body.count > (chapters || pointIds ? 100 : 75))
      throw fail("本次组卷题量超出上限");
    if (chapters && body.count < chapters.length)
      throw fail("题量不能少于已选大知识点数量");
    if (pointIds && body.count < pointIds.length)
      throw fail("题量不能少于已选知识点数量");
    const pool = wholeExamPool(
      fullPool,
      (q) =>
        (!chapters || chapters.includes(q.chapter || "综合知识")) &&
        (!pointIds || pointIds.includes(examPointId(certificateId, q))) &&
        (!body.types || body.types.includes(q.type)),
    );
    if (!pool.length) throw fail("所选范围暂时没有可用于考试的题目");
    const requested = blueprint?.questionCount || body.count;
    const customSyllabus = chapters
      ? {
          modules: chapters.map((name, order) => ({
            name,
            order,
            weight: 100 / chapters.length,
          })),
        }
      : syllabus;
    let questions;
    try {
      questions = pointIds
        ? sampleKnowledgeExam(pool, certificateId, pointIds, requested)
        : sampleExamQuestions(pool, customSyllabus, requested);
    } catch (error) {
      throw fail(error.message);
    }
    if (!questions.length)
      throw fail("当前范围无法组成试卷，请调整知识点或题量");
    const durationMs = blueprint?.durationMinutes
      ? blueprint.durationMinutes * 60000
      : body.durationMinutes
        ? body.durationMinutes * 60000
        : questions.length * 120000;
    const createdAt = Date.now();
    const session = {
      id,
      ...(body.requestId ? { creationFingerprint } : {}),
      userId,
      certificateId,
      custom: !!(chapters || pointIds),
      name: body.name || "模拟考试",
      ...(pointIds ? { knowledgePointIds: pointIds } : {}),
      types: body.types
        ? [...new Set(body.types)]
        : ["single_choice", "multiple_choice", "true_false"],
      typeDistribution: Object.fromEntries(
        [...new Set(questions.map((q) => q.type))].map((type) => [
          type,
          questions.filter((q) => q.type === type).length,
        ]),
      ),
      chapters: chapters || [
        ...new Set(questions.map((question) => question.chapter)),
      ],
      syllabusVersion: syllabus?.version || null,
      questionIds: questions.map((question) => question.id),
      distribution: Object.fromEntries(
        [...new Set(questions.map((question) => question.chapter))].map(
          (chapter) => [
            chapter,
            questions.filter((question) => question.chapter === chapter).length,
          ],
        ),
      ),
      answers: {},
      answersVersion: 0,
      createdAt: new Date(createdAt).toISOString(),
      expiresAt: new Date(createdAt + durationMs).toISOString(),
      durationMs,
      submitted: false,
    };
    // Never overwrite an existing exam if another worker accepted the same retry.
    store.db
      .prepare("INSERT OR IGNORE INTO sessions (id,data) VALUES (?,?)")
      .run(session.id, JSON.stringify(session));
    const committed = store.session(session.id);
    if (body.requestId && committed.creationFingerprint !== creationFingerprint)
      throw fail("本次组卷请求已用于其他设置，请重新开始", 409);
    return view(committed);
  });
  route("get", "/api/exams/:id", (req) => view(owned(req)));
  route("put", "/api/exams/:id/answers", (req) => {
    store.db.exec("BEGIN IMMEDIATE");
    try {
      const session = owned(req);
      if (session.submitted) throw fail("考试已交卷", 409);
      if (Date.now() >= Date.parse(session.expiresAt)) {
        store.db.exec("COMMIT");
        return {
          saved: false,
          expired: true,
          version: session.answersVersion || 0,
        };
      }
      const version = checkVersion(session, req.body?.expectedVersion);
      const answers = answersFor(session, req.body?.answers);
      // Older installed clients omit expectedVersion. Preserve answers absent
      // from their snapshot while new clients use strict optimistic locking.
      session.answers = { ...session.answers, ...answers };
      session.answersVersion = version + 1;
      store.saveSession(session);
      store.db.exec("COMMIT");
      return { saved: true, expired: false, version: session.answersVersion };
    } catch (error) {
      store.db.exec("ROLLBACK");
      throw error;
    }
  });
  route("post", "/api/exams/:id/submit", (req) => {
    // Re-read under the write lock so retried submissions cannot record twice.
    store.db.exec("BEGIN IMMEDIATE");
    try {
      const session = owned(req);
      if (session.submitted) {
        store.db.exec("COMMIT");
        return session.result;
      }
      const blueprint = session.custom
        ? null
        : syllabusForCertificate(session.certificateId)?.examBlueprint;
      const durationMs =
        session.durationMs ||
        Date.parse(session.expiresAt) - Date.parse(session.createdAt);
      if (Date.now() < Date.parse(session.expiresAt))
        checkVersion(session, req.body?.expectedVersion);
      const answers =
        Date.now() >= Date.parse(session.expiresAt)
          ? session.answers
          : answersFor(session, req.body?.answers);
      const elapsed = Math.max(
        0,
        Math.min(Date.now() - Date.parse(session.createdAt), durationMs),
      );
      const results = session.questionIds.map((id) => {
        const question = store.getQ(id);
        if (!question) throw fail("试卷题目已变更，请联系管理员", 409);
        return {
          ...store.recordAttempt(
            id,
            answers[id] || [],
            Math.round(elapsed / session.questionIds.length),
            "exam",
            requestUserId(req),
          ),
          chapter: questionForCertificate(question, session.certificateId)
            .chapter,
          knowledgeSection: questionForCertificate(
            question,
            session.certificateId,
          ).knowledgeSection,
          knowledgePoint: questionForCertificate(
            question,
            session.certificateId,
          ).knowledgePoint,
          question: question.question,
          options: question.options,
          type: question.type,
          ...(question.images ? { images: question.images } : {}),
          ...(question.image ? { image: question.image } : {}),
          ...(question.sharedStem ? { sharedStem: question.sharedStem } : {}),
          ...(question.sharedGroupId
            ? { sharedGroupId: question.sharedGroupId }
            : {}),
          ...(question.sharedKind ? { sharedKind: question.sharedKind } : {}),
          ...(question.sharedOrder
            ? { sharedOrder: question.sharedOrder }
            : {}),
        };
      });
      const correct = results.filter((result) => result.correct).length;
      session.answers = answers;
      session.result = {
        results,
        elapsed,
        score: blueprint
          ? correct
          : Math.round((correct / results.length) * 100),
        maxScore: blueprint ? results.length : 100,
        ...(blueprint?.passingScore !== undefined
          ? {
              passingScore: blueprint.passingScore,
              passed: correct >= blueprint.passingScore,
            }
          : {}),
      };
      session.submitted = true;
      store.saveSession(session);
      store.db.exec("COMMIT");
      return session.result;
    } catch (error) {
      store.db.exec("ROLLBACK");
      throw error;
    }
  });
}
