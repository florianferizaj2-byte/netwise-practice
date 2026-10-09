import { CacheCancelledError, RequestCache } from "./request-cache.js";

const responseCache = new RequestCache();
let studyExpiry = Infinity;
const keyFor = (url, body, method) =>
  (method || (body ? "POST" : "GET")) === "GET"
    ? url
    : `${url}\n${method || "POST"}\n${JSON.stringify(body)}`;
const ttlFor = (url) => {
  if (url === "/questions") return 300000;
  if (url.startsWith("/study/lessons/")) return 300000;
  if (url.startsWith("/study/teacher/history?")) return 60000;
  if (["/dashboard", "/wrong", "/exams"].includes(url)) return 15000;
  if (url === "/study/catalog" || url === "/questions/shared-ai") return 30000;
  return 0;
};

export const peekCachedApi = (url, body, method) =>
  responseCache.peek(keyFor(url, body, method));
export const cacheApiResponse = (url, data, body, method, ttl = 300000) =>
  responseCache.set(
    keyFor(url, body, method),
    data,
    ttl,
    url.startsWith("/study/") ? studyExpiry : Infinity,
  );
export const invalidateApiCache = (...prefixes) =>
  responseCache.invalidate(prefixes);

function updateCacheContext(url, method, data) {
  if (url.startsWith("/auth/")) {
    if (data.user?.id) {
      const scope = `${data.user.id}:${data.user.certificateId || ""}`;
      if (scope !== responseCache.scope) studyExpiry = Infinity;
      responseCache.setScope(scope);
    } else if (url === "/auth/logout" || data.authenticated === false) {
      responseCache.setScope(null);
      studyExpiry = Infinity;
    }
  }
  if (url === "/study/catalog") {
    studyExpiry =
      data.access && data.expiresAt
        ? Date.parse(data.expiresAt)
        : data.access
          ? Infinity
          : 0;
    if (!Number.isFinite(studyExpiry) && studyExpiry !== Infinity)
      studyExpiry = 0;
    responseCache.capExpiry("/study/", studyExpiry);
    if (!data.access) responseCache.invalidate(["/study/"]);
    for (const node of data.nodes || []) {
      const path = `/study/lessons/${encodeURIComponent(node.id)}`;
      const cached = responseCache.peek(path);
      if (cached && (!node.available || cached.packageId !== node.packageId))
        responseCache.invalidate([path, "/study/practice-sessions"]);
    }
  }
  if (method === "GET" || url === "/study/catalog") return;
  if (url.startsWith("/study/teacher"))
    responseCache.invalidate(["/study/teacher/history"]);
  else if (url.startsWith("/study/"))
    responseCache.invalidate(["/study/catalog", "/study/practice-sessions"]);
  if (url.startsWith("/admin/study")) responseCache.invalidate(["/study/"]);
  if (url.startsWith("/account/"))
    responseCache.invalidate(["/study/", "/dashboard"]);
  if (/^\/(attempts|wrong|exams|ai|questions|admin)\b/.test(url))
    responseCache.invalidate(["/dashboard", "/wrong", "/exams", "/questions"]);
}

export async function api(url, body, method, options = {}) {
  const verb = method || (body ? "POST" : "GET");
  const ttl =
    options.cache === false
      ? 0
      : options.cache?.ttl || (verb === "GET" ? ttlFor(url) : 0);
  const generation = responseCache.generation;
  const load = async () => {
    try {
      return await request(url, body, verb, options, generation);
    } catch (failure) {
      // A lost acknowledgement can follow a committed answer. Re-entry must
      // recover the server's attempt instead of trusting the pre-submit group.
      if (
        generation === responseCache.generation &&
        verb !== "GET" &&
        /^\/study\/(practice-sessions\/.+\/attempts|attempts\/)/.test(url)
      )
        responseCache.invalidate([
          "/study/catalog",
          "/study/practice-sessions",
        ]);
      throw failure;
    }
  };
  // A caller-owned abort signal must not cancel a different caller's request.
  const data =
    ttl && !options.signal
      ? await responseCache.read(keyFor(url, body, verb), load, {
          ttl,
          force: options.force,
          deadline: () =>
            url.startsWith("/study/") && url !== "/study/catalog"
              ? studyExpiry
              : Infinity,
        })
      : await load();
  if (!(
    url === "/study/practice-sessions" &&
    verb === "POST" &&
    body?.resume === true
  ))
    updateCacheContext(url, verb, data);
  return data;
}

async function request(url, body, method, options, generation) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal?.addEventListener("abort", cancel, { once: true });
  if (options.signal?.aborted) cancel();
  let timedOut = false;
  const timer = setTimeout(
    () => {
      timedOut = true;
      controller.abort();
    },
    options.timeoutMs ?? (url.startsWith("/ai/") ? 210000 : 30000),
  );
  try {
    const res = await fetch("/api" + url, {
      method: method || (body ? "POST" : "GET"),
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => {
      throw new Error("服务器返回了无法识别的数据，请稍后重试");
    });
    if (!url.startsWith("/auth/") && generation !== responseCache.generation)
      throw new CacheCancelledError();
    if (!res.ok) {
      if (res.status === 401) responseCache.setScope(null);
      if (data.code === "STUDY_MEMBERSHIP_REQUIRED") {
        studyExpiry = 0;
        responseCache.invalidate(["/study/"]);
      }
      const error = new Error(data.error || "请求失败");
      error.status = res.status;
      error.code = data.code;
      error.details = data.details;
      throw error;
    }
    return data;
  } catch (error) {
    if (timedOut) throw new Error("请求超时，请检查网络后重试");
    if (error instanceof TypeError)
      throw new Error("无法连接服务器，请检查网络后重试");
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
  }
}

export async function streamApi(url, body, onEvent) {
  const res = await fetch("/api" + url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let data;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    const error = new Error(data?.error || "请求失败");
    error.status = res.status;
    throw error;
  }
  if (!res.body) throw new Error("浏览器不支持 AI 流式响应");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = null;
  const consume = (chunk) => {
    buffer += chunk;
    const records = buffer.split(/\r?\n\r?\n/);
    buffer = records.pop() || "";
    for (const record of records) {
      const line = record
        .split(/\r?\n/)
        .find((part) => part.startsWith("data:"));
      if (!line) continue;
      let event;
      try {
        event = JSON.parse(line.slice(5).trim());
      } catch {
        throw new Error("AI 流式响应格式不合法");
      }
      onEvent?.(event);
      if (event.type === "done") result = event.result;
      if (event.type === "error")
        throw new Error(event.message || "AI 生成失败");
    }
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    consume(decoder.decode(value, { stream: true }));
  }
  consume(decoder.decode());
  if (!result) throw new Error("AI 流式响应提前结束");
  updateCacheContext(url, "POST", result);
  return result;
}
