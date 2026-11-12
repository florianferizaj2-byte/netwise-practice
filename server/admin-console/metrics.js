import { digest } from "../content-quality/quality.js";
import { authorAiSettings } from "../ai-service.js";

const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" })
  .format;
const dayMs = 86400000;
const answerEvents = `WITH answer_events AS (
  SELECT a.user_id, json_extract(a.data, '$.createdAt') AS created_at,
         json_extract(a.data, '$.correct') AS correct
  FROM attempts a
  WHERE json_array_length(a.data, '$.selected') > 0
     OR trim(json_extract(a.data, '$.response'), char(9, 10, 13, 32)) <> ''
  UNION ALL
  SELECT s.user_id, s.created_at, json_extract(s.data, '$.result.correct') AS correct
  FROM study_attempts s
  WHERE EXISTS (
    SELECT 1 FROM json_each(s.data, '$.answers') AS answer
    WHERE trim(answer.value, char(9, 10, 13, 32)) <> ''
  )
)`;

function practiceWindow(days) {
  const now = Date.now();
  const keys = Array.from({ length: days }, (_, i) =>
    day(now - (days - 1 - i) * dayMs),
  );
  const since = new Date(keys[0] + "T00:00:00+08:00").toISOString();
  const until = new Date(Date.parse(since) + days * dayMs).toISOString();
  return { keys, since, until };
}
const sum = (rows) => {
  const unknown = rows.filter(
    (r) => !Number.isFinite(r.estimatedCostCny),
  ).length;
  return {
    calls: rows.length,
    successful: rows.filter((r) => r.success).length,
    tokens: rows.reduce((n, r) => n + (r.total_tokens || 0), 0),
    promptTokens: rows.reduce((n, r) => n + (r.prompt_tokens || 0), 0),
    completionTokens: rows.reduce((n, r) => n + (r.completion_tokens || 0), 0),
    unknownUsage: rows.filter((r) => !r.hasUsage).length,
    unknownCost: unknown,
    knownCostCny: rows.reduce(
      (n, r) =>
        n + (Number.isFinite(r.estimatedCostCny) ? r.estimatedCostCny : 0),
      0,
    ),
  };
};
export function consoleMetrics(store, days) {
  const { keys, since, until } = practiceWindow(days);
  const attempts = store.db
    .prepare(
      `${answerEvents}
       SELECT a.user_id AS userId, date(a.created_at, '+8 hours') AS day, a.correct
       FROM answer_events a JOIN users u ON u.id = a.user_id
       WHERE a.created_at >= ? AND a.created_at < ?`,
    )
    .all(since, until);
  const users = store.db
    .prepare(
      "SELECT date(created_at, '+8 hours') AS day FROM users WHERE created_at>=? AND created_at<?",
    )
    .all(since, until);
  const usage = store.db
    .prepare(
      "SELECT data FROM user_usage WHERE json_extract(data,'$.createdAt')>=?",
    )
    .all(since)
    .map((r) => JSON.parse(r.data));
  const stat = store.adminStats();
  const byDay = new Map(
    keys.map((date) => [date, { attempts: 0, learners: new Set() }]),
  );
  for (const attempt of attempts) {
    const bucket = byDay.get(attempt.day);
    if (bucket) {
      bucket.attempts++;
      bucket.learners.add(attempt.userId);
    }
  }
  return {
    updatedAt: new Date().toISOString(),
    days,
    stats: {
      ...stat,
      newUsers: users.length,
      activeLearners: new Set(attempts.map((a) => a.userId)).size,
      attempts: attempts.length,
      correct: attempts.filter((a) => a.correct).length,
    },
    usage: sum(usage),
    trend: keys.map((date) => ({
      date,
      attempts: byDay.get(date).attempts,
      newUsers: users.filter((u) => u.day === date).length,
      active: byDay.get(date).learners.size,
    })),
    sourceNames: Object.fromEntries(
      store.allQ().map((q) => [q.source, q.sourceLabel || q.source]),
    ),
    recentAudit: store
      .auditRows(100)
      .filter((r) => r.action !== "study_seed_published")
      .slice(0, 8),
  };
}
export function consolePracticeRanking(store, { days, sort, limit, offset }) {
  const { since, until } = practiceWindow(days);
  const order = sort === "period" ? "periodAttempts" : "totalAttempts";
  const rows = store.db
    .prepare(
      `${answerEvents}, answer_counts AS (
       SELECT user_id, COUNT(*) AS total,
              COUNT(*) FILTER (WHERE created_at >= ? AND created_at < ?) AS period
       FROM answer_events
       GROUP BY user_id
     )
     SELECT u.id, u.username, u.community_name AS communityName,
            COALESCE(a.total, 0) AS totalAttempts, COALESCE(a.period, 0) AS periodAttempts
     FROM users u LEFT JOIN answer_counts a ON a.user_id = u.id
     ORDER BY ${order} DESC, u.id ASC
     LIMIT ? OFFSET ?`,
    )
    .all(since, until, limit, offset);
  const { total } = store.db
    .prepare("SELECT COUNT(*) AS total FROM users")
    .get();
  return { rows, total, offset, limit };
}
export function consoleUsage(store, { days, offset, limit, search }) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const rows = store.db
    .prepare(
      `SELECT v.id,v.user_id,u.username,v.data FROM user_usage v LEFT JOIN users u ON u.id=v.user_id
    WHERE json_extract(v.data,'$.createdAt')>=? ORDER BY json_extract(v.data,'$.createdAt') DESC,v.id DESC`,
    )
    .all(since)
    .map((row) => {
      const r = JSON.parse(row.data);
      return {
        id: row.id,
        userId: row.user_id,
        username: row.username,
        createdAt: r.createdAt,
        model: r.model || "未记录",
        taskType: r.taskType || "未分类",
        success: !!r.success,
        prompt_tokens: r.prompt_tokens,
        completion_tokens: r.completion_tokens,
        total_tokens: r.total_tokens,
        hasUsage: r.hasUsage,
        estimatedCostCny: Number.isFinite(r.estimatedCostCny)
          ? r.estimatedCostCny
          : null,
      };
    })
    .filter((r) =>
      [r.username, r.model, r.taskType].some((v) =>
        String(v || "")
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    );
  return {
    summary: sum(rows),
    total: rows.length,
    rows: rows.slice(offset, offset + limit),
    offset,
    limit,
    models: [...new Set(rows.map((r) => r.model))].map((model) => ({
      model,
      ...sum(rows.filter((r) => r.model === model)),
    })),
  };
}
export function configStatus(store) {
  const settings = authorAiSettings(store);
  const managed = !!store.aiServices?.policy().managed;
  return {
    configured: !!(settings?.apiKey || settings?.keyCipher),
    model: settings?.model || "",
    baseUrl: settings?.baseUrl || "",
    managed,
    serviceName: settings?.serviceName || "",
    source: managed ? "多接口优先级配置" : process.env.AI_SERVICE_API_KEY
      ? "AI_SERVICE 环境配置"
      : process.env.AUTHOR_API_KEY
        ? "AUTHOR 环境配置"
        : "管理员加密配置",
    readOnly: !managed && !!(process.env.AI_SERVICE_API_KEY || process.env.AUTHOR_API_KEY),
  };
}
export const contentRevision = (store) =>
  digest(store.allQ(true).filter((q) => q.source !== "ai_generated"));
