import test from "node:test";
import assert from "node:assert/strict";
import { createAiScheduler, currentAiSignal } from "../server/ai-tasks.js";
const gate = () => {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
};
test("AI runs independent accounts concurrently, serializes each account and bounds total work", async () => {
  const scheduler = createAiScheduler({ concurrency: 2 }),
    held = gate(),
    started = [];
  const work = (id) =>
    scheduler.run(id, async () => {
      started.push(id);
      await held.promise;
      return id;
    });
  const a = work("a"),
    b = work("b"),
    c = work("c");
  assert.deepEqual(started, ["a", "b"]);
  await assert.rejects(work("a"), { code: "AI_ACCOUNT_BUSY" });
  held.resolve();
  assert.deepEqual(await Promise.all([a, b, c]), ["a", "b", "c"]);
  await scheduler.stop();
});
test("the total task deadline cancels upstream work and releases the account", async () => {
  const scheduler = createAiScheduler({ concurrency: 1, timeoutMs: 20 });
  await assert.rejects(
    scheduler.run("a", async (signal) => {
      assert.equal(currentAiSignal(), signal);
      await new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        }),
      );
    }),
    { code: "AI_TASK_TIMEOUT" },
  );
  assert.equal(scheduler.busy("a"), false);
  assert.equal(await scheduler.run("a", () => "ok"), "ok");
  await scheduler.stop();
});
test("a full queue rejects additional work and shutdown rejects waiting tasks", async () => {
  const scheduler = createAiScheduler({ concurrency: 1, maxQueue: 1 });
  const running = scheduler.run(
    "a",
    (signal) =>
      new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason)),
      ),
  );
  const waiting = scheduler.run("b", () => "b");
  const checks = Promise.all([
    assert.rejects(running, { code: "AI_SERVICE_STOPPING" }),
    assert.rejects(waiting, { code: "AI_SERVICE_STOPPING" }),
  ]);
  await assert.rejects(
    scheduler.run("c", () => "c"),
    { code: "AI_QUEUE_FULL" },
  );
  await scheduler.stop();
  await checks;
});

test("waiting tasks expire without starting or keeping the account locked", async () => {
  const scheduler = createAiScheduler({ concurrency: 1, queueWaitMs: 20 }),
    held = gate();
  const running = scheduler.run("a", () => held.promise);
  let started = false;
  await assert.rejects(
    scheduler.run("b", () => {
      started = true;
    }),
    { code: "AI_QUEUE_TIMEOUT" },
  );
  assert.equal(started, false);
  assert.equal(scheduler.busy("b"), false);
  held.resolve();
  await running;
  assert.equal(await scheduler.run("b", () => "ok"), "ok");
  await scheduler.stop();
});
