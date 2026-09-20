import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import http from "node:http";
import { createStore } from "../server/store.js";
import { createApp } from "../server/index.js";
import { OpenAICompatibleProvider } from "../server/ai.js";
import { encrypt } from "../server/security.js";
import { fixtureQuestion, mockAI } from "./ai-fixture.js";

const verdict = {
  valid: true,
  relevant: true,
  singleAnswerCorrect: true,
  contradictions: [],
  reason: "Verified",
};
const question = (i) =>
  fixtureQuestion(i - 1, {
    stage: ["基础理解", "直接计算", "变式计算", "反向推理", "综合应用"][
      (i - 1) % 5
    ],
    difficulty: "easy",
  });
async function fixture(t, fetchImpl, options = {}) {
  process.env.AI_MASTER_KEY = crypto.randomBytes(32).toString("base64");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "netwise-api-")),
    store = createStore(dir),
    provider = new OpenAICompatibleProvider(store, { fetch: fetchImpl }),
    app = await createApp({
      store,
      provider,
      withFrontend: false,
      authRequired: options.authRequired ?? false,
    });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    app.locals.stop();
    await new Promise((r) => server.close(r));
    store.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const req = async (p, body, method, headers = {}) => {
    const res = await fetch(url + "/api" + p, {
      method: method || (body ? "POST" : "GET"),
      headers: { "Content-Type": "application/json", ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, data: await res.json() };
  };
  return { store, provider, req, url };
}
const response = (text) =>
  new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: typeof text === "string" ? text : JSON.stringify(text),
          },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
test("settings never return keys, cross-origin mutations denied, normal practice survives AI outage", async (t) => {
  const { req, store } = await fixture(
    t,
    async () => new Response("secret", { status: 401 }),
  );
  assert.equal(
    (
      await req(
        "/settings",
        {
          baseUrl: "https://example.com/v1",
          model: "test",
          apiKey: "private-test-key",
          temperature: 0.7,
          maxTokens: 4096,
        },
        "PUT",
      )
    ).status,
    200,
  );
  const settings = await req("/settings");
  assert.equal(settings.data.hasKey, true);
  assert.ok(!JSON.stringify(settings).includes("private-test-key"));
  assert.ok(!JSON.stringify(store.settings()).includes("private-test-key"));
  const test = await req("/ai/test", {});
  assert.match(test.data.error, /Key 无效/);
  assert.ok(!JSON.stringify(test).includes("private-test-key"));
  assert.equal(
    (
      await req("/settings/key", null, "DELETE", {
        Origin: "https://evil.example",
      })
    ).status,
    403,
  );
  const qs = (await req("/questions")).data;
  assert.ok(!("answer" in qs[0]));
  assert.ok(!("analysis" in qs[0]));
  const a = await req("/attempts", {
    questionId: qs[0].id,
    selected: ["A"],
    timeMs: 3000,
  });
  assert.equal(a.status, 200);
  assert.equal((await req("/wrong")).data.length, 1);
  assert.equal((await req("/settings")).data.usage.total.calls, 1);
  await req("/settings/key", null, "DELETE");
  assert.equal((await req("/settings")).data.hasKey, false);
});

test("practice API accepts five-option answers and keeps judgments single-select", async (t) => {
  const { req, store } = await fixture(t);
  const judgment = store.getQ("hcia-h12-811-recall-019");
  const fiveOptions = store.getQ("hcia-h12-811-recall-047");
  assert.equal(
    (
      await req("/attempts", {
        questionId: judgment.id,
        selected: ["A", "B"],
        timeMs: 1000,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await req("/attempts", {
        questionId: judgment.id,
        selected: judgment.answer,
        timeMs: 1000,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await req("/attempts", {
        questionId: fiveOptions.id,
        selected: fiveOptions.answer,
        timeMs: 1000,
      })
    ).status,
    200,
  );
});

test("accounts require login and certificate selection filters the question bank", async (t) => {
  process.env.AI_MASTER_KEY = crypto.randomBytes(32).toString("base64");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "netwise-auth-"));
  const store = createStore(dir);
  const app = await createApp({
    store,
    withFrontend: false,
    authRequired: true,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    app.locals.stop();
    await new Promise((r) => server.close(r));
    store.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  assert.equal((await fetch(base + "/api/questions")).status, 401);
  const registration = await fetch(base + "/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "candidate_1",
      password: "safe-password",
    }),
  });
  assert.equal(registration.status, 200);
  const registrationData = await registration.clone().json();
  assert.ok(
    registrationData.certificates
      .filter((certificate) => certificate.guide)
      .every((certificate) =>
      /^\d{4}-\d{2}-\d{2}$/.test(certificate.guide?.verifiedAt || ""),
      ),
  );
  const cookie = registration.headers.get("set-cookie").split(";")[0];
  assert.equal(
    (await fetch(base + "/api/questions", { headers: { Cookie: cookie } }))
      .status,
    409,
  );
  const chosen = await fetch(base + "/api/auth/certificate", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ certificateId: "hcia-datacom" }),
  });
  assert.equal(chosen.status, 200);
  const questions = await fetch(base + "/api/questions", {
    headers: { Cookie: cookie },
  });
  const data = await questions.json();
  assert.ok(data.length > 0 && data.length < store.allQ().length);
  assert.ok(data.every((q) => q.certificates.includes("hcia-datacom")));
  const dashboard = await fetch(base + "/api/dashboard", {
    headers: { Cookie: cookie },
  }).then((response) => response.json());
  assert.equal(dashboard.syllabus.version, "V2.0");
  assert.equal(dashboard.syllabus.modules.length, 22);
  assert.equal(dashboard.syllabus.coverage, 1);
  const exam = await fetch(base + "/api/exams", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ count: 20 }),
  }).then((response) => response.json());
  assert.equal(exam.questions.length, 20);
  assert.equal(exam.syllabusVersion, "V2.0");
  assert.equal(
    Object.values(exam.distribution).reduce((sum, count) => sum + count, 0),
    20,
  );
  const switched = await fetch(base + "/api/auth/certificate", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ certificateId: "network-engineer" }),
  }).then((response) => response.json());
  assert.equal(switched.user.certificateId, "network-engineer");
  const switchedDashboard = await fetch(base + "/api/dashboard", {
    headers: { Cookie: cookie },
  }).then((response) => response.json());
  assert.equal(switchedDashboard.certificate.id, "network-engineer");
  assert.equal(switchedDashboard.syllabus, null);
});

