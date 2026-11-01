import { z } from "zod";
import { teacherAnswerSchema, studyDay, studyHash } from "./study-content.js";
import { tutorError } from "./demo-tutor/engine.js";
import { checkAiCancellation, positiveInteger } from "./ai-tasks.js";
import {
  normalizeStudyText,
  studyPromptAttack,
  unsafeStudyTeacherAnswer,
} from "./study-security.js";
import { redact } from "./security.js";
import { tutorAiUsage } from "./ai-usage-cost.js";
import { commitPointsResult } from "./ai-points/runtime.js";
import { ensureAccountPoints } from "./ai-points/account.js";

const input = z
  .object({
    requestId: z.string().uuid(),
    revision: z.number().int().nonnegative(),
    message: z.string().trim().min(2).max(600),
    action: z.enum(["ask", "simple", "example", "hint"]).default("ask"),
  })
  .strict();

export function registerTutorTeacher({
  route,
  store,
  content,
  teacher,
  owned,
  latest,
  view,
  ai,
  requireAiService,
  assertRate,
  remember,
  request,
  transaction,
}) {
  const prefix = "/api/tutor/v1/sessions/:id/teacher";
  const key = (state) => `interactive-tutor:${state.id}:${state.courseVersion}`;
  const limitFor = (plan) =>
    positiveInteger(
      process.env.STUDY_TEACHER_DAILY_LIMIT,
      1000,
      1000,
    );
  const quota = (userId, plan) => {
    const limit = limitFor(plan),
      used = store.db
        .prepare(
          "SELECT count(*) n FROM study_teacher_requests WHERE user_id=? AND day=? AND status IN ('processing','completed')",
        )
        .get(userId, studyDay()).n;
    const points=ensureAccountPoints(store,userId);
    return { unit:"points",remaining:points.availableUnits/points.scale,...points,requestLimits:{used,limit} };
  };
  route("get", prefix, (req) => {
    const { userId, state } = owned(req, req.params.id);
    const last = store.db
      .prepare(
        "SELECT request_id,status,data FROM study_teacher_requests WHERE user_id=? AND package_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1",
      )
      .get(userId, key(state));
    const draft =
      last && ["failed", "processing"].includes(last.status)
        ? JSON.parse(last.data).context
        : null;
    return {
      messages: content.teacherHistory(userId, key(state)),
      draft:
        draft?.kind === "interactive-tutor" && draft.revision === state.revision
          ? {
              requestId: last.request_id,
              revision: draft.revision,
              message: draft.message,
              action: draft.action,
            }
          : null,
      quota: quota(userId, store.accountEntitlement(userId).plan),
      usage: tutorAiUsage(store, userId, req.user.certificateId, state.id),
    };
  });
  route("post", prefix, async (req) => {
    const body = input.parse(req.body),
      { userId, state, course, node } = owned(req, req.params.id);
    body.message = normalizeStudyText(body.message);
    if (
      body.message.length < 2 ||
      body.message.length > 600 ||
      studyPromptAttack(body.message)
    )
      throw tutorError(
        "请提问当前知识点；更改规则、索取内部信息或强行给分的要求无法处理。",
        400,
        "STUDY_PROMPT_REJECTED",
      );
    const context = {
      kind: "interactive-tutor",
      nodeId: node.id,
      sessionId: state.id,
      courseVersion: state.courseVersion,
      revision: body.revision,
      message: body.message,
      action: body.action,
    };
    const old = content.teacherRequest(userId, body.requestId);
    // A committed answer can be recovered after the learner has moved forward.
    if (old && JSON.stringify(old.data.context) !== JSON.stringify(context))
      throw tutorError("提问编号已用于其他内容，请重新提问。", 409);
    if (old?.status === "completed")
      return {
        answer: teacherAnswerSchema.parse(old.data.answer),
        cached: true,
        revision: body.revision,
        quota: quota(userId, store.accountEntitlement(userId).plan),
      };
    if (old?.status === "processing")
      throw tutorError(
        "这个问题正在回答，请稍后重试。",
        409,
        "TUTOR_TEACHER_PROCESSING",
      );
    if (
      latest(userId, node.certificateId, course)?.id !== state.id ||
      state.revision !== body.revision
    )
      throw tutorError(
        "学习步骤已更新，请回到当前步骤再提问。",
        409,
        "TUTOR_CONFLICT",
      );
    const current = view(state),
      pending = ["awaiting_answer", "variant"].includes(state.phase);
    if (pending && body.action === "ask")
      throw tutorError(
        "先完成当前小测，再让老师针对你的作答讲解；现在可以回看本概念。",
        409,
        "TUTOR_ANSWER_REQUIRED",
      );
    // These are reviewed public cards only; neither private quiz keys nor future steps enter the model.
    const cards = pending ? current.review : current.lesson;
    const material = cards?.components || cards || [];
    const plain = material
      .flatMap(
        (card) =>
          card.paragraphs || card.items || (card.caption ? [card.caption] : []),
      )
      .filter((text) => typeof text === "string");
    if (body.action !== "ask") {
      const safe = (
        body.action === "example"
          ? material
              .filter((c) => /例|场景/.test(c.title || ""))
              .flatMap((c) => c.paragraphs || c.items || [])
          : plain
      ).filter((t) => typeof t === "string");
      return {
        answer: {
          conclusion: "先回看本步已经讲过的内容。",
          points: [],
          example: (
            safe[0] ||
            plain[0] ||
            "回到当前讲解，按步骤读一遍，再试着用自己的话说明。"
          ).slice(0, 160),
        },
        cached: true,
        revision: state.revision,
      };
    }
    const plan = store.accountEntitlement(userId).plan;
    const signature = { kind: "teacher", context },
      logged = request(userId, body.requestId);
    if (logged && logged.input_hash !== studyHash(signature))
      throw tutorError("提问编号已用于其他操作，请重新提问。", 409);
    if (!logged) assertRate(userId);
    const recentCalls = store.db
      .prepare(
        "SELECT count(*) n FROM user_usage WHERE user_id=? AND json_extract(data,'$.tutorSessionId') IS NOT NULL AND json_extract(data,'$.createdAt')>=?",
      )
      .get(userId, new Date(Date.now() - 60000).toISOString()).n;
    if (recentCalls >= 12)
      throw tutorError(
        "提问较频繁，请稍后再问；仍可回看已保存的讲解。",
        429,
        "TUTOR_TEACHER_RATE_LIMIT",
      );
    const reservation = content.reserveTeacher(
      userId,
      node,
      key(state),
      body.requestId,
      context,
      limitFor(plan),
    );
    if (!reservation.created) {
      if (reservation.row.status === "processing")
        throw tutorError(
          "这个问题正在回答，请稍后重试。",
          409,
          "TUTOR_TEACHER_PROCESSING",
        );
      return {
        answer: teacherAnswerSchema.parse(reservation.row.data.answer),
        cached: true,
        revision: body.revision,
        quota: quota(userId, plan),
      };
    }
    try {
      if (!logged)
        transaction(() =>
          remember(userId, body.requestId, state.id, signature),
        );
      requireAiService();
      const answer = await ai(userId, async () => {
        checkAiCancellation();
        if (!teacher.tutorTeacher)
          throw tutorError(
            "当前老师服务尚未支持分步答疑，请先回看本步讲解。",
            503,
          );
        const result = await teacher.tutorTeacher(
          {
            node,
            lesson: material,
            reference: JSON.stringify(material).slice(0, 3000),
            message: body.message,
            history: content.teacherHistory(userId, key(state)),
            teaching: {
              foundation: state.foundation,
              phase: state.phase,
              stepId: current.stepId,
              concept: course.concepts[state.conceptIndex],
            },
          },
          userId,
          {
            tutorSessionId: state.id,
            tutorCourseId: course.id,
            tutorRequestId: body.requestId,
          },
        );
        checkAiCancellation();
        owned(req, state.id); // Membership, certificate and publication can change during a model call.
        const parsed = teacherAnswerSchema.parse(result);
        if (unsafeStudyTeacherAnswer(parsed))
          throw tutorError(
            "老师的回答需要重新整理，请先回看当前讲解。",
            503,
            "STUDY_TEACHER_UNSAFE",
          );
        return commitPointsResult(store,userId,parsed,()=>content.finishTeacher(reservation.row,parsed));
      });
      return {
        answer,
        cached: false,
        revision: state.revision,
        quota: quota(userId, plan),
        usage: tutorAiUsage(store, userId, node.certificateId, state.id),
      };
    } catch (error) {
      content.finishTeacher(
        reservation.row,
        null,
        redact(error.message).slice(0, 300),
      );
      if (error.code === "AI_OUTPUT_TRUNCATED")
        throw tutorError(
          "老师这次没有完整回答，你的问题已保留，可以重试或先回看讲解。",
          503,
          "STUDY_TEACHER_INCOMPLETE",
        );
      if (!error.status)
        throw tutorError(
          "老师暂时未能完成答疑，你的问题已保留，可以重试或先回看讲解。",
          503,
          "TUTOR_TEACHER_UNAVAILABLE",
        );
      throw error;
    }
  });
}
