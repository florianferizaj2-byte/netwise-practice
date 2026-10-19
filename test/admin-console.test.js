import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { createApp } from "../server/index.js";
import { createStore } from "../server/store.js";
import { certificates } from "../server/certificates.js";
import { reviewDigest } from "../server/content-quality/quality.js";
import { globMatch } from "../server/admin-console/index.js";
for (const key of Object.keys(process.env))
  if (/^(AI_SERVICE_|AUTHOR_|WECHAT_)/.test(key)) delete process.env[key];
Object.assign(process.env, {
  ALLOWED_HOSTS: "127.0.0.1",
  COOKIE_SECURE: "0",
  AI_MASTER_KEY: crypto.randomBytes(32).toString("base64"),
});

async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ace-console-test-"));
  let store = createStore(dir),
    app,
    server;
  const admin = store.register("console_test_admin", "fixture-password-123"),
    learner = store.register("console_test_learner", "fixture-password-123");
  store.db.prepare("UPDATE users SET is_admin=? WHERE id=?").run(1, admin.id);
  store.db.prepare("UPDATE users SET is_admin=? WHERE id=?").run(0, learner.id);
  store.selectCertificate(admin.id, "network-engineer");
  store.selectCertificate(learner.id, "network-engineer");
  const tokens = [admin, learner].map((u) => store.createAuthSession(u.id));
  const boot = async () => {
    app = await createApp({
      store,
      withFrontend: false,
      accountSecurity: { enabled: false },
      provider: {
        call: async () => {
          throw new Error("fixture upstream unavailable");
        },
        generateBankExpansion: async () => {
          throw new Error("fixture upstream unavailable");
        },
      },
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
  };
  await boot();
  const request = async (
    url,
    body,
    method = body === undefined ? "GET" : "POST",
    token = tokens[0],
  ) => {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api${url}`,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
    return {
      status: response.status,
      cache: response.headers.get("cache-control"),
      data: await response.json(),
    };
  };
  const close = async () => {
    await app.locals.stop();
    await new Promise((r) => server.close(r));
    store.db.close();
  };
  t.after(async () => {
    await close();
    assert.ok(path.basename(dir).startsWith("ace-console-test-"));
    assert.equal(path.dirname(dir), path.resolve(os.tmpdir()));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return {
    get store() {
      return store;
    },
    request,
    admin,
    learner,
    tokens,
    async restart() {
      await close();
      store = createStore(dir);
      await boot();
    },
  };
}
const prefix = "/admin/console";
const draft = () => ({
  kind: "batch",
  certificateId: "network-engineer",
  title: "Synthetic test draft",
  data: {
    batch: {
      schemaVersion: 1,
      runId: "fixture-console",
      certificateId: "network-engineer",
      createdAt: new Date().toISOString(),
      authorContext: "fixture-author",
      examVersion: "test-only",
      newCertificate: false,
      maxQuestions: 20,
      bank: {
        id: "fixture-console",
        source: "fixture_console",
        name: "Synthetic test only",
        category: "syllabus_practice",
      },
    },
    questions: [],
    sources: [],
    provenance: [],
    reviews: [],
    blueprint: null,
  },
});
async function waitJob(f, id) {
  for (let i = 0; i < 100; i++) {
    const r = await f.request(prefix + "/jobs/" + id);
    if (!["queued", "running"].includes(r.data.job.status)) return r.data.job;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error("fixture job did not settle");
}
test("console rejects guests and learners, paginates public questions, safely matches globs and excludes private data", async (t) => {
  const f = await fixture(t);
  for (const token of [null, f.tokens[1]])
    for (const route of [
      "/overview",
      "/questions",
      "/catalog",
      "/documents",
      "/jobs",
      "/usage",
      "/audit",
      "/system",
      "/config",
      "/teaching",
      "/users",
      "/announcement",
    ]) {
      const r = await f.request(prefix + route, undefined, "GET", token);
      assert.equal(r.status, token ? 403 : 401);
      assert.equal(r.data.rows, undefined);
    }
  const first = await f.request(
    prefix + "/questions?certificateId=network-engineer&limit=2",
  );
  assert.equal(first.status, 200);
  assert.equal(first.cache, "no-store");
  assert.equal(first.data.rows.length, 2);
  const second = await f.request(
    prefix + "/questions?certificateId=network-engineer&limit=2&offset=2",
  );
  assert.ok(
    second.data.rows.every((r) => !first.data.rows.some((p) => p.id === r.id)),
  );
  const q = first.data.rows[0];
  assert.ok(q.revision);
  assert.equal(q.ownerUserId, undefined);
  f.store.addQ({
    ...q,
    id: "console-private-fixture",
    question:
      "Private fixture content must not appear in the global administrator content catalogue.",
    source: "ai_generated",
    ownerUserId: f.learner.id,
    revision: undefined,
  });
  assert.equal(
    (await f.request(prefix + "/questions?search=console-private-fixture")).data
      .total,
    0,
  );
  assert.equal(
    (await f.request("/admin/questions?search=console-private-fixture")).data
      .total,
    0,
  );
  const found = await f.request(
    prefix +
      "/questions?search=" +
      encodeURIComponent(q.id.slice(0, -2) + "??"),
  );
  assert.ok(found.data.rows.some((r) => r.id === q.id));
  assert.equal(
    (
      await f.request(
        prefix + "/questions?search=" + encodeURIComponent("[.*]+$"),
      )
    ).status,
    200,
  );
  assert.equal(
    (await f.request(prefix + "/questions?limit=10000")).status,
    400,
  );
  assert.ok(globMatch("abc-def", "*b?-d?f*"));
  assert.equal(globMatch("abc-def", "*z?"), false);
  for (const route of [
    "/overview?days=7",
    "/overview?days=30",
    "/catalog",
    "/usage",
    "/audit",
    "/system",
    "/teaching",
  ]) {
    const r = await f.request(prefix + route);
    assert.equal(r.status, 200, route + ":" + JSON.stringify(r.data));
    assert.doesNotMatch(
      JSON.stringify(r.data),
      /keyCipher|password_hash|fixture-password/,
    );
  }
});
test("visibility previews are versioned and idempotent, retain attempts and exams, survive restart and restore safely", async (t) => {
  const f = await fixture(t),
    q = (
      await f.request(
        prefix + "/questions?certificateId=network-engineer&limit=1",
      )
    ).data.rows[0];
  f.store.recordAttempt(q.id, q.answer, 1000, "practice", f.learner.id);
  f.store.saveSession({
    id: "console-existing-exam",
    userId: f.learner.id,
    certificateId: "network-engineer",
    questionIds: [q.id],
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    answers: {},
    submitted: false,
  });
  const body = {
    items: [{ id: q.id, revision: q.revision }],
    hidden: true,
    reason: "Synthetic visibility test",
  };
  const p = await f.request(prefix + "/visibility/preview", body);
  assert.equal(p.status, 200);
  assert.equal(p.data.count, 1);
  const mutation = {
    ...body,
    preview: p.data.preview,
    requestId: crypto.randomUUID(),
  };
  const saved = await f.request(prefix + "/visibility", mutation);
  assert.equal(saved.status, 200);
  assert.equal(
    (await f.request(prefix + "/visibility", mutation)).status,
    200,
    "lost acknowledgement reuses the committed mutation",
  );
  assert.ok(f.store.getQ(q.id));
  assert.equal(f.store.allA(f.learner.id).length, 1);
  assert.ok(f.store.session("console-existing-exam"));
  assert.equal(
    f.store.allQ().some((r) => r.id === q.id),
    false,
  );
  assert.equal(
    (await f.request(prefix + "/visibility/preview", body)).status,
    409,
  );
  const current = (await f.request(prefix + "/questions/" + q.id)).data
    .question;
  assert.equal(current.hidden, true);
  await f.restart();
  assert.ok(f.store.getQ(q.id));
  assert.equal(f.store.allA(f.learner.id).length, 1);
  assert.equal(
    f.store.allQ().some((r) => r.id === q.id),
    false,
  );
  const r = await f.request(
    "/exams/console-existing-exam",
    undefined,
    "GET",
    f.tokens[1],
  );
  assert.equal(r.status, 200);
  assert.equal(r.data.questions[0].id, q.id);
  const restored = {
    items: [{ id: q.id, revision: current.revision }],
    hidden: false,
    reason: "Synthetic restore test",
  };
  const preview = await f.request(prefix + "/visibility/preview", restored);
  assert.equal(preview.status, 200);
  assert.equal(
    (
      await f.request(prefix + "/visibility", {
        ...restored,
        preview: preview.data.preview,
        requestId: crypto.randomUUID(),
      })
    ).status,
    200,
  );
  assert.ok(f.store.allQ().some((r) => r.id === q.id));
  assert.equal(f.store.allA(f.learner.id).length, 1);
});
test("drafts persist with conflict checks; missing review blocks publishing and checks survive navigation", async (t) => {
  const f = await fixture(t),
    input = draft();
  const created = await f.request(prefix + "/documents", input);
  assert.equal(created.status, 200);
  const d = created.data.document;
  const saved = await f.request(
    prefix + "/documents/" + d.id,
    { ...input, revision: d.revision, title: "Updated fixture" },
    "PUT",
  );
  assert.equal(saved.status, 200);
  assert.equal(
    (
      await f.request(
        prefix + "/documents/" + d.id,
        { ...input, revision: d.revision },
        "PUT",
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await f.request(prefix + "/documents/" + d.id + "/export", {
        revision: saved.data.document.revision,
      })
    ).status,
    409,
  );
  const queued = await f.request(prefix + "/documents/" + d.id + "/check", {
    revision: saved.data.document.revision,
    requestId: crypto.randomUUID(),
  });
  assert.equal(queued.status, 200);
  const job = await waitJob(f, queued.data.job.id);
  assert.equal(job.status, "completed");
  assert.equal(job.result.ok, false);
  assert.ok(job.result.errors.length);
  await f.restart();
  assert.equal(
    (await f.request(prefix + "/documents/" + d.id)).data.document.title,
    "Updated fixture",
  );
  assert.equal(
    (await f.request(prefix + "/jobs/" + job.id)).data.job.result.ok,
    false,
  );
  const q = (
    await f.request(
      prefix + "/questions?certificateId=network-engineer&limit=1",
    )
  ).data.rows[0];
  const revised = await f.request(prefix + "/questions/" + q.id + "/draft", {
    certificateId: "network-engineer",
    revision: q.revision,
  });
  assert.equal(revised.status, 200);
  assert.notEqual(revised.data.document.data.questions[0].id, q.id);
  assert.equal(f.store.getQ(q.id).question, q.question);
});
test("reviewed fixture exports the existing pipeline format, stale answers and fake self-review fail closed", async (t) => {
  const f = await fixture(t),
    input = draft(),
    c = certificates.find((c) => c.id === "network-engineer"),
    m = c.taxonomy.modules[0],
    s = m.sections[0],
    p = s.knowledgePoints[0];
  const q = {
    id: "console-synthetic-validation-example",
    type: "single_choice",
    question:
      "仅用于隔离功能测试：管理操作完成时，应如何保证业务结果与审计能够对应？",
    options: {
      A: "同时保存可核对的操作对象及实际结果",
      B: "仅修改页面中的显示数字",
      C: "忽略所有实际处理结果",
      D: "用静态截图代替持久化记录",
    },
    answer: ["A"],
    analysis:
      "这是后台接口的合成验证样本，答案用于测试结构化审核与导出逻辑，并非真实考试内容或真实来源证据。",
    chapter: m.name,
    knowledgeSection: s.name,
    knowledgePoint: p.name,
    difficulty: "easy",
    tags: ["synthetic-test-only"],
  };
  input.data.batch.examVersion = c.syllabus?.version || "test-only";
  input.data.questions = [q];
  input.data.sources = [
    {
      id: "synthetic",
      title: "Synthetic fixture, not real official evidence",
      url: "https://example.invalid/console-test",
      authority: "official",
      access: "opened",
      checkedAt: new Date().toISOString().slice(0, 10),
      examVersion: input.data.batch.examVersion,
      claims: [
        {
          kind: "scope",
          summary: "Synthetic local test scope, not real evidence",
          locator: "test fixture",
        },
      ],
    },
  ];
  input.data.provenance = [
    {
      questionId: q.id,
      sourceIds: ["synthetic"],
      locator: "synthetic fixture",
      category: "syllabus_practice",
      reuse: "original",
      reuseBasis:
        "Synthetic question exclusively for isolated local automated tests",
    },
  ];
  input.data.reviews = [
    {
      questionId: q.id,
      digest: reviewDigest(q, input.data.provenance[0], input.data.sources, c),
      reviewerContext: "synthetic-independent-review-fixture",
      verdict: "pass",
      independentAnswer: ["A"],
      blindReasoning:
        "Synthetic automated fixture reasoning, never submitted as real independent review or official evidence.",
      checks: {
        scope: true,
        answer: true,
        analysis: true,
        distractors: true,
        wording: true,
        source: true,
        classification: true,
      },
      calculation: {
        applicable: false,
        method: "Synthetic conceptual test with no calculation",
        result: "not-applicable",
        passed: true,
      },
      duplicates: [],
    },
  ];
  const created = await f.request(prefix + "/documents", input),
    d = created.data.document;
  const exported = await f.request(prefix + "/documents/" + d.id + "/export", {
    revision: d.revision,
  });
  assert.equal(exported.status, 200, JSON.stringify(exported.data));
  assert.equal(exported.data.activeBankWritten, false);
  assert.equal(exported.data.files["questions.json"][0].id, q.id);
  assert.equal(
    exported.data.files["manifest-bank.json"].path,
    "questions/curated/fixture-console.json",
  );
  assert.equal(f.store.getQ(q.id), null);
  // Consume the exported file with an isolated copy of the actual loader;
  // never add a synthetic question or claimed source to the real bank.
  const parent = path.resolve("tmp");
  fs.mkdirSync(parent, { recursive: true });
  const isolated = fs.mkdtempSync(path.join(parent, "console-loader-"));
  try {
    const bankRoot = path.join(isolated, "server/question-banks");
    fs.mkdirSync(bankRoot, { recursive: true });
    for (const file of ["loader.js", "taxonomy.js", "scopes.js"])
      fs.copyFileSync(
        path.join("server/question-banks", file),
        path.join(bankRoot, file),
      );
    fs.copyFileSync(
      "server/domain.js",
      path.join(isolated, "server/domain.js"),
    );
    const certRoot = path.join(bankRoot, c.id),
      bank = exported.data.files["manifest-bank.json"];
    fs.mkdirSync(path.dirname(path.join(certRoot, bank.path)), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(certRoot, "manifest.json"),
      JSON.stringify({
        schemaVersion: 1,
        certificate: {
          id: c.id,
          name: "Synthetic test certificate",
          shortName: "Synthetic",
          description: "Isolated automated fixture, not a real published bank",
        },
        banks: [bank],
        taxonomy: c.taxonomy,
      }),
    );
    fs.writeFileSync(
      path.join(certRoot, bank.path),
      JSON.stringify(exported.data.files["questions.json"]),
    );
    const loader = await import(
      pathToFileURL(path.join(bankRoot, "loader.js")).href
    );
    assert.equal(loader.bundledQuestions().length, 1);
    assert.equal(loader.bundledQuestions()[0].id, q.id);
    const packetFile = path.join(isolated, "export.json"),
      handoff = path.join(isolated, "handoff");
    fs.writeFileSync(packetFile, JSON.stringify(exported.data));
    const unpack = spawnSync(
      process.execPath,
      [
        "scripts/unpack-admin-content.mjs",
        "--file",
        packetFile,
        "--out",
        handoff,
      ],
      { encoding: "utf8", windowsHide: true },
    );
    assert.equal(unpack.status, 0, unpack.stderr + unpack.stdout);
    const checked = spawnSync(
      process.execPath,
      [
        ".agents/skills/kaojiang-content-pipeline/scripts/pipeline.mjs",
        "check",
        "--batch",
        handoff,
      ],
      { encoding: "utf8", windowsHide: true },
    );
    assert.equal(checked.status, 0, checked.stderr + checked.stdout);
    assert.equal(
      JSON.parse(
        fs.readFileSync(path.join(handoff, "quality-report.json"), "utf8"),
      ).ok,
      true,
    );
  } finally {
    assert.equal(path.dirname(isolated), parent);
    assert.ok(path.basename(isolated).startsWith("console-loader-"));
    fs.rmSync(isolated, { recursive: true, force: true });
  }
  for (const mutate of [
    (i) => (i.data.questions[0].answer = ["B"]),
    (i) => (i.data.reviews[0].reviewerContext = i.data.batch.authorContext),
  ]) {
    const next = structuredClone(input);
    mutate(next);
    const r = await f.request(prefix + "/documents", next);
    assert.equal(r.status, 200);
    assert.equal(
      (
        await f.request(
          prefix + "/documents/" + r.data.document.id + "/export",
          { revision: r.data.document.revision },
        )
      ).status,
      409,
    );
  }
});
test("AI configuration is encrypted, versioned and never returns a saved key", async (t) => {
  const f = await fixture(t),
    before = (await f.request(prefix + "/config")).data;
  const body = {
    revision: before.saved.revision,
    baseUrl: "https://example.invalid/v1",
    model: "fixture-model",
    temperature: 0.3,
    apiKey: "sk-fixture-not-a-real-key",
  };
  const changed = await f.request(prefix + "/config", body, "PUT");
  assert.equal(changed.status, 200);
  assert.equal(changed.data.saved.hasKey, true);
  assert.doesNotMatch(JSON.stringify(changed.data), /sk-fixture|keyCipher/);
  assert.equal((await f.request(prefix + "/config", body, "PUT")).status, 409);
  assert.equal(
    (
      await f.request(
        prefix + "/config/key",
        { revision: before.saved.revision },
        "DELETE",
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await f.request(
        prefix + "/config/key",
        { revision: changed.data.saved.revision },
        "DELETE",
      )
    ).data.saved.hasKey,
    false,
  );
});
test("usage distinguishes unknown prices and errors, feedback updates are audited and versioned, generation failure remains a task", async (t) => {
  const f = await fixture(t);
  f.store.saveUsage(
    {
      success: true,
      model: "fixture-model",
      hasUsage: true,
      total_tokens: 300,
      prompt_tokens: 200,
      completion_tokens: 100,
      estimatedCostCny: 0.025,
    },
    f.admin.id,
  );
  f.store.saveUsage(
    { success: false, model: "fixture-model", hasUsage: false },
    f.admin.id,
  );
  const usage = (await f.request(prefix + "/usage")).data;
  assert.equal(usage.summary.calls, 2);
  assert.equal(usage.summary.knownCostCny, 0.025);
  assert.equal(usage.summary.unknownCost, 1);
  assert.equal(usage.summary.unknownUsage, 1);
  const q = (
    await f.request(
      prefix + "/questions?certificateId=network-engineer&limit=1",
    )
  ).data.rows[0];
  f.store.db
    .prepare("INSERT OR REPLACE INTO question_feedback VALUES (?,?,?,?,?)")
    .run(
      f.learner.id,
      q.id,
      "answer_error",
      "fixture feedback",
      new Date().toISOString(),
    );
  const feedback = (await f.request(prefix + "/feedback")).data.rows.find(
    (r) => r.questionId === q.id,
  );
  assert.ok(feedback);
  const body = {
    userId: feedback.userId,
    questionId: q.id,
    revision: feedback.revision,
    status: "resolved",
    note: "Synthetic resolution note",
    documentId: null,
  };
  assert.equal(
    (await f.request(prefix + "/feedback", body, "PUT")).status,
    200,
  );
  assert.equal(
    (await f.request(prefix + "/feedback", body, "PUT")).status,
    409,
  );
  assert.equal(
    (await f.request(prefix + "/feedback?status=resolved")).data.total,
    1,
  );
  const c = certificates.find((c) => c.id === "network-engineer"),
    m = c.taxonomy.modules[0],
    s = m.sections[0];
  const generated = await f.request(prefix + "/generation", {
    requestId: crypto.randomUUID(),
    certificateId: c.id,
    chapter: m.name,
    knowledgeSection: s.name,
    knowledgePoint: s.knowledgePoints[0].name,
    count: 1,
  });
  assert.equal(generated.status, 200);
  const job = await waitJob(f, generated.data.job.id);
  assert.equal(job.status, "failed");
  assert.ok(job.error);
  assert.ok(
    f.store
      .auditRows(200)
      .some((r) => r.action === "console_feedback_resolved"),
  );
});
