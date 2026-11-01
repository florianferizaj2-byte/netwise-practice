import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStore } from "../server/store.js";
import { createApp } from "../server/index.js";
import { createAccountSecurity } from "../server/account-security.js";
import { accountEmailEnabled } from "../server/account-mail.js";
import { accountTestMailbox } from "./helpers/account-mail.js";

test("email is opt-in; configured SMTP cannot enable it; password-only and WeChat registration work", async () => {
  for (const value of [undefined, "", "0", "false", "yes"]) assert.equal(accountEmailEnabled({ AUTH_EMAIL_VERIFICATION_ENABLED: value }), false);
  for (const value of ["1", "true", " TRUE "]) assert.equal(accountEmailEnabled({ AUTH_EMAIL_VERIFICATION_ENABLED: value }), true);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aceexam-email-off-")), store = createStore(dir), mailbox = accountTestMailbox();
  const service = createAccountSecurity(store, { enabled: false, mailer: mailbox });
  try {
    assert.deepEqual(service.config(), { emailVerificationRequired: false, emailAvailable: false });
    const user = await service.register({ username: "plain_user", password: "fixture-password-123" });
    assert.equal(user.isAdmin, false); assert.ok(store.authenticate("plain_user", "fixture-password-123"));
    assert.equal(store.db.prepare("SELECT count(*) AS n FROM account_emails").get().n, 0);
    await assert.rejects(service.register({ username: "PLAIN_USER", password: "fixture-password-123" }), error => error.status === 409);
    for (const method of ["sendCode", "resetPassword", "bindEmail"]) await assert.rejects(service[method]({}, user), error => error.code === "EMAIL_FEATURE_DISABLED");
    await assert.rejects(service.register({ username: "fake_verified", password: "fixture-password-123", email: "fake@example.test" }));
    const token = store.createWechatLoginChallenge({ appid: "fixture", openid: "wechat-off" });
    const linked = await service.register({ username: "wechat_plain", password: "fixture-password-123", bindingToken: token }, { wechat: true });
    assert.equal(store.wechatIdentity("fixture", "wechat-off").userId, linked.id);
    assert.equal(mailbox.messages.length, 0);
  } finally { store.db.close(); assert.equal(path.dirname(dir), os.tmpdir()); assert.ok(path.basename(dir).startsWith("aceexam-email-off-")); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("turning email off preserves existing verified addresses and codes, while blocking mail operations", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aceexam-email-retain-")), store = createStore(dir), mailbox = accountTestMailbox();
  const active = createAccountSecurity(store, { enabled: true, mailer: mailbox });
  try {
    const email = "retained@example.test";
    const challenge = await active.sendCode({ purpose: "register", email, username: "verified_user" });
    const user = await active.register({ username: "verified_user", password: "fixture-password-123", email, challengeId: challenge.challengeId, code: mailbox.latest(email, "register").code });
    const disabled = createAccountSecurity(store, { enabled: false, mailer: mailbox });
    const before = store.db.prepare("SELECT * FROM account_emails").all();
    await assert.rejects(disabled.sendCode({ purpose: "reset", email, username: "verified_user" }), error => error.code === "EMAIL_FEATURE_DISABLED");
    assert.equal(disabled.view(user.id).emailBound, true); assert.equal(disabled.view(user.id).emailVerificationRequired, false);
    assert.deepEqual(store.db.prepare("SELECT * FROM account_emails").all(), before);
    assert.equal(mailbox.messages.length, 1); assert.equal(active.config().emailVerificationRequired, true);
  } finally { store.db.close(); assert.equal(path.dirname(dir), os.tmpdir()); assert.ok(path.basename(dir).startsWith("aceexam-email-retain-")); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("default HTTP mode registers and changes passwords without email and never sends with SMTP configured", async () => {
  const previous = process.env.AUTH_EMAIL_VERIFICATION_ENABLED; delete process.env.AUTH_EMAIL_VERIFICATION_ENABLED;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aceexam-email-off-api-")), store = createStore(dir), mailbox = accountTestMailbox();
  const app = await createApp({ store, withFrontend: false, accountSecurity: { mailer: mailbox } });
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const req = (url, body, cookie) => fetch(base + url, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    assert.deepEqual(await (await req("/auth/security-config")).json(), { emailVerificationRequired: false, emailAvailable: false });
    const created = await req("/auth/register", { username: "plain_http", password: "fixture-password-123" });
    assert.equal(created.status, 200); const cookie = created.headers.get("set-cookie").split(";")[0];
    for (const url of ["/auth/email-code", "/auth/reset-password", "/auth/bind-email"]) {
      const response = await req(url, {}, cookie); assert.equal(response.status, 503); assert.equal((await response.json()).code, "EMAIL_FEATURE_DISABLED");
    }
    assert.equal((await req("/auth/change-password", { currentPassword: "fixture-password-123", password: "changed-password-123" }, cookie)).status, 200);
    assert.equal((await (await req("/auth/me", null, cookie)).json()).authenticated, false);
    assert.ok(store.authenticate("plain_http", "changed-password-123")); assert.equal(mailbox.messages.length, 0);
  } finally {
    await app.locals.stop(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); store.db.close();
    if (previous === undefined) delete process.env.AUTH_EMAIL_VERIFICATION_ENABLED; else process.env.AUTH_EMAIL_VERIFICATION_ENABLED = previous;
    assert.equal(path.dirname(dir), os.tmpdir()); assert.ok(path.basename(dir).startsWith("aceexam-email-off-api-")); fs.rmSync(dir, { recursive: true, force: true });
  }
});
