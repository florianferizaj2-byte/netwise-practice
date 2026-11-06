import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { examSelectionCatalog } from "./exam-selection.js";

export const OFFLINE_PACK_SCHEMA = 1;
const MAX_PACK_BYTES = 48 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const mediaTypes = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".gif": "image/gif",
};
const fields = [
  "id", "type", "question", "options", "answer", "analysis", "expectedAnswer",
  "chapter", "knowledgeSection", "knowledgePoint", "difficulty", "tags", "stage",
  "source", "sharedGroupId", "sharedKind", "sharedStem", "sharedOrder",
];
const error = (message, status, code) => Object.assign(new Error(message), { status, code });
const contentError = () => error("离线包的题图资源不完整，暂未开放下载", 503, "OFFLINE_MEDIA_UNAVAILABLE");

function readMedia(publicDir, src) {
  if (typeof src !== "string" || !/^\/(?:question-images|vet-images)\/[A-Za-z0-9._/-]+$/.test(src))
    throw contentError();
  const parts = src.slice(1).split("/");
  if (parts.some((part) => !part || part.startsWith("."))) throw contentError();
  const mimeType = mediaTypes[path.extname(src).toLowerCase()];
  if (!mimeType) throw contentError();
  try {
    const base = fs.realpathSync(publicDir);
    const file = fs.realpathSync(path.join(base, ...parts));
    const relative = path.relative(base, file);
    if (relative.startsWith("..") || path.isAbsolute(relative) ||
      !["question-images", "vet-images"].includes(relative.split(path.sep)[0]))
      throw contentError();
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size === 0 || stat.size > MAX_IMAGE_BYTES) throw contentError();
    return { mimeType, base64: fs.readFileSync(file).toString("base64") };
  } catch {
    throw contentError();
  }
}

export function buildOfflinePack({ certificate, questions, syllabus, publicDir }) {
  const media = Object.create(null);
  let mediaChars = 0;
  const rows = questions
    .filter((question) => !question.ownerUserId && !question.aiGroupId &&
      !["ai_generated", "user_submitted"].includes(question.source))
    .map((question) => {
      const row = Object.fromEntries(fields.filter((key) => Object.hasOwn(question, key))
        .map((key) => [key, question[key]]));
      const legacy = question.image
        ? Array.isArray(question.image) ? question.image : [question.image]
        : [];
      const images = new Map();
      for (const entry of [...(question.images || []), ...legacy]) {
        const { src, alt, caption } = typeof entry === "string" ? { src: entry } : entry || {};
        if (!Object.hasOwn(media, src)) {
          const asset = readMedia(publicDir, src);
          mediaChars += asset.base64.length;
          if (mediaChars > MAX_PACK_BYTES) throw error("离线包超过大小限制", 503, "OFFLINE_PACK_TOO_LARGE");
          media[src] = asset;
        }
        if (!images.has(src)) images.set(src, { src, alt, caption });
      }
      if (images.size) row.images = [...images.values()];
      return row;
    });
  if (!rows.length) throw error("该证书暂无可下载的学习内容", 404, "OFFLINE_PACK_EMPTY");
  const body = {
    schemaVersion: OFFLINE_PACK_SCHEMA,
    certificate: { id: certificate.id, name: certificate.name, shortName: certificate.shortName },
    questions: rows,
    exam: {
      catalog: examSelectionCatalog(rows.filter((row) => row.type !== "short_answer"), certificate.id),
      modules: (syllabus?.modules || []).map(({ id, name, order, weight }) => ({ id, name, order, weight })),
      blueprint: syllabus?.examBlueprint || null,
      secondsPerQuestion: 120,
    },
    media,
  };
  const bytes = Buffer.from(JSON.stringify(body));
  if (bytes.length > MAX_PACK_BYTES) throw error("离线包超过大小限制", 503, "OFFLINE_PACK_TOO_LARGE");
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  return {
    bytes,
    manifest: {
      schemaVersion: OFFLINE_PACK_SCHEMA,
      certificateId: certificate.id,
      version: sha256,
      sha256,
      bytes: bytes.length,
      questionCount: rows.length,
      mediaCount: Object.keys(media).length,
    },
  };
}

export function registerOfflinePacks({ app, route, store, certificates, questions, syllabus, publicDir }) {
  const base = "/api/offline/certificates/:certificateId";
  const known = new Map(certificates.map((certificate) => [certificate.id, certificate]));
  let revision;
  const packs = new Map();
  const packFor = (req) => {
    if (!req.user?.id) throw error("请先登录下载学习包", 401, "OFFLINE_AUTH_REQUIRED");
    const certificate = known.get(req.params.certificateId);
    if (!certificate || req.user.certificateId !== certificate.id)
      throw error("该学习包不属于当前证书", 404, "OFFLINE_CERTIFICATE_NOT_FOUND");
    const next = store.questionRevision();
    if (next !== revision) {
      revision = next;
      packs.clear();
    }
    if (!packs.has(certificate.id)) {
      // Only built-in/public question-bank material. Never cache account data.
      const pack = buildOfflinePack({
        certificate, questions: questions(certificate.id),
        syllabus: syllabus(certificate.id), publicDir,
      });
      if (packs.size >= 2) packs.delete(packs.keys().next().value);
      packs.set(certificate.id, pack);
    }
    return packs.get(certificate.id);
  };
  route("get", base + "/manifest", (req, res) => {
    res.set("Cache-Control", "private, no-store");
    return packFor(req).manifest;
  });
  app.get(base + "/packages/:version", (req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    try {
      const pack = packFor(req);
      if (req.params.version !== pack.manifest.version)
        throw error("学习包版本已更新，请刷新后重新下载", 409, "OFFLINE_PACK_UPDATED");
      res.type("application/json").send(pack.bytes);
    } catch (cause) {
      next(cause);
    }
  });
}
