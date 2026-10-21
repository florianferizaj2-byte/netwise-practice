import test from "node:test";
import assert from "node:assert/strict";
import { authorAiSettings } from "../server/ai-service.js";
import {
  defaultAiModel,
  officialDeepSeek,
} from "../server/ai-model-defaults.js";
import { OpenAICompatibleProvider } from "../server/ai.js";

test("official defaults select the current Flash model; explicit models and compatible gateways keep their configured identities", () => {
  const store = { allUsers: () => [], settings: () => ({}) };
  for (const base of [
    "https://api.deepseek.com",
    "https://api.deepseek.com/v1/",
  ]) {
    assert(officialDeepSeek(base));
    assert.equal(defaultAiModel(base), "deepseek-flash");
    assert.equal(
      authorAiSettings(store, {
        AI_SERVICE_API_KEY: "fixture",
        AI_SERVICE_BASE_URL: base,
      }).model,
      "deepseek-flash",
    );
  }
  assert.equal(
    authorAiSettings(store, { AUTHOR_API_KEY: "fixture" }).model,
    "deepseek-flash",
  );
  assert.equal(
    authorAiSettings(store, {
      AI_SERVICE_API_KEY: "fixture",
      AI_SERVICE_MODEL: "my-model",
    }).model,
    "my-model",
  );
  assert.equal(
    authorAiSettings(store, {
      AI_SERVICE_API_KEY: "fixture",
      AI_SERVICE_MODEL: "deepseek-chat",
    }).model,
    "deepseek-chat",
    "never silently rewrite an explicit administrator setting",
  );
  for (const base of [
    "https://gateway.example/v1",
    "https://api.deepseek.com.example",
    "http://api.deepseek.com",
    "invalid",
  ]) {
    assert(!officialDeepSeek(base));
    assert.equal(defaultAiModel(base), "deepseek-chat");
  }
  assert.equal(
    authorAiSettings(store, {
      AI_SERVICE_API_KEY: "fixture",
      AI_SERVICE_BASE_URL: "https://gateway.example/v1",
      AI_SERVICE_MODEL: "vendor-model",
    }).model,
    "vendor-model",
  );
});

test("Flash requests retain the existing non-thinking teaching behavior without sending DeepSeek options to other vendors", async () => {
  const calls = [],
    usage = [];
  const provider = new OpenAICompatibleProvider(
    { saveUsage: (row) => usage.push(row) },
    {
      fetch: async (_url, request) => {
        calls.push(JSON.parse(request.body));
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "OK" }, finish_reason: "stop" }],
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  );
  const settings = {
    apiKey: "fixture-only",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-flash",
    temperature: 0.3,
  };
  await provider.call([{ role: "user", content: "fixture" }], settings, {
    maxTokens: 200,
  });
  assert.deepEqual(calls[0].thinking, { type: "disabled" });
  assert.equal(calls[0].max_tokens, 200);
  await provider.call([{ role: "user", content: "fixture" }], settings, {
    disableThinking: false,
  });
  assert(
    !Object.hasOwn(calls[1], "thinking"),
    "explicit thinking opt-in retains the vendor default",
  );
  await provider.call(
    [{ role: "user", content: "fixture" }],
    { ...settings, baseUrl: "https://gateway.example/v1" },
    { disableThinking: true },
  );
  assert(!Object.hasOwn(calls[2], "thinking"));
  await provider.call([{ role: "user", content: "fixture" }], {
    ...settings,
    model: "deepseek-v4-pro",
  });
  assert(!Object.hasOwn(calls[3], "thinking"));
  assert.equal(usage.length, 4);
  assert(usage.every((row) => row.success));
});
