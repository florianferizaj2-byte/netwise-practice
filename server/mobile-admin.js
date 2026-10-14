import crypto from 'node:crypto';
import { z } from 'zod';

const revisionOf = (user) => crypto.createHash('sha256').update(JSON.stringify(user)).digest('hex');
const view = (user) => ({ ...user, revision: revisionOf(user) });
const fail = (message, status) => Object.assign(new Error(message), { status });
const editUser = z.object({
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  communityName: z.string().trim().min(1).max(24).refine((value) => !/[\u0000-\u001f\u007f]/.test(value)).nullable(),
  certificateId: z.string().nullable(),
  membershipPlan: z.enum(['free', 'vip', 'svip', 'ssvip']),
  membershipExpiresAt: z.string().datetime({ offset: true }).nullable(),
}).strict();

export function registerMobileAdminRoutes({ route, store, requireAdmin, certificates, announcements }) {
  const targetUser = (id) => {
    const target = store.adminUser(z.string().uuid().parse(id));
    if (!target) throw fail('账号不存在', 404);
    return target;
  };
  route('get', '/api/admin/mobile/users', (req) => {
    requireAdmin(req);
    const filters = z.object({ search: z.string().trim().max(100).default(''), status: z.enum(['all', 'active', 'banned']).default('all'),
      limit: z.coerce.number().int().min(1).max(100).default(30), offset: z.coerce.number().int().min(0).max(1_000_000).default(0) }).strict().parse(req.query);
    const page = store.adminUsersPage(filters);
    return { ...page, users: page.users.map(view) };
  });
  route('get', '/api/admin/mobile/users/:id', (req) => {
    requireAdmin(req);
    return { user: view(targetUser(req.params.id)) };
  });
  route('put', '/api/admin/mobile/users/:id', (req) => {
    requireAdmin(req);
    const fields = editUser.parse(req.body);
    if (fields.certificateId && !certificates.some((certificate) => certificate.id === fields.certificateId)) throw fail('考试题库不存在', 400);
    if (fields.membershipPlan !== 'free' && fields.membershipExpiresAt && Date.parse(fields.membershipExpiresAt) <= Date.now()) throw fail('会员到期时间必须晚于当前时间', 400);
    store.db.exec('BEGIN IMMEDIATE');
    try {
      const target = targetUser(req.params.id);
      if (revisionOf(target) !== fields.revision) throw fail('账号信息已被更新，请重新读取后保存', 409);
      store.saveManagedUserProfile(target.id, fields);
      store.saveAccountEntitlement(target.id, { plan: fields.membershipPlan,
        expiresAt: fields.membershipPlan === 'free' ? null : fields.membershipExpiresAt });
      store.audit(req.user.id, 'mobile_user_updated', 'user', target.id, {
        username: target.username, certificateId: fields.certificateId, membershipPlan: fields.membershipPlan,
        membershipExpiresAt: fields.membershipExpiresAt, communityName: fields.communityName,
      });
      const user = view(store.adminUser(target.id));
      store.db.exec('COMMIT');
      return { saved: true, user };
    } catch (error) { store.db.exec('ROLLBACK'); throw error; }
  });
  route('get', '/api/admin/mobile/announcement', async (req) => {
    requireAdmin(req);
    return announcements.view();
  });
  route('put', '/api/admin/mobile/announcement', async (req) => {
    requireAdmin(req);
    const result = await announcements.save(req.body);
    store.audit(req.user.id, 'mobile_announcement_updated', 'announcement', result.announcement.id,
      { title: result.announcement.title, enabled: result.announcement.enabled });
    return { saved: true, ...result };
  });
}
