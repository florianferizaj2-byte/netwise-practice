import crypto from "node:crypto";
import { z } from "zod";
import { TutorEngine, tutorError } from "./demo-tutor/engine.js";
import { catalogue, getBundle } from "./demo-tutor/registry.js";
import { startSchema, actionSchema } from "./demo-tutor/protocol.js";
import { studyNodes, studyNode } from "./study-content.js";
import { requireStudyMember } from "./study-access.js";
import { registerTutorTeacher } from "./interactive-tutor-teacher.js";
import { tutorAiUsage } from "./ai-usage-cost.js";
import { authorAiAvailable } from "./ai-service.js";

const hash = (input) =>
  crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
const startInput = startSchema.extend({
  pacing: z.literal("guided").default("guided"),
});
const pilotSourceVersion = "9fb32a15dda5c670cb0e";
// The pilot covers broadcast domains, not the 802.1Q tag format used by the old demo directory.
const forCurriculum = (course) =>
  course.id === "vlan-broadcast-domain"
    ? {
        ...course,
        nodeId: "network-engineer:03.01.02",
        sourceVersion: pilotSourceVersion,
      }
    : course;
// Explicitly recognised corrections have their own content revision, while this part identifies the reviewed curriculum.
function curriculumVersion(course) {
  if (course.id === "vlan-broadcast-domain") return pilotSourceVersion;
  return course.sourceVersion?.replace(/-demo-(?:pcm|ipv4|subnet)-r1$/, "");
}
const publishedCourses = () =>
  catalogue()
    .courses.map(forCurriculum)
    .filter((c) =>
      studyNodes.some(
        (n) => n.id === c.nodeId && n.version === curriculumVersion(c),
      ),
    );

