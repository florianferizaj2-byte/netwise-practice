import React from 'react';
import {AbsoluteFill, Audio, Img, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {AI_ANALYZE_BODY, AI_ANALYZE_TITLE, AI_EXPLAIN_ITEMS, CERTS, FEATURE_NAMES, LOGO, SHOT, featureRect, music} from '../shared/assets';
import {CN, LATIN, MONO, useFonts} from '../shared/fonts';
import {easeIn, easeInOut, easeOut, rand, spr, tw} from '../shared/anim';
import {Crop, PhoneFrame, Scenes, Sfx, Vignette} from '../shared/ui';
import {DecodeText, TypeText} from '../shared/text';
import {BAR, BEAT, C, Flash, Glitch, Grid, Holo, HudBox, Particles, ScanBeam, Scanlines} from './common';

const T = BEAT; // 14 帧

const Bg: React.FC<{grid?: number; speed?: number}> = ({grid = 1, speed = 1}) => (
  <>
    <AbsoluteFill style={{background: `radial-gradient(ellipse at 50% 30%, #140a33 0%, ${C.bg} 65%)`}} />
    <Grid opacity={grid} speed={speed} />
    <Particles speed={speed} />
  </>
);

/** 标签式小标题：[ 01 ] AI 分析错题 */
const Tag: React.FC<{n: string; text: string; start: number; x: number; y: number}> = ({n, text, start, x, y}) => {
  const f = useCurrentFrame();
  const o = tw(f, [start, start + 6], [0, 1]);
  return (
    <div style={{position: 'absolute', left: x, top: y, fontFamily: MONO, fontSize: 26, color: C.cyan, letterSpacing: '0.12em', opacity: o, display: 'flex', gap: 16, alignItems: 'center'}}>
      <span style={{border: `2px solid ${C.cyan}`, padding: '2px 10px'}}>{n}</span>
      <DecodeText text={text} start={start} speed={1.4} />
    </div>
  );
};

/** 大标题：解码 + 霓虹描边 */
const Headline: React.FC<{text: string; start: number; x: number; y: number; size?: number; color?: string; center?: boolean}> = ({
  text,
  start,
  x,
  y,
  size = 92,
  color = C.ink,
  center,
}) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      fontFamily: CN,
      fontWeight: 900,
      fontSize: size,
      color,
      lineHeight: 1.2,
      textShadow: `0 0 18px rgba(56,232,255,0.65), 0 0 50px rgba(155,92,255,0.5)`,
      transform: center ? 'translateX(-50%)' : undefined,
      whiteSpace: 'nowrap',
    }}
  >
    <DecodeText text={text} start={start} speed={0.9} />
  </div>
);

/* ---------- S1 0–56：系统启动，产品首帧亮相 ---------- */
const S1: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const p = spr(f, fps, 10, {damping: 22, stiffness: 90});
  const W = 1180;
  const H = W * (2000 / 3200);
  return (
    <AbsoluteFill>
      <Bg grid={tw(f, [0, 20], [0, 1])} />
      <div style={{position: 'absolute', left: 60, top: 54, fontFamily: MONO, fontSize: 24, color: C.dim, letterSpacing: '0.1em'}}>
        <TypeText text="> boot aceexam.top --mode=ai" start={0} cps={60} />
      </div>
      <AbsoluteFill style={{perspective: 1600}}>
        <div
          style={{
            position: 'absolute',
            left: 960 - W / 2,
            top: 520 - H / 2,
            transform: `rotateX(${(1 - p) * 60 + 8}deg) scale(${0.7 + p * 0.3})`,
            opacity: p,
          }}
        >
          <Holo>
            <Crop shot={SHOT.hero} width={W} height={H} />
            <ScanBeam start={14} dur={30} />
          </Holo>
        </div>
      </AbsoluteFill>
      <Headline text="AceExam · 考匠" start={22} x={960} y={900} size={64} center />
      <Sfx at={0} name="glitch" volume={0.4} />
      <Sfx at={14} name="scan" volume={0.4} />
    </AbsoluteFill>
  );
};

