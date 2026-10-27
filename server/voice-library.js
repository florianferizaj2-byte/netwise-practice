import { z } from 'zod';
const failure = (message, status = 409, code = 'VOICE_LIBRARY_CONFLICT') =>
  Object.assign(new Error(message), { status, code });
const text = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((value) => !/[\u0000-\u001f\u007f]/.test(value));
export function registerVoiceLibrary({
  route,
  store,
  requireAdmin,
  configuration,
  mutate,
  assetRow,
  assetView,
  packRow,
  applyPack,
  packSchema,
  idsIn,
}) {
  const db = store.db;
  db.exec(`CREATE TABLE IF NOT EXISTS voice_asset_metadata (asset_id TEXT PRIMARY KEY,revision INTEGER NOT NULL,collection TEXT NOT NULL,tags TEXT NOT NULL,state TEXT NOT NULL,reported_duration_ms INTEGER);
    INSERT OR IGNORE INTO voice_asset_metadata SELECT a.id,0,'','[]',CASE WHEN EXISTS(SELECT 1 FROM voice_pack_references r JOIN voice_packs p ON p.id=r.pack_id WHERE r.asset_id=a.id AND p.enabled=1) THEN 'ready' ELSE 'pending' END,NULL FROM voice_pack_assets a;
    CREATE TABLE IF NOT EXISTS voice_pack_drafts (id TEXT PRIMARY KEY,revision INTEGER NOT NULL,based_on_revision INTEGER NOT NULL,data TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS voice_pack_draft_references (pack_id TEXT NOT NULL,asset_id TEXT NOT NULL,PRIMARY KEY(pack_id,asset_id));`);
  const meta = (id) =>
    db
      .prepare('SELECT * FROM voice_asset_metadata WHERE asset_id=?')
      .get(id) || {
      revision: 0,
      collection: '',
      tags: '[]',
      state: 'pending',
      reported_duration_ms: null,
    };
  const uses = (id) => [
    ...db
      .prepare(
        'SELECT p.id,p.name,p.enabled FROM voice_pack_references r JOIN voice_packs p ON p.id=r.pack_id WHERE r.asset_id=? ORDER BY p.id',
      )
      .all(id)
      .map((row) => ({ ...row, enabled: !!row.enabled, draft: false })),
    ...db
      .prepare(
        'SELECT p.id,p.data FROM voice_pack_draft_references r JOIN voice_pack_drafts p ON p.id=r.pack_id WHERE r.asset_id=? ORDER BY p.id',
      )
      .all(id)
      .map((row) => ({
        id: row.id,
        name: JSON.parse(row.data).name,
        enabled: false,
        draft: true,
      })),
  ];
  const adminAsset = (row) => {
    const m = meta(row.id);
    return {
      ...assetView(row),
      name: row.name,
      revision: m.revision,
      collection: m.collection,
      tags: JSON.parse(m.tags),
      state: m.state,
      durationMs: row.duration_ms ?? m.reported_duration_ms,
      usedBy: uses(row.id),
    };
  };
  const draftView = (row) => ({
    id: row.id,
    revision: row.revision,
    basedOnRevision: row.based_on_revision,
    ...JSON.parse(row.data),
    updatedAt: row.updated_at,
  });
  const validateReferences = (data) => {
    const ids = idsIn(data.cues);
    if (ids.length > 32) throw failure('单个包最多使用 32 个不同素材', 400);
    const rows = ids.map(assetRow);
    if (rows.some((row) => !row))
      throw failure('部分素材已不存在，请刷新素材库', 400);
    if (rows.reduce((sum, row) => sum + row.bytes, 0) > 20 * 1024 * 1024)
      throw failure('单个语音包素材总量不能超过 20 MiB', 400);
    return ids;
  };
  const inputMeta = z.object({
    collection: text(60).default(''),
    durationMs: z.coerce.number().int().min(1).max(600000).optional(),
  });
  const metadata = z
    .object({
      id: z.string().regex(/^[a-f0-9]{64}$/),
      expectedRevision: z.number().int().nonnegative(),
      name: text(100).min(1).optional(),
      collection: text(60).optional(),
      tags: z
        .array(text(24).min(1))
        .max(12)
        .refine((values) => new Set(values).size === values.length)
        .optional(),
      state: z.enum(['pending', 'ready', 'disabled']).optional(),
    })
    .strict();
  route('patch', '/api/admin/voice-packs/assets', (req) => {
    requireAdmin(req);
    const body = z
      .object({
        requestId: z.uuid(),
        items: z
          .array(metadata)
          .min(1)
          .max(100)
          .refine(
            (rows) => new Set(rows.map((row) => row.id)).size === rows.length,
          ),
      })
      .strict()
      .parse(req.body);
    return mutate(
      req,
      { action: 'assets_updated', id: 'library', body },
      () => {
        for (const item of body.items) {
          const row = assetRow(item.id);
          if (!row) throw failure('素材不存在', 404, 'VOICE_ASSET_NOT_FOUND');
          const old = meta(item.id);
          if (old.revision !== item.expectedRevision)
            throw failure(
              '素材已被更新，请刷新后重试',
              409,
              'VOICE_ASSET_REVISION_CONFLICT',
            );
          if (
            item.state &&
            item.state !== 'ready' &&
            uses(item.id).some((pack) => pack.enabled)
          )
            throw failure(
              '该素材正在已发布的语音包中使用，请先下架或移除引用',
              409,
              'VOICE_ASSET_IN_USE',
            );
          db.prepare('UPDATE voice_pack_assets SET name=? WHERE id=?').run(
            item.name ?? row.name,
            item.id,
          );
          db.prepare(
            'INSERT INTO voice_asset_metadata VALUES(?,?,?,?,?,?) ON CONFLICT(asset_id) DO UPDATE SET revision=excluded.revision,collection=excluded.collection,tags=excluded.tags,state=excluded.state',
          ).run(
            item.id,
            old.revision + 1,
            item.collection ?? old.collection,
            JSON.stringify(item.tags ?? JSON.parse(old.tags)),
            item.state ?? old.state,
            old.reported_duration_ms,
          );
        }
        db.prepare(
          'UPDATE voice_pack_configuration SET revision=revision+1 WHERE id=1',
        ).run();
        return {
          assets: body.items.map((item) => adminAsset(assetRow(item.id))),
          configuration: configuration(),
        };
      },
    );
  });
  const draftSchema = packSchema
    .omit({ enabled: true })
    .extend({ basedOnRevision: z.number().int().nonnegative() })
    .strict();
  route('put', '/api/admin/voice-packs/:id/draft', (req) => {
    requireAdmin(req);
    const id = z
        .string()
        .regex(/^[a-z0-9][a-z0-9-]{0,47}$/)
        .refine((value) => value !== 'default')
        .parse(req.params.id),
      body = draftSchema.parse(req.body);
    return mutate(req, { action: 'draft_saved', id, body }, () => {
      const old = db
          .prepare('SELECT * FROM voice_pack_drafts WHERE id=?')
          .get(id),
        published = packRow(id);
      if ((old?.revision ?? 0) !== body.expectedRevision)
        throw failure(
          '草稿已更新，请刷新后重试',
          409,
          'VOICE_DRAFT_REVISION_CONFLICT',
        );
      if ((published?.revision ?? 0) !== body.basedOnRevision)
        throw failure(
          '已发布版本已更新，请先重新载入',
          409,
          'VOICE_REVISION_CONFLICT',
        );
      if (
        !old &&
        !published &&
        db
          .prepare(
            'SELECT COUNT(*) AS n FROM (SELECT id FROM voice_packs UNION SELECT id FROM voice_pack_drafts)',
          )
          .get().n >= 100
      )
        throw failure('语音包数量已达上限');
      const ids = validateReferences(body),
        data = { name: body.name, cues: body.cues, playback: body.playback };
      db.prepare(
        'INSERT INTO voice_pack_drafts VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,based_on_revision=excluded.based_on_revision,data=excluded.data,updated_at=excluded.updated_at',
      ).run(
        id,
        (old?.revision ?? 0) + 1,
        body.basedOnRevision,
        JSON.stringify(data),
        new Date().toISOString(),
      );
      db.prepare('DELETE FROM voice_pack_draft_references WHERE pack_id=?').run(
        id,
      );
      for (const assetId of ids)
        db.prepare('INSERT INTO voice_pack_draft_references VALUES(?,?)').run(
          id,
          assetId,
        );
      db.prepare(
        'UPDATE voice_pack_configuration SET revision=revision+1 WHERE id=1',
      ).run();
      return {
        draft: draftView(
          db.prepare('SELECT * FROM voice_pack_drafts WHERE id=?').get(id),
        ),
        configuration: configuration(),
      };
    });
  });
  route('post', '/api/admin/voice-packs/:id/publish', (req) => {
    requireAdmin(req);
    const id = z
        .string()
        .regex(/^[a-z0-9][a-z0-9-]{0,47}$/)
        .parse(req.params.id),
      body = z
        .object({
          requestId: z.uuid(),
          expectedRevision: z.number().int().nonnegative(),
          draftRevision: z.number().int().positive(),
        })
        .strict()
        .parse(req.body);
    return mutate(req, { action: 'draft_published', id, body }, () => {
      const draft = db
        .prepare('SELECT * FROM voice_pack_drafts WHERE id=?')
        .get(id);
      if (!draft || draft.revision !== body.draftRevision)
        throw failure(
          '草稿已更新或不存在，请重新载入',
          409,
          'VOICE_DRAFT_REVISION_CONFLICT',
        );
      if (draft.based_on_revision !== body.expectedRevision)
        throw failure(
          '草稿对应的发布版本已过期',
          409,
          'VOICE_REVISION_CONFLICT',
        );
      const result = applyPack(id, {
        ...JSON.parse(draft.data),
        enabled: true,
        expectedRevision: body.expectedRevision,
      });
      db.prepare('DELETE FROM voice_pack_drafts WHERE id=?').run(id);
      db.prepare('DELETE FROM voice_pack_draft_references WHERE pack_id=?').run(
        id,
      );
      return result;
    });
  });
  return {
    meta,
    adminAsset,
    drafts: () =>
      db
        .prepare('SELECT * FROM voice_pack_drafts ORDER BY updated_at DESC')
        .all()
        .map(draftView),
    uploadMetadata: (query) =>
      inputMeta.parse({
        collection: query.collection ?? '',
        ...(query.durationMs !== undefined
          ? { durationMs: query.durationMs }
          : {}),
      }),
    initializeAsset(id, input) {
      db.prepare(
        "INSERT INTO voice_asset_metadata VALUES(?,0,?,'[]','pending',?)",
      ).run(id, input.collection, input.durationMs ?? null);
      db.prepare(
        'UPDATE voice_pack_configuration SET revision=revision+1 WHERE id=1',
      ).run();
    },
    requireReady(ids) {
      if (ids.some((id) => meta(id).state !== 'ready'))
        throw failure(
          '请先将选用素材标记为已试听，再发布语音包',
          409,
          'VOICE_ASSET_REVIEW_REQUIRED',
        );
    },
  };
}
