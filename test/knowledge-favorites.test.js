import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStore } from "../server/store.js";
import { createApp } from "../server/index.js";
import { studyNode } from "../server/study-content.js";

async function fixture(t) {
  process.env.ALLOWED_HOSTS = "127.0.0.1,localhost";
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "aceexam-knowledge-"),
  );
  let store, app, server;
  const open = async () => {
    store = createStore(directory);
    app = await createApp({ store, withFrontend: false });
    server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
  };
  const close = async () => {
    await app.locals.stop();
    await new Promise((r) => server.close(r));
    store.db.close();
  };
  await open();
  t.after(async () => {
    await close();
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert(path.basename(directory).startsWith("aceexam-knowledge-"));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const users = [];
  for (const name of ["knowledge-a", "knowledge-b"]) {
    const u = await store.registerAsync(name, "fixture-password-123");
    store.selectCertificate(u.id, "network-engineer");
    users.push(u);
  }
  const tokens = users.map((u) => store.createAuthSession(u.id));
  const req = async (url, body, token = tokens[0]) => {
    const r = await fetch(
      `http://127.0.0.1:${server.address().port}/api${url}`,
      {
        method: body ? "PUT" : "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    return {
      status: r.status,
      data: await r.json(),
      cache: r.headers.get("cache-control"),
    };
  };
  return {
    get store() {
      return store;
    },
    get app() {
      return app;
    },
    users,
    tokens,
    req,
    async restart() {
      await close();
      await open();
    },
  };
}
const endpoint = (id) => "/knowledge-favorites/" + encodeURIComponent(id);

test("free learners can save public knowledge identities without reading paid answers; users and certificates are isolated", async (t) => {
  const f = await fixture(t);
  assert.equal(
    (await f.req("/knowledge-favorites", undefined, null)).status,
    401,
  );
  const catalog = await f.req("/knowledge-favorites/catalog");
  assert.equal(catalog.status, 200);
  assert.equal(catalog.cache, "no-store");
  assert.equal(catalog.data.nodes.length, 148);
  assert.deepEqual((await f.req("/knowledge-favorites/info")).data, {
    supported: true,
    catalogSize: 148,
  });
  const item = catalog.data.nodes.find(
    (n) => n.id === "network-engineer:01.01.01",
  );
  assert(item && item.available);
  const path = endpoint(item.id),
    beforeUsage = f.store.db.prepare("SELECT * FROM user_usage").all();
  const first = await f.req(path, { favorite: true });
  assert.equal(first.status, 200);
  assert(first.data.favoritedAt);
  assert.deepEqual(
    (await f.req(path, { favorite: true })).data,
    first.data,
    "idempotent retries keep the original time",
  );
  const list = await f.req("/knowledge-favorites");
  assert.equal(list.cache, "no-store");
  assert.equal(list.data.length, 1);
  assert.equal(list.data[0].title, item.title);
  for (const key of [
    "answer",
    "analysis",
    "questions",
    "user_id",
    "scope",
    "conversation",
  ])
    assert(!(key in list.data[0]));
  assert.deepEqual(
    (await f.req("/knowledge-favorites", undefined, f.tokens[1])).data,
    [],
  );
  assert.equal(
    (await f.req("/study/lessons/" + encodeURIComponent(item.lessonNodeId)))
      .status,
    403,
    "saving metadata does not unlock paid content",
  );
  assert.equal(
    (await f.req(path, { favorite: true, userId: f.users[1].id })).status,
    400,
  );
  assert.equal((await f.req(path, { favorite: "yes" })).status, 400);
  assert.equal(
    (await f.req(endpoint("network-engineer:made-up"), { favorite: true }))
      .status,
    404,
  );
  f.store.selectCertificate(f.users[0].id, "sichuan-upgrading-computer");
  assert.deepEqual((await f.req("/knowledge-favorites")).data, []);
  assert.equal((await f.req(path)).status, 404);
  assert.equal((await f.req(path, { favorite: false })).status, 404);
  const sc = (await f.req("/knowledge-favorites/catalog")).data;
  assert.equal(sc.nodes.length, 163);
  const unit = sc.nodes.find((n) => n.kind === "lesson" && n.available);
  assert(unit);
  assert.equal(
    (await f.req(endpoint(unit.id), { favorite: true })).status,
    200,
  );
  assert.equal((await f.req("/knowledge-favorites")).data[0].title, unit.title);
  f.store.selectCertificate(f.users[0].id, "network-engineer");
  assert.equal((await f.req("/knowledge-favorites")).data[0].id, item.id);
  for (const certificate of [
    "hcia-datacom",
    "ncre-ms-office",
    "veterinary-practitioner",
  ]) {
    f.store.selectCertificate(f.users[0].id, certificate);
    const c = (await f.req("/knowledge-favorites/catalog")).data;
    assert.equal(c.supported, false);
    assert.equal(
      (await f.req("/knowledge-favorites/info")).data.supported,
      false,
    );
    assert.deepEqual(c.nodes, []);
  }
  assert.deepEqual(
    f.store.db.prepare("SELECT * FROM user_usage").all(),
    beforeUsage,
  );
});

test("favorites survive restart, respect withdrawn content, and retain a removable label when the directory changes", async (t) => {
  const f = await fixture(t),
    id = "network-engineer:01.01.01";
  assert.equal((await f.req(endpoint(id), { favorite: true })).status, 200);
  const before = (await f.req("/knowledge-favorites")).data;
  await f.restart();
  assert.deepEqual((await f.req("/knowledge-favorites")).data, before);
  const node = studyNode(id),
    pub = f.app.locals.study.published(node);
  assert(pub);
  f.app.locals.study.suspend(pub.id, f.users[0].id);
  const item = (await f.req("/knowledge-favorites")).data[0];
  assert.equal(item.favorite, true);
  assert.equal(item.available, false);
  assert.equal(item.lessonNodeId, id);
  const retired = {
    id: "network-engineer:retired-topic",
    certificateId: "network-engineer",
    title: "旧版知识点",
    chapter: "计算机基础知识",
    section: "目录已更新",
    kind: "point",
    version: "old",
  };
  f.store.db
    .prepare("INSERT INTO knowledge_favorites VALUES (?,?,?,?,?)")
    .run(
      f.users[0].id,
      "network-engineer",
      retired.id,
      new Date().toISOString(),
      JSON.stringify(retired),
    );
  const old = (await f.req("/knowledge-favorites")).data.find(
    (n) => n.id === retired.id,
  );
  assert(old);
  assert.equal(old.current, false);
  assert.equal(old.available, false);
  assert.equal(old.lessonNodeId, null);
  assert.equal(
    (await f.req(endpoint(retired.id), { favorite: false })).status,
    200,
  );
  assert.equal(
    (await f.req(endpoint(retired.id), { favorite: false })).status,
    200,
    "obsolete favorites can still be removed idempotently",
  );
  assert.equal((await f.req(endpoint(id), { favorite: false })).status, 200);
  assert.equal((await f.req(endpoint(id), { favorite: false })).status, 200);
  assert.deepEqual((await f.req("/knowledge-favorites")).data, []);
});
