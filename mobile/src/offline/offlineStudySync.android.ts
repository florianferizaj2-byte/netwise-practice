import { useEffect } from 'react';
import type { AuthResponse } from '../api/client';
import { mobileSessionSnapshot, mobileStudyScope, studyCache } from '../api/client';
import { API_BASE_URL } from '../api/endpoint';
import { fetchJson } from '../api/transport';
import { APP_VERSION } from '../version';
import { installedOfflinePackManifest, type OfflinePackOwner } from './offlinePacks.android';
import { offlineOwnerKey, offlineStudyStore, type OnlineStudyAttempt, type OfflineSyncReceipt } from './offlineStudyStore.android';
import { shanghaiStudyDay } from './offlineStudyCore';

export async function syncOfflineStudy(owner: OfflinePackOwner, signal?: AbortSignal) {
  const session = mobileSessionSnapshot();
  const key = offlineOwnerKey(owner);
  const same = () => !signal?.aborted && mobileSessionSnapshot().revision === session.revision &&
    mobileSessionSnapshot().token === session.token && mobileStudyScope() === key;
  if (!session.token || !same() || !await installedOfflinePackManifest(owner)) return;
  if (!same()) return;
  const base = API_BASE_URL + '/offline/certificates/' + encodeURIComponent(owner.certificateId) + '/attempts';
  const headers = {
    Authorization: 'Bearer ' + session.token, 'Content-Type': 'application/json',
    'X-Client': 'mobile', 'X-App-Version': APP_VERSION,
  };
  let uploaded = false;
  for (let batch = 0; batch < 5 && same(); batch++) {
    const rows = await offlineStudyStore.pending(owner);
    if (!rows.length || !same()) break;
    const attempts = rows.map(({ id, questionId, selected, response, timeMs, occurredAt, source, packVersion }) =>
      ({ id, questionId, selected, response, timeMs, occurredAt, source, packVersion }));
    const result = await fetchJson<OfflineSyncReceipt>(base,
      { method: 'POST', headers, body: JSON.stringify({ attempts }), signal, credentials: 'omit' }, 12000);
    if (!same()) return;
    await offlineStudyStore.applyReceipt(owner, attempts.map((row) => row.id), result);
    uploaded ||= !!result.accepted.length;
    if (result.rejected.some((row) => row.code === 'OFFLINE_CLOCK_AHEAD')) break;
  }
  if (uploaded && same()) studyCache.invalidate(['/dashboard', '/practice/catalog', '/questions?', '/wrong', '/exams']);
  const day = shanghaiStudyDay(Date.now());
  let after = 0;
  for (let index = 0; index < 20 && same(); index++) {
    const view = await fetchJson<{ day: string; attempts: OnlineStudyAttempt[]; nextCursor: number | null }>(
      base + '?day=' + day + '&after=' + after, { headers, signal, credentials: 'omit' }, 12000);
    if (!same()) return;
    if (view.day !== day || !Array.isArray(view.attempts) || view.attempts.length > 250 ||
      (view.nextCursor !== null && (!Number.isSafeInteger(view.nextCursor) || view.nextCursor <= after)))
      throw new Error('同步返回的学习记录格式不正确。');
    await offlineStudyStore.importOnline(owner, day, view.attempts);
    if (view.nextCursor === null) break;
    after = view.nextCursor;
  }
}

export function useOfflineStudySync(user: AuthResponse['user'] | undefined, appActive: boolean) {
  useEffect(() => {
    if (!appActive || !user?.certificateId) return;
    const owner = { userId: user.id, certificateId: user.certificateId };
    const stop = new AbortController();
    let running = false;
    const tick = async () => {
      if (running || stop.signal.aborted) return;
      running = true;
      try { await syncOfflineStudy(owner, stop.signal); }
      catch { /* A failed or unauthorized sync must not interrupt local learning. */ }
      finally { running = false; }
    };
    const timer = setInterval(() => void tick(), 30_000);
    void tick();
    return () => { clearInterval(timer); stop.abort(); };
  }, [user?.id, user?.certificateId, appActive]);
}
