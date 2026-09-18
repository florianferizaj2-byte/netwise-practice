import { z } from "zod";
import crypto from "node:crypto";

export const stages = [
  "基础理解",
  "直接计算",
  "变式计算",
  "反向推理",
  "综合应用",
];
const optionText = z.string().min(1).max(800);
export const questionSchema = z
  .object({
    type: z.enum(["single_choice", "multiple_choice", "true_false"]),
    question: z.string().min(10).max(2000),
    options: z
      .object({
        A: optionText,
        B: optionText,
        C: optionText.optional(),
        D: optionText.optional(),
        E: optionText.optional(),
      })
      .strict(),
    answer: z
      .array(z.enum(["A", "B", "C", "D", "E"]))
      .min(1)
      .max(5),
    analysis: z.string().min(12).max(5000),
    chapter: z.string().min(1).max(100),
    knowledgePoint: z.string().min(1).max(100),
    difficulty: z.enum(["easy", "medium", "hard"]),
    tags: z.array(z.string().max(50)).min(1).max(12),
    certificates: z
      .array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/))
      .min(1)
      .max(20)
      .optional(),
    stage: z.enum(stages).optional(),
  })
  .strict()
  .superRefine((q, ctx) => {
    const optionKeys = Object.keys(q.options);
    const isTrueFalse = q.type === "true_false";
    const standardOptions = ["A", "B", "C", "D"];
    if (
      new Set(q.answer).size !== q.answer.length ||
      ((q.type === "single_choice" || isTrueFalse) && q.answer.length !== 1) ||
      (q.type === "multiple_choice" && q.answer.length < 2)
    )
      ctx.addIssue({ code: "custom", message: "答案数量与题型不一致" });
    if (
      (isTrueFalse &&
        (optionKeys.length !== 2 ||
          !["A", "B"].every((key) => optionKeys.includes(key)))) ||
      (!isTrueFalse &&
        (!standardOptions.every((key) => optionKeys.includes(key)) ||
          optionKeys.length < 4 ||
          optionKeys.length > 5))
    )
      ctx.addIssue({ code: "custom", message: "选项数量与题型不一致" });
    if (q.answer.some((key) => !optionKeys.includes(key)))
      ctx.addIssue({ code: "custom", message: "答案不在选项中" });
    if (
      new Set(Object.values(q.options).map((x) => x.trim().toLowerCase()))
        .size !== optionKeys.length
    )
      ctx.addIssue({ code: "custom", message: "存在重复选项" });
  });
export const mistakeSchema = z
  .object({
    mistakeType: z.string().min(1).max(100),
    weakKnowledge: z.string().min(1).max(200),
    reason: z.string().min(10).max(2000),
  })
  .strict();
