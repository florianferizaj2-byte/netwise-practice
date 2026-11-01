#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { auditBatch, calculateBlueprint, digest } from "./quality.mjs";

const argv = process.argv.slice(2), command = argv.shift() || "help";
const flags = new Map();
for (let i = 0; i < argv.length; i++) {
  if (!/^--[a-z-]+$/.test(argv[i]) || flags.has(argv[i])) throw new Error(`invalid argument: ${argv[i]}`);
  flags.set(argv[i], argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true);
}
const allowed = new Set(["--root", "--certificate", "--batch", "--out", "--new", "--limit", "--runs"]);
for (const key of flags.keys()) if (!allowed.has(key)) throw new Error(`unknown flag: ${key}`);
const required = (flag) => { const v = flags.get(flag); if (typeof v !== "string") throw new Error(`${flag} requires a value`); return v; };
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
function sourceSnapshot() {
  const files = [];
  function visit(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "reports") continue;
      const file = path.join(dir, e.name);
      if (e.isDirectory()) visit(file);
      else if (/\.(?:json|js)$/.test(e.name)) files.push([path.relative(root, file), digest(fs.readFileSync(file, "utf8"))]);
    }
  }
  visit(path.join(root, "server/question-banks"));
  for (const file of ["server/domain.js", "server/syllabus.js", "server/exams.js"]) files.push([file, digest(fs.readFileSync(path.join(root, file), "utf8"))]);
  return digest(files.sort(([a], [b]) => a.localeCompare(b)));
}
function findRoot(start) {
  let dir = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(dir, "package.json")) && read(path.join(dir, "package.json")).name === "aceexam") return dir;
    const parent = path.dirname(dir); if (parent === dir) throw new Error("run inside AceExam or pass --root <repository>"); dir = parent;
  }
}
const root = flags.has("--root") ? path.resolve(required("--root")) : findRoot(path.dirname(fileURLToPath(import.meta.url)));
if (read(path.join(root, "package.json")).name !== "aceexam" || !fs.existsSync(path.join(root, "server/question-banks/loader.js")))
  throw new Error("not an AceExam repository");
