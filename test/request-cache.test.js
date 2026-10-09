import test from "node:test";
import assert from "node:assert/strict";
import { RequestCache } from "../src/request-cache.js";

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test("repeat and concurrent reads reuse content; explicit refresh obtains a new value", async () => {
  let calls = 0,
    time = 1000;
  const cache = new RequestCache({ now: () => time });
  cache.setScope("learner:certificate");
  const response = deferred();
  const load = () => {
    calls++;
    return response.promise;
  };
  const first = cache.read("/lesson", load, { ttl: 100 });
  const second = cache.read("/lesson", load, { ttl: 100 });
  response.resolve({ title: "lesson" });
  assert.deepEqual(await first, await second);
  assert.equal(calls, 1);
  await cache.read(
    "/lesson",
    () => {
      throw new Error("must use cache");
    },
    { ttl: 100 },
  );
  await cache.read("/lesson", async () => ({ title: "revised" }), {
    ttl: 100,
    force: true,
  });
  assert.equal(cache.peek("/lesson").title, "revised");
  time += 101;
  assert.equal(cache.peek("/lesson"), undefined);
});

test("an earlier request cannot overwrite a mutation or an explicit refresh", async () => {
  const cache = new RequestCache();
  cache.setScope("learner:certificate");
  const late = deferred();
  const previous = cache.read("/progress", () => late.promise, { ttl: 1000 });
  const rejected = assert.rejects(previous, { name: "CacheCancelledError" });
  cache.invalidate(["/progress"]);
  await cache.read("/progress", async () => ({ complete: true }), {
    ttl: 1000,
  });
  late.resolve({ complete: false });
  await rejected;
  assert.deepEqual(cache.peek("/progress"), { complete: true });
});

test("account and certificate changes discard pending and cached private content", async () => {
  const cache = new RequestCache();
  cache.setScope("alice:network");
  const late = deferred();
  const pending = cache.read("/lesson", () => late.promise, { ttl: 1000 });
  const rejected = assert.rejects(pending, { name: "CacheCancelledError" });
  cache.set("/progress", { account: "alice" }, 1000);
  cache.setScope("bob:upgrading");
  late.resolve({ account: "alice" });
  await rejected;
  assert.equal(cache.peek("/progress"), undefined);
  assert.equal(cache.peek("/lesson"), undefined);
  cache.set("/lesson", { account: "bob" }, 1000);
  cache.setScope(null);
  assert.equal(cache.peek("/lesson"), undefined);
});

test("membership expiry caps lesson lifetime and cached content remains bounded", async () => {
  let time = 1000;
  const cache = new RequestCache({ now: () => time, limit: 2 });
  cache.setScope("member:network");
  cache.set("/study/lesson-a", "a", 300000);
  cache.set("/study/lesson-b", "b", 300000);
  cache.capExpiry("/study/", 1500);
  time = 1500;
  assert.equal(cache.peek("/study/lesson-a"), undefined);
  cache.set("a", 1, 1000);
  cache.set("b", 2, 1000);
  cache.set("c", 3, 1000);
  assert.equal(cache.entries.size, 2);
  assert.equal(cache.peek("a"), undefined);
});
