import crypto from "node:crypto";

export const learningStrategies = [
  { id: "weakness", title: "攻克不会的", description: "先补短板，再做变式", icon: "target" },
  { id: "challenge", title: "挑战更难的", description: "在已掌握基础上进阶", icon: "chart" },
  { id: "review", title: "巩固易忘的", description: "把答对的真正记牢", icon: "refresh" },
  { id: "balanced", title: "综合提分", description: "补弱项，也保住强项", icon: "exam" },
];
const keyOf = q => [q.chapter || "", q.knowledgeSection || "", q.targetKnowledgePoint || q.knowledgePoint || ""].join("\u001f");
const digest = value => crypto.createHash("sha256").update(value).digest("hex");
const ageDays = (date, now) => Math.max(0, (now - Date.parse(date)) / 86400000);

// Distinct latest question outcomes prevent memorising one repeated question from
// masquerading as mastery. Repeated wrong attempts remain a separate evidence signal.
export function learningProfile(questions, attempts, certificateId, now = Date.now()) {
  const eligible = questions.filter(q => ["single_choice", "multiple_choice", "true_false"].includes(q.type));
  const byId = new Map(eligible.map(q => [q.id, q]));
  const groups = new Map();
  for (const q of eligible) {
    if (!q.knowledgePoint && !q.targetKnowledgePoint) continue;
    const key = keyOf(q);
    if (!groups.has(key)) groups.set(key, {
      id: digest(certificateId + ":" + key).slice(0, 24),
      chapter: q.chapter, knowledgeSection: q.knowledgeSection || "",
      knowledgePoint: q.targetKnowledgePoint || q.knowledgePoint,
      seedId: q.id, attempts: [], questionCount: 0,
    });
    const group = groups.get(key);
    group.questionCount++;
    if (q.source !== "ai_generated") group.seedId = q.id;
  }
  const ambiguousRecords = attempts.filter(a => byId.has(a.questionId) && !a.certificateId && byId.get(a.questionId).certificates?.length > 1).length;
  const scoped = attempts.filter(a => byId.has(a.questionId) && (!a.certificateId || a.certificateId === certificateId) &&
      (a.certificateId || !(byId.get(a.questionId).certificates?.length > 1)) &&
      Number.isFinite(Date.parse(a.createdAt)) && Date.parse(a.createdAt) <= now)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  for (const a of scoped) groups.get(keyOf(byId.get(a.questionId)))?.attempts.push(a);
  const recent = scoped.filter(a => ageDays(a.createdAt, now) <= 30);
  const latestRecent = new Map(recent.map(a => [a.questionId, a]));
  const points = [...groups.values()].map(({ attempts: rows, ...group }) => {
    const unique = [...new Map(rows.map(a => [a.questionId, a])).values()].sort((a,b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    const last = unique.slice(-10);
    const correct = unique.filter(a => a.correct).length;
    const accuracy = last.length ? last.filter(a => a.correct).length / last.length : null;
    const lastAt = rows.at(-1)?.createdAt || null;
    const wrongAttempts = rows.slice(-20).filter(a => !a.correct).length;
    const confidence = unique.length >= 10 ? "high" : unique.length >= 5 ? "medium" : "low";
    return {
      ...group, distinctAnswered: unique.length, correct, wrong: unique.length - correct,
      recentCount: last.length, recentWrong: last.filter(a => !a.correct).length,
      recentAccuracy: accuracy, wrongAttempts, lastPracticedAt: lastAt,
      daysSince: lastAt ? Math.floor(ageDays(lastAt, now)) : null,
      confidence, stable: unique.length >= 5 && last.length >= 5 && accuracy >= 0.85,
    };
  });
  const answered = latestRecent.size, correct = [...latestRecent.values()].filter(a => a.correct).length;
  return {
    certificateId, windowDays: 30, asOf: new Date(now).toISOString(),
    revision: digest(JSON.stringify([certificateId, scoped.length, scoped.at(-1)?.id, points.map(p => [p.id,p.distinctAnswered,p.wrong])])).slice(0, 24),
    stats: { answered, correct, wrong: answered - correct, accuracy: answered ? Math.round(correct / answered * 100) : null,
      attemptCount: recent.length, distinctLifetime: new Set(scoped.map(a => a.questionId)).size, ambiguousRecords },
    confidence: scoped.length && points.some(p => p.confidence !== "low") ? "supported" : "insufficient",
    strategies: learningStrategies,
    points: points.sort((a,b) => b.wrong - a.wrong || b.distinctAnswered - a.distinctAnswered || a.id.localeCompare(b.id)),
  };
}

export function learningBlueprint(profile, { strategy = "weakness", count = 10, kind = "practice", pointIds = [] } = {}) {
  let pool = profile.points.filter(p => !pointIds.length || pointIds.includes(p.id));
  if (!pool.length) throw Object.assign(new Error("所选范围暂无可供参考的客观题知识点"), { status: 400 });
  const preferred = strategy === "challenge" ? pool.filter(p => p.stable)
    : strategy === "review" ? pool.filter(p => p.correct > 0) : pool;
  const diagnostic = profile.confidence === "insufficient" || !preferred.length || !preferred.some(p => p.confidence !== "low");
  if (preferred.length) pool = preferred;
  const rank = p => strategy === "challenge" ? p.distinctAnswered + (p.recentAccuracy || 0) * 10
    : strategy === "review" ? (p.daysSince || 0) + p.wrong * 2
    : strategy === "balanced" ? p.wrong * 3 + (p.daysSince || 0) / 7
    : p.wrong * 5 + p.recentWrong * 2 + Math.min(5, p.wrongAttempts);
  pool.sort((a,b) => rank(b) - rank(a) || a.distinctAnswered - b.distinctAnswered || a.id.localeCompare(b.id));
  // A bounded, explicit selection. No invented official exam weights.
  const chosen = pool.slice(0, pointIds.length ? Math.min(pointIds.length, count) : Math.min(4, count));
  const slots = Array.from({ length: count }, (_, index) => {
    const point = chosen[index % chosen.length];
    const ratio = index / count;
    const uncertain = diagnostic || point.confidence === "low";
    const stage = uncertain ? "诊断理解" : strategy === "weakness"
      ? ratio < 0.3 ? "补基础" : ratio < 0.8 ? "做变式" : "迁移验证"
      : strategy === "challenge" ? "综合进阶" : strategy === "review" ? "间隔巩固" : ratio < 0.6 ? "补弱项" : "覆盖验证";
    const difficulty = uncertain ? (ratio < 0.6 ? "easy" : "medium")
      : strategy === "challenge" ? (ratio < 0.3 ? "medium" : "hard")
      : strategy === "weakness" ? (ratio < 0.3 ? "easy" : ratio < 0.8 ? "medium" : "hard")
      : strategy === "review" ? "medium" : ratio < 0.3 ? "easy" : ratio < 0.8 ? "medium" : "hard";
    return { position: index + 1, pointId: point.id, seedId: point.seedId, chapter: point.chapter,
      knowledgeSection: point.knowledgeSection, knowledgePoint: point.knowledgePoint, stage, difficulty };
  });
  return {
    version: 1, profileRevision: profile.revision, kind, strategy, targetCount: count, diagnostic,
    weightBasis: "本站个性化训练配比，非官方考试占比",
    notice: diagnostic ? "作答样本不足以判断稳定掌握，本次先用基础与中等难度诊断。" : chosen.some(p => p.confidence === "low") ? "部分知识点样本不足，对应题目先做诊断；其他知识点按已有证据训练。" : "根据不同题目的实际作答记录推荐；答对一次不等于掌握。",
    reasons: chosen.map(p => ({
      pointId: p.id, chapter: p.chapter, knowledgePoint: p.knowledgePoint, confidence: p.confidence,
      evidence: p.recentCount ? "最近 " + p.recentCount + " 道不同题目，答错 " + p.recentWrong + " 道"
        + (p.daysSince !== null ? "；距上次练习 " + p.daysSince + " 天" : "") : "暂无作答记录，先做诊断",
    })), slots,
  };
}
