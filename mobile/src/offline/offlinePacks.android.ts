import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as FS from 'expo-file-system/legacy';
import { APP_VERSION } from '../version';
import { mobileSessionSnapshot, mobileStudyScope } from '../api/client';
import { API_BASE_URL, resolveApiUrl } from '../api/endpoint';
import { fetchJson } from '../api/transport';
import { decodeOfflinePack, parseOfflineManifest, type OfflinePack, type OfflinePackManifest } from './offlinePackFormat';

export type OfflinePackOwner = { userId: string; certificateId: string };
type Install = { manifest: OfflinePackManifest; directory: string };
export type InstalledOfflinePack = Install & { pack: OfflinePack; imageUri: (src: string) => string | undefined };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const sha = (data: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, data);
const scope = (owner: OfflinePackOwner) => JSON.stringify([API_BASE_URL, owner.userId, owner.certificateId]);
const index = (id: string) => 'kaojiang-offline-pack-v1:' + id;
const extension = (mime: string) => mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1];
const inFlight = new Set<string>();

function packRoot(id: string) {
  if (!FS.documentDirectory) throw new Error('手机学习存储暂不可用。');
  return FS.documentDirectory + 'offline-study-v1/' + id + '/';
}

async function readInstall(id: string, certificateId: string): Promise<Install | null> {
  const raw = await AsyncStorage.getItem(index(id));
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed.directory !== 'string' || !uuid.test(parsed.directory))
    throw new Error('本机学习包索引损坏，请重新下载。');
  return { manifest: parseOfflineManifest(parsed.manifest, certificateId), directory: parsed.directory };
}

export async function installedOfflinePackManifest(owner: OfflinePackOwner) {
  const id = await sha(scope(owner));
  return (await readInstall(id, owner.certificateId))?.manifest ?? null;
}

export async function loadOfflinePack(owner: OfflinePackOwner): Promise<InstalledOfflinePack | null> {
  const id = await sha(scope(owner));
  const install = await readInstall(id, owner.certificateId);
  if (!install) return null;
  const dir = packRoot(id) + install.directory + '/';
  const file = dir + 'pack.json';
  const info = await FS.getInfoAsync(file);
  if (!info.exists || info.isDirectory || info.size !== install.manifest.bytes)
    throw new Error('本机学习包不完整，请重新下载。');
  const pack = await decodeOfflinePack(install.manifest, await FS.readAsStringAsync(file), info.size, sha);
  const files = new Map(Object.entries(pack.media).map(([key, asset], i) =>
    [key, dir + 'image-' + i + '.' + extension(asset.mimeType)] as const));
  for (const src of files.values()) {
    const image = await FS.getInfoAsync(src);
    if (!image.exists || image.isDirectory || !image.size) throw new Error('本机学习包缺少配图，请重新下载。');
  }
  return { ...install, pack, imageUri: (src) => files.get(src) };
}

export async function downloadOfflinePack(
  owner: OfflinePackOwner,
  options: { signal?: AbortSignal; onProgress?: (progress: number) => void } = {},
): Promise<OfflinePackManifest> {
  const snapshot = mobileSessionSnapshot();
  const key = scope(owner);
  const assertCurrent = () => {
    const current = mobileSessionSnapshot();
    if (options.signal?.aborted || snapshot.revision !== current.revision ||
      snapshot.token !== current.token || mobileStudyScope() !== key)
      throw new Error('下载已取消，原学习包未受影响。');
  };
  if (!snapshot.token) throw new Error('请先联网登录，再下载该证书。');
  assertCurrent();
  if (inFlight.has(key)) throw new Error('这门证书正在下载。');
  inFlight.add(key);
  let stage: string | undefined;
  let uncommitted: string | undefined;
  let request: ReturnType<typeof FS.createDownloadResumable> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => { void request?.cancelAsync().catch(() => undefined); };
  options.signal?.addEventListener('abort', cancel, { once: true });
  try {
    const id = await sha(key);
    const root = packRoot(id);
    const base = API_BASE_URL + '/offline/certificates/' + encodeURIComponent(owner.certificateId);
    const headers = { Authorization: 'Bearer ' + snapshot.token, 'X-Client': 'mobile', 'X-App-Version': APP_VERSION };
    const manifest = parseOfflineManifest(await fetchJson<unknown>(base + '/manifest',
      { headers, credentials: 'omit', signal: options.signal }), owner.certificateId);
    assertCurrent();
    const existing = await readInstall(id, owner.certificateId).catch(() => null);
    if (existing?.manifest.version === manifest.version && await loadOfflinePack(owner).catch(() => null)) {
      assertCurrent();
      options.onProgress?.(1);
      return manifest;
    }

    const directory = Crypto.randomUUID().toLowerCase();
    stage = root + 'staging-' + directory;
    await FS.makeDirectoryAsync(stage, { intermediates: true });
    const file = stage + '/pack.json';
    let oversize = false;
    let timedOut = false;
    request = FS.createDownloadResumable(resolveApiUrl(base + '/packages/' + manifest.version), file,
      { headers, cache: false }, ({ totalBytesWritten }) => {
        if (totalBytesWritten > manifest.bytes) { oversize = true; cancel(); }
        else options.onProgress?.(Math.min(0.9, totalBytesWritten / manifest.bytes * 0.9));
      });
    assertCurrent();
    timeout = setTimeout(() => { timedOut = true; cancel(); }, 5 * 60 * 1000);
    const result = await request.downloadAsync().catch((cause) => {
      if (!oversize && !timedOut && !options.signal?.aborted) throw cause;
      return undefined;
    });
    clearTimeout(timeout);
    timeout = undefined;
    assertCurrent();
    if (timedOut) throw new Error('学习包下载超时，原学习包未受影响。');
    if (result?.status === 409) throw new Error('证书学习包已有新版本，请重试下载。');
    if (oversize || result?.status !== 200) throw new Error('学习包下载不完整，原学习包未受影响。');
    const info = await FS.getInfoAsync(file);
    if (!info.exists || info.isDirectory || info.size !== manifest.bytes)
      throw new Error('学习包下载不完整，原学习包未受影响。');
    const pack = await decodeOfflinePack(manifest, await FS.readAsStringAsync(file), info.size, sha);
    let mediaIndex = 0;
    for (const asset of Object.values(pack.media)) {
      assertCurrent();
      await FS.writeAsStringAsync(stage + '/image-' + mediaIndex++ + '.' + extension(asset.mimeType),
        asset.base64, { encoding: FS.EncodingType.Base64 });
    }
    assertCurrent();
    const next = root + directory;
    uncommitted = next;
    await FS.moveAsync({ from: stage, to: next });
    assertCurrent();
    // Publish only after all bytes and media are durable, then remove the old version.
    await AsyncStorage.setItem(index(id), JSON.stringify({ manifest, directory }));
    uncommitted = undefined;
    if (existing) void FS.deleteAsync(root + existing.directory, { idempotent: true }).catch(() => undefined);
    options.onProgress?.(1);
    return manifest;
  } finally {
    if (timeout) clearTimeout(timeout);
    options.signal?.removeEventListener('abort', cancel);
    if (stage) await FS.deleteAsync(stage, { idempotent: true }).catch(() => undefined);
    if (uncommitted) await FS.deleteAsync(uncommitted, { idempotent: true }).catch(() => undefined);
    inFlight.delete(key);
  }
}
