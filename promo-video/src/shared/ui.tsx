import React from 'react';
import {AbsoluteFill, Audio, Img, Sequence, useCurrentFrame} from 'remotion';
import type {ShotInfo} from './assets';
import {sfx} from './assets';

/** 把截图中的一个矩形区域（截图像素）铺满给定尺寸的容器 */
export const Crop: React.FC<{
  shot: ShotInfo;
  view?: {x: number; y: number; w: number; h?: number};
  width: number;
  height: number;
  style?: React.CSSProperties;
  imgStyle?: React.CSSProperties;
  children?: React.ReactNode;
}> = ({shot, view, width, height, style, imgStyle, children}) => {
  const v = view ?? {x: 0, y: 0, w: shot.w};
  const k = width / v.w;
  return (
    <div style={{position: 'relative', width, height, overflow: 'hidden', ...style}}>
      <Img
        src={shot.src}
        style={{
          position: 'absolute',
          left: -v.x * k,
          top: -v.y * k,
          width: shot.w * k,
          height: shot.h * k,
          maxWidth: 'none',
          ...imgStyle,
        }}
      />
      {/* 子元素使用截图像素坐标 × k 定位 */}
      {children}
    </div>
  );
};

/** 极简浏览器外框 */
export const BrowserFrame: React.FC<{
  width: number;
  height: number;
  dark?: boolean;
  radius?: number;
  url?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({width, height, dark, radius = 18, url = 'aceexam.top', children, style}) => {
  const bar = Math.round(width * 0.028);
  return (
    <div
      style={{
        width,
        height: height + bar,
        borderRadius: radius,
        overflow: 'hidden',
        background: dark ? '#16181b' : '#f3f4f3',
        boxShadow: '0 60px 120px -30px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08)',
        ...style,
      }}
    >
      <div
        style={{
          height: bar,
          display: 'flex',
          alignItems: 'center',
          gap: bar * 0.28,
          padding: `0 ${bar * 0.6}px`,
          borderBottom: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)',
        }}
      >
        {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
          <div key={c} style={{width: bar * 0.3, height: bar * 0.3, borderRadius: 99, background: c, opacity: 0.9}} />
        ))}
        <div
          style={{
            marginLeft: bar * 0.6,
            flex: 1,
            maxWidth: width * 0.36,
            height: bar * 0.56,
            borderRadius: 99,
            background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
            color: dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)',
            fontSize: bar * 0.32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: '"Space Grotesk", sans-serif',
          }}
        >
          {url}
        </div>
      </div>
      <div style={{width, height, position: 'relative', overflow: 'hidden'}}>{children}</div>
    </div>
  );
};

/** 手机外框（圆角 + 刘海岛） */
export const PhoneFrame: React.FC<{
  width: number;
  children: React.ReactNode;
  color?: string;
  style?: React.CSSProperties;
}> = ({width, children, color = '#111', style}) => {
  const h = width * 2.07;
  const bezel = width * 0.035;
  return (
    <div
      style={{
        width,
        height: h,
        borderRadius: width * 0.16,
        background: color,
        padding: bezel,
        boxShadow: '0 50px 100px -30px rgba(0,0,0,0.6), inset 0 0 0 2px rgba(255,255,255,0.12)',
        position: 'relative',
        ...style,
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: width * 0.13,
          overflow: 'hidden',
          position: 'relative',
          background: '#fff',
        }}
      >
        {children}
        <div
          style={{
            position: 'absolute',
            top: width * 0.03,
            left: '50%',
            transform: 'translateX(-50%)',
            width: width * 0.3,
            height: width * 0.085,
            borderRadius: 99,
            background: '#000',
          }}
        />
      </div>
    </div>
  );
};

/** 鼠标指针 */
export const Cursor: React.FC<{x: number; y: number; press?: number; size?: number; color?: string}> = ({
  x,
  y,
  press = 0,
  size = 34,
  color = '#111',
}) => (
  <div style={{position: 'absolute', left: x, top: y, transform: `scale(${1 - press * 0.18})`, transformOrigin: '0 0'}}>
    {press > 0 && (
      <div
        style={{
          position: 'absolute',
          left: -size * 0.9,
          top: -size * 0.9,
          width: size * 1.8,
          height: size * 1.8,
          borderRadius: 99,
          border: `3px solid ${color}`,
          opacity: press * 0.5,
          transform: `scale(${0.5 + press})`,
        }}
      />
    )}
    <svg width={size} height={size * 1.3} viewBox="0 0 24 31" style={{filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.35))'}}>
      <path d="M2 2 L2 25 L8 19.5 L12 29 L16 27.5 L12 18 L20 18 Z" fill="#fff" stroke="#111" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  </div>
);

/** 一次性音效 */
export const Sfx: React.FC<{at: number; name: string; volume?: number}> = ({at, name, volume = 0.6}) => (
  <Sequence from={Math.max(0, Math.round(at))} durationInFrames={120} layout="none">
    <Audio src={sfx(name)} volume={volume} />
  </Sequence>
);

/** 胶片颗粒（确定性） */
export const Grain: React.FC<{opacity?: number}> = ({opacity = 0.06}) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{pointerEvents: 'none', opacity, mixBlendMode: 'overlay'}}>
      <svg width="100%" height="100%">
        <filter id={`g${f % 4}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={f % 4} />
        </filter>
        <rect width="100%" height="100%" filter={`url(#g${f % 4})`} />
      </svg>
    </AbsoluteFill>
  );
};

export const Vignette: React.FC<{strength?: number}> = ({strength = 0.55}) => (
  <AbsoluteFill
    style={{
      pointerEvents: 'none',
      background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,${strength}) 100%)`,
    }}
  />
);

/** 场景编排：在根部统一做交叉淡化，场景内部不处理出场淡出 */
export type SceneDef = {from: number; dur: number; el: React.ReactNode; fadeIn?: number; fadeOut?: number};
export const Scenes: React.FC<{scenes: SceneDef[]}> = ({scenes}) => {
  const f = useCurrentFrame();
  return (
    <>
      {scenes.map((s, i) => {
        const local = f - s.from;
        const fi = s.fadeIn ?? 0;
        const fo = s.fadeOut ?? 0;
        let o = 1;
        if (fi > 0) o = Math.min(o, Math.max(0, Math.min(1, local / fi)));
        if (fo > 0) o = Math.min(o, Math.max(0, Math.min(1, (s.dur - local) / fo)));
        return (
          <Sequence key={i} from={s.from} durationInFrames={s.dur}>
            <AbsoluteFill style={{opacity: o}}>{s.el}</AbsoluteFill>
          </Sequence>
        );
      })}
    </>
  );
};
