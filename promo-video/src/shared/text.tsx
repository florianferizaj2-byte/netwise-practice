import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {easeOut, rand, spr, tw} from './anim';

/** 逐字遮罩上升（高级感） */
export const RiseText: React.FC<{
  text: string;
  start: number;
  stagger?: number;
  dur?: number;
  style?: React.CSSProperties;
  blur?: boolean;
}> = ({text, start, stagger = 2, dur = 22, style, blur = true}) => {
  const f = useCurrentFrame();
  return (
    <div style={{display: 'flex', flexWrap: 'wrap', lineHeight: 1.25, ...style}}>
      {[...text].map((ch, i) => {
        const t = tw(f, [start + i * stagger, start + i * stagger + dur], [0, 1], easeOut);
        return (
          <span key={i} style={{display: 'inline-block', overflow: 'hidden', paddingBottom: '0.08em'}}>
            <span
              style={{
                display: 'inline-block',
                transform: `translateY(${(1 - t) * 105}%)`,
                opacity: t,
                filter: blur ? `blur(${(1 - t) * 8}px)` : undefined,
                whiteSpace: 'pre',
              }}
            >
              {ch}
            </span>
          </span>
        );
      })}
    </div>
  );
};

/** 解码文字（乱码 → 正字），赛博风 */
const GLYPHS = '01#$%&*+<>/\\=?@ABCDEFGHJKLMNPQRSTUVWXYZ考匠题错学';
export const DecodeText: React.FC<{
  text: string;
  start: number;
  speed?: number;
  style?: React.CSSProperties;
  cursor?: boolean;
}> = ({text, start, speed = 1.2, style, cursor}) => {
  const f = useCurrentFrame();
  const chars = [...text];
  const progress = (f - start) * speed;
  return (
    <span style={{whiteSpace: 'pre', ...style}}>
      {chars.map((ch, i) => {
        if (progress < i) return null;
        const settled = progress > i + 6;
        const g = settled || ch === ' ' ? ch : GLYPHS[Math.floor(rand(i * 31 + f * 7) * GLYPHS.length)];
        return (
          <span key={i} style={{opacity: settled ? 1 : 0.7}}>
            {g}
          </span>
        );
      })}
      {cursor && Math.floor(f / 8) % 2 === 0 && <span style={{opacity: 0.9}}>▍</span>}
    </span>
  );
};

/** 打字机 */
export const TypeText: React.FC<{text: string; start: number; cps?: number; style?: React.CSSProperties; caret?: boolean}> = ({
  text,
  start,
  cps = 30,
  style,
  caret = true,
}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const n = Math.max(0, Math.floor(((f - start) / fps) * cps));
  const done = n >= text.length;
  return (
    <span style={style}>
      {text.slice(0, n)}
      {caret && f >= start && (!done || Math.floor(f / 10) % 2 === 0) && (
        <span style={{display: 'inline-block', width: '0.5em', height: '1em', background: 'currentColor', verticalAlign: '-0.12em', marginLeft: 2, opacity: 0.8}} />
      )}
    </span>
  );
};

/** 弹跳大字（潮流风） */
export const PopWord: React.FC<{
  text: string;
  start: number;
  style?: React.CSSProperties;
  stagger?: number;
}> = ({text, start, style, stagger = 1.5}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  return (
    <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'center', ...style}}>
      {[...text].map((ch, i) => {
        const s = spr(f, fps, start + i * stagger, {damping: 10, stiffness: 220, mass: 0.5});
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              transform: `translateY(${(1 - s) * 60}px) scale(${0.3 + s * 0.7}) rotate(${(1 - s) * (i % 2 ? 14 : -14)}deg)`,
              opacity: Math.min(1, s * 2),
              whiteSpace: 'pre',
            }}
          >
            {ch}
          </span>
        );
      })}
    </div>
  );
};
