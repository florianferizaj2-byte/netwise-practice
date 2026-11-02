/**
 * API 入口选择。
 *
 * 首选 IPv6 直连（direct.aceexam.top 只有 AAAA 记录，端口 9443），
 * 连不上时回落到走 Cloudflare IPv4/IPv6 的正式域名，避免手机在无 IPv6
 * 网络下整站不可用。网页端始终使用当前站点同源地址，不参与回落。
 */

const envPrimary = process.env.EXPO_PUBLIC_API_URL?.trim() || '';
const envFallback = process.env.EXPO_PUBLIC_API_FALLBACK_URL?.trim() || '';
const webOrigin =
  typeof document !== 'undefined' ? `${window.location.origin}/api` : '';

const DEFAULT_PRIMARY = 'https://direct.aceexam.top:9443/api';
const DEFAULT_FALLBACK = 'https://aceexam.top/api';

export const API_BASES: string[] = Array.from(
  new Set(
    [
      envPrimary || webOrigin || DEFAULT_PRIMARY,
      // 只有使用内置正式地址时才自带回落；显式配置的地址按配置执行。
      envFallback || (envPrimary || webOrigin ? '' : DEFAULT_FALLBACK),
    ].filter(Boolean),
  ),
);

/** 稳定标识：缓存键、练习归属键都用它，不随回落变化。 */
export const API_BASE_URL = API_BASES[0];
export const API_FALLBACK_URL = API_BASES[1] || '';

let activeIndex = 0;
let probe: Promise<void> | null = null;

export function activeApiBase(): string {
  return API_BASES[activeIndex] ?? API_BASE_URL;
}

/** 把以首选地址开头的 URL 改写到当前可用地址。 */
export function resolveApiUrl(url: string): string {
  const base = activeApiBase();
  if (base === API_BASE_URL || !url.startsWith(API_BASE_URL)) return url;
  return `${base}${url.slice(API_BASE_URL.length)}`;
}

/** 当前可用地址对应的资源根（去掉 /api 后缀）。 */
export function apiAssetOrigin(): string {
  return activeApiBase().replace(/\/api\/?$/, '');
}

export function preferApiBase(base: string): string {
  const index = API_BASES.indexOf(base);
  if (index >= 0 && index + 1 < API_BASES.length && activeIndex <= index)
    activeIndex = index + 1;
  return activeApiBase();
}

async function reachable(base: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(`${base}/mobile/version?probe=1`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    return response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 首次请求前确认哪条链路可用。网页端同源，无需探测。
 * 探测失败也不阻断请求，交给正常请求报错。
 */
export function ensureApiBase(): Promise<void> {
  if (probe) return probe;
  if (typeof document !== 'undefined') return Promise.resolve();
  // 只有一个地址时无需探测，避免多打一次版本接口。
  if (API_BASES.length < 2) return Promise.resolve();
  probe = (async () => {
    for (let index = 0; index < API_BASES.length; index += 1) {
      if (await reachable(API_BASES[index])) {
        activeIndex = index;
        return;
      }
    }
  })();
  return probe;
}

/** 测试用：重置探测结果与当前地址。 */
export function resetApiBaseForTest() {
  activeIndex = 0;
  probe = null;
}