/* ---------- S2 56–112：锁定题干，“一道题，答错了” ---------- */
const S2: React.FC = () => {
  const f = useCurrentFrame();
  const W = 860;
  const k = W / 1218;
  const H = 1066 * k;
  const rot = tw(f, [0, 56], [-28, -8], easeOut);
  const push = tw(f, [0, 56], [0.9, 1.1], easeIn);
  const lock = tw(f, [14, 24], [0, 1]);
  return (
    <AbsoluteFill>
      <Bg speed={2} />
      <AbsoluteFill style={{perspective: 1500}}>
        <div style={{position: 'absolute', left: 980, top: 540 - H / 2, transform: `rotateY(${rot}deg) scale(${push})`, transformOrigin: '0% 50%'}}>
          <Holo>
            <Crop shot={SHOT.q1} width={W} height={H} />
          </Holo>
          <HudBox x={40 * k} y={290 * k} w={1140 * k} h={80 * k} p={lock} label="TARGET · OSI七层模型" />
        </div>
      </AbsoluteFill>
      <Tag n="01" text="QUESTION LOCKED" start={6} x={120} y={330} />
      <Headline text="一道题，" start={10} x={120} y={400} size={110} />
      <Headline text="答错了。" start={28} x={120} y={540} size={110} color={C.red} />
      <Sfx at={14} name="blip" volume={0.5} />
      <Sfx at={0} name="riser" volume={0.45} />
    </AbsoluteFill>
  );
};

/* ---------- S3 112–224：DROP，选 A → ✕ ，正确 B ✓ ---------- */
const S3: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const W = 860;
  const k = W / 1218;
  const reveal = 2 * T; // 结果出现
  const shot = f < reveal ? SHOT.q1Selected : SHOT.q1Result;
  const H = (f < reveal ? 1066 : 1230) * k;
  const punch = spr(f, fps, 0, {damping: 12, stiffness: 200});
  const shake = f < 8 ? (rand(f) - 0.5) * 30 : 0;
  const xPop = spr(f, fps, reveal, {damping: 9, stiffness: 180});
  const okPop = spr(f, fps, reveal + T * 2, {damping: 11, stiffness: 160});
  return (
    <AbsoluteFill style={{transform: `translateX(${shake}px)`}}>
      <Bg speed={3} />
      <Glitch at={[0, reveal, 4 * T + 10]} len={5}>
        <AbsoluteFill>
          <div style={{position: 'absolute', left: 960 - W / 2 + 240, top: 540 - H / 2, transform: `scale(${0.82 + punch * 0.18}) rotateZ(${(1 - punch) * -6}deg)`}}>
            <Holo strength={1.2}>
              <Crop shot={shot} width={W} height={H} />
            </Holo>
            {f >= reveal && <HudBox x={50 * k} y={395 * k} w={1115 * k} h={90 * k} p={xPop} color={C.red} label="ERROR · 你选了 A" />}
            {f >= reveal + T * 2 && <HudBox x={50 * k} y={500 * k} w={1115 * k} h={90 * k} p={okPop} color={C.green} label="ANSWER · B 传输层" />}
          </div>
        </AbsoluteFill>
      </Glitch>
      {f >= reveal && (
        <div
          style={{
            position: 'absolute',
            left: 150,
            top: 300,
            fontFamily: LATIN,
            fontWeight: 700,
            fontSize: 360,
            lineHeight: 1,
            color: C.red,
            transform: `scale(${0.4 + xPop * 0.6})`,
            opacity: tw(f, [reveal, reveal + 2, reveal + 40, reveal + 56], [0, 1, 1, 0.25]),
            textShadow: `0 0 40px ${C.red}, 0 0 120px ${C.red}`,
          }}
        >
          ✕
        </div>
      )}
      <Flash at={0} color={C.violet} />
      <Flash at={reveal} color={C.red} max={0.5} len={6} />
      <Sfx at={0} name="impact-big" volume={0.55} />
      <Sfx at={reveal} name="error" volume={0.5} />
      <Sfx at={reveal + T * 2} name="correct" volume={0.4} />
    </AbsoluteFill>
  );
};

