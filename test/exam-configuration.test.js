import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/index.js";
import { createStore } from "../server/store.js";
import { examPointId } from "../server/exam-selection.js";
import {
  hasCertificateQuestion,
  questionForCertificate,
} from "../server/certificates.js";

test("real exam API validates leaf selection, timing, retry identity, privacy, scope, scoring and legacy clients", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aceexam-exam-config-")),
    store = createStore(dir);
  const user = store.register("exam_fixture", "fixture-password-123"),
    other = store.register("other_fixture", "fixture-password-123");
  store.selectCertificate(user.id, "sichuan-upgrading-computer");
  store.selectCertificate(other.id, "sichuan-upgrading-computer");
  const token = store.createAuthSession(user.id),
    otherToken = store.createAuthSession(other.id);
  const app = await createApp({
      store,
      withFrontend: false,
      accountSecurity: { enabled: false },
    }),
    server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    await app.locals.stop();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    store.db.close();
    assert.equal(path.dirname(dir), os.tmpdir());
    assert.ok(path.basename(dir).startsWith("aceexam-exam-config-"));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const request = async (
    url,
    body,
    auth = token,
    method = body ? "POST" : "GET",
  ) => {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api${url}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${auth}`,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    return { status: response.status, data: await response.json() };
  };
  const catalog = (await request("/exams/catalog")).data;
  const points = catalog.chapters
    .flatMap((row) => row.knowledgePoints)
    .filter((point) => point.types.single_choice >= 5)
    .slice(0, 2);
  assert.equal(points.length, 2);
  const settings = {
    requestId: crypto.randomUUID(),
    name: "知识点测验",
    count: 10,
    durationMinutes: 45,
    types: ["single_choice"],
    knowledgePointIds: points.map((p) => p.id),
  };
  const created = await request("/exams", settings);
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const exam = created.data;
  assert.equal(exam.name, settings.name);
  assert.equal(exam.durationMs, 45 * 60000);
  assert.equal(
    Date.parse(exam.expiresAt) - Date.parse(exam.createdAt),
    45 * 60000,
  );
  assert.equal(exam.questions.length, 10);
  assert.equal(new Set(exam.questionIds).size, 10);
  assert.equal(exam.creationFingerprint, undefined);
  for (const row of exam.questions) {
    assert.equal(row.type, "single_choice");
    assert.equal(row.answer, undefined);
    assert.equal(row.analysis, undefined);
    assert.ok(
      settings.knowledgePointIds.includes(
        examPointId("sichuan-upgrading-computer", row),
      ),
    );
  }
  assert.equal((await request("/exams", settings)).data.id, exam.id);
  assert.equal(
    store.examSessions(user.id, "sichuan-upgrading-computer").length,
    1,
  );
  assert.equal(
    (await request("/exams", { ...settings, name: "不同配置" })).status,
    409,
  );
  assert.equal(
    (
      await request("/exams", {
        ...settings,
        requestId: crypto.randomUUID(),
        durationMinutes: 0,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/exams", {
        ...settings,
        requestId: crypto.randomUUID(),
        types: [],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/exams", {
        ...settings,
        requestId: crypto.randomUUID(),
        knowledgePointIds: ["kp-" + "0".repeat(24)],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/exams", {
        ...settings,
        requestId: crypto.randomUUID(),
        chapters: [catalog.chapters[0].name],
      })
    ).status,
    400,
  );
  assert.equal(
    (await request(`/exams/${exam.id}`, undefined, otherToken)).status,
    404,
  );
  const attemptsBefore = store.allA(user.id).length,
    answers = Object.fromEntries(
      exam.questionIds.map((id) => [id, store.getQ(id).answer]),
    );
  const saved = await request(
    `/exams/${exam.id}/answers`,
    { answers, expectedVersion: 0 },
    token,
    "PUT",
  );
  assert.equal(saved.status, 200);
  assert.equal(
    (
      await request(
        `/exams/${exam.id}/answers`,
        { answers, expectedVersion: 0 },
        token,
        "PUT",
      )
    ).status,
    409,
  );
  const graded = await request(`/exams/${exam.id}/submit`, {
    answers,
    expectedVersion: 1,
  });
  assert.equal(graded.status, 200);
  assert.equal(graded.data.score, 100);
  for (const row of graded.data.results)
    assert.equal(
      row.chapter,
      questionForCertificate(
        store.getQ(row.questionId),
        "sichuan-upgrading-computer",
      ).chapter,
    );
  await request(`/exams/${exam.id}/submit`, { answers, expectedVersion: 1 });
  assert.equal(store.allA(user.id).length, attemptsBefore + 10);
  assert.equal((await request("/exams")).data.sessions[0].name, settings.name);
  assert.equal((await request("/exams", settings)).data.submitted, true);
  const legacy = await request("/exams", {
    count: 5,
    chapters: [catalog.chapters[0].name],
  });
  assert.equal(legacy.status, 200);
  assert.ok(legacy.data.questions.length > 0);
  const query = await request(
    "/auth/certificate",
    { certificateId: "network-engineer" },
    token,
    "PUT",
  );
  assert.equal(query.status, 200);
  assert.equal((await request(`/exams/${exam.id}`)).status, 404);
  assert.equal(
    (await request("/exams", { ...settings, requestId: crypto.randomUUID() }))
      .status,
    400,
  );
  await request(
    "/auth/certificate",
    { certificateId: "veterinary-practitioner" },
    token,
    "PUT",
  );
  assert.equal(
    (await request("/exams", { count: 400, durationMinutes: 30 })).status,
    400,
  );
  assert.equal(
    (await request("/exams", { count: 400, types: ["single_choice"] })).status,
    400,
  );
  const vet = await request("/exams", { count: 400 });
  assert.equal(vet.status, 200);
  assert.equal(vet.data.questionIds.length, 400);
  assert.deepEqual(
    Object.values(vet.data.distribution).sort((a, b) => a - b),
    [100, 100, 100, 100],
  );
  const vetRows = store
    .allQ()
    .filter((q) => hasCertificateQuestion(q, "veterinary-practitioner"));
  for (const row of vet.data.questions.filter((q) => q.sharedGroupId))
    assert.deepEqual(
      vetRows
        .filter((q) => q.sharedGroupId === row.sharedGroupId)
        .map((q) => q.id)
        .sort(),
      vet.data.questions
        .filter((q) => q.sharedGroupId === row.sharedGroupId)
        .map((q) => q.id)
        .sort(),
    );
});