export function fingerprint(q) {
  return crypto
    .createHash("sha256")
    .update(
      q.question.replace(/[\s，。？?！!、：:]/g, "").toLowerCase() +
        JSON.stringify(Object.entries(q.options).sort()),
    )
    .digest("hex");
}
export function ipv4(ip, prefix) {
  const parts = ip.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255) ||
    !Number.isInteger(prefix) ||
    prefix < 0 ||
    prefix > 32
  )
    throw new Error("无效 IPv4/CIDR");
  const n = parts.reduce((a, b) => a * 256 + b, 0),
    size = 2 ** (32 - prefix),
    network = Math.floor(n / size) * size;
  const format = (n) =>
    [24, 16, 8, 0].map((s) => Math.floor(n / 2 ** s) % 256).join(".");
  return {
    network: format(network),
    broadcast: format(network + size - 1),
    first: format(network + (prefix < 31 ? 1 : 0)),
    last: format(network + size - (prefix < 31 ? 2 : 1)),
    hosts: prefix < 31 ? size - 2 : size,
    size,
  };
}
export function verifyCalculation(q) {
  const cidr = q.question.match(/(\d{1,3}(?:\.\d{1,3}){3})\s*\/\s*(\d{1,2})/);
  if (!cidr) return { checked: false };
  const x = ipv4(cidr[1], Number(cidr[2]));
  let expected;
  if (
    /最后一个(?:可用)?主机地址.*[?？]|最后(?:一个)?可用(?:主机)?地址.*[?？]/.test(
      q.question,
    )
  )
    expected = x.last;
  else if (/第一个(?:可用)?主机地址.*[?？]/.test(q.question))
    expected = x.first;
  else if (/广播地址.*[?？]/.test(q.question)) expected = x.broadcast;
  else if (/网络地址.*[?？]/.test(q.question)) expected = x.network;
  else if (/可用主机(?:数|数量)|多少(?:个)?可用主机/.test(q.question))
    expected = String(x.hosts);
  else if (/可用主机(?:地址)?范围/.test(q.question))
    expected = `${x.first}-${x.last}`;
  if (expected === undefined) return { checked: false };
  const normalize = (s) => s.replace(/\s|个|台/g, "").replace(/[～~至—]/g, "-");
  const matching = Object.entries(q.options)
    .filter(([, v]) => normalize(v) === expected)
    .map(([k]) => k);
  if (
    matching.length !== 1 ||
    q.answer.length !== 1 ||
    matching[0] !== q.answer[0]
  )
    throw new Error("程序计算结果与 AI 答案不一致");
  return { checked: true, expected };
}
export function validateQuestion(raw, existing = [], context) {
  const q = questionSchema.parse(raw);
  if (
    existing.some(
      (x) => fingerprint({ ...x, source: undefined }) === fingerprint(q),
    )
  )
    throw new Error("与已有题目重复");
  const pattern = (text) =>
    text
      .replace(/\d+(?:\.\d+)*/g, "#")
      .replace(/[\s，。？?！!、：:]/g, "")
      .toLowerCase();
  if (existing.some((x) => pattern(x.question) === pattern(q.question)))
    throw new Error("变式题不能只修改数字");
  if (/TODO|待补充|以上信息|如下图|见图/.test(q.question))
    throw new Error("题干信息不完整");
  if (context && q.chapter !== context.chapter)
    throw new Error("题目偏离当前章节");
  verifyCalculation(q);
  return q;
}
export function calculateMastery(attempts, now = Date.now()) {
  const total = attempts.length,
    correctCount = attempts.filter((a) => a.correct).length,
    wrongCount = total - correctCount;
  const recent = attempts.slice(-20),
    recentAccuracy = recent.length
      ? recent.filter((a) => a.correct).length / recent.length
      : 0;
  let consecutiveCorrect = 0,
    consecutiveWrong = 0;
  for (let i = total - 1; i >= 0 && attempts[i].correct; i--)
    consecutiveCorrect++;
  for (let i = total - 1; i >= 0 && !attempts[i].correct; i--)
    consecutiveWrong++;
  const lastPracticedAt = total ? attempts[total - 1].createdAt : null;
  const decay = lastPracticedAt
    ? Math.min(
        20,
        Math.max(0, (now - new Date(lastPracticedAt)) / 86400000 - 7) * 0.5,
      )
    : 0;
  const accuracy = total ? correctCount / total : 0;
  const masteryScore = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        (accuracy * 35 + recentAccuracy * 65) * Math.min(1, total / 10) - decay,
      ),
    ),
  );
  return {
    correctCount,
    wrongCount,
    accuracy,
    recentAccuracy,
    averageTime: total
      ? Math.round(attempts.reduce((s, a) => s + a.timeMs, 0) / total)
      : 0,
    attemptCount: total,
    consecutiveCorrect,
    consecutiveWrong,
    lastPracticedAt,
    masteryScore,
  };
}
export function chooseDifficulty(m, index = 0) {
  if (m?.attemptCount < 3 || m?.consecutiveWrong >= 2) return "easy";
  if (!m || m.accuracy < 0.5) return "easy";
  if (m.accuracy < 0.75) return index % 2 ? "medium" : "easy";
  if (m.accuracy <= 0.9) return index % 2 ? "hard" : "medium";
  return "hard";
}
export function nextReview(previous, correct, now = Date.now()) {
  const step = correct ? Math.min((previous?.step ?? -1) + 1, 4) : 0;
  return {
    step,
    dueAt: new Date(now + [1, 3, 7, 14, 30][step] * 86400000).toISOString(),
  };
}
