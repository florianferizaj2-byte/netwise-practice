import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/index.js";
import { createStore } from "../server/store.js";
import { OpenAICompatibleProvider } from "../server/ai.js";

async function fixture(t, { limit = 100, onCall } = {}) {
  const env = {
    ALLOWED_HOSTS: "127.0.0.1,localhost,::1",
    AI_SERVICE_API_KEY: "guest-trial-fixture-key",
    AI_SERVICE_BASE_URL: "https://fixture.example/v1",
    AI_SERVICE_MODEL: "fixture-model",
    GUEST_TRIAL_SESSIONS_PER_IP_DAY: "20",
    GUEST_TRIAL_AI_PER_IP_DAY: String(limit),
    GUEST_TRIAL_AI_PER_DAY: String(limit),
  };
  const previous = Object.fromEntries(Object.keys(env).map((name) => [name, process.env[name]]));
  Object.assign(process.env, env);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aceexam-guest-trial-"));
  const store = createStore(directory);
  let calls = 0;
  const provider = new OpenAICompatibleProvider(store, {
    fetch: async (_url, options) => {
      calls += 1;
      await onCall?.(calls);
      const instruction = JSON.parse(options.body).messages[0].content;
      const content = instruction.includes("mistakeType")
        ? { mistakeType: "concept", weakKnowledge: "测试知识点", reason: "需要区分选项所描述的不同网络概念。" }
        : { text: "这是一份用于核对体验流程和共享缓存的详细解析。" };
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(content) }, finish_reason: "stop" }],
      }), { headers: { "Content-Type": "application/json" } });
    },
  });
  const app = await createApp({ store, provider, withFrontend: false });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    app.locals.stop();
    await new Promise((resolve) => server.close(resolve));
    store.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  const base = `http://127.0.0.1:${server.address().port}/api/guest-trial`;
  const request = async (route = "", cookie = "", body) => {
    const response = await fetch(base + route, {
      method: body === undefined ? "GET" : "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json(), cookie: response.headers.get("set-cookie") };
  };
  const session = async () => {
    const result = await request();
    assert.equal(result.status, 200);
    return { ...result, cookie: result.cookie.split(";")[0] };
  };
  return { store, provider, request, session, calls: () => calls };
}

test("guest answers persist without exposing answers early or changing account progress", async (t) => {
  const { store, request, session, calls } = await fixture(t);
  const guest = await session();
  assert.equal(guest.data.total, 5);
  for (const question of guest.data.questions) {
    assert.equal(question.attempt, null);
    assert.equal(question.answer, undefined);
    assert.equal(question.analysis, undefined);
    assert.deepEqual(question.ai, {});
  }
  const question = store.getQ(guest.data.questions[0].id);
  const route = `/questions/${question.id}`;
  const wrong = Object.keys(question.options).find((option) => option !== question.answer[0]);
  assert.equal((await request(`${route}/answer`, "", { selected: wrong })).status, 401);
  assert.equal((await request(`${route}/ai`, guest.cookie, { action: "explanation" })).status, 400);
  assert.equal((await request("/questions/not-in-trial/answer", guest.cookie, { selected: "A" })).status, 404);
  const answer = await request(`${route}/answer`, guest.cookie, { selected: wrong });
  assert.equal(answer.status, 200);
  assert.equal(answer.data.questions[0].attempt.correct, false);
  assert.equal(answer.data.questions[0].attempt.correctAnswer, question.answer[0]);
  await request(`${route}/answer`, guest.cookie, { selected: question.answer[0] });
  const resumed = await request("", guest.cookie);
  assert.equal(resumed.cookie, null);
  assert.equal(resumed.data.questions[0].attempt.selected, wrong);
  assert.equal((await session()).data.questions[0].attempt, null);
  assert.equal(store.allUsers().length, 0);
  assert.equal(store.allA().length, 0);
  assert.equal(calls(), 0);
});

test("guest AI shares revision-aware results with learners and cached reads bypass request limits", async (t) => {
  const { store, provider, request, session, calls } = await fixture(t, { limit: 1 });
  const first = await session();
  const question = store.getQ(first.data.questions[0].id);
  const wrong = Object.keys(question.options).find((option) => option !== question.answer[0]);
  const route = `/questions/${question.id}`;
  await request(`${route}/answer`, first.cookie, { selected: wrong });
  const explanation = await request(`${route}/ai`, first.cookie, { action: "explanation" });
  assert.equal(explanation.status, 200);
  assert.equal(calls(), 1);
  assert.deepEqual(await provider.explainQuestion(question, "详细讲解", [], 0, "learner"), explanation.data);
  assert.equal(calls(), 1);

  const second = await session();
  await request(`${route}/answer`, second.cookie, { selected: wrong });
  assert.deepEqual((await request(`${route}/ai`, second.cookie, { action: "explanation" })).data, explanation.data);
  assert.equal(calls(), 1);
  assert.equal((await request(`${route}/ai`, second.cookie, { action: "mistake" })).status, 429);
  assert.equal(calls(), 1);

  const mistake = await provider.analyzeAnswerMistake(question, [wrong], "learner");
  assert.equal(calls(), 2);
  const cachedMistake = await request(`${route}/ai`, second.cookie, { action: "mistake" });
  assert.equal(cachedMistake.status, 200);
  assert.equal(cachedMistake.data.text, `${mistake.weakKnowledge}\n\n${mistake.reason}`);
  assert.equal(calls(), 2);

  store.updateQuestion(question.id, { ...question, analysis: `${question.analysis} 题目解析已修订。` });
  const revised = await session();
  await request(`${route}/answer`, revised.cookie, { selected: wrong });
  assert.equal((await request(`${route}/ai`, revised.cookie, { action: "explanation" })).status, 429);
  assert.equal(calls(), 2);
  assert.equal(store.allUsers().length, 0);
  assert.equal(store.allA().length, 0);
});

test("duplicate guest AI requests do not generate concurrently and failed requests can retry", async (t) => {
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  const { request, session, calls } = await fixture(t, {
    onCall: async (count) => {
      if (count !== 1) return;
      entered.resolve();
      await release.promise;
      throw new Error("fixture generation failure");
    },
  });
  const guest = await session();
  const route = `/questions/${guest.data.questions[0].id}`;
  await request(`${route}/answer`, guest.cookie, { selected: "A" });
  const pending = request(`${route}/ai`, guest.cookie, { action: "explanation" });
  await entered.promise;
  const duplicate = await request(`${route}/ai`, guest.cookie, { action: "explanation" });
  release.resolve();
  assert.equal(duplicate.status, 409);
  assert.notEqual((await pending).status, 200);
  assert.equal(calls(), 1);
  assert.equal((await request(`${route}/ai`, guest.cookie, { action: "explanation" })).status, 200);
  assert.equal(calls(), 2);
  assert.equal((await request(`${route}/ai`, guest.cookie, { action: "explanation" })).status, 200);
  assert.equal(calls(), 2);
});
