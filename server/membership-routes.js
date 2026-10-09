import { z } from "zod";
import {
  membershipCodeBatchLimit,
  membershipCodeExportLimit,
} from "./memberships.js";

export function registerMembershipRoutes({
  route,
  store,
  requireAdmin,
  requestUserId,
  accountEntitlementView,
}) {
  const attempts = new Map();
  const filters = z.object({
    plan: z.enum(["", "vip", "svip", "ssvip"]).default(""),
    status: z
      .enum(["", "available", "redeemed", "revoked", "expired"])
      .default(""),
    search: z.string().trim().max(80).default(""),
  });
  function checkAttempts(req, userId) {
    const now = Date.now();
    for (const [key, entry] of attempts)
      if (entry.until <= now) attempts.delete(key);
    const scopes = [
      [`user:${userId}`, 10],
      [`ip:${req.ip}`, 100],
    ];
    for (const [key, limit] of scopes) {
      const entry = attempts.get(key);
      if (entry && entry.count >= limit)
        throw Object.assign(new Error("兑换尝试过于频繁，请 10 分钟后再试"), {
          status: 429,
        });
    }
    for (const [key] of scopes) {
      const entry = attempts.get(key) || { count: 0, until: now + 600000 };
      entry.count++;
      attempts.set(key, entry);
    }
  }
  route("post", "/api/account/redeem", (req) => {
    const userId = requestUserId(req);
    checkAttempts(req, userId);
    const { code } = z
      .object({ code: z.string().trim().min(1).max(80) })
      .strict()
      .parse(req.body);
    const result = store.redeemMembershipCode(userId, code);
    return { ...result, entitlements: accountEntitlementView(userId) };
  });
  route("get", "/api/account/redemptions", (req) => ({
    redemptions: store.membershipRedemptions(requestUserId(req)),
  }));
  route("get", "/api/admin/membership-codes", (req) => {
    requireAdmin(req);
    const query = filters
      .extend({
        limit: z.coerce.number().int().min(1).max(100).default(30),
        offset: z.coerce.number().int().min(0).max(1000000).default(0),
      })
      .parse(req.query);
    return store.adminMembershipCodes(query);
  });
  route("post", "/api/admin/membership-codes", (req) => {
    requireAdmin(req);
    const input = z
      .object({
        plan: z.enum(["vip", "svip", "ssvip"]),
        quantity: z.number().int().min(1).max(membershipCodeBatchLimit),
        durationDays: z.number().int().min(1).max(365),
        expiresAt: z.string().datetime().nullable().default(null),
        requestId: z.string().uuid(),
      })
      .strict()
      .parse(req.body);
    return store.generateMembershipCodes({
      ...input,
      createdBy: req.user.id,
      requestKey: `admin:${req.user.id}:${input.requestId}`,
    });
  });
  route("post", "/api/admin/membership-codes/export", (req) => {
    requireAdmin(req);
    const input = filters
      .extend({
        ids: z
          .array(z.string().uuid())
          .min(1)
          .max(membershipCodeExportLimit)
          .optional(),
        batchId: z.string().uuid().optional(),
      })
      .strict()
      .refine(
        (value) => !value.ids || !value.batchId,
        "请选择勾选导出或整批导出",
      )
      .parse(req.body);
    const codes = store.exportMembershipCodes(input);
    const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
    const scope = input.batchId
      ? "batch"
      : input.ids
        ? "selected"
        : input.plan || "all";
    return {
      filename: `kaojiang-membership-${scope}-${codes.length}-${stamp}.txt`,
      count: codes.length,
      text: codes.map((code) => code.code).join("\r\n") + "\r\n",
    };
  });
  route("post", "/api/admin/membership-codes/:id/revoke", (req) => {
    requireAdmin(req);
    return { code: store.revokeMembershipCode(req.params.id, req.user.id) };
  });
}
