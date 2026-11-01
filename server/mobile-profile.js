import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';

const maxBytes = 2 * 1024 * 1024;
const avatarPattern = /^[a-f0-9-]{36}\.(jpg|png|webp)$/;
const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const schema = z.object({
  name: z.string().trim().min(1, '请填写名字').max(24, '名字最多 24 个字').regex(/^[^\u0000-\u001f\u007f]+$/, '名字包含无效字符'),
  image: z.object({ mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']), data: z.string().min(1).max(Math.ceil(maxBytes / 3) * 4 + 128) }).strict().optional(),
}).strict();

function decodeImage(image) {
  const data = image.data.replace(/^data:image\/(jpeg|png|webp);base64,/, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error('头像数据格式不正确');
  const bytes = Buffer.from(data, 'base64');
  if (!bytes.length || bytes.length > maxBytes || bytes.toString('base64').replace(/=+$/, '') !== data.replace(/=+$/, '')) throw new Error('头像不能超过 2 MB，且必须是有效图片');
  const valid = image.mimeType === 'image/jpeg' ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
    : image.mimeType === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!valid) throw new Error('头像内容与图片格式不一致');
  return bytes;
}

export function createMobileProfileService(store) {
  if (!store.db.prepare('PRAGMA table_info(users)').all().some((column) => column.name === 'avatar_file')) store.db.exec('ALTER TABLE users ADD COLUMN avatar_file TEXT');
  const directory = path.resolve(store.dataDir, 'avatars');
  fs.mkdirSync(directory, { recursive: true });
  const current = (id) => store.db.prepare('SELECT community_name AS name, avatar_file AS avatar FROM users WHERE id=?').get(id);
  const avatarExists = (file) => typeof file === 'string' && avatarPattern.test(file) && fs.existsSync(path.join(directory, file));
  const view = (user) => {
    if (!user) return null;
    const profile = current(user.id);
    const avatarUrl = avatarExists(profile?.avatar) ? `/avatars/${profile.avatar}` : null;
    return { ...user, communityName: profile?.name ?? user.communityName ?? null, avatarUrl, profileComplete: !!profile?.name?.trim() && !!avatarUrl };
  };
  const save = (userId, fields) => {
    const body = schema.parse(fields);
    const old = current(userId);
    if (!old) throw new Error('账号不存在');
    let file = old.avatar;
    if (body.image) {
      const bytes = decodeImage(body.image);
      file = `${crypto.randomUUID()}.${extensions[body.image.mimeType]}`;
      fs.writeFileSync(path.join(directory, file), bytes, { flag: 'wx' });
    } else if (!avatarExists(file)) throw new Error('请选择头像');
    try {
      store.db.prepare('UPDATE users SET community_name=?,avatar_file=? WHERE id=?').run(body.name, file, userId);
    } catch (error) {
      if (body.image) fs.unlinkSync(path.join(directory, file));
      throw error;
    }
    if (body.image && old.avatar !== file && avatarExists(old.avatar)) {
      // Only remove the previous avatar belonging to this same account.
      try { fs.unlinkSync(path.join(directory, old.avatar)); } catch {}
    }
    return view(store.userById(userId));
  };
  return { directory, view, save };
}

export function registerMobileProfile({ app, route, service, userView }) {
  route('put', '/api/auth/profile', (req) => {
    if (!req.user) { const error = new Error('请先登录'); error.status = 401; throw error; }
    return { user: userView(service.save(req.user.id, req.body)) };
  });
  app.get('/avatars/:file', (req, res, next) => {
    const file = req.params.file;
    if (!avatarPattern.test(file)) return res.status(404).end();
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.set('X-Content-Type-Options', 'nosniff');
    res.sendFile(path.join(service.directory, file), (error) => { if (error && !res.headersSent) next(error); });
  });
}
