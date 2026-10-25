// Server-owned budgets: callers may lower a limit, but never remove or exceed
// the task ceiling. Large JSON batches scale by item count, not by prose length.
const profiles = {
  default: [2048, 4096],
  "connection-test": [256, 256],
  "admin-connection-test": [256, 256],
  "question-explanation": [900, 1800],
  "question-hint": [256, 512],
  "hint-review": [128, 256],
  "mistake-analysis": [800, 1600],
  "daily-plan": [1200, 2400],
  "study-generation": [6500, 10000],
  "study-content-review": [2200, 4400],
  "study-grading": [800, 1600],
  "study-teacher": [2048, 4096],
  "interactive-tutor-teacher": [2048, 4096],
  "interactive-tutor-review": [700, 1400],
};
const positive = (value) => Number.isSafeInteger(value) && value > 0;

export function aiOutputBudget(options = {}) {
  const count = positive(options.outputItemCount)
    ? Math.min(options.outputItemCount, 20) : 1;
  let [initial, ceiling] = profiles[options.taskType] || profiles.default;
  if (options.taskType === "question-generation") {
    initial = 800 + count * 1200;
    ceiling = 1600 + count * 1800;
  } else if (options.taskType === "question-review") {
    initial = 256 + count * 320;
    ceiling = 512 + count * 640;
  }
  const maxTokens = positive(options.maxTokens)
    ? Math.min(options.maxTokens, ceiling) : initial;
  const retryTokens = positive(options.truncationMaxTokens)
    ? Math.min(options.truncationMaxTokens, ceiling) : ceiling;
  return { maxTokens, retryTokens: Math.max(maxTokens, retryTokens), ceiling };
}

export const conciseAiOutput = "输出精简、准确、信息密度高的内容，不重复题干、不写寒暄或长篇铺垫。保留必要条件、关键公式、单位和解题步骤；不得为了缩短文字省略必需字段、题目、审核项或影响结论的依据。";