/* ---------- S4 224–336：AI 分析错题（真实输出，终端打字） ---------- */
const S4: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const p = spr(f, fps, 0, {damping: 20, stiffness: 120});
  return (
    <AbsoluteFill>
      <Bg grid={0.5} speed={1.5} />
      <Tag n="02" text="AI 分析错题 · 定位错因" start={0} x={120} y={110} />
      <div
        style={{
          position: 'absolute',
          left: 120,
          top: 190,
          width: 1680,
          height: 660,
          border: `2px solid ${C.cyan}`,
          background: 'rgba(8,10,30,0.82)',
          boxShadow: `0 0 50px rgba(56,232,255,0.3), inset 0 0 80px rgba(155,92,255,0.15)`,
          transform: `scaleY(${p})`,
          transformOrigin: '50% 0',
          padding: '44px 56px',
          fontFamily: MONO,
          color: C.ink,
        }}
      >
        <div style={{fontSize: 24, color: C.dim, letterSpacing: '0.08em', marginBottom: 26}}>
          考匠 AI · 免费体验 ── 你的答案 A · 正确答案 B
        </div>
        <div style={{fontFamily: CN, fontSize: 44, fontWeight: 700, color: C.cyan, marginBottom: 30, textShadow: `0 0 16px rgba(56,232,255,0.6)`}}>
          <TypeText text={AI_ANALYZE_TITLE} start={8} cps={34} caret={false} />
        </div>
        <div style={{fontFamily: CN, fontSize: 42, lineHeight: 1.7, color: 'rgba(233,243,255,0.92)'}}>
          <TypeText text={AI_ANALYZE_BODY} start={30} cps={64} />
        </div>
        <ScanBeam start={0} dur={20} />
      </div>
      <div style={{position: 'absolute', right: 120, bottom: 70, fontFamily: MONO, fontSize: 22, color: C.dim}}>
        * 画面文字为 aceexam.top 免费体验的真实 AI 输出
      </div>
      <Sfx at={8} name="type" volume={0.4} />
      <Sfx at={20} name="type" volume={0.35} />
      <Sfx at={36} name="type" volume={0.4} />
      <Sfx at={56} name="type" volume={0.35} />
      <Sfx at={80} name="blip" volume={0.35} />
    </AbsoluteFill>
  );
};

