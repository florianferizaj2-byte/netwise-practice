import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 题库重建（如 HCIA 三级知识体系上线）会改变题目的分类标签与知识点 ID。
// 用户的作答记录按 question_id 存储，答案字母不变即可完整保留；
// 但记录里冗余保存的分类标签、以及按知识点哈希生成的 ID 需要同步迁移，
// 否则“错题本按知识点归组”“知识点进度”“按知识点保存的练习”都会查不到历史。
//
// 本模块只迁移分类元数据，绝不修改 selected / correct 等作答字段。

const root = path.dirname(fileURLToPath(import.meta.url));

const MIGRATIONS = [
  {
    id: "2026-10-28-hcia-datacom-reclassify",
    file: path.join(
      root,
      "question-banks/hcia-datacom/migrations/2026-10-28-classification.json",
    ),
  },
];

const tableExists = (db, name) =>
  Boolean(
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
      .get(name),
  );

function migrateAttempts(db, questions) {
  const rows = db.prepare("SELECT id, question_id, data FROM attempts").all();
  const update = db.prepare("UPDATE attempts SET data=? WHERE id=?");
  let changed = 0;
  for (const row of rows) {
    const target = questions[row.question_id];
    if (!target) continue;
    let data;
    try {
      data = JSON.parse(row.data);
    } catch {
      continue;
    }
    const same =
      data.chapter === target.chapter &&
      data.knowledgePoint === target.knowledgePoint &&
      data.practicedKnowledgePoint === target.knowledgePoint;
    if (same) continue;
    data.chapter = target.chapter;
    data.knowledgePoint = target.knowledgePoint;
    data.practicedKnowledgePoint = target.knowledgePoint;
    update.run(JSON.stringify(data), row.id);
    changed += 1;
  }
  return changed;
}

const remapIds = (ids, pointMap) =>
  [...new Set(ids.flatMap((id) => pointMap[id] || [id]))];

function migrateSessions(db, pointMap) {
  const rows = db.prepare("SELECT id, data FROM sessions").all();
  const update = db.prepare("UPDATE sessions SET data=? WHERE id=?");
  let changed = 0;
  for (const row of rows) {
    let data;
    try {
      data = JSON.parse(row.data);
    } catch {
      continue;
    }
    if (!Array.isArray(data.knowledgePointIds) || !data.knowledgePointIds.length)
      continue;
    const next = remapIds(data.knowledgePointIds, pointMap);
    if (JSON.stringify(next) === JSON.stringify(data.knowledgePointIds)) continue;
    data.knowledgePointIds = next;
    update.run(JSON.stringify(data), row.id);
    changed += 1;
  }
  return changed;
}

function migrateLocationLearning(db, questions, pointMap) {
  if (!tableExists(db, "location_learning_sessions")) return 0;
  const rows = db.prepare("SELECT id, data FROM location_learning_sessions").all();
  const update = db.prepare(
    "UPDATE location_learning_sessions SET data=? WHERE id=?",
  );
  let changed = 0;
  for (const row of rows) {
    let data;
    try {
      data = JSON.parse(row.data);
    } catch {
      continue;
    }
    let touched = false;
    if (Array.isArray(data.pointIds) && data.pointIds.length) {
      const next = remapIds(data.pointIds, pointMap);
      if (JSON.stringify(next) !== JSON.stringify(data.pointIds)) {
        data.pointIds = next;
        touched = true;
      }
    }
    if (data.point?.id && pointMap[data.point.id]) {
      data.point = { ...data.point, id: pointMap[data.point.id][0] };
      touched = true;
    }
    for (const snapshot of data.questions || []) {
      const target = questions[snapshot?.id];
      if (!target) continue;
      if (
        snapshot.chapter !== target.chapter ||
        snapshot.knowledgeSection !== target.knowledgeSection ||
        snapshot.knowledgePoint !== target.knowledgePoint
      ) {
        snapshot.chapter = target.chapter;
        snapshot.knowledgeSection = target.knowledgeSection;
        snapshot.knowledgePoint = target.knowledgePoint;
        touched = true;
      }
    }
    if (!touched) continue;
    update.run(JSON.stringify(data), row.id);
    changed += 1;
  }
  return changed;
}

/**
 * 在题库同步完成之后、开始对外服务之前调用。
 * 幂等：已执行过的迁移记入 schema_migrations，不会重复跑。
 * 失败不阻断启动（历史数据保持原样，绝不写坏），但会留下日志等待重试。
 */
export function applyBankMigrations(db, log = () => {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY, applied_at TEXT NOT NULL
  );`);
  const done = new Set(
    db.prepare("SELECT id FROM schema_migrations").all().map((row) => row.id),
  );
  for (const migration of MIGRATIONS) {
    if (done.has(migration.id)) continue;
    if (!fs.existsSync(migration.file)) {
      log(`题库迁移跳过（缺少映射文件）：${migration.id}`);
      continue;
    }
    const plan = JSON.parse(fs.readFileSync(migration.file, "utf8"));
    const questions = plan.questions || {};
    const pointMap = plan.pointIds || {};
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = {
        attempts: migrateAttempts(db, questions),
        sessions: migrateSessions(db, pointMap),
        locationLearning: migrateLocationLearning(db, questions, pointMap),
      };
      db.prepare(
        "INSERT INTO schema_migrations (id, applied_at) VALUES (?,?)",
      ).run(migration.id, new Date().toISOString());
      db.exec("COMMIT");
      log(
        `题库迁移完成 ${migration.id}：作答记录 ${result.attempts} 条、试卷 ${result.sessions} 份、专项学习 ${result.locationLearning} 条`,
      );
    } catch (error) {
      db.exec("ROLLBACK");
      log(`题库迁移失败 ${migration.id}：${error.message}`);
    }
  }
}

export const bankMigrationIds = MIGRATIONS.map((migration) => migration.id);
