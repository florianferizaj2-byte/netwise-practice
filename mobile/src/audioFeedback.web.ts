import { Asset } from 'expo-asset';

export type UiSoundStyle = 'soft' | 'crisp' | 'warm';
export type UiSoundSettings = { enabled: boolean; volume: number; style: UiSoundStyle };
const sources: Record<UiSoundStyle, number> = {
  soft: require('../assets/sounds/ui-tap-soft.wav'),
  crisp: require('../assets/sounds/ui-tap-crisp.wav'),
  warm: require('../assets/sounds/ui-tap-warm.wav'),
};
let settings: UiSoundSettings = { enabled: true, volume: 0.32, style: 'soft' };
let context: AudioContext | null = null;
let buffers: Partial<Record<UiSoundStyle, AudioBuffer>> = {};
let preparation: Promise<void> | null = null;
let playingUntil = 0;

export function prepareUiSounds() {
  if (preparation) return preparation;
  preparation = (async () => {
    try {
      context = new AudioContext();
      await Promise.all((Object.keys(sources) as UiSoundStyle[]).map(async (style) => {
        const response = await fetch(Asset.fromModule(sources[style]).uri);
        buffers[style] = await context!.decodeAudioData(await response.arrayBuffer());
      }));
    } catch { /* Sound is optional and cannot interrupt a study action. */ }
  })();
  return preparation;
}
export function setUiSoundSettings(next: UiSoundSettings) { settings = next; }
export function playUiSound() {
  if (settings.enabled && settings.volume > 0) play(settings.volume);
}
export function previewUiSound() { play(Math.max(settings.volume, 0.2)); }
function play(volume: number) {
  if (!context) { void prepareUiSounds(); return; }
  // Resume synchronously inside the tap. Safari blocks playback without a gesture.
  void context.resume().catch(() => undefined);
  const buffer = buffers[settings.style];
  if (!buffer || context.currentTime < playingUntil) return;
  try {
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = Math.max(0, Math.min(1, volume));
    source.connect(gain).connect(context.destination);
    source.onended = () => { source.disconnect(); gain.disconnect(); };
    playingUntil = context.currentTime + buffer.duration;
    source.start();
  } catch { /* A browser audio restriction must not block the tap callback. */ }
}