/* ---------- S5 336–448：AI 详细解析，四个选项节点辐射 ---------- */
const S5: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const cx = 960;
  const cy = 560;
  const pos = [
    {x: -560, y: -230},
    {x: 560, y: -230},
    {x: -560, y: 230},
    {x: 560, y: 230},
  ];
  const core = spr(f, fps, 0, {damping: 14, stiffness: 140});
  return (
    <AbsoluteFill>
      <Bg grid={0.6} />
      <Tag n="03" text="AI 详细解析 · 逐项拆解" start={0} x={120} y={90} />
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0}}>
        {pos.map((p, i) => {
          const t = tw(f, [8 + i * 7, 22 + i * 7], [0, 1]);
          const ok = AI_EXPLAIN_ITEMS[i].ok;
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={cx + p.x * t}
              y2={cy + p.y * t}
              stroke={ok ? C.green : C.violet}
              strokeWidth={ok ? 5 : 3}
              strokeDasharray={ok ? undefined : '12 10'}
              style={{filter: `drop-shadow(0 0 8px ${ok ? C.green : C.violet})`}}
            />
          );
        })}
      </svg>
      <div
        style={{
          position: 'absolute',
          left: cx - 230,
          top: cy - 110,
          width: 460,
          height: 220,
          border: `3px solid ${C.cyan}`,
          background: 'rgba(8,10,30,0.9)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `scale(${core})`,
          boxShadow: `0 0 60px rgba(56,232,255,0.5)`,
          fontFamily: CN,
          color: C.ink,
          textAlign: 'center',
        }}
      >
        <div style={{fontFamily: MONO, fontSize: 22, color: C.cyan, letterSpacing: '0.1em'}}>OSI 七层模型</div>
        <div style={{fontSize: 34, fontWeight: 700, marginTop: 12, lineHeight: 1.35}}>
          负责端到端可靠传输
          <br />
          的是哪一层？
        </div>
      </div>
      {AI_EXPLAIN_ITEMS.map((it, i) => {
        const s = spr(f, fps, 18 + i * 7, {damping: 13, stiffness: 150});
        const p = pos[i];
        const col = it.ok ? C.green : C.violet;
        return (
          <div
            key={it.k}
            style={{
              position: 'absolute',
              left: cx + p.x - 250,
              top: cy + p.y - 90,
              width: 500,
              height: 180,
              border: `2px solid ${col}`,
              background: it.ok ? 'rgba(20,60,50,0.85)' : 'rgba(18,10,40,0.85)',
              boxShadow: `0 0 ${it.ok ? 60 : 24}px ${col}`,
              transform: `scale(${s})`,
              padding: '22px 28px',
              fontFamily: CN,
              color: C.ink,
            }}
          >
            <div style={{display: 'flex', alignItems: 'baseline', gap: 16}}>
              <span style={{fontFamily: LATIN, fontWeight: 700, fontSize: 44, color: col}}>{it.k}</span>
              <span style={{fontSize: 38, fontWeight: 700}}>{it.name}</span>
              <span style={{marginLeft: 'auto', fontFamily: LATIN, fontSize: 36, color: col}}>{it.ok ? '✓' : '✕'}</span>
            </div>
            <div style={{fontSize: 25, color: 'rgba(233,243,255,0.8)', marginTop: 12, lineHeight: 1.45}}>{it.text}</div>
          </div>
        );
      })}
      {[0, 1, 2, 3].map((i) => (
        <Sfx key={i} at={18 + i * 7} name="blip" volume={0.3} />
      ))}
      <Sfx at={0} name="scan" volume={0.35} />
    </AbsoluteFill>
  );
};

