import crypto from "node:crypto";
import { positiveInteger } from "./ai-tasks.js";

export function createAuthRateLimiter(db, options = {}) {
  const env = options.env || process.env,
    now = options.now || Date.now;
  const windowMs = positiveInteger(
    options.windowMs ?? env.AUTH_RATE_WINDOW_MS,
    900000,
    86400000,
  );
  const ipLimit = positiveInteger(
    options.ipLimit ?? env.AUTH_LOGIN_IP_LIMIT,
    60,
    10000,
  );
  const accountLimit = positiveInteger(
    options.accountLimit ?? env.AUTH_LOGIN_ACCOUNT_LIMIT,
    20,
    1000,
  );
  const registerLimit = positiveInteger(
    options.registerLimit ?? env.AUTH_REGISTER_IP_LIMIT,
    10,
    1000,
  );
  db.exec(`CREATE TABLE IF NOT EXISTS auth_request_limits (
    key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL
  ); CREATE INDEX IF NOT EXISTS auth_request_limits_expiry ON auth_request_limits(expires_at);`);
  let lastCleanup = 0;
  function consume(key, limit, timestamp) {
    const expires = (Math.floor(timestamp / windowMs) + 1) * windowMs;
    const hash = crypto
      .createHash("sha256")
      .update(`${expires}:${key}`)
      .digest("hex");
    const row = db
      .prepare(
        `INSERT INTO auth_request_limits VALUES (?,1,?)
      ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count < ? RETURNING count`,
      )
      .get(hash, expires, limit);
    if (!row) return Math.max(1, Math.ceil((expires - timestamp) / 1000));
    return 0;
  }
  return (req, res, next) => {
    if (req.method !== "POST") return next();
    const timestamp = now();
    if (timestamp - lastCleanup > 300000) {
      db.prepare("DELETE FROM auth_request_limits WHERE expires_at <= ?").run(
        timestamp,
      );
      lastCleanup = timestamp;
    }
    const registering = /\/register\/?$/i.test(req.originalUrl.split("?")[0]);
    const address = req.ip || req.socket.remoteAddress || "unknown";
    let retryAfter = consume(
      `${registering ? "register" : "login"}:ip:${address}`,
      registering ? registerLimit : ipLimit,
      timestamp,
    );
    if (!registering && typeof req.body?.username === "string") {
      const username = req.body.username.trim().slice(0, 40).toLowerCase();
      retryAfter ||= consume(
        `login:account:${username}`,
        accountLimit,
        timestamp,
      );
    }
    if (!retryAfter) return next();
    return res
      .status(429)
      .set("Retry-After", String(retryAfter))
      .json({
        error: `尝试次数较多，请 ${Math.ceil(retryAfter / 60)} 分钟后重试`,
        code: "AUTH_RATE_LIMITED",
        retryAfter,
      });
  };
}
