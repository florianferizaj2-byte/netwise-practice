import React from 'react';
import {AbsoluteFill, Audio, Img, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {CARD_POS, CERTS, FEATURE_NAMES, LOGO, SHOT, featureRect, music} from '../shared/assets';
import {CN, LATIN, useFonts} from '../shared/fonts';
import {easeInOut, easeOut, spr, tw} from '../shared/anim';
import {BrowserFrame, Crop, Cursor, Grain, PhoneFrame, Scenes, Sfx, Vignette} from '../shared/ui';
import {RiseText} from '../shared/text';
import {BEAT, Caption, P, Sheen, Stage} from './common';

const B = BEAT; // 18 帧 = 1 拍，1 小节 = 72 帧

/* ---------- S1 0–144：悬浮屏幕 + 主标语 ---------- */
const S1: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spr(f, fps, 0, {damping: 30, stiffness: 40, mass: 1.4});
  const rx = interpolate(s, [0, 1], [32, 10]);
  const ry = interpolate(f, [0, 144], [-14, -20]);
  const z = interpolate(s, [0, 1], [-900, 0]);
  const blur = interpolate(f, [0, 30], [14, 0], {extrapolateRight: 'clamp'});
  const W = 1180;
  const H = W * (1000 / 1600);
  return (
    <Stage glowX={64}>
      <AbsoluteFill style={{perspective: 2200, perspectiveOrigin: '60% 40%'}}>
        <div
          style={{
            position: 'absolute',
            left: 800,
            top: 170,
            transformStyle: 'preserve-3d',
            transform: `translateZ(${z}px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(${Math.sin(f / 30) * 6}px)`,
            filter: `blur(${blur}px)`,
            opacity: tw(f, [0, 18], [0, 1]),
          }}
        >
          <BrowserFrame width={W} height={H} dark>
            <Crop shot={SHOT.hero} width={W} height={H} />
            <Sheen start={22} dur={50} />
          </BrowserFrame>
          {/* 倒影 */}
          <div
            style={{
              width: W,
              height: 220,
              marginTop: 12,
              opacity: 0.16,
              transform: 'scaleY(-1)',
              maskImage: 'linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0) 80%)',
              WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0) 80%)',
              overflow: 'hidden',
              borderRadius: 18,
            }}
          >
            <Crop shot={SHOT.hero} view={{x: 0, y: 2000 - 220 * (3200 / W), w: 3200}} width={W} height={220} />
          </div>
        </div>
      </AbsoluteFill>
      <Caption eyebrow="考匠 AceExam" lines={['把每一道题，', '学成你的底气。']} start={20} x={150} y={360} size={92} accentLine={1} />
      <Sfx at={0} name="shimmer" volume={0.25} />
    </Stage>
  );
};

/* ---------- S2 144–360：真实试做——点选、判错、正确答案 ---------- */
const S2: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const W = 760;
  const k = W / 1218;
  const pick = 2 * B; // 36
  const confirm = 5 * B; // 90
  const shot = f < pick ? SHOT.q1 : f < confirm ? SHOT.q1Selected : SHOT.q1Result;
  const H = (f < confirm ? 1066 : 1230) * k;
  const enter = spr(f, fps, 0, {damping: 28, stiffness: 70});
  const cam = tw(f, [0, 216], [0, 1], easeInOut);
  const scale = interpolate(cam, [0, 1], [1.0, 1.12]);
  // 光标路径（卡片像素 → 容器坐标）
  const pA = {x: CARD_POS.optionA.x * k + 140, y: CARD_POS.optionA.y * k + 10};
  const pC = {x: CARD_POS.confirm.x * k - 30, y: CARD_POS.confirm.y * k + 6};
  const m1 = tw(f, [6, pick - 2], [0, 1], easeInOut);
  const m2 = tw(f, [pick + 14, confirm - 2], [0, 1], easeInOut);
  const cx = f < pick + 14 ? interpolate(m1, [0, 1], [W + 60, pA.x]) : interpolate(m2, [0, 1], [pA.x, pC.x]);
  const cy = f < pick + 14 ? interpolate(m1, [0, 1], [H * 0.25, pA.y]) : interpolate(m2, [0, 1], [pA.y, pC.y]);
  const press = (at: number) => Math.max(0, 1 - Math.abs(f - at) / 5);
  const resultPop = spr(f, fps, confirm, {damping: 14, stiffness: 160});
  return (
    <Stage glowX={66}>
      <Caption
        eyebrow="免登录体验"
        lines={['先试 5 道题，', '无需注册。']}
        sub="软考网络工程师 · 真实题目"
        start={6}
        x={150}
        y={340}
        size={86}
      />
      <div
        style={{
          position: 'absolute',
          left: 1000,
          top: 540 - H / 2,
          transform: `translateY(${(1 - enter) * 80}px) scale(${scale}) perspective(1800px) rotateY(${interpolate(cam, [0, 1], [-8, -3])}deg)`,
          transformOrigin: '30% 50%',
          opacity: enter,
        }}
      >
        <div
          style={{
            borderRadius: 22,
            overflow: 'hidden',
            boxShadow: '0 70px 140px -40px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.1)',
            transform: `scale(${f >= confirm ? 1 + (resultPop - 1) * 0.02 + (1 - resultPop) * 0.0 : 1})`,
          }}
        >
          <Crop shot={shot} width={W} height={H} />
          {f >= confirm && <Sheen start={confirm} dur={30} />}
        </div>
        <Cursor x={cx} y={cy} press={Math.max(press(pick), press(confirm))} />
      </div>
      <Sfx at={pick} name="click" volume={0.7} />
      <Sfx at={confirm} name="click" volume={0.7} />
      <Sfx at={confirm + 3} name="error" volume={0.35} />
      <Sfx at={confirm + 14} name="correct" volume={0.4} />
    </Stage>
  );
};

