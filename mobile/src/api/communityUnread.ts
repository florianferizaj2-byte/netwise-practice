import type { CommunityMessage, CommunityResponse } from './client';

export type CommunityCursor = Pick<CommunityMessage, 'id' | 'createdAt'>;

export function communityCursor(message?: CommunityCursor): CommunityCursor | null {
  return message ? { id: message.id, createdAt: message.createdAt } : null;
}

// Match the server's (created_at, id) SQLite sort, including ties and deleted messages.
export function isAfterCommunityCursor(message: CommunityCursor, cursor: CommunityCursor | null) {
  return !cursor || message.createdAt > cursor.createdAt ||
    (message.createdAt === cursor.createdAt && message.id > cursor.id);
}

export function parseCommunityReadCursor(value: string | null): CommunityCursor | null | undefined {
  if (value === null) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (parsed === null) return null;
    if (typeof parsed?.id === 'string' && parsed.id && typeof parsed.createdAt === 'string' && parsed.createdAt) {
      return communityCursor(parsed);
    }
  } catch { /* An invalid cursor starts from the current community. */ }
  return undefined;
}

type LoadPage = (before: string | undefined, limit: number, signal: AbortSignal) =>
  Promise<Pick<CommunityResponse, 'messages' | 'hasMore' | 'nextBefore'>>;

export async function countCommunityUnread(
  readThrough: CommunityCursor | null,
  userId: string,
  loadPage: LoadPage,
  signal: AbortSignal,
) {
  let count = 0;
  let before: string | undefined;
  while (!signal.aborted) {
    const page = await loadPage(before, 50, signal);
    for (let index = page.messages.length - 1; index >= 0; index -= 1) {
      const message = page.messages[index];
      if (!isAfterCommunityCursor(message, readThrough)) return count;
      if (message.userId !== userId && ++count === 100) return count;
    }
    if (!page.hasMore) return count;
    if (!page.nextBefore || (before && page.nextBefore >= before)) {
      throw new Error('Invalid community history cursor');
    }
    before = page.nextBefore;
  }
  throw new Error('Community unread request aborted');
}

export function communityUnreadLabel(count: number) {
  return count <= 0 ? '' : count >= 100 ? '99+' : String(count);
}
