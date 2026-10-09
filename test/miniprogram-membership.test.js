import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const purchaseUrl = "https://catfk.com/shop/aceexam";
function loadModule(relative, context) {
  const exports = { exports: {} };
  vm.runInNewContext(fs.readFileSync(new URL(relative, import.meta.url), "utf8"), { module: exports, ...context });
  return exports.exports;
}
function profile(api, wx = {}) {
  let definition;
  const purchase = loadModule("../miniprogram/utils/membership-purchase.js", { wx });
  loadModule("../miniprogram/pages/profile/index.js", {
    Page: (page) => { definition = page; }, wx,
    getApp: () => ({ globalData: { sessionToken: "fixture", user: { id: "learner", username: "learner" } } }),
    require: (name) => name.endsWith("/api") ? api : name.endsWith("/membership-purchase") ? purchase
      : { errorMessage: (error, fallback) => error.message || fallback },
  });
  const page = { ...definition, data: { ...definition.data }, _visible: true,
    setData(value) { Object.assign(this.data, value); } };
  return page;
}

test("mini-program purchase copies only the shop URL and leaves account rights unchanged", () => {
  const dialogs = [], clipboard = [];
  const page = profile({}, {
    setClipboardData: (options) => { clipboard.push(options.data); options.success(); },
    showModal: (options) => dialogs.push(options),
  });
  page.data.membershipLabel = "Free";
  page.buyMembership();
  assert.deepEqual(clipboard, [purchaseUrl]);
  assert.equal(page.data.membershipLabel, "Free");
  assert.ok(dialogs[0].content.includes("购买后回到考匠"));
  let fallback;
  const failed = profile({}, { setClipboardData: (options) => options.fail(), showModal: (options) => { fallback = options; } });
  failed.buyMembership();
  assert.ok(fallback.content.includes(purchaseUrl));
});

test("mini-program redemption locks duplicate clicks and rejects stale entitlement reads", async () => {
  let releaseRead, releaseRedeem, calls = 0;
  const page = profile({
    accountEntitlements: () => new Promise((resolve) => { releaseRead = resolve; }),
    redeemMembership: (code) => { calls++; assert.equal(code, "VIP-TEST"); return new Promise((resolve) => { releaseRedeem = resolve; }); },
  });
  const pendingRead = page.refreshMembership();
  page.openRedemption();
  page.onRedeemInput({ detail: { value: " VIP-TEST " } });
  const pendingRedeem = page.redeemMembership();
  page.redeemMembership();
  page.closeRedemption();
  assert.equal(calls, 1);
  assert.equal(page.data.redeemOpen, true);
  releaseRedeem({ alreadyRedeemed: false, redemption: { plan: "vip" }, entitlements: { plan: "vip", expiresAt: "2026-11-09T00:00:00Z" } });
  await pendingRedeem;
  releaseRead({ plan: "free" });
  await pendingRead;
  assert.equal(page.data.membershipLabel, "VIP");
  assert.equal(page.data.redeemOpen, false);
  assert.equal(page.data.redeemCode, "");
  assert.equal(page.data.busy, false);
});

test("mini-program redemption failure preserves the code and allows retry", async () => {
  let rejectRedeem;
  const page = profile({ redeemMembership: () => new Promise((_, reject) => { rejectRedeem = reject; }) });
  page.openRedemption();
  page.onRedeemInput({ detail: { value: "UNKNOWN-CODE" } });
  const pending = page.redeemMembership();
  rejectRedeem({ message: "兑换码无效，请检查后重试" });
  await pending;
  assert.equal(page.data.redeemCode, "UNKNOWN-CODE");
  assert.equal(page.data.redeemOpen, true);
  assert.equal(page.data.busy, false);
  assert.ok(page.data.redeemError.includes("无效"));
});
