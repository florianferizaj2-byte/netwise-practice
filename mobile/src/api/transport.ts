export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 30000,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  init.signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const raw = await response.text();
    let data: unknown;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      if (response.ok)
        throw new ApiError('服务器返回了无法识别的数据，请稍后重试', 502, null);
      data = null;
    }
    if (!response.ok) {
      const message =
        data && typeof data === 'object' && 'error' in data
          ? String(data.error)
          : `请求失败（${response.status}）`;
      throw new ApiError(message, response.status, data);
    }
    return data as T;
  } catch (error) {
    if (timedOut) throw new Error('请求超时，请检查网络后重试');
    if (error instanceof TypeError)
      throw new Error('无法连接服务器，请检查网络后重试');
    throw error;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', cancel);
  }
}
