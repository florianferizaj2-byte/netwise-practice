import crypto from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import { accountEmailEnabled, createAccountMailer } from "./account-mail.js";

const scrypt = promisify(crypto.scrypt);
const digest = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
export const accountUsername = z
  .string()
  .trim()
  .min(3)
  .max(40)
  .regex(/^[A-Za-z0-9_-]+$/, "账号只能使用字母、数字、下划线或连字符");
export const accountPassword = z.string().min(8, "密码至少 8 位").max(128);
const emailSchema = z
  .string()
  .trim()
  .max(254)
  .email("请输入有效的邮箱地址")
  .transform((value) => value.toLowerCase());
const codeFields = {
  email: emailSchema,
  challengeId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/, "请输入 6 位验证码"),
};
export const registrationSchema = z
  .object({
    username: accountUsername,
    password: accountPassword,
    ...codeFields,
  })
  .strict();
export const wechatRegistrationSchema = registrationSchema.extend({
  bindingToken: z.string().trim().min(20).max(200),
});
const fail = (message, status = 400, code = "ACCOUNT_SECURITY_ERROR") =>
  Object.assign(new Error(message), { status, code });
const invalidCode = () =>
  fail("验证码无效、已失效或已使用，请重新获取", 400, "EMAIL_CODE_INVALID");
const credentialVersion = (row) =>
  row ? digest(`${row.salt}:${row.password_hash}`) : "";
export function canonicalEmail(email) {
  const [local, domain] = email.toLowerCase().split("@");
  return ["gmail.com", "googlemail.com"].includes(domain)
    ? `${local.split("+")[0].replaceAll(".", "")}@gmail.com`
    : `${local}@${domain}`;
}

