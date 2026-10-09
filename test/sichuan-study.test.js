import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStore } from "../server/store.js";
import { createApp } from "../server/index.js";
import { certificates } from "../server/certificates.js";
import { studyNodes, studyNode, studyPackageSchema, studyReviewSchema, acceptedStudyReview } from "../server/study-content.js";
import { deploymentStudySeeds } from "../server/study-seeds/index.js";
import { gradeStudyQuestion } from "../server/study-grading.js";
import { mockStudyAI } from "./study-fixture.js";

const certificateId = "sichuan-upgrading-computer";
const nodes = studyNodes.filter((node) => node.certificateId === certificateId);
const seeds = deploymentStudySeeds.filter((item) => item.nodeId.startsWith(`${certificateId}:`));
const unit = (slug) => seeds.find((item) => item.nodeId.endsWith(`:${slug}`));
const answer = (slug, index) => unit(slug).bundle.questions[index - 1].blanks[0].answer;

test("Sichuan study covers every syllabus parent with independently versioned short lessons and six exercises", () => {
  const certificate = certificates.find((item) => item.id === certificateId);
  const points = certificate.taxonomy.modules.flatMap((module) => module.sections.flatMap((section) => section.knowledgePoints));
  assert.equal(nodes.length, 141);
  assert.equal(new Set(nodes.map((node) => node.chapter)).size, 7);
  assert.equal(new Set(nodes.map((node) => node.parentId)).size, 22);
  assert.equal(seeds.length, nodes.length);
  for (const point of points) {
    const siblings = nodes.filter((node) => node.code === point.code);
    assert.ok(siblings.length >= 2, point.code);
    assert.deepEqual(siblings.map((node) => node.sublesson.order), Array.from({ length: siblings.length }, (_, i) => i + 1));
    for (const node of siblings) {
      assert.equal(node.sublesson.total, siblings.length);
      assert.equal(node.parentName, point.name);
      assert.equal(studyNode(node.id), node);
      assert.equal(studyNode(node.id, certificateId), node);
      assert.throws(() => studyNode(node.id, "network-engineer"), /不属于当前证书/);
      const seed = seeds.find((item) => item.nodeId === node.id);
      assert.equal(seed.curriculumVersion, node.version);
      assert.equal(seed.reviewMethod, "authored-curriculum");
      assert.ok(seed.reference.includes("非官方真题"));
      const bundle = studyPackageSchema.parse(seed.bundle);
      assert.equal(bundle.lesson.title, node.sublesson.title);
      assert.equal(acceptedStudyReview(bundle, studyReviewSchema.parse(seed.review)), true);
      assert.deepEqual(bundle.questions.map((q) => q.stage), ["基础", "基础", "理解", "理解", "应用", "应用"]);
      for (const question of bundle.questions) {
        const input = Object.fromEntries(question.blanks.map((blank) => [blank.id, blank.answer]));
        assert.ok(gradeStudyQuestion(question, input).every((row) => row.verdict === "correct"), node.id);
      }
    }
  }
  assert.equal(seeds.reduce((sum, item) => sum + item.bundle.questions.length, 0), 846);
  for (const seed of deploymentStudySeeds.filter((item) => item.nodeId.startsWith("network-engineer:")))
    assert.equal(studyNode(seed.nodeId).version, seed.curriculumVersion, "existing network course identities must survive");
});

test("Excel references, functions and operations remain separate units", () => {
  const functions = ["abs", "sum", "sumif", "average", "count", "countif", "vlookup", "if", "max", "min", "rank", "year", "month", "day", "mid", "left", "right", "mod"];
  assert.equal(functions.length, 18);
  for (const fn of functions) assert.ok(unit(`excel-${fn}`), fn);
  for (const slug of ["excel-relative", "excel-absolute", "excel-mixed", "excel-conditional-format", "excel-protection", "excel-print", "excel-import", "word-columns"])
    assert.ok(unit(slug), slug);
  assert.equal(answer("excel-relative", 4), "C5");
  assert.equal(answer("excel-relative", 5), "=B3*C3");
  assert.equal(answer("excel-absolute", 1), "$A$1");
  assert.equal(answer("excel-mixed", 5), "$B5");
  assert.equal(answer("excel-mixed", 6), "B$2");
  assert.equal(answer("excel-import", 5), "0012");
  assert.equal(unit("excel-import").bundle.questions[4].blanks[0].kind, "exact");
  assert.equal(answer("excel-average", 3), String((10 + 0) / 2));
  assert.equal(answer("excel-count", 6), "2", "numeric-looking text in a referenced range is not counted");
  const scores = [90, 80, 80, 70];
  assert.equal(answer("excel-rank", 3), String(1 + scores.filter((n) => n > 70).length));
  assert.equal(answer("excel-rank", 6), String(1 + scores.filter((n) => n > 80).length));
  assert.equal(answer("excel-vlookup", 3), "3", "return column starts within the selected table");
  assert.equal(answer("excel-vlookup", 6), "#N/A");
});

