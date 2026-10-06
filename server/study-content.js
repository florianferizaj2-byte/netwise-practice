import crypto from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";
import { certificates } from "./certificates.js";

export const studyError = (message, status = 400, code = "STUDY_ERROR") =>
  Object.assign(new Error(message), { status, code });
export const studyHash = (value) => crypto.createHash("sha256")
  .update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
export const studyDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });

// Course identity is independent of accounts; a changed scope needs a newly
// reviewed revision. Long or layered topics are split into separately teachable
// entries so progress, practice, and approval remain small and reusable.
const certificate = certificates.find((item) => item.id === "network-engineer");
const osiLayers = [
  ["physical", "物理层", "第1层", "负责在传输介质上发送和接收比特流，关注信号、接口、介质和传输速率；常见考点包括双绞线、光纤、无线介质、中继器与集线器。"],
  ["data-link", "数据链路层", "第2层", "负责在同一链路上组织成帧和节点间传送，关注帧、MAC 寻址、介质访问和链路差错检测；常见设备包括网桥和二层交换机。"],
  ["network", "网络层", "第3层", "负责逻辑寻址以及跨网络的分组转发和路由选择，关注 IP 地址、路由表、分组与路由器；不要把 TCP/UDP 端口或可靠传输混入本层。"],
  ["transport", "传输层", "第4层", "负责端到端或进程间传输，关注端口、复用与分用、分段和传输控制；TCP 提供面向连接的可靠传输，UDP 提供无连接的数据报服务。"],
  ["session", "会话层", "第5层", "负责建立、管理和终止应用进程间的会话，并可提供对话控制与同步；区分会话管理和传输层的数据传送。"],
  ["presentation", "表示层", "第6层", "负责数据表示和语法转换，使不同系统能理解数据，常见功能包括字符编码或格式转换、压缩、加密与解密；不把具体应用业务混入本层。"],
  ["application", "应用层", "第7层", "为应用进程提供网络服务接口，常见考点包括 HTTP、DNS、FTP、SMTP 等应用协议及其服务；这里的“应用”指网络服务层，不是用户界面的全部逻辑。"],
];

export const studyNodes = (certificate?.taxonomy?.modules || [])
  .flatMap((module) => module.sections.flatMap((section) => section.knowledgePoints.flatMap((point) => {
    const parentId = `${certificate.id}:${point.code}`;
    if (point.name === "OSI七层模型") return osiLayers.map(([slug, title, orderLabel, scope], index) => {
      const content = { chapter: module.name, section: section.name,
        name: point.name, scope: `${orderLabel}${title}。${scope}`, aliases: point.aliases || [] };
      const sublesson = { id: slug, title, order: index + 1, total: 7 };
      const id = `${parentId}:${slug}`;
      return { id, parentId, parentName: point.name, sublesson, certificateId: certificate.id,
        code: point.code, ...content, version: studyHash({ ...content, sublesson }).slice(0, 20) };
    });
    const content = { chapter: module.name, section: section.name, name: point.name, scope: point.scope };
    return [{ id: parentId, parentId: null, parentName: null, sublesson: null,
      certificateId: certificate.id, code: point.code, ...content,
      aliases: point.aliases || [], version: studyHash(content).slice(0, 20) }];
  }))).map((node, order) => ({ ...node, order }));

export function studyNode(id, certificateId = "network-engineer") {
  const node = studyNodes.find((item) => item.id === id && item.certificateId === certificateId);
  if (!node) throw studyError("该知识点尚未开放或不属于当前证书", 404);
  return node;
}

const text = (min, max) => z.string().trim().min(min).max(max);
export const teacherAnswerSchema = z.object({
  conclusion: text(2, 120), points: z.array(text(2, 100)).max(3),
  example: text(0, 160).default(""),
}).strict().refine((answer) => [answer.conclusion, ...answer.points, answer.example].join("").length <= 420,
  "老师回答过长，请只保留结论、短解释和必要例子");

