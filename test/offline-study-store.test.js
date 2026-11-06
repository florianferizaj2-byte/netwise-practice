import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

async function makeStore() {
  const file = new URL("../mobile/src/offline/offlineStudyStore.android.ts", import.meta.url);
  const core = new URL("./offlineStudyCore.ts", file).href;
  const source = (await fs.readFile(file, "utf8"))
    .replace(/^import .+ from 'expo-(crypto|sqlite)';\r?$/gm, "")
    .replace("import { API_BASE_URL } from '../api/endpoint';", "const API_BASE_URL = 'https://fixture.test/api';")
    .replace("'./offlineStudyCore'", JSON.stringify(core));
  const bridge = [
    'import { DatabaseSync } from "node:sqlite";',
    'import { createHash } from "node:crypto";',
    'const raw = new DatabaseSync(":memory:");',
    'export const closeFixture = () => raw.close();',
    'const CryptoDigestAlgorithm = { SHA256: "sha256" };',
    'const digestStringAsync = async (algorithm, value) => createHash(algorithm).update(value).digest("hex");',
    'const execAsync = async (sql) => raw.exec(sql);',
    'const db = { execAsync, getFirstAsync: async (sql, ...params) => raw.prepare(sql).get(...params),',
    '  getAllAsync: async (sql, ...params) => raw.prepare(sql).all(...params),',
    '  runAsync: async (sql, ...params) => raw.prepare(sql).run(...params),',
    '  withExclusiveTransactionAsync: async (task) => {',
    '    raw.exec("BEGIN EXCLUSIVE");',
    '    try { await task(db); raw.exec("COMMIT"); } catch (err) { raw.exec("ROLLBACK"); throw err; }',
    '  },',
    '};',
    'const openDatabaseAsync = async () => db;',
  ].join("\n");
  const url = "data:text/javascript;base64," + Buffer.from(bridge + "\n" + stripTypeScriptTypes(source) +
    "\n//" + crypto.randomUUID()).toString("base64");
  return import(url);
}

test("SQLite keeps more than 200 local answers, scoped to account, certificate, and Beijing day", async (t) => {
  const { offlineStudyStore: db, closeFixture } = await makeStore();
  t.after(closeFixture);
  const owner = { userId: "learner", certificateId: "hcia-datacom" };
  const other = { ...owner, certificateId: "network-engineer" };
  const otherUser = { ...owner, userId: "other" };
  const time = Date.parse("2026-11-06T23:59:59+08:00");
  const rows = Array.from({ length: 251 }, (_, n) => ({
    id: crypto.randomUUID(), questionId: "q" + n, selected: ["A"], correct: n === 0,
    occurredAt: time, timeMs: 500, source: "practice", packVersion: "a".repeat(64),
  }));
  await db.record(owner, rows, { id: "practice:current", data: { at: 250 } });
  await db.record(owner, [rows[0]]);
  assert.equal(await db.todayCount(owner, time), 251);
  assert.equal(await db.todayCount(owner, time + 1000), 0);
  assert.equal(await db.todayCount(other, time), 0);
  assert.equal(await db.todayCount(otherUser, time), 0);
  assert.equal((await db.pending(owner)).length, 100);
  assert.deepEqual(await db.readSession(owner, "practice:current"), { at: 250 });
  assert.equal(await db.readSession(other, "practice:current"), null);
  await db.setFavorite(owner, "q0", true);
  assert.equal((await db.progress(owner)).favorites.has("q0"), true);
  assert.equal((await db.progress(other)).favorites.has("q0"), false);
  assert.equal((await db.progress(owner)).wrong.size, 250);
});

test("an uploaded attempt and downloaded server copy never count twice", async (t) => {
  const { offlineStudyStore: db, closeFixture } = await makeStore();
  t.after(closeFixture);
  const owner = { userId: "learner", certificateId: "hcia-datacom" };
  const time = Date.parse("2026-11-06T23:59:59+08:00");
  const row = { id: crypto.randomUUID(), questionId: "q1", selected: ["A"], correct: true,
    occurredAt: time, timeMs: 500, source: "practice", packVersion: "a".repeat(64) };
  const serverId = crypto.createHash("sha256").update("learner:practice:" + row.id).digest("hex");
  await db.record(owner, [row]);
  await db.importOnline(owner, "2026-11-06", [{ ...row, serverId }]);
  assert.equal(await db.todayCount(owner, time), 1);
  await assert.rejects(db.applyReceipt(owner, [row.id], { accepted: [], rejected: [] }), /本机记录仍保留/);
  assert.equal((await db.pending(owner)).length, 1);
  await db.applyReceipt(owner, [row.id], { accepted: [{ ...row, serverId }], rejected: [] });
  assert.equal((await db.pending(owner)).length, 0);
  assert.equal(await db.todayCount(owner, time), 1);
});
