import test from "node:test";
import assert from "node:assert/strict";
import { mobileModules, memoryStorage, deferred } from "./mobile-fixture.js";

test("protected mobile lessons are never persisted and stale certificate responses are discarded", async (t) => {
  const storage = memoryStorage(),
    load = await mobileModules(t, storage);
  const { mobileApi, studyCache } = await load("client");
  const original = globalThis.fetch,
    late = deferred();
  t.after(async () => {
    await studyCache.setScope(null);
    globalThis.fetch = original;
  });
  const response = (data) =>
    new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  let slow = false;
  globalThis.fetch = async (url, init) => {
    const path = new URL(url).pathname;
    if (path === "/api/auth/login")
      return response({
        sessionToken: "member-token",
        user: {
          id: "member",
          username: "member",
          certificateId: "network-engineer",
        },
        certificates: [],
      });
    assert.equal(init.headers.Authorization, "Bearer member-token");
    if (path === "/api/study/lessons/lesson")
      return slow
        ? late.promise
        : response({ lesson: { summary: "private member lesson" } });
    if (path === "/api/auth/certificate")
      return response({
        user: {
          id: "member",
          username: "member",
          certificateId: "sichuan-upgrading-computer",
        },
      });
    if (path === "/api/study/catalog")
      return response({ access: true, supported: false, nodes: [] });
    throw new Error(`Unexpected request: ${path}`);
  };
  await mobileApi.login("member", "fixture-password");
  assert.equal(
    (await mobileApi.studyLesson("lesson")).lesson.summary,
    "private member lesson",
  );
  await studyCache.flush();
  assert.ok(
    [...storage.values.values()].every(
      (value) => !value.includes("private member lesson"),
    ),
  );
  slow = true;
  const oldLesson = mobileApi.studyLesson("lesson");
  const cancelled = assert.rejects(oldLesson, { name: "CacheCancelledError" });
  const changed = await mobileApi.selectCertificate(
    "sichuan-upgrading-computer",
  );
  await mobileApi.cacheSession({ user: changed.user, certificates: [] });
  late.resolve(
    response({
      lesson: { summary: "private member lesson from old certificate" },
    }),
  );
  await cancelled;
  assert.deepEqual(await mobileApi.studyCatalog(), {
    access: true,
    supported: false,
    nodes: [],
  });
  assert.equal(
    JSON.parse(storage.values.get("kaojiang-session-profile")).user
      .certificateId,
    "sichuan-upgrading-computer",
  );
});