test("secure cookie follows the actual HTTP protocol", async (t) => {
  const previousCookieSecure = process.env.COOKIE_SECURE;
  process.env.COOKIE_SECURE = "1";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "netwise-cookie-protocol-"));
  const store = createStore(dir);
  const app = await createApp({
    store,
    withFrontend: false,
    authRequired: true,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    app.locals.stop();
    await new Promise((r) => server.close(r));
    store.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
    if (previousCookieSecure === undefined) delete process.env.COOKIE_SECURE;
    else process.env.COOKIE_SECURE = previousCookieSecure;
  });
  const registration = await fetch(base + "/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "cookie_protocol",
      password: "safe-password",
    }),
  });
  assert.equal(registration.status, 200);
  const setCookie = registration.headers.get("set-cookie");
  assert.ok(setCookie);
  assert.doesNotMatch(setCookie, /;\s*Secure(?:;|$)/i);
  const auth = await fetch(base + "/api/auth/me", {
    headers: { Cookie: setCookie.split(";")[0] },
  });
  assert.equal((await auth.json()).authenticated, true);
});

test("AI settings are isolated by account even when the old auth bypass flag is present", async (t) => {
  const previousMasterKey = process.env.AI_MASTER_KEY;
  const previousDisableAuth = process.env.DISABLE_AUTH;
  process.env.AI_MASTER_KEY = crypto.randomBytes(32).toString("base64");
  process.env.DISABLE_AUTH = "1";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "netwise-key-isolation-"));
  const store = createStore(dir);
  const app = await createApp({ store, withFrontend: false });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    app.locals.stop();
    await new Promise((resolve) => server.close(resolve));
    store.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
    if (previousMasterKey === undefined) delete process.env.AI_MASTER_KEY;
    else process.env.AI_MASTER_KEY = previousMasterKey;
    if (previousDisableAuth === undefined) delete process.env.DISABLE_AUTH;
    else process.env.DISABLE_AUTH = previousDisableAuth;
  });
  assert.equal((await fetch(base + "/api/settings")).status, 401);
  const register = async (username) => {
    const response = await fetch(base + "/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: "safe-password" }),
    });
    assert.equal(response.status, 200);
    return {
      cookie: response.headers.get("set-cookie").split(";")[0],
      user: (await response.json()).user,
    };
  };
  const request = async (cookie, route, body, method = body ? "POST" : "GET") => {
    const response = await fetch(base + "/api" + route, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  };
  const first = await register("key_owner");
  const second = await register("key_stranger");
  const configuration = {
    baseUrl: "https://example.com/v1",
    model: "test-model",
    apiKey: "first-account-only",
    temperature: 0.7,
  };
  assert.equal((await request(first.cookie, "/settings", configuration, "PUT")).status, 200);
  assert.equal((await request(first.cookie, "/settings")).data.hasKey, true);
  assert.equal((await request(second.cookie, "/settings")).data.hasKey, false);
  assert.ok(store.settings(first.user.id).keyCipher);
  assert.equal(store.settings(second.user.id).keyCipher, undefined);
  assert.equal(store.settings("local").keyCipher, undefined);
});

