import {
  createAudioPlayer,
  preload,
  setAudioModeAsync,
  type AudioPlayer,
} from 'expo-audio';

export type UiSoundStyle = 'soft' | 'crisp' | 'warm';

export type UiSoundSettings = {
  enabled: boolean;
  volume: number;
  style: UiSoundStyle;
};

const sources: Record<UiSoundStyle, number> = {
  soft: require('../assets/sounds/ui-tap-soft.wav'),
  crisp: require('../assets/sounds/ui-tap-crisp.wav'),
  warm: require('../assets/sounds/ui-tap-warm.wav'),
};

let settings: UiSoundSettings = { enabled: true, volume: 0.32, style: 'soft' };
let players: Partial<Record<UiSoundStyle, AudioPlayer>> = {};
let pendingStyle: UiSoundStyle | null = null;
let preparation: Promise<void> | null = null;

export function prepareUiSounds() {
  if (preparation) return preparation;
  preparation = (async () => {
    try {
      await setAudioModeAsync({
        interruptionMode: 'mixWithOthers',
        playsInSilentMode: false,
      });
      await Promise.all(Object.values(sources).map((source) => preload(source)));
      for (const style of Object.keys(sources) as UiSoundStyle[]) {
        const player = createAudioPlayer(sources[style], { updateInterval: 1000 });
        player.volume = settings.volume;
        player.addListener('playbackStatusUpdate', (status) => {
          if (status.isLoaded && pendingStyle === style) {
            pendingStyle = null;
            playPlayer(player);
          }
        });
        players[style] = player;
      }
      if (pendingStyle) {
        const player = players[pendingStyle];
        if (player?.isLoaded) {
          pendingStyle = null;
          playPlayer(player);
        }
      }
    } catch {
      // Audio is optional; a platform playback issue must not affect app actions.
    }
  })();
  return preparation;
}

export function setUiSoundSettings(next: UiSoundSettings) {
  settings = next;
  for (const player of Object.values(players)) {
    if (player) player.volume = next.volume;
  }
}

export function playUiSound() {
  if (!settings.enabled || settings.volume <= 0) return;
  const player = players[settings.style];
  if (!player) {
    pendingStyle = settings.style;
    void prepareUiSounds();
    return;
  }
  if (!player.isLoaded) {
    pendingStyle = settings.style;
    return;
  }
  if (player.playing) return;
  playPlayer(player);
}

export function previewUiSound() {
  const player = players[settings.style];
  if (!player?.isLoaded || player.playing) return;
  playPlayer(player, Math.max(settings.volume, 0.2), true);
}

function playPlayer(player: AudioPlayer, volume = settings.volume, preview = false) {
  player.volume = volume;
  void player
    .seekTo(0)
    .then(() => {
      if (preview || (settings.enabled && settings.volume > 0)) {
        player.volume = volume;
        player.play();
      }
    })
    .catch(() => undefined);
}
