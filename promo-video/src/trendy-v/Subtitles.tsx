import React from 'react';
import {Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {FUN} from '../shared/fonts';
import {spr} from '../shared/anim';
import vo from './vo.json';

export type VoLine = {i: number; start: number; dur: number; text: string; file: string};
export const VO: VoLine[] = vo.lines;

/** 某帧是否有人声（给音乐做闪避） */
export const voiceAt = (f: number) => VO.some((l) => f >= l.start - 3 && f <= l.start + l.dur + 4);

/** 旁白音轨：每句一个 Sequence */
export const VoiceTrack: React.FC<{volume?: number}> = ({volume = 1}) => (
  <>
    {VO.map((l) => (
      <Sequence key={l.i} from={l.start} durationInFrames={l.dur + 10} layout="none">
        <Audio src={staticFile(l.file)} volume={volume} />
      </Sequence>
    ))}
  </>
);

/** 卡拉 OK 式字幕：整句弹入，已读到的字变亮色 */
export const Subtitles: React.FC<{top: number; color: string; hot: string; ink: string}> = ({top, color, hot, ink}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const line = [...VO].reverse().find((l) => f >= l.start && f < l.start + l.dur + 12);
  if (!line) return null;
  const local = f - line.start;
  const chars = [...line.text.replace(/[，。]$/, '')];
  const pop = spr(local, fps, 0, {damping: 11, stiffness: 260, mass: 0.5});
  // 按语音时长匀速点亮（最后 15% 时长内全部亮起）
  const lit = (local / Math.max(1, line.dur * 0.85)) * chars.length;
  const size = chars.length > 12 ? 70 : 84;
  return (
    <div
      style={{
        position: 'absolute',
        left: 40,
        right: 40,
        top,
        display: 'flex',
        justifyContent: 'center',
        transform: `scale(${0.6 + pop * 0.4}) translateY(${(1 - pop) * 30}px)`,
      }}
    >
      <div
        style={{
          fontFamily: FUN,
          fontSize: size,
          lineHeight: 1.2,
          textAlign: 'center',
          padding: '14px 34px',
          borderRadius: 26,
          background: 'rgba(21,21,21,0.82)',
          boxShadow: `8px 8px 0 ${ink}`,
        }}
      >
        {chars.map((ch, i) => (
          <span key={i} style={{color: i < lit ? hot : color, whiteSpace: 'pre'}}>
            {ch}
          </span>
        ))}
      </div>
    </div>
  );
};
