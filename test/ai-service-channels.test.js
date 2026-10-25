import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { DatabaseSync } from "node:sqlite";
import { createAiServiceStore } from "../server/ai-service-store.js";
import { createStore } from "../server/store.js";
import { createApp } from "../server/index.js";
import { OpenAICompatibleProvider } from "../server/ai.js";
import {
  authorAiSettings,
  legacyAuthorAiSettings,
} from "../server/ai-service.js";
import { decrypt, encrypt } from "../server/security.js";

test("managed channel policy, encryption and test revisions survive a database restart", (t) => {
  const parent = path.resolve("tmp");
  fs.mkdirSync(parent, { recursive: true });
  const directory = fs.mkdtempSync(
      path.join(parent, "ai-service-persistence-"),
    ),
    file = path.join(directory, "fixture.sqlite");
  let db = new DatabaseSync(file);
  t.after(() => {
    if (db.isOpen) db.close();
    assert.equal(path.dirname(fs.realpathSync(directory)), parent);
    assert.ok(path.basename(directory).startsWith("ai-service-persistence-"));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  let services = createAiServiceStore(db);
  const original = services.save({
    data: {
      name: "Persistence fixture",
      model: "fixture",
      baseUrl: "https://fixture.example/v1",
    },
    keyCipher: encrypt("synthetic-persistence-key"),
    priority: 1,
    enabled: true,
    actor: "fixture",
    revision: 0,
  });
  services.setManaged(true, services.policy().revision);
  db.close();
  db = new DatabaseSync(file);
  services = createAiServiceStore(db);
  assert.equal(services.policy().managed, 1);
  assert.equal(services.channels().length, 1);
  assert.equal(
    decrypt(services.get(original.id).keyCipher),
    "synthetic-persistence-key",
  );
  const edited = services.save({
    id: original.id,
    data: {
      name: "Edited fixture",
      model: "fixture",
      baseUrl: "https://fixture.example/v1",
    },
    keyCipher: original.keyCipher,
    priority: 1,
    enabled: true,
    actor: "fixture",
    revision: services.policy().revision,
  });
  services.recordTest(original.id, original.revision, { success: true });
  assert.equal(services.get(original.id).lastTest, null);
  services.recordTest(original.id, edited.revision, {
    success: false,
    message: "synthetic failure",
  });
  assert.equal(services.get(original.id).lastTest.success, false);
});

test("managed model channels preserve legacy settings and enforce encrypted, priced, priority-based calls", async (t) => {
  const names = [
      "AI_SERVICE_API_KEY",
      "AI_SERVICE_MODEL",
      "AI_SERVICE_BASE_URL",
    ],
    saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  Object.assign(process.env, {
    AI_SERVICE_API_KEY: "synthetic-legacy-secret",
    AI_SERVICE_MODEL: "deepseek-flash",
    AI_SERVICE_BASE_URL: "https://api.deepseek.com",
  });
  const parent = path.resolve("tmp");
  fs.mkdirSync(parent, { recursive: true });
  const directory = fs.mkdtempSync(path.join(parent, "ai-service-channels-")),
    store = createStore(directory);
  const owner = store.register("channels_admin", "fixture-password-123"),
    learner = store.register("channels_learner", "fixture-password-123");
  store.db.prepare("UPDATE users SET is_admin=1 WHERE id=?").run(owner.id);
  const tokens = {
    [owner.id]: store.createAuthSession(owner.id),
    [learner.id]: store.createAuthSession(learner.id),
  };
  store.points.recordFinance({
    key: "synthetic-channel-receipt",
    kind: "revenue",
    amountMicros: 1000000000,
    reference: "synthetic test receipt only",
    createdBy: owner.id,
  });
  for (const user of [owner, learner])
    store.points.grant({
      userId: user.id,
      sourceKey: "synthetic-channel-credit",
      units: 1000000,
    });
  const requests = [];
  let mode = "ok";
  const provider = new OpenAICompatibleProvider(store, {
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ url, body, headers: options.headers });
      if (mode === "fail")
        return new Response("synthetic outage", { status: 500 });
      const content = JSON.stringify(
          mode === "invalid"
            ? { invalid: true }
            : { text: "synthetic channel response" },
        ),
        usage =
          mode === "missing"
            ? undefined
            : { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 };
      return body.stream
        ? new Response(
            "data: " +
              JSON.stringify({
                choices: [{ delta: { content }, finish_reason: "stop" }],
                usage,
              }) +
              "\n\ndata: [DONE]\n\n",
            { headers: { "Content-Type": "text/event-stream" } },
          )
        : new Response(
            JSON.stringify({
              choices: [{ message: { content }, finish_reason: "stop" }],
              usage,
            }),
            { headers: { "Content-Type": "application/json" } },
          );
    },
  });
  const app = await createApp({
      store,
      provider,
      withFrontend: false,
      accountSecurity: { enabled: false },
    }),
    server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    await app.locals.stop();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    store.db.close();
    assert.equal(path.dirname(fs.realpathSync(directory)), parent);
    assert.ok(path.basename(directory).startsWith("ai-service-channels-"));
    fs.rmSync(directory, { recursive: true, force: true });
    for (const [name, value] of Object.entries(saved))
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
  });
  const request = async (
    url = "",
    body,
    method = body ? "POST" : "GET",
    userId = owner.id,
  ) => {
    const result = await fetch(
      `http://127.0.0.1:${server.address().port}/api/admin/ai-services${url}`,
      {
        method,
        headers: {
          Authorization: "Bearer " + tokens[userId],
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    return { status: result.status, body: await result.json() };
  };
  const view = async () => (await request()).body;
  const price = (input = "2", output = "8") => ({
    input,
    output,
    cached: "0.04",
    source: "synthetic fixture price, not a real quote",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    confirmed: true,
    simpleTokenBilling: true,
  });
  const draft = async (overrides = {}) => ({
    revision: (await view()).revision,
    name: "GLM fixture",
    vendor: "glm",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "fixture-glm",
    temperature: 0.3,
    priority: 10,
    enabled: false,
    apiKey: "synthetic-channel-secret-a",
    streamUsage: "native",
    requestMode: "standard",
    ...overrides,
  });
  const edit = async (row, overrides = {}) =>
    draft({
      name: row.name,
      vendor: row.vendor,
      baseUrl: row.baseUrl,
      model: row.model,
      temperature: row.temperature,
      priority: row.priority,
      enabled: row.enabled,
      streamUsage: row.streamUsage,
      requestMode: row.requestMode,
      apiKey: undefined,
      ...overrides,
    });
  let first, second, legacyId;

  await t.test(
    "new schema defaults to legacy mode and keeps original DeepSeek settings",
    async () => {
      const result = await view();
      assert.equal(result.managed, false);
      assert.equal(result.channels.length, 0);
      assert.equal(result.selected.model, "deepseek-flash");
      assert.equal(authorAiSettings(store).apiKey, "synthetic-legacy-secret");
      assert.equal(
        legacyAuthorAiSettings(store).baseUrl,
        "https://api.deepseek.com",
      );
      assert.ok(result.catalog.some((row) => row.id === "qwen"));
      assert.ok(result.catalog.some((row) => row.id === "doubao"));
      assert.equal(
        JSON.stringify(result).includes("synthetic-legacy-secret"),
        false,
      );
      assert.equal(requests.length, 0);
    },
  );
  await t.test(
    "every configuration mutation and read requires an administrator",
    async () => {
      for (const [url, body, method] of [
        ["", undefined, "GET"],
        ["/channels", {}, "POST"],
        ["/channels/missing", {}, "PUT"],
        ["/policy", {}, "POST"],
        ["/order", {}, "POST"],
        ["/channels/missing/state", {}, "POST"],
        ["/channels/missing", {}, "DELETE"],
        ["/import-legacy", {}, "POST"],
        ["/channels/missing/test", {}, "POST"],
      ])
        assert.equal(
          (await request(url, body, method, learner.id)).status,
          403,
          url,
        );
      assert.equal(store.aiServices.channels().length, 0);
    },
  );
  await t.test(
    "disabled unpriced drafts are allowed; plaintext keys never leave the server",
    async () => {
      const result = await request("/channels", await draft());
      assert.equal(result.status, 200, JSON.stringify(result.body));
      first = result.body.channels[0];
      assert.equal(first.ready, false);
      assert.equal(first.price, null);
      assert.equal(first.hasKey, true);
      assert.ok(first.pricingError);
      assert.equal("keyCipher" in first, false);
      assert.equal("apiKey" in first, false);
      const internal = store.aiServices.get(first.id);
      assert.equal(decrypt(internal.keyCipher), "synthetic-channel-secret-a");
      assert.equal(
        JSON.stringify(result.body).includes("synthetic-channel-secret-a"),
        false,
      );
      assert.equal(
        store.db
          .prepare("SELECT data FROM ai_service_channels WHERE id=?")
          .get(first.id)
          .data.includes("synthetic-channel-secret-a"),
        false,
      );
      assert.equal(requests.length, 0);
    },
  );
  await t.test(
    "unconfirmed, expired, extra-fee model and unpriced enable attempts fail before upstream",
    async () => {
      assert.ok(
        (
          await request("/channels/" + first.id + "/state", {
            revision: (await view()).revision,
            enabled: true,
          })
        ).status >= 400,
      );
      assert.ok(
        (
          await request("/policy", {
            revision: (await view()).revision,
            managed: true,
          })
        ).status >= 400,
      );
      for (const overrides of [
        { price: { ...price(), confirmed: false } },
        {
          price: {
            ...price(),
            expiresAt: new Date(Date.now() - 1000).toISOString(),
          },
        },
        { model: "kimi-k3", vendor: "custom", price: price() },
        { enabled: true },
      ])
        assert.ok(
          (
            await request(
              "/channels/" + first.id,
              await edit(first, overrides),
              "PUT",
            )
          ).status >= 400,
        );
      assert.equal(requests.length, 0);
      assert.equal((await view()).managed, false);
    },
  );
  await t.test(
    "confirmed prices enable a channel and report cost and point estimates without invoking it",
    async () => {
      const result = await request(
        "/channels/" + first.id,
        await edit(first, { price: price(), enabled: true }),
        "PUT",
      );
      assert.equal(result.status, 200, JSON.stringify(result.body));
      first = result.body.channels[0];
      assert.equal(first.ready, true);
      assert.equal(first.price.input, "2");
      assert.equal(first.sampleCostCny, 0.01);
      assert.equal(first.samplePoints, 4);
      assert.equal(authorAiSettings(store).model, "deepseek-flash");
      assert.equal(requests.length, 0);
    },
  );
  await t.test(
    "copying legacy keeps the encrypted original unchanged and creates one disabled draft",
    async () => {
      const before = legacyAuthorAiSettings(store),
        result = await request("/import-legacy", {
          revision: (await view()).revision,
        });
      assert.equal(result.status, 200);
      const row = result.body.channels.find((row) => row.importedLegacy);
      legacyId = row.id;
      assert.equal(row.enabled, false);
      assert.equal(row.hasKey, true);
      assert.deepEqual(legacyAuthorAiSettings(store), before);
      assert.equal(
        decrypt(store.aiServices.get(legacyId).keyCipher),
        "synthetic-legacy-secret",
      );
      assert.equal(
        (await request("/import-legacy", { revision: (await view()).revision }))
          .body.channels.length,
        2,
      );
    },
  );
  await t.test(
    "explicitly enabling managed mode selects the highest-priority ready channel over environment config",
    async () => {
      const result = await request(
        "/channels",
        await draft({
          name: "Qwen fixture",
          vendor: "qwen",
          baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
          model: "fixture-qwen",
          apiKey: "synthetic-channel-secret-b",
          priority: 20,
          enabled: true,
          streamUsage: "include",
          requestMode: "qwen-no-thinking",
          price: price("4", "12"),
        }),
      );
      assert.equal(result.status, 200, JSON.stringify(result.body));
      second = result.body.channels.find((row) => row.name === "Qwen fixture");
      assert.equal(
        (
          await request("/policy", {
            revision: result.body.revision,
            managed: true,
          })
        ).status,
        200,
      );
      assert.equal(authorAiSettings(store).channelId, first.id);
      assert.equal(
        legacyAuthorAiSettings(store).apiKey,
        "synthetic-legacy-secret",
      );
      await provider.call([{ role: "user", content: "fixture" }], undefined, {
        userId: learner.id,
        maxTokens: 16,
        stream: true,
      });
      assert.equal(requests.at(-1).body.model, first.model);
      assert.equal("stream_options" in requests.at(-1).body, false);
      const usage = JSON.parse(
        store.db
          .prepare(
            "SELECT data FROM user_usage WHERE user_id=? ORDER BY rowid DESC LIMIT 1",
          )
          .get(learner.id).data,
      );
      assert.equal(usage.channelId, first.id);
      assert.equal(usage.serviceName, first.name);
    },
  );
  await t.test(
    "full-list reorder is atomic and controls ordinary streamed calls and zero-temperature review",
    async () => {
      const before = await view();
      assert.equal(
        (
          await request("/order", {
            revision: before.revision,
            ids: [first.id, first.id, legacyId],
          })
        ).status,
        409,
      );
      assert.equal((await view()).revision, before.revision);
      const result = await request("/order", {
        revision: before.revision,
        ids: [second.id, first.id, legacyId],
      });
      assert.equal(result.status, 200);
      assert.deepEqual(
        result.body.channels.map((row) => row.priority),
        [1, 2, 3],
      );
      assert.equal(result.body.selected.id, second.id);
      await provider.call(
        [{ role: "user", content: "fixture" }],
        provider.reviewSettings(learner.id),
        { userId: learner.id, maxTokens: 16, stream: true },
      );
      assert.equal(requests.at(-1).body.model, second.model);
      assert.equal(requests.at(-1).body.enable_thinking, false);
      assert.equal(requests.at(-1).body.stream_options.include_usage, true);
      assert.equal(requests.at(-1).body.temperature, 0);
      const config = await fetch(
        `http://127.0.0.1:${server.address().port}/api/admin/console/config`,
        { headers: { Authorization: "Bearer " + tokens[owner.id] } },
      ).then((result) => result.json());
      assert.equal(config.source, "多接口优先级配置");
      assert.equal(config.managed, true);
      assert.equal(config.readOnly, false);
    },
  );
  await t.test(
    "a stale editor cannot overwrite configuration or its shared cost card",
    async () => {
      const state = await view(),
        row = state.channels.find((row) => row.id === second.id),
        oldPrice = row.price.input;
      const response = await request(
        "/channels/" + second.id,
        await edit(row, {
          revision: state.revision - 1,
          price: price("7", "18"),
        }),
        "PUT",
      );
      assert.equal(response.status, 409);
      assert.equal(
        (await view()).channels.find((row) => row.id === second.id).price.input,
        oldPrice,
      );
    },
  );
  await t.test(
    "blank keys preserve the cipher; changing the host requires an explicit replacement",
    async () => {
      const row = (await view()).channels.find((row) => row.id === second.id),
        cipher = store.aiServices.get(row.id).keyCipher;
      assert.equal(
        (
          await request(
            "/channels/" + row.id,
            await edit(row, { name: "Qwen renamed" }),
            "PUT",
          )
        ).status,
        200,
      );
      assert.equal(store.aiServices.get(row.id).keyCipher, cipher);
      assert.ok(
        (
          await request(
            "/channels/" + row.id,
            await edit(row, { baseUrl: "https://different.example/v1" }),
            "PUT",
          )
        ).status >= 400,
      );
      assert.equal(store.aiServices.get(row.id).keyCipher, cipher);
      for (const baseUrl of [
        "http://remote.example/v1",
        "https://user:pass@remote.example/v1",
        "https://remote.example/v1?api_key=synthetic",
      ])
        assert.ok(
          (
            await request(
              "/channels/" + row.id,
              await edit(row, { baseUrl, apiKey: "synthetic-replacement" }),
              "PUT",
            )
          ).status >= 400,
        );
    },
  );
  await t.test(
    "connection tests are explicit, target the saved disabled channel and bill only the administrator",
    async () => {
      const row = (await view()).channels.find((row) => row.id === first.id);
      await request("/channels/" + row.id + "/state", {
        revision: (await view()).revision,
        enabled: false,
      });
      const learnerBefore = store.points.wallet(learner.id).availableUnits,
        ownerBefore = store.points.wallet(owner.id).availableUnits,
        callCount = requests.length;
      assert.ok(
        (await request("/channels/" + row.id + "/test", {})).status >= 400,
      );
      assert.equal(requests.length, callCount);
      const result = await request("/channels/" + row.id + "/test", {
        confirmed: true,
      });
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal(requests.at(-1).body.model, row.model);
      assert.equal(requests.at(-1).body.max_tokens, 256);
      assert.equal(
        store.points.wallet(learner.id).availableUnits,
        learnerBefore,
      );
      assert.ok(store.points.wallet(owner.id).availableUnits < ownerBefore);
      assert.equal(
        result.body.channels.find((item) => item.id === row.id).lastTest
          .success,
        true,
      );
      assert.equal(result.body.selected.id, second.id);
      await request("/channels/" + row.id + "/state", {
        revision: result.body.revision,
        enabled: true,
      });
    },
  );
  await t.test(
    "unknown streaming compatibility can use non-stream JSON and retain complete usage",
    async () => {
      const row = (await view()).channels.find((row) => row.id === second.id);
      assert.equal(
        (
          await request(
            "/channels/" + row.id,
            await edit(row, {
              streamUsage: "non-stream",
              requestMode: "thinking-disabled",
            }),
            "PUT",
          )
        ).status,
        200,
      );
      const chunks = [];
      await provider.call([{ role: "user", content: "fixture" }], undefined, {
        userId: learner.id,
        maxTokens: 16,
        stream: true,
        onChunk: (chunk) => chunks.push(chunk),
      });
      assert.equal("stream" in requests.at(-1).body, false);
      assert.equal("stream_options" in requests.at(-1).body, false);
      assert.equal(requests.at(-1).body.thinking.type, "disabled");
      assert.equal("enable_thinking" in requests.at(-1).body, false);
      assert.equal(chunks.length, 1);
    },
  );
  await t.test(
    "expired or paused pricing skips a channel before any upstream request",
    async () => {
      const card = store.db
          .prepare("SELECT data FROM ai_points_rates WHERE model=?")
          .get(second.model),
        original = JSON.parse(card.data);
      store.db
        .prepare("UPDATE ai_points_rates SET data=? WHERE model=?")
        .run(
          JSON.stringify({
            ...original,
            expiresAt: new Date(Date.now() - 1000).toISOString(),
          }),
          second.model,
        );
      assert.equal(authorAiSettings(store).channelId, first.id);
      const before = requests.length;
      await provider.call([{ role: "user", content: "fixture" }], undefined, {
        userId: learner.id,
        maxTokens: 16,
      });
      assert.equal(requests.length, before + 1);
      assert.equal(requests.at(-1).body.model, first.model);
      store.db
        .prepare("UPDATE ai_points_rates SET data=?,paused=1 WHERE model=?")
        .run(card.data, second.model);
      assert.equal(authorAiSettings(store).channelId, first.id);
      store.db
        .prepare("UPDATE ai_points_rates SET paused=0 WHERE model=?")
        .run(second.model);
      assert.equal(authorAiSettings(store).channelId, second.id);
    },
  );
  await t.test(
    "multi-call schema failures refund the whole task at the selected model rate",
    async () => {
      mode = "invalid";
      const before = store.points.wallet(learner.id).availableUnits,
        start = requests.length;
      await assert.rejects(
        provider.structured(
          "fixture",
          {},
          z.object({ text: z.string() }),
          undefined,
          undefined,
          undefined,
          learner.id,
          { attempts: 2, maxTokens: 16 },
        ),
      );
      assert.equal(requests.length - start, 2);
      assert.equal(store.points.wallet(learner.id).availableUnits, before);
      assert.equal(store.points.wallet(learner.id).heldUnits, 0);
      mode = "ok";
    },
  );
  await t.test(
    "Kimi K2.6 omits incompatible temperatures for both ordinary calls and independent review",
    async () => {
      const settings = {
        baseUrl: "https://api.moonshot.cn/v1",
        model: "kimi-k2.6",
        vendor: "kimi",
        requestMode: "thinking-disabled",
        apiKey: "synthetic-kimi-key",
      };
      store.points.saveRateCard(
        {
          provider: settings.baseUrl,
          model: settings.model,
          inputMicrosPerMillion: 2000000,
          outputMicrosPerMillion: 8000000,
          cachedMicrosPerMillion: 40000,
          source: "synthetic Kimi pricing only",
          verifiedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
        owner.id,
      );
      for (const temperature of [0, 0.3]) {
        await provider.call(
          [{ role: "user", content: "fixture" }],
          { ...settings, temperature },
          { userId: learner.id, maxTokens: 16 },
        );
        assert.equal("temperature" in requests.at(-1).body, false);
        assert.equal(requests.at(-1).body.thinking.type, "disabled");
      }
    },
  );
  await t.test(
    "upstream failures refund, do not retry other paid channels and retain test failure status",
    async () => {
      mode = "fail";
      const before = store.points.wallet(owner.id).availableUnits,
        start = requests.length;
      const result = await request("/channels/" + second.id + "/test", {
        confirmed: true,
      });
      assert.ok(result.status >= 400);
      assert.equal(requests.length, start + 1);
      assert.equal(requests.at(-1).body.model, second.model);
      assert.equal(store.points.wallet(owner.id).availableUnits, before);
      assert.equal(
        (await view()).channels.find((row) => row.id === second.id).lastTest
          .success,
        false,
      );
      assert.equal(authorAiSettings(store).channelId, first.id);
      mode = "ok";
    },
  );
  await t.test(
    "managed mode with no ready enabled channels fails closed, never silently uses the legacy key",
    async () => {
      await request("/channels/" + first.id + "/state", {
        revision: (await view()).revision,
        enabled: false,
      });
      assert.equal(authorAiSettings(store), null);
      assert.equal((await view()).selected, null);
      const start = requests.length;
      await assert.rejects(
        provider.call([{ role: "user", content: "fixture" }], undefined, {
          userId: learner.id,
          maxTokens: 16,
        }),
      );
      assert.equal(requests.length, start);
    },
  );
  await t.test(
    "reverting mode and removing channels does not delete original settings or historical costs",
    async () => {
      assert.equal(
        (
          await request("/policy", {
            revision: (await view()).revision,
            managed: false,
          })
        ).status,
        200,
      );
      assert.equal(authorAiSettings(store).apiKey, "synthetic-legacy-secret");
      const calls = store.db
        .prepare("SELECT count(*) AS n FROM ai_points_calls")
        .get().n;
      for (const row of (await view()).channels)
        assert.equal(
          (
            await request(
              "/channels/" + row.id,
              { revision: (await view()).revision },
              "DELETE",
            )
          ).status,
          200,
        );
      assert.equal((await view()).channels.length, 0);
      assert.equal(
        store.db.prepare("SELECT count(*) AS n FROM ai_points_calls").get().n,
        calls,
      );
      assert.equal(store.points.audit().passed, true);
      assert.equal(
        JSON.stringify(store.usage(owner.id)).includes(
          "synthetic-channel-secret",
        ),
        false,
      );
    },
  );
});
