import crypto from "node:crypto";
import { z } from "zod";
import { sampleExamQuestions } from "./syllabus.js";

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
  const owned = (req) => {
    const session = store.session(req.params.id);
    if (
      !session ||
      (session.userId || "local") !== requestUserId(req) ||
      session.certificateId !== requireCertificate(req)
    )
      throw fail("考试不存在或不属于当前账号与题库", 404);
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
  });
  const view = (session) => ({
    ...session,
    questions: session.questionIds.map((id) => {
      const question = store.getQ(id);
      if (!question) throw fail("试卷题目已变更，请联系管理员", 409);
      return publicQuestion(question);
    }),
  });
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

  route("get", "/api/exams/catalog", (req) => {
    const groups = new Map();
    for (const question of examPool(req)) {
      const name = question.chapter || "综合知识";
      groups.set(name, (groups.get(name) || 0) + 1);
    }
    return {
      chapters: [...groups].map(([name, questionCount]) => ({
        name,
        questionCount,
      })),
    };
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
    const chapters = body.chapters ? [...new Set(body.chapters)] : null;
    const fullPool = examPool(req);
    const syllabus = syllabusForCertificate(certificateId);
    const blueprint = chapters ? null : syllabus?.examBlueprint;
    if (
      chapters?.some(
        (name) =>
          !fullPool.some(
            (question) => (question.chapter || "综合知识") === name,
          ),
      )
    )
      throw fail("所选知识点没有可用于考试的题目，请刷新后重新选择");
    if (!blueprint && body.count > (chapters ? 100 : 75))
      throw fail("本次组卷题量超出上限");
    if (chapters && body.count < chapters.length)
      throw fail("题量不能少于已选大知识点数量");
    const pool = chapters
      ? fullPool.filter((question) =>
          chapters.includes(question.chapter || "综合知识"),
        )
      : fullPool;
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
    const questions = sampleExamQuestions(pool, customSyllabus, requested);
    if (!questions.length)
      throw fail("当前范围无法组成试卷，请调整知识点或题量");
    const durationMs = blueprint?.durationMinutes
      ? blueprint.durationMinutes * 60000
      : questions.length * 120000;
    const session = {
      id: crypto.randomUUID(),
      userId,
      certificateId,
      custom: !!chapters,
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
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + durationMs).toISOString(),
      durationMs,
      submitted: false,
    };
    store.saveSession(session);
    return view(session);
  });
  route("get", "/api/exams/:id", (req) => view(owned(req)));
  route("put", "/api/exams/:id/answers", (req) => {
    const session = owned(req);
    if (session.submitted) throw fail("考试已交卷", 409);
    if (Date.now() >= Date.parse(session.expiresAt))
      return { saved: false, expired: true };
    session.answers = answersFor(session, req.body?.answers);
    store.saveSession(session);
    return { saved: true, expired: false };
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