test("authored numerical examples retain base widths, media units, negative MOD and loop boundaries", () => {
  assert.equal(answer("decimal-to-binary", 4), String(8 - (5).toString(2).length));
  assert.equal(answer("decimal-to-binary", 6), (18).toString(2).padStart(8, "0"));
  assert.equal(answer("hex-conversion", 2), parseInt("3A", 16).toString(2).padStart(8, "0"));
  assert.equal(answer("signed-integers", 4), (256 - 5).toString(2));
  assert.equal(answer("information-units", 3), String(2 * 1024));
  assert.equal(answer("unicode-encoding", 5), String(Buffer.byteLength("A中", "utf8")));
  assert.equal(answer("audio-size", 5), String(16000 * 16 * 2 * 2 / 8));
  assert.equal(answer("image-size", 4), String(640 * 480 * 24 / 8));
  assert.equal(answer("loops", 2), "0");
  assert.equal(answer("loops", 6), "4");
  assert.equal(answer("product", 5), "1");
  const evaluators = { ABS: ([n]) => Math.abs(n), MAX: (args) => Math.max(...args),
    MIN: (args) => Math.min(...args), MOD: ([n, d]) => n - d * Math.floor(n / d) };
  let verified = 0;
  for (const seed of seeds) for (const question of seed.bundle.questions) {
    const match = question.stem.match(/=(ABS|MAX|MIN|MOD)\(([\d.,+-]+)\)/);
    if (!match) continue;
    const args = match[2].split(",").map(Number);
    if (args.some((n) => !Number.isFinite(n))) continue;
    assert.equal(question.blanks[0].answer, String(evaluators[match[1]](args)), question.stem);
    verified++;
  }
  assert.ok(verified >= 10, "representative numerical function examples were evaluated independently");
});

async function fixture(t) {
  process.env.ALLOWED_HOSTS = "127.0.0.1,localhost";
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aceexam-sichuan-study-"));
  const store = createStore(directory), fake = mockStudyAI();
  const users = {};
  for (const name of ["owner", "learner", "peer", "free"]) {
    users[name] = await store.register(`sc_study_${name}`, "fixture-password-123");
    store.selectCertificate(users[name].id, certificateId);
  }
  store.db.prepare("UPDATE users SET is_admin=1 WHERE id=?").run(users.owner.id);
  for (const name of ["learner", "peer"]) store.saveAccountEntitlement(users[name].id,
    { plan: "vip", expiresAt: new Date(Date.now() + 86400000).toISOString() });
  const app = await createApp({ store, provider: {}, studyAI: fake, withFrontend: false });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const tokens = Object.fromEntries(Object.values(users).map((user) => [user.id, store.createAuthSession(user.id)]));
  const request = async (url, user, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${url}`, {
      method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json",
        ...(user ? { Authorization: `Bearer ${tokens[user.id]}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json() };
  };
  t.after(async () => {
    await app.locals.stop(); await new Promise((resolve) => server.close(resolve)); store.db.close();
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("aceexam-sichuan-study-"));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return { store, app, fake, request, ...users };
}

test("default startup makes both complete courses available without generation and scopes admin bulk actions", async (t) => {
  const { app, request, owner, learner, fake } = await fixture(t);
  assert.equal(app.locals.study.packages().length, 288);
  const catalog = await request("/study/catalog", learner);
  assert.equal(catalog.status, 200);
  assert.equal(catalog.data.supported, true);
  assert.equal(catalog.data.nodes.length, 141);
  assert.ok(catalog.data.nodes.every((node) => node.available && node.certificateId === certificateId));
  const overview = await request("/admin/study/overview", owner);
  assert.equal(overview.status, 200);
  const course = overview.data.courses.find((item) => item.id === certificateId);
  assert.deepEqual([course.chapterCount, course.topicCount, course.lessonCount], [7, 22, 141]);
  const reference = await request(`/admin/study/reference/${encodeURIComponent(unit("excel-mixed").nodeId)}`, owner);
  assert.equal(reference.status, 200);
  assert.equal(reference.data.referenceMode, "authored-curriculum");
  assert.ok(reference.data.reference.includes("Excel 混合引用"));
  const bulk = await request("/admin/study/generations/bulk", owner, { certificateId });
  assert.equal(bulk.status, 200);
  assert.deepEqual([bulk.data.selected, bulk.data.published, bulk.data.queued, bulk.data.curriculumBacked], [141, 141, 0, 141]);
  assert.equal(fake.generationCalls, 0);
  assert.equal((await request("/admin/study/generations/bulk", owner, { certificateId: "hcia-datacom" })).status, 400);
});