test("server-generated AI groups are immutable, shareable by certificate, and keep user progress isolated", async (t) => {
  process.env.AI_MASTER_KEY = crypto.randomBytes(32).toString("base64");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "netwise-ai-owner-"));
  const store = createStore(dir);
  const provider = new OpenAICompatibleProvider(store, { fetch: mockAI() });
  const app = await createApp({
    store,
    provider,
    withFrontend: false,
    authRequired: true,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    app.locals.stop();
    await new Promise((resolve) => server.close(resolve));
    store.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const request = async (
    cookie,
    route,
    body,
    method = body ? "POST" : "GET",
  ) => {
    const response = await fetch(base + "/api" + route, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  };
  const createUser = async (username, certificateId = "network-engineer") => {
    const registration = await fetch(base + "/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: "safe-password" }),
    });
    const cookie = registration.headers.get("set-cookie").split(";")[0];
    const user = (await registration.json()).user;
    await request(cookie, "/auth/certificate", { certificateId }, "PUT");
    return { cookie, user };
  };
  const owner = await createUser("ai_owner");
  store.saveSettings(owner.user.id, {
    baseUrl: "https://example.com/v1",
    model: "test",
    keyCipher: encrypt("secret"),
    temperature: 0.7,
  });
  const stranger = await createUser("ai_stranger");
  const otherCertificate = await createUser(
    "ai_other_certificate",
    "hcia-datacom",
  );
  const seed = store.allQ().find((q) => q.knowledgePoint === "OSPF DR/BDR");
  const forged = await request(owner.cookie, "/ai/train", {
    questionId: seed.id,
    count: 1,
    question: { answer: ["D"] },
  });
  assert.equal(forged.status, 400);
  const generated = await request(owner.cookie, "/ai/train", {
    questionId: seed.id,
    count: 1,
  });
  assert.equal(generated.status, 200);
  const publicAi = generated.data.questions[0];
  assert.ok(!("answer" in publicAi));
  assert.ok(!("analysis" in publicAi));
  assert.ok(!("ownerUserId" in publicAi));
  assert.ok(!("aiGroupId" in publicAi));
  const storedAi = store.getQ(publicAi.id);
  assert.equal(storedAi.ownerUserId, owner.user.id);
  assert.ok(storedAi.aiGroupId);
  assert.equal(
    store.db
      .prepare("SELECT user_id FROM ai_groups WHERE id=?")
      .get(storedAi.aiGroupId).user_id,
    owner.user.id,
  );
  assert.deepEqual(
    (await request(owner.cookie, "/queue")).data.map((q) => q.id),
    [storedAi.id],
  );
  assert.equal((await request(stranger.cookie, "/queue")).data.length, 0);
  assert.equal((await request(owner.cookie, "/ai/groups")).data.length, 1);
  assert.equal((await request(stranger.cookie, "/ai/groups")).data.length, 0);
  assert.equal(
    (await request(stranger.cookie, "/questions?source=ai_generated")).data
      .length,
    0,
  );
  const shared = await request(stranger.cookie, "/questions/shared-ai");
  assert.equal(shared.status, 200);
  assert.deepEqual(
    shared.data.map((q) => q.id),
    [storedAi.id],
  );
  assert.equal(shared.data[0].sourceLabel, "其他用户生成的 AI 题");
  assert.ok(!("answer" in shared.data[0]));
  assert.ok(!("analysis" in shared.data[0]));
  assert.ok(!("ownerUserId" in shared.data[0]));
  assert.equal(
    (await request(otherCertificate.cookie, "/questions/shared-ai")).data
      .length,
    0,
  );
  assert.equal(
    (await request(otherCertificate.cookie, `/questions/${storedAi.id}`))
      .status,
    404,
  );
  assert.equal(
    (await request(stranger.cookie, `/questions/${storedAi.id}`)).status,
    200,
  );
  assert.equal(
    (await request(stranger.cookie, `/questions/${storedAi.id}/reveal`, {}))
      .status,
    200,
  );
  const wrongAnswer = storedAi.answer[0] === "A" ? ["B"] : ["A"];
  assert.equal(
    (
      await request(stranger.cookie, "/attempts", {
        questionId: storedAi.id,
        selected: wrongAnswer,
        timeMs: 1000,
      })
    ).status,
    200,
  );
  assert.deepEqual(
    (await request(owner.cookie, "/queue")).data.map((q) => q.id),
    [storedAi.id],
  );
  const strangerWrong = (await request(stranger.cookie, "/wrong")).data;
  assert.deepEqual(
    strangerWrong.map((q) => q.id),
    [storedAi.id],
  );
  assert.ok(!("ownerUserId" in strangerWrong[0]));
  assert.ok(!("aiGroupId" in strangerWrong[0]));
  assert.equal(
    store.db
      .prepare(
        "SELECT COUNT(*) AS count FROM user_reviews WHERE user_id=? AND question_id=?",
      )
      .get(stranger.user.id, storedAi.id).count,
    1,
  );
  assert.equal(
    (
      await request(owner.cookie, "/attempts", {
        questionId: storedAi.id,
        selected: storedAi.answer,
        timeMs: 1000,
      })
    ).status,
    200,
  );
  assert.equal((await request(owner.cookie, "/queue")).data.length, 0);
  const groups = await request(owner.cookie, "/ai/groups");
  assert.equal(groups.data.length, 1);
  assert.equal(groups.data[0].shared, true);
  assert.equal(groups.data[0].questionCount, 1);
  const community = await request(stranger.cookie, "/dashboard");
  assert.equal(community.data.community.sharedQuestionCount, 1);
  assert.equal(community.data.community.contributorCount, 1);
  const feedback = await request(
    stranger.cookie,
    `/questions/${storedAi.id}/feedback`,
    { kind: "helpful" },
  );
  assert.equal(feedback.status, 200);
  assert.equal(feedback.data.feedback.helpful, 1);
  assert.equal(
    (await request(stranger.cookie, "/questions/shared-ai")).data[0].feedback
      .helpful,
    1,
  );
  assert.equal(
    (
      await request(
        owner.cookie,
        `/ai/groups/${storedAi.aiGroupId}/share`,
        { shared: false },
        "PUT",
      )
    ).status,
    200,
  );
  assert.equal(
    (await request(stranger.cookie, "/questions/shared-ai")).data.length,
    0,
  );
  assert.equal(
    (await request(stranger.cookie, `/questions/${storedAi.id}`)).status,
    404,
  );
  assert.equal(
    (await request(owner.cookie, `/questions/${storedAi.id}`)).status,
    200,
  );
});
test("普通题目可以提交异常举报并保存补充说明", async (t) => {
  const { req, store } = await fixture(t);
  const question = store.allQ().find((item) => item.source !== "ai_generated");
  const response = await req(`/questions/${question.id}/feedback`, {
    kind: "other",
    note: "题干与选项看起来不一致，请管理员复核。",
  });
  assert.equal(response.status, 200);
  assert.equal(response.data.feedback.other, 1);
  assert.equal(response.data.feedback.reportTotal, 1);
  const details = store.questionFeedbackDetails(question.id);
  assert.equal(details.length, 1);
  assert.equal(details[0].kind, "other");
  assert.equal(details[0].note, "题干与选项看起来不一致，请管理员复核。");
});
test("invalid AI JSON retries, valid structured analysis persists and usage counts actual requests", async (t) => {
  let calls = 0;
  const { store, provider } = await fixture(t, async () =>
    response(
      ++calls < 3
        ? "bad json"
        : {
            mistakeType: "broadcast_vs_last_host",
            weakKnowledge: "广播地址区别",
            reason: "用户可能混淆了广播地址与最后一个可用地址。",
          },
    ),
  );
  store.saveSettings({
    baseUrl: "https://example.com/v1",
    model: "test",
    keyCipher: encrypt("secret"),
    temperature: 0.7,
    maxTokens: 4096,
  });
  const q = store.allQ()[0];
  store.recordAttempt(q.id, ["A"], 1000);
  await provider.analyzeWeakness(q);
  assert.equal(calls, 3);
  assert.equal(
    store.wrongQuestions()[0].mistake.mistakeType,
    "broadcast_vs_last_host",
  );
  assert.equal(store.usage().total.total_tokens, 90);
});
test("batch generation validates, caches, consumes queue and refuses invalid batches atomically", async (t) => {
  let index = 0,
    calls = 0;
  const { store, provider } = await fixture(t, async (url, opts) => {
    calls++;
    const messages = JSON.parse(opts.body).messages;
    const system = messages[0].content;
    const payload = JSON.parse(messages[1].content);
    if (system.includes("逐题独立审核"))
      return response({
        reviews: payload.items.map(({ index }) => ({ index, ...verdict })),
      });
    if (system.includes("独立审核")) return response(verdict);
    return response({
      questions: payload.specs.map((spec) => ({
        ...question(++index),
        stage: spec.stage,
        difficulty: spec.difficulty,
      })),
    });
  });
  store.saveSettings({
    baseUrl: "https://example.com/v1",
    model: "test",
    keyCipher: encrypt("secret"),
    temperature: 0.7,
    maxTokens: 4096,
  });
  const q = store.allQ().find((q) => q.knowledgePoint === "OSPF DR/BDR");
  const batch = await provider.generatePracticeSet(q, 3);
  assert.equal(batch.questions.length, 3);
  assert.ok(batch.questions.every((q) => q.source === "ai_generated"));
  assert.equal(calls, 2);
  assert.equal((await provider.generatePracticeSet(q, 3)).cached, true);
  assert.equal(calls, 2);
  store.recordAttempt(batch.questions[0].id, ["A"], 1000);
  assert.equal(store.queue("OSPF DR/BDR:adaptive").length, 2);
  assert.equal(
    store.mastery().find((m) => m.knowledgePoint === "OSPF DR/BDR")
      .correctCount,
    1,
  );
  const before = store.allQ().length;
  provider.fetch = async () => response({ bad: true });
  await assert.rejects(provider.generatePracticeSet(q, 5), /3 次/);
  assert.equal(store.allQ().length, before);
});

