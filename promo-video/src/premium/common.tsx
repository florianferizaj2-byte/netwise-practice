import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {CN, LATIN} from '../shared/fonts';
import {RiseText} from '../shared/text';
import {tw} from '../shared/anim';

// 极简高级：黑白灰 + 品牌墨绿提亮的强调色
export const P = {
  bg0: '#060708',
  bg1: '#17191c',
  ink: '#f4f5f4',
  sub: 'rgba(244,245,244,0.58)',
  accent: '#7fd1b0',
  red: '#c8161d',
};
export const BEAT = 18;

export const Stage: React.FC<{children?: React.ReactNode; glowX?: number; glowY?: number}> = ({children, glowX = 50, glowY = 42}) => {
  const f = useCurrentFrame();
  const dx = Math.sin(f / 70) * 4;
  return (
    <AbsoluteFill style={{background: P.bg0, overflow: 'hidden'}}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 60% 55% at ${glowX + dx}% ${glowY}%, ${P.bg1} 0%, rgba(23,25,28,0.4) 45%, ${P.bg0} 80%)`,
        }}
      />
      {/* 顶部柔光 */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 40% 30% at ${50 + dx * 2}% -5%, rgba(255,255,255,0.10), rgba(255,255,255,0) 70%)`,
        }}
      />
      {/* 地面反光线 */}
      <AbsoluteFill
        style={{
          top: '78%',
          height: 2,
          background: 'linear-gradient(90deg, rgba(255,255,255,0) 10%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0) 90%)',
        }}
      />
      {children}
    </AbsoluteFill>
  );
};

/** 右侧/左侧文案块：小标签 + 两行大标题 + 副文 */
export const Caption: React.FC<{
  eyebrow?: string;
  lines: string[];
  sub?: string;
  start: number;
  x: number;
  y: number;
  size?: number;
  accentLine?: number;
  align?: 'left' | 'center';
}> = ({eyebrow, lines, sub, start, x, y, size = 84, accentLine = -1, align = 'left'}) => {
  const f = useCurrentFrame();
  const eo = tw(f, [start, start + 16], [0, 1]);
  const so = tw(f, [start + 26, start + 46], [0, 1]);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        fontFamily: CN,
        color: P.ink,
        textAlign: align,
        transform: align === 'center' ? 'translateX(-50%)' : undefined,
      }}
    >
      {eyebrow && (
        <div
          style={{
            fontSize: 26,
            letterSpacing: '0.18em',
            color: P.accent,
            fontWeight: 500,
            marginBottom: 26,
            opacity: eo,
            transform: `translateY(${(1 - eo) * 12}px)`,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            justifyContent: align === 'center' ? 'center' : 'flex-start',
          }}
        >
          <span style={{width: 34 * eo, height: 2, background: P.accent, display: 'inline-block'}} />
          {eyebrow}
        </div>
      )}
      {lines.map((l, i) => (
        <RiseText
          key={i}
          text={l}
          start={start + 6 + i * 10}
          stagger={1.6}
          style={{
            fontSize: size,
            fontWeight: 700,
            letterSpacing: '-0.01em',
            color: i === accentLine ? P.accent : P.ink,
            justifyContent: align === 'center' ? 'center' : 'flex-start',
          }}
        />
      ))}
      {sub && (
        <div style={{fontSize: 32, color: P.sub, marginTop: 28, opacity: so, fontWeight: 400, letterSpacing: '0.02em', fontFamily: `${LATIN}`}}>
          {sub}
        </div>
      )}
    </div>
  );
};

/** 面板上的镜面高光扫过 */
export const Sheen: React.FC<{start: number; dur?: number}> = ({start, dur = 40}) => {
  const f = useCurrentFrame();
  const t = tw(f, [start, start + dur], [-0.4, 1.4]);
  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        background: `linear-gradient(115deg, rgba(255,255,255,0) ${t * 100 - 18}%, rgba(255,255,255,0.22) ${t * 100}%, rgba(255,255,255,0) ${t * 100 + 18}%)`,
        mixBlendMode: 'screen',
      }}
    />
  );
};
