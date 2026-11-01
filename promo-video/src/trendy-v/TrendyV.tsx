import React from 'react';
import {AbsoluteFill, Audio, Img, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {CARD_POS, CERTS, LOGO, SHOT, featureRect, music} from '../shared/assets';
import {CN, FUN, LATIN, useFonts} from '../shared/fonts';
import {bounce, easeInOut, easeOut, rand, spr, tw} from '../shared/anim';
import {Crop, Cursor, PhoneFrame, Scenes, Sfx} from '../shared/ui';
import {PopWord} from '../shared/text';
import {ColorBg, Sticker, Y, stroke} from '../trendy/Trendy';
import {Subtitles, VO, VoiceTrack} from './Subtitles';

// 竖屏 1080×1920，节奏与横版 Trendy 一致：120 BPM，1 拍 = 15 帧，1 小节 = 60 帧
const T = 15;
const BAR = 60;
const CX = 540;
// 字幕区（避开抖音/小红书底部 UI）
const SUB_TOP = 1450;

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
          top: 560,
          textAlign: 'center',
          fontFamily: FUN,
          fontSize: 180,
          color: Y.white,
          lineHeight: 1.15,
          transform: `scale(${interpolate(s, [0, 1], [3, 1])}) rotate(${(1 - s) * -10 - 3}deg)`,
          ...stroke(Y.ink, 14),
        }}
      >
        刷题刷到
        <br />
        <span style={{color: Y.pink}}>怀疑人生？</span>
      </div>
      <Sfx at={0} name="stamp" volume={0.5} />
    </AbsoluteFill>
  );
};

/* ---------- S2 30–60：手机弹入 “考匠来了” ---------- */
const S2: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const b = bounce(f, fps, 0);
  const PW = 470;
  return (
    <AbsoluteFill>
      <ColorBg color={Y.blue} dot="rgba(255,255,255,0.18)" />
      <div style={{position: 'absolute', left: CX - PW / 2 + 30, top: 390, transform: `scale(${b}) rotate(${(1 - b) * 20 + 4}deg)`}}>
        <PhoneFrame width={PW} color={Y.ink} style={{boxShadow: `16px 16px 0 ${Y.ink}`}}>
          <Crop shot={SHOT.mobileHome} width={PW * 0.93} height={PW * 0.93 * (2532 / 1170)} />
        </PhoneFrame>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 170,
          textAlign: 'center',
          fontFamily: FUN,
          fontSize: 160,
          color: Y.yellow,
          transform: `rotate(-6deg) scale(${spr(f, fps, 4, {damping: 9, stiffness: 220})})`,
          ...stroke(Y.ink, 12),
        }}
      >
        考匠来了！
      </div>
      <Sfx at={0} name="pop" volume={0.5} />
    </AbsoluteFill>
  );
};

/* ---------- S3 60–180：痛点三连 + 停 ---------- */
const PAINS = [
  {t: '同一题', s: '错三遍', bg: Y.pink},
  {t: '答案', s: '看不懂', bg: Y.mint},
  {t: '到底', s: '错在哪？', bg: Y.yellow},
];
const S3: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const i = Math.min(2, Math.floor(f / 30));
  const local = f - i * 30;
  const p = PAINS[i];
  const s = spr(local, fps, 0, {damping: 9, stiffness: 240, mass: 0.5});
  const stop = f >= 105;
  return (
    <AbsoluteFill>
      <ColorBg color={stop ? Y.ink : p.bg} dot={stop ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.16)'} />
      {!stop && (
        <div style={{position: 'absolute', left: 0, right: 0, top: 480, textAlign: 'center', transform: `scale(${0.5 + s * 0.5}) rotate(${(i - 1) * 4}deg)`}}>
          <div style={{fontFamily: FUN, fontSize: 150, color: Y.white, ...stroke(Y.ink, 12)}}>{p.t}</div>
          <div style={{fontFamily: FUN, fontSize: 230, color: Y.ink, lineHeight: 1.05, transform: `translateX(${(1 - s) * 200 * (i % 2 ? -1 : 1)}px)`}}>{p.s}</div>
        </div>
      )}
      {!stop && (
        <div style={{position: 'absolute', left: 0, right: 0, top: 220, textAlign: 'center', fontFamily: LATIN, fontWeight: 700, fontSize: 64, color: Y.ink}}>
          0{i + 1}<span style={{opacity: 0.4}}> / 03</span>
        </div>
      )}
      {stop && (
        <div style={{position: 'absolute', left: 0, right: 0, top: 760, textAlign: 'center', fontFamily: FUN, fontSize: 200, color: Y.yellow, transform: `scale(${spr(f - 105, fps, 0, {damping: 8, stiffness: 300})})`}}>
          停！
        </div>
      )}
      {[0, 15, 30, 45, 60, 75].map((a) => (
        <Sfx key={a} at={a} name={a % 30 === 0 ? 'stamp' : 'tap'} volume={a % 30 === 0 ? 0.35 : 0.3} />
      ))}
      <Sfx at={105} name="boing" volume={0.45} />
    </AbsoluteFill>
  );
};

