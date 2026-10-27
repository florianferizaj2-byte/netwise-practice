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
      : '连对 ' + scene.split(':')[1] + ' 次';
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
    cues: { 'practice.enter': [], 'answer.correct': [], 'answer.streak': [] },
    playback: { maxDurationMs: 2500, minIntervalMs: 150 },
  };
}
export function editDraft(row, live) {
  return JSON.parse(
    JSON.stringify({
      ...row,
      revision: row.basedOnRevision === undefined ? 0 : row.revision,
      basedOnRevision:
        row.basedOnRevision ?? live?.revision ?? row.revision ?? 0,
    }),
  );
}
export function cueClips(draft, scene) {
  return scene.startsWith('streak:')
    ? (draft.cues['answer.streak'].find(
        (row) => row.count === Number(scene.split(':')[1]),
      )?.clips ?? [])
    : (draft.cues[scene] ?? []);
}
export function updateCue(draft, scene, clips) {
  const values = [...new Set(clips)];
  if (values.length > 8) throw Error('每个场景最多选择 8 条素材');
  const cues = { ...draft.cues };
  if (scene.startsWith('streak:')) {
    const count = Number(scene.split(':')[1]);
    if (!Number.isInteger(count) || count < 2 || count > 1000)
      throw Error('连对次数应为 2–1000 的整数');
    cues['answer.streak'] = [
      ...cues['answer.streak'].filter((row) => row.count !== count),
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
