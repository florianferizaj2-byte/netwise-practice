import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function fixture(api) {
  let definition;
  const auth = [], redirects = [];
  vm.runInNewContext(fs.readFileSync(new URL("../miniprogram/pages/auth/index.js", import.meta.url), "utf8"), {
    Page: page => { definition = page; },
    require: name => name.endsWith("/api") ? api : { errorMessage: error => error.message },
    getApp: () => ({ globalData: {}, setAuth: result => auth.push(result) }),
    wx: { redirectTo: value => redirects.push(value.url) },
    setInterval: () => 1, clearInterval: () => {},
  });
  return { page: { ...definition, data: { ...definition.data, emailVerificationRequired: true, emailPolicyReady: true }, setData(fields) { Object.assign(this.data, fields); } }, auth, redirects };
}

test("mini-program registration requires email proof and forwards it through WeChat binding", async () => {
  const calls = [];
  const { page, auth } = fixture({ registerWechat: (...args) => { calls.push(args); return Promise.resolve({ user: { id: "learner" } }); } });
  Object.assign(page.data, { phase: "register", username: "learner", password: "fixture-password-123", passwordConfirm: "fixture-password-123", bindingToken: "fixture-wechat-token" });
  page.handleRegister(); assert.equal(calls.length, 0); assert.match(page.data.error, /邮箱验证码/);
  Object.assign(page.data, { email: "learner@example.test", emailCode: "123456", challengeId: "fixture-email-token" });
  page.handleRegister(); await Promise.resolve(); await Promise.resolve();
  assert.equal(calls.length, 1); assert.deepEqual(JSON.parse(JSON.stringify(calls[0][3])), { email: "learner@example.test", code: "123456", challengeId: "fixture-email-token" });
  assert.equal(auth.length, 1);
});

test("mini-program recovery checks confirmation, resets through API and returns to login", async () => {
  const calls = [];
  const { page, auth } = fixture({ request: async (url, options) => { calls.push({ url, options }); return { changed: true }; } });
  Object.assign(page.data, { phase: "reset", username: "old_user", password: "new-password-123", passwordConfirm: "different-password-123", email: "old@example.test", emailCode: "123456", challengeId: "fixture-email-token" });
  await page.handleReset(); assert.equal(calls.length, 0);
  page.data.passwordConfirm = page.data.password; await page.handleReset();
  assert.equal(calls[0].url, "/auth/reset-password"); assert.equal(calls[0].options.data.email, "old@example.test");
  assert.equal(page.data.phase, "password"); assert.equal(page.data.password, ""); assert.equal(page.data.challengeId, ""); assert.equal(auth.length, 0);
});

test("mini-program code delivery is locked while pending and account edits invalidate the proof", async () => {
  let release, calls = 0;
  const { page } = fixture({ request: () => { calls++; return new Promise(resolve => { release = resolve; }); } });
  Object.assign(page.data, { phase: "register", username: "learner", email: "learner@example.test" });
  const pending = page.sendEmailCode(); await page.sendEmailCode(); assert.equal(calls, 1);
  release({ challengeId: "fixture-email-token", retryAfter: 60, message: "验证码已发送" }); await pending;
  assert.equal(page.data.challengeId, "fixture-email-token"); assert.equal(page.data.codeWait, 60);
  page.handleInput({ currentTarget: { dataset: { field: "username" } }, detail: { value: "other_learner" } });
  assert.equal(page.data.challengeId, ""); page.onUnload();
});

test("mini-program plain registration remains available when the email switch is off", async () => {
  const calls = [];
  const { page } = fixture({ registerWechat: (...args) => { calls.push(args); return Promise.resolve({ user: { id: "plain" } }); } });
  Object.assign(page.data, { emailVerificationRequired: false, emailPolicyReady: true, phase: "register", username: "plain_user", password: "fixture-password-123", passwordConfirm: "fixture-password-123", bindingToken: "wechat-token" });
  page.handleRegister(); await Promise.resolve();
  assert.equal(calls.length, 1); assert.equal(calls[0][3], undefined);
});
