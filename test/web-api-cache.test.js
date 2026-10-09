import test from "node:test";
import assert from "node:assert/strict";
import { api, cacheApiResponse, peekCachedApi } from "../src/api.js";

test("web reads reuse scoped lessons and sessions, while writes, publication and expiry refresh the right resources", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  let certificate = "network",
    publication = "v1",
    expiresAt = new Date(Date.now() + 60000).toISOString();
  let loseAcknowledgement = false;
  const calls = new Map();
  const json = (data) =>
    new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  globalThis.fetch = async (url, options) => {
    const path = String(url).replace(/^\/api/, "");
    const key = `${options.method} ${path}`;
    calls.set(key, (calls.get(key) || 0) + 1);
    if (path === "/auth/me")
      return json({
        authenticated: true,
        user: { id: "member", certificateId: certificate },
      });
    if (path === "/auth/certificate") {
      certificate = JSON.parse(options.body).certificateId;
      return json({ user: { id: "member", certificateId: certificate } });
    }
    if (path === "/auth/logout") return json({ authenticated: false });
    if (path === "/study/catalog")
      return json({
        access: true,
        expiresAt,
        nodes: [{ id: "lesson", available: true, packageId: publication }],
      });
    if (path === "/study/lessons/lesson")
      return json({
        node: { id: "lesson" },
        packageId: publication,
        certificate,
      });
    if (path === "/study/practice-sessions")
      return json({ id: "session", packageId: publication, attempts: [] });
    if (
      path === "/study/practice-sessions/session/attempts" &&
      loseAcknowledgement
    )
      return new Response(JSON.stringify({ error: "connection interrupted" }), {
        status: 503,
      });
    if (path === "/study/practice-sessions/session/attempts")
      return json({ id: `attempt-${calls.get(key)}` });
    throw new Error(`Unexpected request ${key}`);
  };
  await api("/auth/me");
  await api("/study/catalog");
  await Promise.all([
    api("/study/lessons/lesson"),
    api("/study/lessons/lesson"),
  ]);
  await api("/study/lessons/lesson");
  await api("/study/catalog");
  assert.equal(calls.get("GET /study/lessons/lesson"), 1);
  assert.equal(calls.get("GET /study/catalog"), 1);
  const body = { nodeId: "lesson", resume: true },
    options = { cache: { ttl: 300000 } };
  await Promise.all([
    api("/study/practice-sessions", body, "POST", options),
    api("/study/practice-sessions", body, "POST", options),
  ]);
  assert.equal(calls.get("POST /study/practice-sessions"), 1);
  await api("/study/practice-sessions/session/attempts", { answer: "a" });
  await api("/study/practice-sessions/session/attempts", { answer: "a" });
  assert.equal(
    calls.get("POST /study/practice-sessions/session/attempts"),
    2,
    "answer submissions are never hidden by the read cache",
  );
  assert.equal(peekCachedApi("/study/catalog"), undefined);
  cacheApiResponse(
    "/study/practice-sessions",
    { id: "session", attempts: ["saved"] },
    body,
  );
  assert.deepEqual(
    (await api("/study/practice-sessions", body, "POST", options)).attempts,
    ["saved"],
  );
  assert.equal(calls.get("POST /study/practice-sessions"), 1);
  loseAcknowledgement = true;
  await assert.rejects(
    api("/study/practice-sessions/session/attempts", { answer: "a" }),
    { status: 503 },
  );
  assert.equal(
    peekCachedApi("/study/practice-sessions", body),
    undefined,
    "a lost acknowledgement forces recovery from the server",
  );
  loseAcknowledgement = false;
  cacheApiResponse(
    "/study/practice-sessions",
    { id: "session", attempts: ["saved"] },
    body,
  );
  publication = "v2";
  await api("/study/catalog", undefined, undefined, { force: true });
  assert.equal(
    peekCachedApi("/study/lessons/lesson"),
    undefined,
    "a newly published package invalidates the old lesson",
  );
  assert.equal(peekCachedApi("/study/practice-sessions", body), undefined);
  assert.equal((await api("/study/lessons/lesson")).packageId, "v2");
  expiresAt = new Date(Date.now() - 1).toISOString();
  await api("/study/catalog", undefined, undefined, { force: true });
  assert.equal(
    peekCachedApi("/study/lessons/lesson"),
    undefined,
    "membership expiry prevents reading cached lessons",
  );
  await api("/auth/certificate", { certificateId: "upgrading" }, "PUT");
  assert.equal((await api("/study/lessons/lesson")).certificate, "upgrading");
  await api("/auth/logout", {}, "POST");
  assert.equal(peekCachedApi("/study/lessons/lesson"), undefined);
});