test("Sichuan lesson completion unlocks only that unit, hides answers and survives certificate changes", async (t) => {
  const { store, app, request, learner, peer, free, fake } = await fixture(t);
  const node = studyNode(unit("excel-abs").nodeId), sibling = studyNode(unit("excel-sum").nodeId);
  const lessonUrl = `/study/lessons/${encodeURIComponent(node.id)}`;
  assert.equal((await request(lessonUrl)).status, 401);
  assert.equal((await request(lessonUrl, free)).status, 403);
  assert.deepEqual((await request("/study/catalog", free)).data, { access: false, supported: true, nodes: [] });
  assert.equal((await request("/study/practice-sessions", learner, { nodeId: node.id })).status, 409);
  const lesson = await request(lessonUrl, learner);
  assert.equal(lesson.data.lesson.title, "Excel ABS：绝对值");
  assert.equal(lesson.data.questionCount, 6);
  assert.equal(lesson.data.questions, undefined);
  assert.equal((await request(`${lessonUrl}/complete`, learner, { version: 0 })).status, 200);
  assert.equal((await request("/study/practice-sessions", learner, { nodeId: sibling.id })).status, 409);
  const practice = await request("/study/practice-sessions", learner, { nodeId: node.id });
  assert.equal(practice.status, 200);
  const session = practice.data;
  assert.equal(session.questions.length, 5);
  for (const question of session.questions) {
    assert.equal(question.explanation, undefined);
    assert.equal(question.hint, undefined);
    for (const blank of question.blanks) { assert.equal(blank.answer, undefined); assert.equal(blank.aliases, undefined); }
  }
  const question = unit("excel-abs").bundle.questions.find((q) => q.id === session.questions[0].id);
  const submitted = await request(`/study/practice-sessions/${session.id}/attempts`, learner,
    { questionId: question.id, answers: { b1: question.blanks[0].answer }, requestId: crypto.randomUUID() });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.data.correct, true);
  assert.equal(fake.gradeCalls, 0);
  assert.equal((await request(`/study/practice-sessions/${session.id}`, peer)).status, 404);
  store.selectCertificate(learner.id, "network-engineer");
  assert.equal((await request("/study/catalog", learner)).data.nodes.length, 147);
  assert.equal((await request(lessonUrl, learner)).status, 404);
  assert.equal((await request(`/study/practice-sessions/${session.id}`, learner)).status, 404);
  assert.equal((await request(`/study/attempts/${submitted.data.id}`, learner)).status, 404);
  store.selectCertificate(learner.id, certificateId);
  assert.equal((await request(`/study/practice-sessions/${session.id}`, learner)).data.attempts.length, 1);
  const catalog = (await request("/study/catalog", learner)).data;
  assert.equal(catalog.nodes.find((item) => item.id === node.id).completed, true);
  assert.equal(catalog.nodes.find((item) => item.id === sibling.id).completed, false);
  assert.equal(app.locals.study.progress(learner.id).length, 1);
});

test("course seed validation is atomic and startup preserves edited or suspended Sichuan content", async (t) => {
  const { app, owner } = await fixture(t);
  const first = studyNode(seeds[0].nodeId), last = studyNode(seeds.at(-1).nodeId);
  const revised = structuredClone(seeds[0]);
  revised.bundle.lesson.summary += "复习时核对例子的适用条件。";
  const saved = app.locals.study.savePackage(first, { bundle: revised.bundle, review: revised.review, accepted: true }, revised.reference, owner.id);
  app.locals.study.publish(saved.id, owner.id, first);
  app.locals.study.suspend(app.locals.study.published(last).id, owner.id);
  assert.deepEqual(app.locals.study.installPublishedSeeds(seeds), { total: 141, installed: 0, preserved: 141 });
  assert.equal(app.locals.study.published(first).id, saved.id);
  assert.equal(app.locals.study.published(last), null);
  const count = app.locals.study.packages().length;
  assert.throws(() => app.locals.study.installPublishedSeeds(seeds.slice(0, -1)), /未覆盖全部/);
  assert.throws(() => app.locals.study.installPublishedSeeds([seeds[0], seeds[0]]), /目录版本错误/);
  assert.throws(() => app.locals.study.installPublishedSeeds([{ ...seeds[0], curriculumVersion: "obsolete" }, ...seeds.slice(1)]), /目录版本错误/);
  assert.equal(app.locals.study.packages().length, count);
});

test("an administrative generation job can publish a new Sichuan revision without changing the other course", async (t) => {
  const { app, request, owner, fake } = await fixture(t);
  const seed = unit("excel-mixed"), node = studyNode(seed.nodeId);
  const oldId = app.locals.study.published(node).id;
  fake.generate = async (requested, reference) => {
    fake.generationCalls++;
    assert.equal(requested.id, node.id);
    assert.ok(reference.includes(node.sublesson.title));
    return { bundle: structuredClone(seed.bundle), review: structuredClone(seed.review) };
  };
  const result = await request("/admin/study/generations", owner, { nodeId: node.id, reference: seed.reference, regenerate: true });
  assert.equal(result.status, 200);
  for (let i = 0; i < 30 && app.locals.study.job(result.data.jobId).status === "running"; i++)
    await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(app.locals.study.job(result.data.jobId).status, "completed");
  assert.notEqual(app.locals.study.published(node).id, oldId);
  assert.equal(app.locals.study.packages().filter((item) => item.certificate_id === "network-engineer").length, 147);
  assert.equal(fake.generationCalls, 1);
});
