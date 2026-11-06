import { z } from "zod";
import { hasCertificateQuestion } from "./certificates.js";

const key = z.enum(["A", "B", "C", "D", "E"]);
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const action = z.object({
  id: z.string().uuid(),
  questionId: z.string().min(1).max(512),
  selected: z.array(key).min(1).max(5),
  response: z.string().max(5000).optional(),
  timeMs: z.number().int().min(0).max(86400000),
  occurredAt: z.number().int().min(Date.UTC(2025, 0, 1)),
  source: z.enum(["practice", "exam"]),
  packVersion: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
const page = z.object({
  day: z.string().regex(dayPattern).optional(),
  after: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
}).strict();
const fail = (message, status, code) => Object.assign(new Error(message), { status, code });
const today = (time) => new Date(time + 8 * 3600000).toISOString().slice(0, 10);

export function registerOfflineAttempts({ route, store, certificates, now = Date.now }) {
  const base = "/api/offline/certificates/:certificateId/attempts";
  const known = new Set(certificates.map(({ id }) => id));
  const owner = (req, res) => {
    res.set("Cache-Control", "private, no-store");
    if (!req.user?.id) throw fail("请先登录同步学习记录", 401, "OFFLINE_AUTH_REQUIRED");
    const certificateId = req.params.certificateId;
    if (!known.has(certificateId) || req.user.certificateId !== certificateId)
      throw fail("记录不属于当前证书", 404, "OFFLINE_CERTIFICATE_NOT_FOUND");
    return { userId: req.user.id, certificateId };
  };

  route("post", base, (req, res) => {
    const { userId, certificateId } = owner(req, res);
    const { attempts } = z.object({ attempts: z.array(action).min(1).max(100) }).strict().parse(req.body);
    if (new Set(attempts.map((entry) => entry.id)).size !== attempts.length)
      throw fail("同批作答标识不能重复", 400, "OFFLINE_DUPLICATE_BATCH_IDS");
    const received = now();
    const accepted = [], rejected = [];
    for (const entry of attempts) {
      const q = store.getQ(entry.questionId);
      const reject = (code) => rejected.push({ id: entry.id, code });
      if (entry.occurredAt > received + 120000) { reject("OFFLINE_CLOCK_AHEAD"); continue; }
      if (!q || store.isQuestionHidden(q.id) || q.ownerUserId || q.aiGroupId ||
        ["ai_generated", "user_submitted"].includes(q.source) || !hasCertificateQuestion(q, certificateId)) {
        reject("OFFLINE_QUESTION_UNAVAILABLE");
        continue;
      }
      const valid = new Set(entry.selected).size === entry.selected.length &&
        (q.type === "short_answer"
          ? entry.source === "practice" && entry.selected.length === 1 &&
            ["A", "B"].includes(entry.selected[0]) && entry.response?.trim()
          : entry.response === undefined && entry.selected.every((option) => Object.hasOwn(q.options, option)) &&
            (q.type === "multiple_choice" || entry.selected.length === 1));
      if (!valid) { reject("OFFLINE_ANSWER_INVALID"); continue; }
      try {
        const saved = store.recordAttempt(entry.questionId, entry.selected, entry.timeMs,
          entry.source, userId, entry.response, entry.id, certificateId,
          { occurredAt: entry.occurredAt, packVersion: entry.packVersion, receivedAt: received });
        accepted.push({ id: entry.id, serverId: saved.id, correct: saved.correct, occurredAt: Date.parse(saved.createdAt) });
      } catch (cause) {
        if (cause?.status !== 409) throw cause;
        reject("OFFLINE_ATTEMPT_CONFLICT");
      }
    }
    return { accepted, rejected };
  });

  route("get", base, (req, res) => {
    const { userId, certificateId } = owner(req, res);
    const { day = today(now()), after = 0 } = page.parse(req.query);
    const start = Date.parse(day + "T00:00:00+08:00");
    if (!Number.isFinite(start) || today(start) !== day)
      throw fail("作答日期不正确", 400, "OFFLINE_DAY_INVALID");
    const rows = store.db.prepare(
      "SELECT rowid AS cursor,data FROM attempts WHERE user_id=? AND rowid>? " +
      "AND json_extract(data,'$.createdAt')>=? AND json_extract(data,'$.createdAt')<? " +
      "AND (json_extract(data,'$.certificateId')=? OR json_extract(data,'$.certificateId') IS NULL) " +
      "ORDER BY rowid LIMIT 251",
    ).all(userId, after, new Date(start).toISOString(), new Date(start + 86400000).toISOString(), certificateId);
    const attempts = [];
    for (const row of rows.slice(0, 250)) {
      const entry = JSON.parse(row.data);
      if (!entry.certificateId) {
        const question = store.getQ(entry.questionId);
        // An older attempt on a shared question cannot be attributed safely.
        if (question?.certificates?.length !== 1 || !hasCertificateQuestion(question, certificateId)) continue;
      }
      attempts.push({
        serverId: entry.id, questionId: entry.questionId, correct: !!entry.correct,
        occurredAt: Date.parse(entry.createdAt), timeMs: entry.timeMs || 0,
      });
    }
    return { day, attempts, nextCursor: rows.length > 250 ? rows[249].cursor : null };
  });
}
