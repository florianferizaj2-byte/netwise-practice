import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createApp } from "../server/index.js";
import { createStore } from "../server/store.js";
import { buildOfflinePack } from "../server/offline-packs.js";
import { decodeOfflinePack, parseOfflineManifest } from "../mobile/src/offline/offlinePackFormat.ts";
import {
  bundledQuestions, certificates, hasCertificateQuestion, questionForCertificate, syllabusForCertificate,
} from "../server/question-banks/loader.js";

const publicDir = fileURLToPath(new URL("../public", import.meta.url));
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

test("all released certificates export packs the Android validator accepts, with local media and exam data", async () => {
  const bundled = bundledQuestions();
  for (const certificate of certificates) {
    const questions = bundled.filter((q) => hasCertificateQuestion(q, certificate.id))
      .map((q) => questionForCertificate(q, certificate.id));
    const syllabus = syllabusForCertificate(certificate.id);
    const { bytes, manifest } = buildOfflinePack({ certificate, questions, syllabus, publicDir });
    const pack = await decodeOfflinePack(parseOfflineManifest(manifest, certificate.id), bytes.toString(), bytes.length, async (text) => sha256(text));
    assert.equal(manifest.certificateId, certificate.id);
    assert.equal(manifest.bytes, bytes.length);
    assert.equal(manifest.version, sha256(bytes));
    assert.equal(manifest.sha256, manifest.version);
    assert.equal(pack.schemaVersion, manifest.schemaVersion);
    assert.equal(manifest.questionCount, questions.length);
    assert.equal(new Set(pack.questions.map((question) => question.id)).size, questions.length);
    assert.equal(pack.exam.secondsPerQuestion, 120);
    assert.deepEqual(pack.exam.blueprint, syllabus?.examBlueprint ?? null);
    assert.equal(pack.exam.catalog.chapters.reduce((n, chapter) => n + chapter.questionCount, 0),
      pack.questions.filter((question) => question.type !== "short_answer").length);
    assert.equal(Object.keys(pack.media).length, manifest.mediaCount);
    for (const q of pack.questions) {
      assert.ok(q.analysis, q.id);
      assert.ok(q.type === "short_answer" ? q.expectedAnswer : q.answer?.length, q.id);
      for (const image of q.images || []) {
        const asset = pack.media[image.src];
        assert.ok(asset?.mimeType.startsWith("image/"), image.src);
        assert.deepEqual(Buffer.from(asset.base64, "base64"), fs.readFileSync(path.join(publicDir, image.src)));
      }
    }
  }
});

test("offline pack omits private and AI content and refuses unapproved image paths", () => {
  const certificate = certificates[0];
  const question = {
    id: "allowed", type: "single_choice", question: "题目", options: { A: "甲", B: "乙" },
    answer: ["A"], analysis: "解析", chapter: "测试", certificateScopes: { private: true },
  };
  const args = { certificate, publicDir, syllabus: null };
  const { bytes } = buildOfflinePack({ ...args, questions: [
    question, { ...question, id: "ai", source: "ai_generated" },
    { ...question, id: "submitted", source: "user_submitted" },
    { ...question, id: "owned", ownerUserId: "user-2" },
    { ...question, id: "group", aiGroupId: "ai-group" },
  ] });
  const pack = JSON.parse(bytes);
  assert.deepEqual(pack.questions.map((q) => q.id), ["allowed"]);
  assert.equal(Object.hasOwn(pack.questions[0], "certificateScopes"), false);
  for (const src of ["https://example.test/question.png", "/vet-images/../secret.png", "/question-images/missing.png"]) {
    assert.throws(() => buildOfflinePack({ ...args, questions: [{ ...question, images: [{ src }] }] }),
      { code: "OFFLINE_MEDIA_UNAVAILABLE" });
  }
});

