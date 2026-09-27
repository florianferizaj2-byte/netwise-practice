import crypto from "node:crypto";

export const membershipPlans = {
  vip: { name: "VIP", generationLimit: 100 },
  svip: { name: "SVIP", generationLimit: 300 },
  ssvip: { name: "SSVIP", generationLimit: 600 },
};
const DAY = 86400000;
const PERIOD = 30 * DAY;
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const iso = (time = Date.now()) => new Date(time).toISOString();
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
const normalizeCode = (value) =>
  String(value || "")
    .toUpperCase()
    .replace(/[\s-]/g, "");
const displayCode = (row) =>
  `${row.plan.toUpperCase()}-${row.code
    .slice(row.plan.length)
    .match(/.{1,5}/g)
    .join("-")}`;
const codeStatus = (row, now = Date.now()) =>
  row.redeemedAt
    ? "redeemed"
    : row.revokedAt
      ? "revoked"
      : row.expiresAt && Date.parse(row.expiresAt) <= now
        ? "expired"
        : "available";

export function createMembershipStore(db) {
  if (
    !db
      .prepare("PRAGMA table_info(user_entitlements)")
      .all()
      .some((column) => column.name === "started_at")
  )
    db.exec("ALTER TABLE user_entitlements ADD COLUMN started_at TEXT");
  db.exec(`
    CREATE TABLE IF NOT EXISTS membership_code_batches (
      id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL, plan TEXT NOT NULL,
      quantity INTEGER NOT NULL, duration_days INTEGER NOT NULL, expires_at TEXT,
      created_by TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS membership_codes (
      id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES membership_code_batches(id),
      code TEXT UNIQUE NOT NULL, plan TEXT NOT NULL CHECK(plan IN ('vip','svip','ssvip')),
      duration_days INTEGER NOT NULL CHECK(duration_days>0), created_at TEXT NOT NULL,
      expires_at TEXT, redeemed_by TEXT REFERENCES users(id), redeemed_at TEXT,
      membership_expires_at TEXT, revoked_by TEXT, revoked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS membership_codes_batch ON membership_codes(batch_id);
    CREATE INDEX IF NOT EXISTS membership_codes_user ON membership_codes(redeemed_by,redeemed_at);
    CREATE TABLE IF NOT EXISTS membership_generation_usage (
      user_id TEXT NOT NULL, period_start TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id,period_start)
    );
    CREATE TABLE IF NOT EXISTS membership_generation_reservations (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, period_start TEXT NOT NULL,
      amount INTEGER NOT NULL, refunded_at TEXT, created_at TEXT NOT NULL
    );
  `);
  const transaction = (run) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = run();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
  const rowSelect = `SELECT c.id,c.batch_id AS batchId,c.code,c.plan,c.duration_days AS durationDays,
    c.created_at AS createdAt,c.expires_at AS expiresAt,c.redeemed_by AS redeemedBy,
    c.redeemed_at AS redeemedAt,c.membership_expires_at AS membershipExpiresAt,c.revoked_at AS revokedAt,
    u.username AS redeemedUsername FROM membership_codes c LEFT JOIN users u ON u.id=c.redeemed_by`;
  const publicRow = (row) => ({
    ...row,
    code: displayCode(row),
    status: codeStatus(row),
  });
  const audit = (actor, action, target, data) =>
    db
      .prepare(
        "INSERT INTO admin_audit (id,admin_user_id,action,target_type,target_id,data,created_at) VALUES (?,?,?,?,?,?,?)",
      )
      .run(
        crypto.randomUUID(),
        actor || "system",
        action,
        "membership_codes",
        target,
        JSON.stringify(data),
        iso(),
      );

  const api = {
    accountEntitlement(userId = "local") {
      const row = db
        .prepare(
          "SELECT plan,expires_at AS expiresAt,api_config_unlocked AS apiConfigUnlocked,started_at AS startedAt,updated_at AS updatedAt FROM user_entitlements WHERE user_id=?",
        )
        .get(userId);
      const active =
        !!membershipPlans[row?.plan] &&
        (!row.expiresAt || Date.parse(row.expiresAt) > Date.now());
      const plan = active ? row.plan : "free";
      const start = Date.parse(row?.startedAt || row?.updatedAt || iso());
      const periodStart = iso(
        start + Math.max(0, Math.floor((Date.now() - start) / PERIOD)) * PERIOD,
      );
      const periodEnd = iso(
        Math.min(
          Date.parse(periodStart) + PERIOD,
          active && row?.expiresAt ? Date.parse(row.expiresAt) : Infinity,
        ),
      );
      const used = active
        ? db
            .prepare(
              "SELECT used FROM membership_generation_usage WHERE user_id=? AND period_start=?",
            )
            .get(userId, periodStart)?.used || 0
        : 0;
      const limit = membershipPlans[plan]?.generationLimit || 0;
      return {
        plan,
        expiresAt: row?.expiresAt || null,
        apiConfigUnlocked: !!row?.apiConfigUnlocked,
        startedAt: row?.startedAt || row?.updatedAt || null,
        generation: {
          limit,
          used,
          remaining: Math.max(0, limit - used),
          periodStart: active ? periodStart : null,
          periodEnd: active ? periodEnd : null,
        },
      };
    },
    saveAccountEntitlement(userId, entitlement) {
      const current = api.accountEntitlement(userId);
      const next = { ...current, ...entitlement };
      if (next.plan !== "free" && !membershipPlans[next.plan])
        throw fail("未知的会员等级");
      const startedAt =
        entitlement.startedAt ||
        (current.plan === next.plan && current.startedAt
          ? current.startedAt
          : iso());
      db.prepare(
        `INSERT INTO user_entitlements (user_id,plan,expires_at,api_config_unlocked,updated_at,started_at)
        VALUES (?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan,expires_at=excluded.expires_at,
        api_config_unlocked=excluded.api_config_unlocked,updated_at=excluded.updated_at,started_at=excluded.started_at`,
      ).run(
        userId,
        next.plan,
        next.expiresAt || null,
        next.apiConfigUnlocked ? 1 : 0,
        iso(),
        startedAt,
      );
      return api.accountEntitlement(userId);
    },
    generateMembershipCodes({
      plan,
      quantity = 10,
      durationDays = 30,
      expiresAt = null,
      createdBy = null,
      requestKey = crypto.randomUUID(),
    }) {
      if (
        !membershipPlans[plan] ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 100 ||
        !Number.isInteger(durationDays) ||
        durationDays < 1 ||
        durationDays > 365
      )
        throw fail("请选择会员等级，数量为 1—100 个，会员时长为 1—365 天");
      if (
        expiresAt &&
        (!Number.isFinite(Date.parse(expiresAt)) ||
          Date.parse(expiresAt) <= Date.now())
      )
        throw fail("兑换截止时间必须晚于当前时间");
      return transaction(() => {
        const previous = db
          .prepare("SELECT * FROM membership_code_batches WHERE request_key=?")
          .get(requestKey);
        if (previous) {
          if (
            previous.plan !== plan ||
            previous.quantity !== quantity ||
            previous.duration_days !== durationDays ||
            previous.expires_at !== expiresAt
          )
            throw fail("本次生成请求已使用，请刷新后重试", 409);
          return {
            batchId: previous.id,
            codes: db
              .prepare(`${rowSelect} WHERE c.batch_id=? ORDER BY c.rowid`)
              .all(previous.id)
              .map(publicRow),
            repeated: true,
          };
        }
        const batchId = crypto.randomUUID(),
          createdAt = iso();
        db.prepare(
          "INSERT INTO membership_code_batches VALUES (?,?,?,?,?,?,?,?)",
        ).run(
          batchId,
          requestKey,
          plan,
          quantity,
          durationDays,
          expiresAt,
          createdBy,
          createdAt,
        );
        const insert = db.prepare(
          "INSERT OR IGNORE INTO membership_codes (id,batch_id,code,plan,duration_days,created_at,expires_at) VALUES (?,?,?,?,?,?,?)",
        );
        for (let index = 0; index < quantity;) {
          const random = Array.from(
            crypto.randomBytes(20),
            (byte) => alphabet[byte % alphabet.length],
          ).join("");
          index += insert.run(
            crypto.randomUUID(),
            batchId,
            plan.toUpperCase() + random,
            plan,
            durationDays,
            createdAt,
            expiresAt,
          ).changes;
        }
        audit(createdBy, "membership_codes_created", batchId, {
          plan,
          quantity,
          durationDays,
        });
        return {
          batchId,
          codes: db
            .prepare(`${rowSelect} WHERE c.batch_id=? ORDER BY c.rowid`)
            .all(batchId)
            .map(publicRow),
          repeated: false,
        };
      });
    },
    ensureInitialMembershipCodes() {
      return Object.keys(membershipPlans).map((plan) =>
        api.generateMembershipCodes({
          plan,
          requestKey: `initial-membership-v1-${plan}`,
        }),
      );
    },
    adminMembershipCodes({
      plan = "",
      status = "",
      search = "",
      limit = 30,
      offset = 0,
    } = {}) {
      const now = iso();
      const stateSql =
        "CASE WHEN c.redeemed_at IS NOT NULL THEN 'redeemed' WHEN c.revoked_at IS NOT NULL THEN 'revoked' WHEN c.expires_at IS NOT NULL AND c.expires_at<=? THEN 'expired' ELSE 'available' END";
      const where = `WHERE (?='' OR c.plan=?) AND (?='' OR (${stateSql})=?) AND (?='' OR instr(c.code,?)>0 OR instr(lower(COALESCE(u.username,'')),lower(?))>0)`;
      const params = [
        plan,
        plan,
        status,
        now,
        status,
        search,
        normalizeCode(search),
        search,
      ];
      const codes = db
        .prepare(
          `${rowSelect} ${where} ORDER BY c.created_at DESC,c.rowid DESC LIMIT ? OFFSET ?`,
        )
        .all(...params, limit, offset)
        .map(publicRow);
      const total = db
        .prepare(
          `SELECT count(*) AS count FROM membership_codes c LEFT JOIN users u ON u.id=c.redeemed_by ${where}`,
        )
        .get(...params).count;
      const summary = { available: 0, redeemed: 0, revoked: 0, expired: 0 };
      for (const row of db
        .prepare(
          `SELECT (${stateSql}) AS status,count(*) AS count FROM membership_codes c GROUP BY status`,
        )
        .all(now))
        summary[row.status] = row.count;
      return { codes, total, summary, limit, offset };
    },
    revokeMembershipCode(id, adminId) {
      return transaction(() => {
        const row = db.prepare(`${rowSelect} WHERE c.id=?`).get(id);
        if (!row) throw fail("兑换码不存在", 404);
        if (row.redeemedAt)
          throw fail("该兑换码已使用，不能作废已发放的会员", 409);
        if (!row.revokedAt) {
          db.prepare(
            "UPDATE membership_codes SET revoked_at=?,revoked_by=? WHERE id=?",
          ).run(iso(), adminId, id);
          audit(adminId, "membership_code_revoked", id, { plan: row.plan });
        }
        return publicRow(db.prepare(`${rowSelect} WHERE c.id=?`).get(id));
      });
    },
    redeemMembershipCode(userId, code) {
      return transaction(() => {
        if (
          !db
            .prepare("SELECT id FROM users WHERE id=? AND banned_at IS NULL")
            .get(userId)
        )
          throw fail("请登录有效账号后兑换", 401);
        const row = db
          .prepare(`${rowSelect} WHERE c.code=?`)
          .get(normalizeCode(code));
        if (!row) throw fail("兑换码无效，请检查后重试");
        if (row.redeemedBy === userId)
          return {
            alreadyRedeemed: true,
            redemption: {
              plan: row.plan,
              durationDays: row.durationDays,
              expiresAt: row.membershipExpiresAt,
            },
          };
        if (row.redeemedAt) throw fail("该兑换码已被使用", 409);
        if (row.revokedAt) throw fail("该兑换码已作废");
        if (codeStatus(row) === "expired")
          throw fail("该兑换码已超过兑换截止时间");
        const current = api.accountEntitlement(userId);
        if (current.plan !== "free" && current.plan !== row.plan)
          throw fail(
            `你当前是 ${membershipPlans[current.plan].name}，有效期内可用同等级兑换码续期；其他等级请在当前会员到期后兑换`,
            409,
          );
        if (current.plan !== "free" && !current.expiresAt)
          throw fail("当前为长期会员，无需兑换时长", 409);
        const now = Date.now();
        const expiresAt = iso(
          Math.max(
            now,
            current.plan === row.plan ? Date.parse(current.expiresAt) || 0 : 0,
          ) +
            row.durationDays * DAY,
        );
        api.saveAccountEntitlement(userId, {
          plan: row.plan,
          expiresAt,
          ...(current.plan === "free" ? { startedAt: iso(now) } : {}),
        });
        db.prepare(
          "UPDATE membership_codes SET redeemed_by=?,redeemed_at=?,membership_expires_at=? WHERE id=? AND redeemed_at IS NULL",
        ).run(userId, iso(now), expiresAt, row.id);
        return {
          alreadyRedeemed: false,
          redemption: {
            plan: row.plan,
            durationDays: row.durationDays,
            expiresAt,
          },
        };
      });
    },
    membershipRedemptions(userId) {
      return db
        .prepare(
          "SELECT id,plan,duration_days AS durationDays,redeemed_at AS redeemedAt,membership_expires_at AS expiresAt FROM membership_codes WHERE redeemed_by=? ORDER BY redeemed_at DESC LIMIT 30",
        )
        .all(userId);
    },
    reserveMembershipGeneration(userId, amount) {
      if (!Number.isInteger(amount) || amount < 1) throw fail("出题数量无效");
      return transaction(() => {
        const entitlement = api.accountEntitlement(userId);
        if (
          entitlement.plan === "free" ||
          entitlement.generation.remaining < amount
        )
          return null;
        const period = entitlement.generation.periodStart,
          id = crypto.randomUUID();
        db.prepare(
          "INSERT INTO membership_generation_usage (user_id,period_start,used) VALUES (?,?,?) ON CONFLICT(user_id,period_start) DO UPDATE SET used=used+excluded.used",
        ).run(userId, period, amount);
        db.prepare(
          "INSERT INTO membership_generation_reservations (id,user_id,period_start,amount,created_at) VALUES (?,?,?,?,?)",
        ).run(id, userId, period, amount, iso());
        return id;
      });
    },
    refundMembershipGeneration(userId, id) {
      return transaction(() => {
        const row = db
          .prepare(
            "SELECT * FROM membership_generation_reservations WHERE id=? AND user_id=? AND refunded_at IS NULL",
          )
          .get(id, userId);
        if (!row) return false;
        db.prepare(
          "UPDATE membership_generation_reservations SET refunded_at=? WHERE id=?",
        ).run(iso(), id);
        db.prepare(
          "UPDATE membership_generation_usage SET used=MAX(0,used-?) WHERE user_id=? AND period_start=?",
        ).run(row.amount, userId, row.period_start);
        return true;
      });
    },
  };
  api.ensureInitialMembershipCodes();
  return api;
}
