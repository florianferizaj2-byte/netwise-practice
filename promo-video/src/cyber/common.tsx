import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {rand, tw} from '../shared/anim';
import {MONO} from '../shared/fonts';

export const C = {
  bg: '#04030c',
  cyan: '#38e8ff',
  violet: '#9b5cff',
  pink: '#ff3d9a',
  ink: '#e9f3ff',
  dim: 'rgba(200,220,255,0.55)',
  red: '#ff3b5c',
  green: '#3dffb0',
};
export const BEAT = 14;
export const BAR = 56;

/** 透视网格地面 + 远处地平线光晕 */
export const Grid: React.FC<{speed?: number; tilt?: number; opacity?: number}> = ({speed = 1, tilt = 72, opacity = 1}) => {
  const f = useCurrentFrame();
  const off = (f * 4 * speed) % 80;
  return (
    <AbsoluteFill style={{perspective: 700, perspectiveOrigin: '50% 40%', overflow: 'hidden', opacity}}>
      <div
        style={{
          position: 'absolute',
          left: '-100%',
          width: '300%',
          top: '52%',
          height: '140%',
          transform: `rotateX(${tilt}deg)`,
          transformOrigin: '50% 0',
          backgroundImage: `linear-gradient(rgba(56,232,255,0.45) 2px, transparent 2px), linear-gradient(90deg, rgba(155,92,255,0.45) 2px, transparent 2px)`,
          backgroundSize: '80px 80px',
          backgroundPosition: `0 ${off}px`,
          maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 30%)',
          WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 30%)',
        }}
      />
      <AbsoluteFill
        style={{
          background: 'radial-gradient(ellipse 70% 18% at 50% 52%, rgba(155,92,255,0.45), rgba(56,232,255,0.08) 50%, rgba(0,0,0,0) 75%)',
        }}
      />
    </AbsoluteFill>
  );
};

