export type Announcement = Readonly<{
  schemaVersion: 1;
  id: string;
  enabled: boolean;
  title: string;
  body: string;
  updatedAt: string;
}>;

const fields = ['schemaVersion', 'id', 'enabled', 'title', 'body', 'updatedAt'];
export const ANNOUNCEMENT_CACHE_KEY = 'kaojiang-public-announcement-v1';
export const ANNOUNCEMENT_READ_KEY = 'kaojiang-read-announcement-content-v1';
// Content, not a generated id/timestamp: a no-op administrator save is not news.
const readIdentity = (content: Announcement) => JSON.stringify([content.title, content.body]);
export const DEFAULT_ANNOUNCEMENT: Announcement = Object.freeze({
  schemaVersion: 1,
  id: 'welcome-20261014',
  enabled: true,
  title: '暂无新公告',
  body: '欢迎使用考匠，祝学习顺利。后续通知将在这里发布。',
  updatedAt: '2026-10-14T00:00:00+08:00',
});

/** Keep remote content bounded and inert; no HTML, scripts, actions or URL fields. */
export function parseAnnouncement(value: unknown): Announcement {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid announcement');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some((key) => !fields.includes(key)) || data.schemaVersion !== 1 || typeof data.enabled !== 'boolean') {
    throw new Error('Unsupported announcement');
  }
  const text = (key: string, max: number) => {
    const item = data[key];
    if (typeof item !== 'string' || !item.trim() || item.length > max) throw new Error('Invalid announcement text');
    return item.trim();
  };
  const updatedAt = text('updatedAt', 40);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(updatedAt) || !Number.isFinite(Date.parse(updatedAt))) throw new Error('Invalid announcement date');
  return Object.freeze({ schemaVersion: 1, id: text('id', 80), enabled: data.enabled,
    title: text('title', 80), body: text('body', 8000), updatedAt });
}

type Storage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
};

/** Public cache is independent of account/progress caches and survives logout/offline use. */
export class AnnouncementClient {
  private current = DEFAULT_ANNOUNCEMENT;
  private listeners = new Set<() => void>();
  private hydration: Promise<void> | null = null;
  private pending: Promise<void> | null = null;
  private lastAttempt: number | null = null;
  private readContent: string | null = null;
  private readRevision = 0;
  private readWrite: Promise<void> = Promise.resolve();

  constructor(private storage: Storage, private request: () => Promise<unknown>, private now = Date.now) {}

  snapshot = () => this.current;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private replace(content: Announcement) {
    if (JSON.stringify(content) === JSON.stringify(this.current)) return;
    this.current = content;
    this.listeners.forEach((listener) => listener());
  }

  hydrate = (): Promise<void> => {
    if (!this.hydration) {
      const revision = this.readRevision;
      this.hydration = Promise.all([
        (async () => {
          try {
            const cached = await this.storage.getItem(ANNOUNCEMENT_CACHE_KEY);
            if (cached) this.replace(parseAnnouncement(JSON.parse(cached)));
          } catch { /* A damaged/unavailable cache must not block the home screen. */ }
        })(),
        (async () => {
          try {
            const receipt = await this.storage.getItem(ANNOUNCEMENT_READ_KEY);
            if (revision === this.readRevision) this.readContent = receipt;
          } catch { /* Read-state storage is optional, never a launch blocker. */ }
        })(),
      ]).then(() => undefined);
    }
    return this.hydration;
  };

  needsDisplay = (content: Announcement = this.current): boolean =>
    content.enabled && this.readContent !== readIdentity(content);

  markRead = (content: Announcement = this.current): Promise<void> => {
    const identity = readIdentity(content);
    this.readContent = identity;
    this.readRevision++;
    // Serialize dismissals; the receipt is for the visible notice, not a later fetch.
    this.readWrite = this.readWrite.then(async () => {
      try { await this.storage.setItem(ANNOUNCEMENT_READ_KEY, identity); }
      catch { /* Keep the in-memory receipt when device storage is full. */ }
    });
    return this.readWrite;
  };

  refresh = (force = false): Promise<void> => {
    if (this.pending) return this.pending;
    if (!force && this.lastAttempt !== null && this.now() - this.lastAttempt < 60_000) return Promise.resolve();
    this.lastAttempt = this.now();
    this.pending = (async () => {
      await this.hydrate(); // A slow cache read must never overwrite a newer network response.
      try {
        const content = parseAnnouncement(await this.request());
        this.replace(content);
        await this.storage.setItem(ANNOUNCEMENT_CACHE_KEY, JSON.stringify(content));
      } catch { /* Keep the last valid content, including a server-disabled announcement. */ }
    })().finally(() => { this.pending = null; });
    return this.pending;
  };
}
