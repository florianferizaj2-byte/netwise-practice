// Apply a reviewed context-only release to an existing LOCAL database. Startup
// performs the same content and withdrawal synchronization for deployed copies.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, backup } from "node:sqlite";
import { bundledQuestions } from "../server/question-banks/loader.js";
import { syncBundledQuestionWithdrawals } from "../server/store.js";
import { fingerprint } from "../server/domain.js";
import { digest } from "../server/content-quality/quality.js";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--data-dir")
  throw new Error("Usage: node scripts/sync-veterinary-context.mjs --data-dir <local DATA_DIR>");
const directory = path.resolve(args[1]), file = path.join(directory, "netwise.sqlite");
if (!fs.existsSync(file)) throw new Error("Existing database required; this command never creates or resets a database");
const report = JSON.parse(fs.readFileSync(new URL("../server/question-banks/veterinary-practitioner/reports/context-repair-20261021.json", import.meta.url), "utf8"));
const changes = new Map(report.restored.map((entry) => [entry.questionId, entry]));
const questions = bundledQuestions().filter((q) => changes.has(q.id));
const db = new DatabaseSync(file);
db.exec("PRAGMA busy_timeout=5000");
const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
const needsVisibilityTable = !tables.has("admin_question_visibility");
const identity = (q) => ({ type: q.type, options: q.options, answer: q.answer, analysis: q.analysis });
const normalize = (value) => String(value || "").replace(/\s+/g, "")
  .replace(/^题共用(?:题干|备选答案)\)/, "").replace(/^[。]+|[。]+$/g, "");
const childQuestion = (q) => {
  const text = normalize(q.question), stem = normalize(q.sharedStem);
  return stem && text.startsWith(stem) ? normalize(text.slice(stem.length)) : text;
};
const historyCounts = () => Object.fromEntries(["attempts", "question_favorites", "sessions", "question_tombstones"].filter((name) => tables.has(name)).map((name) => [name, db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get().n]));
const before = historyCounts();
const backupDirectory = path.resolve("tmp/veterinary-context-repair-20261021/database-backups");
fs.mkdirSync(backupDirectory, { recursive: true });
const backupFile = path.join(backupDirectory, `netwise-before-${Date.now()}.sqlite`);
await backup(db, backupFile);
let updated = 0, absent = 0;
try {
  db.exec("BEGIN IMMEDIATE");
  if (needsVisibilityTable)
    db.exec(`CREATE TABLE admin_question_visibility (
      question_id TEXT PRIMARY KEY, hidden INTEGER NOT NULL DEFAULT 0, reason TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL, updated_at TEXT NOT NULL);`);
  const get = db.prepare("SELECT data FROM questions WHERE id=?"),
    update = db.prepare("UPDATE questions SET fingerprint=?,data=? WHERE id=?");
  for (const q of questions) {
    const row = get.get(q.id);
    if (!row) { absent += 1; continue; }
    const old = JSON.parse(row.data);
    const reviewed = changes.get(q.id);
    const sameQuestion = normalize(old.question) === normalize(reviewed.baselineQuestion) ||
      childQuestion(old) === normalize(reviewed.baselineQuestion) ||
      normalize(old.question) === normalize(q.question);
    if (old.source === "ai_generated" || old.certificates?.length !== 1 || old.certificates[0] !== "veterinary-practitioner" ||
        digest(identity(old)) !== reviewed.baselineIdentityDigest || !sameQuestion)
      throw new Error(`Question was edited outside this context-only release; refusing to overwrite: ${q.id}`);
    if (JSON.stringify(old) !== JSON.stringify(q)) {
      update.run(fingerprint(q), JSON.stringify(q), q.id);
      updated += 1;
    }
  }
  const withdrawn = syncBundledQuestionWithdrawals(db);
  const after = historyCounts();
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error("Learning history changed unexpectedly; rolling back");
  db.exec("COMMIT");
  console.log(JSON.stringify({ ok: true, database: file, backup: backupFile, updated, notYetSeeded: absent, withdrawn, visibilityTableCreated: needsVisibilityTable, historyBefore: before, historyAfter: after, note: "Restart an already-running server to reload its in-memory question cache." }, null, 2));
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
} finally {
  db.close();
}
