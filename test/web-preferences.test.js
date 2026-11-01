import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStore } from "../server/store.js";
import { createApp } from "../server/index.js";
import { OpenAICompatibleProvider } from "../server/ai.js";
import { webPreferenceDefaults } from "../server/web-preference-values.js";
import {
  readPracticePreferences,
  hasPracticePreferences,
} from "../src/blue-practice.js";

async function fixture(t) {
  process.env.ALLOWED_HOSTS = "127.0.0.1,localhost";
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aceexam-web-pref-"));
  let store, app, server;
  const open = async () => {
    store = createStore(directory);
    app = await createApp({ store, withFrontend: false, provider: new OpenAICompatibleProvider(store, { fetch: async () => { throw new Error("External models disabled in preferences test"); } }) });
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
    assert(path.basename(directory).startsWith("aceexam-web-pref-"));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const users = [];
  for (const name of ["pref-a", "pref-b"]) {
    const u = await store.registerAsync(name, "fixture-password-123");
    store.selectCertificate(u.id, "network-engineer");
    users.push(u);
  }
  const tokens = users.map((u) => store.createAuthSession(u.id));
  const req = async (body, token = tokens[0]) => {
    const r = await fetch(
      `http://127.0.0.1:${server.address().port}/api/web-preferences`,
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
  const write = (
    version = 0,
    values = {
      ...webPreferenceDefaults,
      theme: "dark",
      textSize: "largest",
      defaultCount: 20,
      reducedMotion: true,
    },
    certificateId = "network-engineer",
  ) => ({ version, values, certificateId, requestId: crypto.randomUUID() });
  return {
    get store() {
      return store;
    },
    users,
    tokens,
    req,
    write,
    async restart() {
      await close();
      await open();
    },
  };
}
test("Web preferences are authenticated, private, free and isolated; appearance is per account and question counts per certificate", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.req(undefined, null)).status, 401);
  const initial = await f.req();
  assert.equal(initial.cache, "no-store");
  assert.deepEqual(initial.data.values, webPreferenceDefaults);
  assert.equal(initial.data.version, 0);
  const settings = f.store.db.prepare("SELECT * FROM user_settings").all(),
    usage = f.store.db.prepare("SELECT * FROM user_usage").all();
  const body = f.write(),
    saved = await f.req(body);
  assert.equal(saved.status, 200);
  assert.equal(saved.cache, "no-store");
  assert.equal(saved.data.version, 1);
  assert.deepEqual(saved.data.values, body.values);
  assert.deepEqual(
    (await f.req(body)).data,
    saved.data,
    "a lost acknowledgement can be retried without a second write",
  );
  assert.equal(
    (await f.req({ ...body, values: { ...body.values, defaultCount: 30 } }))
      .data.code,
    "WEB_PREFERENCE_REQUEST_CONFLICT",
  );
  assert.equal((await f.req(f.write(0))).data.code, "WEB_PREFERENCE_CONFLICT");
  assert.equal(
    (await f.req({ ...f.write(1), apiKey: "must-not-enter-preferences" }))
      .status,
    400,
  );
  assert.equal(
    (await f.req(f.write(1, { ...body.values, theme: "<script>" }))).status,
    400,
  );
  assert.equal(
    (await f.req(f.write(1, { ...body.values, defaultCount: 1000 }))).status,
    400,
  );
  assert.equal(
    (await f.req(f.write(1, { ...body.values, reducedMotion: "true" }))).status,
    400,
  );
  assert.deepEqual(
    (await f.req(undefined, f.tokens[1])).data.values,
    webPreferenceDefaults,
  );
  f.store.selectCertificate(f.users[0].id, "sichuan-upgrading-computer");
  assert.equal(
    (await f.req(f.write(1))).data.code,
    "WEB_PREFERENCE_CONTEXT_CHANGED",
  );
  const sc = (await f.req()).data;
  assert.equal(sc.values.theme, "dark");
  assert.equal(sc.values.defaultCount, 10);
  const scBody = f.write(
    1,
    { ...sc.values, defaultCount: 30 },
    "sichuan-upgrading-computer",
  );
  assert.equal((await f.req(scBody)).status, 200);
  f.store.selectCertificate(f.users[0].id, "network-engineer");
  assert.equal((await f.req()).data.values.defaultCount, 20);
  assert.deepEqual(
    f.store.db.prepare("SELECT * FROM user_settings").all(),
    settings,
  );
  assert.deepEqual(f.store.db.prepare("SELECT * FROM user_usage").all(), usage);
});

