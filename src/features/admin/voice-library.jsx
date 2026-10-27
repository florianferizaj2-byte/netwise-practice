import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Music,
  FolderOpen,
  Upload,
  Play,
  Square,
  Plus,
  X,
  Save,
  Tag,
  Check,
  RefreshCw,
  Search,
} from 'lucide-react';
import { api } from '../../api.js';
import { Panel, Modal, Pagination, requestId, useAdmin } from './shared.jsx';
import {
  createPracticeVoiceSession,
  selectVoiceClip,
  voiceCueScene,
  voiceCueMode,
} from '../../../mobile/src/api/voicePacks.ts';
import {
  suggestedStreaks,
  stateLabels,
  formatSeconds,
  cueLabel,
  cueMode,
  setCueMode,
  draftSignature,
  emptyDraft,
  editDraft,
  cueClips,
  updateCue,
  usedAssetIds,
  draftIssues,
  filterVoiceAssets,
  importCollection,
  validateVoiceFile,
} from './voice-library-model.js';
import './voice-library.css';
const endpoint = '/admin/voice-packs';
const clone = (value) => JSON.parse(JSON.stringify(value));
const assetPreview = (id) =>
  '/api/admin/voice-packs/assets/' + encodeURIComponent(id);
function fileDuration(file, signal) {
  return new Promise((resolve) => {
    const audio = new Audio(),
      url = URL.createObjectURL(file);
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const cancel = () => finish(null),
      timer = setTimeout(cancel, 3000);
    signal.addEventListener('abort', cancel, { once: true });
    audio.onloadedmetadata = () =>
      finish(
        Number.isFinite(audio.duration) &&
          audio.duration > 0 &&
          audio.duration <= 600
          ? Math.round(audio.duration * 1000)
          : null,
      );
    audio.onerror = cancel;
    if (signal.aborted) {
      cancel();
      return;
    }
    audio.preload = 'metadata';
    audio.src = url;
  });
}
export function VoiceLibrary() {
  const { notify, registerNavigationGuard } = useAdmin();
  const [data, setData] = useState(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState('');
  const [search, setSearch] = useState(''),
    [collection, setCollection] = useState('all'),
    [state, setState] = useState('all'),
    [short, setShort] = useState(false),
    [offset, setOffset] = useState(0),
    [selected, setSelected] = useState([]);
  const [draft, setDraft] = useState(null),
    [savedSignature, setSavedSignature] = useState(''),
    [scene, setScene] = useState('practice.enter'),
    [extraStreaks, setExtraStreaks] = useState([]),
    [customCount, setCustomCount] = useState('');
  const [newPack, setNewPack] = useState(null),
    [editing, setEditing] = useState(null),
    [importRows, setImportRows] = useState([]),
    [importing, setImporting] = useState(false),
    [volume, setVolume] = useState(0.5),
    [playerAsset, setPlayerAsset] = useState(null),
    [playing, setPlaying] = useState(false),
    [simulation, setSimulation] = useState({
      streak: 0,
      message: '点击按钮，模拟一轮刷题',
    });
  const alive = useRef(true),
    loadId = useRef(0),
    loader = useRef(null),
    importController = useRef(null),
    importActive = useRef(false),
    lastCue = useRef(new Map()),
    importFiles = useRef([]),
    filePicker = useRef(null),
    folderPicker = useRef(null),
    audio = useRef(null),
    playRevision = useRef(0),
    playLimit = useRef(null),
    saveCommand = useRef(null),
    metaCommand = useRef(null),
    publishCommand = useRef(null),
    round = useRef(createPracticeVoiceSession());
  const dirty = !!draft && draftSignature(draft) !== savedSignature;
  const assets = data?.assets ?? [],
    live = data?.packs.find((row) => row.id === draft?.id),
    ids = usedAssetIds(draft),
    issues = draftIssues(draft, assets);
  const pending = ids.filter(
    (id) => assets.find((row) => row.id === id)?.state !== 'ready',
  );
  const filtered = useMemo(
    () => filterVoiceAssets(assets, { search, collection, state, short }),
    [assets, search, collection, state, short],
  );
  const visible = filtered.slice(offset, offset + 20),
    collections = [
      ...new Set(assets.map((row) => row.collection).filter(Boolean)),
    ].sort();
  const packs = useMemo(() => {
    const map = new Map(
      (data?.packs ?? []).map((row) => [row.id, { ...row, hasDraft: false }]),
    );
    for (const row of data?.drafts ?? [])
      map.set(row.id, {
        ...map.get(row.id),
        id: row.id,
        name: row.name,
        hasDraft: true,
      });
    return [...map.values()];
  }, [data]);
  const refresh = useCallback(async () => {
    loader.current?.abort();
    const controller = new AbortController(),
      version = ++loadId.current;
    loader.current = controller;
    try {
      const result = await api(endpoint, undefined, 'GET', {
        cache: false,
        signal: controller.signal,
      });
      if (alive.current && version === loadId.current) {
        setData(result);
        setSelected((old) =>
          old.filter((id) => result.assets.some((row) => row.id === id)),
        );
      }
      return result;
    } catch (failure) {
      if (!controller.signal.aborted && alive.current)
        setError(failure.message);
      return null;
    } finally {
      if (alive.current && version === loadId.current) setLoading(false);
    }
  }, []);
  const stop = useCallback(() => {
    playRevision.current++;
    playLimit.current = null;
    audio.current?.pause();
    if (alive.current) setPlaying(false);
  }, []);
  useEffect(() => {
    alive.current = true;
    void refresh();
    const hidden = () => {
      if (document.hidden) stop();
    };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      alive.current = false;
      loader.current?.abort();
      importController.current?.abort();
      stop();
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [refresh, stop]);
  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
  }, [volume]);
  useEffect(() => {
    setOffset(0);
  }, [search, collection, state, short]);
  useEffect(() => {
    if (offset >= filtered.length && offset > 0)
      setOffset(Math.max(0, Math.floor((filtered.length - 1) / 20) * 20));
  }, [filtered.length, offset]);
  useEffect(() => {
    registerNavigationGuard(
      dirty || importing
        ? () =>
            window.confirm(
              importing
                ? '导入仍在进行，离开会取消未完成文件；已上传素材会保留。'
                : '有尚未保存的语音包修改，确定离开吗？',
            )
        : null,
    );
    return () => registerNavigationGuard(null);
  }, [dirty, importing, registerNavigationGuard]);
  useEffect(() => {
    const guard = (e) => {
      if (dirty || importing) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty, importing]);
  async function perform(label, work) {
    if (busy) return null;
    setBusy(label);
    setError('');
    try {
      return await work();
    } catch (failure) {
      if (alive.current) {
        setError(failure.message);
        if (failure.status === 409) void refresh();
      }
      return null;
    } finally {
      if (alive.current) setBusy('');
    }
  }
  function choosePack(id, source = data, force = false) {
    if (dirty && !force && !window.confirm('放弃尚未保存的修改，切换语音包？'))
      return;
    stop();
    lastCue.current.clear();
    const published = source?.packs.find((row) => row.id === id),
      stored = source?.drafts?.find((row) => row.id === id),
      next = editDraft(stored ?? published, published);
    setDraft(next);
    setSavedSignature(draftSignature(next));
    setExtraStreaks([]);
    setScene('practice.enter');
    setSimulation({ streak: 0, message: '点击按钮，模拟一轮刷题' });
    round.current = createPracticeVoiceSession();
  }
  function createPack() {
    if (!newPack?.name.trim()) return;
    const next = emptyDraft(newPack.id, newPack.name.trim());
    setDraft(next);
    setSavedSignature('');
    setScene('practice.enter');
    setExtraStreaks([]);
    setNewPack(null);
    lastCue.current.clear();
    stop();
  }
  function addClips(values) {
    if (!draft) {
      setError('先新建或选择一个语音包，再分配素材');
      return;
    }
    try {
      if (cueMode(draft, scene) === 'fixed' && values.length > 1)
        throw Error('固定播放请选择一条语音，或切换为随机播放');
      const next = updateCue(
        draft,
        scene,
        cueMode(draft, scene) === 'fixed'
          ? values
          : [...cueClips(draft, scene), ...values],
      );
      const problem = draftIssues(next, assets);
      if (problem.length) throw Error(problem[0]);
      setDraft(next);
    } catch (failure) {
      setError(failure.message);
    }
  }
  async function saveDraftValue() {
    if (issues.length) throw Error(issues[0]);
    const signature = JSON.stringify({
      signature: draftSignature(draft),
      revision: draft.revision,
      basedOnRevision: draft.basedOnRevision,
    });
    if (saveCommand.current?.signature !== signature)
      saveCommand.current = {
        signature,
        body: {
          requestId: requestId(),
          expectedRevision: draft.revision,
          basedOnRevision: draft.basedOnRevision,
          name: draft.name.trim(),
          cues: draft.cues,
          playback: draft.playback,
        },
      };
    const result = await api(
      `${endpoint}/${draft.id}/draft`,
      saveCommand.current.body,
      'PUT',
      { cache: false },
    );
    if (alive.current) {
      setDraft(result.draft);
      setSavedSignature(draftSignature(result.draft));
    }
    await refresh();
    return result.draft;
  }
  async function save() {
    await perform('保存草稿', async () => {
      await saveDraftValue();
      notify('草稿已保存，已发布版本保持不变');
    });
  }
  async function publish() {
    if (!ids.length) {
      setError('先给至少一个场景添加素材');
      return;
    }
    if (pending.length) {
      setError(
        `选用的 ${pending.length} 条素材尚未标记已试听，请先在素材库确认`,
      );
      return;
    }
    if (!window.confirm('发布后这些语音将成为公开素材。确认发布当前配置？'))
      return;
    await perform('发布', async () => {
      const saved = dirty || !draft.revision ? await saveDraftValue() : draft;
      const signature = JSON.stringify({
        id: saved.id,
        revision: saved.revision,
        basedOnRevision: saved.basedOnRevision,
      });
      if (publishCommand.current?.signature !== signature)
        publishCommand.current = {
          signature,
          body: {
            requestId: requestId(),
            expectedRevision: saved.basedOnRevision,
            draftRevision: saved.revision,
          },
        };
      await api(
        `${endpoint}/${saved.id}/publish`,
        publishCommand.current.body,
        'POST',
        { cache: false },
      );
      const next = await refresh();
      if (next) choosePack(saved.id, next, true);
      notify('语音包已发布');
    });
  }
  async function setDefault(packId) {
    await perform('设置默认包', async () => {
      await api(
        endpoint + '/default',
        {
          requestId: requestId(),
          expectedRevision: data.configuration.revision,
          packId,
        },
        'PUT',
        { cache: false },
      );
      await refresh();
      notify(packId ? '已设为默认语音包' : '已恢复内置音效');
    });
  }
  async function unpublish() {
    if (
      !live ||
      !window.confirm(
        '下架后 App 不再获取这个语音包，素材和草稿都会保留。继续？',
      )
    )
      return;
    await perform('下架', async () => {
      await api(
        `${endpoint}/${live.id}`,
        {
          requestId: requestId(),
          expectedRevision: live.revision,
          name: live.name,
          enabled: false,
          cues: live.cues,
          playback: live.playback,
        },
        'PUT',
        { cache: false },
      );
      await refresh();
      notify('语音包已下架，素材仍保留');
    });
  }
  async function metadata(items, message = '素材信息已保存') {
    return perform('保存素材', async () => {
      const signature = JSON.stringify(items);
      if (metaCommand.current?.signature !== signature)
        metaCommand.current = {
          signature,
          body: { requestId: requestId(), items },
        };
      await api(endpoint + '/assets', metaCommand.current.body, 'PATCH', {
        cache: false,
      });
      metaCommand.current = null;
      await refresh();
      setEditing(null);
      notify(message);
      return true;
    });
  }
  function editAssets(rows) {
    setEditing({
      rows,
      name: rows.length === 1 ? rows[0].name : '',
      collection: rows.length === 1 ? rows[0].collection : '',
      tags: rows.length === 1 ? rows[0].tags.join('，') : '',
      applyCollection: rows.length === 1,
      applyTags: rows.length === 1,
    });
  }
  async function saveMetadata() {
    const tags = [
      ...new Set(
        editing.tags
          .split(/[,，]/)
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];
    await metadata(
      editing.rows.map((row) => ({
        id: row.id,
        expectedRevision: row.revision,
        ...(editing.rows.length === 1 ? { name: editing.name.trim() } : {}),
        ...(editing.applyCollection
          ? { collection: editing.collection.trim() }
          : {}),
        ...(editing.applyTags ? { tags } : {}),
      })),
    );
  }
  async function changeState(rows, next) {
    await metadata(
      rows.map((row) => ({
        id: row.id,
        expectedRevision: row.revision,
        state: next,
      })),
      next === 'ready'
        ? '已标记为已试听'
        : next === 'disabled'
          ? '素材已停用'
          : '素材状态已更新',
    );
  }
  async function playAsset(asset, limit = null) {
    if (!audio.current || !asset) return;
    stop();
    const revision = ++playRevision.current;
    setPlayerAsset(asset);
    playLimit.current = limit;
    const player = audio.current;
    player.src = assetPreview(asset.id);
    player.volume = volume;
    player.load();
    try {
      await player.play();
      if (alive.current && revision === playRevision.current) setPlaying(true);
    } catch (failure) {
      if (
        alive.current &&
        revision === playRevision.current &&
        failure.name !== 'AbortError'
      )
        setError('试听失败，请检查登录状态或音频格式');
    }
  }
  function simulate(kind) {
    if (!draft) return;
    let cue;
    if (kind === 'reset') {
      round.current = createPracticeVoiceSession();
      stop();
      setSimulation({ streak: 0, wrongStreak: 0, message: '本轮已重置' });
      return;
    }
    if (kind === 'enter') {
      round.current = createPracticeVoiceSession();
      cue = round.current.enter('preview:' + draft.id);
      setSimulation({ streak: 0, wrongStreak: 0, message: '进入刷题' });
    } else {
      round.current.enter('preview:' + draft.id);
      const correct = kind === 'correct';
      cue = round.current.answer(requestId(), correct);
      setSimulation({
        streak: correct ? cue.streak : 0,
        wrongStreak: correct ? 0 : cue.streak,
        message: correct
          ? '连续答对 ' + cue.streak + ' 次'
          : '连续答错 ' +
            cue.streak +
            ' 次' +
            (cue.streak >= 5 ? '（第5档）' : ''),
      });
    }
    const manifest = { ...draft, enabled: true, schemaVersion: 1, assets };
    let clip = selectVoiceClip(manifest, cue, Math.random());
    const eventScene = voiceCueScene(manifest, cue);
    const key = draft.id + ':' + eventScene,
      choices = cueClips(draft, eventScene);
    if (
      clip &&
      voiceCueMode(manifest, eventScene) === 'random' &&
      choices.length > 1 &&
      lastCue.current.get(key) === clip.id
    ) {
      const other = choices.filter((id) => id !== clip.id);
      clip =
        assets.find(
          (row) => row.id === other[Math.floor(Math.random() * other.length)],
        ) ?? clip;
    }
    if (clip) lastCue.current.set(key, clip.id);
    if (clip) void playAsset(clip, draft.playback.maxDurationMs);
    else {
      stop();
      setSimulation((old) => ({
        ...old,
        message:
          old.message +
          (cue.event === 'answer.wrong'
            ? ' · 本档未配语音，保持安静'
            : ' · 未配置素材，实际 App 保留内置音效'),
      }));
    }
  }
  async function importBatch(files, retry = false) {
    if (importActive.current || !files.length) return;
    if (files.length > 200) {
      setError('一次最多导入 200 个文件，请分批选择');
      return;
    }
    const controller = new AbortController();
    importController.current = controller;
    importActive.current = true;
    setImporting(true);
    setError('');
    const jobs = files.map((file, index) => ({
      file,
      index,
      name: file.name,
      status: 'queued',
      error: '',
    }));
    importFiles.current = files;
    setImportRows(jobs.map(({ file, ...row }) => row));
    let cursor = 0;
    const update = (index, patch) => {
      if (alive.current)
        setImportRows((old) =>
          old.map((row) => (row.index === index ? { ...row, ...patch } : row)),
        );
    };
    async function worker() {
      while (cursor < jobs.length && !controller.signal.aborted) {
        const job = jobs[cursor++];
        const invalid = validateVoiceFile(
          job.file,
          data?.contract.maxAssetBytes,
        );
        if (invalid) {
          update(job.index, { status: 'failed', error: invalid });
          continue;
        }
        update(job.index, { status: 'uploading' });
        try {
          const duration = await fileDuration(job.file, controller.signal);
          if (controller.signal.aborted) break;
          const query = new URLSearchParams({
            name: job.file.name,
            collection: importCollection(
              job.file,
              collection === 'all' ? '' : collection,
            ),
            ...(duration ? { durationMs: String(duration) } : {}),
          });
          const result = await api(
            endpoint + '/assets?' + query,
            job.file,
            'POST',
            { raw: true, cache: false, signal: controller.signal },
          );
          update(job.index, {
            status: result.created ? 'done' : 'duplicate',
            assetId: result.asset.id,
          });
        } catch (failure) {
          update(job.index, {
            status: controller.signal.aborted ? 'cancelled' : 'failed',
            error: controller.signal.aborted
              ? '已停止；在途文件可能已入库，重试会自动复用'
              : failure.message,
          });
          if (failure.status === 401 || failure.status === 403) {
            controller.abort();
            if (alive.current) setError('登录或管理员权限已失效，导入已停止');
          }
        }
      }
    }
    await Promise.all([worker(), worker()]);
    importActive.current = false;
    if (alive.current) {
      setImportRows((old) =>
        old.map((row) =>
          ['queued', 'uploading'].includes(row.status)
            ? {
                ...row,
                status: 'cancelled',
                error:
                  row.status === 'queued'
                    ? '尚未上传，可重试'
                    : '已停止；在途文件可能已入库，重试会自动复用',
              }
            : row,
        ),
      );
      setImporting(false);
      await refresh();
    }
  }
  function selectedRows() {
    return assets.filter((row) => selected.includes(row.id));
  }
  const completed = importRows.filter((row) =>
    ['done', 'duplicate', 'failed', 'cancelled'].includes(row.status),
  ).length;
  const failures = importRows.filter((row) =>
    ['failed', 'cancelled'].includes(row.status),
  );
  if (loading)
    return (
      <Panel title="语音包管理">
        <p role="status">正在读取语音素材…</p>
      </Panel>
    );
  if (!data)
    return (
      <Panel title="语音包管理">
        <p role="alert">{error || '素材库加载失败'}</p>
        <button onClick={() => void refresh()}>重新加载</button>
      </Panel>
    );
  const scenes = [
    'practice.enter',
    'answer.correct',
    ...[
      ...new Set([
        ...suggestedStreaks,
        ...extraStreaks,
        ...(draft?.cues['answer.streak'].map((row) => row.count) ?? []),
      ]),
    ]
      .sort((a, b) => a - b)
      .map((count) => 'streak:' + count),
    ...[1, 2, 3, 4, 5].map((count) => 'wrong:' + count),
  ];
  return (
    <div className="ac-voice-library">
      <div className="ac-voice-intro">
        <div>
          <span className="ac-voice-kicker">VOICE LIBRARY</span>
          <h2>让每一次进步，都有回应</h2>
          <p>素材先试听，再分配场景；保存草稿不会影响已发布版本。</p>
        </div>
        <button onClick={() => void refresh()} disabled={importing || !!busy}>
          <RefreshCw size={16} />
          刷新
        </button>
      </div>
      {error && !editing && !newPack && (
        <div role="alert" className="ac-voice-alert">
          {error}
          <button aria-label="关闭提示" onClick={() => setError('')}>
            <X size={15} />
          </button>
        </div>
      )}
      <div className="ac-voice-stats">
        <div>
          <strong>{assets.length}</strong>
          <span>语音素材</span>
        </div>
        <div>
          <strong>
            {assets.filter((row) => row.state === 'pending').length}
          </strong>
          <span>待试听确认</span>
        </div>
        <div>
          <strong>{packs.length}</strong>
          <span>语音包</span>
        </div>
        <div>
          <strong>
            {data.configuration.defaultPackId
              ? data.packs.find(
                  (row) => row.id === data.configuration.defaultPackId,
                )?.name
              : '内置音效'}
          </strong>
          <span>当前默认</span>
        </div>
      </div>
      <div className="ac-voice-layout">
        <Panel
          title="素材库"
          description="支持文件夹导入，按文件内容去重，不改动原文件。"
          className="ac-voice-materials"
          actions={
            <div className="ac-voice-actions">
              <button
                disabled={importing}
                onClick={() => folderPicker.current.click()}
              >
                <FolderOpen size={16} />
                导入文件夹
              </button>
              <button
                className="ac-voice-primary"
                disabled={importing}
                onClick={() => filePicker.current.click()}
              >
                <Upload size={16} />
                导入音频
              </button>
            </div>
          }
        >
          <input
            hidden
            ref={filePicker}
            data-testid="voice-file-input"
            type="file"
            multiple
            accept=".mp3,.wav,.aac,.m4a,.ogg,.flac"
            onChange={(e) => {
              void importBatch([...e.target.files]);
              e.target.value = '';
            }}
          />
          <input
            hidden
            ref={folderPicker}
            data-testid="voice-folder-input"
            type="file"
            multiple
            webkitdirectory=""
            onChange={(e) => {
              void importBatch([...e.target.files]);
              e.target.value = '';
            }}
          />
          <div
            className="ac-voice-drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!importing) void importBatch([...e.dataTransfer.files]);
            }}
          >
            <Upload size={17} />
            <span>也可以把音频文件拖到这里；文件夹请用上方按钮选择</span>
          </div>
          {!!importRows.length && (
            <div className="ac-voice-import" role="status" aria-live="polite">
              <div>
                <strong>
                  {importing ? '正在导入' : '导入结果'} {completed}/
                  {importRows.length}
                </strong>
                <span>
                  新增{' '}
                  {importRows.filter((row) => row.status === 'done').length} ·
                  已存在{' '}
                  {
                    importRows.filter((row) => row.status === 'duplicate')
                      .length
                  }{' '}
                  · 未完成 {failures.length}
                </span>
              </div>
              <progress
                aria-label="音频导入进度"
                max={importRows.length}
                value={completed}
              />
              {importing ? (
                <button onClick={() => importController.current?.abort()}>
                  停止导入
                </button>
              ) : (
                failures.length > 0 && (
                  <button
                    onClick={() =>
                      void importBatch(
                        failures.map((row) => importFiles.current[row.index]),
                        true,
                      )
                    }
                  >
                    重试失败文件
                  </button>
                )
              )}
              {failures.length > 0 && (
                <details open={!importing}>
                  <summary>查看未完成文件</summary>
                  <ul>
                    {failures.map((row) => (
                      <li key={row.index}>
                        {row.name}：{row.error}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
          <div className="ac-voice-filters">
            <label className="ac-voice-search">
              <Search size={17} />
              <input
                aria-label="搜索语音素材"
                placeholder="搜索名称、标签"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <select
              aria-label="素材状态"
              value={state}
              onChange={(e) => setState(e.target.value)}
            >
              <option value="all">全部状态</option>
              {Object.entries(stateLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <label className="ac-voice-check">
              <input
                type="checkbox"
                checked={short}
                onChange={(e) => setShort(e.target.checked)}
              />
              仅 3 秒以内
            </label>
          </div>
          <div className="ac-voice-collections" aria-label="素材分组">
            <button
              aria-pressed={collection === 'all'}
              onClick={() => setCollection('all')}
            >
              全部 {assets.length}
            </button>
            {collections.map((name) => (
              <button
                key={name}
                aria-pressed={collection === name}
                onClick={() => setCollection(name)}
              >
                {name} {assets.filter((row) => row.collection === name).length}
              </button>
            ))}
            <button
              aria-pressed={collection === ''}
              onClick={() => setCollection('')}
            >
              未分组
            </button>
          </div>
          <div className="ac-voice-bulk">
            <label className="ac-voice-check">
              <input
                type="checkbox"
                aria-label="选择当前页素材"
                checked={
                  visible.length > 0 &&
                  visible.every((row) => selected.includes(row.id))
                }
                onChange={(e) =>
                  setSelected((old) =>
                    e.target.checked
                      ? [...new Set([...old, ...visible.map((row) => row.id)])]
                      : old.filter(
                          (id) => !visible.some((row) => row.id === id),
                        ),
                  )
                }
              />
              已选 {selected.length}
            </label>
            {filtered.length > 20 && filtered.length <= 100 && (
              <button
                onClick={() =>
                  setSelected([
                    ...new Set([...selected, ...filtered.map((row) => row.id)]),
                  ])
                }
              >
                选择筛选结果 {filtered.length} 条
              </button>
            )}
            <button
              disabled={!selected.length || selected.length > 100 || !!busy}
              onClick={() => editAssets(selectedRows())}
            >
              <Tag size={14} />
              批量分组/标签
            </button>
            <button
              disabled={!selected.length || selected.length > 100 || !!busy}
              onClick={() => void changeState(selectedRows(), 'ready')}
            >
              <Check size={14} />
              标记已试听
            </button>
            <button
              disabled={!selected.length || !draft}
              onClick={() => addClips(selected)}
            >
              加入当前场景
            </button>
            {!!selected.length && (
              <button onClick={() => setSelected([])}>清空选择</button>
            )}
          </div>
          <div className="ac-table-scroll">
            <table className="ac-table ac-voice-table">
              <thead>
                <tr>
                  <th scope="col">选择</th>
                  <th scope="col">素材</th>
                  <th scope="col">时长</th>
                  <th scope="col">状态 / 用途</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((asset) => (
                  <tr key={asset.id} data-testid={'voice-asset-' + asset.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={'选择 ' + asset.name}
                        checked={selected.includes(asset.id)}
                        onChange={(e) =>
                          setSelected((old) =>
                            e.target.checked
                              ? [...old, asset.id]
                              : old.filter((id) => id !== asset.id),
                          )
                        }
                      />
                    </td>
                    <td>
                      <div className="ac-voice-name">
                        <button
                          className="ac-voice-play"
                          aria-label={'试听 ' + asset.name}
                          onClick={() => void playAsset(asset)}
                        >
                          <Play size={16} />
                        </button>
                        <div>
                          <strong title={asset.name}>{asset.name}</strong>
                          <small>
                            {asset.collection || '未分组'} ·{' '}
                            {Math.ceil(asset.bytes / 1024)} KB
                          </small>
                          {asset.tags.length > 0 && (
                            <span className="ac-voice-tags">
                              {asset.tags.map((tag) => (
                                <span key={tag}>{tag}</span>
                              ))}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span>{formatSeconds(asset.durationMs)}</span>
                      {asset.durationMs > 3000 && (
                        <small className="ac-voice-long">长音频</small>
                      )}
                    </td>
                    <td>
                      <span className={'ac-voice-state is-' + asset.state}>
                        {stateLabels[asset.state]}
                      </span>
                      <small
                        title={asset.usedBy
                          .map(
                            (row) => row.name + (row.draft ? '（草稿）' : ''),
                          )
                          .join('、')}
                      >
                        {asset.usedBy.length
                          ? '用于 ' + asset.usedBy.length + ' 个配置'
                          : '尚未分配'}
                      </small>
                    </td>
                    <td>
                      <div className="ac-voice-row-actions">
                        <button
                          aria-label={'编辑 ' + asset.name}
                          onClick={() => editAssets([asset])}
                        >
                          编辑
                        </button>
                        <button
                          aria-label={
                            '添加 ' + asset.name + ' 到 ' + cueLabel(scene)
                          }
                          disabled={!draft || asset.state === 'disabled'}
                          onClick={() => addClips([asset.id])}
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && (
              <div className="ac-voice-empty">
                <Music size={30} />
                <strong>
                  {assets.length ? '没有符合条件的素材' : '先导入一组声音吧'}
                </strong>
                <p>可以一次选择整个文件夹，导入后都处于待试听状态。</p>
              </div>
            )}
          </div>
          <Pagination
            total={filtered.length}
            limit={20}
            offset={offset}
            onChange={setOffset}
          />
        </Panel>
        <div className="ac-voice-editor">
          <Panel
            title="场景编排"
            description="为一轮刷题安排合适的声音"
            actions={
              <button
                onClick={() => {
                  if (dirty && !window.confirm('放弃未保存修改，创建新包？'))
                    return;
                  setNewPack({
                    name:
                      collection === 'all' || !collection
                        ? '新的语音包'
                        : collection,
                    id: 'voice-' + requestId().slice(0, 8),
                  });
                }}
              >
                <Plus size={15} />
                新建
              </button>
            }
          >
            <label className="ac-voice-field">
              选择语音包
              <select
                aria-label="选择语音包"
                value={draft?.id ?? ''}
                onChange={(e) => choosePack(e.target.value)}
              >
                <option value="" disabled>
                  请选择或新建
                </option>
                {draft && !packs.some((row) => row.id === draft.id) && (
                  <option value={draft.id}>{draft.name} · 未保存</option>
                )}
                {packs.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                    {row.hasDraft
                      ? ' · 有草稿'
                      : row.enabled
                        ? ' · 已发布'
                        : ' · 已下架'}
                  </option>
                ))}
              </select>
            </label>
            {!draft ? (
              <div className="ac-voice-empty">
                <Music size={28} />
                <p>先新建一个语音包，再把素材加入右侧场景。</p>
              </div>
            ) : (
              <>
                <label className="ac-voice-field">
                  语音包名称
                  <input
                    aria-label="语音包名称"
                    maxLength={60}
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                  />
                </label>
                <div className="ac-voice-actions">
                  <button
                    disabled={!!busy}
                    onClick={() =>
                      void refresh().then((next) => {
                        if (next) choosePack(draft.id, next);
                      })
                    }
                  >
                    重新载入
                  </button>
                </div>
                {live && live.revision !== draft.basedOnRevision && (
                  <div className="ac-voice-warning">
                    发布版本已更新，本地编辑不会自动覆盖它。
                    <button
                      onClick={() => {
                        if (
                          !window.confirm(
                            '使用最新发布内容重新编排？本地未保存修改将被替换。',
                          )
                        )
                          return;
                        const next = {
                          ...editDraft(live, live),
                          revision:
                            data.drafts.find((row) => row.id === live.id)
                              ?.revision ?? 0,
                        };
                        setDraft(next);
                        setSavedSignature('');
                      }}
                    >
                      以发布版本重新编排
                    </button>
                  </div>
                )}
                <div className="ac-voice-draft-info">
                  <span>
                    {live?.enabled ? '已发布 v' + live.revision : '尚未发布'}
                  </span>
                  <span>
                    {dirty
                      ? '有未保存修改'
                      : draft.revision
                        ? '草稿已保存'
                        : '正在编辑'}
                  </span>
                  <strong>{ids.length}/32 条素材</strong>
                </div>
                <div className="ac-voice-scenes" aria-label="语音场景">
                  {scenes.map((key) => (
                    <button
                      key={key}
                      aria-pressed={scene === key}
                      onClick={() => setScene(key)}
                    >
                      {cueLabel(key)}
                      <span>{cueClips(draft, key).length}</span>
                    </button>
                  ))}
                </div>
                <form
                  className="ac-voice-custom"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const count = Number(customCount);
                    if (!Number.isInteger(count) || count < 2 || count > 1000) {
                      setError('次数应为 2–1000 的整数');
                      return;
                    }
                    if (
                      !scenes.includes('streak:' + count) &&
                      scenes.filter((key) => key.startsWith('streak:'))
                        .length >= 20
                    ) {
                      setError('最多配置 20 个连对场景');
                      return;
                    }
                    setExtraStreaks((old) => [...new Set([...old, count])]);
                    setScene('streak:' + count);
                    setCustomCount('');
                  }}
                >
                  <input
                    aria-label="自定义连对次数"
                    type="number"
                    min="2"
                    max="1000"
                    value={customCount}
                    onChange={(e) => setCustomCount(e.target.value)}
                    placeholder="自定义次数"
                  />
                  <button type="submit">添加场景</button>
                </form>
                <div className="ac-voice-cue">
                  <h3>
                    {cueLabel(scene)}
                    <span>{cueClips(draft, scene).length}/{cueMode(draft,scene)==='fixed'?1:8}</span>
                  </h3>
                  <label className="ac-voice-field">
                    播放方式
                    <select
                      aria-label="当前场景播放方式"
                      value={cueMode(draft, scene)}
                      onChange={(e) => {
                        const mode = e.target.value;
                        if (
                          mode === 'fixed' &&
                          cueClips(draft, scene).length > 1 &&
                          !window.confirm(
                            '改为固定播放将仅保留当前第一条语音，其他素材不会被删除。继续吗？',
                          )
                        )
                          return;
                        setDraft(setCueMode(draft, scene, mode));
                      }}
                    >
                      <option value="random">从所选语音中随机</option>
                      <option value="fixed">固定播放一条</option>
                    </select>
                  </label>
                  <p>
                    {cueMode(draft, scene) === 'random'
                      ? '下方是本场景的随机候选池，只在这些语音里抽取；多条时避免紧邻重复。'
                      : '固定播放一条；从素材库添加新语音将替换当前选择。'}
                  </p>
                  {cueClips(draft, scene).length ? (
                    cueClips(draft, scene).map((id) => {
                      const row = assets.find((asset) => asset.id === id);
                      return (
                        <div key={id} className="ac-voice-cue-row">
                          <button
                            aria-label={'试听场景素材 ' + (row?.name ?? id)}
                            disabled={!row}
                            onClick={() => void playAsset(row)}
                          >
                            <Play size={14} />
                          </button>
                          <span>{row?.name ?? '素材不存在'}</span>
                          <button
                            aria-label={
                              '从 ' +
                              cueLabel(scene) +
                              ' 移除 ' +
                              (row?.name ?? id)
                            }
                            onClick={() =>
                              setDraft(
                                updateCue(
                                  draft,
                                  scene,
                                  cueClips(draft, scene).filter(
                                    (value) => value !== id,
                                  ),
                                ),
                              )
                            }
                          >
                            <X size={14} />
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <div className="ac-voice-cue-empty">
                      {scene.startsWith('wrong:')
                        ? '本档未配置语音，答错时保持安静'
                        : '还没有声音，实际 App 将保留内置音效'}
                    </div>
                  )}
                </div>
                <label className="ac-voice-field">
                  单次播放上限
                  <select
                    aria-label="单次播放上限"
                    value={draft.playback.maxDurationMs}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        playback: {
                          ...draft.playback,
                          maxDurationMs: Number(e.target.value),
                        },
                      })
                    }
                  >
                    <option value={2500}>2.5 秒</option>
                    <option value={5000}>5 秒</option>
                    <option value={10000}>10 秒</option>
                    {![2500, 5000, 10000].includes(
                      draft.playback.maxDurationMs,
                    ) && (
                      <option value={draft.playback.maxDurationMs}>
                        {draft.playback.maxDurationMs / 1000} 秒
                      </option>
                    )}
                  </select>
                </label>
                {ids.some(
                  (id) =>
                    (assets.find((row) => row.id === id)?.durationMs ?? 0) >
                    draft.playback.maxDurationMs,
                ) && (
                  <p className="ac-voice-warning">
                    选用素材中有音频超过播放上限，模拟时会停止在上限处；建议试听后选择合适的短片段。
                  </p>
                )}
                {issues.map((item) => (
                  <p key={item} className="ac-voice-warning">
                    {item}
                  </p>
                ))}
                {pending.length > 0 && (
                  <p className="ac-voice-warning">
                    选用的 {pending.length} 条素材待试听确认，确认后才能发布。
                  </p>
                )}
                <div className="ac-voice-save">
                  <button
                    disabled={!!busy || !dirty}
                    onClick={() => void save()}
                  >
                    <Save size={15} />
                    {busy === '保存草稿' ? '保存中…' : '保存草稿'}
                  </button>
                  <button
                    className="ac-voice-primary"
                    disabled={
                      !!busy ||
                      !!issues.length ||
                      !ids.length ||
                      pending.length > 0
                    }
                    onClick={() => void publish()}
                  >
                    {busy === '发布' ? '发布中…' : '发布语音包'}
                  </button>
                </div>
                <div className="ac-voice-actions">
                  {live?.enabled && (
                    <>
                      <button
                        disabled={
                          !!busy ||
                          data.configuration.defaultPackId === draft.id
                        }
                        onClick={() => void setDefault(draft.id)}
                      >
                        {data.configuration.defaultPackId === draft.id
                          ? '当前默认包'
                          : '设为默认包'}
                      </button>
                      <button
                        disabled={!!busy}
                        onClick={() => void unpublish()}
                      >
                        下架
                      </button>
                    </>
                  )}
                  {data.configuration.defaultPackId && (
                    <button
                      disabled={!!busy}
                      onClick={() => void setDefault(null)}
                    >
                      恢复内置音效
                    </button>
                  )}
                </div>
              </>
            )}
          </Panel>
          <Panel
            title="模拟试听"
            description="直接在后台听效果，不必反复装 APK。"
          >
            <div className="ac-voice-simulator">
              <strong aria-live="polite">{simulation.streak} 连对</strong>
              <span aria-live="polite">{simulation.wrongStreak ?? 0} 连错</span>
              <p role="status">{simulation.message}</p>
              <div className="ac-voice-actions">
                <button disabled={!draft} onClick={() => simulate('enter')}>
                  进入刷题
                </button>
                <button disabled={!draft} onClick={() => simulate('correct')}>
                  答对 · 连对＋1
                </button>
                <button disabled={!draft} onClick={() => simulate('wrong')}>
                  答错 · 连错＋1
                </button>
                <button disabled={!draft} onClick={() => simulate('reset')}>
                  重置本轮
                </button>
              </div>
            </div>
            <p className="ac-voice-note">
              连错按连续次数计数，答对清零；第5档覆盖第5次及以上。需要 v1.0.6
              或更新 APK，并下载此语音包的最新版本。
            </p>
          </Panel>
        </div>
      </div>
      <div className="ac-voice-player">
        <div>
          <Music size={20} />
          <div>
            <strong>{playerAsset?.name ?? '选择一条素材试听'}</strong>
            <small>
              {playing ? '正在播放' : '原文件保留，不会修改音频内容'}
            </small>
          </div>
        </div>
        <audio
          ref={audio}
          controls
          preload="none"
          aria-label="语音素材试听播放器"
          onPause={() => setPlaying(false)}
          onEnded={() => {
            playLimit.current = null;
            setPlaying(false);
          }}
          onPlay={() => setPlaying(true)}
          onTimeUpdate={() => {
            if (
              playLimit.current !== null &&
              audio.current.currentTime * 1000 >= playLimit.current
            )
              stop();
          }}
        />
        <button aria-label="停止试听" onClick={stop}>
          <Square size={15} />
        </button>
        <label>
          音量
          <input
            aria-label="试听音量"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
          />
        </label>
      </div>
      {newPack && (
        <Modal title="新建语音包" onClose={() => setNewPack(null)}>
          <form
            className="ac-voice-form"
            onSubmit={(e) => {
              e.preventDefault();
              createPack();
            }}
          >
            <label>
              名称
              <input
                autoFocus
                aria-label="新语音包名称"
                maxLength={60}
                required
                value={newPack.name}
                onChange={(e) =>
                  setNewPack({ ...newPack, name: e.target.value })
                }
              />
            </label>
            <p>编号会自动生成，素材不会因为创建语音包而自动发布。</p>
            <button className="ac-voice-primary" type="submit">
              创建并编排
            </button>
          </form>
        </Modal>
      )}
      {editing && (
        <Modal
          title={
            editing.rows.length === 1
              ? '编辑素材信息'
              : '批量编辑 ' + editing.rows.length + ' 条素材'
          }
          onClose={() => setEditing(null)}
        >
          <form
            className="ac-voice-form"
            onSubmit={(e) => {
              e.preventDefault();
              void saveMetadata();
            }}
          >
            {error && (
              <p role="alert" className="ac-voice-warning">
                {error}
              </p>
            )}
            {editing.rows.length === 1 && (
              <label>
                显示名称
                <input
                  aria-label="素材显示名称"
                  required
                  maxLength={100}
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                />
              </label>
            )}
            <label className="ac-voice-check">
              <input
                type="checkbox"
                checked={editing.applyCollection}
                onChange={(e) =>
                  setEditing({ ...editing, applyCollection: e.target.checked })
                }
              />
              修改分组
            </label>
            <input
              aria-label="素材分组"
              disabled={!editing.applyCollection}
              maxLength={60}
              list="voice-collections"
              value={editing.collection}
              onChange={(e) =>
                setEditing({ ...editing, collection: e.target.value })
              }
            />
            <datalist id="voice-collections">
              {collections.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <label className="ac-voice-check">
              <input
                type="checkbox"
                checked={editing.applyTags}
                onChange={(e) =>
                  setEditing({ ...editing, applyTags: e.target.checked })
                }
              />
              修改标签（覆盖所选素材原标签）
            </label>
            <input
              aria-label="素材标签"
              disabled={!editing.applyTags}
              placeholder="例如：入场，鼓励，搞怪"
              value={editing.tags}
              onChange={(e) => setEditing({ ...editing, tags: e.target.value })}
            />
            <p>只修改管理信息，不会重命名或覆盖音频文件。</p>
            {error && (
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm('放弃本次未保存的素材修改，重新载入？'))
                    return;
                  void refresh().then((next) => {
                    if (next) {
                      const rows = next.assets.filter((row) =>
                        editing.rows.some((old) => old.id === row.id),
                      );
                      if (rows.length) {
                        setError('');
                        editAssets(rows);
                      }
                    }
                  });
                }}
              >
                重新载入素材信息
              </button>
            )}
            <div className="ac-voice-actions">
              <button
                type="submit"
                className="ac-voice-primary"
                disabled={!!busy}
              >
                保存素材信息
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void changeState(editing.rows, 'ready')}
              >
                标记已试听
              </button>
              {editing.rows.some((row) => row.state === 'disabled') ? (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => void changeState(editing.rows, 'pending')}
                >
                  恢复为待试听
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => void changeState(editing.rows, 'disabled')}
                >
                  停用素材
                </button>
              )}
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
