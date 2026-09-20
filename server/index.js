import "dotenv/config";
import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createStore } from "./store.js";
import {
  encrypt,
  masterKey,
  validateBaseUrl,
  redact,
  safeLog,
} from "./security.js";
import { OpenAICompatibleProvider } from "./ai.js";
import {
  certificates,
  hasCertificateQuestion,
  banksForCertificate,
  syllabusForCertificate,
} from "./certificates.js";
import { buildSyllabusProgress, sampleExamQuestions } from "./syllabus.js";
import { findSimilarQuestions } from "./question-similarity.js";
import { validateQuestion } from "./domain.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const publicQuestion = (q) => {
  const { answer, analysis, ownerUserId, aiGroupId, ...rest } = q;
  return rest;
};
const privateQuestion = (q) => {
  const { ownerUserId, aiGroupId, ...rest } = q;
  return rest;
};
export async function createApp(options = {}) {
  const {
    store = createStore(),
    provider = new OpenAICompatibleProvider(store),
    withFrontend = true,
    production = process.argv.includes("--production"),
  } = options;
  // A real app must always resolve settings through the authenticated user.
  // The old DISABLE_AUTH escape hatch made every account share the `local`
  // profile, including its encrypted AI API key. Tests/local fixtures can
  // still opt into anonymous mode explicitly with { authRequired: false }.
  const authRequired = options.authRequired ?? true;
  const app = express();
  const allowedHosts = new Set(
    (process.env.ALLOWED_HOSTS || "127.0.0.1,localhost,::1")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    const host = (req.hostname || "").toLowerCase();
    if (!allowedHosts.has(host))
      return res.status(403).json({ error: "请求主机未被允许" });
    if (req.headers.origin) {
      let origin;
      try {
        origin = new URL(req.headers.origin);
      } catch {
        return res.status(403).json({ error: "拒绝跨来源请求" });
      }
      if (origin.hostname.toLowerCase() !== host)
        return res.status(403).json({ error: "拒绝跨来源请求" });
    }
    if (req.headers["sec-fetch-site"] === "cross-site")
      return res.status(403).json({ error: "拒绝跨站请求" });
    next();
  });
  const route = (method, url, fn) =>
    app[method](url, async (req, res, next) => {
      try {
        res.json(await fn(req, res));
      } catch (e) {
        next(e);
      }
    });
  const cookie = (req, name) =>
    req.headers.cookie
      ?.split(";")
      .map((part) => part.trim().split("="))
      .find(([key]) => key === name)?.[1];
  const sessionCookie = (res, token, expires = true) =>
    res.cookie("netwise_session", token || "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.COOKIE_SECURE === "1",
      path: "/",
      ...(expires ? { maxAge: 30 * 86400000 } : { maxAge: 0 }),
    });
  const userView = (user) => ({
    ...user,
    certificate: certificates.find((c) => c.id === user.certificateId) || null,
  });
  route("get", "/api/auth/me", (req) => {
    const user = store.authUser(cookie(req, "netwise_session"));
    return {
      authenticated: !!user,
      user: user ? userView(user) : null,
      certificates,
    };
  });
  route("post", "/api/auth/register", (req, res) => {
    const body = z
      .object({
        username: z
          .string()
          .trim()
          .min(3)
          .max(40)
          .regex(/^[A-Za-z0-9_-]+$/, "账号只能使用字母、数字、下划线或连字符"),
        password: z.string().min(8).max(128),
      })
      .strict()
      .parse(req.body);
    const user = store.register(body.username, body.password);
    sessionCookie(res, store.createAuthSession(user.id));
    return { user: userView(user), certificates };
  });
  route("post", "/api/auth/login", (req, res) => {
    const body = z
      .object({
        username: z.string().trim().min(3).max(40),
        password: z.string().min(8).max(128),
      })
      .strict()
      .parse(req.body);
    const user = store.authenticate(body.username, body.password);
    if (!user) {
      const error = new Error("账号或密码不正确");
      error.status = 401;
      throw error;
    }
    if (user.bannedAt) {
      const error = new Error(
        `账号已被封禁${user.banReason ? `：${user.banReason}` : ""}`,
      );
      error.status = 403;
      throw error;
    }
    sessionCookie(res, store.createAuthSession(user.id));
    return { user: userView(user), certificates };
  });
  route("post", "/api/auth/logout", (req, res) => {
    store.deleteAuthSession(cookie(req, "netwise_session"));
    sessionCookie(res, null, false);
    return { loggedOut: true };
  });
  app.use("/api", (req, res, next) => {
    if (!authRequired) return next();
    const user = store.authUser(cookie(req, "netwise_session"));
    if (!user) return res.status(401).json({ error: "请先登录" });
    if (user.bannedAt)
      return res.status(403).json({
        error: `账号已被封禁${user.banReason ? `：${user.banReason}` : ""}`,
      });
    req.user = user;
    next();
  });
  route("put", "/api/auth/certificate", (req) => {
    if (!req.user) throw new Error("请先登录");
    const certificateId = z
      .object({ certificateId: z.string() })
      .strict()
      .parse(req.body).certificateId;
    store.selectCertificate(req.user.id, certificateId);
    req.user.certificateId = certificateId;
    return { user: userView(req.user) };
  });
  let aiBusy = false;
  const ai = async (fn) => {
    if (aiBusy) {
      const e = new Error("已有 AI 任务正在执行，请稍候");
      e.status = 409;
      throw e;
    }
    aiBusy = true;
    try {
      return await fn();
    } finally {
      aiBusy = false;
    }
  };
  const requireQ = (id, req) => {
    const q = store.getQ(id);
    if (!q) {
      const e = new Error("题目不存在");
      e.status = 404;
      throw e;
    }
    if (q.source === "ai_generated") {
      const group = q.aiGroupId
        ? store.db
            .prepare(
              "SELECT user_id, certificate_id, shared FROM ai_groups WHERE id=?",
            )
            .get(q.aiGroupId)
        : null;
      const userId = req?.user?.id || "local";
      const certificateId = req?.user?.certificateId;
      if (
        !group ||
        group.user_id !== q.ownerUserId ||
        (certificateId && group.certificate_id !== certificateId) ||
        (group.user_id !== userId && !group.shared) ||
        (!req?.user && q.ownerUserId !== userId)
      ) {
        const e = new Error("题目不存在或不适用于当前证书");
        e.status = 404;
        throw e;
      }
    }
    return q;
  };
  const day = () =>
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
  const dailyKey = (certificateId, date = day()) =>
    `${certificateId || "all"}:${date}`;
  const requestUserId = (req) => {
    if (authRequired && !req.user?.id) throw new Error("请先登录");
    return req.user?.id || "local";
  };
  const settingsSchema = z
    .object({
      baseUrl: z.string().max(1000),
      model: z.string().min(1).max(200),
      apiKey: z.string().min(1).max(500).optional(),
      temperature: z.number().min(0).max(2),
      maxTokens: z.number().int().positive().optional(),
    })
    .strict();
  route("get", "/api/settings", (req) => {
    const userId = requestUserId(req);
    const { keyCipher, maxTokens: _ignoredMaxTokens, ...s } =
      store.settings(userId);
    let encryptionReady = true;
    try {
      masterKey();
    } catch {
      encryptionReady = false;
    }
    return {
      ...s,
      hasKey: !!keyCipher,
      encryptionReady,
      usage: store.usage(userId),
    };
  });
  route("put", "/api/settings", (req) => {
    const userId = requestUserId(req);
    const s = settingsSchema.parse(req.body);
    s.baseUrl = validateBaseUrl(s.baseUrl);
    const old = store.settings(userId);
    const keyCipher = s.apiKey ? encrypt(s.apiKey) : old.keyCipher;
    delete s.apiKey;
    const { maxTokens: _ignoredMaxTokens, ...settings } = s;
    store.saveSettings(userId, { ...settings, keyCipher });
    return { saved: true };
  });
  route("delete", "/api/settings/key", (req) => {
    const userId = requestUserId(req);
    const s = store.settings(userId);
    delete s.keyCipher;
    store.saveSettings(userId, s);
    return { deleted: true };
  });
  route("post", "/api/ai/test", (req) =>
    ai(async () => {
      await provider.call(
        [{ role: "user", content: "Reply with OK." }],
        undefined,
        { userId: requestUserId(req) },
      );
      return { message: "AI 服务连接成功" };
    }),
  );
  const requireAdmin = (req) => {
    if (!req.user?.isAdmin) {
      const error = new Error("只有管理员可以访问此功能");
      error.status = 403;
      throw error;
    }
  };
  const adminQuestion = (question, includeFeedback = false) => ({
    ...question,
    ...(includeFeedback
      ? {
          feedback: store.questionFeedback(question.id),
          feedbackDetails: store.questionFeedbackDetails(question.id),
        }
      : {}),
  });
  const adminTaxonomy = () =>
    certificates.map((certificate) => {
      const questions = store
        .allQ()
        .filter((question) => hasCertificateQuestion(question, certificate.id));
      const chapters = new Map();
      for (const question of questions) {
        if (!chapters.has(question.chapter)) chapters.set(question.chapter, new Set());
        chapters.get(question.chapter).add(question.knowledgePoint);
      }
      for (const module of certificate.syllabus?.modules || []) {
        if (!chapters.has(module.name)) chapters.set(module.name, new Set());
        for (const knowledgePoint of module.knowledgePoints)
          chapters.get(module.name).add(knowledgePoint);
      }
      return {
        id: certificate.id,
        name: certificate.name,
        shortName: certificate.shortName,
        chapters: [...chapters.entries()].map(([name, points]) => ({
          name,
          knowledgePoints: [...points].sort((a, b) => a.localeCompare(b, "zh-CN")),
        })),
      };
    });
  const adminQuestionFilters = (query) => {
    const parsed = z
      .object({
        certificateId: z.string().trim().optional(),
        chapter: z.string().trim().optional(),
        knowledgePoint: z.string().trim().optional(),
        source: z.string().trim().optional(),
        search: z.string().trim().max(200).optional(),
        limit: z.coerce.number().int().min(1).max(500).default(200),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(query);
    const search = parsed.search?.toLowerCase();
    const filtered = store
      .allQ()
      .filter(
        (question) =>
          (!parsed.certificateId ||
            hasCertificateQuestion(question, parsed.certificateId)) &&
          (!parsed.chapter || question.chapter === parsed.chapter) &&
          (!parsed.knowledgePoint ||
            (question.targetKnowledgePoint || question.knowledgePoint) ===
              parsed.knowledgePoint) &&
          (!parsed.source || question.source === parsed.source) &&
          (!search ||
            [question.question, ...Object.values(question.options || {})]
              .join(" ")
              .toLowerCase()
              .includes(search)),
      );
    return {
      ...parsed,
      total: filtered.length,
      questions: filtered.slice(parsed.offset, parsed.offset + parsed.limit),
    };
  };
  route("get", "/api/admin/options", (req) => {
    requireAdmin(req);
    return { certificates: adminTaxonomy() };
  });
  route("get", "/api/admin/overview", (req) => {
    requireAdmin(req);
    return {
      stats: store.adminStats(),
      similarCandidates: findSimilarQuestions(store.allQ(), {
        threshold: 0.86,
        limit: 5,
      }).length,
      recentAudit: store.auditRows(12),
    };
  });
  route("get", "/api/admin/settings", (req) => {
    requireAdmin(req);
    const { keyCipher, ...settings } = store.adminSettings(req.user.id);
    let encryptionReady = true;
    try {
      masterKey();
    } catch {
      encryptionReady = false;
    }
    return {
      ...settings,
      hasKey: !!keyCipher,
      encryptionReady,
      usage: store.usage(req.user.id),
    };
  });
  route("put", "/api/admin/settings", (req) => {
    requireAdmin(req);
    const settings = settingsSchema.parse(req.body);
    settings.baseUrl = validateBaseUrl(settings.baseUrl);
    const previous = store.adminSettings(req.user.id);
    const keyCipher = settings.apiKey
      ? encrypt(settings.apiKey)
      : previous.keyCipher;
    delete settings.apiKey;
    const { maxTokens: _ignoredMaxTokens, ...saved } = settings;
    store.saveAdminSettings(req.user.id, { ...saved, keyCipher });
    store.audit(req.user.id, "admin_settings_saved", "admin_settings", req.user.id, {
      baseUrl: saved.baseUrl,
      model: saved.model,
      keyChanged: !!req.body.apiKey,
    });
    return { saved: true };
  });
  route("delete", "/api/admin/settings/key", (req) => {
    requireAdmin(req);
    const settings = store.adminSettings(req.user.id);
    delete settings.keyCipher;
    store.saveAdminSettings(req.user.id, settings);
    store.audit(req.user.id, "admin_settings_key_deleted", "admin_settings", req.user.id);
    return { deleted: true };
  });
  route("post", "/api/admin/ai/test", (req) =>
    ai(async () => {
      requireAdmin(req);
      await provider.call(
        [{ role: "user", content: "Reply with OK." }],
        store.adminSettings(req.user.id),
        { userId: req.user.id },
      );
      return { message: "管理员 AI 服务连接成功" };
    }),
  );
  route("get", "/api/admin/users", (req) => {
    requireAdmin(req);
    const search = z
      .object({ search: z.string().max(100).optional() })
      .parse(req.query).search || "";
    return { users: store.adminUsers(search) };
  });
  route("put", "/api/admin/users/:id/ban", (req) => {
    requireAdmin(req);
    const body = z
      .object({ banned: z.boolean(), reason: z.string().trim().max(200).optional() })
      .strict()
      .parse(req.body);
    const target = store.adminUsers().find((user) => user.id === req.params.id);
    if (!target) {
      const error = new Error("用户不存在");
      error.status = 404;
      throw error;
    }
    if (target.id === req.user.id)
      throw new Error("不能封禁当前管理员账号");
    if (target.isAdmin)
      throw new Error("不能封禁其他管理员账号");
    if (!store.setUserBanned(target.id, body.banned, body.reason)) {
      const error = new Error("用户状态更新失败");
      error.status = 404;
      throw error;
    }
    store.audit(req.user.id, body.banned ? "user_banned" : "user_unbanned", "user", target.id, {
      username: target.username,
      reason: body.reason || "",
    });
    return { saved: true, user: store.adminUsers().find((user) => user.id === target.id) };
  });
  route("get", "/api/admin/questions/similar", (req) => {
    requireAdmin(req);
    const parsed = z
      .object({
        certificateId: z.string().trim().optional(),
        threshold: z.coerce.number().min(0.5).max(0.99).default(0.78),
        limit: z.coerce.number().int().min(1).max(500).default(100),
      })
      .parse(req.query);
    const questions = store
      .allQ()
      .filter(
        (question) =>
          !parsed.certificateId ||
          hasCertificateQuestion(question, parsed.certificateId),
      );
    return {
      threshold: parsed.threshold,
      pairs: findSimilarQuestions(questions, parsed).map((pair) => ({
        score: pair.score,
        left: adminQuestion(pair.left),
        right: adminQuestion(pair.right),
      })),
    };
  });
  route("get", "/api/admin/questions", (req) => {
    requireAdmin(req);
    const { questions, ...filters } = adminQuestionFilters(req.query);
    return {
      ...filters,
      questions: questions.map((question) => adminQuestion(question, true)),
    };
  });
  route("get", "/api/admin/feedback", (req) => {
    requireAdmin(req);
    const parsed = z
      .object({
        certificateId: z.string().trim().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);
    const filtered = store
      .questionFeedbackRows()
      .filter(
        ({ question }) =>
          !parsed.certificateId ||
          hasCertificateQuestion(question, parsed.certificateId),
      );
    return {
      ...parsed,
      total: filtered.length,
      feedback: filtered
        .slice(parsed.offset, parsed.offset + parsed.limit)
        .map(({ question, ...row }) => ({
          ...row,
          question: adminQuestion(question),
        })),
    };
  });
  route("put", "/api/admin/questions/:id", (req) => {
    requireAdmin(req);
    const body = z
      .object({
        type: z.enum(["single_choice", "multiple_choice", "true_false"]),
        question: z.string().trim().min(10).max(2000),
        options: z
          .object({
            A: z.string().trim().min(1).max(800),
            B: z.string().trim().min(1).max(800),
            C: z.string().trim().min(1).max(800).optional(),
            D: z.string().trim().min(1).max(800).optional(),
            E: z.string().trim().min(1).max(800).optional(),
          })
          .strict(),
        answer: z
          .array(z.enum(["A", "B", "C", "D", "E"]))
          .min(1)
          .max(5),
        analysis: z.string().trim().min(12).max(5000),
        chapter: z.string().trim().min(1).max(100),
        knowledgePoint: z.string().trim().min(1).max(100),
        difficulty: z.enum(["easy", "medium", "hard"]),
        tags: z.array(z.string().trim().max(50)).min(1).max(12).optional(),
      })
      .strict()
      .parse(req.body);
    const existing = store.getQ(req.params.id);
    if (!existing) {
      const error = new Error("题目不存在或已经删除");
      error.status = 404;
      throw error;
    }
    const candidate = {
      ...body,
      tags: body.tags || existing.tags || ["管理员修订"],
      ...(existing.certificates ? { certificates: existing.certificates } : {}),
      ...(existing.stage ? { stage: existing.stage } : {}),
    };
    const validated = validateQuestion(
      candidate,
      store.allQ().filter((question) => question.id !== existing.id),
    );
    const saved = store.updateQuestion(existing.id, {
      ...validated,
      ...(Object.prototype.hasOwnProperty.call(existing, "targetKnowledgePoint")
        ? { targetKnowledgePoint: validated.knowledgePoint }
        : {}),
    });
    store.audit(req.user.id, "question_updated", "question", existing.id, {
      chapter: saved.chapter,
      knowledgePoint: saved.targetKnowledgePoint || saved.knowledgePoint,
    });
    return { question: adminQuestion(saved, true) };
  });
  route("delete", "/api/admin/feedback", (req) => {
    requireAdmin(req);
    const body = z
      .object({
        userId: z.string().trim().min(1).max(200),
        questionId: z.string().trim().min(1).max(200),
      })
      .strict()
      .parse(req.body);
    const feedback = store
      .questionFeedbackRows()
      .find(
        (row) =>
          row.userId === body.userId && row.questionId === body.questionId,
      );
    if (!feedback) {
      const error = new Error("反馈不存在或已经取消");
      error.status = 404;
      throw error;
    }
    store.deleteQuestionFeedback(body.userId, body.questionId);
    store.audit(req.user.id, "question_feedback_cancelled", "question", body.questionId, {
      userId: body.userId,
      kind: feedback.kind,
    });
    return { deleted: true };
  });
  route("delete", "/api/admin/questions/:id", (req) => {
    requireAdmin(req);
    const body = z
      .object({ confirm: z.literal(true), reason: z.string().trim().max(200).optional() })
      .strict()
      .parse(req.body);
    const question = store.getQ(req.params.id);
    if (!question) {
      const error = new Error("题目不存在或已经删除");
      error.status = 404;
      throw error;
    }
    store.deleteQuestion(question.id, req.user.id, body.reason);
    store.audit(req.user.id, "question_deleted", "question", question.id, {
      source: question.source,
      chapter: question.chapter,
      knowledgePoint: question.knowledgePoint,
      reason: body.reason || "",
    });
    return { deleted: true, questionId: question.id };
  });
  route("get", "/api/admin/audit", (req) => {
    requireAdmin(req);
    const limit = z
      .object({ limit: z.coerce.number().int().min(1).max(200).default(50) })
      .parse(req.query).limit;
    return { entries: store.auditRows(limit) };
  });
  route("post", "/api/admin/questions/generate", (req) =>
    ai(async () => {
      requireAdmin(req);
      const body = z
        .object({
          certificateId: z.string().min(1),
          chapter: z.string().min(1).max(100),
          knowledgePoint: z.string().min(1).max(100),
          count: z.number().int().min(1).max(20),
          difficulty: z.enum(["easy", "medium", "hard"]).optional(),
        })
        .strict()
        .parse(req.body);
      const certificate = certificates.find((item) => item.id === body.certificateId);
      if (!certificate) throw new Error("证书不存在");
      const taxonomy = adminTaxonomy().find((item) => item.id === body.certificateId);
      const chapter = taxonomy?.chapters.find((item) => item.name === body.chapter);
      if (!chapter?.knowledgePoints.includes(body.knowledgePoint))
        throw new Error("章节或知识点不属于当前证书");
      const source = store
        .allQ()
        .find(
          (question) =>
            hasCertificateQuestion(question, body.certificateId) &&
            question.chapter === body.chapter &&
            (question.targetKnowledgePoint || question.knowledgePoint) ===
              body.knowledgePoint,
        ) ||
        store
          .allQ()
          .find(
            (question) =>
              hasCertificateQuestion(question, body.certificateId) &&
              question.chapter === body.chapter,
          );
      if (!source) throw new Error("当前章节还没有可供 AI 参考的题目");
      const settings = store.adminSettings(req.user.id);
      if (!settings.keyCipher) throw new Error("请先在管理员面板配置 API Key");
      const generated = await provider.generateBankExpansion(
        { ...source, knowledgePoint: body.knowledgePoint },
        body.count,
        {
          userId: req.user.id,
          certificateId: body.certificateId,
          settings,
          difficulty: body.difficulty,
          existing: store.allQ(),
          onProgress: (event) => {},
        },
      );
      const prepared = generated.map((question) => ({
        ...question,
        id: `admin-${crypto.randomUUID()}`,
        source: "admin_generated",
        sourceLabel: "管理员 AI 扩充题",
        certificates: [body.certificateId],
        ownerUserId: req.user.id,
        adminGeneratedAt: new Date().toISOString(),
        targetKnowledgePoint: body.knowledgePoint,
      }));
      const saved = store.addAdminQuestions(prepared);
      store.audit(req.user.id, "questions_generated", "knowledge_point", body.knowledgePoint, {
        certificateId: body.certificateId,
        chapter: body.chapter,
        requested: body.count,
        inserted: saved.inserted.length,
        skipped: saved.skipped.length,
      });
      return {
        requested: body.count,
        inserted: saved.inserted.length,
        skipped: saved.skipped,
        questions: saved.inserted,
      };
    }),
  );
  const certificateQuestions = (
    certificateId,
    userId,
    includeAttemptedShared = false,
  ) => {
    const attempted = includeAttemptedShared
      ? new Set(store.allA(userId).map((attempt) => attempt.questionId))
      : new Set();
    return store
      .allQ()
      .filter(
        (q) =>
          (!certificateId || hasCertificateQuestion(q, certificateId)) &&
          (q.source !== "ai_generated" ||
            q.ownerUserId === (userId || "local") ||
            attempted.has(q.id)),
      );
  };
  const requireCertificate = (req) => {
    if (authRequired && !req.user?.certificateId) {
      const error = new Error("请先选择报考证书");
      error.status = 409;
      throw error;
    }
    return req.user?.certificateId;
  };
  route("get", "/api/questions", (req) =>
    certificateQuestions(requireCertificate(req), req.user?.id)
      .filter(
        (q) =>
          (!req.query.chapter || q.chapter === req.query.chapter) &&
          (!req.query.knowledgePoint ||
            q.knowledgePoint === req.query.knowledgePoint) &&
          (!req.query.source || q.source === req.query.source),
      )
      .map(publicQuestion),
  );
  route("get", "/api/questions/shared-ai", (req) => {
    const certificateId = requireCertificate(req);
    const userId = req.user?.id || "local";
    const groupIds = new Set(
      store.db
        .prepare(
          "SELECT id FROM ai_groups WHERE certificate_id=? AND user_id<>? AND shared=1",
        )
        .all(certificateId, userId)
        .map((group) => group.id),
    );
    return store
      .allQ()
      .filter(
        (q) =>
          q.source === "ai_generated" &&
          groupIds.has(q.aiGroupId) &&
          hasCertificateQuestion(q, certificateId),
      )
      .map((q) => ({
        ...publicQuestion(q),
        sharedAi: true,
        sourceLabel: "其他用户生成的 AI 题",
        feedback: store.questionFeedback(q.id, userId),
      }));
  });
  route("post", "/api/questions/:id/feedback", (req) => {
    const q = requireQ(req.params.id, req);
    const body = z
      .object({
        kind: z.enum([
          "helpful",
          "wrong_answer",
          "ambiguous",
          "duplicate",
          "other",
        ]),
        note: z.string().trim().max(500).optional(),
      })
      .strict()
      .parse(req.body);
    if (q.source !== "ai_generated" && body.kind === "helpful") {
      const error = new Error("普通题目只能提交异常反馈");
      error.status = 400;
      throw error;
    }
    store.saveQuestionFeedback(
      req.user?.id || "local",
      q.id,
      body.kind,
      body.note,
    );
    return {
      saved: true,
      feedback: store.questionFeedback(q.id, req.user?.id || "local"),
    };
  });
  route("get", "/api/questions/:id", (req) =>
    publicQuestion(requireQ(req.params.id, req)),
  );
  route("post", "/api/questions/:id/reveal", (req) => {
    const q = requireQ(req.params.id, req);
    return { answer: q.answer, analysis: q.analysis };
  });
  route("post", "/api/attempts", (req) => {
    const b = z
      .object({
        questionId: z.string(),
        selected: z
          .array(z.enum(["A", "B", "C", "D", "E"]))
          .min(1)
          .max(5),
        timeMs: z.number().int().min(0).max(86400000),
      })
      .strict()
      .parse(req.body);
    if (new Set(b.selected).size !== b.selected.length)
      throw new Error("答案不能重复");
    const q = requireQ(b.questionId, req);
    if (
      (q.type === "single_choice" || q.type === "true_false") &&
      b.selected.length !== 1
    )
      throw new Error("单选题和判断题只能选择一项");
    return store.recordAttempt(
      b.questionId,
      b.selected,
      b.timeMs,
      "practice",
      req.user?.id || "local",
    );
  });
  route("get", "/api/wrong", (req) => {
    const certificateId = requireCertificate(req);
    return store
      .wrongQuestions(req.user?.id)
      .filter(
        (question) =>
          !certificateId || hasCertificateQuestion(question, certificateId),
      )
      .map(privateQuestion);
  });
  route("get", "/api/queue", (req) =>
    store.db
      .prepare(
        "SELECT question_id FROM queue WHERE completed=0 AND user_id=? ORDER BY rowid",
      )
      .all(req.user?.id || "local")
      .map((r) => requireQ(r.question_id, req))
      .filter(
        (question) =>
          !requireCertificate(req) ||
          hasCertificateQuestion(question, requireCertificate(req)),
      )
      .map(publicQuestion),
  );
  route("get", "/api/ai/groups", (req) =>
    store.aiGroups(req.user?.id || "local", req.user?.certificateId),
  );
  route("put", "/api/ai/groups/:id/share", (req) => {
    const shared = z
      .object({ shared: z.boolean() })
      .strict()
      .parse(req.body).shared;
    if (
      !store.setAiGroupShared(
        req.params.id,
        req.user?.id || "local",
        shared,
      )
    ) {
      const error = new Error("题组不存在或不属于当前账号");
      error.status = 404;
      throw error;
    }
    return { saved: true, shared };
  });
  route("get", "/api/dashboard", (req) => {
    const certificateId = requireCertificate(req);
    const userId = requestUserId(req);
    const currentQuestions = certificateQuestions(
        certificateId,
        userId,
        true,
      ),
      currentIds = new Set(currentQuestions.map((question) => question.id)),
      attempts = store
        .allA(userId)
        .filter((attempt) => currentIds.has(attempt.questionId)),
      mastery = store.mastery(currentIds, userId),
      today = day(),
      todayAttempts = attempts.filter(
        (a) =>
          new Date(a.createdAt).toLocaleDateString("en-CA", {
            timeZone: "Asia/Shanghai",
          }) === today,
      ),
      wrong = store
        .wrongQuestions(userId)
        .filter((question) => currentIds.has(question.id)),
      syllabus = syllabusForCertificate(certificateId),
      syllabusProgress = buildSyllabusProgress(
        currentQuestions,
        attempts,
        syllabus,
      );
    const chapters = syllabusProgress
      ? syllabusProgress.modules
      : [...new Set(currentQuestions.map((q) => q.chapter))].map((name) => {
          const a = attempts.filter((attempt) => attempt.chapter === name);
          return {
            name,
            total: currentQuestions.filter((q) => q.chapter === name).length,
            attempted: new Set(a.map((attempt) => attempt.questionId)).size,
            accuracy: a.length
              ? a.filter((attempt) => attempt.correct).length / a.length
              : null,
          };
        });
    return {
      todayCount: todayAttempts.length,
      totalCount: attempts.length,
      accuracy: attempts.length
        ? attempts.filter((a) => a.correct).length / attempts.length
        : null,
      minutes: Math.round(
        todayAttempts.reduce((s, a) => s + a.timeMs, 0) / 60000,
      ),
      dueCount: wrong.filter((q) => q.review?.dueAt <= new Date().toISOString())
        .length,
      wrongCount: wrong.length,
      mastery,
      chapters,
      aiConfigured: !!store.settings(userId).keyCipher,
      aiBusy,
      plan: store.getDaily(userId, dailyKey(certificateId, today)),
      user: req.user ? userView(req.user) : null,
      certificate: certificates.find((c) => c.id === certificateId) || null,
      banks: banksForCertificate(certificateId),
      community: store.communityStats(certificateId, userId),
      syllabus: syllabusProgress,
      recentDays: Array.from({ length: 7 }, (_, i) => {
        const d = new Date(Date.now() - (6 - i) * 86400000).toLocaleDateString(
          "en-CA",
          { timeZone: "Asia/Shanghai" },
        );
        return {
          day: d,
          count: attempts.filter(
            (a) =>
              new Date(a.createdAt).toLocaleDateString("en-CA", {
                timeZone: "Asia/Shanghai",
              }) === d,
          ).length,
        };
      }),
    };
  });
  route("post", "/api/ai/analyze", (req) =>
    ai(() =>
      provider.analyzeWeakness(
        requireQ(
          z.object({ questionId: z.string() }).parse(req.body).questionId,
          req,
        ),
        req.user?.id || "local",
      ),
    ),
  );
  route("post", "/api/ai/train", (req) =>
    ai(async () => {
      const b = z
        .object({
          questionId: z.string(),
          count: z.union([
            z.literal(1),
            z.literal(3),
            z.literal(5),
            z.literal(10),
          ]),
          harder: z.boolean().optional(),
        })
        .strict()
        .parse(req.body);
      const batch = await provider.generatePracticeSet(
        requireQ(b.questionId, req),
        b.count,
        b.harder,
        undefined,
        {
          userId: req.user?.id || "local",
          certificateId: req.user?.certificateId,
        },
      );
      return { ...batch, questions: batch.questions.map(publicQuestion) };
    }),
  );
  app.post("/api/ai/train/stream", async (req, res, next) => {
    const send = (event) => {
      if (res.writableEnded || res.destroyed) return;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    try {
      if (aiBusy) {
        const error = new Error("已有 AI 任务正在执行，请稍候");
        error.status = 409;
        throw error;
      }
      const b = z
        .object({
          questionId: z.string(),
          count: z.union([
            z.literal(1),
            z.literal(3),
            z.literal(5),
            z.literal(10),
          ]),
          harder: z.boolean().optional(),
        })
        .strict()
        .parse(req.body);
      const question = requireQ(b.questionId, req);
      res.status(200);
      res.set({
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.flushHeaders?.();
      send({ type: "progress", message: `准备生成 ${b.count} 道针对题` });
      const heartbeat = setInterval(
        () =>
          send({
            type: "progress",
            stage: "heartbeat",
            message: "AI 仍在处理中，请稍候…",
          }),
        12000,
      );
      aiBusy = true;
      try {
        const batch = await provider.generatePracticeSet(
          question,
          b.count,
          b.harder,
          (event) => send({ type: "progress", ...event }),
          {
            userId: req.user?.id || "local",
            certificateId: req.user?.certificateId,
          },
        );
        send({
          type: "done",
          result: { ...batch, questions: batch.questions.map(publicQuestion) },
        });
      } finally {
        clearInterval(heartbeat);
        aiBusy = false;
      }
      res.end();
    } catch (error) {
      if (!res.headersSent) return next(error);
      send({ type: "error", message: redact(error.message) });
      res.end();
    }
  });
  route("post", "/api/ai/teacher", (req) =>
    ai(async () => {
      const b = z
        .object({
          questionId: z.string(),
          action: z.enum([
            "为什么我错了？",
            "详细讲解",
            "换一种方法解释",
            "举一个实际例子",
            "给我提示",
          ]),
          selected: z
            .array(z.enum(["A", "B", "C", "D"]))
            .max(4)
            .default([]),
          hintLevel: z.number().int().min(0).max(3).default(0),
        })
        .strict()
        .parse(req.body);
      if (b.action === "给我提示" && !b.hintLevel)
        throw new Error("提示级别必须为1至3");
      return provider.explainQuestion(
        requireQ(b.questionId, req),
        b.action,
        b.selected,
        b.action === "给我提示" ? b.hintLevel : 0,
        req.user?.id || "local",
      );
    }),
  );
  async function generateDaily(userId, certificateId, force = false) {
    const key = dailyKey(certificateId);
    if (!force && store.getDaily(userId, key))
      return store.getDaily(userId, key);
    return ai(async () => {
      const questionIds = certificateQuestions(certificateId, userId).map(
        (question) => question.id,
      );
      const plan = {
        ...(await provider.dailyPlan(questionIds, userId)),
        generatedAt: new Date().toISOString(),
        source: "ai",
      };
      store.saveDaily(userId, key, plan);
      return plan;
    });
  }
  route("post", "/api/ai/daily", (req) =>
    generateDaily(
      requestUserId(req),
      requireCertificate(req),
      req.body?.refresh === true,
    ),
  );
  route("post", "/api/exams", (req) => {
    const b = z
      .object({ count: z.number().int().min(5).max(400).default(20) })
      .parse(req.body || {});
    const certificateId = requireCertificate(req);
    const pool = certificateQuestions(certificateId, req.user?.id).filter(
      (q) => q.source !== "ai_generated",
    );
    const syllabus = syllabusForCertificate(certificateId);
    const examCount = syllabus?.examBlueprint?.questionCount || b.count;
    if (!syllabus?.examBlueprint && b.count > 75)
      throw new Error("普通模拟考试最多 75 道题");
    const qs = sampleExamQuestions(pool, syllabus, examCount);
    const durationMinutes = syllabus?.examBlueprint?.durationMinutes;
    const session = {
      id: crypto.randomUUID(),
      certificateId,
      syllabusVersion: syllabus?.version || null,
      questionIds: qs.map((q) => q.id),
      distribution: Object.fromEntries(
        [...new Set(qs.map((q) => q.chapter))].map((chapter) => [
          chapter,
          qs.filter((q) => q.chapter === chapter).length,
        ]),
      ),
      answers: {},
      createdAt: new Date().toISOString(),
      expiresAt: new Date(
        Date.now() + (durationMinutes ? durationMinutes * 60000 : qs.length * 120000),
      ).toISOString(),
      submitted: false,
    };
    store.saveSession(session);
    return { ...session, questions: qs.map(publicQuestion) };
  });
  route("get", "/api/exams/:id", (req) => {
    const s = store.session(req.params.id);
    if (!s) throw new Error("考试不存在");
    return {
      ...s,
      questions: s.questionIds.map((id) => publicQuestion(requireQ(id))),
    };
  });
  const validateExamAnswers = (s, raw) => {
    const b = z
      .record(z.string(), z.array(z.enum(["A", "B", "C", "D", "E"])).max(5))
      .parse(raw);
    if (Object.keys(b).some((id) => !s.questionIds.includes(id)))
      throw new Error("考试答案包含未知题目");
    for (const [id, selected] of Object.entries(b))
      if (
        new Set(selected).size !== selected.length ||
        (["single_choice", "true_false"].includes(requireQ(id).type) &&
          selected.length > 1)
      )
        throw new Error("考试答案格式不正确");
    return b;
  };
  route("put", "/api/exams/:id/answers", (req) => {
    const s = store.session(req.params.id);
    if (!s || s.submitted) throw new Error("考试已结束或不存在");
    if (Date.now() > new Date(s.expiresAt)) return { expired: true };
    s.answers = validateExamAnswers(s, req.body.answers);
    store.saveSession(s);
    return { saved: true };
  });
  route("post", "/api/exams/:id/submit", (req) => {
    const s = store.session(req.params.id);
    if (!s) throw new Error("考试不存在");
    if (s.submitted) return s.result;
    const examBlueprint = syllabusForCertificate(s.certificateId)?.examBlueprint;
    const durationMs = examBlueprint?.durationMinutes
      ? examBlueprint.durationMinutes * 60000
      : s.questionIds.length * 120000;
    const answers =
      Date.now() > new Date(s.expiresAt)
        ? s.answers
        : validateExamAnswers(s, req.body.answers);
    const elapsed = Math.max(
      0,
      Math.min(
        Date.now() - new Date(s.createdAt),
        durationMs,
      ),
    );
    store.db.exec("BEGIN");
    try {
      const results = s.questionIds.map((id) => ({
        q: requireQ(id),
        selected: answers[id] || [],
      }));
      s.result = {
        results: results.map(({ q, selected }) => ({
          ...store.recordAttempt(
            q.id,
            selected,
            Math.round(elapsed / s.questionIds.length),
            "exam",
          ),
          question: q.question,
        })),
        elapsed,
      };
      const correctCount = s.result.results.filter((r) => r.correct).length;
      s.result.score = examBlueprint
        ? correctCount
        : Math.round((correctCount / s.questionIds.length) * 100);
      s.result.maxScore = examBlueprint ? s.questionIds.length : 100;
      if (examBlueprint?.passingScore !== undefined) {
        s.result.passingScore = examBlueprint.passingScore;
        s.result.passed = s.result.score >= examBlueprint.passingScore;
      }
      s.submitted = true;
      store.saveSession(s);
      store.db.exec("COMMIT");
      return s.result;
    } catch (e) {
      store.db.exec("ROLLBACK");
      throw e;
    }
  });
  app.use("/api", (req, res) => res.status(404).json({ error: "接口不存在" }));
  app.use((err, req, res, next) => {
    res.status(err.status || 400).json({
      error:
        err.type === "entity.parse.failed"
          ? "请求 JSON 格式不合法"
          : err instanceof z.ZodError
            ? "输入参数不符合要求，请检查字段范围"
            : redact(err.message).slice(0, 500),
    });
  });
  if (withFrontend) {
    if (production) {
      app.use(express.static(path.join(root, "dist")));
      app.get("/{*path}", (req, res) =>
        res.sendFile(path.join(root, "dist/index.html")),
      );
    } else {
      const { createServer } = await import("vite");
      const vite = await createServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      app.locals.vite = vite;
    }
  }
  const dailyRetryAt = new Map();
  const timer = setInterval(() => {
    if (aiBusy) return;
    const now = Date.now();
    const candidates = authRequired
      ? store.allUsers().filter((user) => user.certificateId)
      : [{ id: "local", certificateId: undefined }];
    const candidate = candidates.find(
      (user) =>
        now >= (dailyRetryAt.get(user.id) || 0) &&
        store.settings(user.id).keyCipher &&
        !store.getDaily(user.id, dailyKey(user.certificateId)) &&
        store.allA(user.id).length,
    );
    if (!candidate) return;
    dailyRetryAt.set(candidate.id, now + 3600000);
    generateDaily(candidate.id, candidate.certificateId).catch(() => {});
  }, 60000);
  timer.unref();
  app.locals.store = store;
  app.locals.stop = () => clearInterval(timer);
  return app;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const app = await createApp();
  const port = Number(process.env.PORT) || 5173;
  const bindHost = process.env.BIND_HOST || "127.0.0.1";
  app.listen(port, bindHost, () =>
    safeLog(`考匠 AceExam ready: http://${bindHost}:${port}`),
  );
}
