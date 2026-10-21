import crypto from "node:crypto";
import { z } from "zod";

export const planToday = () =>
  new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
export const addPlanDays = (date, n) =>
  new Date(Date.parse(date + "T00:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
const error = (message, status = 400) =>
  Object.assign(new Error(message), { status });
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
  );
export const createPlanSchema = z
  .object({
    requestId: z.string().uuid(),
    expectedPlanId: z.string().uuid().nullable(),
    revision: z.number().int().min(0),
    startDate: date,
    weeks: z.number().int().min(1).max(8),
    dailyCount: z.union([z.literal(10), z.literal(20), z.literal(30)]),
  })
  .strict();
export const addPlanTaskSchema = z
  .object({
    requestId: z.string().uuid(),
    planId: z.string().uuid(),
    revision: z.number().int().min(0),
    date,
    kind: z.enum(["chapter", "wrong"]),
    chapter: z.string().min(1).max(160),
    count: z.number().int().min(1).max(50),
  })
  .strict();
export const cancelPlanTaskSchema = z
  .object({ revision: z.number().int().min(0), canceled: z.boolean() })
  .strict();

// Uses the existing SQLite connection and nested savepoints, including the ordinary grade transaction.
export function createLearningPlans(store) {
  const db = store.db;
  db.exec(`CREATE TABLE IF NOT EXISTS user_learning_plans (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, certificate_id TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1, data TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS active_learning_plan ON user_learning_plans(user_id,certificate_id) WHERE active=1;
  CREATE TABLE IF NOT EXISTS learning_plan_submissions (
    plan_id TEXT NOT NULL REFERENCES user_learning_plans(id), task_id TEXT NOT NULL, question_id TEXT NOT NULL,
    input_hash TEXT NOT NULL, result TEXT NOT NULL, created_at TEXT NOT NULL,
    PRIMARY KEY(plan_id,task_id,question_id)
  );`);
  const unpack = (row) => (row ? JSON.parse(row.data) : null);
  const current = (user, certificate) =>
    unpack(
      db
        .prepare(
          "SELECT data FROM user_learning_plans WHERE user_id=? AND certificate_id=? AND active=1",
        )
        .get(user, certificate),
    );
  const owned = (id, user, certificate) => {
    const plan = unpack(
      db
        .prepare(
          "SELECT data FROM user_learning_plans WHERE id=? AND user_id=? AND certificate_id=?",
        )
        .get(id, user, certificate),
    );
    if (!plan) throw error("没有找到当前账号和证书的学习计划", 404);
    return plan;
  };
  const save = (plan) =>
    db
      .prepare("UPDATE user_learning_plans SET data=? WHERE id=?")
      .run(JSON.stringify(plan), plan.id);
  const transaction = (work) => {
    db.exec("SAVEPOINT learning_plan");
    try {
      const result = work();
      db.exec("RELEASE learning_plan");
      return result;
    } catch (e) {
      db.exec("ROLLBACK TO learning_plan");
      db.exec("RELEASE learning_plan");
      throw e;
    }
  };
  const eligible = (questions) =>
    questions.filter((q) =>
      ["single_choice", "multiple_choice", "true_false"].includes(q.type),
    );
  const questionVersion = (q) =>
    hash([
      q.type,
      q.question,
      q.sharedStem,
      q.images,
      Object.entries(q.options || {}).sort(([a], [b]) => a.localeCompare(b)),
      [...q.answer].sort(),
    ]);
  const taskQuestions = (task, questions) =>
    eligible(questions).filter(
      (q) =>
        task.questionIds.includes(q.id) &&
        task.questionVersions?.[q.id] === questionVersion(q),
    );
  const versionTask = (task, questions) => ({
    ...task,
    questionVersions: Object.fromEntries(
      questions
        .filter((q) => task.questionIds.includes(q.id))
        .map((q) => [q.id, questionVersion(q)]),
    ),
  });
  const groups = (questions) => {
    const map = new Map();
    for (const q of eligible(questions)) {
      if (!map.has(q.chapter)) map.set(q.chapter, []);
      map.get(q.chapter).push(q);
    }
    for (const rows of map.values())
      rows.sort((a, b) => a.id.localeCompare(b.id));
    return map;
  };
  const rows = (planId) =>
    db
      .prepare(
        "SELECT task_id,question_id,result FROM learning_plan_submissions WHERE plan_id=?",
      )
      .all(planId);
  const publicPlan = (plan, questions) => {
    if (!plan) return null;
    const answers = rows(plan.id);
    return {
      id: plan.id,
      certificateId: plan.certificateId,
      revision: plan.revision,
      createdAt: plan.createdAt,
      startDate: plan.startDate,
      weeks: plan.weeks,
      dailyCount: plan.dailyCount,
      tasks: plan.tasks.map((task) => {
        const ids = taskQuestions(task, questions).map((q) => q.id);
        const submitted = answers
          .filter(
            (row) => row.task_id === task.id && ids.includes(row.question_id),
          )
          .map((row) => JSON.parse(row.result));
        return {
          id: task.id,
          date: task.date,
          kind: task.kind,
          chapter: task.chapter,
          count: ids.length,
          adjustedCount: task.questionIds.length - ids.length,
          answered: submitted.length,
          correct: submitted.filter((a) => a.correct).length,
          timeMs: submitted.reduce((n, a) => n + a.timeMs, 0),
          canceled: !!task.canceledAt,
          status: task.canceledAt
            ? "canceled"
            : !ids.length
              ? "unavailable"
              : submitted.length === ids.length
                ? "complete"
                : submitted.length || task.startedAt
                  ? "in-progress"
                  : "pending",
        };
      }),
    };
  };
  const view = (user, certificate, questions) => ({
    today: planToday(),
    plan: publicPlan(current(user, certificate), questions),
    chapters: [...groups(questions)].map(([title, qs]) => ({
      title,
      count: qs.length,
    })),
  });
  const pick = (pool, count, offset = 0) =>
    Array.from(
      { length: Math.min(count, pool.length) },
      (_, i) => pool[(offset + i) % pool.length].id,
    );
  const assertRevision = (plan, revision) => {
    if (plan.revision !== revision)
      throw error("计划已在其他页面更新，请刷新后再试", 409);
  };
  const taskIn = (plan, id) => {
    const task = plan.tasks.find((t) => t.id === id);
    if (!task) throw error("没有找到这项计划任务", 404);
    return task;
  };
  const hash = (input) =>
    crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return {
    view,
    create(user, certificate, questions, input) {
      return transaction(() => {
        const existing = db
          .prepare(
            "SELECT user_id,certificate_id,data FROM user_learning_plans WHERE id=?",
          )
          .get(input.requestId);
        const normalized = {
          startDate: input.startDate,
          weeks: input.weeks,
          dailyCount: input.dailyCount,
          expectedPlanId: input.expectedPlanId,
          revision: input.revision,
        };
        if (existing) {
          const old = unpack(existing);
          if (
            existing.user_id !== user ||
            existing.certificate_id !== certificate ||
            old.creationHash !== hash(normalized)
          )
            throw error("这次操作的编号已使用", 409);
          return publicPlan(old, questions);
        }
        const active = current(user, certificate);
        if ((active?.id || null) !== input.expectedPlanId)
          throw error("计划已创建或调整，请刷新查看最新计划", 409);
        if (active) assertRevision(active, input.revision);
        if (
          input.startDate < addPlanDays(planToday(), -90) ||
          input.startDate > addPlanDays(planToday(), 365)
        )
          throw error("请选择近期的开始日期");
        const chapters = [...groups(questions)];
        if (!chapters.length) throw error("当前证书暂无可用于计划的客观题");
        const allowed = new Set(eligible(questions).map((q) => q.id));
        const wrong = store
          .wrongQuestions(user)
          .filter((q) => allowed.has(q.id));
        const tasks = [];
        for (let n = 0; n < input.weeks * 7; n++) {
          const [chapter, pool] = chapters[n % chapters.length];
          tasks.push({
            id: crypto.randomUUID(),
            date: addPlanDays(input.startDate, n),
            kind: "chapter",
            chapter,
            questionIds: pick(
              pool,
              input.dailyCount,
              Math.floor(n / chapters.length) * input.dailyCount,
            ),
          });
          if (wrong.length)
            tasks.push({
              id: crypto.randomUUID(),
              date: addPlanDays(input.startDate, n),
              kind: "wrong",
              chapter: "错题巩固",
              questionIds: pick(wrong, 5, n * 5),
            });
        }
        const plan = {
          id: input.requestId,
          certificateId: certificate,
          revision: 0,
          startDate: input.startDate,
          weeks: input.weeks,
          dailyCount: input.dailyCount,
          createdAt: new Date().toISOString(),
          creationHash: hash(normalized),
          tasks: tasks.map((task) => versionTask(task, questions)),
        };
        db.prepare(
          "UPDATE user_learning_plans SET active=0 WHERE user_id=? AND certificate_id=?",
        ).run(user, certificate);
        db.prepare("INSERT INTO user_learning_plans VALUES (?,?,?,?,?)").run(
          plan.id,
          user,
          certificate,
          1,
          JSON.stringify(plan),
        );
        return publicPlan(plan, questions);
      });
    },
    add(user, certificate, questions, input) {
      return transaction(() => {
        const plan = owned(input.planId, user, certificate);
        const signature = hash({
          date: input.date,
          kind: input.kind,
          chapter: input.chapter,
          count: input.count,
        });
        const repeated = plan.tasks.find((t) => t.id === input.requestId);
        if (repeated) {
          if (repeated.creationHash !== signature)
            throw error("任务操作编号已使用", 409);
          return publicPlan(plan, questions);
        }
        if (current(user, certificate)?.id !== plan.id)
          throw error("计划已调整，请查看最新计划后再添加任务", 409);
        assertRevision(plan, input.revision);
        if (plan.tasks.length >= 160)
          throw error("当前计划任务较多，请先完成或创建下一轮计划");
        if (
          input.date < plan.startDate ||
          input.date > addPlanDays(plan.startDate, plan.weeks * 7 - 1)
        )
          throw error("任务日期需在当前计划范围内");
        const allowed = new Set(eligible(questions).map((q) => q.id));
        const pool =
          input.kind === "wrong"
            ? store.wrongQuestions(user).filter((q) => allowed.has(q.id))
            : groups(questions).get(input.chapter) || [];
        if (!pool.length) throw error("所选范围暂无可练习题目");
        plan.tasks.push(
          versionTask(
            {
              id: input.requestId,
              date: input.date,
              kind: input.kind,
              chapter: input.kind === "wrong" ? "错题巩固" : input.chapter,
              questionIds: pick(pool, input.count),
              creationHash: signature,
            },
            questions,
          ),
        );
        plan.revision++;
        save(plan);
        return publicPlan(plan, questions);
      });
    },
    cancel(user, certificate, questions, planId, taskId, input) {
      return transaction(() => {
        const plan = owned(planId, user, certificate),
          task = taskIn(plan, taskId);
        if (!!task.canceledAt !== input.canceled) {
          assertRevision(plan, input.revision);
          task.canceledAt = input.canceled ? new Date().toISOString() : null;
          plan.revision++;
          save(plan);
        }
        return publicPlan(plan, questions);
      });
    },
    session(user, certificate, questions, planId, taskId, toPublic) {
      return transaction(() => {
        const plan = owned(planId, user, certificate),
          task = taskIn(plan, taskId);
        if (task.canceledAt) throw error("这项任务已取消，可以先恢复任务", 409);
        const available = new Map(
          taskQuestions(task, questions).map((q) => [q.id, q]),
        );
        const qs = task.questionIds
          .map((id) => available.get(id))
          .filter(Boolean);
        if (!qs.length) throw error("本任务的题目已调整，请选择其他任务", 409);
        if (!task.startedAt) {
          task.startedAt = new Date().toISOString();
          plan.revision++;
          save(plan);
        }
        const responses = Object.fromEntries(
          rows(planId)
            .filter((r) => r.task_id === taskId && available.has(r.question_id))
            .map((r) => {
              const result = JSON.parse(r.result);
              return [
                r.question_id,
                { submitted: true, selected: result.selected, result },
              ];
            }),
        );
        const first = qs.findIndex((q) => !responses[q.id]);
        return {
          questions: qs.map(toPublic),
          title: task.chapter,
          planTask: { planId, taskId },
          progress: { index: Math.max(0, first), responses },
        };
      });
    },
    submit(user, certificate, questions, reference, input, grade) {
      return transaction(() => {
        const plan = owned(reference.planId, user, certificate),
          task = taskIn(plan, reference.taskId);
        const valid = taskQuestions(task, questions).some(
          (q) => q.id === input.questionId,
        );
        if (
          task.canceledAt ||
          !task.questionIds.includes(input.questionId) ||
          !valid
        )
          throw error("这道题不属于当前可作答的计划任务", 409);
        const signature = hash({
          selected: [...input.selected].sort(),
          response: input.response || "",
        });
        const previous = db
          .prepare(
            "SELECT input_hash,result FROM learning_plan_submissions WHERE plan_id=? AND task_id=? AND question_id=?",
          )
          .get(plan.id, task.id, input.questionId);
        if (previous) {
          if (previous.input_hash !== signature)
            throw error("这道计划题目已作答，请继续剩余题目", 409);
          return JSON.parse(previous.result);
        }
        const result = grade();
        db.prepare(
          "INSERT INTO learning_plan_submissions VALUES (?,?,?,?,?,?)",
        ).run(
          plan.id,
          task.id,
          input.questionId,
          signature,
          JSON.stringify(result),
          new Date().toISOString(),
        );
        plan.revision++;
        save(plan);
        return result;
      });
    },
  };
}
