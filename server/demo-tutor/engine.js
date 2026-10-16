import crypto from "node:crypto";
import { publicQuiz } from "./content.js";
import { getBundle } from "./registry.js";
import { validateLesson } from "./protocol.js";

export const tutorError = (message, status = 400, code = "TUTOR_ERROR") =>
  Object.assign(new Error(message), { status, code });
const nowISO = () => new Date().toISOString();

export class TutorEngine {
  start(foundation = "beginner", courseId = "vlan-broadcast-domain", pacing = "concept") {
    const { course } = getBundle(courseId);
    return {
      id: crypto.randomUUID(),
      courseId: course.id,
      courseVersion: course.version,
      foundation,
      pacing,
      teachingIndex: 0,
      phase: "explanation",
      conceptIndex: 0,
      quizKind: "check",
      variantIndex: 0,
      revision: 0,
      answers: [],
      mastery: Array(course.concepts.length).fill("locked"),
      feedback: null,
      startedAt: nowISO(),
      updatedAt: nowISO(),
      completedAt: null,
      usage: {
        aiCalls: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costCny: 0,
        ruleSubmissions: 0,
        contentCacheHits: 1,
      },
    };
  }
  currentQuestion(s) {
    const { quizzes } = getBundle(s.courseId);
    return s.quizKind === "variant"
      ? quizzes[s.conceptIndex].variants[s.variantIndex]
      : quizzes[s.conceptIndex].main;
  }
  apply(s, input) {
    const { course, quizzes } = getBundle(s.courseId);
    if (input.revision !== s.revision)
      throw tutorError(
        "课程进度已更新，正在恢复最新位置。",
        409,
        "TUTOR_CONFLICT",
      );
    if (s.phase === "complete")
      throw tutorError("这次课程已经完成，可以回顾或重新学习。", 409);
    if (input.action === "answer") {
      if (!["awaiting_answer", "variant"].includes(s.phase))
        throw tutorError("当前步骤还未进入答题。", 409);
      this.grade(s, input.optionId);
    } else if (input.action === "guide") {
      if (input.optionId || s.phase !== "explanation" || s.pacing === "guided")
        throw tutorError("当前课程已使用分步讲解，或不在阅读步骤。", 409);
      s.pacing = "guided";
      s.teachingIndex = 0;
    } else if (input.action === "back") {
      if (input.optionId || s.pacing !== "guided" || s.phase !== "explanation" || s.teachingIndex <= 0)
        throw tutorError("只能回看当前概念中已读过的讲解。", 409);
      s.teachingIndex -= 1;
    } else if (input.action === "next") {
      if (input.optionId) throw tutorError("继续课程不接受作答选项。");
      switch (s.phase) {
        case "explanation":
          if (s.pacing === "guided" && s.teachingIndex < this.explanation(s).length - 1) {
            s.teachingIndex += 1;
            break;
          }
          s.phase = "awaiting_answer";
          s.quizKind = "check";
          break;
        case "remediation":
          s.phase = "variant";
          s.quizKind = "variant";
          break;
        case "feedback": {
          if (s.quizKind === "check") {
            s.variantIndex = 0;
            s.phase = s.feedback.correct ? "variant" : "remediation";
            s.quizKind = "variant";
          } else if (
            s.feedback.correct ||
            s.variantIndex >= quizzes[s.conceptIndex].variants.length - 1
          ) {
            this.advance(s);
          } else {
            s.variantIndex += 1;
            s.phase = "remediation";
          }
          break;
        }
        default:
          throw tutorError(
            "先完成当前小测，再继续课程。",
            409,
            "TUTOR_ANSWER_REQUIRED",
          );
      }
      s.usage.contentCacheHits += 1;
    } else throw tutorError("无法识别这个教学操作。");
    s.revision += 1;
    s.updatedAt = nowISO();
    return s;
  }
  grade(s, optionId) {
    const { course, quizzes } = getBundle(s.courseId);
    const q = this.currentQuestion(s);
    if (!q.options.some((option) => option.id === optionId))
      throw tutorError("请选择当前题目中的一个选项。");
    const correct = q.answer === optionId;
    const fault = correct ? null : q.branches[optionId];
    const result = {
      questionId: q.id,
      conceptId: course.concepts[s.conceptIndex].id,
      kind: s.quizKind,
      selectedId: optionId,
      correct,
      errorType: fault?.errorType || "",
      errorTitle: fault?.title || "",
      submittedAt: nowISO(),
    };
    s.answers.push(result);
    s.feedback = result;
    if (s.quizKind === "variant")
      s.mastery[s.conceptIndex] = correct ? "mastered" : "review";
    s.usage.ruleSubmissions += 1;
    s.phase = "feedback";
  }
  advance(s) {
    const { course } = getBundle(s.courseId);
    if (s.mastery[s.conceptIndex] !== "mastered")
      s.mastery[s.conceptIndex] = "review";
    if (s.conceptIndex === course.concepts.length - 1) {
      s.phase = "complete";
      s.completedAt = nowISO();
    } else {
      s.conceptIndex += 1;
      s.phase = "explanation";
      s.quizKind = "check";
      s.variantIndex = 0;
      s.teachingIndex = 0;
      s.feedback = null;
    }
  }
  explanation(s, index = s.conceptIndex) {
    const { teaching, foundations } = getBundle(s.courseId);
    return structuredClone([
      ...(s.foundation === "beginner" ? [foundations[index]] : []),
      ...teaching[index],
    ]);
  }
  review(s, conceptId) {
    const { course } = getBundle(s.courseId);
    if (s.courseVersion !== course.version)
      throw tutorError("课程已更新，请重新开始本节互动课。", 409, "TUTOR_VERSION_CHANGED");
    const index = course.concepts.findIndex((c) => c.id === conceptId);
    if (index < 0 || index > s.conceptIndex)
      throw tutorError("请先学习前面的概念。", 403);
    const cards = this.explanation(s, index);
    // A current concept's later teaching cards remain locked, even through the review endpoint.
    return validateLesson(s.pacing === "guided" && s.phase === "explanation" && index === s.conceptIndex
      ? cards.slice(0, s.teachingIndex + 1) : cards);
  }
  view(s) {
    const { course, teaching, quizzes, summary, remedialCards } = getBundle(
      s.courseId,
    );
    if (s.courseVersion !== course.version)
      throw tutorError(
        "课程已更新，请重新开始本节互动课。",
        409,
        "TUTOR_VERSION_CHANGED",
      );
    const concept = course.concepts[s.conceptIndex];
    const progress = {
      type: "LessonProgress",
      id: course.id + "-lesson-progress",
      current: s.phase === "complete" ? course.concepts.length : s.conceptIndex,
      total: course.concepts.length,
      concepts: course.concepts.map((c, index) => ({
        ...c,
        status:
          s.mastery[index] !== "locked"
            ? s.mastery[index]
            : index === s.conceptIndex
              ? "current"
              : "locked",
      })),
    };
    let components = [];
    let nextLabel = "";
    let reading = null;
    if (s.phase === "explanation") {
      components = this.explanation(s);
      nextLabel = "理解了，做一道小测";
      if (s.pacing === "guided") {
        const labels = {
          ExplanationCard: "理解规则", NetworkDiagram: "观察图解", EyeDiagram: "观察图解",
          ComparisonTable: "对照区别", KnowledgeCard: "记住要点",
        };
        const index = s.teachingIndex;
        reading = { index, total: components.length, title: index === 0 && s.foundation === "beginner"
          ? "认识术语" : labels[components[index].type] || "学习讲解" };
        const next = components[index + 1];
        if (next) nextLabel = "接下来，" + (labels[next.type] || "继续讲解");
        components = [components[index]];
      }
    } else if (["awaiting_answer", "variant"].includes(s.phase)) {
      const q = this.currentQuestion(s);
      const visual =
        q.visual ||
        teaching[s.conceptIndex].find((c) => c.type === "NetworkDiagram");
      components = [
        ...(visual ? [structuredClone(visual)] : []),
        publicQuiz(q, s.quizKind),
      ];
    } else if (s.phase === "feedback") {
      const q = [
        ...quizzes[s.conceptIndex].variants,
        quizzes[s.conceptIndex].main,
      ].find((q) => q.id === s.feedback.questionId);
      const fault = q.branches[s.feedback.selectedId];
      const lastVariant =
        s.quizKind === "variant" &&
        s.variantIndex === quizzes[s.conceptIndex].variants.length - 1;
      const moving =
        s.quizKind === "variant" && (s.feedback.correct || lastVariant);
      nextLabel = moving
        ? s.conceptIndex === course.concepts.length - 1
          ? "查看学习总结"
          : "继续下一个概念"
        : s.feedback.correct
          ? "做一道变式题"
          : "针对这个错因补课";
      components = [
        {
          type: "FeedbackCard",
          id: s.feedback.questionId + "-feedback",
          title: s.feedback.correct ? "回答正确" : fault.title,
          correct: s.feedback.correct,
          selectedId: s.feedback.selectedId,
          correctId: q.answer,
          correctText: q.options.find((o) => o.id === q.answer).text,
          explanation: s.feedback.correct
            ? q.explanation || quizzes[s.conceptIndex].correct
            : fault.explanation,
          errorType: s.feedback.errorType,
          nextHint:
            moving && !s.feedback.correct
              ? "本概念暂记为待巩固；总结中会保留复习建议。"
              : s.feedback.correct
                ? s.quizKind === "variant"
                  ? "变式题也答对了，这个概念已通过检验。"
                  : "再换一个场景确认掌握。"
                : fault.hint,
        },
      ];
    } else if (s.phase === "remediation") {
      const last = s.feedback;
      const q = [
        quizzes[s.conceptIndex].main,
        ...quizzes[s.conceptIndex].variants,
      ].find((q) => q.id === last.questionId);
      components = [
        ...remedialCards(q.branches[last.selectedId], s.conceptIndex),
        structuredClone(
          q.visual ||
            teaching[s.conceptIndex].find((c) => c.type === "NetworkDiagram"),
        ),
      ].filter(Boolean);
      nextLabel = "再试一道变式题";
    } else if (s.phase === "complete") {
      components = Array.from(
        { length: Math.ceil(summary.length / 4) },
        (_, i) => ({
          type: "KnowledgeCard",
          id: course.id + "-summary-" + i,
          title: "把关键结论带走",
          items: summary.slice(i * 4, i * 4 + 4),
        }),
      );
    }
    const lesson = validateLesson([progress, ...components]);
    return {
      schemaVersion: 1,
      id: s.id,
      course: structuredClone(course),
      revision: s.revision,
      phase: s.phase,
      pacing: s.pacing || "concept",
      reading,
      stepId:
        course.id +
        ":" +
        concept.id +
        ":" +
        s.phase +
        (s.quizKind === "variant" ? ":" + s.variantIndex : "") +
        (reading ? ":read-" + reading.index : ""),
      conceptIndex: s.conceptIndex,
      foundation: s.foundation,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      lesson,
      nextLabel,
      usage: structuredClone(s.usage),
      answers: s.answers.map((a) => ({ ...a })),
      mastery: course.concepts.map((c, index) => ({
        ...c,
        status: s.mastery[index],
      })),
      review: ["awaiting_answer", "variant", "feedback"].includes(s.phase)
        ? validateLesson(this.explanation(s))
        : null,
    };
  }
}