test("batch generation keeps accepted questions and regenerates only rejected slots", async (t) => {
  let generated = 0;
  let reviews = 0;
  const generatedBatchSizes = [];
  const { store, provider } = await fixture(t, async (_url, opts) => {
    const messages = JSON.parse(opts.body).messages;
    const system = messages[0].content;
    const payload = JSON.parse(messages[1].content);
    if (system.includes("逐题独立审核")) {
      reviews++;
      return response({
        reviews: payload.items.map(({ index }) => ({
          index,
          ...verdict,
          ...(reviews === 1 && index === 1
            ? {
                valid: false,
                reason: "正确选项存在歧义，需要重新设问",
              }
            : {}),
        })),
      });
    }
    generatedBatchSizes.push(payload.specs.length);
    return response({
      questions: payload.specs.map((spec) => ({
        ...question(++generated),
        stage: spec.stage,
        difficulty: spec.difficulty,
      })),
    });
  });
  store.saveSettings({
    baseUrl: "https://example.com/v1",
    model: "test",
    keyCipher: encrypt("secret"),
    temperature: 0.7,
    maxTokens: 4096,
  });
  const q = store.allQ().find((item) => item.knowledgePoint === "OSPF DR/BDR");
  const before = store.allQ().length;
  const batch = await provider.generatePracticeSet(q, 3);
  assert.equal(batch.questions.length, 3);
  assert.deepEqual(generatedBatchSizes, [3, 1]);
  assert.equal(reviews, 2);
  assert.equal(store.allQ().length, before + 3);
});

