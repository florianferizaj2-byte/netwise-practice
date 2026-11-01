import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStore } from "../server/store.js";
import { createApp } from "../server/index.js";

// Dedicated loopback host keeps preview cookies separate from the user's other local servers.
const host = "127.0.0.2",
  port = 4178;
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = path.join(root, "outputs", "blue-web-preview");
for (const key of Object.keys(process.env))
  if (/^(AI_SERVICE_|AUTHOR_API_|WECHAT_)/.test(key)) delete process.env[key];
Object.assign(process.env, { ALLOWED_HOSTS: host, COOKIE_SECURE: "0" });
const store = createStore(directory);
const username = "预览学习者";
let user = store.allUsers().find((u) => u.username === username);
if (!user) {
  user = await store.registerAsync(
    username,
    crypto.randomBytes(24).toString("base64url"),
  );
  store.selectCertificate(user.id, "sichuan-upgrading-computer");
}
store.db.prepare("UPDATE users SET is_admin=0 WHERE id=?").run(user.id);
// Only this isolated preview account gets a sample entitlement; no real account or production database is used.
store.saveAccountEntitlement(user.id, {
  plan: "vip",
  expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
});
const app = await createApp({
  store,
  production: true,
  accountSecurity: { enabled: false },
  communityImageDirectory: path.join(directory, "community-images"),
});
const preview = express();
preview.get("/preview/public", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.clearCookie("netwise_session", { httpOnly: true, sameSite: "lax", path: "/" });
  res.redirect("/");
});
preview.get("/preview/start", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.cookie("netwise_session", store.createAuthSession(user.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  const page = ["home", "certificates", "chapters", "wrong", "exam", "tutor", "plan", "favorites", "vip", "settings"].includes(req.query.page)
    ? req.query.page : "home";
  res.redirect("/#" + page);
});
preview.use("/api/ai", (req, res) =>
  res
    .status(503)
    .json({ error: "本机候选版暂未连接 AI 服务，请在正式服务配置后使用。" }),
);
preview.use(app);
const server = preview.listen(port, host, () =>
  console.log(
    `蓝色 Web 候选版：http://${host}:${port}/preview/start\n登录首页：http://${host}:${port}/preview/public\n使用独立演示会员账号与数据，不读取个人学习库，未连接收费 AI。`,
  ),
);
const close = () =>
  server.close(async () => {
    await app.locals.stop();
    store.db.close();
    process.exit(0);
  });
server.on("error", async (e) => {
  console.error(e.message);
  await app.locals.stop();
  store.db.close();
  process.exitCode = 1;
});
process.on("SIGINT", close);
process.on("SIGTERM", close);
