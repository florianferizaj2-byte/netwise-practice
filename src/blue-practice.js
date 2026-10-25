export function chapterGroups(
  dashboard,
  questions,
  shared = [],
  source = "all",
  includeShared = false,
) {
  const unique = new Map(
    questions
      .filter(
        (q) =>
          q.source !== "ai_generated" &&
          (source === "all" || q.source === source),
      )
      .map((q) => [q.id, q]),
  );
  if (includeShared)
    for (const q of shared) if (!unique.has(q.id)) unique.set(q.id, q);
  const groups = new Map(
    (dashboard.chapters || []).map((c) => [c.name, { ...c, questions: [] }]),
  );
  for (const q of unique.values()) {
    if (!groups.has(q.chapter))
      groups.set(q.chapter, { name: q.chapter, sections: [], questions: [] });
    groups.get(q.chapter).questions.push(q);
  }
  return [...groups.values()].map((c) => {
    const attempted = c.questions.filter((q) => q.attempted).length;
    return {
      ...c,
      total: c.questions.length,
      attempted,
      status: !c.questions.length
        ? "unavailable"
        : attempted === c.questions.length
          ? "complete"
          : attempted
            ? "in-progress"
            : "unstarted",
    };
  });
}
export function practicePool(
  questions,
  {
    range = "all",
    wrongIds = new Set(),
    order = "sequential",
    count = 10,
  } = {},
) {
  const pool = questions.filter((q) =>
    range === "unattempted"
      ? !q.attempted
      : range === "wrong"
        ? wrongIds.has(q.id)
        : true,
  );
  if (order === "random")
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
  return count === "all" ? pool : pool.slice(0, count);
}
export const practicePreferenceKey = (user, certificate) =>
  user && certificate
    ? `aceexam-practice-preferences:${encodeURIComponent(user)}:${encodeURIComponent(certificate)}`
    : null;
const defaults = { order: "sequential", range: "all", count: 10 };
export function hasPracticePreferences(storage, key) {
  try {
    const value = JSON.parse(storage.getItem(key));
    return (
      !!value &&
      ["sequential", "random"].includes(value.order) &&
      ["all", "unattempted", "wrong"].includes(value.range) &&
      [10, 20, 30, "all"].includes(value.count)
    );
  } catch {
    return false;
  }
}
export function readPracticePreferences(storage, key, defaultCount = 10) {
  const fallback = {
    ...defaults,
    count: [10, 20, 30].includes(defaultCount) ? defaultCount : 10,
  };
  try {
    const value = JSON.parse(storage.getItem(key));
    if (
      !value ||
      !["sequential", "random"].includes(value.order) ||
      !["all", "unattempted", "wrong"].includes(value.range) ||
      ![10, 20, 30, "all"].includes(value.count)
    )
      return fallback;
    return { order: value.order, range: value.range, count: value.count };
  } catch {
    return fallback;
  }
}