/* ---------- S3 360–576：AI 详细解析，2.5D 层叠升起 ---------- */
const S3: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const lift = spr(f, fps, 4, {damping: 26, stiffness: 60, mass: 1.2});
  const W = 820;
  const k = W / 1360;
  const viewH = 900;
  const scroll = tw(f, [34, 112], [0, 1800 * k - viewH + 40], easeInOut);
  const cardW = 600;
  return (
    <Stage glowX={58}>
      <AbsoluteFill style={{perspective: 2400}}>
        {/* 后层：试做结果卡片 */}
        <div
          style={{
            position: 'absolute',
            left: 860,
            top: 300,
            transform: `translateZ(${-400 - lift * 200}px) rotateY(-16deg) rotateX(6deg)`,
            opacity: 0.55 - lift * 0.25,
            filter: `blur(${2 + lift * 3}px)`,
            borderRadius: 20,
            overflow: 'hidden',
          }}
        >
          <Crop shot={SHOT.q1Result} width={cardW} height={cardW * (1230 / 1218)} />
        </div>
        {/* 前层：AI 详细解析 */}
        <div
          style={{
            position: 'absolute',
            left: 940,
            top: 90,
            width: W,
            height: viewH,
            borderRadius: 24,
            overflow: 'hidden',
            transform: `translateY(${(1 - lift) * 260}px) translateZ(${lift * 40}px) rotateY(${-10 + lift * 4}deg) rotateX(${(1 - lift) * 14}deg)`,
            opacity: lift,
            boxShadow: '0 80px 160px -50px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.12)',
          }}
        >
          <div style={{transform: `translateY(${-scroll}px)`}}>
            <Crop shot={SHOT.aiExplain} width={W} height={1800 * k} />
          </div>
          <Sheen start={18} dur={44} />
        </div>
      </AbsoluteFill>
      <Caption eyebrow="考匠 AI" lines={['AI 帮你，', '读懂每一题。']} sub="AI 详细解析 · 逐项拆解 A / B / C / D" start={8} x={150} y={360} size={86} accentLine={1} />
      <Sfx at={2} name="whoosh" volume={0.35} />
    </Stage>
  );
};

