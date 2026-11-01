import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createApp } from "../server/index.js";
import { createStore } from "../server/store.js";
import { hasCertificateQuestion } from "../server/certificates.js";

test("practice retry tokens are idempotent, account scoped and reject changed answers", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ace-attempt-token-"));
  const store = createStore(dir);
  const a = await store.registerAsync("attempt-one", "fixture-password-123");
  const b = await store.registerAsync("attempt-two", "fixture-password-123");
  for (const user of [a, b])
    store.selectCertificate(user.id, "network-engineer");
  const app = await createApp({
    store,
    withFrontend: false,
    accountSecurity: { enabled: false },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await app.locals.stop();
    store.db.close();
  });
  const q = store
    .allQ()
    .find(
      (q) =>
        hasCertificateQuestion(q, "network-engineer") &&
        q.type === "single_choice",
    );
  const payload = {
    questionId: q.id,
    selected: q.answer,
    timeMs: 1000,
    clientAttemptId: crypto.randomUUID(),
  };
  const tokens = new Map(
    [a, b].map((user) => [user.id, store.createAuthSession(user.id)]),
  );
  const submit = async (user, body) => {
    const r = await fetch(
      `http://127.0.0.1:${server.address().port}/api/attempts`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokens.get(user.id)}`,
        },
        body: JSON.stringify(body),
      },
    );
    return { status: r.status, data: await r.json() };
  };
  const first = await submit(a, payload),
    retry = await submit(a, payload);
  assert.equal(first.status, 200);
  assert.equal(retry.status, 200);
  assert.equal(first.data.id, retry.data.id);
  assert.equal(retry.data.correct, true);
  assert.deepEqual(retry.data.answer, q.answer);
  assert.equal(store.allA(a.id).length, 1);
  const changed = await submit(a, {
    ...payload,
    selected: [Object.keys(q.options).find((k) => !q.answer.includes(k))],
  });
  assert.equal(changed.status, 409);
  assert.equal(store.allA(a.id).length, 1);
  const other = await submit(b, payload);
  assert.equal(other.status, 200);
  assert.notEqual(other.data.id, first.data.id);
  assert.equal(store.allA(b.id).length, 1);
  assert.equal(
    (await submit(a, { ...payload, clientAttemptId: "invalid" })).status,
    400,
  );
  // Existing App clients can omit the optional token and still submit normally.
  const { clientAttemptId, ...legacy } = payload;
  assert.equal((await submit(a, legacy)).status, 200);
  assert.equal(store.allA(a.id).length, 2);
});
