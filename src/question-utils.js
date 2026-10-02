export const pct = (x) =>
  x === null || x === undefined ? "--" : Math.round(x * 100) + "%";

export const diff = { easy: "基础", medium: "进阶", hard: "挑战" };

export const sources = {
  practice: "原创练习题",
  official_like: "仿真练习题",
  past_exam: "历年真题",
  user_collection: "真题汇编（用户提供）",
  syllabus_practice: "HCIA V2.0 大纲仿真题",
  user_recall_collection: "第三方公开回忆题（用户提供）",
  user_simulation_collection: "第三方原创模拟题（用户提供）",
  user_external_2026_h1: "2026上半年网络工程师模拟题（用户提供）",
  user_external_2026_h1_lastset: "2026上半年网络工程师最后一套卷（用户提供）",
  ai_generated: "AI 生成练习题",
  admin_generated: "管理员 AI 扩充题",
};

export const sourceName = (q) => q.sourceLabel || sources[q.source] || q.source;

export const isSingleSelect = (question) =>
  question.type === "single_choice" || question.type === "true_false";

export const questionTypeName = (question, compact = false) => {
  if (question.type === "true_false") return "判断题";
  if (question.type === "multiple_choice") return compact ? "多选" : "多选题";
  if (question.type === "short_answer") return compact ? "简答" : "简答题";
  return compact ? "单选" : "单选题";
};

export const veterinaryModules = [
  "基础科目",
  "预防科目",
  "临床科目",
  "综合科目",
];

export const questionImages = (question) => {
  const images = Array.isArray(question?.images) ? question.images : [];
  const legacy = question?.image
    ? Array.isArray(question.image)
      ? question.image
      : [question.image]
    : [];
  return [...images, ...legacy]
    .map((image) => (typeof image === "string" ? { src: image } : image))
    .filter((image) => image?.src);
};

export const sharedMarker = (question) => {
  const match = String(question?.question || "").match(
    /^\s*题共用(题干|备选答案)\)\s*/,
  );
  if (!match && !question?.sharedGroupId) return null;
  const inferredKind =
    match?.[1] === "题干"
      ? "stem"
      : match?.[1] === "备选答案"
        ? "options"
        : question?.sharedStem
          ? "stem"
          : "options";
  return {
    kind: question?.sharedKind || inferredKind,
    label:
      match?.[1] ||
      (question?.sharedKind === "stem" || question?.sharedStem
        ? "题干"
        : "备选答案"),
    text: match
      ? String(question.question).slice(match[0].length).trim()
      : String(question.question || ""),
  };
};

export const optionSignature = (question) =>
  JSON.stringify(question?.options || {});

export const commonPrefix = (values) => {
  if (!values.length) return "";
  let prefix = values[0];
  for (const value of values.slice(1)) {
    let end = 0;
    while (
      end < prefix.length &&
      end < value.length &&
      prefix[end] === value[end]
    )
      end += 1;
    prefix = prefix.slice(0, end);
    if (!prefix) break;
  }
  return prefix.replace(/[\s,，。；;：:、]+$/g, "").trim();
};

export function buildVeterinaryGroups(questions) {
  const groups = [];
  const explicitGroups = new Map();
  questions.forEach((question, index) => {
    const marker = sharedMarker(question);
    if (question.sharedGroupId) {
      let group = explicitGroups.get(question.sharedGroupId);
      if (!group) {
        group = {
          id: `explicit:${question.sharedGroupId}`,
          key: `explicit:${question.sharedGroupId}`,
          kind: question.sharedKind || marker?.kind || "stem",
          questions: [],
          indexes: [],
          stem: question.sharedStem || "",
        };
        explicitGroups.set(question.sharedGroupId, group);
        groups.push(group);
      }
      group.questions.push(question);
      group.indexes.push(index);
      group.kind ||= question.sharedKind || marker?.kind || "stem";
      if (!group.stem && question.sharedStem) group.stem = question.sharedStem;
      return;
    }
    const kind = marker?.kind || null;
    const candidate = marker ? `${kind}:${optionSignature(question)}` : null;
    const previous = groups[groups.length - 1];
    const canJoinInferred =
      Boolean(candidate && previous && previous.key === candidate) &&
      (kind === "options" ||
        commonPrefix([
          ...previous.questions.map(
            (item) => sharedMarker(item)?.text || item.question,
          ),
          marker?.text || question.question,
        ]).length >= 16);
    if (!canJoinInferred) {
      groups.push({
        id: candidate || `single:${question.id}`,
        key: candidate,
        kind,
        questions: [question],
        indexes: [index],
        stem: question.sharedStem || "",
      });
      return;
    }
    previous.questions.push(question);
    previous.indexes.push(index);
    previous.kind ||= kind;
    if (!previous.stem && question.sharedStem)
      previous.stem = question.sharedStem;
  });
  return groups
    .map((group) => {
      const markedTexts = group.questions
        .map((question) => sharedMarker(question)?.text || question.question)
        .filter(Boolean);
      const inferredStem =
        group.kind === "stem" ? commonPrefix(markedTexts) : "";
      return {
        ...group,
        shared: Boolean(
          group.kind ||
          group.questions.some((question) => question.sharedGroupId),
        ),
        stem: (group.stem || inferredStem).trim(),
      };
    })
    .sort((a, b) => Math.min(...a.indexes) - Math.min(...b.indexes));
}

export const questionTextForGroup = (question, group) => {
  const marker = sharedMarker(question);
  let text = marker?.text || question.question;
  if (group?.kind === "stem" && group.stem && text.startsWith(group.stem))
    text = text.slice(group.stem.length).trim();
  return text.replace(/^[-—:：，,。\s]+/, "").trim();
};
