import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { TutorEngine, tutorError } from "./engine.js";
import { getBundle, catalogue } from "./registry.js";
import { startSchema, actionSchema, lessonJSONSchema } from "./protocol.js";

const prefix = "/api/demo/tutor/v1";
const cookieName = "aceexam_tutor_demo";
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const jsonHash = (data) => hash(JSON.stringify(data));
const parse = (schema, body) => {
  const result = schema.safeParse(body);
  if (!result.success)
    throw tutorError(
      "请求内容不完整，请重新操作。",
      400,
      "TUTOR_INVALID_INPUT",
    );
  return result.data;
};

// Independent loopback demo; it never opens the production database or grants membership.
export function createDemoTutorApp({
  databasePath = ":memory:",
  publicPath,
} = {}) {
  if (databasePath !== ":memory:")
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS demo_tutor_sessions (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, course_id TEXT NOT NULL,
      course_version TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS demo_tutor_owner ON demo_tutor_sessions(owner_id,course_id,updated_at);
    CREATE TABLE IF NOT EXISTS demo_tutor_requests (
      owner_id TEXT NOT NULL, request_id TEXT NOT NULL, session_id TEXT NOT NULL
        REFERENCES demo_tutor_sessions(id) ON DELETE CASCADE, input_hash TEXT NOT NULL,
      PRIMARY KEY(owner_id,request_id)
    );`);
  const engine = new TutorEngine();
  const app = express();
  app.disable("x-powered-by");
  const rates = new Map();
  const unpack = (row) => (row ? JSON.parse(row.data) : null);
  const latest = (owner, courseId = "vlan-broadcast-domain") => {
    const { course } = getBundle(courseId);
    return unpack(
      db
        .prepare(
          "SELECT data FROM demo_tutor_sessions WHERE owner_id=? AND course_id=? AND course_version=? ORDER BY rowid DESC LIMIT 1",
        )
        .get(owner, course.id, course.version),
    );
  };
  const get = (id, owner) => {
    const s = unpack(
      db
        .prepare(
          "SELECT data FROM demo_tutor_sessions WHERE id=? AND owner_id=?",
        )
        .get(id, owner),
    );
    if (!s)
      throw tutorError(
        "这次学习记录已清理，可以重新开始。",
        404,
        "TUTOR_SESSION_NOT_FOUND",
      );
    return s;
  };
  const transaction = (fn) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
  app.use((req, res, next) => {
    const hostname = req.hostname;
    if (!["127.0.0.1", "localhost", "[::1]", "::1"].includes(hostname))
      return res.status(403).json({
        error: {
          code: "DEMO_LOOPBACK_ONLY",
          message: "演示服务仅允许本机访问。",
        },
      });
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  app.get(prefix + "/health", (req, res) =>
    res.json({
      mode: "reviewed-demo",
      modelConnected: false,
      schemaVersion: 1,
    }),
  );
  app.get(prefix + "/schema", (req, res) => res.json(lessonJSONSchema));
  app.use(
    prefix,
    (req, res, next) => {
      res.setHeader("Cache-Control", "no-store");
      if (!["GET", "HEAD"].includes(req.method)) {
        const origin = req.get("origin");
        if (origin && origin !== "http://" + req.get("host"))
          return res.status(403).json({
            error: {
              code: "TUTOR_ORIGIN",
              message: "请在本地演示页面中操作。",
            },
          });
        if (!["DELETE"].includes(req.method) && !req.is("application/json"))
          return res.status(415).json({
            error: {
              code: "TUTOR_CONTENT_TYPE",
              message: "请求格式不正确。",
            },
          });
      }
      const raw = req.headers.cookie
        ?.split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith(cookieName + "="))
        ?.slice(cookieName.length + 1);
      const token = /^[a-f0-9]{64}$/.test(raw || "")
        ? raw
        : crypto.randomBytes(32).toString("hex");
      if (token !== raw)
        res.cookie(cookieName, token, {
          httpOnly: true,
          sameSite: "strict",
          path: prefix,
          maxAge: 30 * 24 * 3600 * 1000,
        });
      req.tutorOwner = hash(token);
      if (!["GET", "HEAD"].includes(req.method)) {
        const minute = Math.floor(Date.now() / 60000);
        const bucket = rates.get(req.tutorOwner);
        const count = bucket?.minute === minute ? bucket.count + 1 : 1;
        rates.set(req.tutorOwner, { minute, count });
        if (rates.size > 2000)
          for (const [owner, value] of rates)
            if (value.minute < minute) rates.delete(owner);
        if (count > 90) {
          res.setHeader("Retry-After", "60");
          return res.status(429).json({
            error: {
              code: "TUTOR_RATE_LIMIT",
              message: "操作太频繁，请稍后继续。当前进度已保留。",
            },
          });
        }
      }
      next();
    },
    express.json({ limit: "12kb", strict: true }),
  );

  app.get(prefix + "/catalog", (req, res) => res.json(catalogue()));
  app.get(prefix + "/sessions/current", (req, res, next) => {
    try {
      const { course } = getBundle(
        req.query.courseId || "vlan-broadcast-domain",
      );
      const s = latest(req.tutorOwner, course.id);
      res.json({ course, session: s ? engine.view(s) : null });
    } catch (error) {
      next(error);
    }
  });
  app.post(prefix + "/sessions", (req, res, next) => {
    try {
      const input = parse(startSchema, req.body);
      getBundle(input.courseId);
      const s = transaction(() => {
        const previous = db
          .prepare(
            "SELECT * FROM demo_tutor_requests WHERE owner_id=? AND request_id=?",
          )
          .get(req.tutorOwner, input.requestId);
        if (previous) {
          if (previous.input_hash !== jsonHash(input))
            throw tutorError("操作编号已使用，请重新操作。", 409);
          return get(previous.session_id, req.tutorOwner);
        }
        const current = latest(req.tutorOwner, input.courseId);
        let state = current;
        if (!state || input.restart) {
          const count = db
            .prepare(
              "SELECT count(*) AS n FROM demo_tutor_sessions WHERE owner_id=? AND course_id=? AND created_at>=?",
            )
            .get(
              req.tutorOwner,
              input.courseId,
              new Date(Date.now() - 86400000).toISOString(),
            ).n;
          if (count >= 20)
            throw tutorError(
              "今天重新开课次数较多，可以继续已保存的课程。",
              429,
              "TUTOR_DAILY_LIMIT",
            );
          state = engine.start(input.foundation, input.courseId, input.pacing);
          engine.view(state);
          db.prepare(
            "INSERT INTO demo_tutor_sessions VALUES (?,?,?,?,?,?,?)",
          ).run(
            state.id,
            req.tutorOwner,
            state.courseId,
            state.courseVersion,
            state.startedAt,
            state.updatedAt,
            JSON.stringify(state),
          );
        }
        db.prepare("INSERT INTO demo_tutor_requests VALUES (?,?,?,?)").run(
          req.tutorOwner,
          input.requestId,
          state.id,
          jsonHash(input),
        );
        return state;
      });
      res.json({ session: engine.view(s) });
    } catch (error) {
      next(error);
    }
  });
  app.get(prefix + "/sessions/:id", (req, res, next) => {
    try {
      res.json({ session: engine.view(get(req.params.id, req.tutorOwner)) });
    } catch (error) {
      next(error);
    }
  });
  app.get(prefix + "/sessions/:id/concepts/:concept", (req, res, next) => {
    try {
      res.json(
        engine.review(get(req.params.id, req.tutorOwner), req.params.concept),
      );
    } catch (error) {
      next(error);
    }
  });
  app.post(prefix + "/sessions/:id/actions", (req, res, next) => {
    try {
      const input = parse(actionSchema, req.body);
      const s = transaction(() => {
        const previous = db
          .prepare(
            "SELECT * FROM demo_tutor_requests WHERE owner_id=? AND request_id=?",
          )
          .get(req.tutorOwner, input.requestId);
        const current = get(req.params.id, req.tutorOwner);
        if (
          current.courseVersion !== getBundle(current.courseId).course.version
        )
          throw tutorError(
            "课程已更新，请重新连接后开始新版互动课。",
            409,
            "TUTOR_VERSION_CHANGED",
          );
        const recent = latest(req.tutorOwner, current.courseId);
        if (current.id !== recent.id)
          throw Object.assign(
            tutorError(
              "已在另一个页面重新开课，正在恢复最新课程。",
              409,
              "TUTOR_CONFLICT",
            ),
            { session: engine.view(recent) },
          );
        if (previous) {
          if (
            previous.input_hash !== jsonHash(input) ||
            previous.session_id !== current.id
          )
            throw tutorError("操作编号已使用，请重新操作。", 409);
          return current;
        }
        if (input.revision !== current.revision)
          throw Object.assign(
            tutorError(
              "课程进度已更新，正在恢复最新位置。",
              409,
              "TUTOR_CONFLICT",
            ),
            { session: engine.view(current) },
          );
        const state = engine.apply(current, input);
        engine.view(state); // Validate the full public JSON before committing a state transition.
        db.prepare(
          "UPDATE demo_tutor_sessions SET updated_at=?,data=? WHERE id=? AND owner_id=?",
        ).run(state.updatedAt, JSON.stringify(state), state.id, req.tutorOwner);
        db.prepare("INSERT INTO demo_tutor_requests VALUES (?,?,?,?)").run(
          req.tutorOwner,
          input.requestId,
          state.id,
          jsonHash(input),
        );
        return state;
      });
      res.json({ session: engine.view(s) });
    } catch (error) {
      next(error);
    }
  });
  app.get(prefix + "/usage", (req, res) => {
    const rows = db
      .prepare("SELECT data FROM demo_tutor_sessions WHERE owner_id=?")
      .all(req.tutorOwner)
      .map(unpack);
    const usage = {
      sessions: rows.length,
      aiCalls: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costCny: 0,
      ruleSubmissions: 0,
      contentCacheHits: 0,
    };
    for (const s of rows)
      for (const field of [
        "aiCalls",
        "promptTokens",
        "completionTokens",
        "totalTokens",
        "costCny",
        "ruleSubmissions",
        "contentCacheHits",
      ])
        usage[field] += s.usage[field];
    res.json({ mode: "reviewed-demo", modelConnected: false, usage });
  });
  app.delete(prefix + "/sessions", (req, res) => {
    db.prepare("DELETE FROM demo_tutor_sessions WHERE owner_id=?").run(
      req.tutorOwner,
    );
    res.json({ cleared: true });
  });
  app.use(prefix, (req, res) =>
    res.status(404).json({
      error: { code: "TUTOR_NOT_FOUND", message: "没有找到这个教学操作。" },
    }),
  );
  if (publicPath)
    app.use(express.static(publicPath, { etag: true, maxAge: 0 }));
  app.use((error, req, res, next) => {
    const status = error.status || 500;
    res.status(status).json({
      error: {
        code: error.code || "TUTOR_UNAVAILABLE",
        message:
          status < 500
            ? error.message
            : "课程连接暂时不可用，已保留当前进度。请重新连接后继续。",
      },
      ...(error.session ? { session: error.session } : {}),
    });
  });
  // Periodically purge idle private records, including during a long-running preview.
  const purgeIdle = () =>
    db
      .prepare("DELETE FROM demo_tutor_sessions WHERE updated_at<?")
      .run(new Date(Date.now() - 30 * 86400000).toISOString());
  purgeIdle();
  const purgeTimer = setInterval(purgeIdle, 3600000);
  purgeTimer.unref();
  app.locals.closeTutor = () => {
    clearInterval(purgeTimer);
    db.close();
  };
  return app;
}
