import React from 'react';
import {AbsoluteFill, Audio, Img, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {CARD_POS, CERTS, LOGO, SHOT, featureRect, music} from '../shared/assets';
import {CN, FUN, LATIN, useFonts} from '../shared/fonts';
import {bounce, easeInOut, easeOut, rand, spr, tw} from '../shared/anim';
import {Crop, Cursor, PhoneFrame, Scenes, Sfx} from '../shared/ui';
import {PopWord} from '../shared/text';

// 120 BPM：1 拍 = 15 帧，1 小节 = 60 帧，全片 13 小节 = 780 帧
const T = 15;
const BAR = 60;
export const Y = {
  yellow: '#ffe14d',
  pink: '#ff5fa2',
  blue: '#3d7bff',
  green: '#1f6650',
  mint: '#7fffd0',
  ink: '#151515',
  white: '#fffdf6',
  red: '#ff3b3b',
};

/** 粗描边贴纸字 */
export const stroke = (c = Y.ink, w = 8): React.CSSProperties => ({
  WebkitTextStroke: `${w}px ${c}`,
  paintOrder: 'stroke fill',
});

const Dots: React.FC<{color: string}> = ({color}) => (
  <AbsoluteFill
    style={{
      backgroundImage: `radial-gradient(${color} 3px, transparent 3.5px)`,
      backgroundSize: '44px 44px',
      opacity: 0.35,
    }}
  />
);

/** 背景色块：按 key 硬切换色 */
export const ColorBg: React.FC<{color: string; dot?: string}> = ({color, dot = 'rgba(0,0,0,0.18)'}) => (
  <AbsoluteFill style={{background: color}}>
    <Dots color={dot} />
  </AbsoluteFill>
);

/** 卡片/截图贴纸感：白边 + 硬阴影 */
export const Sticker: React.FC<{children: React.ReactNode; rot?: number; style?: React.CSSProperties}> = ({children, rot = 0, style}) => (
  <div
    style={{
      background: '#fff',
      padding: 10,
      borderRadius: 26,
      border: `5px solid ${Y.ink}`,
      boxShadow: `14px 14px 0 ${Y.ink}`,
      transform: `rotate(${rot}deg)`,
      ...style,
    }}
  >
    <div style={{borderRadius: 16, overflow: 'hidden'}}>{children}</div>
  </div>
);

/* ---------- S1 0–30：大字砸下 ---------- */
const S1: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spr(f, fps, 0, {damping: 8, stiffness: 260, mass: 0.6});
  const shake = f < 6 ? (rand(f) - 0.5) * 24 : 0;
  return (
    <AbsoluteFill style={{transform: `translate(${shake}px, ${-shake}px)`}}>
      <ColorBg color={Y.yellow} />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 330,
          textAlign: 'center',
          fontFamily: FUN,
          fontSize: 210,
          color: Y.white,
          lineHeight: 1.1,
          transform: `scale(${interpolate(s, [0, 1], [3, 1])}) rotate(${(1 - s) * -10 - 3}deg)`,
          ...stroke(Y.ink, 14),
        }}
      >
        刷题刷到
        <br />
        <span style={{color: Y.pink}}>怀疑人生？</span>
      </div>
      <Sfx at={0} name="stamp" volume={0.6} />
    </AbsoluteFill>
  );
};

/* ---------- S2 30–60：产品弹入 “考匠来了” ---------- */
const S2: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const b = bounce(f, fps, 0);
  const W = 1000;
  const H = W * (2000 / 3200);
  return (
    <AbsoluteFill>
      <ColorBg color={Y.blue} dot="rgba(255,255,255,0.18)" />
      <div style={{position: 'absolute', left: 960 - W / 2 + 180, top: 540 - H / 2 + 30, transform: `scale(${b}) rotate(${(1 - b) * 20 + 3}deg)`}}>
        <Sticker>
          <Crop shot={SHOT.hero} width={W} height={H} />
        </Sticker>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 70,
          top: 150,
          fontFamily: FUN,
          fontSize: 150,
          color: Y.yellow,
          transform: `rotate(-8deg) scale(${spr(f, fps, 4, {damping: 9, stiffness: 220})})`,
          ...stroke(Y.ink, 12),
        }}
      >
        考匠来了！
      </div>
      <Sfx at={0} name="pop" volume={0.6} />
    </AbsoluteFill>
  );
};

