import { AsyncLocalStorage } from "node:async_hooks";

const context = new AsyncLocalStorage();
const failure = (message, status, code) =>
  Object.assign(new Error(message), { status, code });
export const currentAiSignal = () => context.getStore()?.signal;
export const checkAiCancellation = () => currentAiSignal()?.throwIfAborted();
export const positiveInteger = (value, fallback, maximum = 1000000) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0
    ? Math.min(number, maximum)
    : fallback;
};

// One task per account; independent accounts share a bounded FIFO queue.
export function createAiScheduler(options = {}) {
  const concurrency = positiveInteger(
    options.concurrency ?? process.env.AI_MAX_CONCURRENT_TASKS,
    3,
    20,
  );
  const timeoutMs = positiveInteger(
    options.timeoutMs ?? process.env.AI_TASK_TIMEOUT_MS,
    180000,
  );
  const maxQueue = positiveInteger(
    options.maxQueue ?? process.env.AI_MAX_QUEUED_TASKS,
    40,
    1000,
  );
  const queueWaitMs = positiveInteger(
    options.queueWaitMs ?? process.env.AI_QUEUE_WAIT_MS,
    30000,
  );
  const users = new Set(),
    running = new Set(),
    queue = [];
  let stopped = false;
  const pump = () => {
    while (!stopped && running.size < concurrency && queue.length) {
      const task = queue.shift();
      clearTimeout(task.waitTimer);
      running.add(task);
      const timer = setTimeout(
        () =>
          task.controller.abort(
            failure(
              "AI 任务处理超时，额度会自动返还，请稍后重试",
              504,
              "AI_TASK_TIMEOUT",
            ),
          ),
        timeoutMs,
      );
      task.operation = context.run(
        { signal: task.controller.signal },
        async () => {
          checkAiCancellation();
          const result = await task.work(task.controller.signal);
          checkAiCancellation();
          return result;
        },
      );
      // Do not release a slot until cancellation has actually stopped the work.
      const finished = () => {
        clearTimeout(timer);
        users.delete(task.userId);
        running.delete(task);
        pump();
      };
      task.operation.then(
        (result) => {
          finished();
          task.resolve(result);
        },
        (error) => {
          finished();
          task.reject(error);
        },
      );
    }
  };
  return {
    busy: (userId) => users.has(userId),
    get userIds() {
      return [...users];
    },
    get available() {
      return stopped
        ? 0
        : Math.max(0, concurrency - running.size - queue.length);
    },
    run(userId, work) {
      if (stopped)
        return Promise.reject(
          failure("AI 服务正在停止，请稍后重试", 503, "AI_SERVICE_STOPPING"),
        );
      if (users.has(userId))
        return Promise.reject(
          failure("你的 AI 任务正在处理，请稍候再试", 409, "AI_ACCOUNT_BUSY"),
        );
      if (running.size >= concurrency && queue.length >= maxQueue)
        return Promise.reject(
          failure("AI 请求较多，请稍后重试", 429, "AI_QUEUE_FULL"),
        );
      users.add(userId);
      return new Promise((resolve, reject) => {
        const task = {
          userId,
          work,
          resolve,
          reject,
          controller: new AbortController(),
        };
        task.waitTimer = setTimeout(() => {
          const index = queue.indexOf(task);
          if (index < 0) return;
          queue.splice(index, 1);
          users.delete(userId);
          reject(
            failure("AI 排队时间较长，请稍后重试", 503, "AI_QUEUE_TIMEOUT"),
          );
        }, queueWaitMs);
        queue.push(task);
        pump();
      });
    },
    async stop() {
      stopped = true;
      const error = failure(
        "AI 服务正在停止，请稍后重试",
        503,
        "AI_SERVICE_STOPPING",
      );
      for (const task of queue.splice(0)) {
        clearTimeout(task.waitTimer);
        users.delete(task.userId);
        task.reject(error);
      }
      for (const task of running) task.controller.abort(error);
      await Promise.allSettled([...running].map((task) => task.operation));
    },
  };
}
