import { z } from "zod";
import { certificates } from "./certificates.js";
import { studyNodes, studyHash, studyError } from "./study-content.js";

// Stable public catalog identities; favorite rows never store answers or conversations.
const catalog = new Map();
for (const certificate of certificates) {
  for (const chapter of certificate.taxonomy?.modules || []) {
    for (const section of chapter.sections) {
      for (const point of section.knowledgePoints) {
        const item = {
          id: `${certificate.id}:${point.code}`,
          certificateId: certificate.id,
          title: point.name,
          chapter: chapter.name,
          section: section.name,
          kind: "point",
        };
        catalog.set(item.id, {
          ...item,
          version: studyHash({ ...item, scope: point.scope }).slice(0, 20),
        });
      }
    }
  }
}
for (const node of studyNodes) {
  if (!node.sublesson) continue;
  catalog.set(node.id, {
    id: node.id,
    certificateId: node.certificateId,
    title: node.sublesson.title,
    chapter: node.chapter,
    section: node.section,
    kind: "lesson",
    version: node.version,
  });
}
export const knowledgeCatalog = [...catalog.values()];

export function registerKnowledgeFavorites({
  route,
  store,
  requestUserId,
  studyContent,
}) {
  const db = store.db;
  db.exec(`CREATE TABLE IF NOT EXISTS knowledge_favorites (
    user_id TEXT NOT NULL,certificate_id TEXT NOT NULL,node_id TEXT NOT NULL,
    created_at TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(user_id,certificate_id,node_id)
  );`);
  const idSchema = z
    .string()
    .min(3)
    .max(160)
    .regex(/^[a-z0-9-]+:[a-zA-Z0-9:._-]+$/);
  const context = (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!req.user) throw studyError("请先登录", 401);
    return {
      userId: requestUserId(req),
      certificateId: req.user.certificateId,
    };
  };
  const ownedId = (req) => {
    const id = idSchema.parse(req.params.id);
    if (!id.startsWith(req.user.certificateId + ":"))
      throw studyError("该知识点不属于当前备考目标", 404);
    return id;
  };
  const row = (userId, certificateId, id) =>
    db
      .prepare(
        "SELECT * FROM knowledge_favorites WHERE user_id=? AND certificate_id=? AND node_id=?",
      )
      .get(userId, certificateId, id);
  const view = (item, saved, progress = []) => {
    const current = catalog.get(item.id),
      entry = current || item;
    const units = current
      ? studyNodes.filter((n) => n.id === entry.id || n.parentId === entry.id)
      : [];
    const published = units.filter((n) => !!studyContent.published(n));
    return {
      ...entry,
      current: !!current,
      favorite: !!saved,
      favoritedAt: saved?.created_at || null,
      available: published.length > 0,
      lessonNodeId: published[0]?.id || units[0]?.id || null,
      completedBefore:
        units.length > 0 &&
        units.every((n) =>
          progress.some((p) => p.node_id === n.id && p.completed_at),
        ),
    };
  };
  route("get", "/api/knowledge-favorites", (req, res) => {
    const { userId, certificateId } = context(req, res);
    const progress = studyContent.progress(userId);
    const rows = db
      .prepare(
        "SELECT * FROM knowledge_favorites WHERE user_id=? AND certificate_id=? ORDER BY created_at DESC,rowid DESC",
      )
      .all(userId, certificateId);
    return rows.map((saved) => view(JSON.parse(saved.data), saved, progress));
  });
  route("get", "/api/knowledge-favorites/catalog", (req, res) => {
    const { certificateId } = context(req, res);
    return {
      supported: knowledgeCatalog.some(
        (n) => n.certificateId === certificateId,
      ),
      nodes: knowledgeCatalog
        .filter((n) => n.certificateId === certificateId)
        .map((n) => view(n)),
    };
  });
  route("get", "/api/knowledge-favorites/info", (req, res) => {
    const { certificateId } = context(req, res);
    const count = knowledgeCatalog.filter(
      (n) => n.certificateId === certificateId,
    ).length;
    return { supported: count > 0, catalogSize: count };
  });
  route("get", "/api/knowledge-favorites/:id", (req, res) => {
    const { userId, certificateId } = context(req, res),
      id = ownedId(req);
    const saved = row(userId, certificateId, id),
      item = catalog.get(id) || (saved && JSON.parse(saved.data));
    if (!item) throw studyError("当前目录没有这个知识点", 404);
    return view(item, saved);
  });
  route("put", "/api/knowledge-favorites/:id", (req, res) => {
    const { userId, certificateId } = context(req, res),
      id = ownedId(req);
    const { favorite } = z
      .object({ favorite: z.boolean() })
      .strict()
      .parse(req.body);
    const item = catalog.get(id);
    if (favorite) {
      if (!item) throw studyError("当前目录没有这个知识点", 404);
      db.prepare(
        "INSERT INTO knowledge_favorites VALUES (?,?,?,?,?) ON CONFLICT(user_id,certificate_id,node_id) DO NOTHING",
      ).run(
        userId,
        certificateId,
        id,
        new Date().toISOString(),
        JSON.stringify(item),
      );
    } else
      db.prepare(
        "DELETE FROM knowledge_favorites WHERE user_id=? AND certificate_id=? AND node_id=?",
      ).run(userId, certificateId, id);
    return {
      id,
      favorite,
      favoritedAt: row(userId, certificateId, id)?.created_at || null,
    };
  });
}