/* ---------- S3 60–180：痛点三连（每拍一卡），最后一拍 stop ---------- */
const PAINS = [
  {t: '同一题', s: '错三遍', bg: Y.pink},
  {t: '答案', s: '看不懂', bg: Y.mint},
  {t: '到底', s: '错在哪？', bg: Y.yellow},
];
const S3: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  // 每张卡占 2 拍（30 帧），共 90 帧；第 90–105 帧 = 小节 3 第 3 拍；105–120 静止 stop
  const i = Math.min(2, Math.floor(f / 30));
  const local = f - i * 30;
  const p = PAINS[i];
  const s = spr(local, fps, 0, {damping: 9, stiffness: 240, mass: 0.5});
  const stop = f >= 105;
  return (
    <AbsoluteFill>
      <ColorBg color={stop ? Y.ink : p.bg} dot={stop ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.16)'} />
      {!stop && (
        <div style={{position: 'absolute', left: 0, right: 0, top: 260, textAlign: 'center', transform: `scale(${0.5 + s * 0.5}) rotate(${(i - 1) * 4}deg)`}}>
          <div style={{fontFamily: FUN, fontSize: 150, color: Y.white, ...stroke(Y.ink, 12)}}>{p.t}</div>
          <div style={{fontFamily: FUN, fontSize: 260, color: Y.ink, lineHeight: 1.05, transform: `translateX(${(1 - s) * 200 * (i % 2 ? -1 : 1)}px)`}}>{p.s}</div>
        </div>
      )}
      {!stop && (
        <div style={{position: 'absolute', left: 90, bottom: 80, fontFamily: LATIN, fontWeight: 700, fontSize: 64, color: Y.ink}}>
          0{i + 1}<span style={{opacity: 0.4}}> / 03</span>
        </div>
      )}
      {stop && (
        <div style={{position: 'absolute', left: 0, right: 0, top: 440, textAlign: 'center', fontFamily: FUN, fontSize: 120, color: Y.yellow, transform: `scale(${spr(f - 105, fps, 0, {damping: 8, stiffness: 300})})`}}>
          停！
        </div>
      )}
      {[0, 15, 30, 45, 60, 75].map((a) => (
        <Sfx key={a} at={a} name={a % 30 === 0 ? 'stamp' : 'tap'} volume={a % 30 === 0 ? 0.45 : 0.4} />
      ))}
      <Sfx at={105} name="boing" volume={0.5} />
    </AbsoluteFill>
  );
};

