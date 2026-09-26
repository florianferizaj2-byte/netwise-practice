// Stable random order allows subsequent pages to continue the same practice set.
function rank(id, seed) {
  let hash = 2166136261;
  for (const char of `${seed}:${id}`)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export function questionPage(questions, { offset = 0, limit = 40, seed } = {}) {
  const ordered = seed
    ? questions
        .map((question) => ({ question, rank: rank(question.id, seed) }))
        .sort(
          (a, b) =>
            a.rank - b.rank || a.question.id.localeCompare(b.question.id),
        )
        .map(({ question }) => question)
    : questions;
  const items = ordered.slice(offset, offset + limit);
  return {
    items,
    total: ordered.length,
    nextOffset:
      offset + items.length < ordered.length ? offset + items.length : null,
  };
}
