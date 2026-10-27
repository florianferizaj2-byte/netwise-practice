import {
  createPracticeVoiceSession,
  selectVoiceClip,
  voiceCueScene,
  voiceSceneClips,
  voiceCueMode,
  type VoiceAsset,
  type VoicePackCatalog,
  type VoicePackManifest,
  type PracticeVoiceCue,
} from './api/voicePacks';
export type DownloadedVoicePack = {
  id: string;
  name: string;
  revision: number;
  bytes: number;
};
export type VoiceStatus = {
  packs: VoicePackCatalog['packs'];
  downloads: DownloadedVoicePack[];
  defaultPackId: string | null;
  selected: string;
  currentName: string;
  state: 'idle' | 'loading' | 'ready' | 'fallback';
  message: string;
  downloadId: string | null;
  progress: number;
};
export type PreparedVoice = {
  ready(): boolean;
  play(volume: number, maxMs: number, current: () => boolean): boolean;
  stop(): void;
  release(): void;
};
export type VoiceDependencies = {
  catalog(): Promise<VoicePackCatalog>;
  manifest(id: string): Promise<VoicePackManifest>;
  read(id: string): Promise<VoicePackManifest | null>;
  save(pack: VoicePackManifest): Promise<void>;
  list(): Promise<DownloadedVoicePack[]>;
  remove(id: string): Promise<void>;
  prepare(
    asset: VoiceAsset,
    download: boolean,
    signal: AbortSignal,
  ): Promise<PreparedVoice>;
  settings(): { soundEnabled: boolean; volume: number };
  active(): boolean;
  now(): number;
  random(): number;
};
export function validateVoiceManifest(pack: VoicePackManifest) {
  if (
    !pack ||
    pack.schemaVersion !== 1 ||
    !pack.enabled ||
    !Array.isArray(pack.assets) ||
    pack.assets.length > 32 ||
    !pack.cues ||
    !Array.isArray(pack.cues['practice.enter']) ||
    !Array.isArray(pack.cues['answer.correct']) ||
    !Array.isArray(pack.cues['answer.streak']) ||
    pack.cues['answer.streak'].length > 20 ||
    (pack.cues['answer.wrong'] !== undefined &&
      (!Array.isArray(pack.cues['answer.wrong']) ||
        pack.cues['answer.wrong'].length > 5))
  )
    throw Error('语音包清单不完整');
  if (
    !pack.playback ||
    !Number.isInteger(pack.playback.maxDurationMs) ||
    pack.playback.maxDurationMs < 200 ||
    pack.playback.maxDurationMs > 10000 ||
    !Number.isInteger(pack.playback.minIntervalMs) ||
    pack.playback.minIntervalMs < 0 ||
    pack.playback.minIntervalMs > 5000
  )
    throw Error('语音播放设置无效');
  const ids = new Set<string>();
  let bytes = 0;
  for (const a of pack.assets) {
    if (
      !/^[a-f0-9]{64}$/.test(a.id) ||
      a.sha256 !== a.id ||
      a.url !== '/voice-packs/assets/' + a.id ||
      ids.has(a.id) ||
      !Number.isSafeInteger(a.bytes) ||
      a.bytes < 12 ||
      a.bytes > 4194304 ||
      !['wav', 'mp3', 'm4a', 'aac', 'ogg', 'flac'].includes(a.format)
    )
      throw Error('语音素材清单无效');
    ids.add(a.id);
    bytes += a.bytes;
  }
  const wrong = pack.cues['answer.wrong'] ?? [];
  if (
    new Set(wrong.map((s) => s.count)).size !== wrong.length ||
    new Set(pack.cues['answer.streak'].map((s) => s.count)).size !==
      pack.cues['answer.streak'].length
  )
    throw Error('重复的连续答题档位');
  for (const s of wrong)
    if (
      !Number.isInteger(s.count) ||
      s.count < 1 ||
      s.count > 5 ||
      !Array.isArray(s.clips) ||
      !s.clips.length
    )
      throw Error('连错设置无效');
  const modes = pack.playback.selectionModes;
  if (modes !== undefined) {
    if (
      !modes ||
      Array.isArray(modes) ||
      typeof modes !== 'object' ||
      Object.keys(modes).length > 27
    )
      throw Error('语音播放方式无效');
    for (const [key, mode] of Object.entries(modes)) {
      if (
        !['fixed', 'random'].includes(mode) ||
        !(
          key === 'practice.enter' ||
          key === 'answer.correct' ||
          /^wrong:[1-5]$/.test(key) ||
          (/^streak:\d{1,4}$/.test(key) &&
            Number(key.split(':')[1]) >= 2 &&
            Number(key.split(':')[1]) <= 1000)
        )
      )
        throw Error('语音播放方式无效');
      if (mode === 'fixed' && voiceSceneClips(pack.cues, key).length > 1)
        throw Error('固定播放只能选择一条语音');
    }
  }
  const slots = [
    pack.cues['practice.enter'],
    pack.cues['answer.correct'],
    ...wrong.map((s) => s.clips),
    ...pack.cues['answer.streak'].map((s) => {
      if (!Number.isInteger(s.count) || s.count < 2 || s.count > 1000)
        throw Error('连对设置无效');
      return s.clips;
    }),
  ];
  if (
    bytes > 20971520 ||
    slots.some(
      (s) => !Array.isArray(s) || s.length > 8 || s.some((id) => !ids.has(id)),
    )
  )
    throw Error('语音包超出限制或缺少素材');
  return pack;
}
export function createVoiceEngine(deps: VoiceDependencies) {
  let account: string | null = null,
    epoch = 0,
    activation = 0,
    selection = 'default',
    catalog: VoicePackCatalog | null = null,
    pack: VoicePackManifest | null = null,
    prepared = new Map<string, PreparedVoice>(),
    round = createPracticeVoiceSession(),
    controller: AbortController | null = null,
    downloadController: AbortController | null = null,
    lastAt = -Infinity;
  const listeners = new Set<() => void>(),
    previous = new Map<string, string>();
  let status: VoiceStatus = {
    packs: [],
    downloads: [],
    defaultPackId: null,
    selected: selection,
    currentName: '内置音效',
    state: 'idle',
    message: '下载语音包后，可离线播放',
    downloadId: null,
    progress: 0,
  };
  const emit = (patch: Partial<VoiceStatus>) => {
    status = { ...status, ...patch };
    listeners.forEach((f) => f());
  };
  const stop = () => {
    for (const p of prepared.values()) p.stop();
  };
  const release = () => {
    stop();
    for (const p of prepared.values()) p.release();
    prepared.clear();
    pack = null;
  };
  async function activate() {
    const n = ++activation,
      scope = epoch;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    release();
    previous.clear();
    lastAt = -Infinity;
    if (!account || selection === 'builtin') {
      emit({
        state: 'idle',
        currentName: '内置音效',
        message: '正在使用内置提示音',
      });
      return;
    }
    const id = selection === 'default' ? catalog?.defaultPackId : selection;
    if (!id) {
      emit({
        state: 'fallback',
        currentName: '内置音效',
        message: '后台未指定默认包，可在下方下载并选择',
      });
      return;
    }
    emit({
      state: 'loading',
      currentName: '内置音效',
      message: '正在准备本地音频，答题不受影响',
    });
    const handles = new Map<string, PreparedVoice>();
    try {
      const local = await deps.read(id);
      if (!local) throw Error('请先下载此语音包');
      validateVoiceManifest(local);
      for (const a of local.assets) {
        if (signal.aborted) throw Error('已取消');
        const p = await deps.prepare(a, false, signal);
        handles.set(a.id, p);
      }
      if (signal.aborted || scope !== epoch || n !== activation)
        throw Error('已取消');
      pack = local;
      prepared = handles;
      emit({
        state: 'ready',
        currentName: local.name,
        message: '已下载 · 刷题时仅播放本地音频',
      });
    } catch (e) {
      for (const p of handles.values()) p.release();
      if (scope === epoch && n === activation && !signal.aborted)
        emit({
          state: 'fallback',
          currentName: '内置音效',
          message:
            e instanceof Error ? e.message : '语音未就绪，使用内置提示音',
        });
    }
  }
  async function refresh() {
    if (!account) return;
    const scope = epoch;
    try {
      const [remote, downloads] = await Promise.all([
        deps.catalog(),
        deps.list(),
      ]);
      if (scope !== epoch) return;
      catalog = remote;
      emit({
        packs: remote.packs,
        defaultPackId: remote.defaultPackId,
        downloads,
      });
    } catch {
      if (scope !== epoch) return;
      emit({
        message: '暂未联网，已下载的语音包仍可使用',
        downloads: await deps.list().catch(() => []),
      });
    }
    if (scope === epoch) await activate();
  }
  async function setAccount(id: string | null) {
    if (id === account) {
      if (id) await refresh();
      return;
    }
    account = id;
    epoch++;
    activation++;
    controller?.abort();
    downloadController?.abort();
    release();
    round = createPracticeVoiceSession();
    catalog = null;
    previous.clear();
    emit({
      packs: [],
      downloads: [],
      defaultPackId: null,
      state: 'idle',
      currentName: '内置音效',
      downloadId: null,
      progress: 0,
    });
    if (id) await refresh();
  }
  async function download(id: string) {
    if (!account || status.downloadId) return false;
    const scope = epoch;
    downloadController = new AbortController();
    const signal = downloadController.signal;
    const handles: PreparedVoice[] = [];
    emit({ downloadId: id, progress: 0, message: '正在下载并校验音频' });
    try {
      const next = validateVoiceManifest(await deps.manifest(id));
      if (next.id !== id) throw Error('语音包编号不匹配');
      const total = next.assets.reduce((s, a) => s + a.bytes, 0);
      let completed = 0;
      for (const a of next.assets) {
        if (signal.aborted || scope !== epoch) throw Error('下载已取消');
        handles.push(await deps.prepare(a, true, signal));
        completed += a.bytes;
        emit({ progress: total ? Math.round((completed / total) * 100) : 100 });
      }
      if (signal.aborted || scope !== epoch) throw Error('下载已取消');
      await deps.save(next);
      if (scope !== epoch) return false;
      emit({
        downloads: await deps.list(),
        progress: 100,
        message: '下载完成，可离线使用',
      });
      return true;
    } catch (e) {
      if (scope === epoch)
        emit({
          message: e instanceof Error ? e.message : '下载未完成，可重试',
        });
      return false;
    } finally {
      handles.forEach((p) => p.release());
      if (scope === epoch) emit({ downloadId: null });
    }
  }
  function play(cue: PracticeVoiceCue | null, current: () => boolean) {
    if (!cue || !pack || !deps.active() || !current()) return false;
    const settings = deps.settings();
    if (!settings.soundEnabled || settings.volume <= 0) return false;
    let selected = selectVoiceClip(pack, cue, deps.random());
    if (!selected) return false;
    const key = voiceCueScene(pack, cue),
      slot = voiceSceneClips(pack.cues, key);
    if (
      voiceCueMode(pack, key) === 'random' &&
      slot.length > 1 &&
      previous.get(key) === selected.id
    )
      selected =
        pack.assets.find(
          (a) => a.id === slot[(slot.indexOf(selected!.id) + 1) % slot.length],
        ) ?? selected;
    const handle = prepared.get(selected.id);
    if (!handle?.ready()) return false;
    if (deps.now() - lastAt < pack.playback.minIntervalMs) return true;
    stop();
    previous.set(key, selected.id);
    lastAt = deps.now();
    const guardEpoch = epoch;
    return handle.play(
      settings.volume,
      pack.playback.maxDurationMs,
      () => guardEpoch === epoch && deps.active() && current(),
    );
  }
  const scope = (s: string) => account + ':' + s;
  return {
    getStatus: () => status,
    subscribe(f: () => void) {
      listeners.add(f);
      return () => {
        listeners.delete(f);
      };
    },
    setAccount,
    refresh,
    download,
    stop,
    cancelDownload() {
      downloadController?.abort();
    },
    select(id: string) {
      if (id === selection) return;
      selection = id;
      emit({ selected: id });
      void activate();
    },
    async remove(id: string) {
      if (status.downloadId) return;
      const selected = pack?.id === id;
      if (selected) release();
      try {
        await deps.remove(id);
        emit({ downloads: await deps.list() });
        if (selected) await activate();
      } catch (e) {
        emit({ message: e instanceof Error ? e.message : '删除失败，请重试' });
      }
    },
    enter(s: string, current: () => boolean = () => true) {
      return play(round.enter(scope(s)), current);
    },
    answer(s: string, id: string, correct: boolean, current: () => boolean) {
      round.enter(scope(s));
      const cue = round.answer(id, correct);
      if (correct !== true) stop();
      return play(cue, current);
    },
    preview(current: () => boolean = () => true) {
      return play(
        { event: 'answer.correct', streak: 1, scope: 'preview' },
        current,
      );
    },
  };
}