/* ---------- S4 180–300：DROP，真实答错 ✕ → Match Cut 到 “AI 分析错题” ---------- */
const S4: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const W = 860;
  const k = W / 1218;
  const pick = T; // 15
  const confirm = 2 * T; // 30
  const shot = f < pick ? SHOT.q1 : f < confirm ? SHOT.q1Selected : SHOT.q1Result;
  const H = (f < confirm ? 1066 : 1230) * k;
  const enter = bounce(f, fps, 0);
  const xPop = bounce(f, fps, confirm);
  // 光标：选 A → 确认 → AI 分析错题按钮
  const pts = [
    {x: W + 40, y: 200},
    {x: CARD_POS.optionA.x * k + 120, y: CARD_POS.optionA.y * k + 10},
    {x: CARD_POS.confirm.x * k - 30, y: CARD_POS.confirm.y * k + 6},
    {x: CARD_POS.aiAnalyzeBtn.x * k, y: CARD_POS.aiAnalyzeBtn.y * k + 4},
  ];
  const seg = f < pick ? 0 : f < confirm ? 1 : 2;
  const segStart = [2, pick + 2, confirm + 18][seg];
  const segEnd = [pick - 1, confirm - 1, 4 * T + 10][seg];
  const t = tw(f, [segStart, segEnd], [0, 1], easeInOut);
  const cx = interpolate(t, [0, 1], [pts[seg].x, pts[seg + 1].x]);
  const cy = interpolate(t, [0, 1], [pts[seg].y, pts[seg + 1].y]);
  const press = (at: number) => Math.max(0, 1 - Math.abs(f - at) / 4);
  const btnClick = 4 * T + 12; // 72
  // Match Cut：以按钮为圆心的圆形遮罩扩张，进入 AI 分析画面
  const iris = tw(f, [btnClick + 2, btnClick + 22], [0, 1], easeOut);
  const left = 960 - W / 2 + 260;
  const top = 540 - H / 2;
  const bx = left + 10 + CARD_POS.aiAnalyzeBtn.x * k;
  const by = top + 10 + CARD_POS.aiAnalyzeBtn.y * k;
  const AW = 1240;
  const ak = AW / 1360;
  const AH = 1132 * ak;
  return (
    <AbsoluteFill>
      <ColorBg color={Y.white} dot="rgba(0,0,0,0.08)" />
      <div style={{position: 'absolute', left, top, transform: `scale(${enter}) rotate(${(1 - enter) * -12 - 2}deg)`}}>
        <Sticker>
          <Crop shot={shot} width={W} height={H} />
        </Sticker>
        <Cursor x={cx + 10} y={cy + 10} press={Math.max(press(pick), press(confirm), press(btnClick))} size={42} />
      </div>
      <div style={{position: 'absolute', left: 70, top: 140, fontFamily: FUN, fontSize: 130, color: Y.ink, transform: `rotate(-6deg)`}}>
        <PopWord text="答错了？" start={0} style={{justifyContent: 'flex-start'}} />
      </div>
      {f >= confirm && (
        <div
          style={{
            position: 'absolute',
            left: 170,
            top: 470,
            width: 280,
            height: 280,
            borderRadius: 999,
            background: Y.red,
            border: `8px solid ${Y.ink}`,
            boxShadow: `12px 12px 0 ${Y.ink}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: LATIN,
            fontWeight: 700,
            fontSize: 200,
            color: Y.white,
            transform: `scale(${xPop}) rotate(${(1 - xPop) * 90}deg)`,
          }}
        >
          ✕
        </div>
      )}
      {iris > 0 && (
        <AbsoluteFill style={{clipPath: `circle(${iris * 2300}px at ${bx}px ${by}px)`}}>
          <ColorBg color={Y.mint} />
          <div style={{position: 'absolute', left: 960 - AW / 2, top: 540 - AH / 2 + 40}}>
            <Sticker rot={-1.5}>
              <Crop shot={SHOT.aiAnalyze} width={AW} height={AH} />
            </Sticker>
          </div>
        </AbsoluteFill>
      )}
      <Sfx at={pick} name="click" volume={0.7} />
      <Sfx at={confirm} name="error" volume={0.5} />
      <Sfx at={confirm} name="boing" volume={0.4} />
      <Sfx at={btnClick} name="click" volume={0.7} />
      <Sfx at={btnClick + 2} name="whoosh-fast" volume={0.5} />
    </AbsoluteFill>
  );
};

/* ---------- S5 300–420：AI 错因贴纸 + 荧光笔 ---------- */
const S5: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const AW = 1240;
  const ak = AW / 1360;
  const VY = 236;
  const VH = (1132 - VY) * ak;
  const zoom = tw(f, [0, 30], [1, 1.22], easeInOut);
  const hl = tw(f, [14, 34], [0, 1], easeOut);
  const st = bounce(f, fps, 34);
  const st2 = bounce(f, fps, 60);
  return (
    <AbsoluteFill>
      <ColorBg color={Y.mint} />
      {/* 推近时裁掉弹窗标题，只保留题目与 AI 结论 */}
      <div style={{position: 'absolute', left: 960 - AW / 2, top: 540 - VH / 2 + 30, transform: `scale(${zoom})`, transformOrigin: '30% 70%'}}>
        <Sticker rot={-1.5}>
          <Crop shot={SHOT.aiAnalyze} view={{x: 0, y: VY, w: 1360}} width={AW} height={VH}>
            <div style={{position: 'absolute', left: 70 * ak, top: (810 - VY) * ak, width: 600 * ak * hl, height: 52 * ak, background: Y.yellow, mixBlendMode: 'multiply', borderRadius: 4}} />
          </Crop>
        </Sticker>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 1080,
          top: 120,
          padding: '20px 40px',
          background: Y.pink,
          border: `6px solid ${Y.ink}`,
          borderRadius: 24,
          boxShadow: `10px 10px 0 ${Y.ink}`,
          fontFamily: FUN,
          fontSize: 96,
          color: Y.white,
          transform: `scale(${st}) rotate(${6 - (1 - st) * 30}deg)`,
          ...stroke(Y.ink, 6),
        }}
      >
        错因一针见血
      </div>
      <div
        style={{
          position: 'absolute',
          left: 110,
          top: 880,
          padding: '14px 32px',
          background: Y.yellow,
          border: `5px solid ${Y.ink}`,
          borderRadius: 999,
          fontFamily: CN,
          fontWeight: 900,
          fontSize: 44,
          color: Y.ink,
          transform: `scale(${st2}) rotate(-3deg)`,
        }}
      >
        AI 分析错题 · 免费体验
      </div>
      <Sfx at={14} name="swipe" volume={0.4} />
      <Sfx at={34} name="pop" volume={0.6} />
      <Sfx at={60} name="correct" volume={0.4} />
    </AbsoluteFill>
  );
};

/* ---------- S6 420–540：功能甩牌 ---------- */
const CARDS = [
  {idx: 1, word: '练', bg: Y.yellow},
  {idx: 2, word: '错', bg: Y.pink},
  {idx: 4, word: '考', bg: Y.blue},
  {idx: 5, word: '看进度', bg: Y.mint},
];
const S6: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const i = Math.min(3, Math.floor(f / 30));
  const cw = 900;
  const ch = cw * (394 / 853);
  return (
    <AbsoluteFill>
      <ColorBg color={CARDS[i].bg} dot={i === 2 ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.16)'} />
      {CARDS.map((c, j) => {
        if (j > i) return null;
        const s = spr(f, fps, j * 30, {damping: 13, stiffness: 170});
        const settled = j < i;
        const r = featureRect(c.idx);
        return (
          <div
            key={c.idx}
            style={{
              position: 'absolute',
              left: 960 - cw / 2 + 200 + (settled ? (j - i) * 60 : 0),
              top: 540 - ch / 2 + 60 + (settled ? (j - i) * 30 : 0),
              transform: `translateX(${(1 - s) * 1400}px) rotate(${(1 - s) * 40 + (j - 1.5) * 4}deg) scale(${settled ? 0.92 : 1})`,
              opacity: settled ? 0.7 : 1,
            }}
          >
            <Sticker>
              <Crop shot={SHOT.features} view={{x: r.x, y: r.y, w: r.w}} width={cw} height={ch} />
            </Sticker>
          </div>
        );
      })}
      <div style={{position: 'absolute', left: 90, top: 130, display: 'flex', gap: 26, alignItems: 'baseline'}}>
        {CARDS.map((c, j) => {
          const s = bounce(f, fps, j * 30);
          return (
            <span
              key={c.word}
              style={{
                fontFamily: FUN,
                fontSize: j === i ? 170 : 110,
                color: j <= i ? Y.white : 'transparent',
                transform: `scale(${j <= i ? s : 0})`,
                display: 'inline-block',
                ...stroke(Y.ink, 10),
              }}
            >
              {c.word}
            </span>
          );
        })}
      </div>
      {CARDS.map((_, j) => (
        <Sfx key={j} at={j * 30} name="swipe" volume={0.55} />
      ))}
    </AbsoluteFill>
  );
};

/* ---------- S7 540–660：证书弹幕 + 电脑手机分屏 ---------- */
const S7: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const split = bounce(f, fps, 0);
  const W = 880;
  const H = W * (2000 / 3200);
  return (
    <AbsoluteFill>
      <ColorBg color={Y.yellow} />
      <div style={{position: 'absolute', left: 120, top: 260, transform: `translateY(${(1 - split) * 700}px) rotate(-3deg)`}}>
        <Sticker>
          <Crop shot={SHOT.downloads} width={W} height={H} />
        </Sticker>
      </div>
      <div style={{position: 'absolute', left: 1210, top: 120, transform: `translateY(${(1 - bounce(f, fps, 6)) * -900}px) rotate(5deg)`}}>
        <PhoneFrame width={330} color={Y.ink}>
          <Crop shot={SHOT.mobileHome} width={307} height={307 * (2532 / 1170)} />
        </PhoneFrame>
      </div>
      <div style={{position: 'absolute', left: 1580, top: 330, fontFamily: FUN, fontSize: 110, color: Y.pink, lineHeight: 1.05, transform: `rotate(8deg) scale(${bounce(f, fps, 14)})`, ...stroke(Y.ink, 9)}}>
        电脑
        <br />
        手机
        <br />
        都能刷
      </div>
      {/* 证书弹幕 */}
      {CERTS.map((c, i) => {
        const speed = 22 + (i % 3) * 5;
        const x = 1920 - (f - i * 9) * speed;
        const y = [70, 960, 150, 880, 1000][i];
        return (
          <div
            key={c}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              whiteSpace: 'nowrap',
              padding: '10px 28px',
              borderRadius: 999,
              background: [Y.pink, Y.blue, Y.green, Y.ink, Y.white][i],
              color: i === 4 ? Y.ink : Y.white,
              border: `4px solid ${Y.ink}`,
              fontFamily: CN,
              fontWeight: 900,
              fontSize: 40,
            }}
          >
            {c}
          </div>
        );
      })}
      <Sfx at={0} name="whoosh" volume={0.5} />
      <Sfx at={14} name="pop" volume={0.5} />
    </AbsoluteFill>
  );
};

/* ---------- S8 660–780：盖章 Logo + CTA ---------- */
const S8: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const stamp = spr(f, fps, 0, {damping: 10, stiffness: 260, mass: 0.7});
  const btn = bounce(f, fps, 24);
  const breathe = 1 + Math.sin(Math.max(0, f - 40) / 6) * 0.03;
  const hit = 90; // 25.0s 最后一击
  const finalPunch = f >= hit ? 1 + 0.08 * Math.max(0, 1 - (f - hit) / 8) : 1;
  return (
    <AbsoluteFill style={{transform: `scale(${finalPunch})`}}>
      <ColorBg color={Y.green} dot="rgba(255,255,255,0.12)" />
      <div style={{position: 'absolute', left: 960 - 150, top: 140, width: 300, height: 300, transform: `scale(${interpolate(stamp, [0, 1], [3.2, 1])}) rotate(${(1 - stamp) * -20 - 4}deg)`, filter: `drop-shadow(12px 12px 0 ${Y.ink})`}}>
        <Img src={LOGO} style={{width: 300, height: 300}} />
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 480, textAlign: 'center', fontFamily: FUN, fontSize: 150, color: Y.white, ...stroke(Y.ink, 12)}}>
        <PopWord text="考匠 AceExam" start={8} stagger={2} />
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 720, display: 'flex', justifyContent: 'center'}}>
        <div
          style={{
            transform: `scale(${btn * breathe})`,
            padding: '26px 64px',
            borderRadius: 999,
            background: Y.yellow,
            border: `6px solid ${Y.ink}`,
            boxShadow: `10px 10px 0 ${Y.ink}`,
            fontFamily: CN,
            fontWeight: 900,
            fontSize: 58,
            color: Y.ink,
            display: 'flex',
            gap: 28,
            alignItems: 'center',
          }}
        >
          免费试做 5 道题
          <span style={{fontFamily: LATIN, fontWeight: 700, fontSize: 46, opacity: 0.75}}>aceexam.top</span>
        </div>
      </div>
      <Sfx at={0} name="stamp" volume={0.7} />
      <Sfx at={24} name="pop" volume={0.6} />
    </AbsoluteFill>
  );
};

export const Trendy: React.FC = () => {
  useFonts();
  // 硬切：本风格不做交叉淡化，切点全部落在拍点上
  return (
    <AbsoluteFill style={{background: Y.yellow}}>
      <Scenes
        scenes={[
          {from: 0, dur: 30, el: <S1 />},
          {from: 30, dur: 30, el: <S2 />},
          {from: BAR, dur: 2 * BAR, el: <S3 />},
          {from: 3 * BAR, dur: 2 * BAR, el: <S4 />},
          {from: 5 * BAR, dur: 2 * BAR, el: <S5 />},
          {from: 7 * BAR, dur: 2 * BAR, el: <S6 />},
          {from: 9 * BAR, dur: 2 * BAR, el: <S7 />},
          {from: 11 * BAR, dur: 2 * BAR, el: <S8 />},
        ]}
      />
      <Audio src={music('trendy')} volume={0.9} />
    </AbsoluteFill>
  );
};