test("offline API checks account certificate and validates the immutable download version", async (t) => {
  const parent = fs.realpathSync(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(parent, "aceexam-offline-pack-test-"));
  const store = createStore(dir);
  const app = await createApp({ store, withFrontend: false, accountSecurity: { enabled: false }, offlineNow: () => Date.parse("2026-11-07T00:05:00+08:00") });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    await app.locals.stop();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    store.db.close();
    assert.equal(path.dirname(fs.realpathSync(dir)), parent);
    assert.ok(path.basename(dir).startsWith("aceexam-offline-pack-test-"));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const first = store.register("offline_first", "fixture-password-123");
  const second = store.register("offline_second", "fixture-password-123");
  store.selectCertificate(first.id, "hcia-datacom");
  store.selectCertificate(second.id, "network-engineer");
  const firstToken = store.createAuthSession(first.id);
  const secondToken = store.createAuthSession(second.id);
  const base = "/api/offline/certificates/hcia-datacom";
  const req = (url, token, body) => fetch("http://127.0.0.1:" + server.address().port + url,
    { method: body ? "POST" : "GET", headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const initial = await req(base + "/manifest", firstToken);
  assert.equal(initial.status, 200);
  assert.match(initial.headers.get("cache-control"), /no-store/);
  const manifest = await initial.json();
  const download = base + "/packages/" + manifest.version;
  assert.equal((await req(base + "/manifest")).status, 401);
  assert.equal((await req(base + "/manifest", secondToken)).status, 404);
  assert.equal((await req(download, secondToken)).status, 404);
  const response = await req(download, firstToken);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(response.status, 200);
  assert.equal(manifest.sha256, sha256(bytes));
  assert.equal(manifest.bytes, bytes.length);
  const packQuestion = JSON.parse(bytes).questions.find((question) => question.type === "single_choice");
  const attemptsPath = base + "/attempts";
  const occurredAt = Date.parse("2026-11-06T23:59:59+08:00");
  const event = {
    id: crypto.randomUUID(), questionId: packQuestion.id, selected: packQuestion.answer,
    timeMs: 650, occurredAt, source: "practice", packVersion: manifest.version,
  };
  const attempt = async (token, value = event) => {
    const res = await req(attemptsPath, token, { attempts: [value] });
    return { status: res.status, data: await res.json() };
  };
  assert.equal((await attempt(secondToken)).status, 404);
  const accepted = await attempt(firstToken);
  assert.equal(accepted.status, 200);
  assert.equal(accepted.data.accepted[0].occurredAt, occurredAt);
  assert.equal(accepted.data.accepted[0].correct, true);
  assert.deepEqual(await attempt(firstToken), accepted);
  const changed = await attempt(firstToken, { ...event, occurredAt: occurredAt - 1000 });
  assert.equal(changed.data.rejected[0].code, "OFFLINE_ATTEMPT_CONFLICT");
  const otherDay = await (await req(attemptsPath + "?day=2026-11-07", firstToken)).json();
  const originalDay = await (await req(attemptsPath + "?day=2026-11-06", firstToken)).json();
  assert.equal(otherDay.attempts.length, 0);
  assert.equal(originalDay.attempts.length, 1);
  assert.equal(originalDay.attempts[0].serverId, accepted.data.accepted[0].serverId);
  assert.equal(store.allA(first.id).length, 1);
  const id = JSON.parse(bytes).questions[0].id;
  store.setQuestionVisibility(id, true, "offline pack test", first.id);
  assert.equal((await req(download, firstToken)).status, 409);
  const revised = await (await req(base + "/manifest", firstToken)).json();
  assert.notEqual(revised.version, manifest.version);
  assert.equal(revised.questionCount, manifest.questionCount - 1);
  const release = await (await req("/api/mobile/version?version=1.0.15")).json();
  assert.ok(release.backend.capabilities.includes("offline-packs-v1"));
});

test("Android refuses corrupt, truncated and cross-certificate package data", async () => {
  const certificate = certificates[0];
  const question = bundledQuestions().find((q) => hasCertificateQuestion(q, certificate.id));
  const { bytes, manifest } = buildOfflinePack({ certificate, questions: [question], publicDir });
  const raw = bytes.toString();
  const hash = async (text) => sha256(text);
  assert.throws(() => parseOfflineManifest(manifest, certificates[1].id), /重新下载/);
  assert.throws(() => parseOfflineManifest({ ...manifest, schemaVersion: 2 }, certificate.id), /重新下载/);
  await assert.rejects(decodeOfflinePack(manifest, raw.slice(0, -1), bytes.length - 1, hash), /重新下载/);
  await assert.rejects(decodeOfflinePack(manifest, raw.replace('"schemaVersion":1', '"schemaVersion":0'), bytes.length, hash), /重新下载/);
});
