import { AppState } from 'react-native';
import {canReplayAudio} from './audioPlaybackState';
import * as FS from 'expo-file-system/legacy';
import { createAudioPlayer } from 'expo-audio';
import { appRuntime } from '../modules/app-runtime';
import { API_BASE_URL, mobileApi } from './api/client';
import {
  voiceAssetUrl,
  type VoicePackManifest,
  type VoiceAsset,
} from './api/voicePacks';
import {
  createVoiceEngine,
  validateVoiceManifest,
  type PreparedVoice,
  type DownloadedVoicePack,
} from './practiceVoiceEngine';
import {
  DEFAULT_ANSWER_FEEDBACK,
  type AnswerFeedbackSettings,
} from './answerFeedbackSettings';
const directory = (FS.documentDirectory ?? '') + 'practice-voice-v1/';
let settings = DEFAULT_ANSWER_FEEDBACK;
const safeId = (id: string) => /^[a-z0-9][a-z0-9-]{0,47}$/.test(id);
const manifestPath = (id: string) => {
  if (!safeId(id)) throw Error('语音包编号无效');
  return directory + 'pack-' + id + '.json';
};
async function folder() {
  if (!FS.documentDirectory) throw Error('本机语音存储不可用');
  await FS.makeDirectoryAsync(directory, { intermediates: true });
}
async function read(id: string) {
  try {
    const pack = validateVoiceManifest(
      JSON.parse(await FS.readAsStringAsync(manifestPath(id))),
    );
    return pack.id === id ? pack : null;
  } catch {
    return null;
  }
}
async function list(): Promise<DownloadedVoicePack[]> {
  await folder();
  const files = await FS.readDirectoryAsync(directory);
  const rows = await Promise.all(
    files
      .filter((f) => /^pack-[a-z0-9-]+\.json$/.test(f))
      .map((f) => read(f.slice(5, -5))),
  );
  return rows
    .filter((p): p is VoicePackManifest => !!p)
    .map((p) => ({
      id: p.id,
      name: p.name,
      revision: p.revision,
      bytes: p.assets.reduce((s, a) => s + a.bytes, 0),
    }));
}
async function save(pack: VoicePackManifest) {
  await folder();
  const target = manifestPath(pack.id),
    temp = target + '.new';
  await FS.writeAsStringAsync(temp, JSON.stringify(pack));
  await FS.moveAsync({ from: temp, to: target });
}
async function prepare(
  asset: VoiceAsset,
  download: boolean,
  signal: AbortSignal,
): Promise<PreparedVoice> {
  await folder();
  if (!appRuntime) throw Error('此安装包缺少语音校验能力，请更新 APK');
  const runtime = appRuntime;
  const file = directory + asset.id + '.' + asset.format;
  const verified = async () => {
    const info = await FS.getInfoAsync(file);
    return (
      info.exists &&
      info.size === asset.bytes &&
      (await runtime.sha256File(file)) === asset.sha256
    );
  };
  const alreadyVerified=await verified();
  if(signal.aborted)throw Error('下载已取消');
  if (!alreadyVerified) {
    await FS.deleteAsync(file, { idempotent: true });
    if (!download) throw Error('本地音频缺失或损坏，请重新下载语音包');
    let stored = 0;
    for (const name of await FS.readDirectoryAsync(directory)) {
      const row = await FS.getInfoAsync(directory + name);
      if (row.exists && !row.isDirectory) stored += row.size;
    }
    if (stored + asset.bytes > 128 * 1024 * 1024)
      throw Error('本地语音空间已满，请先删除不常用语音包');
    const temp = file + '.' + Date.now() + '.part',
      request = FS.createDownloadResumable(
        voiceAssetUrl(API_BASE_URL, asset),
        temp,
        {},
      );
    let timer: ReturnType<typeof setTimeout> | undefined;
    let aborted = false,
      abortReject: ((error: Error) => void) | null = null,
      pause: Promise<unknown> | null = null;
    const cancelled = new Promise<never>((_, reject) => {
      abortReject = reject;
    });
    const cancel = () => {
      aborted = true;
      pause = request.pauseAsync().catch(() => {});
      abortReject?.(Error('下载已取消'));
    };
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    try {
      if(signal.aborted)throw Error('下载已取消');
      const result = await Promise.race([
        request.downloadAsync(),
        cancelled,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            cancel();
            reject(Error('下载超时，请重试'));
          }, 20000);
        }),
      ]);
      if (signal.aborted || aborted) throw Error('下载已取消');
      if (!result || result.status !== 200)
        throw Error('音频下载未完成，请重试');
      const info = await FS.getInfoAsync(temp);
      if (
        !info.exists ||
        info.size !== asset.bytes ||
        (await runtime.sha256File(temp)) !== asset.sha256
      )
        throw Error('音频完整性校验失败，请重新下载');
      await FS.moveAsync({ from: temp, to: file });
    } finally {
      if (timer) clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      if (pause) await pause;
      await FS.deleteAsync(temp, { idempotent: true }).catch(() => {});
    }
  }
  if (signal.aborted) throw Error('已取消');
  const player = createAudioPlayer({ uri: file }, { updateInterval: 100 });
  let revision = 0,
    removed = false,
    running = false,
    limit: ReturnType<typeof setTimeout> | null = null;
  const stop = () => {
    revision++;
    if (limit) clearTimeout(limit);
    limit = null;
    try {
      if (running) player.pause();
    } catch {}
    running = false;
  };
  const release = () => {
    if (removed) return;
    stop();
    removed = true;
    try {
      player.remove();
    } catch {}
  };
  try {
    if (!player.isLoaded)
      await new Promise<void>((resolve, reject) => {
        const finish = (error?: Error) => {
          clearTimeout(timeout);
          subscription.remove();
          signal.removeEventListener('abort', cancel);
          error ? reject(error) : resolve();
        };
        const cancel = () => finish(Error('已取消'));
        const subscription = player.addListener(
          'playbackStatusUpdate',
          (status) => {
            if (status.isLoaded) finish();
          },
        );
        const timeout = setTimeout(
          () => finish(Error('此设备暂时未能解码此语音，已回退内置音效')),
          5000,
        );
        signal.addEventListener('abort', cancel, { once: true });
        if (signal.aborted) cancel();
        else if (player.isLoaded) finish();
      });
  } catch (e) {
    release();
    throw e;
  }
  return {
    ready: () => !removed && canReplayAudio(player),
    stop,
    release,
    play(volume, maxMs, current) {
      if (removed || !canReplayAudio(player) || !current()) return false;
      stop();
      const n = revision,
        started = Date.now();
      void player
        .seekTo(0)
        .then(() => {
          if (n !== revision || !current() || Date.now() - started > 250)
            return;
          player.volume = volume;
          player.play();
          running = true;
          limit = setTimeout(stop, maxMs);
        })
        .catch(() => {});
      return true;
    },
  };
}
async function remove(id: string) {
  await FS.deleteAsync(manifestPath(id), { idempotent: true });
  const keep = new Set<string>();
  for (const pack of await list()) {
    const local = await read(pack.id);
    for (const a of local?.assets ?? []) keep.add(a.id + '.' + a.format);
  }
  for (const name of await FS.readDirectoryAsync(directory))
    if (
      /^[a-f0-9]{64}\.(wav|mp3|aac|m4a|ogg|flac)$/.test(name) &&
      !keep.has(name)
    )
      await FS.deleteAsync(directory + name, { idempotent: true });
}
export const practiceVoice = createVoiceEngine({
  catalog: () => mobileApi.voicePacks(),
  manifest: (id) => mobileApi.voicePackManifest(id),
  read,
  save,
  list,
  remove,
  prepare,
  settings: () => settings,
  active: () => AppState.currentState === 'active',
  now: Date.now,
  random: Math.random,
});
export function configurePracticeVoice(next: AnswerFeedbackSettings) {
  settings = next;
  practiceVoice.select(next.voicePackId);
}
