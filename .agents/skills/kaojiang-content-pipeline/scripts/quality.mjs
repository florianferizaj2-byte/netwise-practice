import crypto from "node:crypto";
import { batchSchema, sourcesSchema, provenanceSchema, reviewsSchema, blueprintSchema } from "./contracts.mjs";

export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.keys(value).sort().map((k) => [k, stable(value[k])]),
  );
  return value;
}
export const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
// Preserve mathematical operators, decimal points, IP separators and negation.
export const normalize = (value = "") => String(value).normalize("NFKC").toLowerCase()
  .replace(/[\s，,。？?！!、：:；;“”‘’"'「」【】]/g, "");
export function contentKey(q) {
  return JSON.stringify([q.type, normalize(q.sharedStem), normalize(q.question),
    Object.values(q.options || {}).map(normalize).sort()]);
}
export const answerText = (q) => q.type === "short_answer" ? normalize(q.expectedAnswer) :
  (q.answer || []).map((k) => normalize(q.options?.[k])).sort().join("\u0000");
export function payload(q) {
  const { id, provenance, sourceVerification, ...raw } = q;
  return raw;
}
export function sameLoaded(q, loaded, batch) {
  return loaded?.source === batch.bank.source && loaded.certificates?.includes(batch.certificateId) &&
    digest(Object.fromEntries(Object.keys(q).map((k) => [k, loaded[k]]))) === digest(q);
}
function classification(certificate) {
  // questionCount is derived, not a change to the meaning of a knowledge node.
  const taxonomy = certificate?.taxonomy ? JSON.parse(JSON.stringify(certificate.taxonomy,
    (key, value) => key === "questionCount" ? undefined : value)) : null;
  return { taxonomy, syllabus: certificate?.syllabus || null };
}
export function reviewDigest(q, provenance, sources, certificate) {
  return digest({ question: q, provenance, sources: sources.filter((s) => provenance?.sourceIds?.includes(s.id))
    .sort((a, b) => a.id.localeCompare(b.id)), classification: classification(certificate) });
}
const grams = (text) => new Set(Array.from({ length: Math.max(0, text.length - 1) }, (_, i) => text.slice(i, i + 2)));
const jaccard = (a, b) => {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return a.size + b.size - n ? n / (a.size + b.size - n) : 0;
};
const features = (q) => {
  const stem = normalize(`${q.sharedStem || ""}\n${q.question}`);
  return { q, stem, exact: contentKey(q), numeric: stem.replace(/\d+(?:\.\d+)*/g, "#"),
    sg: grams(stem), og: grams(Object.values(q.options || {}).map(normalize).sort().join("\u0000")) };
};
export function duplicates(candidates, existing, skip = () => false) {
  const docs = existing.map(features), pairs = [];
  for (const q of candidates) {
    const a = features(q);
    for (const b of docs) {
      if (skip(q, b.q)) continue;
      const score = 0.65 * jaccard(a.sg, b.sg) + 0.35 * jaccard(a.og, b.og);
      let kind;
      if (q.id === b.q.id) kind = "id_collision";
      else if (a.exact === b.exact) kind = answerText(q) === answerText(b.q) ? "exact" : "answer_conflict";
      else if (a.stem === b.stem) kind = "same_stem";
      else if (a.numeric === b.numeric) kind = "number_only_variant";
      else if (score >= 0.9) kind = "high_similarity";
      else if (score >= 0.78) kind = "review_similarity";
      if (kind) pairs.push({ questionId: q.id, otherId: b.q.id, otherDigest: digest(b.q), kind,
        score: Math.round(score * 1000) / 1000, blocking: kind !== "review_similarity" });
    }
    docs.push(a);
  }
  return pairs;
}

export function allocate(weights, total) {
  if (!Number.isInteger(total) || total < 1 || !weights.length || weights.some((w) => !Number.isFinite(w) || w < 0))
    throw new Error("invalid allocation input");
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) throw new Error("zero weight total");
  const ideals = weights.map((w) => w * total / sum), counts = ideals.map(Math.floor);
  const order = counts.map((_, i) => i).sort((a, b) => (ideals[b] - counts[b]) - (ideals[a] - counts[a]) || a - b);
  for (let i = 0, n = total - counts.reduce((a, b) => a + b, 0); i < n; i++) counts[order[i]]++;
  return counts;
}
function unique(items, key, label, fail) {
  const seen = new Set();
  for (const item of items) { const k = key(item); if (seen.has(k)) fail(`${label}: ${k}`); seen.add(k); }
}
export function calculateBlueprint(input, sources, now = new Date()) {
  const p = blueprintSchema.parse(input), evidence = sourcesSchema.parse(sources);
  const errors = [], fail = (s) => errors.push(s);
  unique(p.modules, (m) => m.id, "duplicate module ID", fail);
  unique(p.modules, (m) => normalize(m.name), "duplicate module name", fail);
  const moduleIds = new Set(p.modules.map((m) => m.id));
  const opened = (id, kind, official = false) => evidence.some((s) => s.id === id && s.access === "opened" &&
    (!official || ["official", "official_mirror"].includes(s.authority)) &&
    s.examVersion === p.syllabusVersion && +new Date(s.checkedAt) <= +now && s.claims.some((c) => c.kind === kind));
  for (const id of p.sourceIds) if (!opened(id, p.basis === "official" ? "weights" : "scope", p.basis === "official"))
    fail(`missing opened ${p.basis} evidence: ${id}`);
  let weights = p.modules.map((m) => m.weight);
  if (p.basis === "past_papers") {
    if (!p.papers.length) fail("past-paper estimate needs complete, deduplicated papers");
    unique(p.papers, (x) => x.id, "duplicate paper ID", fail);
    unique(p.papers, (x) => digest(x.questions.map((q) => q.contentHash).sort()), "duplicate paper content across sources", fail);
    weights = p.modules.map(() => 0);
    let sampleWeight = 0;
    for (const paper of p.papers) {
      if (paper.syllabusVersion !== p.syllabusVersion) fail(`paper version mismatch: ${paper.id}`);
      if (!opened(paper.sourceId, "question")) fail(`paper has no opened question evidence: ${paper.id}`);
      unique(paper.questions, (q) => q.sourceQuestionId, `duplicate source question in ${paper.id}`, fail);
      unique(paper.questions, (q) => q.contentHash, `duplicate question content in ${paper.id}`, fail);
      const total = paper.questions.reduce((s, q) => s + q.points, 0);
      if (Math.abs(total - paper.totalPoints) > 1e-6) fail(`incomplete score mapping: ${paper.id}`);
      for (const q of paper.questions) if (!moduleIds.has(q.moduleId)) fail(`unknown module in ${paper.id}: ${q.moduleId}`);
      p.modules.forEach((m, i) => { weights[i] += paper.sampleWeight * 100 *
        paper.questions.filter((q) => q.moduleId === m.id).reduce((s, q) => s + q.points, 0) / paper.totalPoints; });
      sampleWeight += paper.sampleWeight;
    }
    weights = weights.map((w) => w / (sampleWeight || 1));
  } else if (weights.some((w) => w === undefined) || Math.abs(weights.reduce((s, w) => s + (w || 0), 0) - 100) > 1e-6)
    fail("declared weights must sum to 100");
  for (const m of p.modules) {
    const k = m.knowledgePoints; if (!k) continue;
    unique(k.points, (x) => x.code, `duplicate knowledge-point code in ${m.id}`, fail);
    if (Math.abs(k.points.reduce((n, x) => n + x.weight, 0) - 100) > 1e-6) fail(`knowledge-point weights must sum to 100 in ${m.id}`);
    for (const id of k.sourceIds) if (!opened(id, k.basis === "platform" ? "scope" : "weights", k.basis === "official"))
      fail(`missing knowledge-point weight evidence: ${m.id}/${id}`);
  }
  if (errors.length) return { ok: false, errors };
  const target = allocate(weights, p.targetQuestionCount), exam = allocate(weights, p.examQuestionCount);
  return { ok: true, certificateId: p.certificateId, syllabusVersion: p.syllabusVersion,
    basis: p.basis, weightType: "platform_practice_blueprint", explanation: p.explanation,
    officialExamFormatImplemented: false, samplePapers: p.papers.length,
    modules: p.modules.map((m, i) => {
      const k = m.knowledgePoints;
      const targets = k && target[i] ? allocate(k.points.map((p) => p.weight), target[i]) : k?.points.map(() => 0);
      const exams = k && exam[i] ? allocate(k.points.map((p) => p.weight), exam[i]) : k?.points.map(() => 0);
      return { ...m, weight: weights[i], targetQuestionCount: target[i], examQuestionCount: exam[i],
        knowledgePointAllocationStatus: k ? "configured" : "not_configured",
        ...(k ? { knowledgePoints: { ...k, points: k.points.map((p, j) => ({ ...p, targetQuestionCount: targets[j], examQuestionCount: exams[j] })) } } : {}) };
    }),
    notes: ["分值比例与题量分配分开使用；此报告不修改 manifest，也不实现新的题型或官方评分。",
      ...(p.basis === "past_papers" ? ["样本估计并非官方权重；样本题须按年度原始题号去重，跨来源重印卷应事先合并。"] : [])] };
}

export function auditBatch(data, adapter, now = new Date()) {
  const errors = [], add = (code, message, questionId) => errors.push({ code, message, ...(questionId ? { questionId } : {}) });
  const parsed = {};
  for (const [key, schema] of Object.entries({ batch: batchSchema, sources: sourcesSchema, provenance: provenanceSchema, reviews: reviewsSchema })) {
    const p = schema.safeParse(data[key]);
    if (!p.success) add("contract", `${key}: ${p.error.message}`); else parsed[key] = p.data;
  }
  if (errors.length) return { ok: false, stage: "blocked", errors, duplicates: [], reviewInputs: [] };
  const { batch, sources, provenance, reviews } = parsed;
  const qs = data.questions, certificate = adapter.certificate;
  if (!Array.isArray(qs) || !qs.length || qs.length > batch.maxQuestions) {
    add("batch_size", `questions must contain 1..${batch.maxQuestions} rows`);
    return { ok: false, stage: "blocked", errors, duplicates: [], reviewInputs: [] };
  }
  unique(qs, (q) => q?.id, "duplicate candidate ID", (s) => add("duplicate_id", s));
  unique(sources, (s) => s.id, "duplicate source ID", (s) => add("source", s));
  unique(provenance, (p) => p.questionId, "duplicate provenance", (s) => add("provenance", s));
  unique(reviews, (r) => r.questionId, "duplicate review", (s) => add("review", s));
  if (!certificate?.taxonomy) add("taxonomy", "three-level taxonomy required; stage manifest.proposed.json first");
  if (certificate?.id !== batch.certificateId) add("certificate", "certificate context mismatch");
  if (certificate?.syllabus?.version && certificate.syllabus.version !== batch.examVersion)
    add("version", "batch examVersion must match the effective syllabus version");
  if (data.blueprint) {
    try {
      const plan = calculateBlueprint(data.blueprint, sources, now);
      if (!plan.ok) add("blueprint", plan.errors.join("; "));
      else if (plan.certificateId !== batch.certificateId || plan.syllabusVersion !== batch.examVersion)
        add("blueprint", "blueprint certificate/version mismatch");
      else {
        if (plan.modules.length !== certificate?.syllabus?.modules?.length) add("blueprint", "all syllabus modules must be represented");
        for (const module of plan.modules) {
          const actual = certificate?.syllabus?.modules?.find((m) => m.id === module.id && m.name === module.name);
          if (!actual || Math.abs(actual.weight - module.weight) > 1e-6 || actual.targetQuestionCount !== module.targetQuestionCount)
            add("blueprint", `proposed/effective manifest differs from computed allocation: ${module.id}`);
          for (const point of module.knowledgePoints?.points || []) {
            const leaves = certificate?.taxonomy?.modules?.find((m) => m.name === module.name)?.sections.flatMap((s) => s.knowledgePoints) || [];
            if (!leaves.some((p) => p.code === point.code && p.name === point.name)) add("blueprint", `unknown knowledge point: ${module.id}/${point.code}`);
          }
        }
      }
    } catch (e) { add("blueprint", e.message); }
  }
  if (!sources.some((s) => ["official", "official_mirror"].includes(s.authority) && s.access === "opened" &&
    s.claims.some((c) => c.kind === "scope"))) add("scope", "opened official scope evidence required");
  const relevantIds = new Set(qs.map((q) => q?.id));
  for (const p of provenance) if (!relevantIds.has(p.questionId)) add("provenance", `unknown question: ${p.questionId}`);
  for (const r of reviews) if (!relevantIds.has(r.questionId)) add("review", `unknown question: ${r.questionId}`);
  let index;
  try { if (certificate?.taxonomy) index = adapter.createTaxonomyIndex(certificate.taxonomy); }
  catch (e) { add("taxonomy", e.message); }
  const valid = [], reviewInputs = [], integrated = [];
  for (const q of qs) {
    if (!q || typeof q !== "object" || Array.isArray(q)) { add("schema", "question must be an object"); continue; }
    const id = q.id;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id || "")) add("schema", "invalid question ID", id);
    if (["source", "sourceLabel", "certificates", "provenance", "sourceVerification"].some((k) => k in q))
      add("schema", "candidate metadata belongs in manifest/sidecars, not the question payload", id);
    try {
      adapter.questionSchema.parse(payload(q));
      if (index) adapter.assertQuestionTaxonomy(q, index);
      if (certificate?.syllabus?.modules?.length && !certificate.syllabus.modules.some((m) => m.name === q.chapter))
        throw new Error("chapter outside syllabus");
      if (/TODO|待补充|待核实|略。?$/.test(`${q.question}\n${q.analysis}`)) throw new Error("unfinished question or analysis");
      if (q.type === "true_false" && (q.options.A !== "正确" || q.options.B !== "错误")) throw new Error("true/false options must be 正确 / 错误");
      if (/如下图|见图|下表/.test(q.question) && !q.images?.length && !q.sharedStem) throw new Error("missing referenced figure/table");
      if (q.type !== "short_answer") adapter.verifyCalculation(q);
      if (adapter.checkImages) adapter.checkImages(q);
      valid.push(q);
    } catch (e) { add("question", e.message, id); }
    const p = provenance.find((x) => x.questionId === id), r = reviews.find((x) => x.questionId === id);
    if (!p) { add("provenance", "per-question provenance required", id); continue; }
    const used = sources.filter((s) => p.sourceIds.includes(s.id));
    if (!used.some((s) => ["official", "official_mirror"].includes(s.authority) && s.examVersion === batch.examVersion &&
      s.access === "opened" && s.claims.some((c) => c.kind === "scope"))) add("scope", "question needs version-matched official scope evidence", id);
    if (new Set(p.sourceIds).size !== p.sourceIds.length || used.length !== p.sourceIds.length) add("source", "missing or repeated source reference", id);
    for (const s of used) {
      const checked = +new Date(s.checkedAt), created = +new Date(batch.createdAt.slice(0, 10));
      if (s.access !== "opened" || checked > +now || checked < created - 7 * 86400000) add("source", `source not freshly opened: ${s.id}`, id);
    }
    if (p.category !== batch.bank.category || p.category === "unverified_collection") add("source", "source category is unresolved or differs from batch", id);
    if (p.reuse === "link_only") add("reuse", "link-only evidence cannot be exported as a copied question", id);
    if (p.reuse === "original" && p.category !== "syllabus_practice") add("source", "original questions must be labeled syllabus_practice", id);
    if (["official_sample", "verified_past_exam"].includes(p.category) && (!p.sourceQuestionId ||
      !used.some((s) => ["official", "official_mirror", "publisher"].includes(s.authority) && s.claims.some((c) => c.kind === "question"))))
      add("source", "verified sample/past exam needs a source question number and supporting original publication", id);
    const hash = reviewDigest(q, p, sources, certificate);
    reviewInputs.push({ questionId: id, digest: hash });
    if (!r || r.verdict !== "pass" || r.digest !== hash || r.reviewerContext === batch.authorContext) add("review", "missing, stale, rejected or non-independent review", id);
    else if (q.type === "short_answer" ? normalize(r.independentExpectedAnswer) !== normalize(q.expectedAnswer) :
      JSON.stringify([...(r.independentAnswer || [])].sort()) !== JSON.stringify([...(q.answer || [])].sort())) add("answer", "independent answer disagrees", id);
    const loaded = adapter.existing.find((x) => x.id === id);
    if (sameLoaded(q, loaded, batch)) integrated.push(id);
  }
  const groups = Map.groupBy(valid.filter((q) => q.sharedGroupId), (q) => q.sharedGroupId);
  for (const [id, members] of groups) {
    const expected = provenance.filter((p) => members.some((q) => q.id === p.questionId)).map((p) => p.groupQuestionCount);
    const orders = members.map((q) => q.sharedOrder).sort((a, b) => a - b);
    if (expected.some((n) => n !== members.length) || orders.some((n, i) => n !== i + 1)) add("shared_group", `incomplete group or order: ${id}`);
  }
  const matches = duplicates(valid, adapter.existing, (q, old) => q.id === old.id && sameLoaded(q, old, batch));
  for (const m of matches) {
    const review = reviews.find((r) => r.questionId === m.questionId);
    const resolved = review?.duplicates.some((d) => d.otherId === m.otherId && d.otherDigest === m.otherDigest && d.decision === "distinct");
    if (m.blocking || !resolved) add("duplicate", `${m.kind}: ${m.otherId} (${m.score})`, m.questionId);
  }
  return { ok: !errors.length, stage: errors.length ? "blocked" : integrated.length === qs.length ? "integrated" : "reviewed",
    count: qs.length, integrated, errors, duplicates: matches, reviewInputs,
    limitations: ["独立上下文、引用内容真实性、推导与实质语义差异须由实际复核过程保证；此工具不证明专家认证。"] };
}