/* ---------- S4 180–300：答错 ✕ → 圆形遮罩 Match Cut 到 AI 分析错题 ---------- */
const S4: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const W = 900;
  const k = W / 1218;
  const pick = T;
  const confirm = 2 * T;
  const shot = f < pick ? SHOT.q1 : f < confirm ? SHOT.q1Selected : SHOT.q1Result;
  const H = (f < confirm ? 1066 : 1230) * k;
  const enter = bounce(f, fps, 0);
  const xPop = bounce(f, fps, confirm);
  const pts = [
    {x: W - 60, y: 120},
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
  const btnClick = 4 * T + 12;
  const iris = tw(f, [btnClick + 2, btnClick + 22], [0, 1], easeOut);
  const left = CX - W / 2 - 10;
  const top = 430;
  const bx = left + 10 + CARD_POS.aiAnalyzeBtn.x * k;
  const by = top + 10 + CARD_POS.aiAnalyzeBtn.y * k;
  const AW = 960;
  const AH = 1132 * (AW / 1360);
  return (
    <AbsoluteFill>
      <ColorBg color={Y.white} dot="rgba(0,0,0,0.08)" />
      <div style={{position: 'absolute', left: 0, right: 0, top: 170, fontFamily: FUN, fontSize: 150, color: Y.ink, transform: 'rotate(-4deg)'}}>
        <PopWord text="答错了？" start={0} />
      </div>
      <div style={{position: 'absolute', left, top, transform: `scale(${enter}) rotate(${(1 - enter) * -12 - 1.5}deg)`}}>
        <Sticker>
          <Crop shot={shot} width={W} height={H} />
        </Sticker>
        <Cursor x={cx + 10} y={cy + 10} press={Math.max(press(pick), press(confirm), press(btnClick))} size={48} />
      </div>
      {f >= confirm && (
        <div
          style={{
            position: 'absolute',
            right: 50,
            top: 330,
            width: 230,
            height: 230,
            borderRadius: 999,
            background: Y.red,
            border: `8px solid ${Y.ink}`,
            boxShadow: `12px 12px 0 ${Y.ink}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: LATIN,
            fontWeight: 700,
            fontSize: 160,
            color: Y.white,
            transform: `scale(${xPop}) rotate(${(1 - xPop) * 90}deg)`,
          }}
        >
          ✕
        </div>
      )}
      {iris > 0 && (
        <AbsoluteFill style={{clipPath: `circle(${iris * 2400}px at ${bx}px ${by}px)`}}>
          <ColorBg color={Y.mint} />
          <div style={{position: 'absolute', left: CX - AW / 2 - 10, top: 420}}>
            <Sticker rot={-1.5}>
              <Crop shot={SHOT.aiAnalyze} width={AW} height={AH} />
            </Sticker>
          </div>
        </AbsoluteFill>
      )}
      <Sfx at={pick} name="click" volume={0.6} />
      <Sfx at={confirm} name="error" volume={0.4} />
      <Sfx at={confirm} name="boing" volume={0.3} />
      <Sfx at={btnClick} name="click" volume={0.6} />
      <Sfx at={btnClick + 2} name="whoosh-fast" volume={0.45} />
    </AbsoluteFill>
  );
};

/* ---------- S5 300–420：AI 错因 + 荧光笔 ---------- */
const S5: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const AW = 900;
  const ak = AW / 1360;
  const VY = 236;
  const VH = (1132 - VY) * ak;
  const zoom = tw(f, [0, 30], [1, 1.08], easeInOut);
  const hl = tw(f, [44, 70], [0, 1], easeOut);
  const st = bounce(f, fps, 2);
  const st2 = bounce(f, fps, 74);
  return (
    <AbsoluteFill>
      <ColorBg color={Y.mint} />
      <div style={{position: 'absolute', left: CX - AW / 2 - 10, top: 560, transform: `scale(${zoom})`, transformOrigin: '50% 75%'}}>
        <Sticker rot={-1.5}>
          <Crop shot={SHOT.aiAnalyze} view={{x: 0, y: VY, w: 1360}} width={AW} height={VH}>
            <div style={{position: 'absolute', left: 70 * ak, top: (810 - VY) * ak, width: 600 * ak * hl, height: 52 * ak, background: Y.yellow, mixBlendMode: 'multiply', borderRadius: 4}} />
          </Crop>
        </Sticker>
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 200, display: 'flex', justifyContent: 'center'}}>
        <div
          style={{
            padding: '22px 46px',
            background: Y.pink,
            border: `6px solid ${Y.ink}`,
            borderRadius: 26,
            boxShadow: `10px 10px 0 ${Y.ink}`,
            fontFamily: FUN,
            fontSize: 112,
            color: Y.white,
            transform: `scale(${st}) rotate(${-4 - (1 - st) * 30}deg)`,
            ...stroke(Y.ink, 6),
          }}
        >
          错因一针见血
        </div>
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 1290, display: 'flex', justifyContent: 'center'}}>
        <div
          style={{
            padding: '14px 34px',
            background: Y.yellow,
            border: `5px solid ${Y.ink}`,
            borderRadius: 999,
            fontFamily: CN,
            fontWeight: 900,
            fontSize: 46,
            color: Y.ink,
            transform: `scale(${st2}) rotate(-3deg)`,
          }}
        >
          AI 分析错题 · 免费体验
        </div>
      </div>
      <Sfx at={2} name="pop" volume={0.5} />
      <Sfx at={44} name="swipe" volume={0.35} />
      <Sfx at={74} name="correct" volume={0.35} />
    </AbsoluteFill>
  );
};

/* ---------- S6 420–540：功能甩牌，竖向堆叠 ---------- */
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
  const cw = 920;
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
              left: CX - cw / 2 - 10,
              top: 640 + (settled ? (j - i) * 70 : 0),
              transform: `translateX(${(1 - s) * 1300}px) rotate(${(1 - s) * 40 + (j - 1.5) * 3}deg) scale(${settled ? 0.92 : 1})`,
              opacity: settled ? 0.7 : 1,
            }}
          >
            <Sticker>
              <Crop shot={SHOT.features} view={{x: r.x, y: r.y, w: r.w}} width={cw} height={ch} />
            </Sticker>
          </div>
        );
      })}
      <div style={{position: 'absolute', left: 0, right: 0, top: 230, display: 'flex', gap: 22, alignItems: 'baseline', justifyContent: 'center'}}>
        {CARDS.map((c, j) => {
          const s = bounce(f, fps, j * 30);
          return (
            <span
              key={c.word}
              style={{
                fontFamily: FUN,
                fontSize: j === i ? 150 : 96,
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
        <Sfx key={j} at={j * 30} name="swipe" volume={0.45} />
      ))}
    </AbsoluteFill>
  );
};

/* ---------- S7 540–660：证书弹幕 + 电脑手机 ---------- */
const S7: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const split = bounce(f, fps, 0);
  const W = 820;
  const H = W * (2000 / 3200);
  return (
    <AbsoluteFill>
      <ColorBg color={Y.yellow} />
      <div style={{position: 'absolute', left: 50, top: 520, transform: `translateY(${(1 - split) * 900}px) rotate(-3deg)`}}>
        <Sticker>
          <Crop shot={SHOT.downloads} width={W} height={H} />
        </Sticker>
      </div>
      <div style={{position: 'absolute', left: 680, top: 760, transform: `translateY(${(1 - bounce(f, fps, 6)) * 1200}px) rotate(6deg)`}}>
        <PhoneFrame width={320} color={Y.ink}>
          <Crop shot={SHOT.mobileHome} width={298} height={298 * (2532 / 1170)} />
        </PhoneFrame>
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 300, textAlign: 'center', fontFamily: FUN, fontSize: 130, color: Y.pink, transform: `rotate(-4deg) scale(${bounce(f, fps, 14)})`, ...stroke(Y.ink, 10)}}>
        电脑手机都能刷
      </div>
      {CERTS.map((c, i) => {
        const speed = 16 + (i % 3) * 4;
        const x = 1080 - (f - i * 8) * speed;
        const y = [80, 190, 1270, 1360, 1180][i];
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
              fontSize: 44,
            }}
          >
            {c}
          </div>
        );
      })}
      <Sfx at={0} name="whoosh" volume={0.4} />
      <Sfx at={14} name="pop" volume={0.4} />
    </AbsoluteFill>
  );
};

/* ---------- S8 660–780：盖章 Logo + CTA ---------- */
const S8: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const stamp = spr(f, fps, 0, {damping: 10, stiffness: 260, mass: 0.7});
  const btn = bounce(f, fps, 40);
  const breathe = 1 + Math.sin(Math.max(0, f - 56) / 6) * 0.03;
  const hit = 90;
  const finalPunch = f >= hit ? 1 + 0.08 * Math.max(0, 1 - (f - hit) / 8) : 1;
  return (
    <AbsoluteFill style={{transform: `scale(${finalPunch})`}}>
      <ColorBg color={Y.green} dot="rgba(255,255,255,0.12)" />
      <div style={{position: 'absolute', left: CX - 170, top: 300, width: 340, height: 340, transform: `scale(${interpolate(stamp, [0, 1], [3.2, 1])}) rotate(${(1 - stamp) * -20 - 4}deg)`, filter: `drop-shadow(12px 12px 0 ${Y.ink})`}}>
        <Img src={LOGO} style={{width: 340, height: 340}} />
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 720, textAlign: 'center', fontFamily: FUN, color: Y.white, ...stroke(Y.ink, 12)}}>
        <PopWord text="考匠" start={6} stagger={3} style={{fontSize: 220, lineHeight: 1}} />
        <PopWord text="AceExam" start={12} stagger={2} style={{fontSize: 140, lineHeight: 1.1}} />
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 1130, display: 'flex', justifyContent: 'center'}}>
        <div
          style={{
            transform: `scale(${btn * breathe})`,
            padding: '26px 56px',
            borderRadius: 999,
            background: Y.yellow,
            border: `6px solid ${Y.ink}`,
            boxShadow: `10px 10px 0 ${Y.ink}`,
            fontFamily: CN,
            fontWeight: 900,
            fontSize: 60,
            color: Y.ink,
            textAlign: 'center',
            lineHeight: 1.2,
          }}
        >
          免费试做 5 道题
          <div style={{fontFamily: LATIN, fontWeight: 700, fontSize: 44, opacity: 0.75}}>aceexam.top</div>
        </div>
      </div>
      <Sfx at={0} name="stamp" volume={0.6} />
      <Sfx at={40} name="pop" volume={0.5} />
    </AbsoluteFill>
  );
};

/** 人声闪避：说话时音乐压低，前后各 6 帧平滑过渡 */
const DUCK_LO = 0.45;
const DUCK_HI = 1;
const duck = (f: number) => {
  let g = 1;
  for (const l of VO) {
    const a = l.start - 4;
    const b = l.start + l.dur + 4;
    const d = f < a ? a - f : f > b ? f - b : 0;
    g = Math.min(g, Math.min(1, d / 6));
  }
  return DUCK_LO + (DUCK_HI - DUCK_LO) * g;
};

/** narration=false：纯音乐版，不加配音和字幕，音乐不闪避 */
export const TrendyV: React.FC<{narration?: boolean}> = ({narration = true}) => {
  useFonts();
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
      {narration && <Subtitles top={SUB_TOP} color={Y.white} hot={Y.yellow} ink={Y.ink} />}
      <Audio src={music('trendy')} volume={narration ? duck : 0.75} />
      {narration && <VoiceTrack volume={1.6} />}
    </AbsoluteFill>
  );
};
