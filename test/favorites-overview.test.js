import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStore } from "../server/store.js";
import { createApp } from "../server/index.js";
import { hasCertificateQuestion } from "../server/certificates.js";
test("real favorites preserve recency, isolate users/certificates and never expose answers", async (t) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "aceexam-favorites-"),
  );
  const store = createStore(directory),
    app = await createApp({ store, withFrontend: false });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    await app.locals.stop();
    await new Promise((r) => server.close(r));
    store.db.close();
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert(path.basename(directory).startsWith("aceexam-favorites-"));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const a = await store.registerAsync("favorite-a", "fixture-password-123"),
    b = await store.registerAsync("favorite-b", "fixture-password-123");
  for (const u of [a, b]) store.selectCertificate(u.id, "network-engineer");
  const qs = store
    .allQ()
    .filter((q) => hasCertificateQuestion(q, "network-engineer"))
    .slice(0, 3);
  assert.equal(qs.length, 3);
  for (let i = 0; i < qs.length; i++) {
    store.setQuestionFavorite(a.id, qs[i].id, true);
    store.db
      .prepare(
        "UPDATE question_favorites SET created_at=? WHERE user_id=? AND question_id=?",
      )
      .run(`2026-10-0${i + 1}T12:00:00.000Z`, a.id, qs[i].id);
  }
  store.setQuestionFavorite(b.id, qs[0].id, true);
  const tokens = [a, b].map((u) => store.createAuthSession(u.id));
  const request = async (url, token, body) => {
    const r = await fetch(
      `http://127.0.0.1:${server.address().port}/api${url}`,
      {
        method: body ? "PUT" : "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    return { status: r.status, data: await r.json() };
  };
  const list = await request("/favorites", tokens[0]);
  assert.equal(list.status, 200);
  assert.deepEqual(
    list.data.map((q) => q.id),
    [...qs].reverse().map((q) => q.id),
  );
  for (const q of list.data) {
    assert(q.favoritedAt);
    for (const key of ["answer", "analysis", "expectedAnswer", "ownerUserId"])
      assert(!(key in q));
  }
  assert.deepEqual(
    (await request("/favorites", tokens[1])).data.map((q) => q.id),
    [qs[0].id],
  );
  assert.equal(
    (
      await request(`/questions/${qs[2].id}/favorite`, tokens[0], {
        favorite: false,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`/questions/${qs[2].id}/favorite`, tokens[0], {
        favorite: false,
      })
    ).status,
    200,
  );
  assert.equal((await request("/favorites", tokens[0])).data.length, 2);
  assert.equal((await request("/favorites", tokens[1])).data.length, 1);
  store.selectCertificate(a.id, "sichuan-upgrading-computer");
  assert(
    (await request("/favorites", tokens[0])).data.every((q) =>
      hasCertificateQuestion(q, "sichuan-upgrading-computer"),
    ),
  );
  store.selectCertificate(a.id, "network-engineer");
  assert.equal((await request("/favorites", tokens[0])).data.length, 2);
});