/* ---------- S4 576–720：AI 分析错题，关键句高亮 ---------- */
const S4: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spr(f, fps, 0, {damping: 30, stiffness: 70});
  const W = 1040;
  const k = W / 1360;
  const H = 1132 * k;
  const zoom = tw(f, [10, 116], [1, 1.16], easeInOut);
  // 高亮“混淆了网络层与传输层的职责。”所在行（截图像素约 x 76–650, y 812–858）
  const hl = tw(f, [36, 64], [0, 1], easeInOut);
  return (
    <Stage glowX={50} glowY={50}>
      <div
        style={{
          position: 'absolute',
          left: 960 - W / 2 + 330,
          top: 540 - H / 2,
          transform: `scale(${zoom}) translateY(${(1 - enter) * 60}px)`,
          transformOrigin: '20% 72%',
          opacity: enter,
        }}
      >
        <div style={{borderRadius: 24, overflow: 'hidden', boxShadow: '0 80px 160px -50px rgba(0,0,0,0.85)', position: 'relative'}}>
          <Crop shot={SHOT.aiAnalyze} width={W} height={H}>
            <div
              style={{
                position: 'absolute',
                left: 72 * k,
                top: 808 * k,
                width: 590 * k * hl,
                height: 54 * k,
                background: 'rgba(127,209,176,0.38)',
                borderRadius: 6,
                mixBlendMode: 'multiply',
              }}
            />
          </Crop>
          {/* 画面压暗，突出高亮行 */}
          <AbsoluteFill
            style={{
              background: `linear-gradient(180deg, rgba(6,7,8,${0.5 * hl}) 0%, rgba(6,7,8,${0.5 * hl}) 60%, rgba(6,7,8,0) 68%, rgba(6,7,8,0) 78%, rgba(6,7,8,${0.5 * hl}) 84%)`,
            }}
          />
        </div>
      </div>
      <Caption eyebrow="AI 分析错题" lines={['看清错因，', '才能真正掌握。']} start={4} x={120} y={380} size={80} accentLine={1} />
      <Sfx at={36} name="shimmer" volume={0.3} />
    </Stage>
  );
};

/* ---------- S5 720–864：功能空间 + 证书 ---------- */
const S5: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const order = [0, 1, 2, 3, 4, 5, 6, 7, 9];
  const camX = tw(f, [0, 116], [120, -120], easeInOut);
  const cw = 380;
  const ch = cw * (394 / 853);
  return (
    <Stage glowY={48}>
      <AbsoluteFill style={{perspective: 2000, perspectiveOrigin: '50% 45%'}}>
        <div
          style={{
            position: 'absolute',
            left: 960,
            top: 560,
            transformStyle: 'preserve-3d',
            transform: `translateX(${camX}px) rotateX(14deg) rotateY(${tw(f, [0, 116], [10, -10], easeInOut)}deg)`,
          }}
        >
          {order.map((idx, i) => {
            const col = i % 3;
            const row = Math.floor(i / 3);
            const s = spr(f, fps, 4 + i * 3, {damping: 22, stiffness: 90});
            const r = featureRect(idx);
            return (
              <div
                key={idx}
                style={{
                  position: 'absolute',
                  left: (col - 1) * (cw + 30) - cw / 2,
                  top: (row - 1) * (ch + 30) - ch / 2 - 40,
                  transform: `translateZ(${(1 - s) * -600 + (col === 1 ? 40 : 0)}px) rotateY(${(1 - s) * 50}deg)`,
                  opacity: s,
                  borderRadius: 16,
                  overflow: 'hidden',
                  boxShadow: '0 40px 80px -30px rgba(0,0,0,0.8)',
                  background: '#fff',
                }}
              >
                <Crop shot={SHOT.features} view={{x: r.x, y: r.y, w: r.w}} width={cw} height={ch} />
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      <div style={{position: 'absolute', left: 0, right: 0, top: 70, textAlign: 'center', fontFamily: CN}}>
        <RiseText
          text="你的备考，一处就绪。"
          start={6}
          stagger={1.6}
          style={{fontSize: 72, fontWeight: 700, color: P.ink, justifyContent: 'center'}}
        />
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, bottom: 70, display: 'flex', justifyContent: 'center', gap: 18, fontFamily: CN}}>
        {CERTS.map((c, i) => {
          const o = tw(f, [50 + i * 7, 66 + i * 7], [0, 1]);
          return (
            <div
              key={c}
              style={{
                padding: '14px 26px',
                borderRadius: 99,
                border: '1px solid rgba(255,255,255,0.18)',
                background: 'rgba(255,255,255,0.05)',
                color: P.ink,
                fontSize: 27,
                opacity: o,
                transform: `translateY(${(1 - o) * 16}px)`,
              }}
            >
              {c}
            </div>
          );
        })}
      </div>
      <Sfx at={0} name="whoosh" volume={0.3} />
    </Stage>
  );
};

/* ---------- S6 864–864+? 多端（并入 S5 结尾前） → S7 品牌收尾 ---------- */
const S6: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spr(f, fps, 0, {damping: 26, stiffness: 60});
  const s2 = spr(f, fps, 8, {damping: 20, stiffness: 70});
  const W = 920;
  const H = W * (1000 / 1600);
  return (
    <Stage glowX={60}>
      <AbsoluteFill style={{perspective: 2200}}>
        <div style={{position: 'absolute', left: 720, top: 230, transform: `rotateY(-14deg) rotateX(6deg) translateZ(${(1 - s) * -500}px)`, opacity: s}}>
          <BrowserFrame width={W} height={H} dark>
            <Crop shot={SHOT.downloads} width={W} height={H} />
          </BrowserFrame>
        </div>
        <div
          style={{
            position: 'absolute',
            left: 1520,
            top: 290,
            transform: `rotateY(-22deg) translateY(${(1 - s2) * 200}px) translateZ(120px)`,
            opacity: s2,
          }}
        >
          <PhoneFrame width={300}>
            <Crop shot={SHOT.mobileHome} width={279} height={279 * (2532 / 1170)} />
          </PhoneFrame>
        </div>
      </AbsoluteFill>
      <Caption eyebrow="多端学习" lines={['同一个账号，', '同一份学习记录。']} sub="电脑网页 · Android · iPhone / iPad" start={6} x={120} y={380} size={66} accentLine={1} />
    </Stage>
  );
};