export function registerInteractiveTutor({
  app,
  route,
  store,
  requestUserId,
  studyContent,
  resolveQuestion,
  teacher,
  ai,
  requireAiService,
}) {
  const db = store.db,
    engine = new TutorEngine(),
    prefix = "/api/tutor/v1";
  db.exec(`CREATE TABLE IF NOT EXISTS interactive_tutor_sessions (
    id TEXT PRIMARY KEY,user_id TEXT NOT NULL,certificate_id TEXT NOT NULL,node_id TEXT NOT NULL,
    course_id TEXT NOT NULL,course_version TEXT NOT NULL,curriculum_version TEXT NOT NULL,
    created_at TEXT NOT NULL,updated_at TEXT NOT NULL,data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS interactive_tutor_owner ON interactive_tutor_sessions(user_id,certificate_id,course_id);
  CREATE TABLE IF NOT EXISTS interactive_tutor_requests (
    user_id TEXT NOT NULL,request_id TEXT NOT NULL,session_id TEXT NOT NULL REFERENCES interactive_tutor_sessions(id),
    input_hash TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(user_id,request_id)
  );`);
  if (
    !db
      .prepare("PRAGMA table_info(interactive_tutor_requests)")
      .all()
      .some((c) => c.name === "created_at")
  ) {
    db.exec(
      "ALTER TABLE interactive_tutor_requests ADD COLUMN created_at TEXT",
    );
    db.exec(
      "UPDATE interactive_tutor_requests SET created_at=(SELECT created_at FROM interactive_tutor_sessions WHERE id=session_id) WHERE created_at IS NULL",
    );
  }
  db.exec(
    "CREATE INDEX IF NOT EXISTS interactive_tutor_request_time ON interactive_tutor_requests(user_id,created_at)",
  );
  const transaction = (work) => {
    db.exec("SAVEPOINT interactive_tutor");
    try {
      const result = work();
      db.exec("RELEASE interactive_tutor");
      return result;
    } catch (e) {
      db.exec("ROLLBACK TO interactive_tutor");
      db.exec("RELEASE interactive_tutor");
      throw e;
    }
  };
  const bind = (req, id) => {
    const course = forCurriculum(getBundle(id).course),
      node = studyNode(course.nodeId, req.user.certificateId);
    if (curriculumVersion(course) !== node.version)
      throw tutorError(
        "课程范围已更新，本节互动课正在复核。",
        409,
        "TUTOR_VERSION_CHANGED",
      );
    if (!studyContent.published(node))
      throw tutorError(
        "本知识点内容已暂停发布，请先学习其他课程。",
        409,
        "STUDY_CONTENT_SUSPENDED",
      );
    return { course, node };
  };
  const unpack = (row) => (row ? JSON.parse(row.data) : null);
  const latest = (user, certificate, course) =>
    unpack(
      db
        .prepare(
          "SELECT data FROM interactive_tutor_sessions WHERE user_id=? AND certificate_id=? AND course_id=? AND course_version=? AND curriculum_version=? ORDER BY rowid DESC LIMIT 1",
        )
        .get(
          user,
          certificate,
          course.id,
          course.version,
          curriculumVersion(course),
        ),
    );
  const owned = (req, id) => {
    const { userId } = requireStudyMember(store, req, requestUserId);
    const row = db
      .prepare(
        "SELECT * FROM interactive_tutor_sessions WHERE id=? AND user_id=? AND certificate_id=?",
      )
      .get(id, userId, req.user.certificateId);
    if (!row)
      throw tutorError(
        "没有找到当前账号与证书的互动学习记录。",
        404,
        "TUTOR_SESSION_NOT_FOUND",
      );
    const binding = bind(req, row.course_id);
    if (
      row.course_version !== binding.course.version ||
      row.curriculum_version !== binding.node.version
    )
      throw tutorError(
        "课程已更新，请重新开始本节课程。",
        409,
        "TUTOR_VERSION_CHANGED",
      );
    return { userId, row, state: unpack(row), ...binding };
  };
  const view = (state) => {
    const result = engine.view(state);
    return {
      ...result,
      course: forCurriculum(result.course),
      mode: "reviewed-tutor",
      modelConnected: false,
      teacherConfigured: authorAiAvailable(store),
    };
  };
  const request = (user, id) =>
    db
      .prepare(
        "SELECT * FROM interactive_tutor_requests WHERE user_id=? AND request_id=?",
      )
      .get(user, id);
  const remember = (user, id, session, input) =>
    db
      .prepare("INSERT INTO interactive_tutor_requests VALUES (?,?,?,?,?)")
      .run(user, id, session, hash(input), new Date().toISOString());
  const assertRate = (user) => {
    const n = db
      .prepare(
        "SELECT count(*) n FROM interactive_tutor_requests WHERE user_id=? AND created_at>=?",
      )
      .get(user, new Date(Date.now() - 60000).toISOString()).n;
    if (n >= 90)
      throw tutorError(
        "操作较频繁，请稍后继续。学习进度已保存。",
        429,
        "TUTOR_RATE_LIMIT",
      );
  };
  app.use(prefix, (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  route("get", prefix + "/questions/:id", (req) => {
    requireStudyMember(store, req, requestUserId);
    const q = resolveQuestion(req.params.id, req);
    const point = q.targetKnowledgePoint || q.knowledgePoint;
    const candidates = studyNodes.filter(
      (n) =>
        n.certificateId === req.user.certificateId &&
        n.chapter === q.chapter &&
        [n.name, n.parentName, ...(n.aliases || [])].includes(point),
    );
    if (candidates.length !== 1)
      throw tutorError(
        "这道题暂未匹配到精讲知识点，可先查看题目解析或从精讲目录选择。",
        404,
        "TUTOR_QUESTION_NOT_MAPPED",
      );
    const node = candidates[0];
    const course = publishedCourses().find((c) => c.nodeId === node.id);
    const available = !!studyContent.published(node) && !!course;
    const partial = course?.id === "vlan-broadcast-domain";
    return {
      nodeId: node.id,
      title: node.name,
      courseId:
        available &&
        (!partial || (/VLAN/i.test(q.question) && /广播/.test(q.question)))
          ? course.id
          : null,
    };
  });
  route("get", prefix + "/catalog", (req) => {
    const userId = requestUserId(req),
      entitlement = store.accountEntitlement(userId);
    let access = true;
    try {
      requireStudyMember(store, req, requestUserId);
    } catch (e) {
      if (e.code !== "STUDY_MEMBERSHIP_REQUIRED") throw e;
      access = false;
    }
    const courses = publishedCourses().filter(
      (c) =>
        studyNode(c.nodeId).certificateId === req.user.certificateId &&
        !!studyContent.published(studyNode(c.nodeId)),
    );
    const byNode = new Map(courses.map((c) => [c.nodeId, c]));
    return {
      access,
      supported: req.user.certificateId === "network-engineer",
      plan: entitlement.plan,
      expiresAt: entitlement.expiresAt,
      nodes: access
        ? studyNodes
            .filter((n) => n.certificateId === req.user.certificateId)
            .map((n) => {
              const course = byNode.get(n.id),
                s = course && latest(userId, n.certificateId, course);
              return {
                id: n.id,
                name: n.name,
                chapter: n.chapter,
                section: n.section,
                version: n.version,
                courseId: course?.id || null,
                courseTitle: course?.title || null,
                status: course
                  ? course.id === "vlan-broadcast-domain"
                    ? "partial"
                    : "ready"
                  : "pending",
                progress: s
                  ? {
                      sessionId: s.id,
                      phase: s.phase,
                      conceptIndex: s.conceptIndex,
                      completed: s.phase === "complete",
                      mastered: s.mastery.every((m) => m === "mastered"),
                    }
                  : null,
              };
            })
        : [],
    };
  });
  route("get", prefix + "/sessions/current", (req) => {
    const { userId } = requireStudyMember(store, req, requestUserId);
    const { course } = bind(req, z.string().max(100).parse(req.query.courseId));
    const s = latest(userId, req.user.certificateId, course);
    return { course, session: s ? view(s) : null };
  });
  route("post", prefix + "/sessions", (req) => {
    const { userId } = requireStudyMember(store, req, requestUserId),
      input = startInput.parse(req.body),
      { course, node } = bind(req, input.courseId);
    const signature = {
      kind: "start",
      certificate: req.user.certificateId,
      input,
    };
    return transaction(() => {
      const repeated = request(userId, input.requestId);
      if (repeated) {
        if (repeated.input_hash !== hash(signature))
          throw tutorError("操作编号已用于其他请求，请重新操作。", 409);
        return { session: view(owned(req, repeated.session_id).state) };
      }
      assertRate(userId);
      let state = latest(userId, req.user.certificateId, course);
      if (!state || input.restart) {
        const count = db
          .prepare(
            "SELECT count(*) n FROM interactive_tutor_sessions WHERE user_id=? AND course_id=? AND created_at>=?",
          )
          .get(
            userId,
            course.id,
            new Date(Date.now() - 86400000).toISOString(),
          ).n;
        if (count >= 20)
          throw tutorError(
            "今天重新开课较多，可以继续已保存的课程。",
            429,
            "TUTOR_DAILY_LIMIT",
          );
        state = engine.start(input.foundation, course.id, "guided");
        view(state);
        db.prepare(
          "INSERT INTO interactive_tutor_sessions VALUES (?,?,?,?,?,?,?,?,?,?)",
        ).run(
          state.id,
          userId,
          node.certificateId,
          node.id,
          course.id,
          course.version,
          node.version,
          state.startedAt,
          state.updatedAt,
          JSON.stringify(state),
        );
      }
      remember(userId, input.requestId, state.id, signature);
      return { session: view(state) };
    });
  });
  route("get", prefix + "/sessions/:id", (req) => ({
    session: view(owned(req, req.params.id).state),
  }));
  route("get", prefix + "/sessions/:id/concepts/:concept", (req) =>
    engine.review(owned(req, req.params.id).state, req.params.concept),
  );
  route("post", prefix + "/sessions/:id/actions", (req) => {
    const input = actionSchema.parse(req.body),
      { userId, course, node } = owned(req, req.params.id);
    return transaction(() => {
      const current = owned(req, req.params.id).state;
      const active = latest(userId, node.certificateId, course);
      if (active.id !== current.id)
        throw tutorError(
          "已在其他页面重新开课，请恢复最新课程。",
          409,
          "TUTOR_CONFLICT",
        );
      const signature = { kind: "action", sessionId: current.id, input },
        repeated = request(userId, input.requestId);
      if (repeated) {
        if (
          repeated.input_hash !== hash(signature) ||
          repeated.session_id !== current.id
        )
          throw tutorError("操作编号已用于其他请求，请重新操作。", 409);
        return { session: view(current) };
      }
      assertRate(userId);
      const next = engine.apply(current, input);
      view(next);
      db.prepare(
        "UPDATE interactive_tutor_sessions SET data=?,updated_at=? WHERE id=?",
      ).run(JSON.stringify(next), next.updatedAt, next.id);
      remember(userId, input.requestId, next.id, signature);
      if (
        next.phase === "complete" &&
        course.id !== "vlan-broadcast-domain" &&
        next.mastery.every((m) => m === "mastered")
      ) {
        const old = db
          .prepare(
            "SELECT completed_at FROM study_progress WHERE user_id=? AND node_id=?",
          )
          .get(userId, node.id);
        if (!old?.completed_at)
          db.prepare(
            `INSERT INTO study_progress (user_id,node_id,certificate_id,version,completed_at,updated_at) VALUES (?,?,?,1,?,?)
          ON CONFLICT(user_id,node_id) DO UPDATE SET version=version+1,completed_at=COALESCE(completed_at,excluded.completed_at),updated_at=excluded.updated_at`,
          ).run(
            userId,
            node.id,
            node.certificateId,
            next.completedAt,
            next.updatedAt,
          );
      }
      return { session: view(next) };
    });
  });
  route("get", prefix + "/usage", (req) => {
    const { userId } = requireStudyMember(store, req, requestUserId);
    const rows = db
      .prepare(
        "SELECT data FROM interactive_tutor_sessions WHERE user_id=? AND certificate_id=?",
      )
      .all(userId, req.user.certificateId)
      .map(unpack);
    const usage = {
      sessions: rows.length,
      aiCalls: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costCny: 0,
      ruleSubmissions: 0,
      contentCacheHits: 0,
    };
    for (const s of rows)
      for (const key of Object.keys(s.usage)) usage[key] += s.usage[key];
    Object.assign(usage, tutorAiUsage(store, userId, req.user.certificateId));
    return { mode: "reviewed-tutor", modelConnected: false, teacherConfigured: authorAiAvailable(store), usage };
  });
  registerTutorTeacher({ route, store, content: studyContent, teacher, owned, latest, view, ai, requireAiService,
    assertRate, remember, request, transaction });
}
