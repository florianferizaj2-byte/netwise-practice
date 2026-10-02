export async function api(url, body, method, options = {}) {
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
    if (!res.ok) {
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
  return result;
}
