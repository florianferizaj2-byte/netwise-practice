import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStore } from "../server/store.js";
import { createApp } from "../server/index.js";
import { FundedTestAIProvider } from "./helpers/ai-points.js";

const day = "2026-10-23", tomorrow = "2026-10-24";
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aceexam-daily-explanations-"));
  const context = { directory, store: createStore(directory) };
  t.after(() => {
    context.store.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return context;
}

test("legacy daily records retain their original tier limits without duplicate migration grants", (t) => {
  const { store } = fixture(t);
  for (const [plan, limit] of [["free", 10], ["vip", 50], ["svip", 100], ["ssvip", 200]]) {
    store.saveAccountEntitlement(plan, { plan });
    const initial = store.dailyAiCredits(plan, day);
    assert.equal(initial.explanationsGranted, limit);
    assert.equal(initial.explanationsRemaining, limit);
    assert(!initial.claimedAt);
    assert.equal(initial.generationsRemaining, 0);
    assert.equal(initial.analysesRemaining, 0);
    assert(store.consumeDailyAiCredit(plan, day, "explanation"));
    const first = store.claimDailyAiCredits(plan, day);
    assert(first.claimed);
    assert.equal(first.credits.explanationsRemaining, limit - 1);
    assert.equal(first.credits.generationsRemaining, 1);
    assert.equal(first.credits.analysesRemaining, 3);
    assert(!store.claimDailyAiCredits(plan, day).claimed);
    for (let used = 1; used < limit; used++) assert(store.consumeDailyAiCredit(plan, day, "explanation"));
    assert(!store.consumeDailyAiCredit(plan, day, "explanation"));
    assert.equal(store.dailyAiCredits(plan, day).explanationsRemaining, 0);
    assert(store.refundDailyAiCredit(plan, day, "explanation"));
    assert.equal(store.dailyAiCredits(plan, day).explanationsRemaining, 1);
    assert.equal(store.dailyAiCredits(plan, tomorrow).explanationsRemaining, limit);
    assert.equal(store.dailyAiCredits(plan, tomorrow).generationsRemaining, 0);
  }
});

test("upgrades, downgrades and expiry preserve all already-used credits; late refunds stay in the original day", (t) => {
  const { store } = fixture(t);
  store.saveAccountEntitlement("member", { plan: "vip" });
  for (let i = 0; i < 20; i++) store.consumeDailyAiCredit("member", day, "explanation");
  store.saveAccountEntitlement("member", { plan: "free" });
  assert.equal(store.dailyAiCredits("member", day).explanationsRemaining, 0);
  store.refundDailyAiCredit("member", day, "explanation");
  assert.equal(store.dailyAiCredits("member", day).explanationsRemaining, 0);
  store.saveAccountEntitlement("member", { plan: "ssvip" });
  assert.equal(store.dailyAiCredits("member", day).explanationsRemaining, 181);
  store.saveAccountEntitlement("member", { plan: "ssvip", expiresAt: "2020-01-01T00:00:00.000Z" });
  assert.equal(store.dailyAiCredits("member", day).explanationsGranted, 10);
  assert.equal(store.dailyAiCredits("member", day).explanationsRemaining, 0);
  assert.equal(store.dailyAiCredits("member", tomorrow).explanationsRemaining, 10);
  store.refundDailyAiCredit("member", day, "explanation");
  assert.equal(store.dailyAiCredits("member", tomorrow).explanationsRemaining, 10);
});

test("legacy signed-in 5-credit rows migrate without losing usage or reissuing check-in rewards", (t) => {
  const context = fixture(t);
  context.store.saveAccountEntitlement("legacy", { plan: "vip" });
  context.store.db.exec("ALTER TABLE user_daily_ai_credits DROP COLUMN explanations_used");
  context.store.db.prepare(`INSERT INTO user_daily_ai_credits
    (user_id,day,claimed_at,explanations_granted,explanations_remaining,
     generations_granted,generations_remaining,analyses_granted,analyses_remaining)
    VALUES (?,?,'2026-10-23T01:00:00Z',5,3,1,0,3,2)`).run("legacy", day);
  context.store.db.close();
  context.store = createStore(context.directory);
  const credits = context.store.dailyAiCredits("legacy", day);
  assert.equal(credits.explanationsRemaining, 48);
  assert.equal(credits.generationsRemaining, 0);
  assert.equal(credits.analysesRemaining, 2);
  assert(!context.store.claimDailyAiCredits("legacy", day).claimed);
  context.store.db.close();
  context.store = createStore(context.directory);
  assert.equal(context.store.dailyAiCredits("legacy", day).explanationsRemaining, 48);
});

test("retired daily counters cannot limit point billing; failed requests refund the whole prehold", async (t) => {
  const { store } = fixture(t);
  store.register("quota_admin", "fixture-password-123");
  let calls = 0, fail = false;
  const metered=new FundedTestAIProvider(store,{fetch:async()=>new Response(JSON.stringify({
    choices:[{message:{content:'fixture response'}}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5},
  }),{headers:{'Content-Type':'application/json'}})});
  const provider = { async explainQuestion(_question,_action,_selected,_hint,userId) {
    calls++;
    await metered.call([{role:'user',content:'fixture explanation'}],{baseUrl:'https://fixture.example',model:'fixture',apiKey:'fixture'},{userId,taskType:'question-explanation'});
    if (fail) throw new Error("fixture failure");
    return { text: "这是简洁且完整的解析。" };
  } };
  const app = await createApp({ store, provider, authRequired: true, withFrontend: false });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => { await app.locals.stop(); await new Promise((resolve) => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (token, route, body) => {
    const result = await fetch(base + route, { method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: result.status, data: await result.json() };
  };
  const questionId = store.allQ().find((q) => q.certificates?.includes("network-engineer")).id;
  for (const [plan, limit, monthly] of [["free", 10, 0], ["vip", 50, 990], ["svip", 100, 1990], ["ssvip", 200, 3990]]) {
    const user = store.register(`quota_${plan}`, "fixture-password-123");
    store.selectCertificate(user.id, "network-engineer");
    store.saveAccountEntitlement(user.id, { plan });
    const token = store.createAuthSession(user.id);
    const initial = (await request(token, "/account/entitlements")).data;
    assert.equal(initial.checkIn.claimed, false);
    assert.equal(initial.billingMode,'points');
    assert.equal(initial.points.monthlyPoints,monthly);
    assert.equal(initial.checkIn.remaining.explanations,0);
    const body = { questionId, action: "详细讲解" };
    assert.equal((await request(token, "/ai/teacher", body)).status, 200);
    assert.equal((await request(token,'/account/entitlements')).data.points.availableUnits,initial.points.availableUnits-12);
    fail = true;
    assert.notEqual((await request(token, "/ai/teacher", body)).status, 200);
    fail = false;
    assert.equal((await request(token, "/account/entitlements")).data.points.availableUnits,initial.points.availableUnits-12);
    const date = initial.checkIn.day;
    for (let used = 0; used < limit; used++) store.consumeDailyAiCredit(user.id, date, "explanation");
    const before = calls;
    const exhausted = await request(token, "/ai/teacher", body);
    assert.equal(exhausted.status,200);
    assert.equal(calls,before+1);
    assert.equal((await request(token,'/account/entitlements')).data.points.availableUnits,initial.points.availableUnits-24);
    assert.equal(store.points.wallet(user.id).heldUnits,0);
  }
});
