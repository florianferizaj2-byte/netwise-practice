import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  bundledQuestions, certificates, validateManifest,
} from "../server/question-banks/loader.js";
import { buildKnowledgeCoverage } from "../server/question-banks/knowledge-coverage.js";
import { digest, classification } from "../server/content-quality/quality.js";
import { managedReportPath } from "../server/content-quality/managed-report.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const flags = { batches: [], excluded: [] };
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (["--json", "--check"].includes(arg)) flags[arg.slice(2)] = true;
  else if (["--certificate", "--exclude-certificate", "--out", "--catalog", "--reviewed-batch"].includes(arg)) {
    const value = args[++i];
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
    if (arg === "--reviewed-batch") flags.batches.push(path.resolve(root, value));
    else if (arg === "--exclude-certificate") flags.excluded.push(value);
    else {
      if (flags[arg.slice(2)]) throw new Error(`duplicate flag: ${arg}`);
      flags[arg.slice(2)] = value;
    }
  } else throw new Error(`unknown argument: ${arg}`);
}
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
const catalogue = new Map(certificates.map((c) => [c.id, c]));
if (flags.catalog) {
  const directory = path.resolve(root, flags.catalog);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(directory, entry.name, "manifest.json");
    if (!fs.existsSync(file)) continue;
    const manifest = read(file);
    if (!catalogue.has(manifest.certificate?.id)) throw new Error(`unknown proposed certificate: ${file}`);
    validateManifest(manifest, path.join(root, "server/question-banks", entry.name));
    catalogue.set(manifest.certificate.id, { ...manifest.certificate,
      syllabus: manifest.syllabus || null, taxonomy: manifest.taxonomy || null });
  }
}
for (const id of flags.excluded)
  if (!catalogue.has(id)) throw new Error(`unknown excluded certificate: ${id}`);
const chosen = [...catalogue.values()].filter((c) =>
  (!flags.certificate || c.id === flags.certificate) && !flags.excluded.includes(c.id));
if (!chosen.length) throw new Error(`unknown certificate: ${flags.certificate}`);
const questions = bundledQuestions();
const reviewedByCertificate = new Map();
const reviewChecks = [];
// Use exactly the same context as the review digest. Only derived taxonomy
// questionCount is ignored; examBlueprint.questionCount is meaningful.
const scopeDigest = (c) => digest(classification(c));
for (const batch of flags.batches) {
  const input = read(path.join(batch, "batch.json"));
  const target = catalogue.get(input.certificateId);
  const active = certificates.find((c) => c.id === input.certificateId);
  if (!target || !active || scopeDigest(target) !== scopeDigest(active)) {
    reviewChecks.push({ batch, ok: false, error: "proposed taxonomy is not the current integrated taxonomy" });
    continue;
  }
  const proposedFile = path.join(batch, "manifest.proposed.json");
  if (fs.existsSync(proposedFile)) {
    const proposed = read(proposedFile);
    const effective = { taxonomy: proposed.taxonomy || null, syllabus: proposed.syllabus || null };
    if (proposed.certificate?.id !== input.certificateId || scopeDigest(effective) !== scopeDigest(active)) {
      reviewChecks.push({ batch, ok: false, error: "batch was reviewed against an unintegrated or different proposed directory" });
      continue;
    }
  }
  const result = spawnSync(process.execPath, [
    path.join(root, ".agents/skills/kaojiang-content-pipeline/scripts/pipeline.mjs"),
    "check", "--batch", batch,
  ], { cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024 });
  const file = path.join(batch, "quality-report.json");
  const audit = fs.existsSync(file) ? read(file) : null;
  if (result.status !== 0 || !audit?.ok || audit.stage !== "integrated") {
    reviewChecks.push({ batch, ok: false, exitCode: result.status,
      error: result.error?.message || audit?.errors || result.stderr || "review check failed" });
    continue;
  }
  const ids = reviewedByCertificate.get(input.certificateId) || new Set();
  const inputs = new Map(audit.reviewInputs.map((item) => [item.questionId, item.digest]));
  const accepted = audit.integrated.filter((id) => {
    const q = questions.find((row) => row.id === id && row.certificates.includes(input.certificateId));
    return q && q.provenance?.reviewDigest === inputs.get(id);
  });
  for (const id of accepted) ids.add(id);
  reviewedByCertificate.set(input.certificateId, ids);
  reviewChecks.push({ batch, ok: accepted.length === audit.count, verifiedQuestions: accepted.length });
}
const reports = chosen.map((certificate) => buildKnowledgeCoverage(certificate, questions, {
  reviewedQuestionIds: reviewedByCertificate.get(certificate.id) || new Set(),
}));
const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  directory: flags.catalog ? "proposed" : "runtime",
  minimumQuestionsPerLeaf: 30,
  excludedCertificates: [...new Set(flags.excluded)],
  allMinimumsMet: reports.every((r) => r.minimumMet),
  allReviewedMinimumsMet: reports.every((r) => r.reviewedMinimumMet) && reviewChecks.every((r) => r.ok),
  reviewChecks,
  certificates: reports,
};
if (flags.out) {
  const target = managedReportPath(root, flags.out);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(output, null, 2) + "\n", { flag: "wx" });
  fs.renameSync(temporary, target);
}
if (flags.json) console.log(JSON.stringify(output, null, 2));
else {
  console.log("最小知识点覆盖：每叶至少 30 道（本站内容质量目标，不是考试占比）");
  if (flags.excluded.length) console.log(`本次明确排除：${[...new Set(flags.excluded)].join("、")}`);
  for (const r of reports) {
    console.log(`${r.certificateName}: ${r.leafCount} 叶，零题 ${r.zeroQuestionLeaves}，不足30题 ${r.underMinimumLeaves}，题量缺口 ${r.missingQuestions}，已验证复核 ${r.reviewedQuestionCount}`);
    if (r.taxonomyMissing) console.log("  阻断：缺少三级目录，不能将旧式粗分类当作最小知识点。");
    if (r.unmapped.length) console.log(`  待分类 ${r.unmapped.length} 题（不记入任意叶节点）。`);
  }
  if (!flags.batches.length) console.log("未提供当前独立复核批次；本报告不将已加载题量等同于已审核合格题量。");
  if (flags.out) console.log(`报告：${path.resolve(root, flags.out)}`);
}
if (flags.check && !output.allReviewedMinimumsMet) process.exitCode = 1;
