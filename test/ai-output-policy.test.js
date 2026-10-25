import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { aiOutputBudget } from "../server/ai-output-policy.js";
import { FundedTestAIProvider as OpenAICompatibleProvider } from "./helpers/ai-points.js";

const settings = { baseUrl: "https://fixture.example/v1", model: "fixture", apiKey: "fixture", temperature: 0 };
const messages = [{ role: "user", content: "Reply with OK" }];
const response = (value, finish = "stop") => new Response(JSON.stringify({
  choices: [{ message: { content: value }, finish_reason: finish }],
}), { headers: { "Content-Type": "application/json" } });
function fixture(reply) {
  const calls = [], usage = [];
  const provider = new OpenAICompatibleProvider({ saveUsage: (entry) => usage.push(entry) }, {
    fetch: async (_url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      return reply(body, calls.length);
    },
  });
  return { provider, calls, usage };
}

test("every AI task has a finite ceiling; invalid or excessive caller limits cannot remove it", () => {
  for (const taskType of [undefined, "unknown", "connection-test", "admin-connection-test",
    "question-explanation", "question-hint", "hint-review", "mistake-analysis", "daily-plan",
    "question-generation", "question-review", "study-generation", "study-content-review",
    "study-grading", "study-teacher", "interactive-tutor-teacher", "interactive-tutor-review"]) {
    const normal = aiOutputBudget({ taskType });
    assert(normal.maxTokens > 0 && normal.retryTokens >= normal.maxTokens);
    assert.equal(normal.retryTokens, normal.ceiling);
    for (const maxTokens of [0, -1, NaN, Infinity, 1.5, "900", Number.MAX_SAFE_INTEGER]) {
      const budget = aiOutputBudget({ taskType, maxTokens, truncationMaxTokens: Number.MAX_SAFE_INTEGER });
      assert(budget.maxTokens > 0 && budget.maxTokens <= normal.ceiling);
      assert.equal(budget.retryTokens, normal.ceiling);
    }
  }
  assert.equal(aiOutputBudget({ taskType: "question-explanation" }).maxTokens, 900);
  assert.equal(aiOutputBudget({ taskType: "question-hint" }).maxTokens, 256);
});

test("batch budgets scale with complete question/review counts rather than a single-answer cap", () => {
  for (const taskType of ["question-generation", "question-review"]) {
    const single = aiOutputBudget({ taskType, outputItemCount: 1 });
    const ten = aiOutputBudget({ taskType, outputItemCount: 10 });
    const twenty = aiOutputBudget({ taskType, outputItemCount: 20 });
    assert(ten.maxTokens > single.ceiling);
    assert(twenty.maxTokens > ten.maxTokens);
    assert.deepEqual(aiOutputBudget({ taskType, outputItemCount: 999 }), twenty);
  }
});

test("direct calls always send a bounded max_tokens and record the actual request limit", async () => {
  const f = fixture(() => response("OK"));
  await f.provider.call(messages, settings);
  await f.provider.call(messages, settings, { taskType: "question-hint", maxTokens: 999999 });
  await f.provider.call(messages, settings, { taskType: "connection-test" });
  assert.deepEqual(f.calls.map((body) => body.max_tokens), [2048, 512, 256]);
  assert.deepEqual(f.usage.map((entry) => entry.outputTokenLimit), [2048, 512, 256]);
});

test("truncated structured output retries once with bounded headroom and returns only complete validated JSON", async () => {
  for (const stream of [false, true]) {
    const f = fixture((body, count) => {
      const value = count === 1 ? '{"text":"unfinished' : '{"text":"complete answer"}';
      if (!body.stream) return response(value, count === 1 ? "length" : "stop");
      return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: value } }] })}\n\n` +
        `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: count === 1 ? "length" : "stop" }] })}\n\n` +
        "data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
    });
    const answer = await f.provider.structured('返回 {"text":"简短解析"}', {},
      z.object({ text: z.string().min(8) }).strict(), undefined, settings,
      stream ? () => {} : undefined, "learner", { taskType: "question-explanation" });
    assert.deepEqual(answer, { text: "complete answer" });
    assert.deepEqual(f.calls.map((body) => body.max_tokens), [900, 1800]);
    assert.deepEqual(f.usage.map((entry) => entry.success), [false, true]);
    assert.match(f.calls[0].messages[0].content, /关键公式、单位和解题步骤/);
  }
});

test("retries stop at the ceiling; provider failures do not trigger blind retries", async () => {
  const f = fixture(() => response(null, "length"));
  await assert.rejects(f.provider.structured("JSON", {}, z.object({}), undefined, settings,
    undefined, "learner", { taskType: "question-explanation", truncationMaxTokens: 999999 }),
  { code: "AI_OUTPUT_TRUNCATED" });
  assert.deepEqual(f.calls.map((body) => body.max_tokens), [900, 1800]);
  const unavailable = fixture(() => new Response("", { status: 503 }));
  await assert.rejects(unavailable.provider.structured("JSON", {}, z.object({}), undefined, settings), /暂时不可用/);
  assert.equal(unavailable.calls.length, 1);
});

test("concise output still has to pass schema and independent correctness checks", async () => {
  const f = fixture((_body, count) => response(JSON.stringify({ correct: count > 1 })));
  const result = await f.provider.structured("独立审核", {}, z.object({ correct: z.boolean() }).strict(),
    (answer) => { if (!answer.correct) throw new Error("答案有误"); }, settings, undefined,
    "learner", { taskType: "question-review" });
  assert.deepEqual(result, { correct: true });
  assert.equal(f.calls.length, 2);
  assert.match(f.calls[1].messages[0].content, /答案有误/);
});
