export const practiceStorageKey = (userId, certificateId) =>
  userId && certificateId
    ? `kaojiang-practice:${encodeURIComponent(userId)}:${encodeURIComponent(certificateId)}`
    : null;

const practiceOrigins = {
  home: "学习总览",
  chapters: "章节练习",
  wrong: "错题本",
  favorites: "我的收藏",
  training: "AI 专项训练",
  community: "共享题库",
  plan: "学习计划",
};
export const practiceReturnPage = (session) =>
  session?.planTask
    ? "plan"
    : Object.hasOwn(practiceOrigins, session?.returnPage)
      ? session.returnPage
      : "home";
export const practiceReturnLabel = (session) =>
  "返回" + practiceOrigins[practiceReturnPage(session)];

export function readPracticeProgress(storage, key) {
  if (!key) return null;
  try {
    const data = JSON.parse(storage.getItem(key));
    if (
      data?.version !== 1 ||
      typeof data.title !== "string" ||
      !Array.isArray(data.questionIds) ||
      !data.questionIds.length ||
      data.questionIds.length > 20000 ||
      !data.questionIds.every((id) => typeof id === "string") ||
      !Number.isInteger(data.index) ||
      data.index < 0 ||
      data.index >= data.questionIds.length ||
      !data.responses ||
      typeof data.responses !== "object" ||
      Array.isArray(data.responses)
    )
      return null;
    if (
      data.planTask &&
      (!["planId", "taskId"].every((key) =>
        /^[a-f0-9-]{36}$/.test(data.planTask[key] || ""),
      ) ||
        Object.keys(data.planTask).some(
          (key) => !["planId", "taskId"].includes(key),
        ))
    )
      return null;
    const validResponses = Object.values(data.responses).every(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        !Array.isArray(entry) &&
        ["teacher", "responseDraft"].every(
          (field) => entry[field] == null || typeof entry[field] === "string",
        ) &&
        (entry.hint == null || Number.isFinite(entry.hint)) &&
        (!entry.submitted || !!entry.result) &&
        (!entry.selected ||
          (Array.isArray(entry.selected) &&
            entry.selected.every((value) => typeof value === "string"))) &&
        (!entry.result ||
          (typeof entry.result === "object" &&
            Array.isArray(entry.result.answer) &&
            entry.result.answer.every((value) => typeof value === "string") &&
            ["analysis", "expectedAnswer", "questionId"].every(
              (field) =>
                entry.result[field] == null ||
                typeof entry.result[field] === "string",
            ))),
    );
    return validResponses ? data : null;
  } catch {
    return null;
  }
}

export function restorePracticeProgress(saved, availableQuestions) {
  if (!saved) return null;
  const byId = new Map(
    availableQuestions.map((question) => [question.id, question]),
  );
  const questions = saved.questionIds.map((id) => byId.get(id)).filter(Boolean);
  if (!questions.length) return null;
  const currentId = saved.questionIds[saved.index];
  const found = questions.findIndex((question) => question.id === currentId);
  const responses = {};
  for (const question of questions) {
    const entry = saved.responses[question.id];
    // If a question has changed, let the learner answer the current version afresh.
    if (
      entry &&
      saved.signatures?.[question.id] === questionSignature(question)
    )
      responses[question.id] = entry;
  }
  return {
    questions,
    mode: saved.mode === "memorize" ? "memorize" : "practice",
    title: saved.title,
    returnPage: practiceReturnPage(saved),
    ...(Number.isFinite(saved.startedAt) &&
    saved.startedAt > 0 &&
    saved.startedAt <= Date.now()
      ? { startedAt: saved.startedAt }
      : {}),
    ...(saved.planTask ? { planTask: saved.planTask } : {}),
    progress: {
      index: found >= 0 ? found : Math.min(saved.index, questions.length - 1),
      responses,
    },
  };
}

export async function loadPracticeProgress(
  saved,
  availableQuestions,
  loadSharedQuestions,
  loadPlanSession,
) {
  if (!saved) return null;
  if (saved.planTask) {
    if (!loadPlanSession) return null;
    const remote = await loadPlanSession(saved.planTask);
    const drafts =
      restorePracticeProgress(saved, remote.questions)?.progress.responses ||
      {};
    const responses = { ...remote.progress.responses };
    for (const [id, draft] of Object.entries(drafts))
      if (!responses[id] && !draft.submitted)
        responses[id] = {
          ...(draft.selected ? { selected: draft.selected } : {}),
          ...(draft.responseDraft
            ? { responseDraft: draft.responseDraft }
            : {}),
          ...(draft.attemptPayload ? {
            attemptPayload: draft.attemptPayload,
            result: draft.result,
            saveStatus: "error",
            saveError: "上次保存未确认，请重试同步。",
          } : {}),
        };
    const currentId = saved.questionIds[saved.index];
    const index = remote.questions.findIndex(
      (q) => q.id === currentId && !responses[q.id]?.submitted,
    );
    return {
      ...remote,
      mode: saved.mode === "memorize" ? "memorize" : "practice",
      returnPage: "plan",
      ...(Number.isFinite(saved.startedAt) &&
      saved.startedAt > 0 &&
      saved.startedAt <= Date.now()
        ? { startedAt: saved.startedAt }
        : {}),
      progress: {
        index: index >= 0 ? index : remote.progress.index,
        responses,
      },
    };
  }
  const availableIds = new Set(
    availableQuestions.map((question) => question.id),
  );
  const missing = saved.questionIds.some((id) => !availableIds.has(id));
  // Shared AI questions are served separately from the learner's own question list.
  const shared = missing ? await loadSharedQuestions() : [];
  return restorePracticeProgress(saved, [...availableQuestions, ...shared]);
}

export const questionSignature = (question) =>
  JSON.stringify([
    question.type,
    question.question,
    question.options,
    question.images,
  ]);

export function savePracticeProgress(
  storage,
  key,
  session,
  index,
  responses,
  done,
  mode = "practice",
) {
  if (!key) return;
  try {
    if (done) {
      storage.removeItem(key);
      return;
    }
    storage.setItem(
      key,
      JSON.stringify({
        version: 1,
        mode: mode === "memorize" ? "memorize" : "practice",
        title: session.title,
        returnPage: practiceReturnPage(session),
        ...(Number.isFinite(session.startedAt) && session.startedAt > 0
          ? { startedAt: session.startedAt }
          : {}),
        ...(session.planTask ? { planTask: session.planTask } : {}),
        questionIds: session.questions.map((question) => question.id),
        index,
        responses,
        updatedAt: Date.now(),
        signatures: Object.fromEntries(
          session.questions
            .filter((question) => responses[question.id])
            .map((question) => [question.id, questionSignature(question)]),
        ),
      }),
    );
  } catch {
    /* Practice remains usable when browser storage is unavailable or full. */
  }
}