/* ---------- S7 品牌收尾 ---------- */
const S7: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const stamp = spr(f, fps, 0, {damping: 14, stiffness: 120, mass: 0.9});
  const glow = tw(f, [0, 10, 60], [0, 1, 0.35]);
  const fadeOut = tw(f, [120, 144], [1, 0], easeInOut);
  return (
    <AbsoluteFill style={{background: P.bg0, opacity: fadeOut}}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 42%, rgba(200,22,29,${0.22 * glow}) 0%, rgba(200,22,29,0) 35%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 960 - 110,
          top: 300,
          width: 220,
          height: 220,
          transform: `scale(${interpolate(stamp, [0, 1], [2.4, 1])}) rotate(${(1 - stamp) * -8}deg)`,
          opacity: Math.min(1, stamp * 1.6),
          filter: `drop-shadow(0 20px 40px rgba(200,22,29,${0.4 * glow}))`,
        }}
      >
        <Img src={LOGO} style={{width: 220, height: 220}} />
      </div>
      <div style={{position: 'absolute', top: 580, left: 0, right: 0, textAlign: 'center', fontFamily: CN, color: P.ink}}>
        <RiseText text="考匠 AceExam" start={10} stagger={2} style={{fontSize: 80, fontWeight: 700, justifyContent: 'center', letterSpacing: '0.02em'}} />
        <div style={{marginTop: 20, fontSize: 34, color: P.sub, opacity: tw(f, [28, 46], [0, 1]), letterSpacing: '0.12em'}}>认真练习，从容应考。</div>
        <div
          style={{
            margin: '54px auto 0',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 18,
            padding: '18px 40px',
            borderRadius: 99,
            border: '1px solid rgba(255,255,255,0.22)',
            fontFamily: LATIN,
            fontSize: 34,
            letterSpacing: '0.06em',
            opacity: tw(f, [40, 58], [0, 1]),
          }}
        >
          aceexam.top
          <span style={{width: 1, height: 26, background: 'rgba(255,255,255,0.3)'}} />
          <span style={{fontFamily: CN, color: P.accent}}>免费试做 5 道题</span>
        </div>
      </div>
      <Sfx at={0} name="impact-soft" volume={0.55} />
    </AbsoluteFill>
  );
};

export const Premium: React.FC = () => {
  useFonts();
  const bar = 4 * B; // 72
  return (
    <AbsoluteFill style={{background: P.bg0}}>
      {/* 小节 = 72 帧；切点全部落在小节线或第 3 拍 */}
      <Scenes
        scenes={[
          {from: 0, dur: 2 * bar + 8, el: <S1 />, fadeOut: 10},
          {from: 2 * bar, dur: 2 * bar + 8, el: <S2 />, fadeIn: 8, fadeOut: 10},
          {from: 4 * bar, dur: 108 + 8, el: <S3 />, fadeIn: 8, fadeOut: 10},
          {from: 4 * bar + 108, dur: 108 + 8, el: <S4 />, fadeIn: 8, fadeOut: 10},
          {from: 4 * bar + 216, dur: 108 + 8, el: <S5 />, fadeIn: 8, fadeOut: 10},
          {from: 4 * bar + 324, dur: 108 + 4, el: <S6 />, fadeIn: 8, fadeOut: 4},
          {from: 10 * bar, dur: 2 * bar, el: <S7 />},
        ]}
      />
      <Vignette strength={0.5} />
      <Grain opacity={0.05} />
      <Audio src={music('premium')} volume={0.85} />
    </AbsoluteFill>
  );
};
