import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  assertBuildProvenance,
  assertRuntimePath,
  fingerprint,
  runtimeArtifacts,
  runtimeSources,
} from "./release-runtime.mjs";

// This rehearsal is deliberately not an archive or an alternative release gate.
// It copies the working candidate into a throwaway directory, outside the repo.
async function worker(stage) {
  const assert = (await import("node:assert/strict")).default;
  const fs = (await import("node:fs")).default;
  const path = (await import("node:path")).default;
  const crypto = (await import("node:crypto")).default;
  const { pathToFileURL } = await import("node:url");
  const baseDirectory = process.env.REHEARSAL_ROOT;
  const fixtureFile = path.join(baseDirectory, "fixture.json");
  const fixture = fs.existsSync(fixtureFile)
    ? JSON.parse(fs.readFileSync(fixtureFile, "utf8"))
    : {};
  const load = (name) =>
    import(pathToFileURL(path.join(process.cwd(), "server", name)).href);
  const { createStore } = await load("store.js");
  const { createApp } = await load("index.js");
  const { OpenAICompatibleProvider } = await load("ai.js");
  const details = {};
  let modelCalls = 0,
    server,
    app;
  const store = createStore(process.env.DATA_DIR);
  const originalFetch = globalThis.fetch;
  let origin;
  // Both default fetch and the provider are guarded, even if a future code path
  // mistakenly tries to resolve an inherited AI service setting.
  globalThis.fetch = (url, options) => {
    assert.equal(
      new URL(url).origin,
      origin,
      "Rehearsal forbids external HTTP requests",
    );
    return originalFetch(url, options);
  };
  const request = async (url, body, method, token = fixture.token) => {
    const response = await fetch(origin + "/api" + url, {
      method: method || (body ? "POST" : "GET"),
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
    });
    const result = await response.json();
    assert.equal(
      response.status,
      200,
      `${method || "GET"} ${url}: ${JSON.stringify(result)}`,
    );
    return result;
  };
  const publicQuestions = (questions) => {
    assert(questions.length);
    for (const q of questions) {
      assert(
        !Object.hasOwn(q, "answer"),
        "Unanswered paper must not include keys",
      );
      assert(!Object.hasOwn(q, "analysis"));
    }
  };
  try {
    app = await createApp({
      store,
      production: true,
      withFrontend: stage === "upgrade",
      accountSecurity: { enabled: false },
      provider: new OpenAICompatibleProvider(store, {
        fetch: async () => {
          modelCalls++;
          throw new Error("Rehearsal forbids model requests");
        },
      }),
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
    if (stage === "seed") {
      const password = "rehearsal-fixture-password-123";
      const owner = await store.registerAsync("rehearsal-owner", password);
      const user = await store.registerAsync("rehearsal-learner", password);
      const other = await store.registerAsync("rehearsal-other", password);
      for (const account of [user, other])
        store.selectCertificate(account.id, "network-engineer");
      Object.assign(fixture, {
        password,
        userId: user.id,
        ownerId: owner.id,
        otherId: other.id,
        token: store.createAuthSession(user.id),
        otherToken: store.createAuthSession(other.id),
      });
      const questions = store
        .allQ()
        .filter(
          (q) =>
            q.certificates?.includes("network-engineer") &&
            q.type === "single_choice",
        );
      assert(questions.length >= 2);
      const wrong = questions[0],
        correct = questions[1];
      const wrongAnswer = Object.keys(wrong.options).find(
        (letter) => !wrong.answer.includes(letter),
      );
      store.recordAttempt(wrong.id, [wrongAnswer], 1200, "practice", user.id);
      store.recordAttempt(
        correct.id,
        correct.answer,
        1600,
        "practice",
        user.id,
      );
      store.setQuestionFavorite(user.id, wrong.id, true);
      store.saveAccountEntitlement(user.id, {
        plan: "svip",
        expiresAt: new Date(Date.now() + 86400000 * 10).toISOString(),
      });
      const exam = await request("/exams", { count: 5 });
      publicQuestions(exam.questions);
      const first = store.getQ(exam.questionIds[0]);
      const answers = { [first.id]: first.answer };
      await request(
        `/exams/${exam.id}/answers`,
        { answers, expectedVersion: 0 },
        "PUT",
      );
      Object.assign(fixture, {
        wrongId: wrong.id,
        examId: exam.id,
        answers,
        attemptIds: store
          .allA(user.id)
          .map((a) => a.id)
          .sort(),
        entitlement: store.accountEntitlement(user.id),
        uploadPath: path.relative(
          process.env.DATA_DIR,
          path.join(store.communityUploadDir, "rehearsal.txt"),
        ),
      });
      fs.writeFileSync(
        path.join(process.env.DATA_DIR, fixture.uploadPath),
        "isolated upload fixture",
      );
      fs.writeFileSync(fixtureFile, JSON.stringify(fixture));
    } else {
      const me = await request("/auth/me");
      assert(me.authenticated);
      assert.equal(me.user.id, fixture.userId);
      assert.equal(me.user.isAdmin, false);
      assert.equal(store.userById(fixture.ownerId).isAdmin, true);
      assert.equal(
        (await store.authenticateAsync("rehearsal-learner", fixture.password))
          .id,
        fixture.userId,
      );
      assert.equal(
        fs.readFileSync(
          path.join(process.env.DATA_DIR, fixture.uploadPath),
          "utf8",
        ),
        "isolated upload fixture",
      );
      assert.deepEqual(
        store
          .allA(fixture.userId)
          .filter((a) => fixture.attemptIds.includes(a.id))
          .map((a) => a.id)
          .sort(),
        fixture.attemptIds,
      );
      assert((await request("/wrong")).some((q) => q.id === fixture.wrongId));
      assert(
        (await request("/favorites")).some((q) => q.id === fixture.wrongId),
      );
      const membership = await request("/account/entitlements");
      assert.equal(membership.plan, fixture.entitlement.plan);
      assert.equal(membership.expiresAt, fixture.entitlement.expiresAt);
      const exam = await request(`/exams/${fixture.examId}`);
      assert.deepEqual(exam.answers, fixture.answers);
      assert.equal(exam.answersVersion, 1);
      publicQuestions(exam.questions);
      assert.deepEqual(
        await request("/favorites", null, null, fixture.otherToken),
        [],
      );
      const denied = await fetch(origin + `/api/exams/${fixture.examId}`, {
        headers: { Authorization: `Bearer ${fixture.otherToken}` },
      });
      assert.equal(denied.status, 404);
      if (["upgrade", "restart"].includes(stage)) {
        const expected = [
          "network-engineer",
          "hcia-datacom",
          "ncre-ms-office",
          "veterinary-practitioner",
          "sichuan-upgrading-computer",
          "ncre-l2-c-programming",
        ].sort();
        assert.deepEqual(me.certificates.map((c) => c.id).sort(), expected);
        const { catalogue } = await load("demo-tutor/registry.js");
        assert.equal(catalogue().coverage.ready, 39);
        const catalogueResponse = await request("/tutor/v1/catalog");
        assert(catalogueResponse.supported);
        const ready = catalogueResponse.nodes.filter(
          (n) => n.status === "ready",
        );
        assert.equal(ready.length, 39);
        if (stage === "upgrade") {
          const started = await request("/tutor/v1/sessions", {
            courseId: ready[0].courseId,
            foundation: "beginner",
            requestId: crypto.randomUUID(),
          });
          const advanced = await request(
            `/tutor/v1/sessions/${started.session.id}/actions`,
            {
              requestId: crypto.randomUUID(),
              revision: started.session.revision,
              action: "next",
            },
          );
          assert(advanced.session.revision > started.session.revision);
          assert(!JSON.stringify(advanced.session).includes('"answer":'));
          fixture.tutorId = advanced.session.id;
          fixture.tutorRevision = advanced.session.revision;
          const preferences = await request("/web-preferences");
          await request(
            "/web-preferences",
            {
              requestId: crypto.randomUUID(),
              version: preferences.version,
              certificateId: "network-engineer",
              values: {
                theme: "dark",
                textSize: "large",
                reducedMotion: true,
                defaultCount: 20,
                reminderEnabled: true,
                reminderTime: "00:00",
                reminderTimeZone: "UTC",
              },
            },
            "PUT",
          );
          const reminder = await request("/study-reminders/check", {
            requestId: crypto.randomUUID(),
            version: preferences.version + 1,
          });
          assert(reminder.notice);
          fixture.reminder = reminder.notice;
          const plan = await request("/learning-plan", {
            requestId: crypto.randomUUID(),
            expectedPlanId: null,
            revision: 0,
            startDate: new Date(Date.now() + 8 * 3600000)
              .toISOString()
              .slice(0, 10),
            weeks: 1,
            dailyCount: 10,
          });
          fixture.planId = plan.id;
          await request(
            "/auth/certificate",
            { certificateId: "ncre-l2-c-programming" },
            "PUT",
          );
          const cExam = await request("/exams", {
            count: 5,
            durationMinutes: 30,
            types: ["single_choice"],
            requestId: crypto.randomUUID(),
          });
          publicQuestions(cExam.questions);
          assert.equal(cExam.questions.length, 5);
          const cQuestion = store.getQ(cExam.questionIds[0]);
          const attempt = await request("/attempts", {
            questionId: cQuestion.id,
            selected: cQuestion.answer,
            timeMs: 1000,
          });
          assert.equal(attempt.correct, true);
          fixture.cAttemptId = attempt.id;
          await request(
            "/auth/certificate",
            { certificateId: "network-engineer" },
            "PUT",
          );
          for (const certificateId of expected) {
            await request("/auth/certificate", { certificateId }, "PUT");
            const catalog = await request("/exams/catalog");
            assert(catalog.chapters.length, certificateId);
            assert(!JSON.stringify(catalog).includes('"answer":'));
          }
          await request(
            "/auth/certificate",
            { certificateId: "network-engineer" },
            "PUT",
          );
          fs.writeFileSync(fixtureFile, JSON.stringify(fixture));
          const assets = JSON.parse(
            fs.readFileSync(
              path.join(baseDirectory, "artifact-paths.json"),
              "utf8",
            ),
          );
          for (const file of assets) {
            const response = await fetch(
              origin + "/" + file.slice("dist/".length),
              { method: "HEAD" },
            );
            assert.equal(response.status, 200, file);
            assert.equal(
              Number(response.headers.get("content-length")),
              fs.statSync(path.join(baseDirectory, file)).size,
              file,
            );
          }
          assert.equal(
            (
              await fetch(
                origin + "/demo/home-blue/ai-content-network-engineer.json",
              )
            ).status,
            404,
          );
          assert.equal(
            (await fetch(origin + "/app/version.json")).headers
              .get("content-type")
              .includes("json"),
            true,
          );
          assert.equal(fs.existsSync(path.join(baseDirectory, "src")), false);
          assert.equal(
            fs.existsSync(path.join(baseDirectory, "scripts")),
            false,
          );
          assert.equal(
            fs.existsSync(path.join(baseDirectory, "public/demo")),
            false,
          );
          assert.equal(
            fs.existsSync(path.join(baseDirectory, ".baseline")),
            false,
          );
          const images = new Set(
            store
              .allQ()
              .flatMap((q) => [
                ...(q.images || []).map((i) => i.src),
                typeof q.image === "string" ? q.image : q.image?.src,
              ])
              .filter((src) => src?.startsWith("/question-images/")),
          );
          for (const src of images) {
            const response = await fetch(origin + src, { method: "HEAD" });
            assert.equal(response.status, 200, src);
            assert.match(response.headers.get("content-type"), /^image\//, src);
          }
          Object.assign(details, {
            completeCourses: ready.length,
            certificates: expected.length,
            servedArtifacts: assets.length,
            questionImages: images.size,
          });
        } else {
          assert.equal(
            (await request("/web-preferences")).values.theme,
            "dark",
          );
          const preferences = await request("/web-preferences");
          assert.equal(preferences.values.reminderEnabled, true);
          assert.equal(preferences.values.reminderTime, "00:00");
          const duplicate = await request("/study-reminders/check", {
            requestId: crypto.randomUUID(),
            version: preferences.version,
          });
          assert.equal(duplicate.notice, null);
          assert.equal(
            store.db
              .prepare(
                "SELECT request_id FROM user_study_reminders WHERE user_id=?",
              )
              .get(fixture.userId).request_id,
            fixture.reminder.id,
          );
          assert.equal(
            (await request("/learning-plan")).plan.id,
            fixture.planId,
          );
          assert(
            store.allA(fixture.userId).some((a) => a.id === fixture.cAttemptId),
          );
          const restoredTutor = (
            await request(`/tutor/v1/sessions/${fixture.tutorId}`)
          ).session;
          assert.equal(restoredTutor.revision, fixture.tutorRevision);
        }
      }
      if (stage === "compat") {
        assert.equal(
          JSON.parse(
            store.db
              .prepare("SELECT data FROM interactive_tutor_sessions WHERE id=?")
              .get(fixture.tutorId).data,
          ).id,
          fixture.tutorId,
        );
        assert.equal(
          JSON.parse(
            store.db
              .prepare("SELECT data FROM user_learning_plans WHERE id=?")
              .get(fixture.planId).data,
          ).id,
          fixture.planId,
        );
        assert(
          store.allA(fixture.userId).some((a) => a.id === fixture.cAttemptId),
        );
      }
      if (stage === "restore")
        assert.deepEqual(
          store
            .allA(fixture.userId)
            .map((a) => a.id)
            .sort(),
          fixture.attemptIds,
        );
    }
    assert.equal(modelCalls, 0);
    console.log(
      "REHEARSAL_RESULT=" +
        JSON.stringify({ stage, passed: true, modelCalls, ...details }),
    );
  } finally {
    if (app) await app.locals.stop();
    if (server) await new Promise((resolve) => server.close(resolve));
    store.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    store.db.close();
    globalThis.fetch = originalFetch;
  }
}

const root = fileURLToPath(new URL("../", import.meta.url));
const parent = fs.realpathSync(os.tmpdir());
const directory = fs.mkdtempSync(path.join(parent, "ace-release-runtime-"));
const logRoot = path.join(root, "test-output");
fs.mkdirSync(logRoot, { recursive: true });
const cleanEnvironment = {};
for (const [key, value] of Object.entries(process.env))
  if (
    [
      "PATH",
      "SYSTEMROOT",
      "WINDIR",
      "COMSPEC",
      "PATHEXT",
      "TEMP",
      "TMP",
      "APPDATA",
      "LOCALAPPDATA",
      "USERPROFILE",
    ].includes(key.toUpperCase())
  )
    cleanEnvironment[key] = value;
Object.assign(cleanEnvironment, {
  AI_MASTER_KEY: crypto.randomBytes(32).toString("base64"),
  AUTH_EMAIL_VERIFICATION_ENABLED: "0",
  DOTENV_CONFIG_QUIET: "true",
  NODE_ENV: "production",
  ALLOWED_HOSTS: "127.0.0.1,localhost",
  COOKIE_SECURE: "0",
  REHEARSAL_ROOT: directory,
});
const run = (executable, args, cwd, env = cleanEnvironment, timeout = 120000) =>
  new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const timer = setTimeout(() => child.kill(), timeout);
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve(output)
        : reject(
            new Error(`Runtime rehearsal process failed (${code}):\n${output}`),
          );
    });
  });
