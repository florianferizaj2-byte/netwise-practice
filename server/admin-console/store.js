import crypto from "node:crypto";
import { digest } from "../content-quality/quality.js";

export const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
export const stamp = () => new Date().toISOString();
export function createConsoleStore(store) {
  const { db } = store;
  db.exec(`CREATE TABLE IF NOT EXISTS admin_console_documents (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, certificate_id TEXT NOT NULL, title TEXT NOT NULL,
    data TEXT NOT NULL, revision TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL, exported_at TEXT);
    CREATE TABLE IF NOT EXISTS admin_console_jobs (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, created_by TEXT NOT NULL, status TEXT NOT NULL,
    input TEXT NOT NULL, result TEXT, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS admin_console_jobs_status ON admin_console_jobs(status,created_at);
    CREATE TABLE IF NOT EXISTS admin_feedback_cases (
    user_id TEXT NOT NULL, question_id TEXT NOT NULL, status TEXT NOT NULL, note TEXT NOT NULL,
    document_id TEXT, revision TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(user_id,question_id));`);
  db.prepare(
    "UPDATE admin_console_jobs SET status='interrupted',error='服务已重启，请检查结果后手动重试',updated_at=? WHERE status IN ('running','queued')",
  ).run(stamp());
  const doc = (row) =>
    row && {
      id: row.id,
      kind: row.kind,
      certificateId: row.certificate_id,
      title: row.title,
      data: JSON.parse(row.data),
      revision: row.revision,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      exportedAt: row.exported_at,
    };
  const api = {
    document: (id) =>
      doc(
        db.prepare("SELECT * FROM admin_console_documents WHERE id=?").get(id),
      ),
    documents: () =>
      db
        .prepare(
          `SELECT id,kind,certificate_id AS certificateId,title,revision,created_at AS createdAt,
      updated_at AS updatedAt,exported_at AS exportedAt,json_array_length(data,'$.questions') AS count
      FROM admin_console_documents ORDER BY updated_at DESC,id`,
        )
        .all(),
    saveDocument(actor, input, id) {
      const old = id ? api.document(id) : null;
      if (id && !old) throw fail("草稿不存在", 404);
      if (old && old.revision !== input.revision)
        throw fail("草稿已被其他操作修改，请重新读取", 409);
      const data = JSON.stringify(input.data);
      if (Buffer.byteLength(data) > 3 * 1024 * 1024)
        throw fail("每批草稿不能超过 3MB，请拆批");
      const next = {
        id: id || crypto.randomUUID(),
        kind: input.kind,
        certificateId: input.certificateId,
        title: input.title,
        data: input.data,
        updatedAt: stamp(),
      };
      const revision = digest({ ...next, previous: old?.revision || "" });
      db.prepare(
        `INSERT INTO admin_console_documents VALUES (?,?,?,?,?,?,?,?,?,NULL)
        ON CONFLICT(id) DO UPDATE SET title=excluded.title,data=excluded.data,revision=excluded.revision,
        kind=excluded.kind,certificate_id=excluded.certificate_id,updated_at=excluded.updated_at,exported_at=NULL`,
      ).run(
        next.id,
        next.kind,
        next.certificateId,
        next.title,
        data,
        revision,
        actor,
        old?.createdAt || next.updatedAt,
        next.updatedAt,
      );
      store.audit(
        actor,
        old ? "console_draft_updated" : "console_draft_created",
        "content_batch",
        next.id,
        { title: next.title, certificateId: next.certificateId },
      );
      return api.document(next.id);
    },
    markExported(id) {
      db.prepare(
        "UPDATE admin_console_documents SET exported_at=? WHERE id=?",
      ).run(stamp(), id);
    },
    job(id) {
      const row = db
        .prepare("SELECT * FROM admin_console_jobs WHERE id=?")
        .get(id);
      return (
        row && {
          id: row.id,
          kind: row.kind,
          createdBy: row.created_by,
          status: row.status,
          input: JSON.parse(row.input),
          result: row.result ? JSON.parse(row.result) : null,
          error: row.error,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }
      );
    },
    jobs: () =>
      db
        .prepare(
          "SELECT id FROM admin_console_jobs ORDER BY created_at DESC,id LIMIT 100",
        )
        .all()
        .map((r) => api.job(r.id)),
    enqueue(id, actor, kind, input) {
      const old = api.job(id);
      if (old) {
        if (
          old.kind !== kind ||
          old.createdBy !== actor ||
          digest(old.input) !== digest(input)
        )
          throw fail("请求编号已用于其他任务", 409);
        return old;
      }
      if (
        db
          .prepare(
            "SELECT COUNT(*) AS n FROM admin_console_jobs WHERE status IN ('queued','running')",
          )
          .get().n >= 20
      )
        throw fail("任务队列已满，请稍后再试", 429);
      db.prepare(
        "INSERT INTO admin_console_jobs VALUES (?,?,?,?,?,NULL,NULL,?,?)",
      ).run(id, kind, actor, "queued", JSON.stringify(input), stamp(), stamp());
      store.audit(actor, "console_task_created", "task", id, { kind });
      return api.job(id);
    },
    updateJob(id, status, result = null, error = null) {
      db.prepare(
        "UPDATE admin_console_jobs SET status=?,result=?,error=?,updated_at=? WHERE id=?",
      ).run(
        status,
        result === null ? null : JSON.stringify(result),
        error,
        stamp(),
        id,
      );
      return api.job(id);
    },
  };
  return api;
}