/* ---------- S6 448–616：功能隧道（含 breakdown） ---------- */
const S6: React.FC = () => {
  const f = useCurrentFrame();
  const order = [3, 6, 0, 1, 2, 4, 5, 7, 9];
  const cw = 520;
  const ch = cw * (394 / 853);
  const hi = [3, 6]; // AI 专项训练、共享题库
  return (
    <AbsoluteFill>
      <Bg speed={2.5} grid={0.7} />
      <AbsoluteFill style={{perspective: 900, perspectiveOrigin: '50% 50%'}}>
        {order.map((idx, i) => {
          const z = -2000 + (f - i * 10) * 34;
          if (z < -2000 || z > 800) return null;
          const side = i % 2 === 0 ? -1 : 1;
          const r = featureRect(idx);
          const highlight = hi.includes(idx);
          return (
            <div
              key={idx}
              style={{
                position: 'absolute',
                left: 960 - cw / 2 + side * 420,
                top: 540 - ch / 2 + (i % 3 - 1) * 160,
                transform: `translateZ(${z}px) rotateY(${-side * 24}deg)`,
                opacity: interpolate(z, [-2000, -1500, 400, 800], [0, 1, 1, 0]),
              }}
            >
              <Holo strength={highlight ? 1.6 : 0.8}>
                <Crop shot={SHOT.features} view={{x: r.x, y: r.y, w: r.w}} width={cw} height={ch} />
              </Holo>
            </div>
          );
        })}
      </AbsoluteFill>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 34% 24% at 50% 52%, rgba(4,3,12,0.8) 0%, rgba(4,3,12,0.45) 60%, rgba(4,3,12,0) 100%)'}} />
      <Tag n="04" text="AI 专项训练 · 共享题库" start={0} x={960 - 250} y={400} />
      <div style={{position: 'absolute', left: 0, right: 0, top: 470, textAlign: 'center', fontFamily: CN, fontWeight: 900, fontSize: 70, color: C.ink, textShadow: `0 0 20px rgba(56,232,255,0.7), 0 0 60px rgba(155,92,255,0.6)`}}>
        <DecodeText text="围绕薄弱知识点，" start={6} speed={1} />
        <br />
        <DecodeText text="生成针对性的练习。" start={26} speed={1} />
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, bottom: 90, display: 'flex', justifyContent: 'center', gap: 22}}>
        {CERTS.map((c, i) => {
          const o = tw(f, [70 + i * 8, 80 + i * 8], [0, 1]);
          return (
            <div key={c} style={{fontFamily: CN, fontSize: 26, color: C.cyan, border: `1px solid ${C.cyan}`, padding: '10px 20px', opacity: o, background: 'rgba(8,10,30,0.7)', boxShadow: `0 0 18px rgba(56,232,255,${0.4 * o})`}}>
              {c}
            </div>
          );
        })}
      </div>
      {[0, 1, 2, 3, 4].map((i) => (
        <Sfx key={i} at={70 + i * 8} name="blip" volume={0.25} />
      ))}
      <Sfx at={0} name="whoosh" volume={0.4} />
    </AbsoluteFill>
  );
};

/* ---------- S7 616–728：多端同步 ---------- */
const S7: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const a = spr(f, fps, 0, {damping: 16, stiffness: 120});
  const b = spr(f, fps, 6, {damping: 16, stiffness: 120});
  const beam = tw(f, [18, 40], [0, 1]);
  const W = 960;
  const H = W * (2000 / 3200);
  return (
    <AbsoluteFill>
      <Bg />
      <AbsoluteFill style={{perspective: 1600}}>
        <div style={{position: 'absolute', left: 200, top: 170, transform: `rotateY(${(1 - a) * 70 + 14}deg) translateX(${(1 - a) * -400}px)`, opacity: a}}>
          <Holo>
            <Crop shot={SHOT.downloads} width={W} height={H} />
          </Holo>
        </div>
        <div style={{position: 'absolute', left: 1400, top: 120, transform: `rotateY(${(1 - b) * -70 - 14}deg) translateX(${(1 - b) * 400}px)`, opacity: b}}>
          <div style={{filter: `drop-shadow(0 0 30px ${C.violet})`}}>
            <PhoneFrame width={340} color="#0b0b18">
              <Crop shot={SHOT.mobileHome} width={316} height={316 * (2532 / 1170)} />
            </PhoneFrame>
          </div>
        </div>
      </AbsoluteFill>
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0}}>
        <path d="M 1150 470 C 1260 380, 1320 380, 1420 440" stroke={C.cyan} strokeWidth={5} fill="none" strokeDasharray="420" strokeDashoffset={420 * (1 - beam)} style={{filter: `drop-shadow(0 0 10px ${C.cyan})`}} />
        <path d="M 1150 560 C 1260 650, 1320 650, 1420 590" stroke={C.violet} strokeWidth={5} fill="none" strokeDasharray="420" strokeDashoffset={420 * (1 - beam)} style={{filter: `drop-shadow(0 0 10px ${C.violet})`}} />
      </svg>
      <div style={{position: 'absolute', left: 0, right: 0, bottom: 110, textAlign: 'center'}}>
        <Headline text="同一个账号，同一份学习记录" start={14} x={960} y={-40} size={66} center />
        <div style={{fontFamily: MONO, fontSize: 26, color: C.dim, marginTop: 70, letterSpacing: '0.1em'}}>电脑网页 · Android App · iPhone / iPad</div>
      </div>
      <Flash at={0} color={C.cyan} max={0.5} />
      <Sfx at={0} name="impact-soft" volume={0.5} />
      <Sfx at={18} name="scan" volume={0.35} />
    </AbsoluteFill>
  );
};

