import { practiceCheckpoint } from './practiceCheckpoint.android';
// Android-only integration. Never import this adapter from shared/Web screens.
import {
  API_BASE_URL,
  clearSessionToken,
  mobileApi,
  mobileSessionSnapshot,
  studyCache,
} from './client';
import { ApiError, fetchJson } from './transport';
import { activeApiBase } from './endpoint';
import { CacheCancelledError } from './resourceCache';
import { studyRequestId } from './studyTypes';
import { APP_VERSION } from '../version';
import { updateRoutePlayerIdentity } from '../../modules/route-player/index.android';
import type { LocationLearningCredentials, LocationLearningStatus } from './locationLearningTypes';

type SessionSnapshot = ReturnType<typeof mobileSessionSnapshot>;
const current = (snapshot: SessionSnapshot) => {
  const next = mobileSessionSnapshot();
  return snapshot.token === next.token && snapshot.revision === next.revision;
};
function assertCurrent(snapshot: SessionSnapshot) {
  if (!current(snapshot)) throw new CacheCancelledError();
}

let stopWatching: (() => void) | undefined;
function watchNativeAccess(snapshot: SessionSnapshot) {
  stopWatching?.();
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    unsubscribe();
    unsubscribeCache();
    if (stopWatching === stop) stopWatching = undefined;
  };
  const revoke = () => {
    stop();
    void updateRoutePlayerIdentity(null).catch(() => undefined);
  };
  const check = () => {
    if (!current(snapshot)) revoke();
  };
  // Scope resets already notify cache subscribers synchronously. Keep a timer
  // as a fallback for other session revisions, without changing shared auth.
  const unsubscribeCache = studyCache.subscribe('/location-learning/native-access', check);
  const timer = setInterval(check, 500);
  const unsubscribe = mobileApi.onStatus((status) => {
    if (status === 'expired') revoke();
  });
  stopWatching = stop;
  if (!current(snapshot)) revoke();
}

async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const snapshot = mobileSessionSnapshot();
  if (!snapshot.token) throw new ApiError('请先登录后查看今日资格', 401, null);
  let data: T;
  try {
    data = await fetchJson<T>(`${API_BASE_URL}/location-learning${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'omit',
      signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Client': 'mobile',
        'X-App-Version': APP_VERSION,
        'X-AI-Request-Id': studyRequestId(),
        Authorization: `Bearer ${snapshot.token}`,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    assertCurrent(snapshot);
    if (error instanceof ApiError && error.status === 401) void clearSessionToken();
    throw error;
  }
  assertCurrent(snapshot);
  return data;
}

export const locationLearningApi = {
  locationLearningStatus() {
    return request<LocationLearningStatus>('');
  },
  startLocationLearning(pointId: string | string[]) {
    return request<LocationLearningStatus>('/start', Array.isArray(pointId) ? (pointId.length===1?{pointId:pointId[0]}:{ pointIds: pointId }) : { pointId });
  },
  async locationLearningAction(
    id: string,
    action: 'present' | 'pulse' | 'pause' | 'answer' | 'advance' | 'cancel',
    body: unknown,
    signal?: AbortSignal,
  ) {
    const snapshot = mobileSessionSnapshot();
    try {
      const result=await request<LocationLearningStatus>(`/${encodeURIComponent(id)}/${action}`, body, signal);
      if(action==='answer' && result.session?.feedback && current(snapshot))await practiceCheckpoint.record(JSON.stringify([API_BASE_URL,result.userId,result.certificateId]),{questionId:(body as {questionId:string}).questionId,correct:result.session.feedback.correct,confirmed:true});
      return result;
    } finally {
      // A lost answer response can still have committed the normal study attempt.
      if (action === 'answer' && current(snapshot)) studyCache.invalidate([
        '/dashboard', '/practice/catalog', '/questions?', '/wrong', '/knowledge-mastery',
      ]);
    }
  },
  async locationLearningOpenCredentials(): Promise<LocationLearningCredentials> {
    const snapshot = mobileSessionSnapshot();
    const [status, dashboard] = await Promise.all([
      this.locationLearningStatus(),
      mobileApi.dashboard(true),
    ]);
    assertCurrent(snapshot);
    const threshold = 10,
      todayCount = dashboard?.todayCount;
    if (
      typeof todayCount !== 'number' ||
      !Number.isFinite(todayCount) ||
      todayCount <= threshold
    )
      throw new Error(
        `今日已答 ${Number.isFinite(todayCount) ? todayCount : 0} 题，需超过 ${threshold} 题才能进入`,
      );
    const { permit } = await request<{ permit: string }>('/permit', {});
    assertCurrent(snapshot);
    await updateRoutePlayerIdentity(`${status.userId}:${status.certificateId}`);
    if (!current(snapshot)) {
      await updateRoutePlayerIdentity(null);
      throw new CacheCancelledError();
    }
    watchNativeAccess(snapshot);
    return {
      apiBaseUrl: activeApiBase(),
      sessionToken: snapshot.token!,
      permit,
      appVersion: APP_VERSION,
    };
  },
};