const git = (...args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  }).trim();
const legacy = path.join(directory, ".baseline");
const data = path.join(directory, "state-data");
const backup = path.join(directory, "backup-data");
const restoreLegacy = () => {
  fs.mkdirSync(legacy);
  const tree = git("ls-tree", "-r", "HEAD", "--", "server", "package.json");
  if (/^(120000|160000) /m.test(tree))
    throw new Error("Baseline source contains links or submodules");
  const archive = path.join(directory, "baseline.tar");
  fs.writeFileSync(
    archive,
    execFileSync("git", ["archive", "HEAD", "server", "package.json"], {
      cwd: root,
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    }),
  );
  execFileSync("tar", ["-xf", archive, "-C", legacy], { windowsHide: true });
  fs.unlinkSync(archive);
};
const removeLegacy = () => {
  if (
    path.dirname(legacy) !== directory ||
    path.basename(legacy) !== ".baseline"
  )
    throw new Error("Unsafe baseline cleanup");
  fs.rmSync(legacy, { recursive: true, force: true });
};
const stages = [];
const runWorker = async (stage, cwd, dataDirectory) => {
  const output = await run(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `(${worker.toString()})(${JSON.stringify(stage)}).catch(error=>{console.error(error.stack);process.exitCode=1;});`,
    ],
    cwd,
    { ...cleanEnvironment, DATA_DIR: dataDirectory },
  );
  fs.writeFileSync(path.join(logRoot, `release-runtime-${stage}.log`), output);
  const result = output.match(/REHEARSAL_RESULT=(.+)/);
  if (!result) throw new Error(`Missing worker result: ${stage}`);
  stages.push(JSON.parse(result[1]));
  console.log(`${stage}: passed`);
};
try {
  const provenance = assertBuildProvenance(root);
  const sources = runtimeSources(root, provenance.version);
  const artifacts = [
    ...runtimeArtifacts(root, provenance.version),
    "dist/build-provenance.json",
  ];
  const files = [...sources, ...artifacts];
  for (const file of files) {
    assertRuntimePath(file);
    const destination = path.join(directory, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, file), destination);
  }
  if (fingerprint(root, files).sha256 !== fingerprint(directory, files).sha256)
    throw new Error("Copied runtime differs from candidate");
  fs.writeFileSync(
    path.join(directory, "artifact-paths.json"),
    JSON.stringify(artifacts),
  );
  const npmArgs = [
    "ci",
    "--omit=dev",
    "--ignore-scripts",
    "--offline",
    "--no-audit",
    "--no-fund",
  ];
  const installLog = await run(
    process.platform === "win32" ? "cmd.exe" : "npm",
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npm " + npmArgs.join(" ")]
      : npmArgs,
    directory,
  );
  fs.writeFileSync(
    path.join(logRoot, "release-runtime-install.log"),
    installLog,
  );
  console.log(
    "Independent production dependencies: installed from local cache",
  );
  restoreLegacy();
  await runWorker("seed", legacy, data);
  fs.cpSync(data, backup, { recursive: true });
  const backupHash = crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(backup, "netwise.sqlite")))
    .digest("hex");
  removeLegacy();
  await runWorker("upgrade", directory, data);
  await runWorker("restart", directory, data);
  const compatibleData = path.join(directory, "compat-data");
  fs.cpSync(data, compatibleData, { recursive: true });
  restoreLegacy();
  await runWorker("compat", legacy, compatibleData);
  const restoredData = path.join(directory, "restore-data");
  fs.cpSync(backup, restoredData, { recursive: true });
  if (
    crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(restoredData, "netwise.sqlite")))
      .digest("hex") !== backupHash
  )
    throw new Error("Restored fixture backup differs");
  await runWorker("restore", legacy, restoredData);
  const report = {
    passed: true,
    baselineCommit: git("rev-parse", "HEAD"),
    baselineIsOnlineVersion: false,
    candidateProvenance: provenance,
    runtimeFiles: files.length,
    stages,
    certificates: 6,
    independentProductionDependencies: true,
    personalOrProductionDataUsed: false,
    externalModelCalls: 0,
    releaseArchiveCreated: false,
    deployed: false,
  };
  fs.writeFileSync(
    path.join(logRoot, "release-runtime-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  fs.writeFileSync(
    path.join(logRoot, "release-runtime-report.json"),
    JSON.stringify({ passed: false, stages, error: error.message }, null, 2) +
      "\n",
  );
  throw error;
} finally {
  if (
    path.dirname(directory) !== parent ||
    !path.basename(directory).startsWith("ace-release-runtime-")
  )
    throw new Error("Unsafe rehearsal cleanup");
  fs.rmSync(directory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
}