test("管理员扩题兼容中文题型和选项数组输出", async (t) => {
  const { store, provider } = await fixture(t, async (_url, opts) => {
    const messages = JSON.parse(opts.body).messages;
    const system = messages[0].content;
    const payload = JSON.parse(messages[1].content);
    if (system.includes("逐题独立审核"))
      return response({
        reviews: payload.items.map(({ index }) => ({ index, ...verdict })),
      });
    const spec = payload.specs[0];
    return response({
      questions: [
        {
          type: "单选题",
          question: `管理员格式兼容测试：${payload.knowledgePoint} 的关键判断是什么？`,
          options: [
            "A. 正确结论",
            "B. 错误结论一",
            "C. 错误结论二",
            "D. 错误结论三",
          ],
          answer: "A",
          analysis: "先确认目标知识点的判断条件，再结合题干选择唯一符合条件的选项。",
          chapter: payload.chapter,
          knowledgePoint: payload.knowledgePoint,
          difficulty: spec.difficulty,
          tags: "管理员扩题",
        },
      ],
    });
  });
  store.saveSettings({
    baseUrl: "https://example.com/v1",
    model: "test",
    keyCipher: encrypt("secret"),
    temperature: 0.7,
    maxTokens: 4096,
  });
  const seed = store.allQ().find((item) => item.knowledgePoint === "OSPF DR/BDR");
  const [generated] = await provider.generateBankExpansion(seed, 1, {
    certificateId: "network-engineer",
  });
  assert.equal(generated.type, "single_choice");
  assert.deepEqual(generated.options, {
    A: "正确结论",
    B: "错误结论一",
    C: "错误结论二",
    D: "错误结论三",
  });
  assert.deepEqual(generated.answer, ["A"]);
});

test("AI training stream sends progress events and a final result", async (t) => {
  let generated = 0;
  const { store, url } = await fixture(t, async (_url, opts) => {
    const messages = JSON.parse(opts.body).messages;
    const system = messages[0].content;
    const payload = JSON.parse(messages[1].content);
    if (system.includes("逐题独立审核"))
      return response({
        reviews: payload.items.map(({ index }) => ({ index, ...verdict })),
      });
    return response({
      questions: payload.specs.map((spec) => ({
        ...question(++generated),
        stage: spec.stage,
        difficulty: spec.difficulty,
      })),
    });
  });
  store.saveSettings({
    baseUrl: "https://example.com/v1",
    model: "test",
    keyCipher: encrypt("secret"),
    temperature: 0.7,
    maxTokens: 4096,
  });
  const q = store.allQ().find((item) => item.knowledgePoint === "OSPF DR/BDR");
  const stream = await fetch(url + "/api/ai/train/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ questionId: q.id, count: 3 }),
  });
  assert.equal(stream.status, 200);
  assert.match(stream.headers.get("content-type"), /text\/event-stream/);
  const text = await stream.text();
  const events = text
    .trim()
    .split(/\r?\n\r?\n/)
    .map((record) => JSON.parse(record.match(/^data:\s*(.+)$/m)[1]));
  assert.ok(events.some((event) => event.type === "progress"));
  assert.ok(
    events.some(
      (event) =>
        event.type === "progress" && /独立质量审核/.test(event.message),
    ),
  );
  const done = events.at(-1);
  assert.equal(done.type, "done");
  assert.equal(done.result.questions.length, 3);
});

test("numeric conflicts and hint leaks are rejected before publication", async (t) => {
  const { store, provider } = await fixture(t, async () =>
    response({ text: "正确答案是 A，答案是 不参与 DR/BDR 选举" }),
  );
  store.saveSettings({
    baseUrl: "https://example.com/v1",
    model: "test",
    keyCipher: encrypt("secret"),
    temperature: 0.7,
    maxTokens: 4096,
  });
  const q = {
    ...store.allQ().find((q) => q.knowledgePoint === "OSPF DR/BDR"),
    options: question(1).options,
    answer: ["A"],
  };
  await assert.rejects(
    provider.explainQuestion(q, "给我提示", [], 1),
    /提示泄露/,
  );
  provider.fetch = async () => response("sk-supersecret");
  assert.equal(
    await provider.call([{ role: "user", content: "ok" }]),
    "[REDACTED]",
  );
});
test("exam is resumable, grades once, rejects forged answers and uses server deadline", async (t) => {
  const { req, store } = await fixture(t);
  const exam = (await req("/exams", { count: 5 })).data;
  assert.equal((await req("/exams/" + exam.id)).data.questions.length, 5);
  assert.ok(!exam.questions[0].answer);
  assert.equal(
    (await req("/exams/" + exam.id + "/submit", { answers: { fake: ["A"] } }))
      .status,
    400,
  );
  assert.equal(store.allA().length, 0);
  const answers = Object.fromEntries(
    exam.questionIds.map((id) => [id, store.getQ(id).answer]),
  );
  const r = await req("/exams/" + exam.id + "/submit", { answers });
  assert.equal(r.data.score, 100);
  assert.equal(store.allA().length, 5);
  await req("/exams/" + exam.id + "/submit", { answers });
  assert.equal(store.allA().length, 5);
  const expired = (await req("/exams", { count: 5 })).data;
  const s = store.session(expired.id);
  s.expiresAt = new Date(Date.now() - 1000).toISOString();
  store.saveSession(s);
  const late = await req("/exams/" + s.id + "/submit", {
    answers: Object.fromEntries(
      s.questionIds.map((id) => [id, store.getQ(id).answer]),
    ),
  });
  assert.equal(late.data.score, 0);
});

