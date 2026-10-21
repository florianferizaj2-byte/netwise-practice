import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStore } from "../server/store.js";
import { createAccountSecurity } from "../server/account-security.js";
import { recoverAccountAfterReview } from "../server/account-recovery.js";
import { accountTestMailbox } from "./helpers/account-mail.js";

test("local reviewed recovery revokes sessions, keeps learning and roles, and audits without secrets", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aceexam-recovery-test-"));
  const store = createStore(dir),
    service = createAccountSecurity(store, { mailer: accountTestMailbox() });
  const user = store.register("old_account", "old-password-123");
  store.selectCertificate(user.id, "network-engineer");
  const question = store
    .allQ()
    .find((q) => q.certificates.includes("network-engineer"));
  store.recordAttempt(question.id, question.answer, 1000, user.id);
  const token = store.createAuthSession(user.id),
    before = store.allA(user.id);
  try {
    await assert.rejects(
      recoverAccountAfterReview(store.db, {
        username: "old_account",
        password: "new-password-123",
        reason: "ticket-20261015",
        ownershipReviewed: false,
      }),
      /核验/,
    );
    assert.ok(store.authenticate("old_account", "old-password-123"));
    await recoverAccountAfterReview(store.db, {
      username: "old_account",
      password: "new-password-123",
      reason: "ticket-20261015",
      ownershipReviewed: true,
    });
    assert.equal(store.authUser(token), null);
    assert.equal(store.authenticate("old_account", "old-password-123"), null);
    assert.ok(store.authenticate("old_account", "new-password-123"));
    assert.deepEqual(store.allA(user.id), before);
    assert.equal(store.userById(user.id).certificateId, "network-engineer");
    assert.equal(store.userById(user.id).isAdmin, user.isAdmin);
    const audit = store.db
      .prepare("SELECT * FROM account_recovery_audit")
      .all();
    assert.equal(audit.length, 1);
    assert.equal(audit[0].reason, "ticket-20261015");
    assert.ok(!JSON.stringify(audit).includes("password-123"));
  } finally {
    service.close();
    store.db.close();
    assert.equal(path.dirname(dir), os.tmpdir());
    assert.ok(path.basename(dir).startsWith("aceexam-recovery-test-"));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("restarting a store does not promote unprivileged public accounts", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aceexam-role-restart-"));
  let store = createStore(dir);
  try {
    const user = store.register("public_fixture", "fixture-password-123");
    store.db.prepare("UPDATE users SET is_admin=0 WHERE id=?").run(user.id);
    store.db.close();
    store = createStore(dir);
    assert.equal(store.userById(user.id).isAdmin, false);
  } finally {
    store.db.close();
    assert.equal(path.dirname(dir), os.tmpdir());
    assert.ok(path.basename(dir).startsWith("aceexam-role-restart-"));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
