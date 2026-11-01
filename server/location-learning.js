import crypto from "node:crypto";
import { z } from "zod";
import { examPointId, examUnits } from "./exam-selection.js";
import {
  hasCertificateQuestion,
  questionForCertificate,
} from "./certificates.js";

export const locationLearningPolicy = Object.freeze({
  count: 30,
  answerMs: 1000,
  wrongReviewMs: 3000,
  pulseIntervalMs: 1000,
});
const fail = (message, status = 409, code = "LOCATION_LEARNING_REQUIRED") => {
  throw Object.assign(new Error(message), { status, code });
};
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const dayAt = (time) => new Date(time + 8 * 3600000).toISOString().slice(0, 10);
const midnight = (time) =>
  Date.parse(dayAt(time) + "T00:00:00+08:00") + 86400000;
const safeQuestion = (q) => {
  const {
    answer,
    analysis,
    expectedAnswer,
    ownerUserId,
    certificateScopes,
    ...safe
  } = q;
  return safe;
};
const matches = (a, b) =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

// Reuses the application's material-group units; never splits a common stem
// or borrows questions from another leaf to manufacture a 30-question set.
function exactSample(questions, random = false) {
  const units = examUnits(questions);
  if (random)
    for (let i = units.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [units[i], units[j]] = [units[j], units[i]];
    }
  const reachable = Array(31).fill(null);
  reachable[0] = [];
  for (const unit of units)
    for (let n = 30 - unit.length; n >= 0; n--)
      if (reachable[n] !== null && reachable[n + unit.length] === null)
        reachable[n + unit.length] = [...reachable[n], unit];
  return reachable[30]?.flat() || null;
}
export function createLocationLearning(
  store,
  { now = Date.now, questionsForCertificate } = {},
) {
  const db = store.db;
  db.exec(`CREATE TABLE IF NOT EXISTS location_learning_sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,certificate_id TEXT NOT NULL,day TEXT NOT NULL,state TEXT NOT NULL,data TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS location_learning_active ON location_learning_sessions(user_id,certificate_id,day) WHERE state='active';
    CREATE INDEX IF NOT EXISTS location_learning_daily ON location_learning_sessions(user_id,certificate_id,day,state);
    CREATE TABLE IF NOT EXISTS location_learning_permits(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,certificate_id TEXT NOT NULL,day TEXT NOT NULL,expires_at INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);`);
  const tx = (work) => {
    const name = "location_" + crypto.randomBytes(6).toString("hex");
    db.exec("SAVEPOINT " + name);
    try {
      const result = work();
      db.exec("RELEASE " + name);
      return result;
    } catch (error) {
      db.exec("ROLLBACK TO " + name);
      db.exec("RELEASE " + name);
      throw error;
    }
  };
  const unpack = (row) => (row ? JSON.parse(row.data) : null);
  const save = (s) => {
    s.version++;
    db.prepare(
      "UPDATE location_learning_sessions SET state=?,data=? WHERE id=?",
    ).run(s.state, JSON.stringify(s), s.id);
  };
  const unlocked = (user, certificate) =>
    !!db
      .prepare(
        "SELECT 1 FROM location_learning_sessions WHERE user_id=? AND certificate_id=? AND day=? AND state='completed'",
      )
      .get(user, certificate, dayAt(now()));
  const active = (user, certificate) =>
    unpack(
      db
        .prepare(
          "SELECT data FROM location_learning_sessions WHERE user_id=? AND certificate_id=? AND day=? AND state='active'",
        )
        .get(user, certificate, dayAt(now())),
    );
  function pool(user, certificate) {
    const all = questionsForCertificate(certificate, user).filter(
      (q) => q.source !== "ai_generated",
    );
    const valid = new Set(
      all
        .filter(
          (q) =>
            ["single_choice", "multiple_choice", "true_false"].includes(
              q.type,
            ) &&
            q.analysis?.trim() &&
            Array.isArray(q.answer) &&
            q.answer.length &&
            q.answer.every((key) => q.options?.[key]),
        )
        .map((q) => q.id),
    );
    return examUnits(all)
      .filter(
        (unit) =>
          unit.every((q) => valid.has(q.id)) &&
          new Set(unit.map((q) => examPointId(certificate, q))).size === 1,
      )
      .flat();
  }
  function catalog(user, certificate) {
    const points = new Map();
    for (const q of pool(user, certificate)) {
      const id = examPointId(certificate, q);
      if (!points.has(id))
        points.set(id, {
          id,
          name: q.knowledgePoint || "综合练习",
          section: q.knowledgeSection || "",
          chapter: q.chapter || "综合知识",
          questions: [],
        });
      points.get(id).questions.push(q);
    }
    return [...points.values()].map(({ questions, ...row }) => ({
      ...row,
      questionCount: questions.length,
      eligible: !!exactSample(questions),
    }));
  }
  function usable(s, certificate) {
    const snapshot = s.questions[s.index];
    if (!snapshot) return true;
    const raw = store.getQ(snapshot.id);
    if (
      !raw ||
      store.isQuestionHidden(snapshot.id) ||
      !hasCertificateQuestion(raw, certificate)
    )
      return false;
    const current = questionForCertificate(raw, certificate);
    return (
      current.question === snapshot.question &&
      JSON.stringify(current.options) === JSON.stringify(snapshot.options) &&
      matches(current.answer, snapshot.answer)
    );
  }
  function owned(user, certificate, id, validate = true) {
    const s = unpack(
      db
        .prepare(
          "SELECT data FROM location_learning_sessions WHERE id=? AND user_id=? AND certificate_id=?",
        )
        .get(id, user, certificate),
    );
    if (!s) fail("未找到当前账号和证书的专项学习", 404);
    if (s.day !== dayAt(now()))
      fail("已进入新的一天，请重新完成今天的 30 道题");
    if (validate && s.state === "active" && !usable(s, certificate))
      fail("题库已更新，本题已修改或下架，请重新选择知识点");
    return s;
  }
  const view = (s) => {
    if (!s) return null;
    const q = s.state === "active" ? s.questions[s.index] : null,
      feedback = s.phase === "review" ? s.results[s.index] : null;
    return {
      id: s.id,
      version: s.version,
      day: s.day,
      state: s.state,
      point: s.point,
      completedCount: s.index,
      answeredCount: s.results.length,
      correctCount: s.results.filter((r) => r.correct).length,
      total: 30,
      phase: s.phase,
      challenge: s.challenge,
      question: q ? safeQuestion(q) : null,
      feedback: feedback
        ? {
            correct: feedback.correct,
            selected: feedback.selected,
            answer: feedback.answer,
            analysis: feedback.analysis,
          }
        : null,
      activeMs: s.activeMs,
      requiredMs:
        s.phase === "review"
          ? feedback?.correct
            ? 0
            : locationLearningPolicy.wrongReviewMs
          : locationLearningPolicy.answerMs,
      leaseId: s.leaseId,
      sequence: s.sequence,
    };
  };
  const status = (user, certificate, includeCatalog = true) => {
    let session = active(user, certificate);
    if (session && !usable(session, certificate)) {
      session.state = "invalidated";
      save(session);
      session = null;
    }
    return {
      userId: user,
      day: dayAt(now()),
      certificateId: certificate,
      unlocked: unlocked(user, certificate),
      validUntil: new Date(midnight(now())).toISOString(),
      policy: locationLearningPolicy,
      session: view(session),
      ...(includeCatalog ? { points: catalog(user, certificate) } : {}),
    };
  };
  const result = (user, certificate, s) => ({
    userId: user,
    day: dayAt(now()),
    certificateId: certificate,
    unlocked: s.state === "completed" || unlocked(user, certificate),
    validUntil: new Date(midnight(now())).toISOString(),
    policy: locationLearningPolicy,
    session: view(s),
  });
  function current(s, body) {
    if (
      s.state !== "active" ||
      s.questions[s.index]?.id !== body.questionId ||
      s.challenge !== body.challenge ||
      s.phase !== body.phase
    )
      fail("题目状态已改变，请重新读取进度");
  }
  const resetPresence = (s) => {
    s.leaseId = null;
    s.lastPulseAt = null;
    s.sequence = 0;
    s.activeMs = 0;
  };
  return {
    status,
    start(user, certificate, pointId) {
      return tx(() => {
        if (unlocked(user, certificate)) return status(user, certificate);
        const previous = active(user, certificate);
        if (previous) {
          if (previous.point.id !== pointId)
            fail("本轮尚未完成；如需换知识点，请先结束本轮");
          return result(
            user,
            certificate,
            owned(user, certificate, previous.id),
          );
        }
        const point = catalog(user, certificate).find((p) => p.id === pointId);
        if (!point?.eligible)
          fail("该知识点不足 30 道可完整组题的客观题，请选择其他知识点", 400);
        const questions = exactSample(
          pool(user, certificate).filter(
            (q) => examPointId(certificate, q) === pointId,
          ),
          true,
        );
        if (!questions)
          fail("该知识点当前无法完整抽取 30 道题，请选择其他知识点", 400);
        const s = {
          id: crypto.randomUUID(),
          version: 1,
          day: dayAt(now()),
          state: "active",
          point,
          questions,
          index: 0,
          phase: "answer",
          challenge: crypto.randomUUID(),
          results: [],
          activeMs: 0,
          leaseId: null,
          lastPulseAt: null,
          sequence: 0,
        };
        db.prepare(
          "INSERT INTO location_learning_sessions VALUES(?,?,?,?,?,?)",
        ).run(s.id, user, certificate, s.day, s.state, JSON.stringify(s));
        return result(user, certificate, s);
      });
    },
    cancel(user, certificate, id) {
      return tx(() => {
        const s = owned(user, certificate, id, false);
        if (s.state === "active") {
          s.state = "abandoned";
          resetPresence(s);
          save(s);
        }
        return status(user, certificate);
      });
    },
    present(user, certificate, id, body) {
      return tx(() => {
        const s = owned(user, certificate, id);
        current(s, body);
        if (s.leaseId !== body.leaseId) {
          s.leaseId = body.leaseId;
          s.sequence = 0;
          s.lastPulseAt = now();
          save(s);
        }
        return result(user, certificate, s);
      });
    },
    pulse(user, certificate, id, body) {
      return tx(() => {
        const s = owned(user, certificate, id);
        current(s, body);
        if (s.leaseId !== body.leaseId)
          fail(
            "本题已在另一个页面打开，请重新进入当前学习页",
            409,
            "LOCATION_LEARNING_LEASE_CHANGED",
          );
        if (body.sequence <= s.sequence) return result(user, certificate, s);
        if (body.sequence !== s.sequence + 1)
          fail("计时记录顺序已改变，请重新读取进度");
        const time = now(),
          delta = time - s.lastPulseAt;
        if (delta >= 0 && delta <= 5000) s.activeMs += Math.min(delta, 2000);
        s.lastPulseAt = time;
        s.sequence = body.sequence;
        save(s);
        return result(user, certificate, s);
      });
    },
    pause(user, certificate, id, leaseId) {
      return tx(() => {
        const s = owned(user, certificate, id);
        if (s.leaseId === leaseId) {
          s.leaseId = null;
          s.lastPulseAt = null;
          save(s);
        }
        return result(user, certificate, s);
      });
    },
    answer(user, certificate, id, body) {
      return tx(() => {
        const s = owned(user, certificate, id),
          old = s.results.find(
            (r) =>
              r.questionId === body.questionId &&
              r.answerChallenge === body.challenge,
          );
        if (old) {
          if (!matches(old.selected, body.selected))
            fail("本题已提交，重复请求不能更换答案");
          return result(user, certificate, s);
        }
        current(s, { ...body, phase: "answer" });
        if (s.activeMs < locationLearningPolicy.answerMs)
          fail(
            "请先阅读题目，完成本题的前台有效停留时间",
            409,
            "LOCATION_LEARNING_TIME_REQUIRED",
          );
        const q = s.questions[s.index];
        if (
          new Set(body.selected).size !== body.selected.length ||
          body.selected.some((key) => !Object.hasOwn(q.options, key)) ||
          (q.type !== "multiple_choice" && body.selected.length !== 1)
        )
          fail("请选择符合题型的有效选项", 400);
        const graded = store.recordAttempt(
          q.id,
          body.selected,
          s.activeMs,
          "practice",
          user,
          undefined,
          crypto.randomUUID(),
        );
        s.results.push({
          questionId: q.id,
          selected: body.selected,
          correct: graded.correct,
          answer: graded.answer,
          analysis: graded.analysis,
          answerChallenge: body.challenge,
        });
        s.phase = "review";
        s.challenge = crypto.randomUUID();
        resetPresence(s);
        save(s);
        return result(user, certificate, s);
      });
    },
    advance(user, certificate, id, body) {
      return tx(() => {
        const s = owned(user, certificate, id);
        if (
          s.results.some(
            (r) =>
              r.advanceChallenge === body.challenge &&
              r.questionId === body.questionId,
          )
        )
          return result(user, certificate, s);
        current(s, { ...body, phase: "review" });
        const last = s.results[s.index];
        if (!last.correct && s.activeMs < locationLearningPolicy.wrongReviewMs)
          fail(
            "答错也计入完成；请先阅读解析，再确认继续",
            409,
            "LOCATION_LEARNING_REVIEW_REQUIRED",
          );
        last.advanceChallenge = body.challenge;
        s.index++;
        s.phase = "answer";
        s.challenge = crypto.randomUUID();
        resetPresence(s);
        if (s.index === 30) {
          s.state = "completed";
          s.completedAt = new Date(now()).toISOString();
        }
        save(s);
        return result(user, certificate, s);
      });
    },
    permit(user, certificate) {
      return tx(() => {
        if (!unlocked(user, certificate))
          fail("请先完成今天当前证书下的 30 道专项学习题", 403);
        db.prepare(
          "DELETE FROM location_learning_permits WHERE expires_at<? OR used=1",
        ).run(now());
        const permit = crypto.randomBytes(32).toString("base64url"),
          expiresAt = Math.min(now() + 30000, midnight(now()));
        db.prepare(
          "INSERT INTO location_learning_permits VALUES(?,?,?,?,?,0)",
        ).run(hash(permit), user, certificate, dayAt(now()), expiresAt);
        return { permit, expiresAt: new Date(expiresAt).toISOString() };
      });
    },
    consume(user, certificate, permit) {
      return tx(() => {
        if (!unlocked(user, certificate))
          fail("今天的专项学习尚未完成，请先在考匠刷题", 403);
        const used = db
          .prepare(
            "UPDATE location_learning_permits SET used=1 WHERE token_hash=? AND user_id=? AND certificate_id=? AND day=? AND used=0 AND expires_at>?",
          )
          .run(hash(permit), user, certificate, dayAt(now()), now());
        if (!used.changes) fail("学习通行凭据已失效，请从考匠重新进入", 403);
        return {
          allowed: true,
          scope: hash(user + ":" + certificate),
          day: dayAt(now()),
          validForMs: midnight(now()) - now(),
        };
      });
    },
  };
}

