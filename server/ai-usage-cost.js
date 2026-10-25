const rate = (value) =>
  value !== undefined &&
  String(value).trim() !== "" &&
  Number.isFinite(Number(value)) &&
  Number(value) >= 0
    ? Number(value)
    : null;

// Explicit operator prices, tied to a model; never infer a provider's current price.
export function usageCost(usage, model, env = process.env) {
  const input = rate(env.AI_USAGE_INPUT_CNY_PER_MILLION),
    output = rate(env.AI_USAGE_OUTPUT_CNY_PER_MILLION),
    cached = rate(env.AI_USAGE_CACHED_INPUT_CNY_PER_MILLION);
  const hits = usage.cached_prompt_tokens || 0;
  if (
    !usage.hasUsage ||
    env.AI_USAGE_PRICING_MODEL !== model ||
    input === null ||
    output === null ||
    (hits > 0 && cached === null)
  )
    return { estimatedCostCny: null };
  return {
    estimatedCostCny:
      ((usage.prompt_tokens - hits) * input +
        hits * (cached ?? input) +
        usage.completion_tokens * output) /
      1000000,
    pricing: { model, input, output, cached },
  };
}

export function cachedPromptTokens(raw) {
  const value =
    raw?.prompt_cache_hit_tokens ?? raw?.prompt_tokens_details?.cached_tokens;
  return Number.isSafeInteger(value) && value >= 0 && value <= raw.prompt_tokens
    ? value
    : 0;
}

export function tutorAiUsage(store, userId, certificateId, sessionId) {
  const rows = store.db
    .prepare(
      `SELECT u.data FROM user_usage u JOIN interactive_tutor_sessions s
    ON s.id=json_extract(u.data,'$.tutorSessionId') AND s.user_id=u.user_id
    WHERE u.user_id=? AND s.certificate_id=? ${sessionId ? "AND s.id=?" : ""}`,
    )
    .all(userId, certificateId, ...(sessionId ? [sessionId] : []))
    .map((r) => JSON.parse(r.data));
  const unknown = rows.filter(
      (r) => !Number.isFinite(r.estimatedCostCny),
    ).length,
    cost = rows.reduce(
      (sum, r) =>
        sum + (Number.isFinite(r.estimatedCostCny) ? r.estimatedCostCny : 0),
      0,
    );
  return {
    aiCalls: rows.length,
    successfulAiCalls: rows.filter((r) => r.success).length,
    promptTokens: rows.reduce((n, r) => n + (r.prompt_tokens || 0), 0),
    completionTokens: rows.reduce((n, r) => n + (r.completion_tokens || 0), 0),
    totalTokens: rows.reduce((n, r) => n + (r.total_tokens || 0), 0),
    cachedPromptTokens: rows.reduce(
      (n, r) => n + (r.cached_prompt_tokens || 0),
      0,
    ),
    unknownUsageCalls: rows.filter((r) => !r.hasUsage).length,
    unknownCostCalls: unknown,
    knownCostCny: cost,
    costCny: unknown ? null : cost,
  };
}