function artifactPath(value) {
  const absolute = path.resolve(root, value);
  let ancestor = absolute, suffix = [];
  while (!fs.existsSync(ancestor)) { suffix.unshift(path.basename(ancestor)); ancestor = path.dirname(ancestor); }
  const actual = path.join(fs.realpathSync(ancestor), ...suffix), rel = path.relative(fs.realpathSync(root), actual);
  if (!rel || (!rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel) && !["tmp", "outputs"].includes(rel.split(path.sep)[0])))
    throw new Error("artifacts inside the repository must be under tmp/ or outputs/; active source paths are forbidden");
  return absolute;
}
function write(file, value, exclusive = false) {
  artifactPath(file); fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", flag: exclusive ? "wx" : "w" });
}
function emit(value, fallback) {
  const dest = flags.has("--out") ? artifactPath(required("--out")) : fallback;
  if (dest) { write(dest, value); console.log(JSON.stringify({ ok: value.ok ?? true, report: dest,
    ...(value.errors ? { errors: value.errors } : {}), ...(value.stage ? { stage: value.stage } : {}) }, null, 2)); }
  else console.log(JSON.stringify(value, null, 2));
  if (value.ok === false) process.exitCode = 1;
}
async function modules() {
  const [loader, domain, taxonomy, syllabus] = await Promise.all([
    "server/question-banks/loader.js", "server/domain.js", "server/question-banks/taxonomy.js", "server/syllabus.js",
  ].map((p) => import(pathToFileURL(path.join(root, p)).href)));
  return { ...loader, ...domain, ...taxonomy, ...syllabus, existing: loader.bundledQuestions() };
}
async function loadBatch() {
  const dir = artifactPath(required("--batch")), names = ["batch", "questions", "sources", "provenance", "reviews", "blueprint"];
  const data = Object.fromEntries(names.map((n) => [n, read(path.join(dir, `${n}.json`))]));
  const adapter = await modules();
  const proposed = path.join(dir, "manifest.proposed.json");
  if (fs.existsSync(proposed)) {
    const manifest = read(proposed);
    if (manifest.schemaVersion !== 1 || manifest.certificate?.id !== data.batch.certificateId) throw new Error("invalid proposed manifest certificate");
    adapter.certificate = { ...manifest.certificate, taxonomy: manifest.taxonomy, syllabus: manifest.syllabus };
  } else adapter.certificate = adapter.certificates.find((c) => c.id === data.batch.certificateId);
  adapter.checkImages = (q) => {
    for (const image of q.images || []) {
      if (!image.src.startsWith("/question-images/")) throw new Error("new images require a reviewed local /question-images/ asset");
      const base = path.join(root, "public/question-images"), local = path.resolve(root, "public", `.${image.src}`);
      const rel = path.relative(base, local);
      if (rel.startsWith("..") || path.isAbsolute(rel) || !fs.existsSync(local) || !fs.statSync(local).isFile()) throw new Error(`missing/unsafe image: ${image.src}`);
    }
  };
  return { dir, data, adapter };
}
async function inspect() {
  const a = await modules();
  let tutor = null, tutorError = null;
  try { tutor = (await import(pathToFileURL(path.join(root, "server/demo-tutor/registry.js")).href)).catalogue(); }
  catch (e) { tutorError = e.message; }
  return { generatedAt: new Date().toISOString(), root, totalUniqueQuestions: a.existing.length,
    certificates: a.certificates.map((c) => {
      const qs = a.existing.filter((q) => q.certificates.includes(c.id)).map((q) => a.questionForCertificate(q, c.id));
      const leaves = c.taxonomy?.modules.flatMap((m) => m.sections.flatMap((s) => s.knowledgePoints.map((p) => ({
        code: p.code, name: p.name, chapter: m.name, section: s.name, scope: p.scope,
        count: qs.filter((q) => q.chapter === m.name && q.knowledgeSection === s.name && q.knowledgePoint === p.name).length,
      })))) || [];
      const modules = c.syllabus?.modules || [], errors = [];
      if (!leaves.length) errors.push("missing_three_level_taxonomy");
      if (!modules.length) errors.push("missing_syllabus_and_weights");
      const objective = qs.filter((q) => q.type !== "short_answer" && q.source !== "ai_generated");
      const target = modules.map((m) => ({ id: m.id, name: m.name, weight: m.weight, target: m.targetQuestionCount,
        actual: qs.filter((q) => q.chapter === m.name).length,
        objective: objective.filter((q) => q.chapter === m.name).length,
        gap: Math.max(0, m.targetQuestionCount - qs.filter((q) => q.chapter === m.name).length) }));
      const curriculum = tutor?.knowledgePoints.filter((n) => n.nodeId.startsWith(`${c.id}:`)) || [];
      const ids = new Set(leaves.map((p) => `${c.id}:${p.code}`));
      const oldIds = new Set(curriculum.map((p) => p.nodeId));
      const mismatch = curriculum.length ? { taxonomyOnly: [...ids].filter((x) => !oldIds.has(x)),
        curriculumOnly: [...oldIds].filter((x) => !ids.has(x)) } : null;
      if (mismatch && (mismatch.taxonomyOnly.length || mismatch.curriculumOnly.length)) errors.push("taxonomy_curriculum_mapping_needs_review");
      return { id: c.id, name: c.name, questions: qs.length, objectiveQuestions: objective.length,
        taxonomyPoints: leaves.length, syllabusVersion: c.syllabus?.version || null,
        weightType: c.syllabus?.weightType || null, sourceUrls: c.syllabus?.sourceUrls || [],
        issues: errors, moduleGaps: target, knowledgePoints: leaves, curriculumMismatch: mismatch,
        examBlueprint: c.syllabus?.examBlueprint || null };
    }), tutor: tutor?.coverage || null, tutorError,
    tutorScope: "reviewed authoring registry; actual API availability also depends on current curriculum versions, published lessons and account access",
    nextActions: ["先核验目标考试的当前版本/范围；目录缺失时先设计兼容迁移。", "按可靠权重和未覆盖知识点选择小批内容，不能拿题库数量推断考试占比。", "互动课缺口以当前完整目录为分母逐批完成。"] };
}
async function runGate(dir, id, args) {
  const log = path.join(dir, `verify-${id}.log`), fd = fs.openSync(log, "w");
  const startedAt = new Date().toISOString(); console.log(`Running ${id}`);
  const start = Date.now();
  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: root, windowsHide: true, stdio: ["ignore", fd, fd] });
    const timer = setTimeout(() => child.kill(), 15 * 60 * 1000);
    const heartbeat = setInterval(() => console.log(`Still running ${id}`), 30000);
    child.once("error", (e) => { clearTimeout(timer); clearInterval(heartbeat); resolve({ exitCode: null, error: e.message }); });
    child.once("close", (exitCode, signal) => { clearTimeout(timer); clearInterval(heartbeat); resolve({ exitCode, signal }); });
  });
  fs.closeSync(fd); return { id, command: [process.execPath, ...args], startedAt, durationMs: Date.now() - start, log, ...result };
}
async function main() {
  if (command === "help") {
    console.log("inspect [--out JSON] | init --certificate ID --batch DIR [--new] [--limit 20] | hash/check/prepare/blueprint/verify --batch DIR | exam-smoke --certificate ID [--runs 10] [--out JSON]. Optional --root REPO. Artifacts under tmp/ or outputs/; no production writes."); return;
  }
  if (command === "inspect") { emit(await inspect()); return; }
  if (command === "init") {
    const a = await modules(), id = required("--certificate"), dir = artifactPath(required("--batch"));
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error("invalid certificate ID");
    const c = a.certificates.find((c) => c.id === id), isNew = flags.get("--new") === true;
    if ((!c && !isNew) || (c && isNew)) throw new Error("use an existing certificate, or --new for an unused certificate ID");
    const maxQuestions = Number(flags.get("--limit") || 20);
    if (!Number.isInteger(maxQuestions) || maxQuestions < 1 || maxQuestions > 50) throw new Error("--limit must be 1..50");
    if (fs.existsSync(dir) && fs.readdirSync(dir).length) throw new Error("batch directory is not empty; resume it instead");
    const runId = `${id}-${new Date().toISOString().replace(/\D/g, "")}`;
    write(path.join(dir, "batch.json"), { schemaVersion: 1, runId, certificateId: id, createdAt: new Date().toISOString(),
      authorContext: "", examVersion: c?.syllabus?.version || "", newCertificate: isNew, maxQuestions,
      bank: { id: runId, source: `curated_${runId}`, name: `${c?.shortName || id} 审核内容批次`, category: "syllabus_practice" } }, true);
    for (const n of ["questions", "sources", "provenance", "reviews"]) write(path.join(dir, `${n}.json`), [], true);
    write(path.join(dir, "blueprint.json"), null, true);
    write(path.join(dir, "inventory.json"), await inspect(), true);
    emit({ ok: true, batch: dir, stage: "draft", next: "Fill actual authorContext/examVersion, evidence, candidates and review records. Empty batches cannot pass." }); return;
  }
  if (command === "exam-smoke") {
    const a = await modules(), id = required("--certificate"), c = a.certificates.find((c) => c.id === id);
    if (!c) throw new Error("unknown certificate");
    const runs = Number(flags.get("--runs") || 10);
    if (!Number.isInteger(runs) || runs < 1 || runs > 100) throw new Error("--runs must be 1..100");
    const pool = a.existing.filter((q) => q.certificates.includes(id) && q.source !== "ai_generated" && q.type !== "short_answer")
      .map((q) => a.questionForCertificate(q, id));
    const requested = c.syllabus?.examBlueprint?.questionCount || Math.min(20, pool.length), results = [], errors = [];
    let seed = 123456789; const randomInt = (max) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
    const groupCounts = Map.groupBy(pool.filter((q) => q.sharedGroupId), (q) => q.sharedGroupId);
    for (let i = 0; i < runs; i++) {
      try {
        const selected = a.sampleExamQuestions(pool, c.syllabus, requested, randomInt), ids = new Set(selected.map((q) => q.id));
        if (!selected.length || selected.length !== requested || ids.size !== selected.length) errors.push(`run ${i}: wrong count or duplicate ID (${selected.length}/${requested})`);
        for (const [group, members] of Map.groupBy(selected.filter((q) => q.sharedGroupId), (q) => q.sharedGroupId))
          if (groupCounts.get(group)?.length !== members.length) errors.push(`run ${i}: incomplete shared case ${group}`);
        const distribution = Object.fromEntries([...new Set(selected.map((q) => q.chapter))].map((name) => [name, selected.filter((q) => q.chapter === name).length]));
        results.push({ run: i, count: selected.length, distribution });
      } catch (e) { errors.push(`run ${i}: ${e.message}`); }
    }
    emit({ ok: !errors.length, certificateId: id, runs, requested, errors, results,
      limitations: ["直接调用实际客观题抽题函数；未覆盖 API、计时、交卷、评分或浏览器。", "题型、分值、时长、知识点比例须另按当前官方规则核验；选择题练习不代表 Office 实操或完整主观题考试。"] }); return;
  }
  if (!["hash", "check", "prepare", "blueprint", "verify"].includes(command)) throw new Error(`unknown command: ${command}`);
  const { dir, data, adapter } = await loadBatch();
  if (command === "blueprint") {
    const report = calculateBlueprint(read(path.join(dir, "blueprint.json")), data.sources);
    if (report.ok && report.certificateId !== data.batch.certificateId) throw new Error("blueprint certificate mismatch");
    emit(report, path.join(dir, "blueprint-report.json")); return;
  }
  const report = auditBatch(data, adapter);
  write(path.join(dir, "quality-report.json"), report);
  if (command === "hash") {
    const errors = report.errors.filter((e) => e.code !== "review" && e.code !== "duplicate");
    emit({ ok: report.reviewInputs.length > 0 && !errors.length, reviewInputs: report.reviewInputs, errors }, path.join(dir, "review-inputs.json")); return;
  }
  if (command === "check" || !report.ok) { emit(report); return; }
  if (command === "prepare") {
    const target = `questions/curated/${data.batch.runId}.json`, pdir = path.join(dir, "prepared");
    const exportQuestions = data.questions.map((q) => ({ ...q,
      provenance: { ...data.provenance.find((p) => p.questionId === q.id), reviewDigest: report.reviewInputs.find((r) => r.questionId === q.id).digest },
      sourceVerification: `${data.batch.bank.category}；已记录逐题来源与复核，非专家认证。` }));
    const bank = { ...data.batch.bank, description: "依据批次公开来源及逐题复核接入", path: target };
    write(path.join(pdir, "questions.json"), exportQuestions);
    write(path.join(pdir, "manifest-bank.json"), bank);
    write(path.join(pdir, "integration.json"), { inputDigest: digest(data), certificateId: data.batch.certificateId,
      target: `server/question-banks/${data.batch.certificateId}/${target}`, bank,
      steps: ["人工检查拟接入文件，将题目复制到 target 并合并 bank（source 不得重复）。", "需要迁移时同步接入审核后的 taxonomy/syllabus/guide，更新派生计数和课程映射。", "保留可公开来源和复核证据到证书 reports，私有原件留在隔离区。", "执行 verify 与 exam-smoke；互动内容另做协议、渲染及浏览器验收。"] });
    emit({ ok: true, stage: "prepared", directory: pdir, activeBankWritten: false }); return;
  }
  if (report.integrated.length !== data.questions.length) { emit({ ok: false, errors: ["reviewed questions are not all loaded from the declared batch bank"] }); return; }
  const npm = [process.env.npm_execpath, path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
    "/usr/share/nodejs/npm/bin/npm-cli.js"].find((p) => p && fs.existsSync(p));
  if (!npm) throw new Error("npm CLI could not be located; run documented project gates explicitly and retain real results");
  const inputs = digest(data), before = sourceSnapshot(), outcomes = [];
  for (const script of ["bank:validate", "test", "build", "test:e2e"]) {
    const result = await runGate(dir, script.replaceAll(":", "-"), [npm, "run", script]); outcomes.push(result);
    write(path.join(dir, "verification.json"), { ok: false, stage: "verifying", inputDigest: inputs, outcomes });
    if (result.exitCode !== 0) break;
  }
  const current = Object.fromEntries(["batch", "questions", "sources", "provenance", "reviews", "blueprint"].map((n) => [n, read(path.join(dir, `${n}.json`))]));
  const diff = spawnSync("git", ["diff", "--check"], { cwd: root, encoding: "utf8", windowsHide: true });
  outcomes.push({ id: "git-diff-check", exitCode: diff.status, output: diff.stdout + diff.stderr });
  const after = sourceSnapshot();
  const ok = outcomes.length === 5 && outcomes.every((r) => r.exitCode === 0) && inputs === digest(current) && before === after;
  emit({ ok, stage: ok ? "verified" : "blocked", inputDigest: inputs, outcomes,
    sourceSnapshotBefore: before, sourceSnapshotAfter: after,
    errors: ok ? [] : ["a required gate failed or batch/repository content changed during verification"],
    deploymentVerified: false, tutorBrowserVerified: false }, path.join(dir, "verification.json"));
}
main().catch((error) => { console.error(JSON.stringify({ ok: false, error: error.message })); process.exitCode = 1; });