test("执兽模拟考试按四科400题计分，240分及格且不设单科门槛", async (t) => {
  const { req, store, url } = await fixture(t, undefined, {
    authRequired: true,
  });
  const registration = await fetch(url + "/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "vet_exam_tester",
      password: "safe-password",
    }),
  });
  const cookie = registration.headers.get("set-cookie").split(";")[0];
  assert.equal(
    (
      await req(
        "/auth/certificate",
        { certificateId: "veterinary-practitioner" },
        "PUT",
        { Cookie: cookie },
      )
    ).status,
    200,
  );
  const exam = (await req("/exams", { count: 400 }, "POST", { Cookie: cookie })).data;
  assert.equal(exam.questions.length, 400);
  assert.deepEqual(
    Object.values(exam.distribution).sort((a, b) => a - b),
    [100, 100, 100, 100],
  );
  const atLeastPassing = Object.fromEntries(
    exam.questionIds.map((id, index) => [
      id,
      index < 240 ? store.getQ(id).answer : [],
    ]),
  );
  const passed = await req("/exams/" + exam.id + "/submit", {
    answers: atLeastPassing,
  }, "POST", { Cookie: cookie });
  assert.equal(passed.data.score, 240);
  assert.equal(passed.data.maxScore, 400);
  assert.equal(passed.data.passingScore, 240);
  assert.equal(passed.data.passed, true);

  const second = (await req("/exams", { count: 400 }, "POST", { Cookie: cookie })).data;
  const belowPassing = Object.fromEntries(
    second.questionIds.map((id, index) => [
      id,
      index < 239 ? store.getQ(id).answer : [],
    ]),
  );
  const failed = await req("/exams/" + second.id + "/submit", {
    answers: belowPassing,
  }, "POST", { Cookie: cookie });
  assert.equal(failed.data.score, 239);
  assert.equal(failed.data.passed, false);
});

test("real HTTP compatible endpoint receives model, bearer auth and tuning parameters", async (t) => {
  let request;
  const upstream = http
    .createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      request = {
        path: req.url,
        authorization: req.headers.authorization,
        body: JSON.parse(Buffer.concat(chunks)),
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          choices: [{ message: { content: "OK" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
        }),
      );
    })
    .listen(0, "127.0.0.1");
  await new Promise((r) => upstream.once("listening", r));
  t.after(() => new Promise((r) => upstream.close(r)));
  const { req, store } = await fixture(t);
  await req(
    "/settings",
    {
      baseUrl: `http://127.0.0.1:${upstream.address().port}/v1`,
      model: "custom-local-model",
      apiKey: "fixture-only",
      temperature: 0.4,
      maxTokens: 8192,
    },
    "PUT",
  );
  const result = await req("/ai/test", {});
  assert.equal(result.data.message, "AI 服务连接成功");
  assert.equal(request.path, "/v1/chat/completions");
  assert.equal(request.authorization, "Bearer fixture-only");
  assert.equal(request.body.model, "custom-local-model");
  assert.equal(request.body.temperature, 0.4);
  assert.equal("max_tokens" in request.body, false);
  assert.equal(store.usage().today.total_tokens, 6);
});
test("AI responses larger than the old 1 MB limit remain readable", async (t) => {
  const { store, provider } = await fixture(t, async () =>
    response("x".repeat(1024 * 1024 + 1024)),
  );
  store.saveSettings({
    baseUrl: "https://fixture.example/v1",
    model: "fixture",
    keyCipher: encrypt("fixture-only"),
    temperature: 0.7,
  });
  const output = await provider.call([{ role: "user", content: "large" }]);
  assert.equal(output.length, 1024 * 1024 + 1024);
});
test("daily planning caches per day and hint stages avoid exposing answers", async (t) => {
  const { req, store } = await fixture(t, mockAI());
  store.saveSettings({
    baseUrl: "https://fixture.example/v1",
    model: "fixture",
    keyCipher: encrypt("fixture-only"),
    temperature: 0.7,
    maxTokens: 8192,
  });
  const plan = (await req("/ai/daily", {})).data;
  assert.equal(
    plan.tasks.reduce((n, t) => n + t.count, 0),
    30,
  );
  const calls = store.usage().total.calls;
  await req("/ai/daily", {});
  assert.equal(store.usage().total.calls, calls);
  const q = store.allQ().find((q) => q.knowledgePoint === "OSPF DR/BDR");
  for (let i = 1; i <= 3; i++) {
    const response = await req("/ai/teacher", {
      questionId: q.id,
      action: "给我提示",
      hintLevel: i,
    });
    assert.equal(response.status, 200);
    assert.ok(!response.data.text.includes(q.options[q.answer[0]]));
  }
  assert.equal(
    (
      await req("/ai/teacher", {
        questionId: q.id,
        action: "给我提示",
        hintLevel: 4,
      })
    ).status,
    400,
  );
});
test("AI outages produce specific safe errors and numeric or semantic failures never enter the bank", async (t) => {
  const { provider, store } = await fixture(t);
  store.saveSettings({
    baseUrl: "https://fixture.example/v1",
    model: "fixture",
    keyCipher: encrypt("private-exact-key"),
    temperature: 0.7,
    maxTokens: 8192,
  });
  for (const [status, pattern] of [
    [401, /无效/],
    [402, /余额/],
    [404, /不存在/],
    [429, /额度/],
    [503, /不可用/],
  ]) {
    provider.fetch = async () => new Response("private-exact-key", { status });
    await assert.rejects(provider.call([]), pattern);
  }
  provider.fetch = async () => {
    throw new DOMException("private-exact-key", "TimeoutError");
  };
  await assert.rejects(provider.call([]), /超时/);
  const q = store.allQ().find((q) => q.id === "subnet-1"),
    before = store.allQ().length;
  provider.fetch = async () =>
    response({
      questions: [
        {
          type: "single_choice",
          question:
            "对于 IPv4 主机 192.168.10.75/26，请确定该子网的广播地址是什么？",
          options: {
            A: "192.168.10.126",
            B: "192.168.10.127",
            C: "192.168.10.64",
            D: "192.168.10.65",
          },
          answer: ["A"],
          analysis: "这个解析故意与实际网络计算结果不一致，用于检测。",
          chapter: q.chapter,
          knowledgePoint: q.knowledgePoint,
          difficulty: "easy",
          stage: "基础理解",
          tags: ["IPv4"],
        },
      ],
    });
  await assert.rejects(provider.generatePracticeSet(q, 1), /程序计算/);
  assert.equal(store.allQ().length, before);
  provider.fetch = async (_url, opts) => {
    const messages = JSON.parse(opts.body).messages;
    const system = messages[0].content;
    const payload = JSON.parse(messages[1].content);
    if (system.includes("逐题独立审核"))
      return response({
        reviews: payload.items.map(({ index }) => ({
          index,
          ...verdict,
          valid: false,
          reason: "审核确认答案不成立",
        })),
      });
    return response({ questions: [fixtureQuestion()] });
  };
  await assert.rejects(
    provider.generatePracticeSet(
      store.allQ().find((q) => q.knowledgePoint === "OSPF DR/BDR"),
      1,
    ),
    /独立质量审核/,
  );
  assert.equal(store.allQ().length, before);
});

