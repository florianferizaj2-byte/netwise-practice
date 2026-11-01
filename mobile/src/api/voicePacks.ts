import type { VoiceScenePreference, VoicePackPreferences } from '../answerFeedbackSettings';
// Additive v1 protocol. Native sounds use explicitly downloaded, verified files.
export type PracticeVoiceEvent =
  'practice.enter' | 'answer.correct' | 'answer.streak' | 'answer.wrong';
export type VoiceSelectionMode = 'fixed' | 'random';
export type VoiceAsset = {
  id: string;
  sha256: string;
  url: string;
  bytes: number;
  mimeType: string;
  format: string;
  durationMs: number | null;
};
export type VoicePackSummary = {
  id: string;
  name: string;
  revision: number;
  enabled: boolean;
  updatedAt: string;
  bytes?: number;
  assetCount?: number;
};
export type VoicePackManifest = VoicePackSummary & {
  schemaVersion: 1;
  cues: {
    'practice.enter': string[];
    'answer.correct': string[];
    'answer.streak': Array<{ count: number; clips: string[] }>;
    'answer.wrong'?: Array<{ count: number; clips: string[] }>;
  };
  playback: {
    maxDurationMs: number;
    minIntervalMs: number;
    selectionModes?: Record<string, VoiceSelectionMode>;
  };
  assets: VoiceAsset[];
  fallback: 'builtin';
};
export type VoicePackCatalog = {
  revision: number;
  defaultPackId: string | null;
  packs: VoicePackSummary[];
  contract: {
    schemaVersion: 1;
    events: PracticeVoiceEvent[];
    suggestedStreaks: number[];
    suggestedWrongStreaks?: number[];
    formats: string[];
    maxAssetBytes: number;
    maxPackBytes: number;
    fallback: 'builtin';
    streakPolicy: 'exact-count-then-correct';
    delivery: 'preload-not-per-answer';
  };
};
export type PracticeVoiceCue = {
  event: PracticeVoiceEvent;
  streak: number;
  scope: string;
  attemptId?: string;
};
export function createPracticeVoiceSession() {
  let scope = '',
    streak = 0,
    wrongStreak = 0;
  const recorded = new Set<string>();
  return {
    enter(nextScope: string): PracticeVoiceCue | null {
      if (
        typeof nextScope !== 'string' ||
        !nextScope ||
        nextScope.length > 500 ||
        nextScope === scope
      )
        return null;
      scope = nextScope;
      streak = 0;
      wrongStreak = 0;
      recorded.clear();
      return { event: 'practice.enter', streak: 0, scope };
    },
    answer(attemptId: string, correct: boolean): PracticeVoiceCue | null {
      if (
        !scope ||
        typeof attemptId !== 'string' ||
        !attemptId ||
        attemptId.length > 150 ||
        recorded.has(attemptId) ||
        recorded.size >= 2000
      )
        return null;
      recorded.add(attemptId);
      if (correct !== true) {
        streak = 0;
        wrongStreak++;
        return { event: 'answer.wrong', streak: wrongStreak, scope, attemptId };
      }
      wrongStreak = 0;
      streak++;
      return {
        event: streak >= 2 ? 'answer.streak' : 'answer.correct',
        streak,
        scope,
        attemptId,
      };
    },
  };
}
export function voiceSceneClips(
  cues: VoicePackManifest['cues'],
  scene: string,
): string[] {
  if (scene.startsWith('wrong:'))
    return (
      cues['answer.wrong']?.find(
        (row) => row.count === Number(scene.split(':')[1]),
      )?.clips ?? []
    );
  if (scene.startsWith('streak:'))
    return (
      cues['answer.streak']?.find(
        (row) => row.count === Number(scene.split(':')[1]),
      )?.clips ?? []
    );
  return scene === 'practice.enter'
    ? (cues['practice.enter'] ?? [])
    : scene === 'answer.correct'
      ? (cues['answer.correct'] ?? [])
      : [];
}
export function voiceCueScene(
  manifest: Pick<VoicePackManifest, 'cues'>,
  cue: PracticeVoiceCue,
) {
  if (cue.event === 'practice.enter' || cue.event === 'answer.correct')
    return cue.event;
  if (!Number.isInteger(cue.streak) || cue.streak < 1) return '';
  if (cue.event === 'answer.wrong') return 'wrong:' + Math.min(cue.streak, 5);
  if (cue.event === 'answer.streak')
    return manifest.cues['answer.streak']?.some(
      (row) => row.count === cue.streak,
    )
      ? 'streak:' + cue.streak
      : 'answer.correct';
  return '';
}
export function voiceCueMode(
  manifest: Pick<VoicePackManifest, 'playback'>,
  scene: string,
): VoiceSelectionMode {
  return manifest.playback?.selectionModes?.[scene] === 'fixed'
    ? 'fixed'
    : 'random';
}
/** Device choices are constrained to the published scene; never mutate the downloaded manifest. */
export function voiceScenePlayback(manifest: VoicePackManifest, scene: string, preference?: VoiceScenePreference) {
  const published = voiceSceneClips(manifest.cues, scene);
  if (preference?.mode === 'off') return { clips: [] as string[], mode: 'fixed' as VoiceSelectionMode, muted: true };
  const chosen = preference?.clips.filter(id => published.includes(id)) ?? [];
  // A pack update can remove assets. Stale choices fall back to its published policy.
  return chosen.length
    ? { clips: preference!.mode === 'fixed' ? chosen.slice(0, 1) : chosen, mode: preference!.mode as VoiceSelectionMode, muted: false }
    : { clips: published, mode: voiceCueMode(manifest, scene), muted: false };
}
export function selectVoiceClip(
  manifest: VoicePackManifest | null,
  cue: PracticeVoiceCue,
  random = 0,
  preferences?: VoicePackPreferences,
): VoiceAsset | null {
  if (
    !manifest?.enabled ||
    manifest.schemaVersion !== 1 ||
    !manifest.cues ||
    !Array.isArray(manifest.assets)
  )
    return null;
  const scene = voiceCueScene(manifest, cue),
    {clips, mode} = voiceScenePlayback(manifest, scene, preferences?.[manifest.id]?.[scene]);
  if (!clips.length) return null;
  const index =
    mode === 'fixed'
      ? 0
      : Math.floor(
          Math.max(
            0,
            Math.min(0.999999, Number.isFinite(random) ? random : 0),
          ) * clips.length,
        );
  return manifest.assets.find((a) => a.id === clips[index]) ?? null;
}
export function voiceAssetUrl(apiBase: string, asset: VoiceAsset) {
  if (
    !/^[a-f0-9]{64}$/.test(asset.id) ||
    asset.sha256 !== asset.id ||
    asset.url !== '/voice-packs/assets/' + asset.id
  )
    throw Error('Invalid voice asset address');
  const base = new URL(apiBase);
  if (!['https:', 'http:'].includes(base.protocol))
    throw Error('Invalid API address');
  return new URL(asset.url, base).toString();
}
