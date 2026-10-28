// Expo Audio Android exposes isLoaded=false at STATE_ENDED, but currentStatus
// correctly reports a loaded, completed source. Completion must not disable replay.
export type ReplayableAudioPlayer = {
  readonly isLoaded: boolean;
  readonly currentStatus?: {
    readonly isLoaded?: boolean;
    readonly playbackState?: string;
    readonly error?: unknown;
  };
};
export function canReplayAudio(player: ReplayableAudioPlayer): boolean {
  try {
    if (player.isLoaded) return true;
    const status = player.currentStatus;
    return (
      status?.error == null &&
      (status?.isLoaded === true || status?.playbackState === 'ended')
    );
  } catch {
    return false;
  } // Released/failed native players remain optional feedback.
}