/* ---------- S8 728–840：霓虹 Logo 收尾 ---------- */
const S8: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spr(f, fps, 0, {damping: 12, stiffness: 140});
  const flicker = f < 18 ? (rand(f * 5) > 0.35 ? 1 : 0.2) : 1;
  const out = tw(f, [92, 112], [1, 0], easeInOut);
  return (
    <AbsoluteFill style={{opacity: out}}>
      <Bg grid={0.8} speed={0.5} />
      <Glitch at={[0, 10, 20]} len={4}>
        <AbsoluteFill>
          <div style={{position: 'absolute', left: 960 - 120, top: 230, width: 240, height: 240, transform: `scale(${0.3 + s * 0.7})`, opacity: flicker, filter: `drop-shadow(0 0 30px rgba(255,59,92,0.8)) drop-shadow(0 0 80px rgba(155,92,255,0.6))`}}>
            <Img src={LOGO} style={{width: 240, height: 240}} />
          </div>
          <div style={{position: 'absolute', left: 0, right: 0, top: 530, textAlign: 'center', fontFamily: CN, fontWeight: 900, fontSize: 96, color: C.ink, opacity: flicker, textShadow: `0 0 20px ${C.cyan}, 0 0 70px ${C.violet}`}}>
            考匠 <span style={{fontFamily: LATIN}}>AceExam</span>
          </div>
        </AbsoluteFill>
      </Glitch>
      <div style={{position: 'absolute', left: 0, right: 0, top: 690, textAlign: 'center', fontFamily: CN, fontSize: 36, color: C.dim, letterSpacing: '0.2em', opacity: tw(f, [20, 32], [0, 1])}}>
        把每一道题，学成你的底气。
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 790, display: 'flex', justifyContent: 'center', opacity: tw(f, [30, 42], [0, 1])}}>
        <div style={{fontFamily: MONO, fontSize: 40, color: C.bg, background: C.cyan, padding: '12px 36px', letterSpacing: '0.06em', fontWeight: 700, boxShadow: `0 0 40px ${C.cyan}`}}>
          aceexam.top
        </div>
      </div>
      <Flash at={0} max={0.9} len={10} />
      <Sfx at={0} name="impact-big" volume={0.6} />
      <Sfx at={10} name="glitch" volume={0.35} />
    </AbsoluteFill>
  );
};

export const Cyberpunk: React.FC = () => {
  useFonts();
  return (
    <AbsoluteFill style={{background: C.bg}}>
      {/* 1 小节 = 56 帧；DROP 在第 3 小节（112），第二次 DROP 在第 12 小节（616），Logo 在第 14 小节（728） */}
      <Scenes
        scenes={[
          {from: 0, dur: BAR, el: <S1 />},
          {from: BAR, dur: BAR, el: <S2 />},
          {from: 2 * BAR, dur: 2 * BAR, el: <S3 />},
          {from: 4 * BAR, dur: 2 * BAR, el: <S4 />},
          {from: 6 * BAR, dur: 2 * BAR, el: <S5 />},
          {from: 8 * BAR, dur: 3 * BAR, el: <S6 />},
          {from: 11 * BAR, dur: 2 * BAR, el: <S7 />},
          {from: 13 * BAR, dur: 2 * BAR, el: <S8 />},
        ]}
      />
      <Scanlines opacity={0.14} />
      <Vignette strength={0.6} />
      <Audio src={music('cyberpunk')} volume={0.9} />
    </AbsoluteFill>
  );
};
