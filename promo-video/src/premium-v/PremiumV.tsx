import React from 'react';
import {AbsoluteFill, Audio, Img, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {CARD_POS, LOGO, SHOT, featureRect, music} from '../shared/assets';
import {CN, LATIN, useFonts} from '../shared/fonts';
import {easeInOut, easeOut, spr, tw} from '../shared/anim';
import {Crop, Cursor, PhoneFrame, Scenes, Sfx} from '../shared/ui';

// 竖屏 1080×1920 · 苹果式极简：纯黑底、一屏一句、超大字重、渐变标题、产品居中、缓慢精确的运动
// 音乐 premium-v.wav：100 BPM，1 拍 = 18 帧，1 小节 = 72 帧，全片 12 小节 = 864 帧
const B = 18;
const BAR = 72;
const CX = 540;
const C = {
  bg: '#000',
  ink: '#f5f5f7',
  sub: '#86868b',
  grad: 'linear-gradient(90deg, #7fd1b0 0%, #4fb3c9 50%, #a78bfa 100%)',
  red: '#c8161d',
};

/** 整行淡入：模糊 → 清晰 + 轻微上移（苹果发布会式） */
const Line: React.FC<{
  text: string;
  at: number;
  size: number;
  top: number;
  weight?: number;
  color?: string;
  grad?: boolean;
  out?: number;
}> = ({text, at, size, top, weight = 700, color = C.ink, grad, out}) => {
  const f = useCurrentFrame();
  const t = tw(f, [at, at + 26], [0, 1], easeOut);
  const o = out != null ? tw(f, [out, out + 14], [1, 0], easeInOut) : 1;
  return (
    <div
      style={{
        position: 'absolute',
        left: 60,
        right: 60,
        top,
        textAlign: 'center',
        fontFamily: CN,
        fontSize: size,
        fontWeight: weight,
        letterSpacing: '-0.02em',
        lineHeight: 1.18,
        opacity: t * o,
        filter: `blur(${(1 - t) * 14}px)`,
        transform: `translateY(${(1 - t) * 40}px)`,
        ...(grad
          ? {background: C.grad, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent'}
          : {color}),
      }}
    >
      {text}
    </div>
  );
};

/** 产品周围极淡的光晕 */
const Glow: React.FC<{y?: number; color?: string; o?: number}> = ({y = 55, color = '127,209,176', o = 0.18}) => (
  <AbsoluteFill style={{background: `radial-gradient(ellipse 70% 40% at 50% ${y}%, rgba(${color},${o}) 0%, rgba(0,0,0,0) 70%)`}} />
);

/* ---------- S1 0–144：钢琴独奏 · 主标语 ---------- */
const S1: React.FC = () => (
  <AbsoluteFill style={{background: C.bg}}>
    <Line text="把每一道题，" at={10} size={118} top={760} out={128} />
    <Line text="学成你的底气。" at={64} size={118} top={920} grad out={128} />
  </AbsoluteFill>
);

/* ---------- S2 144–288：手机从下方升起 ---------- */
const S2: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spr(f, fps, 6, {damping: 30, stiffness: 38, mass: 1.3});
  const PW = 600;
  const drift = tw(f, [0, 150], [0, -40], easeInOut);
  return (
    <AbsoluteFill style={{background: C.bg}}>
      <Glow y={70} o={0.16 * s} />
      <Line text="考匠 AceExam" at={0} size={44} top={250} weight={600} color={C.sub} />
      <Line text="免费试做 5 道题。" at={8} size={96} top={330} />
      <Line text="无需注册。" at={40} size={52} top={470} weight={500} color={C.sub} />
      <div
        style={{
          position: 'absolute',
          left: CX - PW / 2,
          top: 660,
          transform: `translateY(${(1 - s) * 900 + drift}px) scale(${interpolate(s, [0, 1], [0.92, 1])})`,
        }}
      >
        <PhoneFrame width={PW} color="#1d1d1f">
          <Crop shot={SHOT.mobileHome} width={PW * 0.93} height={PW * 0.93 * (2532 / 1170)} />
        </PhoneFrame>
      </div>
      {/* 底部渐黑，让手机“沉”入画面 */}
      <AbsoluteFill style={{top: 1450, background: 'linear-gradient(180deg, rgba(0,0,0,0), #000 75%)'}} />
    </AbsoluteFill>
  );
};

/* ---------- S3 288–432：鼓点进入 · 真实试做（选错 → 判对错） ---------- */
const S3: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const W = 940;
  const k = W / 1218;
  const pick = 2 * B; // 36
  const confirm = 4 * B; // 72
  const shot = f < pick ? SHOT.q1 : f < confirm ? SHOT.q1Selected : SHOT.q1Result;
  const H = (f < confirm ? 1066 : 1230) * k;
  const enter = spr(f, fps, 0, {damping: 30, stiffness: 60});
  const zoom = tw(f, [0, 144], [1, 1.06], easeInOut);
  const pA = {x: CARD_POS.optionA.x * k + 140, y: CARD_POS.optionA.y * k + 10};
  const pC = {x: CARD_POS.confirm.x * k - 30, y: CARD_POS.confirm.y * k + 6};
  const m1 = tw(f, [6, pick - 2], [0, 1], easeInOut);
  const m2 = tw(f, [pick + 10, confirm - 2], [0, 1], easeInOut);
  const cx = f < pick + 10 ? interpolate(m1, [0, 1], [W - 40, pA.x]) : interpolate(m2, [0, 1], [pA.x, pC.x]);
  const cy = f < pick + 10 ? interpolate(m1, [0, 1], [H + 60, pA.y]) : interpolate(m2, [0, 1], [pA.y, pC.y]);
  const press = (at: number) => Math.max(0, 1 - Math.abs(f - at) / 5);
  const cursorO = tw(f, [confirm + 10, confirm + 24], [1, 0]);
  return (
    <AbsoluteFill style={{background: C.bg}}>
      <Glow y={58} o={0.12} />
      <Line text="答错了，" at={0} size={104} top={230} />
      <Line text="也是一种进步。" at={confirm} size={104} top={360} grad />
      <div
        style={{
          position: 'absolute',
          left: CX - W / 2,
          top: 600,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 80}px) scale(${zoom})`,
          transformOrigin: '50% 30%',
        }}
      >
        <div style={{borderRadius: 32, overflow: 'hidden', boxShadow: '0 0 0 1px rgba(255,255,255,0.08), 0 60px 140px -40px rgba(127,209,176,0.25)'}}>
          <Crop shot={shot} width={W} height={H} />
        </div>
        <div style={{opacity: cursorO}}>
          <Cursor x={cx} y={cy} press={Math.max(press(pick), press(confirm))} size={40} />
        </div>
      </div>
      <Sfx at={pick} name="click" volume={0.45} />
      <Sfx at={confirm} name="click" volume={0.45} />
    </AbsoluteFill>
  );
};

/* ---------- S4 432–576：AI 分析错题 · 关键句高亮，其余压暗 ---------- */
const S4: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spr(f, fps, 0, {damping: 30, stiffness: 60});
  const W = 980;
  const k = W / 1360;
  const H = 1132 * k;
  const zoom = tw(f, [20, 144], [1, 1.12], easeInOut);
  const hl = tw(f, [40, 76], [0, 1], easeInOut);
  return (
    <AbsoluteFill style={{background: C.bg}}>
      <Line text="AI 分析错题" at={0} size={44} top={250} weight={600} color={C.sub} />
      <Line text="看清错因，" at={6} size={104} top={330} />
      <Line text="才能真正掌握。" at={24} size={104} top={460} grad />
      <div
        style={{
          position: 'absolute',
          left: CX - W / 2,
          top: 760,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 80}px) scale(${zoom})`,
          transformOrigin: '30% 72%',
        }}
      >
        <div style={{borderRadius: 32, overflow: 'hidden', position: 'relative', boxShadow: '0 0 0 1px rgba(255,255,255,0.08)'}}>
          <Crop shot={SHOT.aiAnalyze} width={W} height={H}>
            <div
              style={{
                position: 'absolute',
                left: 72 * k,
                top: 808 * k,
                width: 590 * k * hl,
                height: 54 * k,
                background: 'rgba(127,209,176,0.42)',
                borderRadius: 6,
                mixBlendMode: 'multiply',
              }}
            />
          </Crop>
          <AbsoluteFill
            style={{
              background: `linear-gradient(180deg, rgba(0,0,0,${0.62 * hl}) 0%, rgba(0,0,0,${0.62 * hl}) 64%, rgba(0,0,0,0) 69.5%, rgba(0,0,0,0) 77%, rgba(0,0,0,${0.62 * hl}) 82%)`,
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ---------- S5 576–702：功能卡片纵向滚动 + 多端；10 小节第 3 拍音乐留白时画面同步淡黑 ---------- */
const FEATS = [0, 1, 2, 3, 4, 5, 6, 7];
const S5: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const cw = 900;
  const ch = cw * (394 / 853);
  const gap = 36;
  const scroll = tw(f, [0, 126], [0, (ch + gap) * 4], easeInOut);
  const out = tw(f, [112, 126], [1, 0], easeInOut);
  return (
    <AbsoluteFill style={{background: C.bg, opacity: out}}>
      <div style={{position: 'absolute', left: CX - cw / 2, top: 700, transform: `translateY(${-scroll}px)`}}>
        {FEATS.map((idx, i) => {
          const s = spr(f, fps, i * 5, {damping: 26, stiffness: 70});
          const r = featureRect(idx);
          return (
            <div
              key={idx}
              style={{
                marginBottom: gap,
                borderRadius: 28,
                overflow: 'hidden',
                opacity: s,
                transform: `translateY(${(1 - s) * 120}px)`,
                boxShadow: '0 0 0 1px rgba(255,255,255,0.08)',
              }}
            >
              <Crop shot={SHOT.features} view={{x: r.x, y: r.y, w: r.w}} width={cw} height={ch} />
            </div>
          );
        })}
      </div>
      {/* 上下渐隐遮罩，标题区保持纯黑 */}
      <AbsoluteFill style={{background: 'linear-gradient(180deg, #000 0%, #000 33%, rgba(0,0,0,0) 42%, rgba(0,0,0,0) 76%, #000 87%)'}} />
      <Line text="你的备考，" at={0} size={104} top={290} />
      <Line text="一处就绪。" at={16} size={104} top={420} grad />
      <Line text="电脑 · Android · iPhone / iPad" at={40} size={40} top={1720} weight={500} color={C.sub} />
    </AbsoluteFill>
  );
};

/* ---------- S6 720–864：Logo 落下 ---------- */
const S6: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spr(f, fps, 0, {damping: 20, stiffness: 90, mass: 1});
  const glow = tw(f, [0, 12, 90], [0, 1, 0.4]);
  const fadeOut = tw(f, [124, 144], [1, 0], easeInOut);
  return (
    <AbsoluteFill style={{background: C.bg, opacity: fadeOut}}>
      <AbsoluteFill style={{background: `radial-gradient(circle at 50% 38%, rgba(200,22,29,${0.2 * glow}) 0%, rgba(200,22,29,0) 30%)`}} />
      <div
        style={{
          position: 'absolute',
          left: CX - 130,
          top: 600,
          width: 260,
          height: 260,
          opacity: Math.min(1, s * 1.5),
          transform: `scale(${interpolate(s, [0, 1], [1.5, 1])})`,
          filter: `blur(${(1 - s) * 10}px) drop-shadow(0 24px 50px rgba(200,22,29,${0.35 * glow}))`,
        }}
      >
        <Img src={LOGO} style={{width: 260, height: 260}} />
      </div>
      <Line text="考匠 AceExam" at={14} size={92} top={940} />
      <Line text="认真练习，从容应考。" at={30} size={46} top={1080} weight={500} color={C.sub} />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 1260,
          display: 'flex',
          justifyContent: 'center',
          opacity: tw(f, [48, 70], [0, 1]),
        }}
      >
        <div
          style={{
            padding: '22px 52px',
            borderRadius: 999,
            background: '#f5f5f7',
            color: '#000',
            fontFamily: CN,
            fontWeight: 600,
            fontSize: 42,
            display: 'flex',
            alignItems: 'center',
            gap: 20,
          }}
        >
          免费试做 5 道题
          <span style={{fontFamily: LATIN, fontWeight: 500, color: '#6e6e73'}}>aceexam.top</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const PremiumV: React.FC = () => {
  useFonts();
  return (
    <AbsoluteFill style={{background: C.bg}}>
      {/* 切点全部落在小节线；S5 在 10 小节第 3 拍（音乐留白）淡出到黑 */}
      <Scenes
        scenes={[
          {from: 0, dur: 2 * BAR, el: <S1 />},
          {from: 2 * BAR, dur: 2 * BAR + 8, el: <S2 />, fadeIn: 14, fadeOut: 10},
          {from: 4 * BAR, dur: 2 * BAR + 8, el: <S3 />, fadeIn: 10, fadeOut: 10},
          {from: 6 * BAR, dur: 2 * BAR + 8, el: <S4 />, fadeIn: 10, fadeOut: 10},
          {from: 8 * BAR, dur: 126, el: <S5 />, fadeIn: 10},
          {from: 10 * BAR, dur: 2 * BAR, el: <S6 />},
        ]}
      />
      <Audio src={music('premium-v')} volume={0.9} />
    </AbsoluteFill>
  );
};
