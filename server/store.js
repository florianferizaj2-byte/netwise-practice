import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { bundledQuestions, certificates } from "./question-banks/loader.js";
import { calculateMastery, nextReview, fingerprint } from "./domain.js";

export function createStore(dir = process.env.DATA_DIR || "data") {
  fs.mkdirSync(dir, { recursive: true });
  const communityUploadDir = path.join(dir, "community", "uploads");
  fs.mkdirSync(communityUploadDir, { recursive: true });
  const communityStorageLimit =
    Number(process.env.COMMUNITY_STORAGE_LIMIT_BYTES) || 2 * 1024 ** 3;
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
 CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, salt TEXT NOT NULL, certificate_id TEXT, created_at TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0, banned_at TEXT, ban_reason TEXT, community_name TEXT);
 CREATE TABLE IF NOT EXISTS auth_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS wechat_identities (
   appid TEXT NOT NULL,
   openid TEXT NOT NULL,
   unionid TEXT,
   user_id TEXT NOT NULL REFERENCES users(id),
   created_at TEXT NOT NULL,
   updated_at TEXT NOT NULL,
   PRIMARY KEY (appid, openid),
   UNIQUE (user_id, appid)
 );
 CREATE TABLE IF NOT EXISTS wechat_login_challenges (
   token_hash TEXT PRIMARY KEY,
   appid TEXT NOT NULL,
   openid TEXT NOT NULL,
   unionid TEXT,
   expires_at TEXT NOT NULL,
   created_at TEXT NOT NULL
 );`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_usage (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_daily (
      user_id TEXT NOT NULL,
      day TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (user_id, day)
    );
    CREATE TABLE IF NOT EXISTS admin_settings (
      user_id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS question_tombstones (
      question_id TEXT PRIMARY KEY,
      deleted_by TEXT NOT NULL,
      reason TEXT,
      deleted_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_audit (
      id TEXT PRIMARY KEY,
      admin_user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS community_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      image_path TEXT,
      image_mime TEXT,
      image_bytes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS community_messages_created_at_idx
      ON community_messages(created_at);
    CREATE TABLE IF NOT EXISTS community_storage (
      id INTEGER PRIMARY KEY CHECK(id=1),
      used_bytes INTEGER NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO community_storage (id, used_bytes) VALUES (1, 0);
    CREATE TABLE IF NOT EXISTS user_question_drafts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      certificate_id TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS user_question_drafts_owner_idx
      ON user_question_drafts(user_id, certificate_id);
    CREATE TABLE IF NOT EXISTS user_question_submissions (
      question_id TEXT PRIMARY KEY REFERENCES questions(id),
      user_id TEXT NOT NULL,
      certificate_id TEXT NOT NULL,
      submitted_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS user_question_submissions_owner_idx
      ON user_question_submissions(user_id);
  `);
  for (const statement of [
    "ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE users ADD COLUMN banned_at TEXT",
    "ALTER TABLE users ADD COLUMN ban_reason TEXT",
    "ALTER TABLE users ADD COLUMN community_name TEXT",
  ]) {
    try {
      db.exec(statement);
    } catch {}
  }
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
    created_at TEXT NOT NULL,
    shared INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS question_feedback (
    user_id TEXT NOT NULL,
    question_id TEXT NOT NULL REFERENCES questions(id),
    kind TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, question_id)
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
  );
  CREATE TABLE IF NOT EXISTS question_favorites (
    user_id TEXT NOT NULL,
    question_id TEXT NOT NULL REFERENCES questions(id),
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, question_id)
  );
  CREATE TABLE IF NOT EXISTS wrong_dismissals (
    user_id TEXT NOT NULL,
    question_id TEXT NOT NULL REFERENCES questions(id),
    dismissed_at TEXT NOT NULL,
    PRIMARY KEY (user_id, question_id)
  );`);
  try {
    db.exec("ALTER TABLE ai_groups ADD COLUMN shared INTEGER NOT NULL DEFAULT 1");
  } catch {}
  // An intermediate local build briefly created user_settings with a foreign
  // key. Rebuild it without that constraint so the no-auth "local" profile
  // remains supported as well as real authenticated user IDs.
  if (db.prepare("PRAGMA foreign_key_list(user_settings)").all().length) {
    db.exec(`
      ALTER TABLE user_settings RENAME TO user_settings_with_user_fk;
      CREATE TABLE user_settings (user_id TEXT PRIMARY KEY, data TEXT NOT NULL);
      INSERT OR REPLACE INTO user_settings SELECT user_id, data FROM user_settings_with_user_fk;
      DROP TABLE user_settings_with_user_fk;
    `);
  }
  const existingUserIds = db
    .prepare("SELECT id FROM users ORDER BY created_at, rowid")
    .all();
  // Older builds stored settings in one global row, or in the anonymous
  // `local` profile. When accounts already exist, that profile represents the
  // first account that configured the site. Migrate it only to that account;
  // never leave it available as a shared fallback for later accounts.
  const legacyOwnerId = existingUserIds[0]?.id || "local";
  const legacySettings = db
    .prepare("SELECT data FROM settings WHERE id=1")
    .get();
  if (
    legacyOwnerId &&
    legacySettings &&
    !db.prepare("SELECT 1 FROM user_settings LIMIT 1").get()
  ) {
    db.prepare("INSERT INTO user_settings (user_id,data) VALUES (?,?)").run(
      legacyOwnerId,
      legacySettings.data,
    );
  }
  const userSettingRows = db
    .prepare("SELECT user_id, data FROM user_settings")
    .all();
  if (
    existingUserIds.length &&
    userSettingRows.length &&
    userSettingRows.every((row) => row.user_id === "local")
  ) {
    db.prepare(
      "INSERT OR REPLACE INTO user_settings (user_id,data) VALUES (?,?)",
    ).run(existingUserIds[0].id, userSettingRows[0].data);
    db.prepare("DELETE FROM user_settings WHERE user_id='local'").run();
  }
  const legacyUsage = db.prepare("SELECT id, data FROM usage").all();
  if (
    legacyOwnerId &&
    legacyUsage.length &&
    !db.prepare("SELECT 1 FROM user_usage LIMIT 1").get()
  ) {
    db.exec("BEGIN");
    try {
      const insertUsage = db.prepare(
        "INSERT INTO user_usage (id,user_id,data) VALUES (?,?,?)",
      );
      for (const row of legacyUsage)
        insertUsage.run(row.id, legacyOwnerId, row.data);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  const legacyDaily = db.prepare("SELECT day, data FROM daily").all();
  if (
    legacyOwnerId &&
    legacyDaily.length &&
    !db.prepare("SELECT 1 FROM user_daily LIMIT 1").get()
  ) {
    db.exec("BEGIN");
    try {
      const insertDaily = db.prepare(
        "INSERT OR REPLACE INTO user_daily (user_id,day,data) VALUES (?,?,?)",
      );
      for (const row of legacyDaily)
        insertDaily.run(legacyOwnerId, row.day, row.data);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  // The old tables were global. They are migrated above and then emptied so
  // an accidental legacy read can never expose one account's settings.
  db.prepare("DELETE FROM settings WHERE id=1").run();
  db.prepare("DELETE FROM usage").run();
  db.prepare("DELETE FROM daily").run();
  const configuredAdmin = process.env.ADMIN_USERNAME?.trim();
  if (configuredAdmin)
    db.prepare("UPDATE users SET is_admin=1 WHERE username=?").run(
      configuredAdmin,
    );
  if (!db.prepare("SELECT 1 FROM users WHERE is_admin=1 LIMIT 1").get()) {
    const firstUser = db
      .prepare("SELECT id FROM users ORDER BY created_at, rowid LIMIT 1")
      .get();
    if (firstUser)
      db.prepare("UPDATE users SET is_admin=1 WHERE id=?").run(firstUser.id);
  }
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
  const isQuestionDeleted = (id) =>
    !!db.prepare("SELECT 1 FROM question_tombstones WHERE question_id=?").get(id);
  for (const q of bundledQuestions()) {
    if (isQuestionDeleted(q.id)) continue;
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
    communityUploadDir,
    communityStorageLimit,
    getQ,
    allQ,
    allA,
    addQ,
    saveUserQuestionDraft(userId, certificateId, question) {
      const id = crypto.randomUUID();
      db.prepare(
        "INSERT INTO user_question_drafts (id,user_id,certificate_id,data,created_at) VALUES (?,?,?,?,?)",
      ).run(id, userId, certificateId, JSON.stringify(question), new Date().toISOString());
      return { id, question };
    },
    userQuestionDraft(id, userId, certificateId) {
      const row = db.prepare(
        "SELECT data FROM user_question_drafts WHERE id=? AND user_id=? AND certificate_id=?",
      ).get(id, userId, certificateId);
      return row ? JSON.parse(row.data) : null;
    },
    latestUserQuestionDraft(userId, certificateId, chapter, knowledgeSection, knowledgePoint) {
      const rows = db.prepare(
        "SELECT id,data FROM user_question_drafts WHERE user_id=? AND certificate_id=? ORDER BY created_at DESC",
      ).all(userId, certificateId);
      for (const row of rows) {
        const question = JSON.parse(row.data);
        if (question.chapter === chapter &&
            (question.knowledgeSection || null) === (knowledgeSection || null) &&
            question.knowledgePoint === knowledgePoint)
          return { id: row.id, question };
      }
      return null;
    },
    deleteUserQuestionDraft(id, userId, certificateId) {
      return db.prepare(
        "DELETE FROM user_question_drafts WHERE id=? AND user_id=? AND certificate_id=?",
      ).run(id, userId, certificateId).changes > 0;
    },
    submitUserQuestionDraft(id, userId, certificateId, question) {
      db.exec("SAVEPOINT user_question_submission");
      try {
        const draft = db.prepare(
          "SELECT 1 FROM user_question_drafts WHERE id=? AND user_id=? AND certificate_id=?",
        ).get(id, userId, certificateId);
        if (!draft) throw new Error("待提交题目不存在");
        addQ(question);
        db.prepare(
          "INSERT INTO user_question_submissions (question_id,user_id,certificate_id,submitted_at) VALUES (?,?,?,?)",
        ).run(question.id, userId, certificateId, new Date().toISOString());
        db.prepare("DELETE FROM user_question_drafts WHERE id=?").run(id);
        db.exec("RELEASE user_question_submission");
        return question;
      } catch (error) {
        db.exec("ROLLBACK TO user_question_submission");
        db.exec("RELEASE user_question_submission");
        throw error;
      }
    },
    communityLeaderboards(userId) {
      const users = db.prepare(
        "SELECT id, username, community_name AS communityName FROM users WHERE banned_at IS NULL",
      ).all();
      const stats = new Map(users.map((user) => [user.id, {
        userId: user.id,
        name: user.communityName || (/^1\d{10}$/.test(user.username)
          ? `考匠用户 ${user.username.slice(-4)}`
          : user.username),
        answered: 0,
        correct: 0,
        accuracy: 0,
        streakDays: 0,
        submitted: 0,
        days: new Set(),
      }]));
      for (const attempt of allA()) {
        const entry = stats.get(attempt.userId);
        if (!entry) continue;
        entry.answered += 1;
        if (attempt.correct) entry.correct += 1;
        if (attempt.createdAt && !Number.isNaN(Date.parse(attempt.createdAt))) {
          entry.days.add(new Date(attempt.createdAt).toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" }));
        }
      }
      for (const row of db.prepare(
        "SELECT user_id AS userId, COUNT(*) AS count FROM user_question_submissions GROUP BY user_id",
      ).all()) {
        const entry = stats.get(row.userId);
        if (entry) entry.submitted = row.count;
      }
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
      const previousDay = (day) => new Date(Date.parse(`${day}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
      for (const entry of stats.values()) {
        entry.accuracy = entry.answered ? Math.round(entry.correct / entry.answered * 1000) / 10 : 0;
        let day = entry.days.has(today) ? today : previousDay(today);
        while (entry.days.has(day)) {
          entry.streakDays += 1;
          day = previousDay(day);
        }
        delete entry.days;
      }
      const items = [...stats.values()];
      const ranked = (key, eligible) => {
        const rows = items.filter(eligible).sort((a, b) =>
          b[key] - a[key] || b.answered - a.answered || a.name.localeCompare(b.name, "zh-CN"),
        );
        const format = (entry, index) => ({
          rank: index + 1,
          userId: entry.userId,
          name: entry.name,
          value: entry[key],
          answered: entry.answered,
          correct: entry.correct,
        });
        return {
          top: rows.slice(0, 50).map(format),
          me: rows.findIndex((entry) => entry.userId === userId) < 0
            ? null
            : format(rows.find((entry) => entry.userId === userId), rows.findIndex((entry) => entry.userId === userId)),
        };
      };
      return {
        answered: ranked("answered", (entry) => entry.answered > 0),
        accuracy: ranked("accuracy", (entry) => entry.answered >= 20),
        streakDays: ranked("streakDays", (entry) => entry.streakDays > 0),
        submitted: ranked("submitted", (entry) => entry.submitted > 0),
        accuracyMinAttempts: 20,
      };
    },
    attemptedQuestionIds: (userId = "local") =>
      new Set(allA(userId || "local").map((attempt) => attempt.questionId)),
    favoriteQuestionIds: (userId = "local") =>
      new Set(
        db
          .prepare("SELECT question_id AS questionId FROM question_favorites WHERE user_id=?")
          .all(userId || "local")
          .map((row) => row.questionId),
      ),
    setQuestionFavorite: (userId, questionId, favorite) => {
      const normalizedUserId = userId || "local";
      if (favorite) {
        db.prepare(
          "INSERT OR IGNORE INTO question_favorites (user_id,question_id,created_at) VALUES (?,?,?)",
        ).run(normalizedUserId, questionId, new Date().toISOString());
      } else {
        db.prepare(
          "DELETE FROM question_favorites WHERE user_id=? AND question_id=?",
        ).run(normalizedUserId, questionId);
      }
      return favorite;
    },
    favoriteQuestions: (userId = "local") => {
      const ids = new Set(
        db
          .prepare("SELECT question_id AS questionId FROM question_favorites WHERE user_id=? ORDER BY created_at DESC")
          .all(userId || "local")
          .map((row) => row.questionId),
      );
      return visibleQuestions(userId || "local")
        .filter((question) => ids.has(question.id))
        .map((question) => ({ ...question, favorite: true }));
    },
    dismissWrongQuestion: (userId, questionId) =>
      db
        .prepare(
          "INSERT OR REPLACE INTO wrong_dismissals (user_id,question_id,dismissed_at) VALUES (?,?,?)",
        )
        .run(userId || "local", questionId, new Date().toISOString()),
    settings: (userId = "local") => {
      const r = db
        .prepare("SELECT data FROM user_settings WHERE user_id=?")
        .get(userId);
      return r
        ? JSON.parse(r.data)
        : { baseUrl: "", model: "", temperature: 0.7 };
    },
    saveSettings(userId, settings) {
      if (settings === undefined && userId && typeof userId === "object") {
        settings = userId;
        userId = "local";
      }
      return db
        .prepare("INSERT OR REPLACE INTO user_settings VALUES (?,?)")
        .run(userId || "local", JSON.stringify(settings));
    },
    adminSettings: (userId) => {
      const r = db
        .prepare("SELECT data FROM admin_settings WHERE user_id=?")
        .get(userId);
      return r ? JSON.parse(r.data) : { baseUrl: "", model: "", temperature: 0.3 };
    },
    saveAdminSettings(userId, settings) {
      return db
        .prepare("INSERT OR REPLACE INTO admin_settings VALUES (?,?)")
        .run(userId, JSON.stringify(settings));
    },
    adminStats: () => {
      const questions = allQ();
      const bySource = {};
      for (const q of questions) bySource[q.source] = (bySource[q.source] || 0) + 1;
      return {
        users: db.prepare("SELECT COUNT(*) AS count FROM users").get().count,
        bannedUsers: db
          .prepare("SELECT COUNT(*) AS count FROM users WHERE banned_at IS NOT NULL")
          .get().count,
        questions: questions.length,
        adminGenerated: questions.filter((q) => q.source === "admin_generated").length,
        aiGenerated: questions.filter((q) => q.source === "ai_generated").length,
        bySource,
      };
    },
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
      ].map((knowledgePoint) => {
        const pointQuestions = questions.filter(
          (question) =>
            (question.targetKnowledgePoint || question.knowledgePoint) ===
            knowledgePoint,
        );
        const pointQuestionIds = new Set(
          pointQuestions.map((question) => question.id),
        );
        return {
          userId: userId || "local",
          knowledgePointId: knowledgePoint,
          knowledgePoint,
          chapter: pointQuestions[0].chapter,
          knowledgeSection: pointQuestions[0].knowledgeSection || null,
          ...calculateMastery(
            attempts.filter((attempt) =>
              pointQuestionIds.has(attempt.questionId),
            ),
          ),
        };
      });
    },
    recordAttempt(
      questionId,
      selected,
      timeMs,
      mode = "practice",
      userId = "local",
      response,
    ) {
      const q = getQ(questionId);
      if (!q) throw new Error("题目不存在");
      const correct =
        q.type === "short_answer"
          ? selected[0] === "A"
          : JSON.stringify([...selected].sort()) ===
            JSON.stringify([...q.answer].sort());
      const a = {
        id: crypto.randomUUID(),
        userId,
        questionId,
        selected,
        correct,
        ...(response !== undefined ? { response } : {}),
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
        if (!correct)
          db
            .prepare("DELETE FROM wrong_dismissals WHERE user_id=? AND question_id=?")
            .run(userId || "local", questionId);
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
      return {
        ...a,
        answer: q.answer,
        ...(q.type === "short_answer" ? { expectedAnswer: q.expectedAnswer } : {}),
        analysis: q.analysis,
      };
    },
    wrongQuestions: (userId) => {
      const normalizedUserId = userId || "local";
      const dismissed = new Set(
        db
          .prepare("SELECT question_id AS questionId FROM wrong_dismissals WHERE user_id=?")
          .all(normalizedUserId)
          .map((row) => row.questionId),
      );
      return visibleQuestions(userId)
        .filter(
          (q) =>
            !dismissed.has(q.id) &&
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
        });
    },
    saveMistake: (id, m, userId = "local") =>
      db
        .prepare("INSERT OR REPLACE INTO user_mistakes VALUES (?,?,?)")
        .run(
          userId,
          id,
          JSON.stringify({ ...m, analyzedAt: new Date().toISOString() }),
        ),
    saveUsage: (u, userId = "local") =>
      db
        .prepare("INSERT INTO user_usage VALUES (?,?,?)")
        .run(
          crypto.randomUUID(),
          userId || "local",
          JSON.stringify({ ...u, createdAt: new Date().toISOString() }),
        ),
    usage: (userId = "local") => {
      const rows = parse(
          db
            .prepare("SELECT data FROM user_usage WHERE user_id=?")
            .all(userId || "local"),
        ),
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
    getDaily: (userId, day) => {
      if (day === undefined) {
        day = userId;
        userId = "local";
      }
      const r = db
        .prepare("SELECT data FROM user_daily WHERE user_id=? AND day=?")
        .get(userId || "local", day);
      return r ? JSON.parse(r.data) : null;
    },
    saveDaily(userId, day, data) {
      if (data === undefined) {
        data = day;
        day = userId;
        userId = "local";
      }
      return db
        .prepare("INSERT OR REPLACE INTO user_daily VALUES (?,?,?)")
        .run(userId || "local", day, JSON.stringify(data));
    },
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
    aiGroups: (userId, certificateId) => {
      const groups = db
        .prepare(
          "SELECT id, certificate_id AS certificateId, topic, harder, shared, created_at AS createdAt FROM ai_groups WHERE user_id=? AND (? IS NULL OR certificate_id=?) ORDER BY created_at DESC",
        )
        .all(userId || "local", certificateId || null, certificateId || null);
      return groups.map((group) => {
        const questions = allQ().filter((q) => q.aiGroupId === group.id);
        const completed = db
          .prepare(
            "SELECT COUNT(*) AS count FROM queue WHERE group_id=? AND user_id=? AND completed=1",
          )
          .get(group.id, userId || "local").count;
        return {
          ...group,
          harder: !!group.harder,
          shared: !!group.shared,
          questionCount: questions.length,
          completedCount: completed,
        };
      });
    },
    setAiGroupShared: (id, userId, shared) =>
      db
        .prepare("UPDATE ai_groups SET shared=? WHERE id=? AND user_id=?")
        .run(shared ? 1 : 0, id, userId || "local").changes > 0,
    saveQuestionFeedback: (userId, questionId, kind, note = "") =>
      db
        .prepare(
          "INSERT OR REPLACE INTO question_feedback (user_id,question_id,kind,note,created_at) VALUES (?,?,?,?,?)",
        )
        .run(
          userId || "local",
          questionId,
          kind,
          note || null,
          new Date().toISOString(),
        ),
    questionFeedback: (questionId, userId) => {
      const rows = db
        .prepare(
          "SELECT kind, COUNT(*) AS count FROM question_feedback WHERE question_id=? GROUP BY kind",
        )
        .all(questionId);
      const summary = {
        helpful: 0,
        wrong_answer: 0,
        ambiguous: 0,
        duplicate: 0,
        other: 0,
        total: 0,
        reportTotal: 0,
        mine: null,
      };
      for (const row of rows) {
        if (row.kind in summary) {
          summary[row.kind] = row.count;
          if (row.kind !== "reportTotal" && row.kind !== "mine")
            summary.total += row.count;
          if (row.kind !== "helpful") summary.reportTotal += row.count;
        }
      }
      if (userId) {
        summary.mine =
          db
            .prepare(
              "SELECT kind FROM question_feedback WHERE question_id=? AND user_id=?",
            )
            .get(questionId, userId)?.kind || null;
      }
      return summary;
    },
    questionFeedbackDetails: (questionId) =>
      db
        .prepare(
          "SELECT f.user_id AS userId, u.username, f.kind, f.note, f.created_at AS createdAt FROM question_feedback f LEFT JOIN users u ON u.id=f.user_id WHERE f.question_id=? AND f.kind<>? ORDER BY f.created_at DESC",
        )
        .all(questionId, "helpful"),
    questionFeedbackPage: ({ certificateId = "", limit = 50, offset = 0 }) => {
      const from = `FROM question_feedback f
        JOIN questions q ON q.id=f.question_id
        WHERE f.kind<>'helpful' AND (?='' OR EXISTS (
          SELECT 1 FROM json_each(q.data, '$.certificates') WHERE value=?
        ))`;
      const total = db.prepare(`SELECT COUNT(*) AS count ${from}`)
        .get(certificateId, certificateId).count;
      const feedback = db.prepare(`SELECT f.user_id AS userId,
        (SELECT username FROM users WHERE id=f.user_id) AS username,
        f.question_id AS questionId, f.kind, f.note, f.created_at AS createdAt,
        q.data AS questionData ${from}
        ORDER BY f.created_at DESC, f.user_id, f.question_id LIMIT ? OFFSET ?`)
        .all(certificateId, certificateId, limit, offset)
        .map(({ questionData, ...row }) => ({ ...row, question: JSON.parse(questionData) }));
      return { total, feedback };
    },
    questionFeedbackRows: () =>
      db
        .prepare(
          "SELECT f.user_id AS userId, u.username, f.question_id AS questionId, f.kind, f.note, f.created_at AS createdAt, q.data AS questionData FROM question_feedback f LEFT JOIN users u ON u.id=f.user_id INNER JOIN questions q ON q.id=f.question_id WHERE f.kind<>? ORDER BY f.created_at DESC",
        )
        .all("helpful")
        .map(({ questionData, ...row }) => ({
          ...row,
          question: JSON.parse(questionData),
        })),
    deleteQuestionFeedback: (userId, questionId) =>
      db
        .prepare("DELETE FROM question_feedback WHERE user_id=? AND question_id=?")
        .run(userId, questionId).changes > 0,
    communityStats: (certificateId, userId) => {
      const groups = db
        .prepare(
          "SELECT id, user_id AS userId, shared FROM ai_groups WHERE certificate_id=?",
        )
        .all(certificateId);
      const groupMap = new Map(groups.map((group) => [group.id, group]));
      const questions = allQ().filter(
        (q) => q.source === "ai_generated" && groupMap.has(q.aiGroupId),
      );
      const shared = questions.filter((q) => groupMap.get(q.aiGroupId).shared);
      const ids = [...new Set(shared.map((q) => q.id))];
      const attemptCount = ids.length
        ? db
            .prepare(
              `SELECT COUNT(*) AS count FROM attempts WHERE question_id IN (${ids.map(() => "?").join(",")})`,
            )
            .get(...ids).count
        : 0;
      return {
        sharedQuestionCount: shared.length,
        contributorCount: new Set(
          shared.map((q) => groupMap.get(q.aiGroupId).userId),
        ).size,
        attemptCount,
        myQuestionCount: shared.filter(
          (q) => groupMap.get(q.aiGroupId).userId === (userId || "local"),
        ).length,
      };
    },
    createAiGroup: (userId, certificateId, topic, harder = false) => {
      const id = crypto.randomUUID();
      db.prepare(
        "INSERT INTO ai_groups (id,user_id,certificate_id,topic,harder,created_at,shared) VALUES (?,?,?,?,?,?,?)",
      ).run(
        id,
        userId,
        certificateId,
        topic,
        harder ? 1 : 0,
        new Date().toISOString(),
        1,
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
    addAdminQuestions: (qs) => {
      const inserted = [];
      const skipped = [];
      db.exec("BEGIN");
      try {
        for (const q of qs) {
          const existing = db
            .prepare("SELECT id FROM questions WHERE fingerprint=? OR id=?")
            .get(fingerprint(q), q.id);
          if (existing) {
            skipped.push({ id: q.id, existingId: existing.id });
            continue;
          }
          addQ(q);
          inserted.push(q);
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return { inserted, skipped };
    },
    updateQuestion: (questionId, question) => {
      const existing = getQ(questionId);
      if (!existing) return null;
      const next = { ...existing, ...question, id: existing.id };
      const duplicate = db
        .prepare("SELECT id FROM questions WHERE fingerprint=? AND id<>?")
        .get(fingerprint(next), questionId);
      if (duplicate) throw new Error("修改后与其他题目重复");
      db.prepare("UPDATE questions SET fingerprint=?, data=? WHERE id=?").run(
        fingerprint(next),
        JSON.stringify(next),
        questionId,
      );
      return next;
    },
    deleteQuestion: (questionId, deletedBy, reason = "") => {
      const question = getQ(questionId);
      if (!question) return false;
      db.exec("BEGIN");
      try {
        db.prepare(
          "INSERT OR REPLACE INTO question_tombstones (question_id,deleted_by,reason,deleted_at) VALUES (?,?,?,?)",
        ).run(questionId, deletedBy, reason || null, new Date().toISOString());
        for (const table of [
          "attempts",
          "reviews",
          "mistakes",
          "queue",
          "question_feedback",
          "user_reviews",
          "user_mistakes",
          "question_favorites",
          "wrong_dismissals",
          "user_question_submissions",
        ])
          db.prepare(`DELETE FROM ${table} WHERE question_id=?`).run(questionId);
        const sessions = db.prepare("SELECT id,data FROM sessions").all();
        for (const session of sessions) {
          const value = JSON.parse(session.data);
          if (value.questionIds?.includes(questionId))
            db.prepare("DELETE FROM sessions WHERE id=?").run(session.id);
        }
        db.prepare("DELETE FROM questions WHERE id=?").run(questionId);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return true;
    },
    adminUsers: (search = "") => {
      const like = `%${search.trim()}%`;
      return db
        .prepare(
          "SELECT id, username, certificate_id AS certificateId, created_at AS createdAt, is_admin AS isAdmin, banned_at AS bannedAt, ban_reason AS banReason FROM users WHERE (?='' OR username LIKE ?) ORDER BY created_at, rowid",
        )
        .all(search.trim(), like)
        .map((user) => ({ ...user, isAdmin: !!user.isAdmin }));
    },
    setUserBanned: (userId, banned, reason = "") => {
      const result = db
        .prepare("UPDATE users SET banned_at=?, ban_reason=? WHERE id=?")
        .run(banned ? new Date().toISOString() : null, banned ? reason || null : null, userId);
      if (banned)
        db.prepare("DELETE FROM auth_sessions WHERE user_id=?").run(userId);
      return result.changes > 0;
    },
    audit: (adminUserId, action, targetType, targetId, data = {}) =>
      db
        .prepare(
          "INSERT INTO admin_audit (id,admin_user_id,action,target_type,target_id,data,created_at) VALUES (?,?,?,?,?,?,?)",
        )
        .run(
          crypto.randomUUID(),
          adminUserId,
          action,
          targetType,
          targetId || null,
          JSON.stringify(data),
          new Date().toISOString(),
        ),
    auditRows: (limit = 50) =>
      db
        .prepare(
          "SELECT a.id, a.admin_user_id AS adminUserId, u.username AS adminUsername, a.action, a.target_type AS targetType, a.target_id AS targetId, a.data, a.created_at AS createdAt FROM admin_audit a LEFT JOIN users u ON u.id=a.admin_user_id ORDER BY a.created_at DESC LIMIT ?",
        )
        .all(Math.max(1, Math.min(200, Number(limit) || 50)))
        .map((row) => ({ ...row, data: JSON.parse(row.data) })),
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
      const firstUser = !db.prepare("SELECT 1 FROM users LIMIT 1").get();
      const isAdmin =
        firstUser ||
        (!!process.env.ADMIN_USERNAME && process.env.ADMIN_USERNAME === username);
      const user = {
        id: crypto.randomUUID(),
        username,
        communityName: null,
        certificateId: null,
        isAdmin,
        bannedAt: null,
        banReason: null,
      };
      try {
        db.prepare(
          "INSERT INTO users (id,username,password_hash,salt,certificate_id,created_at,is_admin,banned_at,ban_reason,community_name) VALUES (?,?,?,?,?,?,?,?,?,?)",
        ).run(
          user.id,
          username,
          passwordHash,
          salt,
          null,
          new Date().toISOString(),
          isAdmin ? 1 : 0,
          null,
          null,
          null,
        );
      } catch (e) {
        if (String(e.message).includes("UNIQUE")) throw new Error("账号已存在");
        throw e;
      }
      return user;
    },
    userById(userId) {
      const row = db.prepare("SELECT * FROM users WHERE id=?").get(userId);
      if (!row) return null;
      return {
        id: row.id,
        username: row.username,
        communityName: row.community_name,
        certificateId: row.certificate_id,
        isAdmin: !!row.is_admin,
        bannedAt: row.banned_at,
        banReason: row.ban_reason,
      };
    },
    wechatIdentity(appid, openid) {
      return db
        .prepare(
          "SELECT appid, openid, unionid, user_id AS userId, created_at AS createdAt, updated_at AS updatedAt FROM wechat_identities WHERE appid=? AND openid=?",
        )
        .get(appid, openid) || null;
    },
    createWechatLoginChallenge({ appid, openid, unionid, ttlMs = 10 * 60 * 1000 }) {
      const token = crypto.randomBytes(32).toString("base64url");
      const now = new Date();
      db.prepare(
        "INSERT INTO wechat_login_challenges (token_hash,appid,openid,unionid,expires_at,created_at) VALUES (?,?,?,?,?,?)",
      ).run(
        crypto.createHash("sha256").update(token).digest("hex"),
        appid,
        openid,
        unionid || null,
        new Date(now.getTime() + ttlMs).toISOString(),
        now.toISOString(),
      );
      db.prepare("DELETE FROM wechat_login_challenges WHERE expires_at<=?").run(
        now.toISOString(),
      );
      return token;
    },
    wechatLoginChallenge(token) {
      if (!token || typeof token !== "string") return null;
      const row = db
        .prepare(
          "SELECT appid, openid, unionid, expires_at AS expiresAt FROM wechat_login_challenges WHERE token_hash=? AND expires_at>?",
        )
        .get(
          crypto.createHash("sha256").update(token).digest("hex"),
          new Date().toISOString(),
        );
      return row || null;
    },
    consumeWechatLoginChallenge(token) {
      if (!token || typeof token !== "string") return;
      db.prepare("DELETE FROM wechat_login_challenges WHERE token_hash=?").run(
        crypto.createHash("sha256").update(token).digest("hex"),
      );
    },
    bindWechatIdentity({ appid, openid, unionid, userId }) {
      const existing = db
        .prepare("SELECT user_id AS userId FROM wechat_identities WHERE appid=? AND openid=?")
        .get(appid, openid);
      if (existing && existing.userId !== userId) {
        throw new Error("这个微信已经绑定了其他考匠账号");
      }
      const otherIdentity = db
        .prepare("SELECT user_id AS userId FROM wechat_identities WHERE appid=? AND user_id=?")
        .get(appid, userId);
      if (otherIdentity && (!existing || otherIdentity.userId !== existing.userId)) {
        throw new Error("这个考匠账号已经绑定了其他微信");
      }
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO wechat_identities (appid,openid,unionid,user_id,created_at,updated_at)
         VALUES (?,?,?,?,?,?)
         ON CONFLICT(appid,openid) DO UPDATE SET unionid=excluded.unionid, updated_at=excluded.updated_at`,
      ).run(appid, openid, unionid || null, userId, now, now);
      return this.wechatIdentity(appid, openid);
    },
    allUsers: () =>
      db
        .prepare(
          "SELECT id, username, certificate_id AS certificateId, created_at AS createdAt, is_admin AS isAdmin, banned_at AS bannedAt, ban_reason AS banReason FROM users ORDER BY created_at, rowid",
        )
        .all(),
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
        communityName: row.community_name,
        certificateId: row.certificate_id,
        isAdmin: !!row.is_admin,
        bannedAt: row.banned_at,
        banReason: row.ban_reason,
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
            communityName: row.community_name,
            certificateId: row.certificate_id,
            isAdmin: !!row.is_admin,
            bannedAt: row.banned_at,
            banReason: row.ban_reason,
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
    communityProfile(userId) {
      const row = db
        .prepare(
          "SELECT username, community_name AS communityName FROM users WHERE id=?",
        )
        .get(userId);
      if (!row) return { name: "考匠用户", customized: false };
      return {
        name: row.communityName || row.username,
        customized: !!row.communityName,
      };
    },
    updateCommunityName(userId, name) {
      db.prepare("UPDATE users SET community_name=? WHERE id=?").run(
        name,
        userId,
      );
      const row = db
        .prepare(
          "SELECT id, username, community_name AS communityName, certificate_id AS certificateId, is_admin AS isAdmin, banned_at AS bannedAt, ban_reason AS banReason FROM users WHERE id=?",
        )
        .get(userId);
      return row
        ? {
            ...row,
            isAdmin: !!row.isAdmin,
          }
        : null;
    },
    communityStorage() {
      const row = db
        .prepare("SELECT used_bytes AS usedBytes FROM community_storage WHERE id=1")
        .get();
      return {
        usedBytes: Number(row?.usedBytes || 0),
        limitBytes: communityStorageLimit,
      };
    },
    communityMessageCount() {
      return db.prepare("SELECT COUNT(*) AS count FROM community_messages").get().count;
    },
    communityMessages({ before = "", limit = 50 } = {}) {
      const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));
      const rows = before
        ? db
            .prepare(
              `SELECT m.id, m.user_id AS userId, m.text, m.image_path AS imagePath,
                      m.image_mime AS imageMime, m.image_bytes AS imageBytes,
                      m.created_at AS createdAt,
                      COALESCE(NULLIF(u.community_name, ''), u.username, '考匠用户') AS authorName
                 FROM community_messages m
                 LEFT JOIN users u ON u.id=m.user_id
                WHERE m.created_at < ?
                ORDER BY m.created_at DESC, m.rowid DESC
                LIMIT ?`,
            )
            .all(before, safeLimit)
        : db
            .prepare(
              `SELECT m.id, m.user_id AS userId, m.text, m.image_path AS imagePath,
                      m.image_mime AS imageMime, m.image_bytes AS imageBytes,
                      m.created_at AS createdAt,
                      COALESCE(NULLIF(u.community_name, ''), u.username, '考匠用户') AS authorName
                 FROM community_messages m
                 LEFT JOIN users u ON u.id=m.user_id
                ORDER BY m.created_at DESC, m.rowid DESC
                LIMIT ?`,
            )
            .all(safeLimit);
      return rows.reverse();
    },
    addCommunityMessage(message, storageBytes) {
      const bytes = Math.max(0, Number(storageBytes) || 0);
      db.exec("BEGIN IMMEDIATE");
      try {
        const current = db
          .prepare("SELECT used_bytes AS usedBytes FROM community_storage WHERE id=1")
          .get();
        const usedBytes = Number(current?.usedBytes || 0);
        if (usedBytes + bytes > communityStorageLimit) {
          const error = new Error("社区聊天存储空间已达到 2GB 上限，请稍后再试");
          error.status = 507;
          throw error;
        }
        db.prepare(
          "INSERT INTO community_messages (id,user_id,text,image_path,image_mime,image_bytes,created_at) VALUES (?,?,?,?,?,?,?)",
        ).run(
          message.id,
          message.userId,
          message.text,
          message.imagePath || null,
          message.imageMime || null,
          message.imageBytes || 0,
          message.createdAt,
        );
        db.prepare("UPDATE community_storage SET used_bytes=? WHERE id=1").run(
          usedBytes + bytes,
        );
        db.exec("COMMIT");
        return message;
      } catch (error) {
        try {
          db.exec("ROLLBACK");
        } catch {}
        throw error;
      }
    },
  };
  return store;
}
