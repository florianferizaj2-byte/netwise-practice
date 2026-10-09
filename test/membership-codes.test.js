import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/index.js";
import { createStore } from "../server/store.js";

process.env.ALLOWED_HOSTS = "127.0.0.1,localhost";
process.env.COOKIE_SECURE = "0";
delete process.env.ADMIN_USERNAME;

async function fixture(t) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "aceexam-membership-test-"),
  );
  const store = createStore(directory);
  const admin = store.register("membership_admin", "fixture-password-123");
  const learner = store.register("membership_learner", "fixture-password-123");
  const adminToken = store.createAuthSession(admin.id);
  const learnerToken = store.createAuthSession(learner.id);
  const app = await createApp({ store, withFrontend: false });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    await app.locals.stop();
    await new Promise((resolve) => server.close(resolve));
    store.db.close();
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("aceexam-membership-test-"));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  async function request(url, body, token = adminToken) {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api${url}`,
      {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
    return {
      status: response.status,
      cacheControl: response.headers.get("cache-control"),
      data: await response.json(),
    };
  }
  return { store, admin, learner, adminToken, learnerToken, request };
}

const payload = (changes = {}) => ({
  plan: "vip",
  quantity: 65,
  durationDays: 90,
  expiresAt: null,
  requestId: crypto.randomUUID(),
  ...changes,
});
const exportedLines = (result) => result.data.text.trim().split("\r\n");

test("membership code listing, creation and TXT export require an authenticated administrator", async (t) => {
  const { request, learnerToken, store } = await fixture(t);
  for (const token of [null, learnerToken]) {
    const expectedStatus = token ? 403 : 401;
    for (const [url, body] of [
      ["/admin/membership-codes", undefined],
      ["/admin/membership-codes", payload()],
      ["/admin/membership-codes/export", {}],
    ]) {
      const result = await request(url, body, token);
      assert.equal(result.status, expectedStatus);
      assert.ok(!result.data.codes && !result.data.text);
    }
  }
  const list = await request("/admin/membership-codes");
  assert.equal(list.status, 200);
  assert.equal(list.data.total, 30);
  assert.equal(list.data.codes.length, 30);
  const exported = await request("/admin/membership-codes/export", {});
  assert.equal(exported.status, 200);
  assert.equal(exported.cacheControl, "no-store");
  assert.equal(exported.data.count, 30);
  assert.match(exported.data.filename, /^kaojiang-membership-all-30-.*\.txt$/);
  assert.equal(store.adminMembershipCodes().total, 30);
});

test("creating 1000 unique codes is atomic and retrying the same request recovers the batch", async (t) => {
  const { request, store } = await fixture(t);
  const input = payload({ plan: "ssvip", quantity: 1000, durationDays: 365 });
  const first = await request("/admin/membership-codes", input);
  assert.equal(first.status, 200);
  assert.equal(first.data.codes.length, 1000);
  assert.equal(new Set(first.data.codes.map((code) => code.code)).size, 1000);
  assert.ok(
    first.data.codes.every(
      (code) => code.plan === "ssvip" && code.durationDays === 365,
    ),
  );
  const repeated = await request("/admin/membership-codes", input);
  assert.equal(repeated.status, 200);
  assert.equal(repeated.data.repeated, true);
  assert.equal(repeated.data.batchId, first.data.batchId);
  assert.deepEqual(repeated.data.codes, first.data.codes);
  assert.equal(store.adminMembershipCodes().total, 1030);
  assert.equal(
    (await request("/admin/membership-codes", { ...input, quantity: 999 }))
      .status,
    409,
  );
  for (const invalid of [
    { quantity: 0 },
    { quantity: 1001 },
    { quantity: 1.5 },
    { durationDays: 0 },
    { durationDays: 366 },
    { plan: "free" },
    { expiresAt: "2000-01-01T00:00:00.000Z" },
  ]) {
    assert.equal(
      (await request("/admin/membership-codes", payload(invalid))).status,
      400,
    );
  }
  assert.equal(store.adminMembershipCodes().total, 1030);
  const audit = JSON.stringify(
    store.db.prepare("SELECT data FROM admin_audit").all(),
  );
  assert.ok(
    first.data.codes.every(
      (code) =>
        !audit.includes(code.code) &&
        !audit.includes(code.code.replaceAll("-", "")),
    ),
  );
});

test("TXT export includes every matching page, supports batches and selection, and preserves code status", async (t) => {
  const { request, store, learner, learnerToken } = await fixture(t);
  const created = await request("/admin/membership-codes", payload());
  const [used, revoked, expired, available] = created.data.codes;
  assert.equal(
    (await request("/account/redeem", { code: used.code }, learnerToken))
      .status,
    200,
  );
  assert.equal(
    (await request(`/admin/membership-codes/${revoked.id}/revoke`, {})).status,
    200,
  );
  store.db
    .prepare("UPDATE membership_codes SET expires_at=? WHERE id=?")
    .run("2000-01-01T00:00:00.000Z", expired.id);

  const filtered = await request("/admin/membership-codes/export", {
    plan: "vip",
    status: "available",
  });
  assert.equal(filtered.status, 200);
  assert.equal(filtered.data.count, 72); // 10 initial VIP + 65 new - 3 unavailable.
  const list = await request(
    "/admin/membership-codes?plan=vip&status=available&limit=30",
  );
  assert.equal(list.data.codes.length, 30);
  assert.equal(filtered.data.count, list.data.total);
  assert.equal(exportedLines(filtered).length, 72);
  assert.ok(!exportedLines(filtered).includes(used.code));
  assert.ok(!exportedLines(filtered).includes(revoked.code));
  assert.ok(!exportedLines(filtered).includes(expired.code));

  const batch = await request("/admin/membership-codes/export", {
    batchId: created.data.batchId,
  });
  assert.equal(batch.status, 200);
  assert.equal(batch.data.count, 65);
  assert.deepEqual(
    new Set(exportedLines(batch)),
    new Set(created.data.codes.map((code) => code.code)),
  );
  const selected = await request("/admin/membership-codes/export", {
    ids: [used.id, available.id, used.id],
  });
  assert.equal(selected.status, 200);
  assert.equal(selected.data.count, 2);
  assert.deepEqual(
    new Set(exportedLines(selected)),
    new Set([used.code, available.code]),
  );
  const byCode = await request("/admin/membership-codes/export", {
    search: available.code.toLowerCase(),
  });
  assert.equal(byCode.data.count, 1);
  assert.equal(exportedLines(byCode)[0], available.code);
  const byUsername = await request("/admin/membership-codes/export", {
    search: learner.username,
    status: "redeemed",
  });
  assert.equal(byUsername.data.count, 1);
  assert.equal(exportedLines(byUsername)[0], used.code);

  assert.equal(
    (
      await request("/admin/membership-codes/export", {
        ids: [available.id, crypto.randomUUID()],
      })
    ).status,
    409,
  );
  for (const invalid of [
    { ids: [] },
    { ids: ["invalid"] },
    { ids: [available.id], batchId: created.data.batchId },
    { batchId: crypto.randomUUID() },
    { search: "no-matching-code" },
    { status: "invalid" },
    { limit: 30 },
  ]) {
    assert.equal(
      (await request("/admin/membership-codes/export", invalid)).status,
      400,
    );
  }
  const states = store.adminMembershipCodes({ plan: "vip", limit: 100 }).codes;
  assert.equal(states.find((code) => code.id === used.id).status, "redeemed");
  assert.equal(states.find((code) => code.id === revoked.id).status, "revoked");
  assert.equal(states.find((code) => code.id === expired.id).status, "expired");
  const history = await request(
    "/account/redemptions",
    undefined,
    learnerToken,
  );
  assert.equal(history.data.redemptions.length, 1);
  assert.ok(!JSON.stringify(history.data).includes(used.code));
});

test("large exports report the limit instead of silently dropping codes", async (t) => {
  const { request, store } = await fixture(t);
  for (let index = 0; index < 10; index++)
    store.generateMembershipCodes({ plan: "vip", quantity: 1000 });
  const oversized = await request("/admin/membership-codes/export", {
    plan: "vip",
  });
  assert.equal(oversized.status, 400);
  assert.match(oversized.data.error, /10000/);
  assert.ok(!oversized.data.text);
  const narrower = await request("/admin/membership-codes/export", {
    plan: "svip",
  });
  assert.equal(narrower.status, 200);
  assert.equal(narrower.data.count, 10);
  const ids = store.db
    .prepare("SELECT id FROM membership_codes LIMIT 10000")
    .all()
    .map((row) => row.id);
  const atLimit = await request("/admin/membership-codes/export", { ids });
  assert.equal(atLimit.status, 200);
  assert.equal(atLimit.data.count, 10000);
  assert.equal(new Set(exportedLines(atLimit)).size, 10000);
  assert.equal(
    (
      await request("/admin/membership-codes/export", {
        ids: [...ids, crypto.randomUUID()],
      })
    ).status,
    400,
  );
  assert.equal(store.adminMembershipCodes().total, 10030);
});
