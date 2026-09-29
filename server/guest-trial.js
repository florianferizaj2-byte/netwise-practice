import crypto from "node:crypto";
import { z } from "zod";
import { authorAiAvailable } from "./ai-service.js";
import { hasCertificateQuestion } from "./certificates.js";
import { questionExplanationCacheKey, questionMistakeCacheKey } from "./ai.js";

const COOKIE = "kaojiang_guest_trial";
const DAYS_30 = 30 * 86400000;
const QUESTION_IDS = [
  "practice-1",
  "practice-2",
  "practice-5",
  "practice-7",
  "practice-10",
];
const fail = (status, message) => Object.assign(new Error(message), { status });
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const trialAiResult = (result, action) =>
  z
    .object({ text: z.string().min(8).max(6000) })
    .parse(
      action === "mistake"
        ? { text: `${result.weakKnowledge}\n\n${result.reason}` }
        : result,
    );
const bounded = (value, fallback, maximum) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, maximum)
    : fallback;
};

// The anonymous trial has its own records and quotas. It never creates an
// account, writes learning history, or exposes the authenticated AI routes.
export function registerGuestTrialRoutes({
  route,
  store,
  provider,
  runAI,
  customProvider = false,
}) {
  const db = store.db;
  db.exec(`
    CREATE TABLE IF NOT EXISTS guest_trial_settings (
      name TEXT PRIMARY KEY, value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS guest_trials (
      id TEXT PRIMARY KEY, questions TEXT NOT NULL,
      created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS guest_trials_expiry ON guest_trials(expires_at);
    CREATE TABLE IF NOT EXISTS guest_trial_answers (
      trial_id TEXT NOT NULL REFERENCES guest_trials(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL, selected TEXT NOT NULL, correct INTEGER NOT NULL,
      PRIMARY KEY(trial_id, question_id)
    );
    CREATE TABLE IF NOT EXISTS guest_trial_ai (
      trial_id TEXT NOT NULL REFERENCES guest_trials(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL, action TEXT NOT NULL, state TEXT NOT NULL,
      result TEXT, attempts INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(trial_id, question_id, action)
    );
    CREATE TABLE IF NOT EXISTS guest_trial_limits (
      name TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS guest_trial_limits_expiry ON guest_trial_limits(expires_at);
  `);
  db.prepare(
    "INSERT OR IGNORE INTO guest_trial_settings VALUES ('ip-salt', ?)",
  ).run(crypto.randomBytes(32).toString("hex"));
  const salt = db
    .prepare("SELECT value FROM guest_trial_settings WHERE name='ip-salt'")
    .get().value;
  const available = () => customProvider || authorAiAvailable(store);
  const trialLimit = bounded(
    process.env.GUEST_TRIAL_SESSIONS_PER_IP_DAY,
    20,
    1000,
  );
  const ipAiLimit = bounded(process.env.GUEST_TRIAL_AI_PER_IP_DAY, 100, 10000);
  const siteAiLimit = bounded(process.env.GUEST_TRIAL_AI_PER_DAY, 1000, 100000);
  let lastCleanup = 0;
  const cleanup = () => {
    const now = Date.now();
    if (now - lastCleanup < 300000) return;
    db.prepare("DELETE FROM guest_trials WHERE expires_at < ?").run(now);
    db.prepare("DELETE FROM guest_trial_limits WHERE expires_at < ?").run(now);
    lastCleanup = now;
  };
  const limitKey = (req, kind) => {
    const day = Math.floor(Date.now() / 86400000);
    const address = req.ip || req.socket.remoteAddress || "unknown";
    const ip = crypto
      .createHmac("sha256", salt)
      .update(`${day}:${address}`)
      .digest("hex");
    return `${kind}:${day}:${ip}`;
  };
  const consume = (name, limit) => {
    const expires = (Math.floor(Date.now() / 86400000) + 1) * 86400000;
    const row = db
      .prepare(
        `INSERT INTO guest_trial_limits(name,count,expires_at) VALUES (?,1,?)
      ON CONFLICT(name) DO UPDATE SET count=count+1 WHERE count < ? RETURNING count`,
      )
      .get(name, expires, limit);
    if (!row)
      throw fail(
        429,
        "当前免费体验请求较多，请稍后再试；也可以登录后继续学习。",
      );
  };
  const tokenFrom = (req) =>
    req.headers.cookie
      ?.split(";")
      .map((part) => part.trim().split("="))
      .find(([name]) => name === COOKIE)?.[1];
  const readTrial = (req) => {
    const token = tokenFrom(req);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const row = db
      .prepare("SELECT * FROM guest_trials WHERE id=? AND expires_at>?")
      .get(hash(token), Date.now());
    return row ? { ...row, questions: JSON.parse(row.questions) } : null;
  };
  const requireTrial = (req) => {
    const trial = readTrial(req);
    if (!trial) throw fail(401, "体验记录已过期，请刷新页面重新开始。");
    return trial;
  };
  const answerView = (question, row) =>
    row
      ? {
          selected: row.selected,
          correct: !!row.correct,
          correctAnswer: question.answer[0],
          analysis: question.analysis,
        }
      : null;
  const state = (trial) => {
    const answers = db
      .prepare("SELECT * FROM guest_trial_answers WHERE trial_id=?")
      .all(trial.id);
    const results = db
      .prepare(
        "SELECT * FROM guest_trial_ai WHERE trial_id=? AND state='ready'",
      )
      .all(trial.id);
    return {
      total: trial.questions.length,
      certificate: "软考网络工程师",
      aiAvailable: available(),
      expiresAt: new Date(trial.expires_at).toISOString(),
      questions: trial.questions.map((question) => ({
        id: question.id,
        question: question.question,
        options: question.options,
        knowledgePoint: question.knowledgePoint,
        chapter: question.chapter,
        attempt: answerView(
          question,
          answers.find((row) => row.question_id === question.id),
        ),
        ai: Object.fromEntries(
          results
            .filter((row) => row.question_id === question.id)
            .map((row) => [row.action, JSON.parse(row.result)]),
        ),
      })),
    };
  };
  const requireQuestion = (trial, id) => {
    const question = trial.questions.find((item) => item.id === id);
    if (!question) throw fail(404, "这道题不属于当前的 5 道体验题。");
    return question;
  };

  route("get", "/api/guest-trial", (req, res) => {
    cleanup();
    let trial = readTrial(req);
    if (!trial) {
      const bank = store
        .allQ()
        .filter(
          (question) =>
            hasCertificateQuestion(question, "network-engineer") &&
            question.source === "practice" &&
            question.type === "single_choice" &&
            question.answer?.length === 1 &&
            !question.ownerUserId &&
            !question.images?.length &&
            !question.sharedStem,
        );
      const selected = QUESTION_IDS.map((id) =>
        bank.find((question) => question.id === id),
      );
      if (selected.some((question) => !question))
        throw fail(503, "体验题库正在准备中，请稍后再来。");
      consume(limitKey(req, "sessions"), trialLimit);
      const token = crypto.randomBytes(32).toString("hex");
      const now = Date.now();
      trial = {
        id: hash(token),
        created_at: now,
        expires_at: now + DAYS_30,
        questions: selected.map((question) => ({
          id: question.id,
          type: question.type,
          question: question.question,
          options: question.options,
          answer: question.answer,
          analysis: question.analysis,
          chapter: question.chapter,
          knowledgePoint: question.knowledgePoint,
          targetKnowledgePoint: question.targetKnowledgePoint,
          knowledgeSection: question.knowledgeSection,
        })),
      };
      db.prepare("INSERT INTO guest_trials VALUES (?,?,?,?)").run(
        trial.id,
        JSON.stringify(trial.questions),
        now,
        trial.expires_at,
      );
      res.cookie(COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.COOKIE_SECURE !== "0" && req.secure,
        path: "/api/guest-trial",
        maxAge: DAYS_30,
      });
    }
    return state(trial);
  });

  route("post", "/api/guest-trial/questions/:id/answer", (req) => {
    const { selected } = z
      .object({ selected: z.enum(["A", "B", "C", "D", "E"]) })
      .strict()
      .parse(req.body);
    const trial = requireTrial(req);
    const question = requireQuestion(trial, req.params.id);
    if (!Object.hasOwn(question.options, selected))
      throw fail(400, "请选择题目中的一个选项。");
    db.prepare(
      "INSERT OR IGNORE INTO guest_trial_answers VALUES (?,?,?,?)",
    ).run(
      trial.id,
      question.id,
      selected,
      Number(question.answer[0] === selected),
    );
    // First submitted answers are immutable, including retries after a lost response.
    return state(trial);
  });

  route("post", "/api/guest-trial/questions/:id/ai", async (req) => {
    const { action } = z
      .object({ action: z.enum(["explanation", "mistake"]) })
      .strict()
      .parse(req.body);
    const trial = requireTrial(req);
    const question = requireQuestion(trial, req.params.id);
    const answer = db
      .prepare(
        "SELECT * FROM guest_trial_answers WHERE trial_id=? AND question_id=?",
      )
      .get(trial.id, question.id);
    if (!answer) throw fail(400, "先提交这道题的答案，再查看 AI 讲解。");
    if (action === "mistake" && answer.correct)
      throw fail(400, "这道题答对了，可以查看 AI 详细解析。");
    const readResult = () =>
      db
        .prepare(
          "SELECT * FROM guest_trial_ai WHERE trial_id=? AND question_id=? AND action=?",
        )
        .get(trial.id, question.id, action);
    const cached = readResult();
    if (cached?.state === "ready") return JSON.parse(cached.result);
    const actionLabel = action === "mistake" ? "为什么我错了？" : "详细讲解";
    const cacheKey =
      action === "mistake"
        ? questionMistakeCacheKey(question, [answer.selected])
        : questionExplanationCacheKey(question, actionLabel, [answer.selected]);
    const shared = store.aiQuestionContent(
      question.id,
      cacheKey.kind,
      cacheKey.variant,
    );
    if (shared) {
      const result = trialAiResult(shared, action);
      db.prepare(
        `INSERT INTO guest_trial_ai VALUES (?,?,?,'ready',?,0,0)
        ON CONFLICT(trial_id,question_id,action) DO UPDATE SET state='ready',result=excluded.result,locked_until=0`,
      ).run(trial.id, question.id, action, JSON.stringify(result));
      return result;
    }
    if (!available())
      throw fail(503, "AI 体验暂时不可用，你仍可以继续答题并查看题库解析。");
    return runAI(async () => {
      let claimed = false;
      db.exec("BEGIN IMMEDIATE");
      try {
        const current = readResult();
        if (current?.state === "ready") {
          db.exec("COMMIT");
          return JSON.parse(current.result);
        }
        if (current?.state === "pending" && current.locked_until > Date.now())
          throw fail(409, "这份 AI 讲解正在生成，请稍候。");
        if ((current?.attempts || 0) >= 3)
          throw fail(429, "这份讲解暂时无法生成，请稍后登录学习空间继续。");
        consume(limitKey(req, "ai"), ipAiLimit);
        consume(`ai-site:${Math.floor(Date.now() / 86400000)}`, siteAiLimit);
        db.prepare(
          `INSERT INTO guest_trial_ai VALUES (?,?,?,'pending',NULL,1,?)
          ON CONFLICT(trial_id,question_id,action) DO UPDATE SET
            state='pending',attempts=attempts+1,locked_until=excluded.locked_until`,
        ).run(trial.id, question.id, action, Date.now() + 10 * 60000);
        db.exec("COMMIT");
        claimed = true;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      try {
        const result =
          action === "mistake"
            ? await provider.analyzeAnswerMistake(
                question,
                [answer.selected],
                "guest-trial",
              )
            : await provider.explainQuestion(
                question,
                actionLabel,
                [answer.selected],
                0,
                "guest-trial",
              );
        const safeResult = trialAiResult(result, action);
        db.prepare(
          "UPDATE guest_trial_ai SET state='ready',result=?,locked_until=0 WHERE trial_id=? AND question_id=? AND action=?",
        ).run(JSON.stringify(safeResult), trial.id, question.id, action);
        return safeResult;
      } catch (error) {
        if (claimed)
          db.prepare(
            "UPDATE guest_trial_ai SET state='failed',locked_until=0 WHERE trial_id=? AND question_id=? AND action=?",
          ).run(trial.id, question.id, action);
        throw error;
      }
    });
  });
}
