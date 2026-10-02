import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createAuthRateLimiter } from "../server/auth-rate-limit.js";

test("login limits persist across limiter recreation, share account counts across addresses, and expire", () => {
  const db = new DatabaseSync(":memory:");
  let now = 60000;
  const options = {
    now: () => now,
    windowMs: 60000,
    accountLimit: 2,
    ipLimit: 10,
    registerLimit: 1,
  };
  const invoke = (limiter, ip, username, path = "/api/auth/login") => {
    let allowed = false,
      response = {};
    const res = {
      status(value) {
        response.status = value;
        return this;
      },
      set(name, value) {
        response[name] = value;
        return this;
      },
      json(body) {
        response.body = body;
      },
    };
    limiter(
      { method: "POST", originalUrl: path, ip, body: { username } },
      res,
      () => {
        allowed = true;
      },
    );
    return { allowed, ...response };
  };
  try {
    let limiter = createAuthRateLimiter(db, options);
    assert.equal(invoke(limiter, "one", "learner").allowed, true);
    assert.equal(invoke(limiter, "two", "learner").allowed, true);
    limiter = createAuthRateLimiter(db, options);
    const limited = invoke(limiter, "three", "learner");
    assert.equal(limited.status, 429);
    assert.equal(limited["Retry-After"], "60");
    assert.equal(invoke(limiter, "one", "different_user").allowed, true);
    assert.equal(
      invoke(limiter, "one", "registration", "/api/auth/wechat/register")
        .allowed,
      true,
    );
    assert.equal(
      invoke(limiter, "one", "other", "/api/auth/register").status,
      429,
    );
    for (const url of ["/api/auth/register/", "/api/auth/REGISTER?source=test", "/api/auth/wechat/REGISTER/"]) {
      assert.equal(invoke(limiter, "one", "another_user", url).status, 429);
    }
    now += 60000;
    assert.equal(invoke(limiter, "one", "learner").allowed, true);
  } finally {
    db.close();
  }
});