export function registerLocationLearning({
  route,
  store,
  certificateQuestions,
  now,
}) {
  const service = createLocationLearning(store, {
    now,
    questionsForCertificate: certificateQuestions,
  });
  const base = "/api/location-learning",
    id = z.string().uuid(),
    question = z
      .object({ questionId: z.string().min(1).max(250), challenge: id })
      .strict();
  const presence = question.extend({
    phase: z.enum(["answer", "review"]),
    leaseId: id,
  });
  const context = (req) => {
    if (!req.user?.id) fail("请先登录后完成专项学习", 401);
    if (!req.user.certificateId) fail("请先选择当前报考证书");
    return [req.user.id, req.user.certificateId];
  };
  route("get", base, (req) => service.status(...context(req)));
  route("post", base + "/start", (req) => {
    const b = z
      .object({ pointId: z.string().min(1).max(120) })
      .strict()
      .parse(req.body);
    return service.start(...context(req), b.pointId);
  });
  for (const name of [
    "present",
    "pulse",
    "pause",
    "answer",
    "advance",
    "cancel",
  ])
    route("post", base + "/:id/" + name, (req) => {
      const schemas = {
        present: presence,
        pulse: presence.extend({ sequence: z.number().int().min(1) }),
        pause: z.object({ leaseId: id }).strict(),
        answer: question.extend({
          selected: z
            .array(z.enum(["A", "B", "C", "D", "E"]))
            .min(1)
            .max(5),
        }),
        advance: question,
        cancel: z.object({}).strict(),
      };
      const body = schemas[name].parse(req.body),
        args = [...context(req), id.parse(req.params.id)];
      return name === "pause"
        ? service.pause(...args, body.leaseId)
        : name === "cancel"
          ? service.cancel(...args)
          : service[name](...args, body);
    });
  route("post", base + "/permit", (req) => {
    z.object({}).strict().parse(req.body);
    return service.permit(...context(req));
  });
  route("post", base + "/consume", (req) => {
    const body = z
      .object({ permit: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
      .strict()
      .parse(req.body);
    return service.consume(...context(req), body.permit);
  });
  return service;
}
