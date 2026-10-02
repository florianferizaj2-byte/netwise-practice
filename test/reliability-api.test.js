import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createApp } from "../server/index.js";
import { createStore } from "../server/store.js";
import { OpenAICompatibleProvider } from "../server/ai.js";
import { fixtureQuestion } from "./ai-fixture.js";
import { currentAiSignal } from "../server/ai-tasks.js";

async function serve(t, options = {}) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "aceexam-reliability-"),
  );
  const store = createStore(directory);
  const app = await createApp({ store, withFrontend: false, ...options });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    await app.locals.stop();
    await new Promise((resolve) => server.close(resolve));
    store.db.close();
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("aceexam-reliability-"));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const request = async (
    url,
    body,
    token,
    method = body === undefined ? "GET" : "POST",
  ) => {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api${url}`,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
    return { status: response.status, data: await response.json() };
  };
  return { store, request };
}

test("login throttling and versioned exam saves protect a real authenticated API", async (t) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "aceexam-reliability-"),
  );
  const store = createStore(directory);
  const app = await createApp({
    store,
    withFrontend: false,
    authLimits: {
      ipLimit: 30,
      accountLimit: 2,
      registerLimit: 2,
      windowMs: 60000,
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    await app.locals.stop();
    await new Promise((resolve) => server.close(resolve));
    store.db.close();
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("aceexam-reliability-"));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function request(url, body, method = "POST", cookie = "") {
    const response = await fetch(base + url, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { response, data: await response.json() };
  }
  // Production routes must use the asynchronous password methods.
  store.register = store.authenticate = () => {
    throw new Error("synchronous password path");
  };
  const registered = await request("/auth/register", {
    username: "reliable_user",
    password: "test-password-123",
  });
  assert.equal(registered.response.status, 200);
  const cookie = registered.response.headers.get("set-cookie").split(";")[0];
  assert.equal(
    (
      await request("/auth/login", {
        username: "reliable_user",
        password: "test-password-123",
      })
    ).response.status,
    200,
  );
  assert.equal(
    (
      await request("/auth/login", {
        username: "reliable_user",
        password: "bad-password-123",
      })
    ).response.status,
    401,
  );
  const limited = await request("/auth/login", {
    username: "reliable_user",
    password: "bad-password-123",
  });
  assert.equal(limited.response.status, 429);
  assert.equal(limited.data.code, "AUTH_RATE_LIMITED");
  assert.ok(Number(limited.response.headers.get("retry-after")) > 0);
  assert.equal(
    (
      await request("/auth/register", {
        username: "second_user",
        password: "test-password-123",
      })
    ).response.status,
    200,
  );
  assert.equal(
    (
      await request("/auth/register", {
        username: "third_user",
        password: "test-password-123",
      })
    ).response.status,
    429,
  );
  assert.equal(
    (
      await request(
        "/auth/certificate",
        { certificateId: "network-engineer" },
        "PUT",
        cookie,
      )
    ).response.status,
    200,
  );
  const exam = (await request("/exams", { count: 5 }, "POST", cookie)).data;
  const one = exam.questions[0].id,
    two = exam.questions[1].id;
  const first = await request(
    `/exams/${exam.id}/answers`,
    { answers: { [one]: ["A"] }, expectedVersion: 0 },
    "PUT",
    cookie,
  );
  assert.equal(first.response.status, 200);
  assert.equal(first.data.version, 1);
  const stale = await request(
    `/exams/${exam.id}/answers`,
    { answers: { [one]: ["B"] }, expectedVersion: 0 },
    "PUT",
    cookie,
  );
  assert.equal(stale.response.status, 409);
  assert.equal(stale.data.code, "EXAM_ANSWERS_CONFLICT");
  assert.deepEqual(stale.data.details.answers, { [one]: ["A"] });
  // An older installed client must not erase an answer absent from its snapshot.
  await request(
    `/exams/${exam.id}/answers`,
    { answers: { [two]: ["A"] } },
    "PUT",
    cookie,
  );
  const current = (await request(`/exams/${exam.id}`, undefined, "GET", cookie))
    .data;
  assert.equal(current.answersVersion, 2);
  assert.deepEqual(current.answers, { [one]: ["A"], [two]: ["A"] });
  const badSubmit = await request(
    `/exams/${exam.id}/submit`,
    { answers: {}, expectedVersion: 1 },
    "POST",
    cookie,
  );
  assert.equal(badSubmit.response.status, 409);
  assert.equal(store.allA(registered.data.user.id).length, 0);
  const submitted = await request(
    `/exams/${exam.id}/submit`,
    { answers: current.answers, expectedVersion: 2 },
    "POST",
    cookie,
  );
  assert.equal(submitted.response.status, 200);
  const again = await request(
    `/exams/${exam.id}/submit`,
    { answers: {}, expectedVersion: 0 },
    "POST",
    cookie,
  );
  assert.deepEqual(again.data, submitted.data);
  assert.equal(store.allA(registered.data.user.id).length, 5);
});

test("rejected AI questions stop at the configured round budget without publishing", async () => {
  const provider = new OpenAICompatibleProvider({ allQ: () => [] });
  let generations = 0;
  provider.structured = async (_instruction, payload) => {
    if (payload.specs) {
      generations++;
      return {
        questions: payload.specs.map((spec) =>
          fixtureQuestion(generations, {
            ...spec,
            chapter: "OSPF",
            knowledgePoint: "DR/BDR选举",
          }),
        ),
      };
    }
    return {
      reviews: payload.items.map(({ index }) => ({
        index,
        valid: false,
        relevant: true,
        singleAnswerCorrect: false,
        contradictions: [],
        reason: "答案不正确",
      })),
    };
  };
  await assert.rejects(
    provider.generateBankExpansion(
      { ...fixtureQuestion(0), chapter: "OSPF", knowledgePoint: "DR/BDR选举" },
      1,
      { retryUntilAccepted: true, maxRounds: 2, settings: {} },
    ),
    /AI 已修正 2 轮/,
  );
  assert.equal(generations, 2);
});

test("AI HTTP requests run across accounts, reject account overlap, and refund a cancelled task", async (t) => {
  let release, firstStarted;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    firstStarted = resolve;
  });
  let calls = 0,
    timeout = false;
  const provider = {
    async explainQuestion() {
      calls++;
      if (timeout) {
        const signal = currentAiSignal();
        await new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          }),
        );
      } else if (calls === 1) {
        firstStarted();
        await held;
      }
      return { text: "fixture explanation" };
    },
  };
  const { store, request } = await serve(t, {
    provider,
    aiTasks: { concurrency: 2, timeoutMs: 2000 },
  });
  const tokens = [];
  for (const name of ["parallel_one", "parallel_two"]) {
    const user = await store.registerAsync(name, "fixture-password-123");
    store.selectCertificate(user.id, "network-engineer");
    const token = store.createAuthSession(user.id);
    tokens.push(token);
    await request("/account/check-in", {}, token);
  }
  const question = store
    .allQ()
    .find((item) => item.certificates?.includes("network-engineer"));
  const body = { questionId: question.id, action: "详细讲解" };
  const first = request("/ai/teacher", body, tokens[0]);
  await started;
  try {
    assert.equal((await request("/ai/teacher", body, tokens[0])).status, 409);
    assert.equal((await request("/ai/teacher", body, tokens[1])).status, 200);
    assert.equal(calls, 2);
    assert.equal(
      (await request("/dashboard", undefined, tokens[1])).data.aiBusy,
      false,
    );
  } finally {
    release();
  }
  assert.equal((await first).status, 200);
  const balance = async () =>
    (await request("/account/entitlements", undefined, tokens[0])).data.checkIn
      .remaining.explanations;
  const before = await balance();
  timeout = true;
  const expired = await request("/ai/teacher", body, tokens[0]);
  assert.equal(expired.status, 504);
  assert.equal(expired.data.code, "AI_TASK_TIMEOUT");
  assert.equal(await balance(), before);
  timeout = false;
  assert.equal((await request("/ai/teacher", body, tokens[0])).status, 200);
});

test("concurrent WeChat registration consumes a challenge once and rolls back an already-bound identity", async (t) => {
  const { store, request } = await serve(t);
  const identity = {
    appid: "fixture-app",
    openid: "fixture-openid",
    unionid: "fixture-unionid",
  };
  const bindingToken = store.createWechatLoginChallenge(identity);
  const registrations = await Promise.all(
    ["wechat_race_one", "wechat_race_two"].map((username) =>
      request("/auth/wechat/register", {
        username,
        password: "fixture-password-123",
        bindingToken,
      }),
    ),
  );
  assert.deepEqual(registrations.map((item) => item.status).sort(), [200, 401]);
  assert.equal(store.allUsers().length, 1);
  const anotherToken = store.createWechatLoginChallenge(identity);
  const duplicate = await request("/auth/wechat/register", {
    username: "wechat_race_three",
    password: "fixture-password-123",
    bindingToken: anotherToken,
  });
  assert.equal(duplicate.status, 400);
  assert.equal(store.allUsers().length, 1);
  assert.ok(store.wechatLoginChallenge(anotherToken));
});
