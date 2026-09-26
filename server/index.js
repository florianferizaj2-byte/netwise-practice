import "dotenv/config";
import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
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
import { findSimilarQuestions, questionSimilarity } from "./question-similarity.js";
import { questionImageSchema, validateQuestion } from "./domain.js";
import { questionPage } from "./question-paging.js";
import { studySummary } from "./study-summary.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const mobileRelease = () => {
  const latestVersion = process.env.MOBILE_LATEST_VERSION || "0.2.8";
  const minimumVersion =
    process.env.MOBILE_MINIMUM_VERSION || "0.2.7";
  return {
    latestVersion,
    minimumVersion,
    downloadUrl:
      process.env.MOBILE_DOWNLOAD_URL ||
      `/downloads/kaojiang-v${latestVersion}.apk`,
    releaseNotes:
      process.env.MOBILE_RELEASE_NOTES ||
      "优化页面切换与题目加载；支持按账号安全缓存题库目录和已访问题目，断网可继续阅读缓存内容。",
  };
};
async function exchangeWechatMiniProgramCode(code) {
  const appid = process.env.WECHAT_MINIPROGRAM_APP_ID?.trim();
  const secret = process.env.WECHAT_MINIPROGRAM_APP_SECRET?.trim();
  if (!appid || !secret) {
    const error = new Error("微信小程序登录尚未配置 AppID 和 AppSecret");
    error.status = 503;
    error.code = "WECHAT_MINIPROGRAM_NOT_CONFIGURED";
    throw error;
  }
  const endpoint = new URL("https://api.weixin.qq.com/sns/jscode2session");
  endpoint.search = new URLSearchParams({
    appid,
    secret,
    js_code: code,
    grant_type: "authorization_code",
  }).toString();
  const response = await fetch(endpoint);
  let data;
  try {
    data = await response.json();
  } catch {
    const error = new Error("微信登录服务返回了无法识别的响应");
    error.status = 502;
    throw error;
  }
  if (!response.ok || data?.errcode || !data?.openid) {
    const error = new Error(
      data?.errmsg ? `微信登录失败：${data.errmsg}` : "微信登录失败，请稍后重试",
    );
    error.status = 502;
    throw error;
  }
  return {
    appid,
    openid: String(data.openid),
    unionid: data.unionid ? String(data.unionid) : null,
  };
}
const versionParts = (value) => {
  const match = String(value || "").trim().match(/^v?(\d+(?:\.\d+){0,3})/i);
  return match
    ? match[1].split(".").map((part) => Number(part) || 0)
    : [0];
};
const compareVersions = (left, right) => {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference) return difference > 0 ? 1 : -1;
  }
  return 0;
};
const publicQuestion = (q) => {
  const { answer, analysis, expectedAnswer, ownerUserId, aiGroupId, ...rest } = q;
  return rest;
};
const privateQuestion = (q) => {
  const { ownerUserId, aiGroupId, ...rest } = q;
  return rest;
};
const communityImageTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/gif", ".gif"],
  ["image/webp", ".webp"],
]);
const communityImageMaxBytes = 6 * 1024 * 1024;
const communityMessageMaxLength = 2000;
function decodeCommunityImage(image) {
  if (!image) return null;
  const extension = communityImageTypes.get(image.mimeType);
  if (!extension) throw new Error("社区只支持 JPG、PNG、GIF 或 WebP 图片");
  const raw = image.data
    .replace(/^data:image\/(?:jpeg|png|gif|webp);base64,/i, "")
    .replace(/\s/g, "");
  if (!raw || !/^[A-Za-z0-9+/]*={0,2}$/.test(raw))
    throw new Error("图片数据格式不正确");
  let buffer;
  try {
    buffer = Buffer.from(raw, "base64");
  } catch {
    throw new Error("图片数据无法读取");
  }
  if (!buffer.length || buffer.length > communityImageMaxBytes)
    throw new Error("单张图片不能超过 6MB");
  const isJpeg = image.mimeType === "image/jpeg" && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  const isPng = image.mimeType === "image/png" && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isGif = image.mimeType === "image/gif" && buffer.subarray(0, 4).toString("ascii") === "GIF8";
  const isWebp = image.mimeType === "image/webp" && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if (!isJpeg && !isPng && !isGif && !isWebp)
    throw new Error("图片内容与声明的格式不一致");
  return { buffer, extension, mimeType: image.mimeType };
}
export async function createApp(options = {}) {
  const {
    store = createStore(),
    provider = new OpenAICompatibleProvider(store),
    withFrontend = true,
    production = process.argv.includes("--production"),
    wechatCodeExchange = exchangeWechatMiniProgramCode,
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
  app.use(express.json({ limit: "12mb" }));
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
  const bearerToken = (req) => {
    const header = req.headers.authorization;
    if (typeof header !== "string") return null;
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match?.[1] || null;
  };
  const requestToken = (req) => bearerToken(req) || cookie(req, "netwise_session");
  const isMobileClient = (req) => req.get("x-client")?.toLowerCase() === "mobile";
  const isTokenClient = (req) =>
    ["mobile", "miniprogram"].includes(req.get("x-client")?.toLowerCase());
  app.use("/api", (req, res, next) => {
    if (req.path === "/mobile/version" || !isMobileClient(req)) return next();
    const release = mobileRelease();
    const currentVersion = String(req.headers["x-app-version"] || "0.0.0");
    if (compareVersions(currentVersion, release.minimumVersion) < 0) {
      return res.status(426).json({
        error: "当前考匠 App 版本过低，请下载最新版后继续使用",
        code: "APP_UPDATE_REQUIRED",
        currentVersion,
        latestVersion: release.latestVersion,
        minimumVersion: release.minimumVersion,
        downloadUrl: release.downloadUrl,
        releaseNotes: release.releaseNotes,
      });
    }
    next();
  });
  const authResponse = (req, user, token) => ({
    user: userView(user),
    certificates,
    ...(isTokenClient(req) ? { sessionToken: token } : {}),
  });
  const sessionCookie = (req, res, token, expires = true) =>
    res.cookie("netwise_session", token || "", {
      httpOnly: true,
      sameSite: "lax",
      // Only mark the cookie Secure when the current request is actually
      // HTTPS. Express resolves req.secure through TRUST_PROXY when TLS is
      // terminated by a trusted reverse proxy, while HTTP deployments remain
      // usable even if COOKIE_SECURE was left enabled accidentally.
      secure: process.env.COOKIE_SECURE !== "0" && req.secure,
      path: "/",
      ...(expires ? { maxAge: 30 * 86400000 } : { maxAge: 0 }),
    });
  const userView = (user) => ({
    ...user,
    certificate: certificates.find((c) => c.id === user.certificateId) || null,
  });
  route("get", "/api/auth/me", (req) => {
    const user = store.authUser(requestToken(req));
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
    const token = store.createAuthSession(user.id);
    sessionCookie(req, res, token);
    return authResponse(req, user, token);
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
    const token = store.createAuthSession(user.id);
    sessionCookie(req, res, token);
    return authResponse(req, user, token);
  });
  route("post", "/api/auth/wechat/mini-login", async (req, res) => {
    const { code } = z
      .object({ code: z.string().trim().min(1).max(512) })
      .strict()
      .parse(req.body);
    const identity = await wechatCodeExchange(code);
    if (!identity?.appid || !identity?.openid) {
      const error = new Error("微信登录身份无效");
      error.status = 502;
      throw error;
    }
    const bound = store.wechatIdentity(identity.appid, identity.openid);
    if (bound) {
      const user = store.userById(bound.userId);
      if (!user) {
        const error = new Error("微信绑定的考匠账号不存在");
        error.status = 409;
        throw error;
      }
      if (user.bannedAt) {
        const error = new Error(
          `账号已被封禁${user.banReason ? `：${user.banReason}` : ""}`,
        );
        error.status = 403;
        throw error;
      }
      const token = store.createAuthSession(user.id);
      sessionCookie(req, res, token);
      return {
        linked: true,
        needsBinding: false,
        ...authResponse(req, user, token),
      };
    }
    return {
      linked: false,
      needsBinding: true,
      bindingToken: store.createWechatLoginChallenge(identity),
    };
  });
  route("post", "/api/auth/wechat/bind", (req, res) => {
    const body = z
      .object({
        bindingToken: z.string().trim().min(20).max(200),
        username: z.string().trim().min(3).max(40),
        password: z.string().min(8).max(128),
      })
      .strict()
      .parse(req.body);
    const challenge = store.wechatLoginChallenge(body.bindingToken);
    if (!challenge) {
      const error = new Error("微信绑定已过期，请重新点击微信登录");
      error.status = 401;
      throw error;
    }
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
    store.bindWechatIdentity({
      appid: challenge.appid,
      openid: challenge.openid,
      unionid: challenge.unionid,
      userId: user.id,
    });
    store.consumeWechatLoginChallenge(body.bindingToken);
    const token = store.createAuthSession(user.id);
    sessionCookie(req, res, token);
    return {
      linked: true,
      needsBinding: false,
      ...authResponse(req, user, token),
    };
  });
  route("post", "/api/auth/wechat/register", (req, res) => {
    const body = z
      .object({
        bindingToken: z.string().trim().min(20).max(200),
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
    const challenge = store.wechatLoginChallenge(body.bindingToken);
    if (!challenge) {
      const error = new Error("微信绑定已过期，请重新点击微信登录");
      error.status = 401;
      throw error;
    }
    const user = store.register(body.username, body.password);
    store.bindWechatIdentity({
      appid: challenge.appid,
      openid: challenge.openid,
      unionid: challenge.unionid,
      userId: user.id,
    });
    store.consumeWechatLoginChallenge(body.bindingToken);
    const token = store.createAuthSession(user.id);
    sessionCookie(req, res, token);
    return {
      linked: true,
      needsBinding: false,
      ...authResponse(req, user, token),
    };
  });
  route("post", "/api/auth/logout", (req, res) => {
    store.deleteAuthSession(requestToken(req));
    sessionCookie(req, res, null, false);
    return { loggedOut: true };
  });
  route("get", "/api/mobile/version", (req) => {
    const release = mobileRelease();
    const currentVersion = String(req.query.version || "0.0.0");
    return {
      currentVersion,
      latestVersion: release.latestVersion,
      minimumVersion: release.minimumVersion,
      downloadUrl: release.downloadUrl,
      releaseNotes: release.releaseNotes,
      updateAvailable: compareVersions(currentVersion, release.latestVersion) < 0,
      forceUpdate: compareVersions(currentVersion, release.minimumVersion) < 0,
    };
  });
  app.use("/api", (req, res, next) => {
    if (!authRequired) return next();
    const user = store.authUser(requestToken(req));
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
  const communityMessageView = (message) => ({
    id: message.id,
    userId: message.userId,
    authorName: message.authorName,
    text: message.text,
    createdAt: message.createdAt,
    ...(message.imagePath
      ? {
          imageUrl: `/community/uploads/${path.basename(message.imagePath)}`,
          imageMime: message.imageMime,
          imageBytes: message.imageBytes,
        }
      : {}),
  });
  const communityRoomView = () => {
    const storage = store.communityStorage();
    return {
      id: "global",
      name: "考匠社区",
      description: "一个大群，和所有正在努力的人交流。",
      memberCount: store.allUsers().length,
      messageCount: store.communityMessageCount(),
      storageUsedBytes: storage.usedBytes,
      storageLimitBytes: storage.limitBytes,
    };
  };
  route("get", "/api/community/profile", (req) => ({
    profile: store.communityProfile(req.user?.id || "local"),
  }));
  route("put", "/api/community/profile", (req) => {
    const { name } = z
      .object({
        name: z
          .string()
          .trim()
          .min(1, "社区昵称不能为空")
          .max(24, "社区昵称最多 24 个字符")
          .refine((value) => !/[\u0000-\u001f\u007f\n\r]/.test(value), "社区昵称不能包含控制字符"),
      })
      .strict()
      .parse(req.body);
    const user = store.updateCommunityName(req.user?.id || "local", name);
    if (!user) throw new Error("用户不存在");
    return { profile: store.communityProfile(req.user?.id || "local"), user: userView(user) };
  });
  route("get", "/api/community/messages", (req) => {
    const query = z
      .object({
        before: z.string().trim().max(160).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(req.query);
    const fetched = store.communityMessages({ ...query, limit: query.limit + 1 });
    const hasMore = fetched.length > query.limit;
    const messages = hasMore ? fetched.slice(1) : fetched;
    return {
      room: communityRoomView(),
      messages: messages.map(communityMessageView),
      hasMore,
      nextBefore: messages[0] ? `${messages[0].createdAt}|${messages[0].id}` : null,
    };
  });
  route("get", "/api/community/leaderboards", (req) =>
    store.communityLeaderboards(req.user?.id || "local"),
  );
  route("post", "/api/community/messages", async (req) => {
    const body = z
      .object({
        text: z.string().max(4000).optional(),
        image: z
          .object({
            data: z.string().min(1).max(8_500_000),
            mimeType: z.enum(["image/jpeg", "image/png", "image/gif", "image/webp"]),
          })
          .strict()
          .optional(),
      })
      .strict()
      .parse(req.body);
    const text = (body.text || "").trim();
    if ([...text].length > communityMessageMaxLength)
      throw new Error(`消息最多 ${communityMessageMaxLength} 个字符`);
    if (!text && !body.image) throw new Error("消息内容不能为空");
    const image = decodeCommunityImage(body.image);
    const fileName = image ? `${crypto.randomUUID()}${image.extension}` : null;
    const imagePath = fileName ? path.join(store.communityUploadDir, fileName) : null;
    if (image && imagePath) await fs.promises.writeFile(imagePath, image.buffer);
    const userId = req.user?.id || "local";
    const message = {
      id: crypto.randomUUID(),
      userId,
      text,
      imagePath: fileName,
      imageMime: image?.mimeType || null,
      imageBytes: image?.buffer.length || 0,
      createdAt: new Date().toISOString(),
    };
    try {
      store.addCommunityMessage(
        message,
        Buffer.byteLength(text, "utf8") + (image?.buffer.length || 0),
      );
    } catch (error) {
      if (imagePath) await fs.promises.unlink(imagePath).catch(() => {});
      throw error;
    }
    return {
      room: communityRoomView(),
      message: communityMessageView({
        ...message,
        authorName: store.communityProfile(userId).name,
      }),
    };
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
    if (req?.user?.certificateId && !hasCertificateQuestion(q, req.user.certificateId)) {
      const error = new Error("题目不存在或不适用于当前证书");
      error.status = 404;
      throw error;
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
  route("post", "/api/settings/author-deploy", (req) => {
    const userId = requestUserId(req);
    const { password } = z
      .object({ password: z.string().min(1).max(128) })
      .strict()
      .parse(req.body);
    const expectedPassword = process.env.AUTHOR_API_PASSWORD || "";
    const authorApiKey = process.env.AUTHOR_API_KEY || "";
    const supplied = Buffer.from(password, "utf8");
    const expected = Buffer.from(expectedPassword, "utf8");
    const matches =
      !!expectedPassword &&
      supplied.length === expected.length &&
      crypto.timingSafeEqual(supplied, expected);
    if (!matches) {
      const error = new Error("作者 API 部署密码不正确");
      error.status = 401;
      throw error;
    }
    if (!authorApiKey) {
      const error = new Error("作者 API 尚未配置，请联系管理员");
      error.status = 503;
      throw error;
    }
    const current = store.settings(userId);
    store.saveSettings(userId, {
      ...current,
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
      temperature: 0.3,
      keyCipher: encrypt(authorApiKey),
    });
    return {
      deployed: true,
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
      temperature: 0.3,
    };
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
  const adminTaxonomy = () => {
    const allQuestions = store.allQ();
    return certificates.map((certificate) => {
      const questions = allQuestions
        .filter((question) => hasCertificateQuestion(question, certificate.id));
      const configuredModules = certificate.taxonomy?.modules || [];
      const chapterNames = [
        ...configuredModules.map((module) => module.name),
        ...new Set(questions.map((question) => question.chapter)),
      ].filter((name, index, names) => names.indexOf(name) === index);
      const chapters = chapterNames.map((name) => {
        const chapterQuestions = questions.filter(
          (question) => question.chapter === name,
        );
        const configuredModule = configuredModules.find(
          (module) => module.name === name,
        );
        const configuredSections = configuredModule?.sections || [];
        const sectionNames = [
          ...configuredSections.map((section) => section.name),
          ...new Set(
            chapterQuestions
              .map((question) => question.knowledgeSection)
              .filter(Boolean),
          ),
        ].filter((sectionName, index, names) => names.indexOf(sectionName) === index);
        const sections = sectionNames.map((sectionName) => {
          const sectionQuestions = chapterQuestions.filter(
            (question) => question.knowledgeSection === sectionName,
          );
          const configuredSection = configuredSections.find(
            (section) => section.name === sectionName,
          );
          const configuredPoints = (configuredSection?.knowledgePoints || []).map(
            (point) => point.name,
          );
          const knowledgePoints = [
            ...configuredPoints,
            ...new Set(
              sectionQuestions.map(
                (question) =>
                  question.targetKnowledgePoint || question.knowledgePoint,
              ),
            ),
          ].filter((point, index, points) => points.indexOf(point) === index);
          return { name: sectionName, knowledgePoints };
        });
        const flatPoints = [
          ...sections.flatMap((section) => section.knowledgePoints),
          ...new Set(
            chapterQuestions.map(
              (question) =>
                question.targetKnowledgePoint || question.knowledgePoint,
            ),
          ),
        ].filter((point, index, points) => points.indexOf(point) === index);
        return {
          name,
          knowledgePoints: configuredModules.length
            ? flatPoints
            : [...flatPoints].sort((a, b) => a.localeCompare(b, "zh-CN")),
          ...(configuredModules.length ? { sections } : {}),
        };
      });
      return {
        id: certificate.id,
        name: certificate.name,
        shortName: certificate.shortName,
        chapters,
      };
    });
  };
  const escapeSearchRegex = (value) =>
    value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
  const compileWildcardSearch = (value) => {
    const normalized = String(value || "").toLocaleLowerCase("zh-CN");
    if (!normalized.includes("*") && !normalized.includes("?")) return null;
    const source = [...normalized]
      .map((character) => {
        if (character === "*") return ".*";
        if (character === "?") return ".";
        return escapeSearchRegex(character);
      })
      .join("");
    return new RegExp(`^${source}$`, "iu");
  };
  const questionSearchFields = (question) => [
    question.id,
    question.question,
    question.chapter,
    question.knowledgeSection,
    question.knowledgePoint,
    question.targetKnowledgePoint,
    question.source,
    question.sourceLabel,
    ...(question.tags || []),
    ...(question.provenance || []).flatMap((item) => [
      item.file,
      item.questionNumber,
      item.sourceIndex,
    ]),
    ...Object.values(question.options || {}),
  ]
    .filter((value) => value !== undefined && value !== null)
    .map((value) => String(value).toLocaleLowerCase("zh-CN"));
  const matchesQuestionSearch = (question, value) => {
    if (!value) return true;
    const wildcard = compileWildcardSearch(value);
    return questionSearchFields(question).some((field) =>
      wildcard ? wildcard.test(field) : field.includes(value),
    );
  };
  const adminQuestionFilters = (query) => {
    const parsed = z
      .object({
        certificateId: z.string().trim().optional(),
        chapter: z.string().trim().optional(),
        knowledgeSection: z.string().trim().optional(),
        knowledgePoint: z.string().trim().optional(),
        source: z.string().trim().optional(),
        search: z.string().trim().max(200).optional(),
        limit: z.coerce.number().int().min(1).max(500).default(200),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(query);
    const search = parsed.search?.toLocaleLowerCase("zh-CN");
    const filtered = store
      .allQ()
      .filter(
        (question) =>
          (!parsed.certificateId ||
            hasCertificateQuestion(question, parsed.certificateId)) &&
          (!parsed.chapter || question.chapter === parsed.chapter) &&
          (!parsed.knowledgeSection ||
            question.knowledgeSection === parsed.knowledgeSection) &&
          (!parsed.knowledgePoint ||
            (question.targetKnowledgePoint || question.knowledgePoint) ===
              parsed.knowledgePoint) &&
          (!parsed.source || question.source === parsed.source) &&
          (!search || matchesQuestionSearch(question, search)),
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
      // Similarity scans are expensive and must only run on explicit request.
      similarCandidates: null,
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
    const result = store.questionFeedbackPage(parsed);
    return {
      ...parsed,
      total: result.total,
      feedback: result.feedback
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
        knowledgeSection: z.string().trim().min(1).max(100).optional(),
        knowledgePoint: z.string().trim().min(1).max(100),
        difficulty: z.enum(["easy", "medium", "hard"]),
        tags: z.array(z.string().trim().max(50)).min(1).max(12).optional(),
        images: z.array(questionImageSchema).max(8).optional(),
        sharedGroupId: z.string().trim().min(1).max(120).optional(),
        sharedKind: z.enum(["stem", "options"]).optional(),
        sharedStem: z.string().trim().max(4000).optional(),
        sharedOrder: z.number().int().min(1).max(200).optional(),
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
      ...(body.images !== undefined
        ? { images: body.images }
        : existing.images
          ? { images: existing.images }
          : {}),
      ...(body.sharedGroupId !== undefined
        ? { sharedGroupId: body.sharedGroupId }
        : existing.sharedGroupId
          ? { sharedGroupId: existing.sharedGroupId }
          : {}),
      ...(body.sharedKind !== undefined
        ? { sharedKind: body.sharedKind }
        : existing.sharedKind
          ? { sharedKind: existing.sharedKind }
          : {}),
      ...(body.sharedStem !== undefined
        ? { sharedStem: body.sharedStem }
        : existing.sharedStem
          ? { sharedStem: existing.sharedStem }
          : {}),
      ...(body.sharedOrder !== undefined
        ? { sharedOrder: body.sharedOrder }
        : existing.sharedOrder !== undefined
          ? { sharedOrder: existing.sharedOrder }
          : {}),
    };
    const editedTaxonomy = certificates.find(
      (certificate) =>
        certificate.taxonomy &&
        existing.certificates?.includes(certificate.id),
    )?.taxonomy;
    if (editedTaxonomy) {
      const module = editedTaxonomy.modules.find(
        (item) => item.name === candidate.chapter,
      );
      const section = module?.sections.find(
        (item) => item.name === candidate.knowledgeSection,
      );
      if (
        !section?.knowledgePoints.some(
          (point) => point.name === candidate.knowledgePoint,
        )
      )
        throw new Error("章节、二级分类或知识点不属于当前证书");
    }
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
      knowledgeSection: saved.knowledgeSection || null,
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
          knowledgeSection: z.string().min(1).max(100).optional(),
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
      const section = chapter?.sections?.find(
        (item) => item.name === body.knowledgeSection,
      );
      if (
        (chapter?.sections?.length && !section) ||
        !(section?.knowledgePoints || chapter?.knowledgePoints || []).includes(
          body.knowledgePoint,
        )
      )
        throw new Error("章节或知识点不属于当前证书");
      const source = store
        .allQ()
        .find(
          (question) =>
            hasCertificateQuestion(question, body.certificateId) &&
            question.chapter === body.chapter &&
            (!body.knowledgeSection ||
              question.knowledgeSection === body.knowledgeSection) &&
            (question.targetKnowledgePoint || question.knowledgePoint) ===
              body.knowledgePoint,
        ) ||
        store
        .allQ()
        .find(
            (question) =>
              hasCertificateQuestion(question, body.certificateId) &&
              question.chapter === body.chapter &&
              (!body.knowledgeSection ||
                question.knowledgeSection === body.knowledgeSection),
          );
      if (!source) throw new Error("当前章节还没有可供 AI 参考的题目");
      const settings = store.adminSettings(req.user.id);
      if (!settings.keyCipher) throw new Error("请先在管理员面板配置 API Key");
      const generated = await provider.generateBankExpansion(
        {
          ...source,
          ...(body.knowledgeSection
            ? { knowledgeSection: body.knowledgeSection }
            : {}),
          knowledgePoint: body.knowledgePoint,
        },
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
        ...(body.knowledgeSection
          ? { knowledgeSection: body.knowledgeSection }
          : {}),
        ownerUserId: req.user.id,
        adminGeneratedAt: new Date().toISOString(),
        targetKnowledgePoint: body.knowledgePoint,
      }));
      const saved = store.addAdminQuestions(prepared);
      store.audit(req.user.id, "questions_generated", "knowledge_point", body.knowledgePoint, {
        certificateId: body.certificateId,
        chapter: body.chapter,
        knowledgeSection: body.knowledgeSection || null,
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
  const questionState = (req) => {
    const userId = req.user?.id || "local";
    return {
      userId,
      attemptedIds: store.attemptedQuestionIds(userId),
      favoriteIds: store.favoriteQuestionIds(userId),
    };
  };
  const publicQuestionForUser = (question, state) => ({
    ...publicQuestion(question),
    attempted: state.attemptedIds.has(question.id),
    favorite: state.favoriteIds.has(question.id),
  });
  const privateQuestionForUser = (question, state) => ({
    ...privateQuestion(question),
    attempted: state.attemptedIds.has(question.id),
    favorite: state.favoriteIds.has(question.id),
  });
  route("get", "/api/questions", (req) => {
    const state = questionState(req);
    const questions = certificateQuestions(
      requireCertificate(req),
      state.userId,
    ).filter(
      (q) =>
        (!req.query.chapter || q.chapter === req.query.chapter) &&
        (!req.query.knowledgeSection ||
          q.knowledgeSection === req.query.knowledgeSection) &&
        (!req.query.knowledgePoint ||
          (q.targetKnowledgePoint || q.knowledgePoint) ===
            req.query.knowledgePoint) &&
        (!req.query.source || q.source === req.query.source),
    );
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(parsedLimit)
      ? Math.min(100, Math.max(1, parsedLimit))
      : undefined;
    const parsedOffset = Number.parseInt(req.query.offset, 10);
    const offset = Number.isInteger(parsedOffset) ? Math.max(0, parsedOffset) : 0;
    const random = req.query.random === "1" || req.query.random === "true";

    if (req.query.page === "1") {
      const seed = random ? z.string().min(1).max(64).parse(req.query.seed) : undefined;
      const page = questionPage(questions, { offset, limit: limit ?? 40, seed });
      return { ...page, items: page.items.map((question) => publicQuestionForUser(question, state)) };
    }

    if (random) {
      for (let index = questions.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [questions[index], questions[swapIndex]] = [
          questions[swapIndex],
          questions[index],
        ];
      }
      return questions
        .slice(0, limit === undefined ? undefined : limit)
        .map((question) => publicQuestionForUser(question, state));
    }

    return questions
      .slice(offset, limit === undefined ? undefined : offset + limit)
      .map((question) => publicQuestionForUser(question, state));
  });
  route("get", "/api/practice/catalog", (req) => {
    const certificateId = requireCertificate(req);
    const state = questionState(req);
    const questions = certificateQuestions(certificateId, state.userId);
    const configuredModules =
      certificates.find((certificate) => certificate.id === certificateId)
        ?.taxonomy?.modules || [];
    const chapters = new Map();

    for (const question of questions) {
      const chapterName = question.chapter || "综合练习";
      const knowledgePointName =
        question.targetKnowledgePoint || question.knowledgePoint || "综合练习";
      let chapter = chapters.get(chapterName);
      if (!chapter) {
        chapter = {
          name: chapterName,
          questionCount: 0,
          attemptedCount: 0,
          knowledgePoints: new Map(),
          sections: new Map(),
        };
        chapters.set(chapterName, chapter);
      }
      chapter.questionCount += 1;
      if (state.attemptedIds.has(question.id)) chapter.attemptedCount += 1;

      const sectionName = question.knowledgeSection;
      let section = sectionName ? chapter.sections.get(sectionName) : null;
      if (sectionName && !section) {
        section = {
          name: sectionName,
          questionCount: 0,
          attemptedCount: 0,
          knowledgePoints: new Map(),
        };
        chapter.sections.set(sectionName, section);
      }
      if (section) {
        section.questionCount += 1;
        if (state.attemptedIds.has(question.id)) section.attemptedCount += 1;
      }

      const pointKey = JSON.stringify([sectionName || "", knowledgePointName]);
      let point = chapter.knowledgePoints.get(pointKey);
      if (!point) {
        point = {
          name: knowledgePointName,
          ...(sectionName ? { knowledgeSection: sectionName } : {}),
          questionCount: 0,
          attemptedCount: 0,
        };
        chapter.knowledgePoints.set(pointKey, point);
      }
      point.questionCount += 1;
      if (state.attemptedIds.has(question.id)) point.attemptedCount += 1;
      if (section) section.knowledgePoints.set(knowledgePointName, point);
    }

    const progress = (attemptedCount, questionCount) =>
      questionCount ? Math.round((attemptedCount / questionCount) * 100) : 0;
    return {
      total: questions.length,
      attemptedCount: questions.filter((question) =>
        state.attemptedIds.has(question.id),
      ).length,
      favoriteCount: questions.filter((question) =>
        state.favoriteIds.has(question.id),
      ).length,
      chapters: [...chapters.values()]
        .sort((left, right) => {
          const leftOrder = configuredModules.find(
            (module) => module.name === left.name,
          )?.order;
          const rightOrder = configuredModules.find(
            (module) => module.name === right.name,
          )?.order;
          return leftOrder !== undefined && rightOrder !== undefined
            ? leftOrder - rightOrder
            : left.name.localeCompare(right.name, "zh-CN");
        })
        .map((chapter) => ({
          name: chapter.name,
          questionCount: chapter.questionCount,
          attemptedCount: chapter.attemptedCount,
          progress: progress(chapter.attemptedCount, chapter.questionCount),
          knowledgePoints: [...chapter.knowledgePoints.values()]
            .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"))
            .map((point) => ({
              ...point,
              progress: progress(point.attemptedCount, point.questionCount),
            })),
          ...(chapter.sections.size
            ? {
                sections: [...chapter.sections.values()]
                  .sort((left, right) => {
                    const sectionConfig = configuredModules
                      .find((module) => module.name === chapter.name)
                      ?.sections.find((item) => item.name === left.name);
                    const rightConfig = configuredModules
                      .find((module) => module.name === chapter.name)
                      ?.sections.find((item) => item.name === right.name);
                    return (sectionConfig?.order ?? Number.MAX_SAFE_INTEGER) -
                      (rightConfig?.order ?? Number.MAX_SAFE_INTEGER);
                  })
                  .map((section) => ({
                    name: section.name,
                    questionCount: section.questionCount,
                    attemptedCount: section.attemptedCount,
                    progress: progress(
                      section.attemptedCount,
                      section.questionCount,
                    ),
                    knowledgePoints: [...section.knowledgePoints.values()]
                      .sort((left, right) => {
                        const points = configuredModules
                          .find((module) => module.name === chapter.name)
                          ?.sections.find((item) => item.name === section.name)
                          ?.knowledgePoints || [];
                        const leftOrder = points.find(
                          (point) => point.name === left.name,
                        )?.order;
                        const rightOrder = points.find(
                          (point) => point.name === right.name,
                        )?.order;
                        return leftOrder !== undefined && rightOrder !== undefined
                          ? leftOrder - rightOrder
                          : left.name.localeCompare(right.name, "zh-CN");
                      })
                      .map((point) => ({
                        ...point,
                        progress: progress(
                          point.attemptedCount,
                          point.questionCount,
                        ),
                      })),
                  })),
              }
            : {}),
        })),
    };
  });
  route("get", "/api/questions/shared-ai", (req) => {
    const certificateId = requireCertificate(req);
    const state = questionState(req);
    const userId = state.userId;
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
        ...publicQuestionForUser(q, state),
        sharedAi: true,
        sourceLabel: "其他用户生成的 AI 题",
        feedback: store.questionFeedback(q.id, userId),
      }));
  });
  route("put", "/api/questions/:id/favorite", (req) => {
    const question = requireQ(req.params.id, req);
    const certificateId = requireCertificate(req);
    if (certificateId && !hasCertificateQuestion(question, certificateId)) {
      const error = new Error("题目不适用于当前证书");
      error.status = 404;
      throw error;
    }
    const favorite = z
      .object({ favorite: z.boolean() })
      .strict()
      .parse(req.body).favorite;
    store.setQuestionFavorite(req.user?.id || "local", question.id, favorite);
    return { saved: true, favorite };
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
  route("get", "/api/questions/:id", (req) => {
    const state = questionState(req);
    return publicQuestionForUser(requireQ(req.params.id, req), state);
  });
  route("post", "/api/questions/:id/reveal", (req) => {
    const q = requireQ(req.params.id, req);
    return {
      answer: q.answer,
      analysis: q.analysis,
      ...(q.type === "short_answer" ? { expectedAnswer: q.expectedAnswer } : {}),
    };
  });
  route("post", "/api/attempts", (req) => {
    const b = z
      .object({
        questionId: z.string(),
        selected: z
          .array(z.enum(["A", "B", "C", "D", "E"]))
          .min(1)
          .max(5),
        response: z.string().max(5000).optional(),
        timeMs: z.number().int().min(0).max(86400000),
      })
      .strict()
      .parse(req.body);
    if (new Set(b.selected).size !== b.selected.length)
      throw new Error("答案不能重复");
    const q = requireQ(b.questionId, req);
    if (q.type === "short_answer") {
      if (
        b.selected.length !== 1 ||
        !["A", "B"].includes(b.selected[0]) ||
        !b.response?.trim()
      )
        throw new Error("简答题请先填写作答内容，再自评是否答对");
    } else if (
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
      b.response,
    );
  });
  route("get", "/api/wrong", (req) => {
    const certificateId = requireCertificate(req);
    const state = questionState(req);
    return store
      .wrongQuestions(state.userId)
      .filter(
        (question) =>
          !certificateId || hasCertificateQuestion(question, certificateId),
      )
      .map((question) => privateQuestionForUser(question, state));
  });
  route("get", "/api/favorites", (req) => {
    const certificateId = requireCertificate(req);
    const state = questionState(req);
    return store
      .favoriteQuestions(state.userId)
      .filter(
        (question) =>
          !certificateId || hasCertificateQuestion(question, certificateId),
      )
      .map((question) => publicQuestionForUser(question, state));
  });
  route("delete", "/api/wrong/:id", (req) => {
    const question = requireQ(req.params.id, req);
    const certificateId = requireCertificate(req);
    if (certificateId && !hasCertificateQuestion(question, certificateId)) {
      const error = new Error("题目不适用于当前证书");
      error.status = 404;
      throw error;
    }
    store.dismissWrongQuestion(req.user?.id || "local", question.id);
    return { deleted: true, questionId: question.id };
  });
  route("get", "/api/queue", (req) =>
    store.db
      .prepare(
        "SELECT question_id FROM queue WHERE completed=0 AND user_id=? ORDER BY rowid",
      )
      .all(req.user?.id || "local")
      .map((r) => store.getQ(r.question_id))
      .filter(
        (question) =>
          question && (!requireCertificate(req) ||
          hasCertificateQuestion(question, requireCertificate(req))),
      )
      .map((question) => requireQ(question.id, req))
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
      today = day(),
      wrong = store
        .wrongQuestions(userId)
        .filter((question) => currentIds.has(question.id)),
      summary = studySummary(attempts, wrong);
    if (req.query.summary === "1") return summary;
    const mastery = store.mastery(currentIds, userId),
      syllabus = syllabusForCertificate(certificateId),
      syllabusProgress = buildSyllabusProgress(
        currentQuestions,
        attempts,
        syllabus,
      );
    const categoryTaxonomy = certificates.find(
      (certificate) => certificate.id === certificateId,
    )?.taxonomy;
    const categoryMetrics = (categoryQuestions) => {
      const questionIds = new Set(categoryQuestions.map((question) => question.id));
      const categoryAttempts = attempts.filter((attempt) =>
        questionIds.has(attempt.questionId),
      );
      return {
        total: categoryQuestions.length,
        attempted: new Set(categoryAttempts.map((attempt) => attempt.questionId)).size,
        accuracy: categoryAttempts.length
          ? categoryAttempts.filter((attempt) => attempt.correct).length /
            categoryAttempts.length
          : null,
      };
    };
    const configuredModules = categoryTaxonomy?.modules || [];
    const chapters = syllabusProgress
      ? syllabusProgress.modules
      : configuredModules.length
        ? [
            ...configuredModules.map((module) => {
              const moduleQuestions = currentQuestions.filter(
                (question) => question.chapter === module.name,
              );
              const sectionNames = [
                ...module.sections.map((section) => section.name),
                ...new Set(
                  moduleQuestions
                    .map((question) => question.knowledgeSection)
                    .filter(Boolean),
                ),
              ].filter((name, index, names) => names.indexOf(name) === index);
              const sections = sectionNames.map((sectionName) => {
                const sectionQuestions = moduleQuestions.filter(
                  (question) => question.knowledgeSection === sectionName,
                );
                const configuredSection = module.sections.find(
                  (section) => section.name === sectionName,
                );
                const pointNames = [
                  ...(configuredSection?.knowledgePoints || []).map(
                    (point) => point.name,
                  ),
                  ...new Set(
                    sectionQuestions.map(
                      (question) =>
                        question.targetKnowledgePoint || question.knowledgePoint,
                    ),
                  ),
                ].filter((name, index, names) => names.indexOf(name) === index);
                const knowledgePoints = pointNames.map((pointName) => {
                  const pointQuestions = sectionQuestions.filter(
                    (question) =>
                      (question.targetKnowledgePoint || question.knowledgePoint) ===
                      pointName,
                  );
                  return {
                    name: pointName,
                    ...categoryMetrics(pointQuestions),
                  };
                });
                return {
                  name: sectionName,
                  ...categoryMetrics(sectionQuestions),
                  knowledgePoints,
                };
              });
              return {
                name: module.name,
                ...categoryMetrics(moduleQuestions),
                sections,
              };
            }),
            ...[...new Set(
              currentQuestions
                .map((question) => question.chapter)
                .filter((name) => !configuredModules.some((module) => module.name === name)),
            )].map((name) => ({
              name,
              ...categoryMetrics(
                currentQuestions.filter((question) => question.chapter === name),
              ),
              sections: [],
            })),
          ]
        : [...new Set(currentQuestions.map((q) => q.chapter))].map((name) => {
            const chapterQuestions = currentQuestions.filter(
              (question) => question.chapter === name,
            );
            return { name, ...categoryMetrics(chapterQuestions) };
          });
    return {
      ...summary,
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
  const userQuestionDraftSchema = z.object({
    chapter: z.string().trim().min(1).max(100),
    knowledgeSection: z.string().trim().min(1).max(100).optional(),
    knowledgePoint: z.string().trim().min(1).max(100),
  }).strict();
  const userQuestionDraft = (req) => {
    const certificateId = requireCertificate(req);
    const userId = requestUserId(req);
    const draft = store.userQuestionDraft(req.params.id, userId, certificateId);
    if (!draft) {
      const error = new Error("待提交题目不存在或不属于当前账号");
      error.status = 404;
      throw error;
    }
    return { draft, certificateId, userId };
  };
  route("get", "/api/ai/questions/draft", (req) => {
    const selection = userQuestionDraftSchema.parse(req.query);
    const saved = store.latestUserQuestionDraft(
      requestUserId(req), requireCertificate(req),
      selection.chapter, selection.knowledgeSection, selection.knowledgePoint,
    );
    return {
      draft: saved ? {
        ...saved,
        checks: { rulesAndDuplicates: true, independentAiReview: true },
      } : null,
    };
  });
  app.post("/api/ai/questions/draft/stream", async (req, res, next) => {
    const send = (event) => {
      if (!res.writableEnded && !res.destroyed)
        res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    try {
      if (aiBusy) {
        const error = new Error("已有 AI 任务正在执行，请稍候");
        error.status = 409;
        throw error;
      }
      const body = userQuestionDraftSchema.parse(req.body);
      const certificateId = requireCertificate(req);
      const userId = requestUserId(req);
      if (store.latestUserQuestionDraft(
        userId, certificateId,
        body.chapter, body.knowledgeSection, body.knowledgePoint,
      )) throw new Error("当前知识点已有待提交草稿，请先提交或删除");
      const seed = store.allQ().find((question) =>
        hasCertificateQuestion(question, certificateId) &&
        question.chapter === body.chapter &&
        (question.knowledgeSection || null) === (body.knowledgeSection || null) &&
        (question.targetKnowledgePoint || question.knowledgePoint) === body.knowledgePoint &&
        (question.source !== "ai_generated" || question.ownerUserId === userId),
      );
      if (!seed) throw new Error("该知识点暂无可参考的题目，请先选择具体知识点");
      res.status(200).set({
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.flushHeaders?.();
      send({ type: "progress", stage: "prepare", message: "正在读取当前知识点已有题目" });
      const heartbeat = setInterval(() =>
        send({ type: "progress", stage: "heartbeat", message: "AI 正在继续处理…" }),
      12000);
      aiBusy = true;
      try {
        const [question] = await provider.generateBankExpansion(seed, 1, {
          userId,
          certificateId,
          onProgress: (event) => send({ type: "progress", ...event }),
        });
        send({ type: "progress", stage: "second-check", message: "独立审核已通过，正在再次查重" });
        const allQuestions = store.allQ();
        const verified = validateQuestion(question, allQuestions, seed);
        const related = allQuestions.filter((old) =>
          old.chapter === body.chapter &&
          (old.knowledgeSection || null) === (body.knowledgeSection || null) &&
          (old.targetKnowledgePoint || old.knowledgePoint) === body.knowledgePoint,
        );
        if (related.some((old) => questionSimilarity(verified, old) >= 0.9))
          throw new Error("新题与已有题目高度相似，请重新生成");
        const saved = store.saveUserQuestionDraft(userId, certificateId, verified);
        send({
          type: "done",
          result: {
            ...saved,
            checks: { rulesAndDuplicates: true, independentAiReview: true },
          },
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
  route("post", "/api/ai/questions/draft/:id/submit", (req) => {
    const { draft, certificateId, userId } = userQuestionDraft(req);
    const seed = store.allQ().find((question) =>
      hasCertificateQuestion(question, certificateId) &&
      question.chapter === draft.chapter &&
      (question.knowledgeSection || null) === (draft.knowledgeSection || null) &&
      (question.targetKnowledgePoint || question.knowledgePoint) === draft.knowledgePoint,
    );
    if (!seed) throw new Error("该知识点已不可用，请重新选择");
    const allQuestions = store.allQ();
    const verified = validateQuestion(draft, allQuestions, seed);
    if (allQuestions.some((old) =>
      old.chapter === draft.chapter &&
      (old.knowledgeSection || null) === (draft.knowledgeSection || null) &&
      (old.targetKnowledgePoint || old.knowledgePoint) === draft.knowledgePoint &&
      questionSimilarity(verified, old) >= 0.9,
    )) throw new Error("提交时发现题库中已有相似题目，请删除草稿后重新生成");
    const question = store.submitUserQuestionDraft(req.params.id, userId, certificateId, {
      ...verified,
      id: `contributed-${crypto.randomUUID()}`,
      source: "user_submitted",
      sourceLabel: "用户 AI 审核投稿",
      certificates: [certificateId],
      contributedBy: userId,
      createdAt: new Date().toISOString(),
    });
    return { submitted: true, question: publicQuestion(question) };
  });
  route("delete", "/api/ai/questions/draft/:id", (req) => {
    const { certificateId, userId } = userQuestionDraft(req);
    store.deleteUserQuestionDraft(req.params.id, userId, certificateId);
    return { deleted: true };
  });
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
            .array(z.enum(["A", "B", "C", "D", "E"]))
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
      (q) => q.source !== "ai_generated" && q.type !== "short_answer",
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
          ...(q.images ? { images: q.images } : {}),
          ...(q.sharedGroupId ? { sharedGroupId: q.sharedGroupId } : {}),
          ...(q.sharedKind ? { sharedKind: q.sharedKind } : {}),
          ...(q.sharedStem ? { sharedStem: q.sharedStem } : {}),
          ...(q.sharedOrder ? { sharedOrder: q.sharedOrder } : {}),
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
  app.get("/community/uploads/:file", (req, res, next) => {
    const file = req.params.file || "";
    if (!/^[a-f0-9-]{36}\.(jpg|png|gif|webp)$/i.test(file))
      return res.status(404).end();
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    res.sendFile(path.join(store.communityUploadDir, file), (error) => {
      if (error && !res.headersSent) next(error);
    });
  });
  app.use(
    "/question-images",
    express.static(path.join(root, "public", "question-images"), {
      dotfiles: "deny",
      fallthrough: false,
      immutable: true,
      maxAge: "1y",
    }),
  );
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
