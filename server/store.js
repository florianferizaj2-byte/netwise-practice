import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { bundledQuestions, certificates } from "./question-banks/loader.js";
import { calculateMastery, nextReview, fingerprint } from "./domain.js";

export function createStore(dir = process.env.DATA_DIR || "data") {
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "netwise.sqlite"));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS questions (id TEXT PRIMARY KEY, fingerprint TEXT UNIQUE NOT NULL, data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, question_id TEXT NOT NULL REFERENCES questions(id), data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS reviews (question_id TEXT PRIMARY KEY REFERENCES questions(id), data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS mistakes (question_id TEXT PRIMARY KEY REFERENCES questions(id), data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS queue (question_id TEXT PRIMARY KEY REFERENCES questions(id), topic TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS usage (id TEXT PRIMARY KEY, data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS daily (day TEXT PRIMARY KEY, data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, salt TEXT NOT NULL, certificate_id TEXT, created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS auth_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL);`);
  try {
    db.exec("ALTER TABLE queue ADD COLUMN user_id TEXT");
  } catch {}
  try {
    db.exec("ALTER TABLE queue ADD COLUMN group_id TEXT");
  } catch {}
  db.exec(`CREATE TABLE IF NOT EXISTS ai_groups (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    certificate_id TEXT,
    topic TEXT NOT NULL,
    harder INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_reviews (
    user_id TEXT NOT NULL,
    question_id TEXT NOT NULL REFERENCES questions(id),
    data TEXT NOT NULL,
    PRIMARY KEY (user_id, question_id)
  );
  CREATE TABLE IF NOT EXISTS user_mistakes (
    user_id TEXT NOT NULL,
    question_id TEXT NOT NULL REFERENCES questions(id),
    data TEXT NOT NULL,
    PRIMARY KEY (user_id, question_id)
  );`);
  const existingUsers = db.prepare("SELECT id FROM users").all();
  if (existingUsers.length === 1) {
    const onlyUserId = existingUsers[0].id;
    const legacyAttempts = db
      .prepare("SELECT id, data FROM attempts WHERE user_id='local'")
      .all();
    for (const row of legacyAttempts) {
      const attempt = JSON.parse(row.data);
      attempt.userId = onlyUserId;
      db.prepare("UPDATE attempts SET user_id=?, data=? WHERE id=?").run(
        onlyUserId,
        JSON.stringify(attempt),
        row.id,
      );
    }
    db.prepare(
      "INSERT OR IGNORE INTO user_reviews SELECT ?, question_id, data FROM reviews",
    ).run(onlyUserId);
    db.prepare(
      "INSERT OR IGNORE INTO user_mistakes SELECT ?, question_id, data FROM mistakes",
    ).run(onlyUserId);
  }
  // AI 题必须有明确的用户归属。清理旧版本生成的全局 AI 题，避免它们被其他账号看到。
  const legacyAi = db
    .prepare("SELECT id, data FROM questions")
    .all()
    .filter((row) => {
      const question = JSON.parse(row.data);
      return question.source === "ai_generated" && !question.ownerUserId;
    });
  if (legacyAi.length) {
    db.exec("BEGIN");
    try {
      for (const { id } of legacyAi) {
        db.prepare("DELETE FROM attempts WHERE question_id=?").run(id);
        db.prepare("DELETE FROM reviews WHERE question_id=?").run(id);
        db.prepare("DELETE FROM mistakes WHERE question_id=?").run(id);
        db.prepare("DELETE FROM user_reviews WHERE question_id=?").run(id);
        db.prepare("DELETE FROM user_mistakes WHERE question_id=?").run(id);
        db.prepare("DELETE FROM queue WHERE question_id=?").run(id);
        db.prepare("DELETE FROM questions WHERE id=?").run(id);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  const parse = (rows) => rows.map((r) => JSON.parse(r.data));
  const getQ = (id) => {
    const r = db.prepare("SELECT data FROM questions WHERE id=?").get(id);
    return r ? JSON.parse(r.data) : null;
  };
  const allQ = () => parse(db.prepare("SELECT data FROM questions").all());
  const allA = (userId) =>
    parse(
      userId
        ? db
            .prepare("SELECT data FROM attempts WHERE user_id=? ORDER BY rowid")
            .all(userId)
        : db.prepare("SELECT data FROM attempts ORDER BY rowid").all(),
    );
  const visibleQuestions = (userId) => {
    const attempted = new Set(
      allA(userId).map((attempt) => attempt.questionId),
    );
    return allQ().filter(
      (q) =>
        q.source !== "ai_generated" ||
        !userId ||
        q.ownerUserId === userId ||
        attempted.has(q.id),
    );
  };
  const addQ = (q) =>
    db
      .prepare("INSERT INTO questions VALUES (?,?,?)")
      .run(q.id, fingerprint(q), JSON.stringify(q));
  for (const q of bundledQuestions()) {
    const existing = getQ(q.id);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(q))
        db.prepare("UPDATE questions SET fingerprint=?, data=? WHERE id=?").run(
          fingerprint(q),
          JSON.stringify(q),
          q.id,
        );
    } else addQ(q);
  }
  const store = {
    db,
    getQ,
    allQ,
    allA,
    addQ,
    settings: () => {
      const r = db.prepare("SELECT data FROM settings WHERE id=1").get();
      return r
        ? JSON.parse(r.data)
        : { baseUrl: "", model: "", temperature: 0.7 };
    },
    saveSettings: (s) =>
      db
        .prepare("INSERT OR REPLACE INTO settings VALUES (1,?)")
        .run(JSON.stringify(s)),
    mastery: (questionIds, userId) => {
      const allowed = questionIds ? new Set(questionIds) : null;
      const questions = visibleQuestions(userId).filter(
          (q) => !allowed || allowed.has(q.id),
        ),
        attempts = allA(userId).filter(
          (attempt) => !allowed || allowed.has(attempt.questionId),
        );
      return [
        ...new Set(
          questions.map((q) => q.targetKnowledgePoint || q.knowledgePoint),
        ),
      ].map((knowledgePoint) => ({
        userId: userId || "local",
        knowledgePointId: knowledgePoint,
        knowledgePoint,
        chapter: questions.find(
          (q) =>
            (q.targetKnowledgePoint || q.knowledgePoint) === knowledgePoint,
        ).chapter,
        ...calculateMastery(
          attempts.filter((a) => a.knowledgePoint === knowledgePoint),
        ),
      }));
    },
    recordAttempt(
      questionId,
      selected,
      timeMs,
      mode = "practice",
      userId = "local",
    ) {
      const q = getQ(questionId);
      if (!q) throw new Error("题目不存在");
      const correct =
        JSON.stringify([...selected].sort()) ===
        JSON.stringify([...q.answer].sort());
      const a = {
        id: crypto.randomUUID(),
        userId,
        questionId,
        selected,
        correct,
        timeMs,
        mode,
        chapter: q.chapter,
        knowledgePoint: q.targetKnowledgePoint || q.knowledgePoint,
        practicedKnowledgePoint: q.knowledgePoint,
        createdAt: new Date().toISOString(),
      };
      db.exec("SAVEPOINT attempt");
      try {
        db.prepare("INSERT INTO attempts VALUES (?,?,?,?)").run(
          a.id,
          userId,
          questionId,
          JSON.stringify(a),
        );
        const r = db
          .prepare(
            "SELECT data FROM user_reviews WHERE user_id=? AND question_id=?",
          )
          .get(userId, questionId);
        if (!correct || r)
          db.prepare("INSERT OR REPLACE INTO user_reviews VALUES (?,?,?)").run(
            userId,
            questionId,
            JSON.stringify(nextReview(r ? JSON.parse(r.data) : null, correct)),
          );
        db.prepare(
          "UPDATE queue SET completed=1 WHERE question_id=? AND user_id=?",
        ).run(questionId, userId);
        db.exec("RELEASE attempt");
      } catch (e) {
        db.exec("ROLLBACK TO attempt");
        db.exec("RELEASE attempt");
        throw e;
      }
      return { ...a, answer: q.answer, analysis: q.analysis };
    },
    wrongQuestions: (userId) =>
      visibleQuestions(userId)
        .filter((q) =>
          allA(userId).some((a) => a.questionId === q.id && !a.correct),
        )
        .map((q) => {
          const history = allA(userId).filter((a) => a.questionId === q.id);
          const r = db
              .prepare(
                "SELECT data FROM user_reviews WHERE user_id=? AND question_id=?",
              )
              .get(userId || "local", q.id),
            m = db
              .prepare(
                "SELECT data FROM user_mistakes WHERE user_id=? AND question_id=?",
              )
              .get(userId || "local", q.id);
          return {
            ...q,
            wrongCount: history.filter((a) => !a.correct).length,
            lastAttempt: history.at(-1),
            lastWrong: history.filter((a) => !a.correct).at(-1),
            review: r ? JSON.parse(r.data) : null,
            mistake: m ? JSON.parse(m.data) : null,
          };
        }),
    saveMistake: (id, m, userId = "local") =>
      db
        .prepare("INSERT OR REPLACE INTO user_mistakes VALUES (?,?,?)")
        .run(
          userId,
          id,
          JSON.stringify({ ...m, analyzedAt: new Date().toISOString() }),
        ),
    saveUsage: (u) =>
      db
        .prepare("INSERT INTO usage VALUES (?,?)")
        .run(
          crypto.randomUUID(),
          JSON.stringify({ ...u, createdAt: new Date().toISOString() }),
        ),
    usage: () => {
      const rows = parse(db.prepare("SELECT data FROM usage").all()),
        today = new Date().toLocaleDateString("en-CA", {
          timeZone: "Asia/Shanghai",
        });
      const sum = (rs) => ({
        calls: rs.length,
        prompt_tokens: rs.reduce((s, r) => s + (r.prompt_tokens || 0), 0),
        completion_tokens: rs.reduce(
          (s, r) => s + (r.completion_tokens || 0),
          0,
        ),
        total_tokens: rs.reduce((s, r) => s + (r.total_tokens || 0), 0),
        unknownUsage: rs.filter((r) => !r.hasUsage).length,
      });
      return {
        today: sum(
          rows.filter(
            (r) =>
              new Date(r.createdAt).toLocaleDateString("en-CA", {
                timeZone: "Asia/Shanghai",
              }) === today,
          ),
        ),
        total: sum(rows),
      };
    },
    getDaily: (day) => {
      const r = db.prepare("SELECT data FROM daily WHERE day=?").get(day);
      return r ? JSON.parse(r.data) : null;
    },
    saveDaily: (day, data) =>
      db
        .prepare("INSERT OR REPLACE INTO daily VALUES (?,?)")
        .run(day, JSON.stringify(data)),
    queue: (topic, userId, certificateId) =>
      db
        .prepare(
          userId && certificateId
            ? "SELECT q.question_id FROM queue q JOIN ai_groups g ON g.id=q.group_id WHERE q.completed=0 AND q.topic=? AND q.user_id=? AND g.certificate_id=? ORDER BY q.rowid"
            : userId
              ? "SELECT question_id FROM queue WHERE completed=0 AND topic=? AND user_id=? ORDER BY rowid"
              : "SELECT question_id FROM queue WHERE completed=0 AND topic=? ORDER BY rowid",
        )
        .all(
          ...(userId && certificateId
            ? [topic, userId, certificateId]
            : userId
              ? [topic, userId]
              : [topic]),
        )
        .map((r) => getQ(r.question_id)),
    createAiGroup: (userId, certificateId, topic, harder = false) => {
      const id = crypto.randomUUID();
      db.prepare("INSERT INTO ai_groups VALUES (?,?,?,?,?,?)").run(
        id,
        userId,
        certificateId,
        topic,
        harder ? 1 : 0,
        new Date().toISOString(),
      );
      return id;
    },
    addBatch: (qs, topic, options = {}) => {
      db.exec("BEGIN");
      try {
        for (const q of qs) {
          addQ(q);
          db.prepare(
            "INSERT INTO queue (question_id,topic,user_id,group_id) VALUES (?,?,?,?)",
          ).run(
            q.id,
            topic,
            options.userId || q.ownerUserId || null,
            options.groupId || q.aiGroupId || null,
          );
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    session: (id) => {
      const r = db.prepare("SELECT data FROM sessions WHERE id=?").get(id);
      return r ? JSON.parse(r.data) : null;
    },
    saveSession: (s) =>
      db
        .prepare("INSERT OR REPLACE INTO sessions VALUES (?,?)")
        .run(s.id, JSON.stringify(s)),
    register(username, password) {
      const salt = crypto.randomBytes(16).toString("base64");
      const passwordHash = crypto
        .scryptSync(password, salt, 64)
        .toString("base64");
      const user = { id: crypto.randomUUID(), username, certificateId: null };
      try {
        db.prepare("INSERT INTO users VALUES (?,?,?,?,?,?)").run(
          user.id,
          username,
          passwordHash,
          salt,
          null,
          new Date().toISOString(),
        );
      } catch (e) {
        if (String(e.message).includes("UNIQUE")) throw new Error("账号已存在");
        throw e;
      }
      return user;
    },
    authenticate(username, password) {
      const row = db
        .prepare("SELECT * FROM users WHERE username=?")
        .get(username);
      if (!row) return null;
      const actual = Buffer.from(row.password_hash, "base64");
      const expected = crypto.scryptSync(password, row.salt, 64);
      if (!crypto.timingSafeEqual(actual, expected)) return null;
      return {
        id: row.id,
        username: row.username,
        certificateId: row.certificate_id,
      };
    },
    createAuthSession(userId) {
      const token = crypto.randomBytes(32).toString("base64url");
      db.prepare("INSERT INTO auth_sessions VALUES (?,?,?)").run(
        crypto.createHash("sha256").update(token).digest("hex"),
        userId,
        new Date(Date.now() + 30 * 86400000).toISOString(),
      );
      return token;
    },
    authUser(token) {
      if (!token) return null;
      const row = db
        .prepare(
          "SELECT u.* FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? ",
        )
        .get(
          crypto.createHash("sha256").update(token).digest("hex"),
          new Date().toISOString(),
        );
      return row
        ? {
            id: row.id,
            username: row.username,
            certificateId: row.certificate_id,
          }
        : null;
    },
    deleteAuthSession(token) {
      if (token)
        db.prepare("DELETE FROM auth_sessions WHERE token_hash=?").run(
          crypto.createHash("sha256").update(token).digest("hex"),
        );
    },
    selectCertificate(userId, certificateId) {
      if (!certificates.some((c) => c.id === certificateId))
        throw new Error("不支持的证书");
      db.prepare("UPDATE users SET certificate_id=? WHERE id=?").run(
        certificateId,
        userId,
      );
      return certificates.find((c) => c.id === certificateId);
    },
  };
  return store;
}
