import { API_BASE_URL, clearSessionToken, mobileSessionSnapshot } from './client';
import { ApiError, fetchJson } from './transport';
import { CacheCancelledError } from './resourceCache';
import { APP_VERSION } from '../version';
import type { PointServicesResponse, PointCall, PointWallet, PointReceipt } from './pointsTypes';
import type { PointOperation } from './client';

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const snapshot = mobileSessionSnapshot();
  const changed = () => {
    const next = mobileSessionSnapshot();
    return next.revision !== snapshot.revision || next.token !== snapshot.token;
  };
  if (!snapshot.token) throw new ApiError('登录后查看 AI 积分费用', 401, null);
  try {
    const data = await fetchJson<T>(`${API_BASE_URL}/account/points${path}`, {
      signal, credentials: 'omit', headers: { Accept: 'application/json',
        Authorization: `Bearer ${snapshot.token}`, 'X-Client': 'mobile', 'X-App-Version': APP_VERSION },
    });
    if (changed()) throw new CacheCancelledError();
    return data;
  } catch (error) {
    if (changed()) throw new CacheCancelledError();
    if (error instanceof ApiError && error.status === 401) void clearSessionToken();
    throw error;
  }
}

export const androidPointsApi = {
  wallet(signal?: AbortSignal) { return get<{wallet: PointWallet}>('/wallet', signal); },
  services(signal?: AbortSignal) { return get<PointServicesResponse>('/services', signal); },
  operations(signal?: AbortSignal, offset = 0, state: PointOperation['state'] | 'all' = 'all') {
    return get<{ rows: PointOperation[]; calls: PointCall[]; nextOffset: number|null }>('/operations?limit=20&state='+state+(offset?'&offset='+offset:''), signal);
  },
  receipt(lookup: {requestId?: string; jobId?: string}, signal?: AbortSignal) {
    const query=lookup.jobId?'jobId='+encodeURIComponent(lookup.jobId):'requestId='+encodeURIComponent(lookup.requestId||'');
    return get<PointReceipt>('/receipt?'+query,signal);
  },
};

export function pointUsageLabel(feature: string, calls: PointCall[]) {
  const labels: Record<string, string> = {
    'question-hint': '分步提示', 'hint-review': '提示审核',
    'question-explanation': '题目详解', 'mistake-analysis': '错因分析',
    'daily-plan': 'AI 学习计划', 'question-generation': 'AI 出题',
    'question-review': '出题审核', 'study-generation': '短课与练习生成',
    'study-content-review': '课程审核', 'study-grading': '主观题 AI 复核',
    'study-teacher': 'AI 精炼老师答疑', 'interactive-tutor-teacher': '互动精讲答疑',
    'interactive-tutor-review': '答疑审核', 'connection-test': '接口连接测试',
    'admin-connection-test': '接口连接测试',
  };
  const label = [...new Set(calls.map(call => labels[call.taskType]).filter(Boolean))].join(' + ');
  if (label) return label;
  if (feature.includes('/ai/train') || feature.includes('/questions/generations')) return 'AI 出题';
  if (feature.includes('/ai/analyze')) return '错因分析';
  if (feature.includes('/plans/')) return 'AI 学习计划';
  return 'AI 服务';
}
