import crypto from "node:crypto";
import {
  studyError,
  studyHash,
  studyDay,
  studyNodes,
  studyPackageSchema,
  studyReviewSchema,
  acceptedStudyReview,
} from "./study-content.js";

const now = () => new Date().toISOString();
const unpack = (row) => row ? { ...row, data: JSON.parse(row.data) } : null;

export function createStudyStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS study_packages (
      id TEXT PRIMARY KEY, node_id TEXT NOT NULL, certificate_id TEXT NOT NULL,
      curriculum_version TEXT NOT NULL, content_hash TEXT NOT NULL, status TEXT NOT NULL,
      data TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, published_at TEXT
    );
    CREATE INDEX IF NOT EXISTS study_packages_node ON study_packages(node_id,created_at);
    CREATE TABLE IF NOT EXISTS study_publications (
      node_id TEXT NOT NULL, curriculum_version TEXT NOT NULL,
      package_id TEXT NOT NULL REFERENCES study_packages(id), PRIMARY KEY(node_id,curriculum_version)
    );
    CREATE TABLE IF NOT EXISTS study_generation_jobs (
      id TEXT PRIMARY KEY, generation_key TEXT NOT NULL, node_id TEXT NOT NULL,
      status TEXT NOT NULL, stage TEXT NOT NULL, data TEXT NOT NULL,
      created_by TEXT NOT NULL, created_at TEXT NOT NULL, available_at TEXT, started_at TEXT, lease_until TEXT,
      worker TEXT, package_id TEXT, error TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS study_one_active_generation
      ON study_generation_jobs(generation_key) WHERE status IN ('queued','running');
    CREATE TABLE IF NOT EXISTS study_progress (
      user_id TEXT NOT NULL, node_id TEXT NOT NULL, certificate_id TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 0, completed_at TEXT, updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id,node_id)
    );
    CREATE TABLE IF NOT EXISTS study_sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, node_id TEXT NOT NULL,
      package_id TEXT NOT NULL REFERENCES study_packages(id), data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS study_sessions_user ON study_sessions(user_id,node_id,created_at);
    CREATE TABLE IF NOT EXISTS study_attempts (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, session_id TEXT NOT NULL REFERENCES study_sessions(id),
      node_id TEXT NOT NULL, package_id TEXT NOT NULL REFERENCES study_packages(id), question_id TEXT NOT NULL,
      request_id TEXT NOT NULL, input_hash TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL,
      grading_token TEXT, lease_until TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(user_id,request_id)
    );
    CREATE INDEX IF NOT EXISTS study_attempts_user ON study_attempts(user_id,node_id,created_at);
    CREATE TABLE IF NOT EXISTS study_hints (
      session_id TEXT NOT NULL, question_id TEXT NOT NULL, PRIMARY KEY(session_id,question_id)
    );
    CREATE TABLE IF NOT EXISTS study_teacher_requests (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, node_id TEXT NOT NULL, package_id TEXT NOT NULL,
      request_id TEXT NOT NULL, input_hash TEXT NOT NULL, day TEXT NOT NULL, status TEXT NOT NULL,
      data TEXT NOT NULL, created_at TEXT NOT NULL, lease_until TEXT NOT NULL,
      UNIQUE(user_id,request_id)
    );
    CREATE INDEX IF NOT EXISTS study_teacher_history ON study_teacher_requests(user_id,package_id,created_at);
    CREATE TABLE IF NOT EXISTS study_feedback (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, attempt_id TEXT NOT NULL REFERENCES study_attempts(id),
      status TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL, resolved_at TEXT,
      UNIQUE(user_id,attempt_id)
    );
  `);
  const jobColumns = new Set(db.prepare("PRAGMA table_info(study_generation_jobs)").all().map((row) => row.name));
  if (!jobColumns.has("available_at")) db.exec("ALTER TABLE study_generation_jobs ADD COLUMN available_at TEXT");
  if (!jobColumns.has("started_at")) db.exec("ALTER TABLE study_generation_jobs ADD COLUMN started_at TEXT");
  db.exec(`UPDATE study_generation_jobs SET available_at=created_at WHERE available_at IS NULL;
    UPDATE study_generation_jobs SET started_at=created_at WHERE started_at IS NULL AND status IN ('running','completed','failed','rejected');
    CREATE INDEX IF NOT EXISTS study_generation_ready ON study_generation_jobs(status,available_at,created_at);`);
  const transaction = (work) => {
    db.exec("BEGIN IMMEDIATE");
    try { const result = work(); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  };
  const audit = (actor, action, id, data = {}) => db.prepare(
    "INSERT INTO admin_audit (id,admin_user_id,action,target_type,target_id,data,created_at) VALUES (?,?,?,?,?,?,?)",
  ).run(crypto.randomUUID(), actor, action, "study_content", id, JSON.stringify(data), now());
  const api = {
    package(id) { return unpack(db.prepare("SELECT * FROM study_packages WHERE id=?").get(id)); },
    published(node) {
      return unpack(db.prepare(`SELECT p.* FROM study_publications s JOIN study_packages p ON p.id=s.package_id
        WHERE s.node_id=? AND s.curriculum_version=? AND p.status='published'`).get(node.id, node.version));
    },
    packages() { return db.prepare("SELECT * FROM study_packages ORDER BY created_at DESC LIMIT 500").all().map(unpack); },
    installPublishedSeeds(records, actor = "system:study-seed") {
      if (!Array.isArray(records) || !records.length)
        throw new Error("部署课程种子数量与当前课程目录不一致");
      const seen = new Set();
      const prepared = records.map((record) => {
        const node = studyNodes.find((item) => item.id === record.nodeId);
        if (!node || node.version !== record.curriculumVersion || seen.has(node.id))
          throw new Error(`部署课程种子目录版本错误：${record.nodeId || "未知小节"}`);
        seen.add(node.id);
        const bundle = studyPackageSchema.parse(record.bundle);
        const review = studyReviewSchema.parse(record.review);
        if (!acceptedStudyReview(bundle, review))
          throw new Error(`部署课程种子复核未通过：${node.id}`);
        if (typeof record.reference !== "string" || record.reference.length > 6000)
          throw new Error(`部署课程种子参考资料无效：${node.id}`);
        return { node, bundle, review, reference: record.reference, contentHash: studyHash(bundle),
          reviewMethod: record.reviewMethod === "authored-curriculum" ? record.reviewMethod : null };
      });
      const certificateIds = new Set(prepared.map((seed) => seed.node.certificateId));
      const expectedNodes = studyNodes.filter((node) => certificateIds.has(node.certificateId));
      if (seen.size !== expectedNodes.length || expectedNodes.some((node) => !seen.has(node.id)))
        throw new Error("部署课程种子未覆盖全部课程小节");
      return transaction(() => {
        let installed = 0, preserved = 0;
        for (const seed of prepared) {
          const current = api.published(seed.node);
          const currentBundle = current && studyPackageSchema.safeParse(current.data.bundle);
          const currentReview = current && studyReviewSchema.safeParse(current.data.review);
          if (current?.status === "published" && currentBundle?.success && currentReview?.success &&
              acceptedStudyReview(currentBundle.data, currentReview.data)) {
            preserved++;
            continue;
          }
          const withdrawn = db.prepare(`SELECT 1 FROM study_packages WHERE node_id=? AND curriculum_version=?
            AND status='suspended' LIMIT 1`).get(seed.node.id, seed.node.version);
          if (withdrawn) {
            preserved++;
            continue;
          }
          const id = crypto.randomUUID(), stamp = now();
          db.prepare(`INSERT INTO study_packages (id,node_id,certificate_id,curriculum_version,content_hash,status,data,created_by,created_at,published_at)
            VALUES (?,?,?,?,?,'published',?,?,?,?)`).run(id, seed.node.id, seed.node.certificateId,
            seed.node.version, seed.contentHash,
            JSON.stringify({ bundle: seed.bundle, review: seed.review, reference: seed.reference,
              ...(seed.reviewMethod ? { reviewMethod: seed.reviewMethod } : {}) }),
            actor, stamp, stamp);
          db.prepare(`INSERT INTO study_publications (node_id,curriculum_version,package_id) VALUES (?,?,?)
            ON CONFLICT(node_id,curriculum_version) DO UPDATE SET package_id=excluded.package_id`)
            .run(seed.node.id, seed.node.version, id);
          audit(actor, "study_seed_published", id, { nodeId: seed.node.id, contentHash: seed.contentHash });
          installed++;
        }
        return { total: prepared.length, installed, preserved };
      });
    },
    savePackage(node, generated, reference, actor) {
      const bundle = generated.bundle;
      const id = crypto.randomUUID();
      db.prepare(`INSERT INTO study_packages (id,node_id,certificate_id,curriculum_version,content_hash,status,data,created_by,created_at)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(id, node.id, node.certificateId, node.version, studyHash(bundle),
        generated.accepted ? "awaiting_review" : "rejected",
        JSON.stringify({ bundle, review: generated.review, reference }), actor, now());
      audit(actor, "study_generated", id, { nodeId: node.id, accepted: generated.accepted });
      return api.package(id);
    },
    publish(id, actor, node) {
      return transaction(() => {
        const item = api.package(id);
        if (!item || !["awaiting_review", "published"].includes(item.status)) throw studyError("内容未通过复核，不能发布");
        if (item.node_id !== node.id || item.curriculum_version !== node.version) throw studyError("课程目录已经变化，请重新生成并审核", 409);
        db.prepare("UPDATE study_packages SET status='published',published_at=? WHERE id=?").run(now(), id);
        db.prepare(`INSERT INTO study_publications (node_id,curriculum_version,package_id) VALUES (?,?,?)
          ON CONFLICT(node_id,curriculum_version) DO UPDATE SET package_id=excluded.package_id`).run(node.id, node.version, id);
        audit(actor, "study_published", id, { nodeId: node.id, contentHash: item.content_hash });
        return api.package(id);
      });
    },
    suspend(id, actor) {
      return transaction(() => {
        if (!api.package(id)) throw studyError("内容不存在", 404);
        db.prepare("UPDATE study_packages SET status='suspended' WHERE id=?").run(id);
        db.prepare("DELETE FROM study_publications WHERE package_id=?").run(id);
        audit(actor, "study_suspended", id);
      });
    },
    createJob(node, reference, actor, dailyLimit) {
      return transaction(() => {
        const key = `${node.id}:${node.version}`;
        const active = unpack(db.prepare("SELECT * FROM study_generation_jobs WHERE generation_key=? AND status IN ('queued','running')").get(key));
        if (active) return { job: active, created: false };
        const dayStart = new Date(`${studyDay()}T00:00:00+08:00`).toISOString();
        const count = db.prepare("SELECT count(*) AS count FROM study_generation_jobs WHERE started_at>=?")
          .get(dayStart).count;
        if (count >= dailyLimit) throw studyError("今日内容生成任务较多，请明天再试或调整管理员限额", 429);
        const id = crypto.randomUUID();
        const reserved = db.prepare("SELECT count(*) AS count FROM study_generation_jobs WHERE status='queued'").get().count;
        const slot = count + reserved;
        const availableAt = new Date(Date.parse(dayStart) + Math.floor(slot / dailyLimit) * 86400000).toISOString();
        db.prepare(`INSERT INTO study_generation_jobs (id,generation_key,node_id,status,stage,data,created_by,created_at,available_at)
          VALUES (?,?,?,'queued','等待生成',?,?,?,?)`).run(id, key, node.id,
          JSON.stringify({ node, reference, referenceMode: "manual" }), actor, now(), availableAt);
        return { job: api.job(id), created: true };
      });
    },
    queueBulk(entries, actor, dailyLimit) {
      return transaction(() => {
        const dayStart = new Date(`${studyDay()}T00:00:00+08:00`).toISOString();
        const started = db.prepare("SELECT count(*) AS count FROM study_generation_jobs WHERE started_at>=?").get(dayStart).count;
        const reserved = db.prepare("SELECT count(*) AS count FROM study_generation_jobs WHERE status='queued'").get().count;
        const batchId = crypto.randomUUID();
        let slot = started + reserved, queued = 0, reused = 0;
        const jobs = [];
        for (const entry of entries) {
          const { node, reference, referenceMode = "question-bank", referenceCount = 0 } = entry;
          const key = `${node.id}:${node.version}`;
          const active = unpack(db.prepare("SELECT * FROM study_generation_jobs WHERE generation_key=? AND status IN ('queued','running')").get(key));
          if (active) { reused++; jobs.push(active.id); continue; }
          const id = crypto.randomUUID(), createdAt = now();
          const availableAt = new Date(Date.parse(dayStart) + Math.floor(slot / dailyLimit) * 86400000).toISOString();
          db.prepare(`INSERT INTO study_generation_jobs (id,generation_key,node_id,status,stage,data,created_by,created_at,available_at)
            VALUES (?,?,?,'queued','等待生成',?,?,?,?)`).run(id, key, node.id,
            JSON.stringify({ node, reference, referenceMode, referenceCount, batchId }), actor, createdAt, availableAt);
          slot++; queued++; jobs.push(id);
        }
        audit(actor, "study_bulk_generation_queued", batchId, { queued, reused, dailyLimit });
        return { batchId, queued, reused, jobs };
      });
    },
    releaseQueuedJobs(actor) {
      return transaction(() => {
        const stamp = now();
        let retried = 0, skippedFailures = 0;
        const failures = db.prepare("SELECT id,generation_key FROM study_generation_jobs WHERE status='failed' AND error LIKE ?")
          .all("AI 输出连续%未通过验证%");
        for (const item of failures) {
          const active = db.prepare("SELECT id FROM study_generation_jobs WHERE generation_key=? AND status IN ('queued','running')")
            .get(item.generation_key);
          if (active) { skippedFailures++; continue; }
          retried += db.prepare(`UPDATE study_generation_jobs SET status='queued',stage='等待重新生成',package_id=NULL,
            error=NULL,available_at=? WHERE id=? AND status='failed'`).run(stamp, item.id).changes;
        }
        const result = db.prepare("UPDATE study_generation_jobs SET available_at=? WHERE status='queued'").run(stamp);
        if (result.changes || retried) audit(actor, "study_queued_generation_started", crypto.randomUUID(),
          { released: result.changes, retried, skippedFailures });
        return { released: result.changes, retried, skippedFailures };
      });
    },
    job(id) { return unpack(db.prepare("SELECT * FROM study_generation_jobs WHERE id=?").get(id)); },
    jobs() { return db.prepare("SELECT * FROM study_generation_jobs ORDER BY created_at DESC LIMIT 500").all().map(unpack); },
    claimJob(worker, dailyLimit = 20) {
      // A finite lease survives restarts. Expired uncertain work fails rather
      // than silently issuing a second paid generation call.
      db.prepare("UPDATE study_generation_jobs SET status='failed',error='生成中断，请检查后重新生成',stage='需要重试' WHERE status='running' AND lease_until<?").run(now());
      const dayStart = new Date(`${studyDay()}T00:00:00+08:00`).toISOString();
      const started = db.prepare("SELECT count(*) AS count FROM study_generation_jobs WHERE started_at>=?").get(dayStart).count;
      if (started >= dailyLimit) return null;
      const item = db.prepare("SELECT id FROM study_generation_jobs WHERE status='queued' AND COALESCE(available_at,created_at)<=? ORDER BY COALESCE(available_at,created_at),created_at LIMIT 1").get(now());
      if (!item) return null;
      const claimedAt = now();
      const claimed = db.prepare("UPDATE study_generation_jobs SET status='running',worker=?,started_at=?,lease_until=?,stage='生成讲解与填空题' WHERE id=? AND status='queued'")
        .run(worker, claimedAt, new Date(Date.now() + 300000).toISOString(), item.id);
      return claimed.changes ? api.job(item.id) : null;
    },
    finishJob(id, worker, item, error) {
      db.prepare("UPDATE study_generation_jobs SET status=?,stage=?,package_id=?,error=?,lease_until=NULL WHERE id=? AND worker=? AND status='running'")
        .run(error ? "failed" : item.status === "rejected" ? "rejected" : "completed",
          error ? "生成未完成" : item.status === "rejected" ? "AI 复核未通过" : item.status === "published" ? "已上架" : "等待管理员发布",
          item?.id || null, error || null, id, worker);
    },
    progress(userId) { return db.prepare("SELECT * FROM study_progress WHERE user_id=? ORDER BY updated_at DESC").all(userId); },
    complete(userId, node, version) {
      return transaction(() => {
        const row = db.prepare("SELECT * FROM study_progress WHERE user_id=? AND node_id=?").get(userId, node.id);
        if ((row?.version || 0) !== version) throw studyError("学习进度已在其他页面更新，请刷新后再试", 409, "STUDY_PROGRESS_CONFLICT");
        db.prepare(`INSERT INTO study_progress (user_id,node_id,certificate_id,version,completed_at,updated_at) VALUES (?,?,?,1,?,?)
          ON CONFLICT(user_id,node_id) DO UPDATE SET version=version+1,completed_at=COALESCE(completed_at,excluded.completed_at),updated_at=excluded.updated_at`)
          .run(userId, node.id, node.certificateId, now(), now());
        return db.prepare("SELECT * FROM study_progress WHERE user_id=? AND node_id=?").get(userId, node.id);
      });
    },
    mastery(userId, nodeId) {
      const first = new Map();
      for (const row of db.prepare("SELECT * FROM study_attempts WHERE user_id=? AND node_id=? ORDER BY created_at,id").all(userId, nodeId)) {
        const key = `${row.package_id}:${row.question_id}`;
        if (!first.has(key)) first.set(key, unpack(row));
      }
      const recent = [...first.values()].filter((row) => row.status === "graded" && !row.data.hinted).slice(-5);
      const correct = recent.filter((row) => row.data.result.correct).length;
      return { attempted: recent.length, correct, mastered: recent.length >= 5 && correct >= 4 };
    },
    session(id, userId) { return unpack(db.prepare("SELECT * FROM study_sessions WHERE id=? AND user_id=?").get(id, userId)); },
    recentSession(userId, nodeId, packageId) {
      return unpack(db.prepare("SELECT * FROM study_sessions WHERE user_id=? AND node_id=? AND package_id=? ORDER BY created_at DESC LIMIT 1").get(userId, nodeId, packageId));
    },
    createSession(userId, node, item, questionIds) {
      const id = crypto.randomUUID();
      db.prepare("INSERT INTO study_sessions (id,user_id,node_id,package_id,data,created_at) VALUES (?,?,?,?,?,?)")
        .run(id, userId, node.id, item.id, JSON.stringify({ questionIds }), now());
      return api.session(id, userId);
    },
    attempts(sessionId, userId) { return db.prepare("SELECT * FROM study_attempts WHERE session_id=? AND user_id=? ORDER BY created_at,id").all(sessionId, userId).map(unpack); },
    attempt(id, userId) { return unpack(db.prepare("SELECT * FROM study_attempts WHERE id=? AND user_id=?").get(id, userId)); },
    requestAttempt(userId, requestId) { return unpack(db.prepare("SELECT * FROM study_attempts WHERE user_id=? AND request_id=?").get(userId, requestId)); },
    createAttempt(userId, session, questionId, requestId, answers, result) {
      const inputHash = studyHash({ sessionId: session.id, questionId, answers });
      return transaction(() => {
        const old = api.requestAttempt(userId, requestId);
        if (old) {
          if (old.input_hash !== inputHash) throw studyError("请求编号已经用于另一份作答，请重新提交", 409);
          return { attempt: old, created: false };
        }
        const recent = db.prepare("SELECT count(*) AS count FROM study_attempts WHERE user_id=? AND created_at>=?")
          .get(userId, new Date(Date.now() - 60000).toISOString()).count;
        if (recent >= 30) throw studyError("提交较频繁，请稍后再试", 429);
        const id = crypto.randomUUID(), token = crypto.randomUUID();
        const hinted = !!db.prepare("SELECT 1 FROM study_hints WHERE session_id=? AND question_id=?").get(session.id, questionId);
        db.prepare(`INSERT INTO study_attempts (id,user_id,session_id,node_id,package_id,question_id,request_id,input_hash,status,data,grading_token,lease_until,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,'processing',?,?,?,?,?)`).run(id, userId, session.id, session.node_id, session.package_id,
          questionId, requestId, inputHash, JSON.stringify({ answers, result, hinted }), token,
          new Date(Date.now() + 210000).toISOString(), now(), now());
        return { attempt: api.attempt(id, userId), created: true };
      });
    },
    claimAttempt(id, userId) {
      const token = crypto.randomUUID();
      const changed = db.prepare("UPDATE study_attempts SET status='processing',grading_token=?,lease_until=?,updated_at=? WHERE id=? AND user_id=? AND (status='pending_review' OR (status='processing' AND lease_until<?))")
        .run(token, new Date(Date.now() + 210000).toISOString(), now(), id, userId, now());
      return changed.changes ? api.attempt(id, userId) : null;
    },
    finishAttempt(attempt, result, error = "") {
      db.prepare("UPDATE study_attempts SET status=?,data=?,updated_at=?,lease_until=NULL WHERE id=? AND status='processing' AND grading_token=?")
        .run(result.status, JSON.stringify({ ...attempt.data, result, error }), now(), attempt.id, attempt.grading_token);
      return api.attempt(attempt.id, attempt.user_id);
    },
    hint(sessionId, questionId) { db.prepare("INSERT OR IGNORE INTO study_hints (session_id,question_id) VALUES (?,?)").run(sessionId, questionId); },
    teacherRequest(userId, requestId) { return unpack(db.prepare("SELECT * FROM study_teacher_requests WHERE user_id=? AND request_id=?").get(userId, requestId)); },
    reserveTeacher(userId, node, packageId, requestId, context, limit) {
      return transaction(() => {
        db.prepare("UPDATE study_teacher_requests SET status='failed' WHERE status='processing' AND lease_until<?").run(now());
        const hash = studyHash(context), old = api.teacherRequest(userId, requestId);
        if (old && old.input_hash !== hash) throw studyError("请求编号已使用，请重新提问", 409);
        if (old && old.status !== "failed") return { row: old, created: false };
        const used = db.prepare("SELECT count(*) AS count FROM study_teacher_requests WHERE user_id=? AND day=? AND status IN ('processing','completed')").get(userId, studyDay()).count;
        if (used >= limit) throw studyError("今天的新提问次数已用完，仍可查看讲解和已有提示", 429, "STUDY_TEACHER_LIMIT");
        if (old) db.prepare("DELETE FROM study_teacher_requests WHERE id=?").run(old.id);
        const id = crypto.randomUUID();
        db.prepare(`INSERT INTO study_teacher_requests (id,user_id,node_id,package_id,request_id,input_hash,day,status,data,created_at,lease_until)
          VALUES (?,?,?,?,?,?,?,'processing',?,?,?)`).run(id, userId, node.id, packageId, requestId, hash,
          studyDay(), JSON.stringify({ context }), now(), new Date(Date.now() + 210000).toISOString());
        return { row: api.teacherRequest(userId, requestId), created: true };
      });
    },
    finishTeacher(row, answer, error) {
      db.prepare("UPDATE study_teacher_requests SET status=?,data=? WHERE id=? AND status='processing'")
        .run(error ? "failed" : "completed", JSON.stringify({ ...row.data, answer, error: error || "" }), row.id);
    },
    teacherHistory(userId, packageId) {
      return db.prepare("SELECT * FROM study_teacher_requests WHERE user_id=? AND package_id=? AND status='completed' ORDER BY created_at DESC LIMIT 3")
        .all(userId, packageId).map(unpack).reverse().map((row) => ({ question: row.data.context.message, answer: row.data.answer }));
    },
    feedback(userId, attempt, note) {
      db.prepare(`INSERT INTO study_feedback (id,user_id,attempt_id,status,note,created_at) VALUES (?,?,?,'open',?,?)
        ON CONFLICT(user_id,attempt_id) DO UPDATE SET note=excluded.note,status='open',resolved_at=NULL`)
        .run(crypto.randomUUID(), userId, attempt.id, note, now());
    },
    feedbackList() { return db.prepare("SELECT f.*,a.node_id,a.question_id,a.package_id,a.data AS attempt_data FROM study_feedback f JOIN study_attempts a ON a.id=f.attempt_id ORDER BY f.created_at DESC LIMIT 100").all()
      .map((row) => ({ ...row, attempt_data: JSON.parse(row.attempt_data) })); },
    resolveFeedback(id, actor, results, note) {
      return transaction(() => {
        const feedback = db.prepare("SELECT * FROM study_feedback WHERE id=? AND status='open'").get(id);
        if (!feedback) throw studyError("该复核记录已经处理或不存在", 404);
        const attempt = api.attempt(feedback.attempt_id, feedback.user_id);
        if (attempt.status === "processing") throw studyError("作答正在判分，请稍后复核", 409);
        db.prepare("UPDATE study_attempts SET status='graded',data=?,updated_at=? WHERE id=?")
          .run(JSON.stringify({ ...attempt.data, result: results, reviewNote: note, reviewedBy: actor }), now(), attempt.id);
        db.prepare("UPDATE study_feedback SET status='resolved',resolved_at=? WHERE id=?").run(now(), id);
        audit(actor, "study_grade_reviewed", attempt.id, { note, result: results });
      });
    },
  };
  return api;
}
