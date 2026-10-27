import type { VoiceStatus } from './practiceVoiceEngine';
import type { AnswerFeedbackSettings } from './answerFeedbackSettings';
const state: VoiceStatus = {
  packs: [],
  downloads: [],
  defaultPackId: null,
  selected: 'builtin',
  currentName: '内置音效',
  state: 'idle',
  message: '语音包仅在 Android 客户端启用',
  downloadId: null,
  progress: 0,
};
export const practiceVoice = {
  getStatus: () => state,
  subscribe: (_f: () => void) => () => {},
  async setAccount(_id: string | null) {},
  async refresh() {},
  async download(_id: string) {
    return false;
  },
  async remove(_id: string) {},
  cancelDownload() {},
  stop() {},
  select(_id: string) {},
  enter(_s: string, _f?: () => boolean) {
    return false;
  },
  answer(_s: string, _id: string, _correct: boolean, _current: () => boolean) {
    return false;
  },
  preview(_current?: () => boolean) {
    return false;
  },
};
export function configurePracticeVoice(_settings: AnswerFeedbackSettings) {}