export function createAccountSecurity(store, options = {}) {
  const db = store.db,
    now = options.now || Date.now;
  const mailer = options.mailer || createAccountMailer();
  const enabled = options.enabled ?? accountEmailEnabled();
  const requireEmailFeature = () => {
    if (!enabled) throw fail("邮箱验证与邮箱找回暂未启用", 503, "EMAIL_FEATURE_DISABLED");
  };
  const resendMs = options.resendMs ?? 60000;
  const blocked = new Set(
    (
      process.env.AUTH_BLOCKED_EMAIL_DOMAINS ||
      "mailinator.com,guerrillamail.com,10minutemail.com,tempmail.com"
    )
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  db.exec(`CREATE TABLE IF NOT EXISTS account_emails (
    user_id TEXT PRIMARY KEY REFERENCES users(id), email TEXT NOT NULL,
    email_key TEXT NOT NULL UNIQUE, verified_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS account_email_codes (
    id TEXT PRIMARY KEY, purpose TEXT NOT NULL, email TEXT NOT NULL, email_key TEXT NOT NULL,
    subject TEXT NOT NULL, user_id TEXT, credential_version TEXT NOT NULL,
    code_hash TEXT NOT NULL, salt TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS account_email_codes_scope ON account_email_codes(email_key,purpose,subject);
  CREATE TABLE IF NOT EXISTS account_security_limits (
    key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL
  );`);
  const transaction = (work) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
  const account = (id) => db.prepare("SELECT * FROM users WHERE id=?").get(id);
  const byUsername = (name) => {
    const exact = db.prepare("SELECT * FROM users WHERE username=?").get(name);
    if (exact) return exact;
    const matches = db
      .prepare("SELECT * FROM users WHERE lower(username)=lower(?) LIMIT 2")
      .all(name);
    return matches.length === 1 ? matches[0] : null;
  };
  const bound = (id) =>
    db.prepare("SELECT * FROM account_emails WHERE user_id=?").get(id);
  const throttle = (key, limit, windowMs) => {
    const timestamp = now(),
      expiry = (Math.floor(timestamp / windowMs) + 1) * windowMs;
    const result = db
      .prepare(
        `INSERT INTO account_security_limits VALUES (?,1,?)
      ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count < ? RETURNING count`,
      )
      .get(digest(`${expiry}:${key}`), expiry, limit);
    if (!result)
      throw Object.assign(
        fail("操作频繁，请稍后重试", 429, "AUTH_RATE_LIMITED"),
        { retryAfter: Math.ceil((expiry - timestamp) / 1000) },
      );
  };
  const passwordProof = async (user, password) => {
    const row = user?.id && account(user.id);
    if (!row || row.banned_at) throw fail("请重新登录", 401);
    const result = await scrypt(password, row.salt, 64);
    if (
      !crypto.timingSafeEqual(Buffer.from(row.password_hash, "base64"), result)
    )
      throw fail("当前密码不正确", 400, "CURRENT_PASSWORD_INVALID");
    return row;
  };
  function view(userId) {
    const row = bound(userId);
    const [local, domain] = row?.email.split("@") || [];
    return {
      emailBound: !!row,
      maskedEmail: row
        ? `${local.slice(0, Math.min(2, local.length))}***@${domain}`
        : null,
      emailAvailable: enabled && mailer.available,
      emailVerificationRequired: enabled,
    };
  }
  async function sendCode(raw, { user, address = "unknown" } = {}) {
    requireEmailFeature();
    const body = z
      .object({
        purpose: z.enum(["register", "reset", "bind"]),
        email: emailSchema,
        username: accountUsername.optional(),
        currentPassword: accountPassword.optional(),
      })
      .strict()
      .parse(raw);
    if (!mailer.available)
      throw fail(
        "邮件验证服务暂未开通，请稍后重试或联系管理员；已有账号仍可正常登录",
        503,
        "EMAIL_SERVICE_UNAVAILABLE",
      );
    const emailKey = canonicalEmail(body.email),
      domain = emailKey.split("@")[1];
    if (
      [...blocked].some(
        (value) => domain === value || domain.endsWith(`.${value}`),
      )
    )
      throw fail("请使用可长期接收邮件的邮箱", 400, "EMAIL_DOMAIN_BLOCKED");
    // The mailbox cooldown is shared by all purposes and usernames, so it cannot be bypassed by changing account names.
    transaction(() => {
      db.prepare("DELETE FROM account_security_limits WHERE expires_at<=?").run(
        now(),
      );
      db.prepare("DELETE FROM account_email_codes WHERE expires_at<=?").run(
        now() - 86400000,
      );
      throttle(`send:ip:${address}`, 20, 3600000);
      throttle(`send:mail:${emailKey}`, 5, 3600000);
      throttle("send:global", 500, 86400000);
      const latest = db
        .prepare(
          "SELECT created_at FROM account_email_codes WHERE email_key=? ORDER BY created_at DESC LIMIT 1",
        )
        .get(emailKey);
      if (latest && latest.created_at + resendMs > now())
        throw Object.assign(
          fail("验证码已发送，请稍后再获取", 429, "EMAIL_CODE_COOLDOWN"),
          {
            retryAfter: Math.ceil(
              (latest.created_at + resendMs - now()) / 1000,
            ),
          },
        );
    });
    let target = null,
      subject;
    if (body.purpose === "bind") {
      if (!body.currentPassword) throw fail("请先输入当前密码");
      target = await passwordProof(user, body.currentPassword);
      if (bound(target.id))
        throw fail("账号已绑定邮箱；如需更换，请联系管理员核验身份", 409);
      subject = target.id;
    } else {
      if (!body.username) throw fail("请先输入账号");
      subject = body.username.toLowerCase();
      if (body.purpose === "reset") {
        const candidate = byUsername(body.username);
        if (
          candidate &&
          !candidate.banned_at &&
          bound(candidate.id)?.email_key === emailKey
        )
          target = candidate;
      }
    }
    const id = crypto.randomUUID(),
      salt = crypto.randomBytes(16).toString("base64"),
      code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    const codeHash = (await scrypt(code, salt, 32)).toString("base64");
    // A second lock closes concurrent sends while hashing / checking the password.
    transaction(() => {
      const latest = db
        .prepare(
          "SELECT created_at FROM account_email_codes WHERE email_key=? ORDER BY created_at DESC LIMIT 1",
        )
        .get(emailKey);
      if (latest && latest.created_at + resendMs > now())
        throw Object.assign(fail("验证码已发送，请稍后再获取", 429), {
          retryAfter: Math.ceil((latest.created_at + resendMs - now()) / 1000),
        });
      db.prepare(
        "INSERT INTO account_email_codes (id,purpose,email,email_key,subject,user_id,credential_version,code_hash,salt,status,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,'sending',?,?)",
      ).run(
        id,
        body.purpose,
        body.email,
        emailKey,
        subject,
        target?.id || null,
        credentialVersion(target),
        codeHash,
        salt,
        now() + 600000,
        now(),
      );
    });
    try {
      // Use the same delivery path for unknown / unbound reset accounts: no account enumeration response or fast path.
      await mailer.sendCode({ email: body.email, code, purpose: body.purpose });
      transaction(() => {
        db.prepare(
          "UPDATE account_email_codes SET status='used' WHERE email_key=? AND purpose=? AND subject=? AND id<>? AND status='ready'",
        ).run(emailKey, body.purpose, subject, id);
        db.prepare(
          "UPDATE account_email_codes SET status='ready' WHERE id=?",
        ).run(id);
      });
    } catch {
      db.prepare(
        "UPDATE account_email_codes SET status='failed' WHERE id=?",
      ).run(id);
      throw fail(
        "验证码邮件发送失败，请稍后重试",
        503,
        "EMAIL_DELIVERY_FAILED",
      );
    }
    return {
      challengeId: id,
      expiresIn: 600,
      retryAfter: Math.ceil(resendMs / 1000),
      message:
        "验证码已发送，请检查收件箱和垃圾邮件。找回密码须使用账号此前已绑定的邮箱。",
    };
  }
  async function consume(body, purpose, subject, work) {
    const row = db
      .prepare("SELECT * FROM account_email_codes WHERE id=?")
      .get(body.challengeId);
    const actual = await scrypt(
      body.code,
      row?.salt || "invalid-challenge",
      32,
    );
    const result = transaction(() => {
      const current = db
        .prepare("SELECT * FROM account_email_codes WHERE id=?")
        .get(body.challengeId);
      if (
        !current ||
        current.status !== "ready" ||
        current.expires_at <= now() ||
        current.attempts >= 5
      )
        return { error: invalidCode() };
      db.prepare(
        "UPDATE account_email_codes SET attempts=attempts+1 WHERE id=?",
      ).run(current.id);
      if (
        current.purpose !== purpose ||
        current.subject !== subject ||
        current.email_key !== canonicalEmail(body.email) ||
        !crypto.timingSafeEqual(
          Buffer.from(current.code_hash, "base64"),
          actual,
        )
      )
        return { error: invalidCode() };
      if (
        purpose !== "register" &&
        (!current.user_id ||
          credentialVersion(account(current.user_id)) !==
            current.credential_version ||
          account(current.user_id)?.banned_at)
      )
        return { error: invalidCode() };
      const value = work(current);
      db.prepare("UPDATE account_email_codes SET status='used' WHERE id=?").run(
        current.id,
      );
      return { value };
    });
    if (result.error) throw result.error;
    return result.value;
  }
  async function register(raw, { wechat = false } = {}) {
    if (enabled && (!raw?.email || !raw?.challengeId || !raw?.code))
      throw fail(
        "新账号需要验证邮箱，请获取邮箱验证码；旧版 App 请更新或前往网站注册",
        400,
        "EMAIL_VERIFICATION_REQUIRED",
      );
    const plainSchema = z.object({ username: accountUsername, password: accountPassword,
      ...(wechat ? { bindingToken: z.string().trim().min(20).max(200) } : {}) }).strict();
    const body = (enabled ? (wechat ? wechatRegistrationSchema : registrationSchema) : plainSchema).parse(raw);
    const salt = crypto.randomBytes(16).toString("base64"),
      hash = (await scrypt(body.password, salt, 64)).toString("base64");
    const createUser = () => {
      if (
        process.env.ADMIN_USERNAME?.trim().toLowerCase() ===
        body.username.toLowerCase()
      )
        throw fail(
          "该账号名不可用，请使用其他账号名",
          409,
          "USERNAME_RESERVED",
        );
      if (
        enabled && db
          .prepare("SELECT 1 FROM account_emails WHERE email_key=?")
          .get(canonicalEmail(body.email))
      )
        throw fail(
          "该邮箱已绑定账号，请登录或找回密码",
          409,
          "EMAIL_ALREADY_BOUND",
        );
      const challenge = wechat && store.wechatLoginChallenge(body.bindingToken);
      if (wechat && !challenge)
        throw fail("微信绑定已过期，请重新点击微信登录", 401);
      const user = store.registerWithHash(body.username, salt, hash);
      // Public sign-up never grants administrator privileges, including the first account.
      db.prepare("UPDATE users SET is_admin=0 WHERE id=?").run(user.id);
      user.isAdmin = false;
      if (enabled) db.prepare("INSERT INTO account_emails VALUES (?,?,?,?)").run(
        user.id,
        body.email,
        canonicalEmail(body.email),
        now(),
      );
      if (wechat) {
        store.bindWechatIdentity({ ...challenge, userId: user.id });
        store.consumeWechatLoginChallenge(body.bindingToken);
      }
      return user;
    };
    return enabled ? consume(body, "register", body.username.toLowerCase(), createUser) : transaction(createUser);
  }
  async function bindEmail(raw, user) {
    requireEmailFeature();
    const body = z
      .object({ ...codeFields, currentPassword: accountPassword })
      .strict()
      .parse(raw);
    const proof = await passwordProof(user, body.currentPassword);
    return consume(body, "bind", user.id, (row) => {
      if (credentialVersion(account(user.id)) !== credentialVersion(proof))
        throw invalidCode();
      if (bound(user.id)) throw fail("账号已绑定邮箱", 409);
      if (
        db
          .prepare("SELECT 1 FROM account_emails WHERE email_key=?")
          .get(row.email_key)
      )
        throw fail("该邮箱已绑定其他账号", 409, "EMAIL_ALREADY_BOUND");
      db.prepare("INSERT INTO account_emails VALUES (?,?,?,?)").run(
        user.id,
        row.email,
        row.email_key,
        now(),
      );
      return view(user.id);
    });
  }
  async function resetPassword(raw) {
    requireEmailFeature();
    const body = z
      .object({
        ...codeFields,
        username: accountUsername,
        password: accountPassword,
      })
      .strict()
      .parse(raw);
    const salt = crypto.randomBytes(16).toString("base64"),
      hash = (await scrypt(body.password, salt, 64)).toString("base64");
    return consume(body, "reset", body.username.toLowerCase(), (row) => {
      if (bound(row.user_id)?.email_key !== row.email_key) throw invalidCode();
      replacePassword(row.user_id, hash, salt);
      return {
        changed: true,
        message: "密码已重置，请使用新密码登录；其他设备的登录已退出",
      };
    });
  }
  function replacePassword(userId, hash, salt) {
    db.prepare("UPDATE users SET password_hash=?,salt=? WHERE id=?").run(
      hash,
      salt,
      userId,
    );
    db.prepare("DELETE FROM auth_sessions WHERE user_id=?").run(userId);
    db.prepare(
      "UPDATE account_email_codes SET status='used' WHERE user_id=?",
    ).run(userId);
  }
  async function changePassword(raw, user) {
    const body = z
      .object({ currentPassword: accountPassword, password: accountPassword })
      .strict()
      .parse(raw);
    const proof = await passwordProof(user, body.currentPassword);
    if (body.password === body.currentPassword)
      throw fail("新密码不能与当前密码相同");
    const salt = crypto.randomBytes(16).toString("base64"),
      hash = (await scrypt(body.password, salt, 64)).toString("base64");
    return transaction(() => {
      if (credentialVersion(account(user.id)) !== credentialVersion(proof))
        throw fail("密码已发生变化，请重新登录", 401);
      replacePassword(user.id, hash, salt);
      return {
        changed: true,
        message: "密码已修改，请重新登录；其他设备的登录已退出",
      };
    });
  }
  return {
    sendCode,
    register,
    resetPassword,
    bindEmail,
    changePassword,
    view,
    close: () => mailer.close?.(),
    config: () => ({
      emailVerificationRequired: enabled,
      emailAvailable: enabled && mailer.available,
    }),
  };
}
