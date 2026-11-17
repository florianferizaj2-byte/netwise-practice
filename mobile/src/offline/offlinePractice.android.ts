import { useEffect, useState } from 'react';
import type { AuthResponse, PracticeCatalogResponse } from '../api/client';
import { keepPracticeQuestion, loadOwnedPractice, practiceOwner, type PracticeSelection } from '../api/ownedPractice.android';
import { practiceCheckpoint } from '../api/practiceCheckpoint.android';
import { practiceScope, type PracticeCheckpoint } from '../api/practiceCheckpointStore';
import { canReachPracticeApi } from '../api/endpoint';
import { isApiUnavailable } from '../api/transport';
import { useScreenActive } from '../navigation/ScreenActivity';
import { installedOfflinePackManifest, loadOfflinePack, type InstalledOfflinePack, type OfflinePackOwner } from './offlinePacks.android';
import { offlinePracticeCatalog, practiceQuestions, shanghaiStudyDay } from './offlineStudyCore';
import { offlineStudyStore } from './offlineStudyStore.android';
import type { OfflinePack } from './offlinePackFormat';

export function offlinePackOwner(user?: AuthResponse['user']): OfflinePackOwner | undefined {
  return user?.certificateId ? { userId: user.id, certificateId: user.certificateId } : undefined;
}

// Reading statistics is optional for opening the installed questions. Keep
// answer writes strict, so a storage failure cannot silently lose an attempt.
const emptyProgress = { answered: new Set<string>(), wrong: new Set<string>(), favorites: new Set<string>() };

export function useOfflineCatalog(user: AuthResponse['user'] | undefined, enabled: boolean) {
  const active = useScreenActive();
  const scope = user ? practiceOwner(user) : '';
  const [local, setLocal] = useState<{ scope: string; catalog: PracticeCatalogResponse; todayCount: number }>();
  useEffect(() => {
    const owner = offlinePackOwner(user);
    if (!enabled || !active || !owner) return;
    let live = true;
    void (async () => {
      const installed = await loadOfflinePack(owner);
      if (!installed || !live) return;
      const [progress, todayCount, history] = await Promise.all([
        offlineStudyStore.progress(owner).catch(() => emptyProgress),
        offlineStudyStore.todayCount(owner).catch(() => 0),
        practiceCheckpoint.history(scope).catch(() => ({})),
      ]);
      const answered = new Set([...progress.answered, ...Object.keys(history)]);
      if (live) setLocal({ scope, catalog: offlinePracticeCatalog(installed.pack, answered, progress.favorites.size), todayCount });
    })().catch(() => undefined);
    return () => { live = false; };
  }, [active, enabled, scope]);
  return enabled && local?.scope === scope ? local : undefined;
}

function seededShuffle(seed: string) {
  let state = 0;
  for (const char of seed) state = (Math.imul(state, 31) + char.charCodeAt(0)) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export async function localPracticeCheckpoint(owner: OfflinePackOwner, selection: PracticeSelection) {
  const scope = practiceOwner({ id: owner.userId, certificateId: owner.certificateId });
  return await practiceCheckpoint.read(scope, practiceScope(selection)) ||
    (selection.session === 'daily' ? null : await practiceCheckpoint.find(scope, selection));
}

export async function openPracticeWithDownloadedBank(user: AuthResponse['user'], selection: PracticeSelection,
  questionId?: string) {
  const scope = practiceOwner(user);
  const owner = offlinePackOwner(user);
  const openOnline = async () => ({ source: 'online' as const,
    loaded: await loadOwnedPractice(scope, selection, questionId) });
  if (!owner) return openOnline();

  let localError: unknown;
  const rememberLocalError = (cause: unknown) => { localError = cause; return null; };
  const manifest = await installedOfflinePackManifest(owner).catch(rememberLocalError);
  const prior = manifest ? await localPracticeCheckpoint(owner, selection).catch(() => null) : null;
  let triedLocal = false;
  const openLocal = async () => {
    triedLocal = true;
    const installed = await loadOfflinePack(owner);
    if (!installed) return null;
    const loaded = await loadLocalPractice(owner, installed, selection, prior, questionId);
    return { source: 'download' as const, installed, loaded };
  };

  if (manifest && ((prior?.offlinePackVersion && !prior.completed) || !(await canReachPracticeApi()))) {
    const local = await openLocal().catch(rememberLocalError);
    if (local) return local;
  }
  try {
    return await openOnline();
  } catch (cause) {
    if (!isApiUnavailable(cause)) throw cause;
    if (manifest && !triedLocal) {
      const local = await openLocal().catch(rememberLocalError);
      if (local) return local;
    }
    if (localError) throw localError;
    throw new Error('无法连接服务器，且当前备考证书没有可读取的本地题库。请联网后到「我的 → 设置 → 离线题库下载」检查。');
  }
}

export async function loadLocalPractice(owner: OfflinePackOwner, installed: InstalledOfflinePack,
  requested: PracticeSelection, prior: PracticeCheckpoint | null, questionId?: string) {
  const { pack } = installed;
  const sameDay = prior && shanghaiStudyDay(Date.parse(prior.before)) === shanghaiStudyDay(Date.now());
  const saved = prior && !prior.completed && (!questionId || questionId === prior.questionId) &&
    (requested.session !== 'daily' || sameDay && (['chapter', 'section', 'point'] as const)
      .every(field => !requested[field] || requested[field] === prior[field])) ? prior : null;
  const selection = saved ? { ...requested, chapter: saved.chapter, section: saved.section, point: saved.point } : requested;
  const before = saved?.before || new Date().toISOString();
  const seed = saved?.seed || Math.random().toString(36).slice(2);
  const scope = practiceOwner({ id: owner.userId, certificateId: owner.certificateId });
  const [history, progress] = await Promise.all([
    practiceCheckpoint.history(scope).catch(() => ({})),
    offlineStudyStore.progress(owner).catch(() => emptyProgress),
  ]);
  const anchor = questionId || saved?.questionId;
  const enrich = (q: OfflinePack['questions'][number]) => ({ ...q, favorite: progress.favorites.has(q.id) });
  const filter = (q: OfflinePack['questions'][number]) => q.id === anchor ||
    (selection.session === 'review' ? progress.answered.has(q.id) || keepPracticeQuestion(q, history, true) :
      (!progress.answered.has(q.id) || progress.wrong.has(q.id)) && keepPracticeQuestion(q, history));
  const random = selection.mode === 'random';
  let rows = practiceQuestions(pack, { ...selection, random }, seededShuffle(seed)).filter(filter);
  if (selection.session === 'daily') {
    const byId = new Map(pack.questions.map(q => [q.id, q]));
    const snapshot = saved?.snapshot?.map(q => byId.get(q.id));
    if (snapshot && snapshot.length && snapshot.every(q => q !== undefined)) rows = snapshot;
    else if (rows.length < 30 && (selection.chapter || selection.section || selection.point)) {
      const ids = new Set(rows.map(q => q.id));
      rows.push(...practiceQuestions(pack, { random: true }, seededShuffle(seed + '-extra')).filter(q => !ids.has(q.id) && filter(q)).slice(0, 30 - rows.length));
    }
    rows = rows.slice(0, 30);
  }
  return { items: rows.map(enrich), index: Math.max(0, rows.findIndex(q => q.id === anchor)), saved, selection, before, seed };
}
