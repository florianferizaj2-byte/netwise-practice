import React, { useEffect, useRef, useState } from "react";

export class PracticeAudio {
  constructor() {
    this.context = null;
    this.nodes = new Map();
    this.volume = 0.5;
  }
  async unlock() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error("当前浏览器不支持音效");
    this.context ||= new Audio();
    if (this.context.state === "suspended") await this.context.resume();
  }
  tone(
    frequency,
    delay,
    duration,
    type = "sine",
    strength = 0.12,
  ) {
    const ctx = this.context;
    if (!ctx || ctx.state !== "running" || this.volume === 0) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + delay;
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(strength * this.volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(ctx.destination);
    this.nodes.set(osc, { gain });
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
      this.nodes.delete(osc);
    };
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }
  celebrate(streak) {
    this.stop();
    const count = Math.min(8, 3 + Math.floor(streak / 3));
    const notes = [523, 659, 784, 1047, 1175, 1319, 1568, 2093];
    notes.slice(0, count).forEach((note, i) => this.tone(note, i * 0.09, 0.35));
  }
  stop() {
    for (const [osc, entry] of this.nodes) {
      osc.onended = null;
      osc.stop();
      osc.disconnect();
      entry.gain.disconnect();
      this.nodes.delete(osc);
    }
  }
  dispose() {
    this.stop();
    this.context?.close().catch(() => {});
    this.context = null;
  }
}

export function PracticeModes({ outcome }) {
  const [burst, setBurst] = useState(null);
  const audio = useRef(null);
  const last = useRef(outcome);
  const getAudio = () => (audio.current ||= new PracticeAudio());
  const unlock = () =>
    getAudio()
      .unlock()
      .catch(() => {});

  useEffect(() => {
    const activate = () => { void unlock(); };
    document.addEventListener("pointerdown", activate);
    document.addEventListener("keydown", activate);
    return () => {
      document.removeEventListener("pointerdown", activate);
      document.removeEventListener("keydown", activate);
      audio.current?.dispose();
    };
  }, []);
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        audio.current?.stop();
        setBurst(null);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  useEffect(() => {
    if (last.current === outcome) return;
    last.current = outcome;
    if (!outcome?.streak || document.hidden) {
      setBurst(null);
      return;
    }
    setBurst(outcome);
    audio.current?.celebrate(outcome.streak);
  }, [outcome]);
  useEffect(() => {
    if (!burst) return;
    const timer = setTimeout(() => setBurst(null), 2400);
    return () => clearTimeout(timer);
  }, [burst]);

  return (
    <>
      {burst && (
        <div key={burst.serial} className="practice-celebration" role="status" aria-live="polite" aria-atomic="true">
          <div className="celebration-message">
            <div className="celebration-medal" aria-hidden="true">
              <svg viewBox="0 0 48 48"><path d="m12 25 8 8 17-19" /></svg>
            </div>
            <b>
              {burst.streak >= 10
                ? "势如破竹！"
                : burst.streak >= 3
                  ? "状态火热！"
                  : "答得漂亮！"}
            </b>
            <span>{burst.streak > 1 ? `${burst.streak} 连对！继续保持` : "没错，就是这样！"}</span>
          </div>
          <div className="confetti-field" aria-hidden="true">
            {Array.from(
              { length: Math.min(64, 16 + burst.streak * 4) },
              (_, i) => (
                <i
                  key={i}
                  style={{
                    "--drift": `${Math.cos(i * 2.399) * (90 + (i % 6) * 27)}px`,
                    "--rise": `${Math.sin(i * 2.399) * (65 + (i % 5) * 24)}px`,
                    "--spin": `${i % 2 ? 390 : -330}deg`,
                    "--delay": `${(i % 7) * 0.055}s`,
                    "--color": ["#ffd43b", "#78cc28", "#38bdf8", "#ff85ae"][
                      i % 4
                    ],
                  }}
                />
              ),
            )}
          </div>
        </div>
      )}
    </>
  );
}
