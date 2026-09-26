import type { CachePolicy } from './resourceCache';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

function studyNode(
  value: unknown,
  depth = 0,
): Record<string, unknown> | undefined {
  if (
    !isRecord(value) ||
    depth > 2 ||
    typeof value.name !== 'string' ||
    typeof value.questionCount !== 'number'
  )
    return undefined;
  const node: Record<string, unknown> = {
    name: value.name,
    knowledgeSection: value.knowledgeSection,
    questionCount: value.questionCount,
    attemptedCount: value.attemptedCount,
    progress: value.progress,
  };
  for (const field of ['knowledgePoints', 'sections']) {
    if (value[field] === undefined) continue;
    if (!Array.isArray(value[field])) return undefined;
    const children = value[field].map((child) => studyNode(child, depth + 1));
    if (children.some((child) => !child)) return undefined;
    node[field] = children;
  }
  return node;
}

export function studyCachePolicy(key: string): CachePolicy {
  if (
    key === '/practice/catalog' ||
    (key.startsWith('/questions?') && !key.includes('random=1'))
  ) {
    return { freshMs: 60_000, retainMs: 7 * 86400_000, persist: true };
  }
  return { freshMs: 30_000, retainMs: 10 * 60_000 };
}

// Only these study responses may be persisted. Never add a generic "cache all GETs" rule.
export function persistentStudyData(
  key: string,
  data: unknown,
): unknown | undefined {
  if (!data || typeof data !== 'object') return undefined;
  if (key === '/practice/catalog') {
    const catalog = data as Record<string, unknown>;
    if (!Array.isArray(catalog.chapters) || typeof catalog.total !== 'number')
      return undefined;
    const chapters = catalog.chapters.map((chapter) => studyNode(chapter));
    if (chapters.some((chapter) => !chapter)) return undefined;
    return {
      total: catalog.total,
      attemptedCount: catalog.attemptedCount,
      favoriteCount: catalog.favoriteCount,
      chapters,
    };
  }
  if (!key.startsWith('/questions?') || key.includes('random=1'))
    return undefined;
  const page = data as {
    items?: unknown[];
    total?: number;
    nextOffset?: number | null;
  };
  const items = Array.isArray(data) ? data : page.items;
  if (!Array.isArray(items) || items.length > 100) return undefined;
  const rows: Record<string, unknown>[] = [];
  for (const item of items) {
    if (
      !isRecord(item) ||
      item.source === 'ai_generated' ||
      typeof item.id !== 'string'
    )
      return undefined;
    rows.push(item);
  }
  const fields = [
    'id',
    'type',
    'question',
    'options',
    'images',
    'image',
    'sharedStem',
    'chapter',
    'knowledgeSection',
    'knowledgePoint',
    'difficulty',
    'tags',
    'attempted',
    'favorite',
    'source',
  ];
  const questions = rows.map((item) =>
    Object.fromEntries(
      fields
        .filter((field) => field in item)
        .map((field) => [field, item[field]]),
    ),
  );
  return Array.isArray(data)
    ? questions
    : { items: questions, total: page.total, nextOffset: page.nextOffset };
}
