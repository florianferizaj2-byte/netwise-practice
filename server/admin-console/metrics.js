import { digest } from "../content-quality/quality.js";
import { authorAiSettings } from "../ai-service.js";

const day = (value) =>
  new Date(value).toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
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
  const end = Date.now(),
    start = end - (days - 1) * 86400000;
  const keys = Array.from({ length: days }, (_, i) =>
    day(start + i * 86400000),
  );
  const since = new Date(keys[0] + "T00:00:00+08:00").toISOString();
  const attempts = store.db
    .prepare(
      "SELECT user_id,data FROM attempts WHERE json_extract(data,'$.createdAt')>=?",
    )
    .all(since)
    .map((r) => ({ ...JSON.parse(r.data), userId: r.user_id }));
  const users = store.db
    .prepare("SELECT created_at FROM users WHERE created_at>=?")
    .all(since);
  const usage = store.db
    .prepare(
      "SELECT data FROM user_usage WHERE json_extract(data,'$.createdAt')>=?",
    )
    .all(since)
    .map((r) => JSON.parse(r.data));
  const stat = store.adminStats();
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
      attempts: attempts.filter((a) => day(a.createdAt) === date).length,
      newUsers: users.filter((u) => day(u.created_at) === date).length,
      active: new Set(
        attempts.filter((a) => day(a.createdAt) === date).map((a) => a.userId),
      ).size,
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
  return {
    configured: !!(settings?.apiKey || settings?.keyCipher),
    model: settings?.model || "",
    baseUrl: settings?.baseUrl || "",
    source: process.env.AI_SERVICE_API_KEY
      ? "AI_SERVICE 环境配置"
      : process.env.AUTHOR_API_KEY
        ? "AUTHOR 环境配置"
        : "管理员加密配置",
    readOnly: !!(process.env.AI_SERVICE_API_KEY || process.env.AUTHOR_API_KEY),
  };
}
export const contentRevision = (store) =>
  digest(store.allQ(true).filter((q) => q.source !== "ai_generated"));
