import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStore } from "../server/store.js";
import { createApp } from "../server/index.js";
import {
  createAccountSecurity,
  canonicalEmail,
} from "../server/account-security.js";
import { createAccountMailer } from "../server/account-mail.js";
import { accountTestMailbox } from "./helpers/account-mail.js";

test("verified account lifecycle: uniqueness, OTP enforcement, recovery, expiry and sessions", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aceexam-email-test-"));
  const store = createStore(dir),
    mailbox = accountTestMailbox();
  let time = Date.now();
  const service = createAccountSecurity(store, {
    enabled: true, mailer: mailbox,
    now: () => time,
  });
  const send = async (purpose, username, email, extra = {}) => {
    time += 61000;
    const result = await service.sendCode({
      purpose,
      username,
      email,
      ...extra,
    });
    return {
      email,
      challengeId: result.challengeId,
      code: mailbox.latest(email, purpose).code,
    };
  };
  try {
    await t.test(
      "registration only after code, canonical mailbox unique and public signup never admin",
      async () => {
        await assert.rejects(
          service.register({
            username: "RealLearner",
            password: "fixture-password",
          }),
        );
        const proof = await send(
          "register",
          "RealLearner",
          "Student.Name+study@gmail.com",
        );
        assert.ok(
          !JSON.stringify(
            store.db.prepare("SELECT * FROM account_email_codes").all(),
          ).includes(`"${proof.code}"`),
        );
        const user = await service.register({
          username: "RealLearner",
          password: "fixture-password",
          ...proof,
        });
        assert.equal(user.isAdmin, false);
        assert.equal(store.allUsers().length, 1);
        await assert.rejects(
          service.register({
            username: "RealLearner",
            password: "fixture-password",
            ...proof,
          }),
          /验证码/,
        );
        const duplicate = await send(
          "register",
          "other_account",
          "studentname@googlemail.com",
        );
        await assert.rejects(
          service.register({
            username: "other_account",
            password: "fixture-password",
            ...duplicate,
          }),
          (error) => error.code === "EMAIL_ALREADY_BOUND",
        );
        const caseProof = await send(
          "register",
          "reallearner",
          "other@example.test",
        );
        await assert.rejects(
          service.register({
            username: "reallearner",
            password: "fixture-password",
            ...caseProof,
          }),
          (error) => error.status === 409,
        );
        assert.equal(store.allUsers().length, 1);
        assert.equal(
          (await store.authenticateAsync("REALLEARNER", "fixture-password")).id,
          user.id,
        );
      },
    );
    const user = store.allUsers()[0],
      token = store.createAuthSession(user.id);
    await t.test(
      "wrong identity / unknown user get same send response, cannot reset, no username-only takeover",
      async () => {
        for (const username of ["RealLearner", "unknown_user"]) {
          const proof = await send("reset", username, "stranger@example.test");
          await assert.rejects(
            service.resetPassword({
              username,
              password: "attacker-password",
              ...proof,
            }),
            /验证码/,
          );
        }
        assert.ok(store.authUser(token));
        assert.ok(store.authenticate("RealLearner", "fixture-password"));
      },
    );
    await t.test(
      "five failures, purpose / subject mismatch, expired code and resend invalidate old",
      async () => {
        let proof = await send("reset", "RealLearner", "studentname@gmail.com");
        const wrong = proof.code === "000000" ? "000001" : "000000";
        for (let i = 0; i < 5; i++)
          await assert.rejects(
            service.resetPassword({
              username: "RealLearner",
              password: "new-password-123",
              ...proof,
              code: wrong,
            }),
            /验证码/,
          );
        await assert.rejects(
          service.resetPassword({
            username: "RealLearner",
            password: "new-password-123",
            ...proof,
          }),
          /验证码/,
        );
        proof = await send("reset", "RealLearner", "studentname@gmail.com");
        time += 600001;
        await assert.rejects(
          service.resetPassword({
            username: "RealLearner",
            password: "new-password-123",
            ...proof,
          }),
          /验证码/,
        );
        time += 3600000;
        const old = await send("reset", "RealLearner", "studentname@gmail.com");
        const fresh = await send(
          "reset",
          "RealLearner",
          "studentname@gmail.com",
        );
        await assert.rejects(
          service.resetPassword({
            username: "RealLearner",
            password: "new-password-123",
            ...old,
          }),
          /验证码/,
        );
        await assert.rejects(
          service.register({
            username: "RealLearner",
            password: "new-password-123",
            ...fresh,
          }),
          /验证码/,
        );
        await service.resetPassword({
          username: "RealLearner",
          password: "new-password-123",
          ...fresh,
        });
        assert.equal(store.authUser(token), null);
        assert.equal(
          store.authenticate("RealLearner", "fixture-password"),
          null,
        );
        assert.ok(store.authenticate("RealLearner", "new-password-123"));
      },
    );
    await t.test(
      "legacy bind requires password, unique mailbox, password change revokes all devices and stale codes",
      async () => {
        const legacy = store.register("legacy_user", "legacy-password");
        assert.equal(service.view(legacy.id).emailBound, false);
        await assert.rejects(
          service.sendCode(
            {
              purpose: "bind",
              email: "legacy@example.test",
              currentPassword: "wrong-password",
            },
            { user: legacy },
          ),
          /当前密码/,
        );
        time += 61000;
        const sent = await service.sendCode(
          {
            purpose: "bind",
            email: "legacy@example.test",
            currentPassword: "legacy-password",
          },
          { user: legacy },
        );
        const proof = {
          email: "legacy@example.test",
          challengeId: sent.challengeId,
          code: mailbox.latest("legacy@example.test", "bind").code,
        };
        await assert.rejects(
          service.bindEmail(
            { ...proof, currentPassword: "wrong-password" },
            legacy,
          ),
          /当前密码/,
        );
        assert.equal(
          (
            await service.bindEmail(
              { ...proof, currentPassword: "legacy-password" },
              legacy,
            )
          ).emailBound,
          true,
        );
        const tokens = [
          store.createAuthSession(legacy.id),
          store.createAuthSession(legacy.id),
        ];
        const resetProof = await send(
          "reset",
          "legacy_user",
          "legacy@example.test",
        );
        await service.changePassword(
          {
            currentPassword: "legacy-password",
            password: "changed-password-123",
          },
          legacy,
        );
        assert.ok(tokens.every((value) => !store.authUser(value)));
        await assert.rejects(
          service.resetPassword({
            username: "legacy_user",
            password: "another-password-123",
            ...resetProof,
          }),
          /验证码/,
        );
        assert.ok(store.authenticate("legacy_user", "changed-password-123"));
      },
    );
    await t.test(
      "cooldown, persistent limits, mail failure never reports delivered, config has no secrets",
      async () => {
        const email = "rate@example.test";
        await send("register", "rate_user", email);
        await assert.rejects(
          service.sendCode({
            purpose: "register",
            username: "rate_user_2",
            email,
          }),
          (error) => error.status === 429,
        );
        const restarted = createAccountSecurity(store, {
          enabled: true, mailer: mailbox,
          now: () => time,
        });
        await assert.rejects(
          restarted.sendCode({
            purpose: "register",
            username: "rate_user",
            email,
          }),
          (error) => error.status === 429,
        );
        const failing = createAccountSecurity(store, {
          enabled: true, mailer: {
            available: true,
            async sendCode() {
              throw new Error("secret SMTP detail");
            },
          },
          now: () => time,
        });
        await assert.rejects(
          failing.sendCode({
            purpose: "register",
            username: "fail_user",
            email: "fail@example.test",
          }),
          (error) =>
            error.code === "EMAIL_DELIVERY_FAILED" &&
            !error.message.includes("secret"),
        );
        const unavailable = createAccountSecurity(store, {
          enabled: true, mailer: createAccountMailer({}),
        });
        await assert.rejects(
          unavailable.sendCode({
            purpose: "register",
            username: "fail_user",
            email: "fail@example.test",
          }),
          (error) => error.status === 503,
        );
        assert.deepEqual(unavailable.config(), {
          emailAvailable: false,
          emailVerificationRequired: true,
        });
        assert.equal(canonicalEmail("a.b+test@googlemail.com"), "ab@gmail.com");
      },
    );
  } finally {
    service.close();
    store.db.close();
    assert.equal(path.dirname(dir), os.tmpdir());
    assert.ok(path.basename(dir).startsWith("aceexam-email-test-"));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("HTTP registration has no legacy/wechat bypass; session proof and delivery errors are visible", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aceexam-email-http-"));
  const store = createStore(dir),
    mailbox = accountTestMailbox();
  const app = await createApp({
    store,
    withFrontend: false,
    accountSecurity: { enabled: true, mailer: mailbox },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (url, body, cookie) =>
    fetch(base + url, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  try {
    for (const url of ["/auth/register", "/auth/wechat/register"]) {
      assert.equal(
        (
          await request(url, {
            username: "verified_learner",
            password: "fixture-password",
          })
        ).status,
        400,
      );
    }
    const sent = await (
      await request("/auth/email-code", {
        purpose: "register",
        username: "verified_learner",
        email: "verified@example.test",
      })
    ).json();
    assert.equal("code" in sent, false);
    const response = await request("/auth/register", {
      username: "verified_learner",
      password: "fixture-password",
      email: "verified@example.test",
      challengeId: sent.challengeId,
      code: mailbox.latest("verified@example.test", "register").code,
    });
    assert.equal(response.status, 200);
    const cookie = response.headers.get("set-cookie").split(";")[0];
    assert.equal((await request("/auth/security")).status, 401);
    const security = await (
      await request("/auth/security", null, cookie)
    ).json();
    assert.equal(security.emailBound, true);
    assert.equal("email" in security, false);
    assert.equal(
      (
        await request(
          "/auth/change-password",
          { currentPassword: "wrong-password", password: "new-password-123" },
          cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          "/auth/change-password",
          { currentPassword: "fixture-password", password: "new-password-123" },
          cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await (await request("/auth/me", null, cookie)).json()).authenticated,
      false,
    );
    assert.equal(
      (
        await request("/auth/login", {
          username: "verified_learner",
          password: "new-password-123",
        })
      ).status,
      200,
    );
  } finally {
    await app.locals.stop();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    store.db.close();
    assert.equal(path.dirname(dir), os.tmpdir());
    assert.ok(path.basename(dir).startsWith("aceexam-email-http-"));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