test("管理员面板隔离管理员 API，支持扩题、重合检测、删题和封禁用户", async (t) => {
  const previousMasterKey = process.env.AI_MASTER_KEY;
  process.env.AI_MASTER_KEY = crypto.randomBytes(32).toString("base64");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "netwise-admin-"));
  let generated = 0;
  const store = createStore(dir);
  const provider = new OpenAICompatibleProvider(store, {
    fetch: async (_url, options) => {
      const { messages } = JSON.parse(options.body);
      const system = messages[0].content;
      const payload = messages[1] ? JSON.parse(messages[1].content) : {};
      if (system.includes("Reply with OK")) return response("OK");
      if (system.includes("逐题独立审核"))
        return response({
          reviews: payload.items.map(({ index }) => ({
            index,
            ...verdict,
          })),
        });
      if (system.includes("一次生成"))
        return response({
          questions: payload.specs.map((spec) => ({
            type: "single_choice",
            question: `管理员扩充测试题 ${++generated}：${payload.knowledgePoint} 的关键判断是什么？`,
            options: {
              A: "选项一",
              B: "选项二",
              C: "选项三",
              D: "选项四",
            },
            answer: ["A"],
            analysis: "先确认目标知识点的判断条件，再结合题干选择唯一符合条件的选项。",
            chapter: payload.chapter,
            knowledgePoint: payload.knowledgePoint,
            difficulty: spec.difficulty,
            stage: "基础理解",
            tags: ["管理员扩题测试"],
          })),
        });
      return response({ text: "测试讲解" });
    },
  });
  const app = await createApp({
    store,
    provider,
    withFrontend: false,
    authRequired: true,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const register = async (username) => {
    const res = await fetch(base + "/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: "safe-password" }),
    });
    return {
      status: res.status,
      data: await res.json(),
      cookie: res.headers.get("set-cookie")?.split(";")[0],
    };
  };
  const request = async (cookie, route, body, method = body ? "POST" : "GET") => {
    const res = await fetch(base + "/api" + route, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, data: await res.json() };
  };
  t.after(async () => {
    app.locals.stop();
    await new Promise((resolve) => server.close(resolve));
    store.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
    if (previousMasterKey === undefined) delete process.env.AI_MASTER_KEY;
    else process.env.AI_MASTER_KEY = previousMasterKey;
  });
  const admin = await register("admin_owner");
  const member = await register("ordinary_member");
  assert.equal(admin.status, 200);
  assert.equal(admin.data.user.isAdmin, true);
  assert.equal(member.data.user.isAdmin, false);
  assert.equal((await request(member.cookie, "/admin/overview")).status, 403);
  const overviewStarted = performance.now();
  const overviewResponse = await request(admin.cookie, "/admin/overview");
  const overviewMs = performance.now() - overviewStarted;
  assert.equal(overviewResponse.status, 200);
  assert.ok(overviewMs < 3000, `Overview blocked for ${overviewMs}ms`);
  console.log(`Admin overview with ${store.allQ().length} questions: ${Math.round(overviewMs)}ms`);
  const seed = store.allQ().find((question) => question.certificates?.includes("network-engineer"));
  assert.ok(seed);
  const configuration = {
    baseUrl: "https://fixture.example/v1",
    model: "admin-fixture",
    apiKey: "admin-only-key",
    temperature: 0.3,
  };
  assert.equal((await request(admin.cookie, "/admin/settings", configuration, "PUT")).status, 200);
  assert.equal((await request(admin.cookie, "/admin/settings")).data.hasKey, true);
  assert.equal((await request(member.cookie, "/settings")).data.hasKey, false);
  assert.ok(!JSON.stringify(await request(admin.cookie, "/admin/settings")).includes("admin-only-key"));
  const taxonomy = await request(admin.cookie, "/admin/options");
  assert.equal(taxonomy.status, 200);
  const adminQuestions = await request(
    admin.cookie,
    "/admin/questions?certificateId=network-engineer&limit=2&offset=0",
  );
  assert.equal(adminQuestions.status, 200);
  assert.equal(adminQuestions.data.questions.length, 2);
  assert.ok(adminQuestions.data.total >= 2);
  assert.ok(adminQuestions.data.questions[0].answer);
  const reported = await request(
    member.cookie,
    `/questions/${seed.id}/feedback`,
    { kind: "wrong_answer", note: "测试反馈：请管理员复核答案。" },
  );
  assert.equal(reported.status, 200);
  const feedback = await request(
    admin.cookie,
    "/admin/feedback?certificateId=network-engineer&limit=50",
  );
  assert.equal(feedback.status, 200);
  const feedbackRow = feedback.data.feedback.find((row) => row.questionId === seed.id);
  assert.ok(feedbackRow);
  assert.equal(feedbackRow.note, "测试反馈：请管理员复核答案。");
  const emptyPage = await request(admin.cookie, "/admin/feedback?certificateId=network-engineer&limit=1&offset=1");
  assert.equal(emptyPage.data.total, 1);
  assert.equal(emptyPage.data.feedback.length, 0);
  const otherCertificate = await request(admin.cookie, "/admin/feedback?certificateId=veterinary-practitioner");
  assert.equal(otherCertificate.data.total, 0);
  const edited = await request(
    admin.cookie,
    `/admin/questions/${seed.id}`,
    {
      type: seed.type,
      question: seed.question,
      options: seed.options,
      answer: seed.answer,
      analysis: `${seed.analysis} 管理员已复核。`,
      chapter: seed.chapter,
      knowledgePoint: seed.knowledgePoint,
      difficulty: seed.difficulty,
      tags: seed.tags || ["管理员修订"],
    },
    "PUT",
  );
  assert.equal(edited.status, 200);
  assert.match(edited.data.question.analysis, /管理员已复核/);
  const cancelledFeedback = await request(
    admin.cookie,
    "/admin/feedback",
    { userId: member.data.user.id, questionId: seed.id },
    "DELETE",
  );
  assert.equal(cancelledFeedback.status, 200);
  assert.equal(
    (await request(admin.cookie, "/admin/feedback?certificateId=network-engineer")).data.total,
    0,
  );
  const memberQuestions = await request(
    member.cookie,
    "/admin/questions?certificateId=network-engineer&limit=1",
  );
  assert.equal(memberQuestions.status, 403);
  const targetChapter = taxonomy.data.certificates
    .find((item) => item.id === seed.certificates[0])
    .chapters.find((item) => item.name === seed.chapter);
  const generatedResponse = await request(
    admin.cookie,
    "/admin/questions/generate",
    {
      certificateId: seed.certificates[0],
      chapter: seed.chapter,
      knowledgePoint: targetChapter.knowledgePoints[0],
      count: 1,
    },
  );
  assert.equal(generatedResponse.status, 200);
  assert.equal(generatedResponse.data.inserted, 1);
  assert.equal(store.allQ().filter((question) => question.source === "admin_generated").length, 1);
  const duplicateBase = {
    ...seed,
    id: "admin-similar-a",
    source: "admin_generated",
    certificates: seed.certificates,
    question: "管理员重合候选题：请判断这个知识点的关键结论是什么？",
    options: { A: "正确结论", B: "错误结论一", C: "错误结论二", D: "错误结论三" },
  };
  const duplicateOther = {
    ...duplicateBase,
    id: "admin-similar-b",
    options: { A: "正确结论", B: "错误结论甲", C: "错误结论乙", D: "错误结论丙" },
  };
  store.addAdminQuestions([duplicateBase, duplicateOther]);
  const similar = await request(
    admin.cookie,
    "/admin/questions/similar?certificateId=network-engineer&threshold=0.8&limit=500",
  );
  assert.equal(similar.status, 200);
  assert.ok(similar.data.pairs.some((pair) => pair.left.id === "admin-similar-a" && pair.right.id === "admin-similar-b"));
  const deleted = await request(
    admin.cookie,
    "/admin/questions/admin-similar-a",
    { confirm: true, reason: "测试删除" },
    "DELETE",
  );
  assert.equal(deleted.status, 200);
  assert.equal(store.getQ("admin-similar-a"), null);
  const banned = await request(
    admin.cookie,
    `/admin/users/${member.data.user.id}/ban`,
    { banned: true, reason: "测试封禁" },
    "PUT",
  );
  assert.equal(banned.status, 200);
  assert.equal((await request(member.cookie, "/settings")).status, 401);
});