test("review preferences migrate old rows and preserve new choices through legacy saves, retries and certificate changes", async (t) => {
  const f = await fixture(t);
  const legacyValues = { theme: "light", textSize: "standard", reducedMotion: false, defaultCount: 10 };
  f.store.db.prepare("INSERT INTO user_web_preferences VALUES (?,?,?,?)").run(f.users[0].id, 0, JSON.stringify({ ...legacyValues, counts: { "network-engineer": 10 } }), new Date().toISOString());
  assert.deepEqual((await f.req()).data.values, webPreferenceDefaults);
  const chosen = { ...webPreferenceDefaults, showAnalysis: false, autoNext: true };
  const body = f.write(0, chosen);
  assert.deepEqual((await f.req(body)).data.values, chosen);
  assert.equal((await f.req(body)).data.version, 1);
  assert.equal((await f.req(f.write(1, { ...chosen, autoNext: "yes" }))).status, 400);
  // An older tab changing its four original fields must not reset review choices.
  const legacy = f.write(1, { ...legacyValues, theme: "dark", defaultCount: 20 });
  const saved = (await f.req(legacy)).data;
  assert.deepEqual(saved.values, { ...chosen, theme: "dark", defaultCount: 20 });
  await f.restart();
  assert.deepEqual((await f.req()).data, saved);
  f.store.selectCertificate(f.users[0].id, "veterinary-practitioner");
  const veterinary = (await f.req()).data.values;
  assert.equal(veterinary.autoNext, true);
  assert.equal(veterinary.showAnalysis, false);
  assert.equal(veterinary.defaultCount, 10);
  assert.deepEqual((await f.req(undefined, f.tokens[1])).data.values, webPreferenceDefaults);
  assert.equal((await f.req(body)).data.code, "WEB_PREFERENCE_CONTEXT_CHANGED");
});
test("preference and operation records commit together, survive restart, and let old retries recover across newer saves", async (t) => {
  const f = await fixture(t),
    first = f.write();
  assert.equal((await f.req(first)).status, 200);
  await f.restart();
  assert.equal((await f.req()).data.values.theme, "dark");
  const next = f.write(1, { ...webPreferenceDefaults, defaultCount: 30 });
  f.store.db.exec(
    `CREATE TRIGGER fail_pref BEFORE INSERT ON web_preference_requests WHEN NEW.request_id='${next.requestId}' BEGIN SELECT RAISE(ABORT,'fixture rollback'); END`,
  );
  assert.notEqual((await f.req(next)).status, 200);
  assert.equal((await f.req()).data.version, 1);
  assert.equal((await f.req()).data.values.theme, "dark");
  f.store.db.exec("DROP TRIGGER fail_pref");
  assert.equal((await f.req(next)).data.version, 2);
  assert.equal(
    (await f.req(first)).data.version,
    2,
    "retry acknowledges the earlier operation but returns the newest authoritative settings",
  );
  assert.equal((await f.req()).data.values.theme, "light");
});
test("save limits exclude acknowledged retries and release old request timestamps", async (t) => {
  const f = await fixture(t),
    first = f.write();
  assert.equal((await f.req(first)).status, 200);
  for (let i = 0; i < 59; i++)
    f.store.db
      .prepare("INSERT INTO web_preference_requests VALUES (?,?,?,?)")
      .run(
        f.users[0].id,
        crypto.randomUUID(),
        "fixture",
        new Date().toISOString(),
      );
  const next = f.write(1);
  assert.equal((await f.req(next)).data.code, "WEB_PREFERENCE_RATE_LIMIT");
  assert.equal((await f.req(first)).status, 200);
  f.store.db
    .prepare("UPDATE web_preference_requests SET created_at=? WHERE user_id=?")
    .run(new Date(Date.now() - 61000).toISOString(), f.users[0].id);
  assert.equal((await f.req(next)).status, 200);
});
test("late account defaults are available without storage and explicit chapter choices retain priority", () => {
  assert.equal(
    readPracticePreferences({ getItem: () => null }, "key", 30).count,
    30,
  );
  assert.equal(
    readPracticePreferences(
      {
        getItem() {
          throw new Error("denied");
        },
      },
      "key",
      20,
    ).count,
    20,
  );
  const storage = {
    getItem: () =>
      JSON.stringify({ order: "random", range: "wrong", count: 10 }),
  };
  assert(hasPracticePreferences(storage, "key"));
  assert.equal(readPracticePreferences(storage, "key", 30).count, 10);
  assert(!hasPracticePreferences({ getItem: () => '{"count":"30"}' }, "key"));
});
