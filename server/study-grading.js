import { isIP } from "node:net";

const normalize = (value) => String(value).normalize("NFKC").trim().replace(/\s+/g, " ");
const ipValue = (value) => {
  const normalized = normalize(value);
  if (!isIP(normalized)) return null;
  return isIP(normalized) === 6 ? new URL(`http://[${normalized}]/`).hostname : normalized;
};
const numberValue = (value, unit) => {
  let normalized = normalize(value);
  if (unit && normalized.endsWith(unit)) normalized = normalized.slice(0, -unit.length).trim();
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
};

export function gradeStudyQuestion(question, answers) {
  return question.blanks.map((blank) => {
    const response = normalize(answers[blank.id] || "");
    let correct = false, verdict = "incorrect";
    if (response) {
      if (blank.kind === "number") {
        const value = numberValue(response, blank.unit);
        const target = Number(blank.answer);
        correct = value !== null && Math.abs(value - target) <= blank.tolerance + Number.EPSILON * Math.max(1, Math.abs(target));
      } else if (blank.kind === "ip") {
        const value = ipValue(response);
        correct = value !== null && value === ipValue(blank.answer);
      } else {
        const key = (value) => blank.caseSensitive ? normalize(value) : normalize(value).toLowerCase();
        correct = [blank.answer, ...blank.aliases].some((answer) => key(answer) === key(response));
        if (!correct && blank.kind === "term") verdict = "uncertain";
      }
    }
    if (correct) verdict = "correct";
    return { blankId: blank.id, verdict, score: correct ? 1 : 0,
      response, expectedAnswer: blank.answer,
      reason: correct ? "符合本空的评分标准。" : verdict === "uncertain" ? "正在确认你的表达是否等价。" : response ? "与本空的参考答案不符。" : "本空未填写。",
    };
  });
}

export function summarizeStudyGrade(results) {
  const pending = results.some((item) => item.verdict === "uncertain");
  const score = results.reduce((sum, item) => sum + (item.verdict === "correct" ? 1 : 0), 0);
  return { results, score, maxScore: results.length, status: pending ? "pending_review" : "graded",
    correct: !pending && score === results.length };
}
