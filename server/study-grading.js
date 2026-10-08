import { studyPromptAttack } from "./study-security.js";

export function gradeStudyQuestion(question, answers) {
  return question.blanks.map((blank) => {
    // Only literal equality bypasses AI. Preserve differences (including spaces,
    // case, aliases and numeric formatting) for the semantic review.
    const response = String(answers[blank.id] ?? "");
    if (response === blank.answer) return { blankId: blank.id, verdict: "correct", score: 1,
      response, expectedAnswer: blank.answer, reason: "与预留答案完全一致，直接得分。" };
    if (studyPromptAttack(response)) return { blankId: blank.id, verdict: "incorrect", score: 0,
      response, expectedAnswer: blank.answer, reason: "请填写知识答案，更改评分规则的指令不计分。" };
    return { blankId: blank.id, verdict: "uncertain", score: 0,
      response, expectedAnswer: blank.answer,
      reason: "与预留答案存在出入，交由 AI 按本空评分标准复核。",
    };
  });
}

export function summarizeStudyGrade(results) {
  const pending = results.some((item) => item.verdict === "uncertain");
  const score = results.reduce((sum, item) => sum + (item.verdict === "correct" ? 1 : 0), 0);
  return { results, score, maxScore: results.length, status: pending ? "pending_review" : "graded",
    correct: !pending && score === results.length };
}
