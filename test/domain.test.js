import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {
  ipv4,
  validateQuestion,
  calculateMastery,
  chooseDifficulty,
  nextReview,
} from "../server/domain.js";
import {
  encrypt,
  decrypt,
  redact,
  validateBaseUrl,
} from "../server/security.js";
import { createStore } from "../server/store.js";
import { bundledQuestions } from "../server/question-banks/loader.js";

test("IPv4 handles unsigned range, /0, /31 and /32", () => {
  assert.deepEqual(ipv4("192.168.10.75", 26), {
    network: "192.168.10.64",
    broadcast: "192.168.10.127",
    first: "192.168.10.65",
    last: "192.168.10.126",
    hosts: 62,
    size: 64,
  });
  assert.equal(ipv4("255.255.255.254", 31).last, "255.255.255.255");
  assert.equal(ipv4("10.0.0.1", 32).hosts, 1);
  assert.equal(ipv4("10.0.0.1", 0).broadcast, "255.255.255.255");
  assert.throws(() => ipv4("300.0.0.1", 24));
  assert.throws(() => ipv4("1.2.3.4", 33));
});
test("schema rejects malformed, duplicate, unrelated and numerically incorrect questions", () => {
  const q = bundledQuestions().find((q) => q.id === "subnet-1");
  const { id, source, sourceLabel, ...raw } = q;
  assert.equal(validateQuestion(raw).question, q.question);
  assert.throws(() => validateQuestion({ ...raw, answer: ["A"] }), /程序计算/);
  assert.throws(() => validateQuestion({ ...raw, answer: ["A", "D"] }));
  assert.throws(() =>
    validateQuestion({ ...raw, options: { ...raw.options, B: raw.options.A } }),
  );
  assert.throws(() => validateQuestion(raw, [raw]), /重复/);
  assert.throws(() => validateQuestion(raw, [], { chapter: "OSPF" }), /偏离/);
  assert.throws(
    () =>
      validateQuestion({
        ...raw,
        question: "如下图所示，这个网络的网络地址是什么？",
      }),
    /完整/,
  );
  for (const {
    id,
    source,
    sourceLabel,
    provenance,
    sourceVerification,
    ...q
  } of bundledQuestions().filter((q) => q.source === "practice"))
    validateQuestion(q);
});
test("mastery needs repeated evidence and decays; difficulty respects thresholds", () => {
  const now = Date.now(),
    a = {
      correct: true,
      timeMs: 10000,
      createdAt: new Date(now).toISOString(),
    };
  assert.equal(calculateMastery([a], now).masteryScore, 10);
  assert.equal(calculateMastery(Array(10).fill(a), now).masteryScore, 100);
  assert.equal(
    calculateMastery(Array(10).fill(a), now + 47 * 86400000).masteryScore,
    80,
  );
  const m = calculateMastery(
    [a, { ...a, correct: false }, { ...a, correct: false }],
    now,
  );
  assert.equal(m.consecutiveWrong, 2);
  assert.equal(m.consecutiveCorrect, 0);
  assert.equal(m.averageTime, 10000);
  assert.equal(chooseDifficulty({ accuracy: 0.4 }), "easy");
  assert.equal(chooseDifficulty({ accuracy: 0.6 }, 1), "medium");
  assert.equal(chooseDifficulty({ accuracy: 0.8 }, 1), "hard");
  assert.equal(chooseDifficulty({ accuracy: 0.95 }), "hard");
});
test("review intervals increase and reset on errors", () => {
  const now = Date.now();
  let r = nextReview(null, false, now);
  assert.equal(new Date(r.dueAt) - now, 86400000);
  for (const days of [3, 7, 14, 30, 30]) {
    r = nextReview(r, true, now);
    assert.equal(new Date(r.dueAt) - now, days * 86400000);
  }
  assert.equal(nextReview(r, false, now).step, 0);
});
test("AES-GCM hides keys and detects tampering; redaction and URL checks", () => {
  process.env.AI_MASTER_KEY = crypto.randomBytes(32).toString("base64");
  const key = "custom-private-api-123";
  const encrypted = encrypt(key);
  assert.ok(!encrypted.includes(key));
  assert.equal(decrypt(encrypted), key);
  const parts = encrypted.split(".");
  parts[2] = Buffer.from("tampered").toString("base64");
  assert.throws(() => decrypt(parts.join(".")));
  assert.equal(
    redact({ Authorization: "Bearer abc", apiKey: key, message: key }, [key])
      .message,
    "[REDACTED]",
  );
  assert.ok(!redact("Bearer abc sk-secret123").includes("secret123"));
  assert.equal(
    validateBaseUrl("http://localhost:11434/v1/"),
    "http://localhost:11434/v1",
  );
  assert.throws(() => validateBaseUrl("http://example.com/v1"));
  assert.throws(() => validateBaseUrl("https://u:p@example.com/v1"));
  assert.throws(() => validateBaseUrl("https://example.com/v1?key=abc"));
});
test("store persists attempts, errors, mastery, queues and spaced reviews", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "netwise-store-"));
  const store = createStore(dir);
  const q = store.allQ()[0];
  store.recordAttempt(q.id, ["A"], 25000);
  assert.equal(store.wrongQuestions()[0].wrongCount, 1);
  assert.equal(
    store.mastery().find((m) => m.knowledgePoint === q.knowledgePoint)
      .wrongCount,
    1,
  );
  store.recordAttempt(q.id, q.answer, 12000);
  assert.equal(store.wrongQuestions()[0].review.step, 1);
  assert.equal(store.allA().length, 2);
  store.db.close();
  const reopened = createStore(dir);
  assert.equal(reopened.allA().length, 2);
  reopened.db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
