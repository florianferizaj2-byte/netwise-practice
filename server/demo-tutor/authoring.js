import crypto from "node:crypto";
import { validateLesson } from "./protocol.js";
export const E = (id, title, paragraphs) => ({
  type: "ExplanationCard",
  id,
  title,
  paragraphs,
});
export const K = (id, title, items) => ({
  type: "KnowledgeCard",
  id,
  title,
  items,
});
export const T = (id, title, rows) => ({
  type: "ComparisonTable",
  id,
  title,
  columns: ["观察条件", "判断依据"],
  rows,
});
// Authors provide a meaningful reason for each distractor; the order is deterministic,
// but correct option positions vary. No key is derived from a browser-supplied answer.
export function question(id, prompt, correct, explanation, wrong) {
  if (
    wrong.length !== 3 ||
    new Set([correct, ...wrong.map((w) => w[0])]).size !== 4
  )
    throw new Error(`重复或不足的选项: ${id}`);
  const rows = [
    { text: correct, right: true },
    ...wrong.map(([text, errorType, title, reason, hint]) => ({
      text,
      errorType,
      title,
      reason,
      hint,
    })),
  ];
  const shift = crypto.createHash("sha256").update(id).digest()[0] % 4;
  const shuffled = [...rows.slice(shift), ...rows.slice(0, shift)];
  const options = shuffled.map((r, i) => ({
    id: String.fromCharCode(97 + i),
    text: r.text,
  }));
  const answer = options[shuffled.findIndex((r) => r.right)].id;
  const branches = Object.fromEntries(
    shuffled.flatMap((r, i) =>
      r.right
        ? []
        : [
            [
              options[i].id,
              {
                errorType: r.errorType,
                title: r.title,
                explanation: r.reason,
                hint: r.hint,
              },
            ],
          ],
    ),
  );
  return { id, prompt, options, answer, branches, explanation };
}
export function pack(nodeId, title, sections, sources, sourceVersion) {
  const course = {
    id: nodeId,
    nodeId,
    title,
    version: "20261012-v1",
    sourceVersion,
    subtitle: "分段理解，再用不同场景确认掌握。",
    minutes: Math.max(6, sections.length * 3),
    concepts: sections.map((s) => ({ id: s.id, title: s.title })),
    sources,
  };
  const record = {
    course,
    teaching: sections.map((s) => s.cards),
    foundations: sections.map((s) =>
      E(s.id + "-foundation", "先建立这个概念", [s.foundation]),
    ),
    quizzes: sections.map((s) => ({
      main: s.questions[0],
      variants: s.questions.slice(1),
      correct: s.takeaway,
    })),
    summary: sections.map((s) => s.takeaway),
  };
  record.remedialCards = (fault, index) => [
    E(sections[index].id + "-remedy-" + fault.errorType, fault.title, [
      fault.explanation,
    ]),
    K(sections[index].id + "-remedy-key", "换一个判断顺序", [
      fault.hint,
      sections[index].takeaway,
    ]),
  ];
  validateBundle(record);
  return record;
}
export function validateBundle(record) {
  const { course, teaching, foundations, quizzes, summary } = record;
  if (
    !Array.isArray(course.sources) ||
    course.sources.length < 1 ||
    course.sources.length > 5 ||
    !course.sources.every(
      (s) =>
        typeof s.title === "string" &&
        s.title.length > 0 &&
        s.title.length <= 100 &&
        (s.url === undefined ||
          (typeof s.url === "string" && s.url.length <= 500)),
    )
  )
    throw new Error(`课程来源不符合公开元信息约定: ${course.id}`);
  const n = course.concepts.length;
  if (
    n < 1 ||
    n > 12 ||
    new Set(course.concepts.map((c) => c.id)).size !== n ||
    [teaching, foundations, quizzes].some((a) => a.length !== n) ||
    summary.length !== n
  )
    throw new Error(`课程段落不完整: ${course.id}`);
  const quizIds = new Set();
  for (let i = 0; i < n; i++) {
    validateLesson(teaching[i]);
    validateLesson([foundations[i]]);
    if (quizzes[i].variants.length !== 2)
      throw new Error(`缺少两道变式: ${course.id}`);
    for (const q of [quizzes[i].main, ...quizzes[i].variants]) {
      if (quizIds.has(q.id)) throw new Error("题目ID重复");
      quizIds.add(q.id);
      if (!q.options.some((o) => o.id === q.answer))
        throw new Error("标准答案不在选项中");
      if (new Set(q.options.map((o) => o.text)).size !== q.options.length)
        throw new Error("小测选项文字重复");
      validateLesson([
        {
          type: "MiniQuiz",
          id: q.id,
          title: "理解检验",
          prompt: q.prompt,
          options: q.options,
          kind: "check",
        },
      ]);
      for (const option of q.options.filter((o) => o.id !== q.answer)) {
        const fault = q.branches[option.id];
        if (
          !fault?.errorType ||
          !fault.title ||
          !fault.explanation ||
          !fault.hint
        )
          throw new Error(`缺少错项教学: ${q.id}`);
        validateLesson(record.remedialCards(fault, i));
      }
    }
  }
}
