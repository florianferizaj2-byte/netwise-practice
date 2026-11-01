import { z } from "zod";

const text = z.string().trim().min(1).max(650);
const short = z.string().trim().min(1).max(100);
const id = z.string().regex(/^[a-zA-Z0-9:._-]{1,100}$/);
const explanation = z
  .object({
    type: z.literal("ExplanationCard"),
    id,
    title: short,
    paragraphs: z.array(text).min(1).max(3),
  })
  .strict();
const knowledge = z
  .object({
    type: z.literal("KnowledgeCard"),
    id,
    title: short,
    items: z.array(text).min(1).max(4),
  })
  .strict();
const comparison = z
  .object({
    type: z.literal("ComparisonTable"),
    id,
    title: short,
    columns: z.array(short).min(2).max(3),
    rows: z.array(z.array(short).min(2).max(3)).min(1).max(5),
  })
  .strict();
const network = z
  .object({
    type: z.literal("NetworkDiagram"),
    id,
    title: short,
    scenario: z.enum(["single-domain", "vlan-isolation", "access-port"]),
    caption: text,
    source: z.enum(["A", "B", "C", "D"]),
    hosts: z
      .array(
        z
          .object({
            id: z.enum(["A", "B", "C", "D"]),
            vlan: z.union([z.literal(10), z.literal(20)]),
            port: z.number().int().min(1).max(4),
          })
          .strict(),
      )
      .length(4),
  })
  .strict();
const eye = z
  .object({
    type: z.literal("EyeDiagram"),
    id,
    title: short,
    scenario: z.enum(["amplitude-noise", "timing-jitter"]),
    caption: text,
  })
  .strict();
const quiz = z
  .object({
    type: z.literal("MiniQuiz"),
    id,
    title: short,
    prompt: text,
    options: z.array(z.object({ id, text }).strict()).min(2).max(4),
    kind: z.enum(["check", "variant"]),
  })
  .strict();
const feedback = z
  .object({
    type: z.literal("FeedbackCard"),
    id,
    title: short,
    correct: z.boolean(),
    selectedId: id,
    correctId: id,
    correctText: text,
    explanation: text,
    errorType: z.string().max(80),
    nextHint: text,
  })
  .strict();
const progress = z
  .object({
    type: z.literal("LessonProgress"),
    id,
    current: z.number().int().min(0).max(12),
    total: z.number().int().min(1).max(12),
    concepts: z
      .array(
        z
          .object({
            id,
            title: short,
            status: z.enum(["locked", "current", "mastered", "review"]),
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict();

// Only these structured parameters reach the renderer. No markup or code fields.
export const componentSchema = z.discriminatedUnion("type", [
  explanation,
  knowledge,
  comparison,
  network,
  quiz,
  eye,
  feedback,
  progress,
]);
export const lessonSchema = z
  .object({
    schemaVersion: z.literal(1),
    components: z.array(componentSchema).min(1).max(10),
  })
  .strict();
export const lessonJSONSchema = z.toJSONSchema(lessonSchema, {
  target: "draft-2020-12",
});

export function validateLesson(components) {
  const result = lessonSchema.parse({ schemaVersion: 1, components });
  const seen = new Set();
  for (const c of result.components) {
    if (seen.has(c.id)) throw new Error("课程步骤 ID 重复");
    seen.add(c.id);
    if (
      c.type === "LessonProgress" &&
      (c.current > c.total ||
        c.concepts.length !== c.total ||
        new Set(c.concepts.map((n) => n.id)).size !== c.total)
    )
      throw new Error("课程进度与概念数量不一致");
    if (
      c.type === "MiniQuiz" &&
      new Set(c.options.map((o) => o.id)).size !== c.options.length
    )
      throw new Error("小测选项 ID 重复");
    if (
      c.type === "ComparisonTable" &&
      c.rows.some((row) => row.length !== c.columns.length)
    )
      throw new Error("对比表格的列数不一致");
    if (
      c.type === "NetworkDiagram" &&
      (new Set(c.hosts.map((h) => h.id)).size !== 4 ||
        new Set(c.hosts.map((h) => h.port)).size !== 4)
    )
      throw new Error("网络拓扑主机与端口不一致");
  }
  return result;
}

export const startSchema = z
  .object({
    courseId: z
      .string()
      .max(100)
      .regex(/^(vlan-broadcast-domain|network-engineer:[a-zA-Z0-9:._-]+)$/),
    foundation: z.enum(["beginner", "review"]),
    pacing: z.enum(["concept", "guided"]).optional(),
    restart: z.boolean().default(false),
    requestId: z.string().uuid(),
  })
  .strict();
export const actionSchema = z
  .object({
    requestId: z.string().uuid(),
    revision: z.number().int().min(0),
    action: z.enum(["next", "back", "guide", "answer"]),
    optionId: id.optional(),
  })
  .strict();
