import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStore } from "../server/store.js";
import { createApp } from "../server/index.js";

// This loopback-only preview owns a separate fixture database. It never promotes
// the learner preview account and cannot contact a paid model provider.
for (const key of Object.keys(process.env))
  if (/^(AI_SERVICE_|AUTHOR_|WECHAT_)/.test(key)) delete process.env[key];
const host = "127.0.0.3",
  port = 4179;
Object.assign(process.env, { ALLOWED_HOSTS: host, COOKIE_SECURE: "0" });
const directory = path.join(
  fileURLToPath(new URL("../", import.meta.url)),
  "outputs",
  "admin-console-preview",
);
const store = createStore(directory);
let admin = store.allUsers().find((u) => u.username === "管理员预览");
if (!admin) {
  admin = await store.registerAsync(
    "管理员预览",
    crypto.randomBytes(32).toString("hex"),
  );
  store.selectCertificate(admin.id, "network-engineer");
  for (let i = 0; i < 16; i++) {
    const u = store.registerWithHash(
      "演示学习者" + (i + 1),
      "preview-only-no-login",
      crypto.randomBytes(64).toString("hex"),
    );
    store.selectCertificate(
      u.id,
      i % 2 ? "network-engineer" : "sichuan-upgrading-computer",
    );
    const created = new Date(Date.now() - i * 12 * 3600000).toISOString();
    store.db
      .prepare("UPDATE users SET created_at=? WHERE id=?")
      .run(created, u.id);
    if (i % 3 === 0)
      store.saveAccountEntitlement(u.id, {
        plan: "vip",
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      });
    const questions = store
      .allQ()
      .filter((q) => q.certificates?.includes("network-engineer"))
      .slice(0, 8 + i);
    for (const q of questions) {
      const a = store.recordAttempt(q.id, q.answer, 4000, "practice", u.id);
      const when = new Date(Date.now() - (i % 7) * 86400000).toISOString();
      a.createdAt = when;
      store.db
        .prepare("UPDATE attempts SET data=? WHERE id=?")
        .run(JSON.stringify(a), a.id);
    }
  }
  store.audit(admin.id, "preview_initialized", "fixture", null, {
    note: "本地演示数据，无生产用户或收费调用",
  });
}
store.db.prepare("UPDATE users SET is_admin=1 WHERE id=?").run(admin.id);
const app = await createApp({
  store,
  production: true,
  accountSecurity: { enabled: false },
  provider: {
    call: async () => {
      throw new Error("管理预览未连接收费 AI");
    },
    generateBankExpansion: async () => {
      throw new Error("管理预览未连接收费 AI");
    },
  },
});
const preview = express();
preview.get("/preview/start", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.cookie("netwise_session", store.createAuthSession(admin.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  res.redirect("/#admin/overview");
});
preview.use(app);
const server = preview.listen(port, host, () =>
  console.log(
    `管理后台预览：http://${host}:${port}/preview/start\n独立本地演示账号和数据库；收费 AI 已禁用。`,
  ),
);
const stop = () =>
  server.close(async () => {
    await app.locals.stop();
    store.db.close();
    process.exit(0);
  });
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("error", async (e) => {
  console.error(e.message);
  await app.locals.stop();
  store.db.close();
  process.exitCode = 1;
});