const blankSchema = z.object({
  id: text(1, 12).regex(/^b[1-3]$/), label: text(1, 45), answer: text(1, 120),
  aliases: z.array(text(1, 120)).max(8),
  kind: z.enum(["term", "number", "ip", "exact"]),
  caseSensitive: z.boolean(), unit: text(0, 20),
  tolerance: z.number().finite().min(0).max(1),
}).strict().superRefine((blank, ctx) => {
  if (blank.kind === "number" && (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(blank.answer) || !Number.isFinite(Number(blank.answer))))
    ctx.addIssue({ code: "custom", message: "数值答案须为有限十进制数，单位单独设置" });
  if (blank.kind === "ip" && !isIP(blank.answer))
    ctx.addIssue({ code: "custom", message: "IP 参考答案不合法" });
  if (blank.kind !== "number" && (blank.unit || blank.tolerance))
    ctx.addIssue({ code: "custom", message: "仅数值题允许单位和容差" });
  // Aliases belong to text rules. Numeric/IP equivalence is parsed by the
  // server, preventing a bad alias from silently bypassing deterministic rules.
  if (["number", "ip"].includes(blank.kind) && blank.aliases.length)
    ctx.addIssue({ code: "custom", message: "数值与IP答案不设置文字别名" });
});

export const studyQuestionSchema = z.object({
  id: text(2, 8).regex(/^q\d{1,2}$/), stem: text(8, 350),
  stage: z.enum(["基础", "理解", "应用"]),
  blanks: z.array(blankSchema).min(1).max(3),
  explanation: text(12, 240), hint: text(5, 100),
}).strict().superRefine((question, ctx) => {
  const tokens = [...question.stem.matchAll(/\{\{(b[1-3])\}\}/g)].map((match) => match[1]);
  const ids = question.blanks.map((blank) => blank.id);
  if (new Set(ids).size !== ids.length || tokens.length !== ids.length ||
      new Set(tokens).size !== tokens.length || ids.some((id) => !tokens.includes(id)) ||
      question.stem.replace(/\{\{b[1-3]\}\}/g, "").includes("{{"))
    ctx.addIssue({ code: "custom", message: "每个空必须恰好对应题干中的一个 {{b1}} 标记" });
});

export const studyPackageSchema = z.object({
  lesson: z.object({ title: text(2, 90), summary: text(10, 160),
    points: z.array(text(8, 150)).min(1).max(3), example: text(8, 180), pitfall: text(5, 120),
  }).strict(),
  questions: z.array(studyQuestionSchema).length(6),
}).strict().superRefine((bundle, ctx) => {
  if (new Set(bundle.questions.map((q) => q.id)).size !== bundle.questions.length ||
      new Set(bundle.questions.map((q) => q.stem)).size !== bundle.questions.length)
    ctx.addIssue({ code: "custom", message: "题号和题干不能重复" });
  if (["基础", "理解", "应用"].some((stage) => bundle.questions.filter((q) => q.stage === stage).length !== 2))
    ctx.addIssue({ code: "custom", message: "基础、理解、应用三个阶段各须两题" });
  const lesson = bundle.lesson;
  if ([lesson.summary, ...lesson.points, lesson.example, lesson.pitfall].join("").length > 800)
    ctx.addIssue({ code: "custom", message: "课时过长，请拆成短句" });
});

export const studyReviewSchema = z.object({
  lesson: z.object({ valid: z.boolean(), knowledgeCorrect: z.boolean(),
    nodeAligned: z.boolean(), reason: text(2, 240) }).strict(),
  questions: z.array(z.object({ id: text(2, 8), valid: z.boolean(),
    nodeAligned: z.boolean(), answerCorrect: z.boolean(), explanationCorrect: z.boolean(), hintSafe: z.boolean(),
    reason: text(2, 240),
  }).strict()).length(6),
}).strict();

export function acceptedStudyReview(bundle, review) {
  return review.lesson.valid === true && review.lesson.knowledgeCorrect === true &&
    review.lesson.nodeAligned === true && new Set(review.questions.map((q) => q.id)).size === 6 &&
    bundle.questions.every((q) => {
      const verdict = review.questions.find((item) => item.id === q.id);
      return verdict?.valid === true && verdict.nodeAligned === true && verdict.answerCorrect === true &&
        verdict.explanationCorrect === true && verdict.hintSafe === true;
    });
}

export const publicStudyQuestion = ({ id, stem, stage, blanks }) => ({
  id, stem, stage, blanks: blanks.map(({ id: blankId, label, kind, unit }) => ({ id: blankId, label, kind, unit })),
});
