import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const defaultFile = fileURLToPath(new URL('./mobile-announcement.json', import.meta.url));
const announcementSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().trim().min(1).max(80),
  enabled: z.boolean(),
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(8000),
  updatedAt: z.string().max(40).datetime({ offset: true }),
}).strict();

const editSchema = z.object({
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  enabled: z.boolean(), title: z.string().trim().min(1).max(80), body: z.string().trim().min(1).max(8000),
}).strict();
const revisionOf = (content) => crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex');

export async function createMobileAnnouncementService({ file }) {
  const filename = path.resolve(file);
  await fs.mkdir(path.dirname(filename), { recursive: true });
  try {
    await fs.writeFile(filename, await fs.readFile(defaultFile), { flag: 'wx', mode: 0o600 });
  } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const read = async () => {
    if ((await fs.stat(filename)).size > 32 * 1024) throw new Error('oversized announcement');
    return announcementSchema.parse(JSON.parse(await fs.readFile(filename, 'utf8')));
  };
  let writes = Promise.resolve();
  return {
    read,
    async view() { const announcement = await read(); return { announcement, revision: revisionOf(announcement) }; },
    save(input) {
      const fields = editSchema.parse(input);
      const operation = writes.then(async () => {
        const previous = await read();
        if (revisionOf(previous) !== fields.revision) throw Object.assign(new Error('公告已被更新，请重新读取后保存'), { status: 409 });
        const announcement = announcementSchema.parse({ schemaVersion: 1, id: crypto.randomUUID(),
          enabled: fields.enabled, title: fields.title, body: fields.body, updatedAt: new Date().toISOString() });
        const temporary = path.join(path.dirname(filename), `.mobile-announcement-${crypto.randomUUID()}.tmp`);
        try {
          await fs.writeFile(temporary, `${JSON.stringify(announcement, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
          await fs.rename(temporary, filename);
        } finally { await fs.unlink(temporary).catch(() => undefined); }
        return { announcement, revision: revisionOf(announcement) };
      });
      writes = operation.catch(() => undefined);
      return operation;
    },
  };
}

/** Public text content only. Re-read on every request so edits require no restart. */
export function registerMobileAnnouncement(app, { service }) {
  app.get('/api/mobile/announcement', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      res.json(await service.read());
    } catch {
      res.status(503).json({ error: '公告暂时不可用，请稍后重试' });
    }
  });
}