/** 漂浮粒子（确定性） */
export const Particles: React.FC<{n?: number; color?: string; speed?: number}> = ({n = 70, color = C.cyan, speed = 1}) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {Array.from({length: n}).map((_, i) => {
        const x = rand(i) * 1920;
        const y = (rand(i + 99) * 1180 - f * (0.6 + rand(i + 7) * 1.6) * speed) % 1180;
        const yy = y < 0 ? y + 1180 : y;
        const s = 1.5 + rand(i + 3) * 3.5;
        const tw2 = 0.3 + 0.7 * Math.abs(Math.sin(f / 9 + i));
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: yy - 50,
              width: s,
              height: s,
              borderRadius: 99,
              background: i % 3 === 0 ? C.violet : color,
              opacity: tw2 * 0.8,
              boxShadow: `0 0 ${s * 4}px ${i % 3 === 0 ? C.violet : color}`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

export const Scanlines: React.FC<{opacity?: number}> = ({opacity = 0.18}) => (
  <AbsoluteFill
    style={{
      pointerEvents: 'none',
      opacity,
      backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.9) 0px, rgba(0,0,0,0.9) 1px, transparent 1px, transparent 4px)',
    }}
  />
);

/** 横向扫描光带 */
export const ScanBeam: React.FC<{start: number; dur?: number; vertical?: boolean; color?: string}> = ({start, dur = 24, vertical, color = C.cyan}) => {
  const f = useCurrentFrame();
  const t = tw(f, [start, start + dur], [-0.1, 1.1]);
  if (f < start || f > start + dur) return null;
  return (
    <div
      style={{
        position: 'absolute',
        ...(vertical
          ? {top: 0, bottom: 0, left: `${t * 100}%`, width: 6}
          : {left: 0, right: 0, top: `${t * 100}%`, height: 6}),
        background: color,
        boxShadow: `0 0 30px 10px ${color}, 0 0 80px 30px rgba(56,232,255,0.35)`,
        opacity: 0.85,
        mixBlendMode: 'screen',
      }}
    />
  );
};

/** RGB 分离 + 切片故障：在 [at, at+len) 内生效 */
export const Glitch: React.FC<{at: number[]; len?: number; children: React.ReactNode}> = ({at, len = 6, children}) => {
  const f = useCurrentFrame();
  const active = at.some((a) => f >= a && f < a + len);
  if (!active) return <>{children}</>;
  const k = rand(f * 3.1);
  const dx = (k - 0.5) * 40;
  const slices = 6;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{transform: `translateX(${dx}px)`, filter: 'drop-shadow(-8px 0 0 rgba(255,61,154,0.8)) drop-shadow(8px 0 0 rgba(56,232,255,0.8))'}}>
        {children}
      </AbsoluteFill>
      {Array.from({length: slices}).map((_, i) => {
        const y = rand(f + i * 13) * 100;
        const h = 2 + rand(f + i * 7) * 6;
        return (
          <AbsoluteFill
            key={i}
            style={{
              clipPath: `inset(${y}% 0 ${Math.max(0, 100 - y - h)}% 0)`,
              transform: `translateX(${(rand(f + i) - 0.5) * 160}px)`,
              mixBlendMode: 'screen',
              opacity: 0.9,
            }}
          >
            {children}
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
};

/** HUD 角标框 */
export const HudBox: React.FC<{x: number; y: number; w: number; h: number; p: number; label?: string; color?: string}> = ({
  x,
  y,
  w,
  h,
  p,
  label,
  color = C.cyan,
}) => {
  const L = 34;
  const corner = (r: number): React.CSSProperties => ({
    position: 'absolute',
    width: L,
    height: L,
    borderColor: color,
    borderStyle: 'solid',
    borderWidth: 0,
    ...(r === 0 && {left: 0, top: 0, borderLeftWidth: 4, borderTopWidth: 4}),
    ...(r === 1 && {right: 0, top: 0, borderRightWidth: 4, borderTopWidth: 4}),
    ...(r === 2 && {left: 0, bottom: 0, borderLeftWidth: 4, borderBottomWidth: 4}),
    ...(r === 3 && {right: 0, bottom: 0, borderRightWidth: 4, borderBottomWidth: 4}),
  });
  const grow = 1 + (1 - p) * 0.4;
  return (
    <div
      style={{
        position: 'absolute',
        left: x + (w - w * grow) / 2,
        top: y + (h - h * grow) / 2,
        width: w * grow,
        height: h * grow,
        opacity: p,
        filter: `drop-shadow(0 0 10px ${color})`,
      }}
    >
      {[0, 1, 2, 3].map((r) => (
        <div key={r} style={corner(r)} />
      ))}
      {label && (
        <div
          style={{
            position: 'absolute',
            right: 18,
            top: '50%',
            transform: 'translateY(-50%)',
            whiteSpace: 'nowrap',
            fontFamily: MONO,
            fontSize: 24,
            color: C.bg,
            background: color,
            padding: '4px 12px',
            letterSpacing: '0.08em',
            fontWeight: 700,
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
};

/** 全息调色容器：给真实截图加蓝紫色偏与发光边 */
export const Holo: React.FC<{children: React.ReactNode; strength?: number; style?: React.CSSProperties}> = ({children, strength = 1, style}) => (
  <div
    style={{
      position: 'relative',
      borderRadius: 14,
      overflow: 'hidden',
      boxShadow: `0 0 0 2px rgba(56,232,255,${0.7 * strength}), 0 0 60px rgba(56,232,255,${0.35 * strength}), 0 0 140px rgba(155,92,255,${0.3 * strength})`,
      ...style,
    }}
  >
    {children}
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, rgba(56,232,255,${0.16 * strength}), rgba(155,92,255,${0.22 * strength}))`,
        mixBlendMode: 'multiply',
        pointerEvents: 'none',
      }}
    />
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        opacity: 0.12 * strength,
        backgroundImage: 'repeating-linear-gradient(0deg, rgba(56,232,255,0.8) 0px, rgba(56,232,255,0.8) 1px, transparent 1px, transparent 5px)',
      }}
    />
  </div>
);

/** 白闪 / 冲击闪光 */
export const Flash: React.FC<{at: number; len?: number; color?: string; max?: number}> = ({at, len = 8, color = '#fff', max = 0.85}) => {
  const f = useCurrentFrame();
  const o = tw(f, [at, at + 1, at + len], [0, max, 0]);
  if (o <= 0) return null;
  return <AbsoluteFill style={{background: color, opacity: o, mixBlendMode: 'screen', pointerEvents: 'none'}} />;
};
