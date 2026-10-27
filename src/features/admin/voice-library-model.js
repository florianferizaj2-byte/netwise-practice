export const suggestedStreaks = [2, 3, 5, 10];
export const stateLabels = {
  pending: '待试听',
  ready: '已试听',
  disabled: '已停用',
};
export const formatSeconds = (ms) =>
  Number.isFinite(ms) ? (ms / 1000).toFixed(2) + ' 秒' : '时长待确认';
export const cueLabel = (scene) =>
  scene === 'practice.enter'
    ? '进入刷题'
    : scene === 'answer.correct'
      ? '普通答对'
      : scene.startsWith('wrong:')
        ? '连错 ' +
          scene.split(':')[1] +
          ' 次' +
          (scene === 'wrong:5' ? '及以上' : '')
        : '连对 ' + scene.split(':')[1] + ' 次';
export const cueMode = (draft, scene) =>
  draft.playback.selectionModes?.[scene] ?? 'random';
export function setCueMode(draft, scene, mode) {
  if (!['fixed', 'random'].includes(mode)) throw Error('播放方式无效');
  const next = {
    ...draft,
    playback: {
      ...draft.playback,
      selectionModes: { ...draft.playback.selectionModes, [scene]: mode },
    },
  };
  return mode === 'fixed'
    ? updateCue(next, scene, cueClips(next, scene).slice(0, 1))
    : next;
}
export const draftSignature = (draft) =>
  draft
    ? JSON.stringify({
        id: draft.id,
        name: draft.name,
        cues: draft.cues,
        playback: draft.playback,
      })
    : '';
export function emptyDraft(id, name) {
  return {
    id,
    name,
    revision: 0,
    basedOnRevision: 0,
    cues: {
      'practice.enter': [],
      'answer.correct': [],
      'answer.streak': [],
      'answer.wrong': [],
    },
    playback: { maxDurationMs: 2500, minIntervalMs: 150 },
  };
}
export function editDraft(row, live) {
  return JSON.parse(
    JSON.stringify({
      ...row,
      cues: { ...row.cues, 'answer.wrong': row.cues['answer.wrong'] ?? [] },
      revision: row.basedOnRevision === undefined ? 0 : row.revision,
      basedOnRevision:
        row.basedOnRevision ?? live?.revision ?? row.revision ?? 0,
    }),
  );
}
export function cueClips(draft, scene) {
  if (scene.startsWith('wrong:'))
    return (
      (draft.cues['answer.wrong'] ?? []).find(
        (r) => r.count === Number(scene.split(':')[1]),
      )?.clips ?? []
    );
  return scene.startsWith('streak:')
    ? (draft.cues['answer.streak'].find(
        (r) => r.count === Number(scene.split(':')[1]),
      )?.clips ?? [])
    : (draft.cues[scene] ?? []);
}
export function updateCue(draft, scene, clips) {
  const values = [...new Set(clips)];
  if (values.length > 8) throw Error('每个场景最多选择 8 条素材');
  if (cueMode(draft, scene) === 'fixed' && values.length > 1)
    throw Error('固定播放只能选择一条语音，请切换为随机播放');
  const cues = { ...draft.cues };
  if (scene.startsWith('streak:') || scene.startsWith('wrong:')) {
    const wrong = scene.startsWith('wrong:'),
      count = Number(scene.split(':')[1]),
      event = wrong ? 'answer.wrong' : 'answer.streak';
    if (
      !Number.isInteger(count) ||
      count < (wrong ? 1 : 2) ||
      count > (wrong ? 5 : 1000)
    )
      throw Error(wrong ? '连错次数应为 1–5' : '连对次数应为 2–1000 的整数');
    cues[event] = [
      ...(cues[event] ?? []).filter((r) => r.count !== count),
      ...(values.length ? [{ count, clips: values }] : []),
    ].sort((a, b) => a.count - b.count);
  } else cues[scene] = values;
  return { ...draft, cues };
}
export const usedAssetIds = (draft) =>
  draft
    ? [
        ...new Set([
          ...draft.cues['practice.enter'],
          ...draft.cues['answer.correct'],
          ...draft.cues['answer.streak'].flatMap((row) => row.clips),
          ...(draft.cues['answer.wrong'] ?? []).flatMap((row) => row.clips),
        ]),
      ]
    : [];
export function draftIssues(draft, assets) {
  if (!draft) return [];
  const ids = usedAssetIds(draft),
    rows = ids.map((id) => assets.find((row) => row.id === id));
  return [
    ...(!draft.name.trim() ? ['请填写语音包名称'] : []),
    ...(ids.length > 32 ? ['单个语音包最多使用 32 个不同素材'] : []),
    ...(rows.some((row) => !row) ? ['部分素材不存在，请刷新后检查'] : []),
    ...(rows.some((row) => row?.state === 'disabled')
      ? ['语音包中含有已停用素材']
      : []),
    ...(rows.reduce((sum, row) => sum + (row?.bytes || 0), 0) > 20 * 1024 * 1024
      ? ['素材总量不能超过 20 MiB']
      : []),
  ];
}
export function filterVoiceAssets(
  assets,
  { search = '', collection = 'all', state = 'all', short = false } = {},
) {
  const text = search.trim().toLocaleLowerCase();
  return assets.filter(
    (row) =>
      (collection === 'all' || row.collection === collection) &&
      (state === 'all' || row.state === state) &&
      (!short || (row.durationMs !== null && row.durationMs <= 3000)) &&
      (!text ||
        [row.name, ...row.tags, row.collection]
          .join(' ')
          .toLocaleLowerCase()
          .includes(text)),
  );
}
export function importCollection(file, fallback = '') {
  return file.webkitRelativePath?.split(/[\\/]/)[0] || fallback;
}
export function validateVoiceFile(file, maxBytes = 4 * 1024 * 1024) {
  if (!/\.(mp3|wav|aac|m4a|ogg|flac)$/i.test(file.name)) return '格式不支持';
  if (file.size < 12) return '文件为空或不完整';
  if (file.size > maxBytes) return '超过单文件 4 MiB 上限';
  if (file.name.length > 100) return '文件名过长，请先缩短文件名';
  return '';
}
