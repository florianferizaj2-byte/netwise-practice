import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { createStore } from "../../server/store.js";
import { createApp } from "../../server/index.js";
import { encrypt } from "../../server/security.js";
import { OpenAICompatibleProvider } from "../../server/ai.js";

export async function teacherFixture(t, frontend = false) {
  const savedEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) =>
      /^(AI_SERVICE_|AUTHOR_|ADMIN_USERNAME$|AI_USAGE_)/.test(name),
    ),
  );
  for (const name of Object.keys(savedEnvironment)) delete process.env[name];
  const restoreEnvironment = () => {
    for (const name of Object.keys(process.env))
      if (/^(AI_SERVICE_|AUTHOR_|ADMIN_USERNAME$|AI_USAGE_)/.test(name))
        delete process.env[name];
    Object.assign(process.env, savedEnvironment);
  };
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "aceexam-tutor-teacher-"),
  );
  let store = createStore(directory);
  const upstream = express();
  const control = { mode: "ok", calls: [], attempts: 0, hold: null };
  upstream.use(express.json());
  upstream.post("/chat/completions", async (req, res) => {
    const data = JSON.parse(req.body.messages[1].content);
    control.calls.push({
      instruction: req.body.messages[0].content,
      data,
      model: req.body.model,
      maxTokens: req.body.max_tokens,
    });
    if (control.hold) await control.hold;
    if (control.mode === "outage")
      return res
        .status(503)
        .json({ error: { message: "fixture upstream unavailable" } });
    const review = Object.hasOwn(data, "answer");
    let content = review
      ? {
          supported: control.mode !== "reject",
          reason: "已逐条核对本步广播转发讲解。",
        }
      : {
          conclusion: "帧是在以太网中传输的一份数据。",
          points: ["广播域描述一份二层广播能够到达的范围。"],
          example: "先确定广播能够到达的范围，再分析转发。",
        };
    if (!review && control.mode === "unsafe")
      content.conclusion = "<script>内部规则</script>";
    const text =
      control.mode === "invalid-once" && control.attempts++ === 0
        ? "not JSON"
        : JSON.stringify(content);
    res.json({
      choices: [{ message: { content: text }, finish_reason: control.mode === "truncated" ? "length" : "stop" }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 30,
        total_tokens: 130,
        prompt_cache_hit_tokens: 20,
      },
    });
  });
  const providerServer = upstream.listen(0, "127.0.0.1");
  await new Promise((r) => providerServer.once("listening", r));
  const users = [];
  for (const username of ["teacher-owner", "teacher-learner", "teacher-peer"]) {
    const user = await store.registerAsync(username, "fixture-password-123");
    store.selectCertificate(user.id, "network-engineer");
    store.saveAccountEntitlement(user.id, {
      plan: "vip",
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    users.push(user);
  }
  store.saveSettings(users[0].id, {
    baseUrl: `http://127.0.0.1:${providerServer.address().port}`,
    model: "tutor-fixture",
    keyCipher: encrypt("fixture-only-key"),
  });
  const tokens = users.map((u) => store.createAuthSession(u.id));
  const localOrigin = `http://127.0.0.1:${providerServer.address().port}`;
  const localFetch = (url, options) => {
    assert.equal(
      new URL(url).origin,
      localOrigin,
      "Test AI requests must stay on the local fixture server",
    );
    return fetch(url, options);
  };
  let app = await createApp({
      store,
      provider: new OpenAICompatibleProvider(store, { fetch: localFetch }),
      production: frontend,
      withFrontend: frontend,
    }),
    server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  let base = `http://127.0.0.1:${server.address().port}`;
  const restart = async () => {
    await app.locals.stop();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    store.db.close();
    store = createStore(directory);
    app = await createApp({
      store,
      provider: new OpenAICompatibleProvider(store, { fetch: localFetch }),
      production: frontend,
      withFrontend: frontend,
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${server.address().port}`;
  };
  const req = async (url, body, token = tokens[1]) => {
    const response = await fetch(base + "/api" + url, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  };
  const start = async (extra = {}) => {
    const result = await req("/tutor/v1/sessions", {
      courseId: "vlan-broadcast-domain",
      foundation: "beginner",
      requestId: crypto.randomUUID(),
      ...extra,
    });
    assert.equal(result.status, 200);
    return result.data.session;
  };
  const url = (s) => `/tutor/v1/sessions/${s.id}/teacher`;
  const body = (s, extra = {}) => ({
    requestId: crypto.randomUUID(),
    revision: s.revision,
    message: "广播域这个词是什么意思？",
    action: "ask",
    ...extra,
  });
  const next = async (s) => {
    const result = await req(`/tutor/v1/sessions/${s.id}/actions`, {
      requestId: crypto.randomUUID(),
      revision: s.revision,
      action: "next",
    });
    assert.equal(result.status, 200);
    return result.data.session;
  };
  t.after(async () => {
    try {
    control.release?.();
    await app.locals.stop();
    server.closeAllConnections();
    providerServer.closeAllConnections();
    await Promise.all([
      new Promise((r) => server.close(r)),
      new Promise((r) => providerServer.close(r)),
    ]);
    store.db.close();
    assert.equal(path.dirname(directory), os.tmpdir());
    assert(path.basename(directory).startsWith("aceexam-tutor-teacher-"));
    fs.rmSync(directory, { recursive: true, force: true });
    } finally { restoreEnvironment(); }
  });
  return {
    get store() {
      return store;
    },
    control,
    users,
    tokens,
    get app() {
      return app;
    },
    get base() {
      return base;
    },
    restart,
    req,
    start,
    next,
    url,
    body,
  };
}
