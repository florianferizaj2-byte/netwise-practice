// music.mjs - procedural music beds + SFX library for the AceExam promo videos.
// 100% original synthesis: no samples, no downloads. Deterministic (seeded PRNG).
// Usage (from promo-video/):  node scripts/music.mjs
// Output: public/audio/{premium,cyberpunk,trendy}.wav, public/sfx/*.wav (48 kHz / 16-bit / stereo)
import fs from 'node:fs';
import path from 'node:path';

const SR = 48000;
const ROOT = process.cwd();
const TAU = Math.PI * 2;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const db2g = (d) => Math.pow(10, d / 20);
const g2db = (g) => 20 * Math.log10(Math.max(g, 1e-12));
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const S = (sec) => Math.round(sec * SR);

// ============================================================ PRNG
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rng = mulberry32(1);
const seed = (s) => { rng = mulberry32(s); };
const rnd = () => rng();
const noise = () => rng() * 2 - 1;

// ============================================================ buffers + WAV IO
const stereo = (n) => ({ L: new Float32Array(n), R: new Float32Array(n), n });

function writeWav(file, buf) {
  const n = buf.n, b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  const d = mulberry32(777); // TPDF dither (skipped on digital silence)
  for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) {
    const x = (c ? buf.R : buf.L)[i];
    const v = x === 0 ? 0 : Math.round(x * 32767 + (d() - d()));
    b.writeInt16LE(clamp(v, -32768, 32767), 44 + i * 4 + c * 2);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, b);
}

function readWav(file) {
  const b = fs.readFileSync(file); let p = 12, fmt = null, dat = null;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4), sz = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    if (id === 'data') dat = { off: p + 8, size: sz };
    p += 8 + sz + (sz & 1);
  }
  const frames = dat.size / (fmt.ch * fmt.bits / 8), ns = frames * fmt.ch;
  const x = new Float32Array(ns);
  for (let i = 0; i < ns; i++) x[i] = b.readInt16LE(dat.off + i * 2) / 32768;
  return { ...fmt, frames, dur: frames / fmt.sr, x };
}
// ============================================================ DSP primitives
// RBJ biquad (static EQ / filters on one-shots)
class Biquad {
  constructor(type, f, q = 0.707, gainDb = 0) { this.z1 = 0; this.z2 = 0; this.set(type, f, q, gainDb); }
  set(type, f, q = 0.707, gainDb = 0) {
    const w = TAU * clamp(f, 10, SR * 0.45) / SR, cw = Math.cos(w), sw = Math.sin(w), al = sw / (2 * q);
    const A = Math.pow(10, gainDb / 40);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
    else if (type === 'hp') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
    else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
    else if (type === 'peak') { b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; }
    else if (type === 'lowshelf') {
      const s = 2 * Math.sqrt(A) * al;
      b0 = A * ((A + 1) - (A - 1) * cw + s); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - s);
      a0 = (A + 1) + (A - 1) * cw + s; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - s;
    } else if (type === 'highshelf') {
      const s = 2 * Math.sqrt(A) * al;
      b0 = A * ((A + 1) + (A - 1) * cw + s); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - s);
      a0 = (A + 1) - (A - 1) * cw + s; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - s;
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  p(x) { // transposed direct form II
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2; this.z2 = this.b2 * x - this.a2 * y; return y;
  }
}
// Topology-preserving state variable filter (stable under fast cutoff modulation, resonant)
class SVF {
  constructor() { this.ic1 = 0; this.ic2 = 0; this.set(1000, 0.707); }
  set(f, q) {
    const g = Math.tan(Math.PI * clamp(f, 15, SR * 0.42) / SR); this.k = 1 / q;
    this.a1 = 1 / (1 + g * (g + this.k)); this.a2 = g * this.a1; this.a3 = g * this.a2;
  }
  p(v0) {
    const v3 = v0 - this.ic2, v1 = this.a1 * this.ic1 + this.a2 * v3, v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2;
    this.lp = v2; this.bp = v1; this.hp = v0 - this.k * v1 - v2; return v2;
  }
}
function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
// band-limited oscillator sample for phase ph in [0,1), increment dt
function osc(wave, ph, dt, pw = 0.5) {
  switch (wave) {
    case 'sine': return Math.sin(TAU * ph);
    case 'saw': return 2 * ph - 1 - blep(ph, dt);
    case 'square': case 'pulse': {
      let y = ph < pw ? 1 : -1; y += blep(ph, dt); y -= blep((ph + 1 - pw) % 1, dt); return y;
    }
    case 'tri': return 1 - 4 * Math.abs(ph - 0.5) ; // 1/n^2 spectrum, aliasing negligible at used pitches
    default: return 0;
  }
}
const panL = (p) => Math.cos((clamp(p, -1, 1) + 1) * Math.PI / 4);
const panR = (p) => Math.sin((clamp(p, -1, 1) + 1) * Math.PI / 4);
// ADSR level (exponential decay, smooth release that lands exactly on 0)
function adsrAt(t, gate, a, d, s) {
  if (t < a) { const x = t / a; return x * x * (3 - 2 * x); }
  return s + (1 - s) * Math.exp(-(t - a) / d);
}
function envelope(t, gate, a, d, s, r) {
  if (t < gate) return adsrAt(t, gate, a, d, s);
  const x = (t - gate) / r; if (x >= 1) return 0;
  return adsrAt(gate, gate, a, d, s) * Math.exp(-4 * x) * (1 - x);
}
const edge = (i, N, ms = 4) => { const k = S(ms / 1000); return i > N - k ? (N - i) / k : 1; };
function addS(buf, i, l, r) { if (i >= 0 && i < buf.n) { buf.L[i] += l; buf.R[i] += r; } }
// ============================================================ effects
// Freeverb (Jezar) stereo reverb with pre-delay and input band-limiting
function freeverb(inp, o = {}) {
  const { room = 0.85, damp = 0.35, width = 1, predelay = 0.02, lowcut = 180, highcut = 8500 } = o;
  const n = inp.n, out = stereo(n), k = SR / 44100;
  const combT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], apT = [556, 441, 341, 225];
  const fb = 0.28 + 0.7 * room, dmp = damp * 0.4;
  const mk = (len) => ({ b: new Float32Array(Math.round(len)), i: 0, f: 0 });
  const chans = [0, 23].map((sp) => ({
    combs: combT.map((t) => mk((t + sp) * k)), aps: apT.map((t) => mk((t + sp) * k)),
  }));
  const hp = new Biquad('hp', lowcut, 0.6), lp = new Biquad('lp', highcut, 0.6);
  const pd = Math.max(1, S(predelay)), pbuf = new Float32Array(pd); let pi = 0;
  const outs = [0, 0];
  for (let i = 0; i < n; i++) {
    let x = lp.p(hp.p((inp.L[i] + inp.R[i]) * 0.5));
    const d = pbuf[pi]; pbuf[pi] = x; pi = (pi + 1) % pd; x = d * 0.015;
    for (let c = 0; c < 2; c++) {
      const ch = chans[c]; let s = 0;
      for (const cb of ch.combs) {
        const y = cb.b[cb.i]; cb.f = y * (1 - dmp) + cb.f * dmp;
        cb.b[cb.i] = x + cb.f * fb; if (++cb.i >= cb.b.length) cb.i = 0; s += y;
      }
      for (const ap of ch.aps) {
        const bo = ap.b[ap.i]; const y = -s + bo; ap.b[ap.i] = s + bo * 0.5; if (++ap.i >= ap.b.length) ap.i = 0; s = y;
      }
      outs[c] = s;
    }
    const w1 = width / 2 + 0.5, w2 = (1 - width) / 2;
    out.L[i] = (outs[0] * w1 + outs[1] * w2) * 3; out.R[i] = (outs[1] * w1 + outs[0] * w2) * 3;
  }
  return out;
}
// Tempo-synced ping-pong delay with damped feedback
function pingpong(inp, o = {}) {
  const { time = 0.25, fb = 0.45, lowcut = 300, highcut = 5000 } = o;
  const n = inp.n, out = stereo(n), D = Math.max(1, Math.round(time * SR));
  const bl = new Float32Array(D), br = new Float32Array(D); let p = 0;
  const lpL = new Biquad('lp', highcut, 0.6), lpR = new Biquad('lp', highcut, 0.6), hp = new Biquad('hp', lowcut, 0.6);
  for (let i = 0; i < n; i++) {
    const x = hp.p((inp.L[i] + inp.R[i]) * 0.5);
    const yl = bl[p], yr = br[p];
    bl[p] = x + lpR.p(yr) * fb; br[p] = lpL.p(yl);
    if (++p >= D) p = 0;
    out.L[i] = yl; out.R[i] = yr;
  }
  return out;
}
// Stereo-linked feed-forward compressor with soft knee
function compress(buf, o = {}) {
  const { thr = -14, ratio = 2.5, att = 0.01, rel = 0.15, knee = 6, makeup = 0 } = o;
  const aA = Math.exp(-1 / (att * SR)), aR = Math.exp(-1 / (rel * SR)); let env = -120;
  for (let i = 0; i < buf.n; i++) {
    const lv = g2db(Math.max(Math.abs(buf.L[i]), Math.abs(buf.R[i])));
    env = lv > env ? aA * env + (1 - aA) * lv : aR * env + (1 - aR) * lv;
    const over = env - thr; let gr = 0;
    if (over > knee / 2) gr = over * (1 - 1 / ratio);
    else if (over > -knee / 2) gr = ((over + knee / 2) ** 2 / (2 * knee)) * (1 - 1 / ratio);
    const g = db2g(makeup - gr); buf.L[i] *= g; buf.R[i] *= g;
  }
}
const softclip = (x, th = 0.8) => {
  const a = Math.abs(x); if (a <= th) return x;
  return Math.sign(x) * (th + (1 - th) * Math.tanh((a - th) / (1 - th)));
};
function peakOf(buf) { let p = 0; for (let i = 0; i < buf.n; i++) p = Math.max(p, Math.abs(buf.L[i]), Math.abs(buf.R[i])); return p; }
function rmsOf(buf) { let s = 0; for (let i = 0; i < buf.n; i++) s += buf.L[i] ** 2 + buf.R[i] ** 2; return Math.sqrt(s / (2 * buf.n)); }
function gainBuf(buf, g) { for (let i = 0; i < buf.n; i++) { buf.L[i] *= g; buf.R[i] *= g; } }
function cloneBuf(b) { return { L: Float32Array.from(b.L), R: Float32Array.from(b.R), n: b.n }; }
// Look-ahead brickwall limiter (offline, click-free: windowed-min + boxcar smoothing + release)
function limit(buf, ceilDb = -1.2, laMs = 3, relMs = 90) {
  const n = buf.n, W = Math.max(2, S(laMs / 1000)), c = db2g(ceilDb);
  const req = new Float32Array(n);
  for (let i = 0; i < n; i++) { const a = Math.max(Math.abs(buf.L[i]), Math.abs(buf.R[i])); req[i] = a > c ? c / a : 1; }
  const m = new Float32Array(n), dq = new Int32Array(n); let h = 0, t = 0; // sliding min over [j-W+1, j]
  for (let j = 0; j < n; j++) {
    while (t > h && req[dq[t - 1]] >= req[j]) t--; dq[t++] = j;
    if (dq[h] <= j - W) h++; m[j] = req[dq[h]];
  }
  const g = new Float32Array(n); let acc = 0; // g(k) = mean of m over [k, k+W)
  for (let j = 0; j < Math.min(W, n); j++) acc += m[j];
  for (let k = 0; k < n; k++) { g[k] = acc / W; acc -= m[k]; acc += k + W < n ? m[k + W] : 1; }
  const rc = 1 - Math.exp(-1 / (relMs / 1000 * SR)); let gs = 1;
  for (let k = 0; k < n; k++) { gs = Math.min(g[k], gs + (1 - gs) * rc); buf.L[k] *= gs; buf.R[k] *= gs; }
}
// ============================================================ instruments
// Generic subtractive voice: unison band-limited oscillators -> resonant SVF -> ADSR -> pan.
function synth(buf, t0, dur, midi, o = {}) {
  const {
    wave = 'saw', voices = 1, detune = 0, spread = 0, a = 0.005, d = 0.2, s = 0.7, r = 0.15,
    cutoff = 3000, q = 0.707, fenv = 0, fdec = 0.15, fa = 0, gain = 0.2, pan = 0, pw = 0.5,
    glide = 0, glideT = 0.05, vib = 0, vibRate = 5, vibDelay = 0.2, sub = 0, noiseAmt = 0,
    drive = 0, cutFn = null, wave2 = null, mix2 = 0, oct2 = 0, randPhase = true, ampFn = null,
  } = o;
  const f0 = mtof(midi), start = S(t0), N = S(dur + r);
  const V = Math.max(1, voices), vs = [];
  for (let v = 0; v < V; v++) {
    const x = V > 1 ? (v / (V - 1)) * 2 - 1 : 0;
    // supersaw-style detune: outer voices spread more
    const cents = detune * x * (0.6 + 0.4 * Math.abs(x));
    vs.push({ m: Math.pow(2, cents / 1200), ph: randPhase ? rnd() : 0, ph2: randPhase ? rnd() : 0,
      gl: panL(x * spread + pan), gr: panR(x * spread + pan) });
  }
  const norm = 1 / Math.sqrt(V), fl = new SVF(), fr = new SVF();
  let subPh = 0, cut = cutoff;
  const dmul = drive > 0 ? 1 / Math.tanh(1 + drive) : 1;
  for (let i = 0; i < N; i++) {
    const t = i / SR, idx = start + i; if (idx >= buf.n) break; if (idx < 0) continue;
    let pm = 1;
    if (glide) pm *= Math.pow(2, (glide * Math.exp(-t / glideT)) / 12);
    if (vib) pm *= Math.pow(2, (vib / 1200) * Math.sin(TAU * vibRate * t) * clamp((t - vibDelay) / 0.3, 0, 1));
    const f = f0 * pm;
    if ((i & 7) === 0) {
      const fe = fa > 0 && t < fa ? t / fa : Math.exp(-(t - fa) / fdec);
      cut = (cutoff + fenv * fe) * (cutFn ? cutFn(idx / SR) : 1);
      fl.set(cut, q); fr.set(cut, q);
    }
    let L = 0, R = 0;
    for (let v = 0; v < V; v++) {
      const vo = vs[v], dt = (f * vo.m) / SR;
      let y = osc(wave, vo.ph, dt, pw); vo.ph += dt; if (vo.ph >= 1) vo.ph -= 1;
      if (wave2) { const dt2 = dt * Math.pow(2, oct2); y += mix2 * osc(wave2, vo.ph2, dt2, pw); vo.ph2 += dt2; if (vo.ph2 >= 1) vo.ph2 -= 1; }
      L += y * vo.gl; R += y * vo.gr;
    }
    L *= norm; R *= norm;
    if (sub) { const sy = Math.sin(TAU * subPh) * sub; subPh += f / 2 / SR; L += sy * 0.707; R += sy * 0.707; }
    if (noiseAmt) { L += noise() * noiseAmt; R += noise() * noiseAmt; }
    L = fl.p(L); R = fr.p(R);
    if (drive > 0) { L = Math.tanh(L * (1 + drive)) * dmul; R = Math.tanh(R * (1 + drive)) * dmul; }
    let e = envelope(t, dur, a, d, s, r) * edge(i, N);
    if (ampFn) e *= ampFn(t);
    buf.L[idx] += L * e * gain; buf.R[idx] += R * e * gain;
  }
}
const chord = (buf, t, dur, notes, o) => notes.forEach((m) => synth(buf, t, dur, m, o));

// Felt-piano: additive inharmonic partials, double strings (beating), soft hammer thump.
function piano(buf, t0, midi, vel = 0.7, dur = 1.5, o = {}) {
  const { gain = 0.25, bright = 0.5, rel = 0.35 } = o;
  const f0 = mtof(midi), B = 0.00035, start = S(t0), N = S(dur + rel + 0.05);
  const pan = clamp((midi - 62) / 30, -0.6, 0.6), gl = panL(pan), gr = panR(pan);
  const parts = [];
  for (let k = 1; k <= 10; k++) {
    const fk = f0 * k * Math.sqrt(1 + B * k * k); if (fk > 12000) break;
    const amp = Math.pow(k, -(1.6 - bright * 0.7)) * (k === 1 ? 1 : 0.8);
    const tau = (2.8 * Math.pow(261 / f0, 0.45)) / (1 + 0.55 * (k - 1));
    parts.push({ w: TAU * fk / SR, w2: TAU * fk * 1.0009 / SR, amp, tau, p1: rnd() * TAU, p2: rnd() * TAU });
  }
  const ham = new Biquad('bp', clamp(f0 * 4, 600, 3500), 0.9), hamLp = new Biquad('lp', 2500, 0.7);
  for (let i = 0; i < N; i++) {
    const idx = start + i; if (idx >= buf.n) break;
    const t = i / SR; let y = 0;
    for (const p of parts) y += p.amp * Math.exp(-t / p.tau) * (Math.sin(p.w * i + p.p1) + 0.6 * Math.sin(p.w2 * i + p.p2));
    y *= 0.6;
    const att = Math.min(1, t / 0.004);
    const hm = t < 0.03 ? hamLp.p(ham.p(noise())) * Math.exp(-t / 0.006) * 0.35 : 0;
    const relE = t > dur ? Math.max(0, 1 - (t - dur) / rel) ** 2 : 1;
    const v = (y * att + hm) * relE * vel * gain * edge(i, N);
    buf.L[idx] += v * gl; buf.R[idx] += v * gr;
  }
}
// Additive bell (minor-third tuned church-bell partial ratios)
function bell(buf, t0, midi, o = {}) {
  const { gain = 0.15, dur = 4, pan = 0, bright = 1 } = o;
  const f0 = mtof(midi), start = S(t0), N = S(dur);
  const R = [[0.5, 0.35, 1], [1, 1, 0.8], [1.19, 0.5, 0.55], [1.5, 0.35, 0.45], [2, 0.6, 0.4], [2.51, 0.3, 0.25], [3.01, 0.25 * bright, 0.18], [4.07, 0.15 * bright, 0.12], [5.32, 0.08 * bright, 0.08]];
  const ps = R.filter(([r]) => f0 * r < 15000).map(([r, a, td]) => ({ w: TAU * f0 * r / SR, a, tau: dur * td * 0.5, ph: rnd() * TAU, pn: (rnd() * 2 - 1) * 0.5 }));
  for (let i = 0; i < N; i++) {
    const idx = start + i; if (idx >= buf.n) break;
    const t = i / SR; let l = 0, r = 0;
    for (const p of ps) { const y = p.a * Math.exp(-t / p.tau) * Math.sin(p.w * i + p.ph); l += y * panL(p.pn + pan); r += y * panR(p.pn + pan); }
    const e = Math.min(1, t / 0.002) * edge(i, N, 30) * gain * 0.5;
    buf.L[idx] += l * e; buf.R[idx] += r * e;
  }
}
// ---------------------------------------------------------------- drums
function kick(buf, t0, o = {}) {
  const { gain = 0.8, f1 = 48, f2 = 160, pdec = 0.045, dec = 0.32, click = 0.25, drive = 0.6, pan = 0 } = o;
  const start = S(t0), N = S(dec * 3.2); let ph = 0;
  const ck = new Biquad('bp', 3500, 0.8);
  for (let i = 0; i < N; i++) {
    const idx = start + i; if (idx >= buf.n) break;
    const t = i / SR, f = f1 + (f2 - f1) * Math.exp(-t / pdec);
    ph += f / SR;
    let y = Math.sin(TAU * ph) * Math.exp(-t / dec) * Math.min(1, t / 0.0008);
    if (t < 0.015) y += ck.p(noise()) * click * Math.exp(-t / 0.003);
    y = Math.tanh(y * (1 + drive)) / Math.tanh(1 + drive);
    y *= edge(i, N, 10) * gain;
    buf.L[idx] += y * panL(pan) * 1.414 * 0.707; buf.R[idx] += y * panR(pan) * 1.414 * 0.707;
  }
}
function noiseHit(buf, t0, o = {}) {
  const { gain = 0.3, dec = 0.1, type = 'bp', f = 2000, q = 1, len = dec * 5, pan = 0, att = 0.0005, w = 0.3, fEnd = null } = o;
  const start = S(t0), N = S(len), fl = new SVF(), fr = new SVF(); fl.set(f, q); fr.set(f, q);
  for (let i = 0; i < N; i++) {
    const idx = start + i; if (idx >= buf.n) break;
    const t = i / SR;
    if (fEnd && (i & 15) === 0) { const ff = f * Math.pow(fEnd / f, t / len); fl.set(ff, q); fr.set(ff, q); }
    const nm = noise(), ns = noise();
    let l = nm + ns * w, r = nm - ns * w;
    fl.p(l); fr.p(r);
    l = type === 'hp' ? fl.hp : type === 'lp' ? fl.lp : fl.bp; r = type === 'hp' ? fr.hp : type === 'lp' ? fr.lp : fr.bp;
    const e = Math.min(1, t / att) * Math.exp(-t / dec) * edge(i, N, 5) * gain;
    buf.L[idx] += l * e * panL(pan) * 1.414; buf.R[idx] += r * e * panR(pan) * 1.414;
  }
}
function snare(buf, t0, o = {}) {
  const { gain = 0.45, tone = 190, dec = 0.16, pan = 0 } = o;
  synthTone(buf, t0, tone, 0.12, gain * 0.55, { pitchDrop: 1.5, pdec: 0.02, pan });
  synthTone(buf, t0, tone * 1.7, 0.06, gain * 0.25, { pan });
  noiseHit(buf, t0, { gain: gain * 0.9, dec, type: 'hp', f: 1400, q: 0.6, pan });
  noiseHit(buf, t0, { gain: gain * 0.35, dec: dec * 0.6, type: 'bp', f: 5000, q: 0.8, pan });
}
function clap(buf, t0, o = {}) {
  const { gain = 0.45, dec = 0.14, f = 1300 } = o;
  [0, 0.009, 0.019, 0.028].forEach((dt, k) =>
    noiseHit(buf, t0 + dt, { gain: gain * (k === 3 ? 1 : 0.65), dec: k === 3 ? dec : 0.007, len: k === 3 ? dec * 5 : 0.012, type: 'bp', f, q: 1.1, pan: (k - 1.5) * 0.12, w: 0.5 }));
}
const hat = (buf, t0, o = {}) => noiseHit(buf, t0, { gain: 0.12, dec: 0.025, type: 'hp', f: 8000, q: 0.7, w: 0.6, ...o });
const openHat = (buf, t0, o = {}) => noiseHit(buf, t0, { gain: 0.1, dec: 0.16, len: 0.5, type: 'hp', f: 7000, q: 0.7, w: 0.6, ...o });
const shaker = (buf, t0, o = {}) => noiseHit(buf, t0, { gain: 0.06, dec: 0.03, att: 0.008, type: 'bp', f: 7500, q: 1.2, w: 0.7, ...o });
function synthTone(buf, t0, f, dec, gain, o = {}) {
  const { pitchDrop = 0, pdec = 0.03, pan = 0, wave = 'sine', att = 0.0008, len = dec * 5 } = o;
  const start = S(t0), N = S(len); let ph = 0;
  for (let i = 0; i < N; i++) {
    const idx = start + i; if (idx >= buf.n) break;
    const t = i / SR, ff = f * (1 + pitchDrop * Math.exp(-t / pdec)), dt = ff / SR; ph = (ph + dt) % 1;
    const y = osc(wave, ph, dt) * Math.min(1, t / att) * Math.exp(-t / dec) * edge(i, N, 5) * gain;
    buf.L[idx] += y * panL(pan); buf.R[idx] += y * panR(pan);
  }
}
const rim = (buf, t0, o = {}) => {
  const { gain = 0.08, pan = 0.25 } = o;
  synthTone(buf, t0, 1750, 0.012, gain, { pan }); synthTone(buf, t0, 820, 0.018, gain * 0.6, { pan });
  noiseHit(buf, t0, { gain: gain * 0.4, dec: 0.006, type: 'bp', f: 4000, q: 2, pan });
};
const tom = (buf, t0, f, o = {}) => synthTone(buf, t0, f, 0.2, o.gain ?? 0.35, { pitchDrop: 0.7, pdec: 0.04, pan: o.pan ?? 0 });

// ---------------------------------------------------------------- FX one-shots
// Noise + tone riser. Peaks at t0+len (curve shape ^pow), filter sweeps f1->f2.
function riser(buf, t0, len, o = {}) {
  const { gain = 0.2, f1 = 300, f2 = 9000, q = 1.5, pow = 2.2, tone = null, toneGain = 0.3, cutTail = 0.01, w = 0.5, rev = false } = o;
  const start = S(t0), N = S(len), fl = new SVF(), fr = new SVF(); let ph = 0, ph2 = 0;
  for (let i = 0; i < N; i++) {
    const idx = start + i; if (idx >= buf.n) break;
    const x = i / N;
    if ((i & 15) === 0) { const f = f1 * Math.pow(f2 / f1, Math.pow(x, 1.3)); fl.set(f, q); fr.set(f, q); }
    const nm = noise(), ns = noise(); let l = nm + ns * w, r = nm - ns * w;
    fl.p(l); fr.p(r); l = fl.bp; r = fr.bp;
    if (tone) {
      const f = tone[0] * Math.pow(tone[1] / tone[0], x * x);
      ph = (ph + f / SR) % 1; ph2 = (ph2 + f * 1.006 / SR) % 1;
      const ty = osc('saw', ph, f / SR), ty2 = osc('saw', ph2, f * 1.006 / SR);
      l += ty * toneGain; r += ty2 * toneGain;
    }
    let e = Math.pow(x, pow);
    if (rev) e = Math.pow(x, pow) * (1 - Math.exp(-(1 - x) * len / 0.004)); // reverse-style: snaps off at peak
    e *= Math.min(1, i / S(0.02)) * gain;
    const tail = N - i < S(cutTail) ? (N - i) / S(cutTail) : 1;
    buf.L[idx] += l * e * tail; buf.R[idx] += r * e * tail;
  }
}
// Airy whoosh: bandpassed noise with bell-shaped envelope and pan sweep
function whoosh(buf, t0, len, o = {}) {
  const { gain = 0.25, f1 = 400, f2 = 4000, q = 1.2, peak = 0.55, panFrom = -0.7, panTo = 0.7 } = o;
  const start = S(t0), N = S(len), fl = new SVF(), fr = new SVF();
  for (let i = 0; i < N; i++) {
    const idx = start + i; if (idx >= buf.n) break;
    const x = i / N;
    const fx = x < peak ? x / peak : 1 - (x - peak) / (1 - peak);
    if ((i & 15) === 0) { const f = f1 * Math.pow(f2 / f1, fx); fl.set(f, q); fr.set(f, q); }
    const nm = noise(), ns = noise(); fl.p(nm + ns * 0.4); fr.p(nm - ns * 0.4);
    const e = Math.pow(Math.sin(Math.PI * Math.pow(x, Math.log(0.5) / Math.log(peak))), 2) * gain;
    const p = panFrom + (panTo - panFrom) * x;
    buf.L[idx] += fl.bp * e * panL(p) * 1.414; buf.R[idx] += fr.bp * e * panR(p) * 1.414;
  }
}
// Cinematic impact: pitch-dropping sub boom + noise burst + optional shimmer
function impact(buf, t0, o = {}) {
  const { gain = 0.8, sub = 1, f1 = 90, f2 = 32, dec = 1.2, noiseG = 0.35, ndec = 0.25, nf = 1800 } = o;
  const start = S(t0), N = S(dec * 3.5); let ph = 0;
  for (let i = 0; i < N; i++) {
    const idx = start + i; if (idx >= buf.n) break;
    const t = i / SR, f = f2 + (f1 - f2) * Math.exp(-t / 0.12); ph += f / SR;
    let y = Math.sin(TAU * ph) * Math.exp(-t / dec) * Math.min(1, t / 0.002) * sub;
    y = Math.tanh(y * 1.4) / Math.tanh(1.4);
    y *= edge(i, N, 40) * gain;
    buf.L[idx] += y * 0.707; buf.R[idx] += y * 0.707;
  }
  noiseHit(buf, t0, { gain: gain * noiseG, dec: ndec, len: ndec * 5, type: 'lp', f: nf, q: 0.7, w: 0.8, att: 0.002 });
  kick(buf, t0, { gain: gain * 0.6, f1: 45, f2: 140, dec: 0.25, click: 0.4 });
}
// Digital glitch: sample-and-hold square/noise bursts with bitcrush + stutter gating
function glitch(buf, t0, len, o = {}) {
  const { gain = 0.15, seedv = 99, base = 600, bits = 5, rate = 8, pan = 0 } = o;
  const r = mulberry32(seedv), start = S(t0), N = S(len);
  let hold = 0, holdN = 0, ph = 0, f = base, gate = 1, segLeft = 0, mode = 0, hp = 0, gs = 0;
  const q = Math.pow(2, bits - 1);
  for (let i = 0; i < N; i++) {
    const idx = start + i; if (idx >= buf.n) break;
    if (segLeft-- <= 0) {
      segLeft = S(0.012 + r() * 0.04); mode = Math.floor(r() * 3);
      f = base * Math.pow(2, Math.floor(r() * 24) / 12 - 0.5); gate = r() < 0.72 ? 1 : 0;
    }
    ph = (ph + f / SR) % 1;
    let y = mode === 0 ? (ph < 0.5 ? 1 : -1) : mode === 1 ? Math.sin(TAU * ph) * 1.3 : (r() * 2 - 1);
    if (holdN-- <= 0) { hold = y; holdN = rate; } y = hold; // sample-rate reduction
    y = Math.round(y * q) / q;
    hp += 0.02 * (y - hp); y -= hp; // DC/LF removal
    gs += ((segLeft > 24 ? gate : 0) - gs) * 0.06; // ~0.4 ms smoothing: crisp but click-free gating
    const e = gs * edge(i, N, 3) * gain;
    buf.L[idx] += y * e * panL(pan); buf.R[idx] += y * e * panR(pan);
  }
}
// "Hey" vocal-chop-like blip: glottal-ish pulse through two formant bandpasses with pitch fall
function hey(buf, t0, o = {}) {
  const { gain = 0.5, midi = 74, len = 0.28 } = o;
  const start = S(t0), N = S(len); let ph = 0;
  const f1 = new SVF(), f2 = new SVF(), f3 = new SVF();
  for (let i = 0; i < N; i++) {
    const idx = start + i; if (idx >= buf.n) break;
    const t = i / SR, x = t / len;
    const f = mtof(midi) * (1 + 0.06 * Math.exp(-t / 0.03)) * Math.pow(2, -x * 0.25);
    ph = (ph + f / SR) % 1;
    const src = osc('saw', ph, f / SR) + noise() * 0.04;
    if ((i & 15) === 0) { // "h" -> "eh" -> "ey" formant glide
      f1.set(500 + 120 * x, 6); f2.set(1750 + 500 * x, 8); f3.set(2600, 9);
    }
    f1.p(src); f2.p(src); f3.p(src);
    let y = f1.bp * f1.k * 1.0 + f2.bp * f2.k * 0.7 + f3.bp * f3.k * 0.3; // unity-peak normalised formants
    const asp = t < 0.035 ? noise() * 0.25 * (1 - t / 0.035) : 0; // breathy "h"
    y += asp;
    const e = Math.min(1, t / 0.008) * Math.pow(1 - x, 1.5) * gain;
    buf.L[idx] += y * e; buf.R[idx] += y * e;
  }
}

// ============================================================ mix engine
function duckCurve(n, kicks, depth, rel = 0.18, att = 0.004) {
  const g = new Float32Array(n).fill(1);
  for (const tk of kicks) {
    const a = S(tk - att), b = S(tk + rel);
    for (let i = Math.max(0, a); i < Math.min(n, b); i++) {
      const t = i / SR - tk;
      const sh = t < 0 ? (1 + t / att) : Math.pow(1 - t / rel, 2);
      g[i] = Math.min(g[i], 1 - depth * clamp(sh, 0, 1));
    }
  }
  return g;
}
function applyRegionGain(buf, t0, t1, g = 0, ramp = 0.004) {
  for (let i = Math.max(0, S(t0 - ramp)); i < Math.min(buf.n, S(t1 + ramp)); i++) {
    const t = i / SR;
    const k = t < t0 ? (t0 - t) / ramp : t > t1 ? (t - t1) / ramp : 0;
    const m = g + (1 - g) * clamp(k, 0, 1); buf.L[i] *= m; buf.R[i] *= m;
  }
}
function fadeOut(buf, t0, t1) {
  for (let i = S(t0); i < buf.n; i++) {
    const x = clamp((i / SR - t0) / (t1 - t0), 0, 1), g = 0.5 + 0.5 * Math.cos(Math.PI * x);
    buf.L[i] *= g; buf.R[i] *= g;
  }
}
function render(cfg) {
  const { len, buses, kicks = [], duckDepth = 0.5, duckRel = 0.18, rev = {}, dly = {}, revGain = 1,
    revDuck = 0.3, mutes = [], post = [], fade = null, targetRms = -14.5, comp = {}, eq = [] } = cfg;
  const n = S(len), sum = stereo(n), rin = stereo(n), din = stereo(n);
  const dk = duckCurve(n, kicks, duckDepth, duckRel);
  for (const b of buses) {
    const g = b.gain ?? 1, rs = b.rev ?? 0, ds = b.dly ?? 0, dd = b.duck ?? 0;
    if (b.haas) { // Haas widening: cross-feed a high-passed, 11/17 ms delayed copy (mono-safe, low end untouched)
      const dL = S(0.011), dR = S(0.017), hl = new Biquad('hp', 600, 0.7), hr = new Biquad('hp', 600, 0.7);
      const L0 = Float32Array.from(b.buf.L), R0 = Float32Array.from(b.buf.R);
      for (let i = 0; i < n; i++) {
        const xl = hl.p(i >= dL ? L0[i - dL] : 0), xr = hr.p(i >= dR ? R0[i - dR] : 0);
        b.buf.L[i] = L0[i] - xr * b.haas; b.buf.R[i] = R0[i] + xl * b.haas;
      }
    }
    for (let i = 0; i < n; i++) {
      const d = dd ? 1 - dd * (1 - dk[i]) : 1;
      const l = b.buf.L[i] * g * d, r = b.buf.R[i] * g * d;
      sum.L[i] += l; sum.R[i] += r; rin.L[i] += l * rs; rin.R[i] += r * rs; din.L[i] += l * ds; din.R[i] += r * ds;
    }
  }
  if (buses.some((b) => b.dly)) {
    const dout = pingpong(din, dly);
    for (let i = 0; i < n; i++) { sum.L[i] += dout.L[i]; sum.R[i] += dout.R[i]; rin.L[i] += dout.L[i] * 0.35; rin.R[i] += dout.R[i] * 0.35; }
  }
  const rout = freeverb(rin, rev);
  for (let i = 0; i < n; i++) {
    const d = 1 - revDuck * (1 - dk[i]);
    sum.L[i] += rout.L[i] * revGain * d; sum.R[i] += rout.R[i] * revGain * d;
  }
  // master EQ (always a gentle subsonic high-pass)
  const chain = [['hp', 28, 0.6, 0], ...eq];
  for (const [ty, f, q, gdb] of chain) {
    const fl = new Biquad(ty, f, q, gdb), fr = new Biquad(ty, f, q, gdb);
    for (let i = 0; i < n; i++) { sum.L[i] = fl.p(sum.L[i]); sum.R[i] = fr.p(sum.R[i]); }
  }
  // glue compression on a level-normalised bus, then soft clip
  const busNorm = 0.5 / (peakOf(sum) || 1);
  gainBuf(sum, busNorm);
  for (const p of post) p.gain *= busNorm;
  compress(sum, { thr: -15, ratio: 2, att: 0.015, rel: 0.2, knee: 8, ...comp });
  for (const [a, b, g] of mutes) applyRegionGain(sum, a, b, g ?? 0);
  for (const p of post) for (let i = 0; i < n; i++) { sum.L[i] += p.buf.L[i] * p.gain; sum.R[i] += p.buf.R[i] * p.gain; }
  // loudness: drive into soft clip + look-ahead limiter until RMS is in range
  const ceil = db2g(-1);
  let out = null, drive = db2g(targetRms) / (rmsOf(sum) || 1);
  for (let it = 0; it < 4; it++) {
    out = cloneBuf(sum); gainBuf(out, drive);
    for (let i = 0; i < n; i++) { out.L[i] = softclip(out.L[i], 0.75); out.R[i] = softclip(out.R[i], 0.75); }
    limit(out, -1.05, 3, 80);
    const r = g2db(rmsOf(out)); if (r >= targetRms - 0.6) break;
    drive *= db2g(targetRms - r);
  }
  if (fade) fadeOut(out, fade[0], fade[1]);
  const st = S(0.0007); for (let i = 0; i < st; i++) { out.L[i] *= i / st; out.R[i] *= i / st; } // start from zero
  const end = S(0.003); // guarantee the file ends on silence (no end click)
  for (let i = n - end; i < n; i++) { const g = (n - i) / end; out.L[i] *= g; out.R[i] *= g; }
  gainBuf(out, ceil / peakOf(out)); // final peak normalisation to -1 dBFS
  return out;
}
// Sparkle/shimmer: cloud of tiny high sine pings rising in density, panned randomly
function sparkle(buf, t0, len, o = {}) {
  const { gain = 0.06, count = 40, scale = [86, 88, 90, 93, 95, 98, 100, 102], seedv = 5, grow = 1 } = o;
  const r = mulberry32(seedv);
  for (let k = 0; k < count; k++) {
    const x = grow ? Math.pow(r(), 0.8) : r();
    const t = t0 + x * len * 0.85, m = scale[Math.floor(r() * scale.length)];
    const pn = r() * 1.6 - 0.8, d = 0.15 + r() * 0.35;
    synthTone(buf, t, mtof(m), d, gain * (0.5 + 0.5 * r()), { pan: pn, att: 0.002, len: d * 4 });
  }
}

// ============================================================ helpers for arrangement
const grid = (bpmBeat) => (bar, beat = 0) => ((bar - 1) * 4 + beat) * bpmBeat;
const nb = () => null;

// ============================================================ TRACK 1: PREMIUM (100 BPM, D major)
function premium() {
  seed(101);
  const B = 0.6, T = grid(B), LEN = 28.8, n = S(LEN);
  const pad = stereo(n), keys = stereo(n), drums = stereo(n), pl = stereo(n), bass = stereo(n), fx = stereo(n), hit = stereo(n), sub = stereo(n);
  // harmony per bar (pad voicings, MIDI)
  const H = [
    [50, 57, 61, 64, 69],   // 1 Dmaj9   (D A C# E A)
    [47, 54, 57, 61, 62],   // 2 Bm9     (B F# A C# D)
    [43, 50, 54, 57, 61],   // 3 Gmaj9   (G D F# A C#) -> Bmaj7-ish colour over G
    [45, 52, 55, 59, 64],   // 4 A6sus   (A E G B E)
    [50, 57, 61, 64, 69],   // 5 Dmaj9
    [47, 54, 57, 61, 66],   // 6 Bm11
    [43, 50, 54, 59, 61],   // 7 Gmaj7(6)
    [45, 52, 57, 59, 64],   // 8 Asus2
    [40, 50, 54, 59, 62],   // 9 Em9     (E D F# B D)
    [45, 52, 55, 61, 64],   // 10 A13sus -> dominant pull
    [38, 50, 57, 61, 64, 69], // 11 Dmaj9 (resolve, low D)
    [38, 50, 57, 61, 64, 69],
  ];
  const roots = [38, 35, 43, 45, 38, 35, 43, 45, 40, 45, 38, 38];
  const padCut = (t) => 0.75 + 0.25 * Math.sin(TAU * t / 9.6) + (t > 19.2 && t < 24 ? (t - 19.2) / 4.8 * 0.8 : 0);
  // pad: detuned saw unison, dark LP, slow attack, long crossfading release
  for (let b = 1; b <= 10; b++) {
    chord(pad, T(b) - 0.05, B * 4, H[b - 1], { wave: 'saw', voices: 5, detune: 14, spread: 0.7, a: b === 1 ? 1.6 : 0.6, d: 2, s: 0.85, r: 1.1, cutoff: b >= 9 ? 1500 : 1100, q: 0.8, gain: b >= 9 ? 0.05 : 0.042, cutFn: padCut });
  }
  chord(pad, T(11), 3.6, H[10], { wave: 'saw', voices: 5, detune: 12, spread: 0.8, a: 0.04, d: 3, s: 0.6, r: 1.2, cutoff: 2600, fenv: 1600, fdec: 1.2, q: 0.7, gain: 0.05 });
  // fuller chords bars 9-10: octave-up triangle layer
  for (const b of [9, 10]) chord(pad, T(b), B * 4, H[b - 1].slice(2).map((m) => m + 12), { wave: 'tri', voices: 3, detune: 8, spread: 0.9, a: 0.5, d: 2, s: 0.8, r: 0.8, cutoff: 4000, gain: 0.03 });
  // sub swell bars 1-2 and under the ending
  synth(sub, 0, 4.4, 38, { wave: 'sine', a: 2.6, d: 3, s: 0.9, r: 1.0, cutoff: 400, gain: 0.16 });
  synth(sub, T(11), 3.2, 26, { wave: 'sine', a: 0.05, d: 2.5, s: 0.5, r: 1.2, cutoff: 300, gain: 0.3 });
  // felt piano motif (beat offsets within bar)
  const motif = [
    [1, [[0, 69, 0.9], [1.5, 73, 0.6], [2, 76, 0.75], [3, 74, 0.6]]],
    [2, [[0, 73, 0.7], [1.5, 71, 0.55], [2.5, 66, 0.6]]],
    [3, [[0, 74, 0.7], [1, 78, 0.55], [2, 76, 0.65], [3.5, 73, 0.5]]],
    [4, [[0, 71, 0.65], [2, 69, 0.6], [3, 76, 0.45]]],
    [5, [[0, 69, 0.8], [1.5, 73, 0.6], [2, 76, 0.75], [3, 78, 0.6]]],
    [6, [[0, 81, 0.7], [1.5, 78, 0.55], [2.5, 73, 0.6], [3.5, 74, 0.45]]],
    [7, [[0, 74, 0.7], [1, 78, 0.55], [2, 81, 0.65], [3, 79, 0.55]]],
    [8, [[0, 76, 0.65], [2, 73, 0.6], [3, 71, 0.5]]],
    [9, [[0, 66, 0.6], [0, 74, 0.6], [1.5, 78, 0.6], [2, 79, 0.7], [3, 83, 0.6]]],
    [10, [[0, 73, 0.65], [0, 76, 0.6], [1, 79, 0.55], [2, 81, 0.6], [3, 85, 0.55]]],
  ];
  for (const [b, notes] of motif) for (const [bt, m, v] of notes) piano(keys, T(b, bt), m, v, 1.6, { gain: 0.22, bright: 0.45 });
  // logo chord on piano + bell
  [50, 57, 62, 66, 69, 73, 76].forEach((m, k) => piano(keys, T(11) + k * 0.012, m, 0.55, 3.2, { gain: 0.2, bright: 0.5, rel: 1 }));
  piano(keys, T(11, 2.5), 81, 0.45, 2.0, { gain: 0.2 }); piano(keys, T(12, 0), 78, 0.4, 2.0, { gain: 0.18 });
  piano(keys, T(12, 1.5), 76, 0.35, 1.5, { gain: 0.16 }); piano(keys, T(12, 2.5), 74, 0.32, 1.2, { gain: 0.15 });
  // drums bars 3-10: muted kick 1 & 3, rim on offbeats; shaker 16ths from bar 5
  const kicks = [];
  for (let b = 3; b <= 10; b++) {
    for (const bt of [0, 2]) { kick(drums, T(b, bt), { gain: b >= 5 ? 0.5 : 0.42, f1: 46, f2: 110, pdec: 0.03, dec: 0.2, click: 0.05, drive: 0.2 }); kicks.push(T(b, bt)); }
    for (const bt of [0.5, 1.5, 2.5, 3.5]) rim(drums, T(b, bt), { gain: 0.045 + (bt === 1.5 || bt === 3.5 ? 0.012 : 0), pan: bt % 2 < 1 ? 0.3 : -0.25 });
    if (b >= 5) for (let s = 0; s < 16; s++) shaker(drums, T(b, s / 4), { gain: (s % 2 ? 0.02 : 0.03) * (b >= 9 ? 1.2 : 1), pan: 0.4 });
  }
  // pluck arpeggio eighths bars 3-10
  for (let b = 3; b <= 10; b++) {
    const ch = H[b - 1], pat = [ch[1] + 12, ch[2] + 12, ch[3] + 12, ch[4] + 12, ch[3] + 12, ch[2] + 12, ch[4] + 12, ch[2] + 12];
    pat.forEach((m, k) => synth(pl, T(b, k / 2), 0.08, m, { wave: 'saw', voices: 2, detune: 7, spread: 0.6, a: 0.002, d: 0.12, s: 0, r: 0.12, cutoff: 700, fenv: 2200, fdec: 0.07, q: 1.1, gain: 0.07 * (k % 2 ? 0.8 : 1) }));
  }
  // gentle bass bars 5-10 (sine + soft triangle)
  for (let b = 5; b <= 10; b++) {
    const r0 = roots[b - 1];
    [[0, 1.4], [1.5, 0.45], [2, 1.4], [3.5, 0.45]].forEach(([bt, d], k) =>
      synth(bass, T(b, bt), d * B, k === 3 ? r0 + 7 : r0, { wave: 'tri', wave2: 'sine', mix2: 1.2, oct2: -1, a: 0.008, d: 0.5, s: 0.6, r: 0.12, cutoff: 600, gain: 0.16 }));
  }
  // transitions: reverse-style airy riser bar 4 into 9.6 s; filtered riser 2nd half bar 10 into 24.0 s
  riser(fx, T(4), B * 4, { gain: 0.09, f1: 500, f2: 7000, q: 0.9, pow: 2.6, rev: true, w: 0.8 });
  synth(fx, T(4), B * 4 - 0.02, 81, { wave: 'saw', voices: 3, detune: 10, spread: 0.8, a: 2.2, d: 1, s: 1, r: 0.02, cutoff: 600, fenv: 3000, fa: 2.3, fdec: 1, gain: 0.025 });
  riser(fx, T(10, 2), B * 2, { gain: 0.085, f1: 800, f2: 9000, q: 1.2, pow: 2.2, rev: true, tone: [mtof(57), mtof(69)], toneGain: 0.08 });
  // logo moment: sub boom + bright shimmer/bell at 24.0 s
  impact(hit, T(11), { gain: 0.55, f1: 80, f2: 36, dec: 1.4, noiseG: 0.18, ndec: 0.35, nf: 1200 });
  bell(hit, T(11), 86, { gain: 0.18, dur: 4.5, pan: 0.15 }); bell(hit, T(11) + 0.004, 93, { gain: 0.08, dur: 3.5, pan: -0.25 });
  sparkle(hit, T(11), 2.4, { gain: 0.03, count: 34, scale: [86, 90, 93, 95, 98, 102], seedv: 11 });
  return render({
    len: LEN, kicks, duckDepth: 0.35, duckRel: 0.25, revDuck: 0.1,
    rev: { room: 0.9, damp: 0.45, predelay: 0.03, lowcut: 220, highcut: 7000 }, revGain: 1.0,
    dly: { time: B * 0.75, fb: 0.4, highcut: 3800, lowcut: 400 },
    buses: [
      { buf: pad, gain: 1, rev: 0.35, duck: 0.3, haas: 0.35 }, { buf: keys, gain: 1, rev: 0.5, dly: 0.15, haas: 0.2 },
      { buf: drums, gain: 1, rev: 0.12 }, { buf: pl, gain: 1, rev: 0.3, dly: 0.45, duck: 0.6 },
      { buf: bass, gain: 1, duck: 0.5 }, { buf: fx, gain: 1, rev: 0.4 }, { buf: hit, gain: 1, rev: 0.45 }, { buf: sub, gain: 1 },
    ],
    eq: [['lowshelf', 120, 0.7, 1], ['peak', 380, 0.9, -1.5], ['highshelf', 9000, 0.7, 1]],
    comp: { thr: -16, ratio: 2 }, targetRms: -16, fade: [28.0, 28.8],
  });
}
// ============================================================ TRACK 1b: PREMIUM-V (100 BPM, E major) — Apple 式极简
// 结构：1–2 独奏钢琴 + 空气 pad；3–4 静音脉冲合成器进入；5–8 清脆指响/底鼓 + 玻璃琶音 + 正弦贝斯；
// 9–10 滤波打开渐强；10 小节第 3 拍起整体静音（只留反向气声），24.0s Logo 落下大和弦 + 钟声。
function premiumV() {
  seed(202);
  const B = 0.6, T = grid(B), LEN = 28.8, n = S(LEN);
  const pad = stereo(n), keys = stereo(n), pulse = stereo(n), glass = stereo(n), drums = stereo(n), bass = stereo(n), fx = stereo(n), hit = stereo(n);
  const H = [
    [52, 59, 63, 66, 68], // Emaj9 (E B D# F# G#)
    [49, 56, 59, 63, 64], // C#m9 (C# G# B D# E)
    [45, 57, 61, 64, 68], // Amaj7 (A A C# E G#)
    [47, 59, 63, 64, 66], // B6sus (B B D# E F#)
  ];
  const roots = [40, 37, 45, 47];
  const hb = (b) => H[(b - 1) % 4], rb = (b) => roots[(b - 1) % 4];
  // 空气 pad：柔和三角 + 少量锯齿，长起音，9–10 小节逐渐打开
  const padCut = (t) => 0.8 + 0.2 * Math.sin(TAU * t / 7.2) + (t > 19.2 ? (t - 19.2) / 3.6 * 1.2 : 0);
  for (let b = 1; b <= 10; b++) {
    const end = b === 10 ? B * 2 : B * 4; // 第 10 小节只到第 3 拍，随后静音
    chord(pad, T(b) - 0.04, end, hb(b), { wave: 'tri', wave2: 'saw', mix2: 0.25, voices: 3, detune: 9, spread: 0.85, a: b === 1 ? 2.0 : 0.7, d: 2, s: 0.85, r: b === 10 ? 0.08 : 0.9, cutoff: 1400, q: 0.6, gain: 0.034, cutFn: padCut });
  }
  // 钢琴：前两小节稀疏独奏，之后每小节两个高音点缀
  const motif = [
    [1, [[0, 76, 0.75], [1, 75, 0.5], [2, 71, 0.6], [3.5, 68, 0.5]]],
    [2, [[0, 73, 0.65], [1, 71, 0.5], [2, 68, 0.55], [3, 64, 0.5]]],
    [3, [[0, 76, 0.6], [2.5, 73, 0.45]]], [4, [[0, 75, 0.55], [2, 71, 0.45]]],
    [5, [[0, 80, 0.55], [1.5, 78, 0.4]]], [6, [[0, 76, 0.5], [1.5, 75, 0.4]]],
    [7, [[0, 81, 0.55], [1.5, 80, 0.4]]], [8, [[0, 78, 0.5], [2, 75, 0.45]]],
    [9, [[0, 80, 0.6], [1, 81, 0.45], [2, 83, 0.55]]], [10, [[0, 83, 0.6], [1, 85, 0.5]]],
  ];
  for (const [b, notes] of motif) for (const [bt, m, v] of notes) piano(keys, T(b, bt), m, v, 1.8, { gain: 0.24, bright: 0.4 });
  // 脉冲合成器：16 分音符闷音锯齿，3 小节淡入，9–10 滤波打开
  for (let b = 3; b <= 10; b++) {
    const ch = hb(b), notes = [rb(b) + 12, ch[1], rb(b) + 12, ch[2]];
    const steps = b === 10 ? 8 : 16;
    for (let s = 0; s < steps; s++) {
      const t = T(b, s / 4), ramp = b === 3 ? 0.4 + 0.6 * (s / 16) : 1;
      synth(pulse, t, 0.07, notes[s % 4], { wave: 'saw', voices: 2, detune: 6, spread: 0.5, a: 0.002, d: 0.09, s: 0, r: 0.05, cutoff: b >= 9 ? 1300 + (b - 9) * 900 + s * 40 : 650, fenv: 900, fdec: 0.04, q: 1.2, gain: 0.05 * ramp * (s % 4 === 0 ? 1 : 0.75) });
    }
  }
  // 玻璃琶音（正弦 + 高八度三角），5–10 小节 8 分音符
  for (let b = 5; b <= 10; b++) {
    const ch = hb(b), pat = [ch[2] + 12, ch[3] + 12, ch[4] + 12, ch[3] + 24, ch[4] + 12, ch[2] + 12, ch[3] + 12, ch[4] + 12];
    pat.slice(0, b === 10 ? 4 : 8).forEach((m, k) => synth(glass, T(b, k / 2), 0.05, m, { wave: 'sine', wave2: 'tri', mix2: 0.3, oct2: 1, a: 0.002, d: 0.25, s: 0, r: 0.3, cutoff: 6000, gain: 0.05 * (k % 2 ? 0.7 : 1) }));
  }
  // 打击：5–10 小节底鼓 1/3 拍，指响 2/4 拍，闭镲 8 分；7 小节起加 16 分 shaker
  const kicks = [];
  for (let b = 5; b <= 10; b++) {
    const beats = b === 10 ? [0] : [0, 2];
    for (const bt of beats) { kick(drums, T(b, bt), { gain: 0.55, f1: 44, f2: 120, pdec: 0.028, dec: 0.22, click: 0.08, drive: 0.25 }); kicks.push(T(b, bt)); }
    for (const bt of b === 10 ? [1] : [1, 3]) clap(drums, T(b, bt), { gain: 0.2, dec: 0.06, f: 2300 });
    for (let e = 0; e < (b === 10 ? 4 : 8); e++) hat(drums, T(b, e / 2),{ gain: e % 2 ? 0.05 : 0.03, dec: 0.018, pan: 0.25 });
    if (b >= 7) for (let s = 0; s < (b === 10 ? 8 : 16); s++) shaker(drums, T(b, s / 4), { gain: s % 2 ? 0.018 : 0.026, pan: -0.35 });
  }
  // 贝斯：正弦 + 少量三角，跟随根音
  for (let b = 5; b <= 10; b++) {
    const r0 = rb(b);
    const pat = b === 10 ? [[0, 1.8]] : [[0, 1.4], [1.5, 0.4], [2, 1.4], [3.5, 0.4]];
    pat.forEach(([bt, d], k) => synth(bass, T(b, bt), d * B, k === 3 ? r0 + 12 : r0, { wave: 'sine', wave2: 'tri', mix2: 0.25, a: 0.006, d: 0.4, s: 0.7, r: 0.08, cutoff: 500, gain: 0.2 }));
  }
  // 过渡：4 小节末轻 swell；10 小节第 3 拍后静音，只留反向气声冲向 Logo
  riser(fx, T(4, 2), B * 2, { gain: 0.05, f1: 800, f2: 7000, q: 0.8, pow: 2.4, rev: true, w: 0.8 });
  const swell = stereo(n); // 不受静音影响，混音后叠加
  riser(swell, T(10, 2), B * 2, { gain: 0.07, f1: 600, f2: 10000, q: 0.9, pow: 3, rev: true, w: 0.9 });
  // Logo：低 E 大和弦 + 钢琴 + 钟声 + 柔和冲击
  [28, 40, 47, 52, 56, 59, 63, 66, 71].forEach((m) => synth(hit, T(11), 3.4, m, { wave: 'tri', wave2: 'saw', mix2: 0.3, voices: 3, detune: 8, spread: 0.9, a: 0.01, d: 3, s: 0.55, r: 1.3, cutoff: 2400, fenv: 1800, fdec: 1, gain: m < 45 ? 0.07 : 0.032 }));
  [40, 52, 59, 63, 68, 71, 76].forEach((m, k) => piano(keys, T(11) + k * 0.01, m, 0.6, 3.4, { gain: 0.2, bright: 0.5, rel: 1.2 }));
  piano(keys, T(12, 0), 80, 0.4, 2, { gain: 0.16 }); piano(keys, T(12, 1.5), 76, 0.32, 1.6, { gain: 0.14 });
  impact(hit, T(11), { gain: 0.45, f1: 70, f2: 33, dec: 1.6, noiseG: 0.1, ndec: 0.3, nf: 900 });
  bell(hit, T(11), 88, { gain: 0.14, dur: 4.5, pan: 0.2 }); bell(hit, T(11) + 0.003, 95, { gain: 0.06, dur: 3.5, pan: -0.2 });
  sparkle(hit, T(11), 2.0, { gain: 0.022, count: 26, scale: [88, 92, 95, 99, 100, 104], seedv: 23 });
  return render({
    len: LEN, kicks, duckDepth: 0.4, duckRel: 0.22, revDuck: 0.15,
    rev: { room: 0.88, damp: 0.5, predelay: 0.025, lowcut: 250, highcut: 8000 }, revGain: 0.9,
    dly: { time: B * 0.75, fb: 0.35, highcut: 5000, lowcut: 500 },
    buses: [
      { buf: pad, gain: 1, rev: 0.4, duck: 0.35, haas: 0.35 }, { buf: keys, gain: 1, rev: 0.5, dly: 0.12, haas: 0.2 },
      { buf: pulse, gain: 1, rev: 0.12, duck: 0.7 }, { buf: glass, gain: 1, rev: 0.35, dly: 0.4, haas: 0.3 },
      { buf: drums, gain: 1, rev: 0.08 }, { buf: bass, gain: 1, duck: 0.5 }, { buf: fx, gain: 1, rev: 0.3 }, { buf: hit, gain: 1, rev: 0.45 },
    ],
    eq: [['lowshelf', 110, 0.7, 1], ['peak', 350, 0.9, -2], ['highshelf', 10000, 0.7, 1.5]],
    comp: { thr: -16, ratio: 2 }, targetRms: -16, fade: [28.0, 28.8],
    // Logo 前一拍全体静音（苹果式留白，只剩混响尾巴），反向气声经 post 叠加
    mutes: [[T(10, 3), T(11) - 0.01, 0.12]], post: [{ buf: swell, gain: 1 }],
  });
}
// ============================================================ TRACK 2: CYBERPUNK (900/7 BPM, A minor)
function cyberpunk() {
  seed(202);
  const B = 7 / 15, T = grid(B), LEN = 28.0, n = S(LEN), s16 = B / 4;
  const drone = stereo(n), gl = stereo(n), drums = stereo(n), bass = stereo(n), arp = stereo(n), pad = stereo(n), fx = stereo(n), hits = stereo(n), tail = stereo(n);
  const prog = [45, 45, 45, 41, 43, 40, 45, 41, 43, 41, 40, 45, 41, 45, 45]; // bar roots (Am F G E ...)
  const minorish = { 45: [0, 3, 7, 10], 41: [0, 4, 7, 11], 43: [0, 4, 7, 9], 40: [0, 4, 7, 10] };
  const groove = (b) => (b >= 3 && b <= 9) || b === 12 || b === 13;
  // drone: low detuned saws A1+E2, dark resonant filter breathing, whole track
  const dcut = (t) => 0.8 + 0.2 * Math.sin(TAU * t / 7.4);
  synth(drone, 0, 25.0, 33, { wave: 'saw', voices: 4, detune: 18, spread: 0.8, a: 0.6, d: 4, s: 0.9, r: 3.0, cutoff: 420, q: 2.2, gain: 0.11, cutFn: dcut, sub: 0.5 });
  synth(drone, 0, 25.0, 40, { wave: 'pulse', pw: 0.3, voices: 2, detune: 12, spread: 0.9, a: 2, d: 4, s: 0.8, r: 3.0, cutoff: 650, q: 1.5, gain: 0.05, cutFn: dcut });
  // bar 1: sparse glitch blips / bitcrushed stutters
  [[0.15, 0.12, 1], [0.9, 0.08, 2], [1.12, 0.06, 3], [1.5, 0.18, 4]].forEach(([t, l, sd]) => glitch(gl, t, l, { gain: 0.16, seedv: 300 + sd, base: 900, bits: 4, rate: 6, pan: sd % 2 ? 0.5 : -0.5 }));
  for (const [t, m] of [[0.47, 93], [0.7, 88], [1.4, 100]]) synth(gl, t, 0.03, m, { wave: 'square', a: 0.001, d: 0.04, s: 0, r: 0.02, cutoff: 7000, gain: 0.04, pan: (m - 94) / 10 });
  // bar 2: four-on-the-floor + noise riser + sweeping saw, silence on last 8th
  const kicks = [];
  for (let k = 0; k < 4; k++) { kick(drums, T(2, k), { gain: 0.8, f1: 46, f2: 170, dec: 0.28, click: 0.3, drive: 0.9 }); kicks.push(T(2, k)); }
  riser(fx, T(2), B * 3.5, { gain: 0.13, f1: 300, f2: 10000, q: 1.6, pow: 2.0, tone: [mtof(45), mtof(69)], toneGain: 0.12, cutTail: 0.006 });
  synth(bass, T(2), B * 3.5 - 0.01, 33, { wave: 'saw', voices: 5, detune: 22, spread: 0.6, a: 0.05, d: 1, s: 1, r: 0.006, cutoff: 200, fenv: 5000, fa: B * 3.5, q: 3.5, gain: 0.07 });
  // drums & bass in groove bars
  for (let b = 1; b <= 15; b++) {
    if (!groove(b)) continue;
    for (let k = 0; k < 4; k++) {
      kick(drums, T(b, k), { gain: 0.85, f1: 45, f2: 175, pdec: 0.04, dec: 0.27, click: 0.32, drive: 1.0 }); kicks.push(T(b, k));
      if (k === 1 || k === 3) { clap(drums, T(b, k), { gain: 0.32, dec: 0.15, f: 1500 }); snare(drums, T(b, k), { gain: 0.28, tone: 200 }); }
      openHat(drums, T(b, k + 0.5), { gain: 0.07, dec: 0.12, pan: 0.15 });
    }
    for (let s = 0; s < 16; s++) if (s % 4 !== 2) hat(drums, T(b, s / 4), { gain: s % 2 ? 0.045 : 0.065, dec: 0.018, pan: -0.3 });
    // sidechained octave saw bass (16ths, skip the kick 16th)
    const r0 = prog[b - 1] - 12;
    for (let s = 0; s < 16; s++) {
      if (s % 4 === 0) continue;
      synth(bass, T(b, s / 4), s16 * 0.8, r0 + (s % 2 ? 12 : 0), { wave: 'saw', voices: 3, detune: 14, spread: 0.35, a: 0.002, d: 0.12, s: 0.4, r: 0.03, cutoff: 280, fenv: 1600, fdec: 0.06, q: 1.6, sub: 0.6, gain: 0.12, drive: 0.6 });
    }
  }
  // arp: 16th pattern over chord tones, variation every 2 bars, ping-pong delay send
  const pats = [[0, 1, 2, 3, 2, 1, 0, 2], [0, 2, 3, 4, 3, 2, 4, 1], [3, 2, 0, 1, 4, 2, 1, 0], [0, 4, 3, 2, 4, 1, 3, 2]];
  for (let b = 3; b <= 13; b++) {
    const r0 = prog[b - 1] + 12, iv = minorish[prog[b - 1]] ?? [0, 3, 7, 10];
    const tones = [...iv, 12].map((x) => r0 + x), pat = pats[Math.floor((b - 3) / 2) % 4];
    const brk = b === 10 || b === 11;
    for (let s = 0; s < 16; s++) {
      const m = tones[pat[s % 8]] + (s >= 8 && (b % 2 === 0) ? 12 : 0);
      const cf = brk ? 1200 + 3000 * ((b - 10) * 16 + s) / 32 : 1800;
      const ag = brk ? 0.085 : 0.06;
      synth(arp, T(b, s / 4), s16 * 0.6, m, { wave: 'saw', wave2: 'square', mix2: 0.5, oct2: 1, voices: 2, detune: 9, spread: 0.5, a: 0.002, d: 0.09, s: 0.2, r: 0.05, cutoff: cf, fenv: 2500, fdec: 0.05, q: 2.4, gain: ag });
    }
  }
  // fills / stutters: last beat of bars 6 and 9
  for (const b of [6, 9]) {
    for (let s = 0; s < 8; s++) snare(drums, T(b, 3 + s / 8), { gain: 0.12 + s * 0.025, tone: 210 + s * 12, dec: 0.07 });
    glitch(fx, T(b, 3), B, { gain: 0.09, seedv: 400 + b, base: 700, bits: 5, rate: 4 });
  }
  // breakdown bars 10-11: pad, tension riser, snare roll in bar 11
  const brkV = { 10: [53, 57, 60, 64, 69], 11: [52, 56, 59, 62, 64] }; // Fmaj7 -> E7 (dominant pull back to Am)
  for (const b of [10, 11]) chord(pad, T(b), B * 4, brkV[b], { wave: 'saw', voices: 5, detune: 20, spread: 0.9, a: 0.4, d: 2, s: 0.9, r: 0.3, cutoff: 1300 + (b - 10) * 1300, q: 1.2, gain: 0.11 });
  synth(pad, T(10), B * 8, 29, { wave: 'saw', voices: 2, detune: 10, a: 0.3, d: 3, s: 0.9, r: 0.2, cutoff: 300, gain: 0.08, sub: 0.6 });
  riser(fx, T(10), B * 8 - 0.01, { gain: 0.15, f1: 250, f2: 11000, q: 1.8, pow: 2.4, tone: [mtof(45), mtof(81)], toneGain: 0.1 });
  // snare roll: 8ths -> 16ths -> 32nds, crescendo
  const roll = [];
  for (let s = 0; s < 4; s++) roll.push(s / 2);         // beats 0-2: 8ths (t in beats)
  for (let s = 0; s < 4; s++) roll.push(2 + s / 4);     // beat 2-3: 16ths
  for (let s = 0; s < 8; s++) roll.push(3 + s / 8);     // beat 3-4: 32nds
  roll.forEach((bt, k) => snare(drums, T(11, bt), { gain: 0.07 + 0.25 * (k / roll.length) ** 1.5, tone: 190 + bt * 25, dec: 0.08 }));
  // impacts
  impact(hits, T(3), { gain: 0.8, f1: 100, f2: 34, dec: 0.9, noiseG: 0.35, ndec: 0.3, nf: 2500 });
  impact(hits, T(12), { gain: 0.75, f1: 100, f2: 34, dec: 0.9, noiseG: 0.35, ndec: 0.3, nf: 2500 });
  // bar 14: biggest impact (logo), then only tails, drone and a final blip
  impact(tail, T(14), { gain: 1.0, f1: 110, f2: 30, dec: 1.8, noiseG: 0.45, ndec: 0.6, nf: 3000 });
  chord(tail, T(14), 0.3, [45, 52, 57, 60, 64], { wave: 'saw', voices: 5, detune: 22, spread: 1, a: 0.002, d: 0.6, s: 0.2, r: 1.2, cutoff: 3500, fenv: 4000, fdec: 0.3, q: 1, gain: 0.05 });
  glitch(tail, T(14), 0.35, { gain: 0.1, seedv: 777, base: 1100, bits: 4, rate: 5 });
  bell(tail, T(14), 81, { gain: 0.08, dur: 3, bright: 0.6 });
  synth(tail, T(15, 2), 0.05, 93, { wave: 'square', a: 0.001, d: 0.05, s: 0.3, r: 0.04, cutoff: 6000, gain: 0.06, pan: 0.3 });
  synth(tail, T(15, 2.25), 0.05, 100, { wave: 'square', a: 0.001, d: 0.05, s: 0.3, r: 0.06, cutoff: 6000, gain: 0.045, pan: -0.3 });
  return render({
    len: LEN, kicks, duckDepth: 0.7, duckRel: 0.2, revDuck: 0.4,
    rev: { room: 0.88, damp: 0.4, predelay: 0.015, lowcut: 300, highcut: 7500 }, revGain: 0.9,
    dly: { time: B * 0.75, fb: 0.42, highcut: 4500, lowcut: 500 },
    buses: [
      { buf: drone, gain: 1, rev: 0.2, duck: 0.4 }, { buf: gl, gain: 1, rev: 0.3, dly: 0.3 },
      { buf: drums, gain: 1, rev: 0.08 }, { buf: bass, gain: 1, duck: 0.85 },
      { buf: arp, gain: 1, rev: 0.2, dly: 0.4, duck: 0.5, haas: 0.3 }, { buf: pad, gain: 1, rev: 0.45, duck: 0.3, haas: 0.4 },
      { buf: fx, gain: 1, rev: 0.25 }, { buf: hits, gain: 1, rev: 0.35 }, { buf: tail, gain: 1, rev: 0.6 },
    ],
    mutes: [[T(2, 3.5), T(3) - 0.005, 0]],
    eq: [['lowshelf', 90, 0.7, 1.5], ['peak', 450, 1, -2], ['peak', 3200, 1.2, -1], ['highshelf', 10000, 0.7, 1.2]],
    comp: { thr: -14, ratio: 2.5 }, targetRms: -14, fade: [25.6, 28.0],
  });
}
// ============================================================ TRACK 3: TRENDY (120 BPM, F major)
function trendy() {
  seed(303);
  const B = 0.5, T = grid(B), LEN = 26.0, n = S(LEN);
  const drums = stereo(n), stabs = stereo(n), bass = stereo(n), lead = stereo(n), fx = stereo(n), hits = stereo(n), perc = stereo(n);
  // I-V-vi-IV in F: F C Dm Bb (bar-wise), voicings for supersaw stabs
  const V = { F: [53, 57, 60, 65, 69], C: [52, 55, 60, 64, 67], Dm: [53, 57, 62, 65, 69], Bb: [53, 58, 62, 65, 70] };
  const R = { F: 41, C: 36, Dm: 38, Bb: 34 };
  const prog = ['F', 'C', 'Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'F'];
  const stabO = { wave: 'saw', voices: 7, detune: 26, spread: 0.85, a: 0.002, d: 0.16, s: 0.25, r: 0.08, cutoff: 1800, fenv: 5500, fdec: 0.07, q: 1.0, gain: 0.03 };
  const kicks = [];
  const K = (t, g = 0.9) => { kick(drums, t, { gain: g, f1: 50, f2: 190, pdec: 0.035, dec: 0.22, click: 0.35, drive: 0.8 }); kicks.push(t); };
  // big "stamp" openers
  const stamp = (t, c) => { impact(hits, t, { gain: 0.6, f1: 110, f2: 42, dec: 0.5, noiseG: 0.25, ndec: 0.12, nf: 4000 }); clap(hits, t, { gain: 0.4, dec: 0.2 }); chord(stabs, t, 0.3, V[c].map((m) => m + 12), { ...stabO, d: 0.35, s: 0.3, r: 0.25, gain: 0.034 }); chord(stabs, t, 0.3, V[c], { ...stabO, gain: 0.03 }); };
  stamp(T(1), 'F'); stamp(T(4), 'Bb'); stamp(T(12), 'Bb');
  for (let b = 1; b <= 13; b++) {
    const c = prog[b - 1], drop = b >= 4;
    const stopBeat = b === 3 ? 3 : -1;
    if (b === 13) { // ending: groove for beats 1-2, final hit on beat 3 (t=25.0)
      for (const k of [0, 1]) K(T(13, k)); clap(drums, T(13, 1), { gain: 0.36 });
      chord(stabs, T(13, 0), 0.15, V.F, stabO); chord(stabs, T(13, 1.5), 0.12, V.F, stabO);
      synth(bass, T(13, 0), 0.4, R.F, { wave: 'square', pw: 0.4, a: 0.003, d: 0.15, s: 0.6, r: 0.05, cutoff: 900, fenv: 1200, fdec: 0.08, sub: 0.8, gain: 0.12 });
      continue;
    }
    for (let k = 0; k < 4; k++) {
      if (k === stopBeat) continue;
      K(T(b, k), b === 1 && k === 0 ? 0 : 0.9);
      if (k === 1 || k === 3) clap(drums, T(b, k), { gain: 0.38, dec: 0.16, f: 1400 });
      if (drop) openHat(drums, T(b, k + 0.5), { gain: 0.06, dec: 0.08 });
    }
    // stabs: bar 1 syncopated future-bass rhythm; bars 2-3 on EVERY beat (accent); drop: syncopated + offbeats
    const rhythm = b === 1 ? [0.75, 1.5, 2.5, 3, 3.5] : (b === 2 || b === 3) ? [0, 1, 2, 3, 3.5] : [0, 0.75, 1.5, 2, 2.75, 3.5];
    for (const bt of rhythm) {
      if (stopBeat >= 0 && bt >= stopBeat) continue;
      const acc = (b === 2 || b === 3) && bt % 1 === 0;
      chord(stabs, T(b, bt), acc ? 0.14 : 0.1, V[c], { ...stabO, gain: acc ? 0.036 : 0.028, cutoff: acc ? 2600 : 1800 });
      if (acc) chord(stabs, T(b, bt), 0.1, [V[c][4] + 12], { ...stabO, voices: 3, gain: 0.03 });
    }
    // playful bass: octave bounce
    const r0 = R[c], bp = [[0, 0, 0.4], [0.75, 12, 0.2], [1.5, 0, 0.3], [2, 7, 0.2], [2.5, 12, 0.2], [3, 0, 0.3], [3.5, 10, 0.2]];
    for (const [bt, iv, d] of bp) {
      if (stopBeat >= 0 && bt >= stopBeat) continue;
      synth(bass, T(b, bt), d, r0 + iv, { wave: 'square', pw: 0.4, a: 0.003, d: 0.12, s: 0.6, r: 0.04, cutoff: 700, fenv: 1600, fdec: 0.06, q: 1.3, sub: 0.8, gain: 0.11, glide: iv === 12 ? -1 : 0, glideT: 0.02 });
    }
    // shaker + 16th hats in drop
    if (drop) for (let s = 0; s < 16; s++) { shaker(perc, T(b, s / 4), { gain: s % 2 ? 0.035 : 0.05, pan: 0.35 }); if (s % 2) hat(perc, T(b, s / 4), { gain: 0.04, pan: -0.3 }); }
    else for (let s = 0; s < 8; s++) if (!(stopBeat >= 0 && s / 2 >= stopBeat)) hat(perc, T(b, s / 2), { gain: 0.05, pan: -0.2 });
  }
  // the "stop" at bar 3 beat 4 + "hey" chop
  const heyBuf = stereo(n); // rendered after the "stop" mute so it stays audible
  hey(heyBuf, T(3, 3) + 0.01, { gain: 1.0, midi: 72, len: 0.3 });
  const heyRev = freeverb(heyBuf, { room: 0.6, damp: 0.5, predelay: 0.01 });
  for (let i = 0; i < n; i++) { heyBuf.L[i] += heyRev.L[i] * 0.25; heyBuf.R[i] += heyRev.R[i] * 0.25; }
  const h0 = S(T(4) - 0.006); for (let i = h0; i < n; i++) { heyBuf.L[i] *= 0.5; heyBuf.R[i] *= 0.5; }
  // catchy lead hook bars 4-11 (and 12) - square/pluck, 2-bar phrases
  const hookA = [[0, 72, 0.5], [0.5, 74, 0.25], [0.75, 77, 0.5], [1.5, 76, 0.25], [2, 72, 0.5], [2.75, 69, 0.25], [3, 72, 0.75],
    [4, 76, 0.25], [4.5, 74, 0.5], [5, 72, 0.25], [5.5, 74, 0.5], [6, 77, 0.5], [6.75, 81, 0.25], [7, 79, 0.75]];
  const hookB = [[0, 72, 0.5], [0.5, 74, 0.25], [0.75, 77, 0.5], [1.5, 76, 0.25], [2, 81, 0.5], [2.75, 79, 0.25], [3, 77, 0.75],
    [4, 74, 0.25], [4.5, 77, 0.5], [5, 74, 0.25], [5.5, 72, 0.5], [6, 70, 0.5], [6.75, 72, 0.25], [7, 74, 0.75]];
  const leadO = { wave: 'square', pw: 0.35, wave2: 'saw', mix2: 0.35, voices: 2, detune: 8, spread: 0.4, a: 0.003, d: 0.18, s: 0.45, r: 0.08, cutoff: 1600, fenv: 3500, fdec: 0.08, q: 1.2, gain: 0.07, vib: 15, vibDelay: 0.15, glide: -0.6, glideT: 0.015 };
  for (const [startBar, ph] of [[4, hookA], [6, hookB], [8, hookA], [10, hookB], [12, hookA]]) {
    for (const [bt, m, d] of ph) {
      const t = T(startBar, bt); if (startBar === 12 && bt >= 4) continue;
      if ((startBar === 6 || startBar === 10) && bt >= 7) continue; // leave room for fills at end of bars 7 & 11
      synth(lead, t, d * B * 0.9, m, leadO);
      synth(lead, t, d * B * 0.9, m + 12, { ...leadO, wave: 'sine', wave2: null, voices: 1, gain: 0.025, cutoff: 6000, fenv: 0 }); // octave sparkle
    }
  }
  // fills end of bar 7 & 11: snare + tom roll
  for (const b of [7, 11]) {
    [[3, 196], [3.25, 165], [3.5, 131], [3.75, 98]].forEach(([bt, f], k) => tom(drums, T(b, bt), f, { gain: 0.32, pan: 0.4 - k * 0.27 }));
    for (let s = 0; s < 8; s++) snare(drums, T(b, 3 + s / 8), { gain: 0.08 + s * 0.02, tone: 220, dec: 0.06 });
    riser(fx, T(b, 2), B * 2, { gain: 0.06, f1: 1000, f2: 9000, q: 1, pow: 2, cutTail: 0.01 });
  }
  // build into the drop (bar 3 beats 1-3) and whooshes
  riser(fx, T(3), B * 3, { gain: 0.06, f1: 600, f2: 8000, q: 1, pow: 2, cutTail: 0.005 });
  whoosh(fx, T(12) - 0.5, 0.55, { gain: 0.12, peak: 0.9 });
  // final hit on bar 13 beat 3 (t = 25.0 s), let it ring
  const tf = T(13, 2);
  impact(hits, tf, { gain: 0.75, f1: 120, f2: 41, dec: 0.45, noiseG: 0.3, ndec: 0.12, nf: 4000 }); kicks.push(tf);
  clap(hits, tf, { gain: 0.45, dec: 0.22 });
  chord(stabs, tf, 0.25, [...V.F, 77, 81], { ...stabO, d: 0.3, s: 0.35, r: 0.6, gain: 0.032 });
  bell(hits, tf, 89, { gain: 0.08, dur: 1.0 }); sparkle(hits, tf, 0.8, { gain: 0.025, count: 16, scale: [89, 93, 96, 101], seedv: 31, grow: 0 });
  return render({
    len: LEN, kicks, duckDepth: 0.75, duckRel: 0.22, revDuck: 0.35,
    rev: { room: 0.8, damp: 0.4, predelay: 0.012, lowcut: 300, highcut: 8000 }, revGain: 0.8,
    dly: { time: B * 0.75, fb: 0.35, highcut: 5000, lowcut: 600 },
    buses: [
      { buf: drums, gain: 1, rev: 0.07 }, { buf: stabs, gain: 1, rev: 0.2, dly: 0.1, duck: 0.9, haas: 0.35 },
      { buf: bass, gain: 1, duck: 0.8 }, { buf: lead, gain: 1, rev: 0.18, dly: 0.25, duck: 0.25, haas: 0.15 },
      { buf: fx, gain: 1, rev: 0.25 }, { buf: hits, gain: 1, rev: 0.3 }, { buf: perc, gain: 1, rev: 0.06 },
    ],
    mutes: [[T(3, 3) - 0.003, T(4) - 0.006, 0.08]],
    post: [{ buf: heyBuf, gain: 1 }],
    eq: [['lowshelf', 90, 0.7, 1], ['peak', 300, 1, -1.5], ['highshelf', 8000, 0.7, 1.5]],
    comp: { thr: -14, ratio: 2.5 }, targetRms: -14, fade: [25.35, 25.995],
  });
}
// ============================================================ SFX library
function finishSfx(buf, o = {}) {
  const { peakDb = -3, rev = 0, revRoom = 0.6, fadeMs = 6, trimDb = -60 } = o;
  let b = buf;
  if (rev) {
    const r = freeverb(b, { room: revRoom, damp: 0.5, predelay: 0.008, lowcut: 250, highcut: 9000 });
    for (let i = 0; i < b.n; i++) { b.L[i] += r.L[i] * rev; b.R[i] += r.R[i] * rev; }
  }
  { const fl = new Biquad('hp', 30, 0.6), fr = new Biquad('hp', 30, 0.6); for (let i = 0; i < b.n; i++) { b.L[i] = fl.p(b.L[i]); b.R[i] = fr.p(b.R[i]); } }
  gainBuf(b, db2g(peakDb) / (peakOf(b) || 1));
  // trim trailing content below threshold (keep at least a little tail)
  const th = db2g(trimDb); let last = b.n - 1;
  while (last > 0 && Math.abs(b.L[last]) < th && Math.abs(b.R[last]) < th) last--;
  const len = Math.min(b.n, last + S(0.01));
  const out = { L: b.L.slice(0, len), R: b.R.slice(0, len), n: len };
  const fi = S(0.0005), fo = Math.min(S(fadeMs / 1000), len >> 2);
  for (let i = 0; i < fi; i++) { out.L[i] *= i / fi; out.R[i] *= i / fi; }
  for (let i = 0; i < fo; i++) { const g = i / fo; out.L[len - 1 - i] *= g; out.R[len - 1 - i] *= g; }
  gainBuf(out, db2g(peakDb) / (peakOf(out) || 1));
  return out;
}
const SFX = {
  click: () => { const b = stereo(S(0.06));
    synthTone(b, 0, 3200, 0.004, 0.6); synthTone(b, 0.0005, 1500, 0.007, 0.4);
    noiseHit(b, 0, { gain: 0.5, dec: 0.0025, type: 'bp', f: 5500, q: 1.5, len: 0.02 });
    synthTone(b, 0.022, 2600, 0.003, 0.18); noiseHit(b, 0.022, { gain: 0.15, dec: 0.002, type: 'bp', f: 6000, q: 1.5, len: 0.01 }); // release click
    return finishSfx(b); },
  tap: () => { const b = stereo(S(0.12));
    synthTone(b, 0, 420, 0.025, 0.8, { pitchDrop: 0.6, pdec: 0.006 }); noiseHit(b, 0, { gain: 0.15, dec: 0.006, type: 'lp', f: 2500, q: 0.7, len: 0.03 });
    return finishSfx(b); },
  whoosh: () => { const b = stereo(S(0.6)); whoosh(b, 0, 0.5, { gain: 0.5, f1: 300, f2: 3500, q: 1.0, peak: 0.55 }); whoosh(b, 0.02, 0.46, { gain: 0.2, f1: 1500, f2: 8000, q: 1.5, peak: 0.6 }); return finishSfx(b, { rev: 0.15 }); },
  'whoosh-fast': () => { const b = stereo(S(0.32)); whoosh(b, 0, 0.25, { gain: 0.5, f1: 600, f2: 6000, q: 1.2, peak: 0.6, panFrom: 0.6, panTo: -0.6 }); return finishSfx(b, { rev: 0.08 }); },
  riser: () => { const b = stereo(S(1.6)); riser(b, 0, 1.5, { gain: 0.4, f1: 300, f2: 9000, q: 1.4, pow: 2, tone: [mtof(45), mtof(81)], toneGain: 0.25, cutTail: 0.01 });
    synth(b, 0, 1.45, 57, { wave: 'saw', voices: 3, detune: 15, spread: 0.8, a: 1.3, d: 1, s: 1, r: 0.04, cutoff: 500, fenv: 5000, fa: 1.45, gain: 0.15, glide: -12, glideT: 0.6 });
    return finishSfx(b, { rev: 0.2 }); },
  'impact-soft': () => { const b = stereo(S(2.2)); impact(b, 0, { gain: 0.6, f1: 75, f2: 34, dec: 0.6, noiseG: 0.15, ndec: 0.25, nf: 900 }); return finishSfx(b, { rev: 0.25, revRoom: 0.8 }); },
  'impact-big': () => { const b = stereo(S(2.7)); impact(b, 0, { gain: 0.9, f1: 110, f2: 30, dec: 0.75, noiseG: 0.4, ndec: 0.45, nf: 2800 });
    chord(b, 0, 0.2, [33, 45, 52, 57], { wave: 'saw', voices: 3, detune: 15, spread: 0.9, a: 0.002, d: 0.5, s: 0.1, r: 0.8, cutoff: 1500, fenv: 2500, fdec: 0.2, gain: 0.06 });
    bell(b, 0, 81, { gain: 0.07, dur: 2.4 });
    return finishSfx(b, { rev: 0.35, revRoom: 0.9 }); },
  glitch: () => { const b = stereo(S(0.32)); glitch(b, 0, 0.3, { gain: 0.5, seedv: 4242, base: 800, bits: 4, rate: 6, pan: -0.2 }); glitch(b, 0.01, 0.28, { gain: 0.3, seedv: 4343, base: 1600, bits: 3, rate: 10, pan: 0.4 }); return finishSfx(b); },
  blip: () => { const b = stereo(S(0.1)); synth(b, 0, 0.07, 88, { wave: 'square', pw: 0.5, a: 0.002, d: 0.06, s: 0.6, r: 0.012, cutoff: 5000, q: 0.8, gain: 0.4 }); synth(b, 0, 0.07, 100, { wave: 'sine', a: 0.002, d: 0.03, s: 0.2, r: 0.01, gain: 0.15 }); return finishSfx(b); },
  type: () => { const b = stereo(S(0.04)); noiseHit(b, 0, { gain: 0.6, dec: 0.003, type: 'bp', f: 3800, q: 2, len: 0.02 }); synthTone(b, 0, 1900, 0.004, 0.3); synthTone(b, 0.0003, 650, 0.006, 0.2); return finishSfx(b, { peakDb: -4 }); },
  scan: () => { const b = stereo(S(1.05));
    synth(b, 0, 0.95, 72, { wave: 'saw', voices: 3, detune: 12, spread: 0.9, a: 0.05, d: 1, s: 1, r: 0.08, cutoff: 600, q: 6, gain: 0.25, cutFn: (t) => 1 + 7 * (0.5 - 0.5 * Math.cos(TAU * t * 2)), vib: 30, vibRate: 14, vibDelay: 0 });
    synth(b, 0, 0.95, 96, { wave: 'sine', a: 0.05, d: 1, s: 1, r: 0.08, gain: 0.05, vib: 60, vibRate: 22, vibDelay: 0 });
    return finishSfx(b, { rev: 0.15 }); },
  pop: () => { const b = stereo(S(0.15)); synth(b, 0, 0.06, 79, { wave: 'sine', a: 0.001, d: 0.05, s: 0.3, r: 0.05, gain: 0.7, glide: -10, glideT: 0.012 });
    noiseHit(b, 0, { gain: 0.1, dec: 0.004, type: 'bp', f: 2500, q: 1, len: 0.02 }); return finishSfx(b); },
  boing: () => { const b = stereo(S(0.45)); let ph = 0; const N = S(0.42);
    for (let i = 0; i < N; i++) { const t = i / SR, f = 180 * (1 + 0.6 * Math.exp(-t / 0.15) * Math.sin(TAU * 11 * t)) * (1 + 0.8 * Math.exp(-t / 0.03)); ph = (ph + f / SR) % 1;
      const y = (Math.sin(TAU * ph) + 0.25 * Math.sin(2 * TAU * ph)) * Math.min(1, t / 0.002) * Math.exp(-t / 0.13) * 0.6; b.L[i] += y; b.R[i] += y; }
    return finishSfx(b, { rev: 0.06 }); },
  stamp: () => { const b = stereo(S(0.45)); kick(b, 0, { gain: 0.9, f1: 60, f2: 130, pdec: 0.02, dec: 0.12, click: 0.1, drive: 1.2 });
    noiseHit(b, 0, { gain: 0.5, dec: 0.03, type: 'lp', f: 1100, q: 0.9, len: 0.2, w: 0.2 }); synthTone(b, 0, 210, 0.05, 0.3, { pitchDrop: 0.4 });
    return finishSfx(b, { rev: 0.05 }); },
  error: () => { const b = stereo(S(0.28)); for (const [t, m] of [[0, 46], [0.12, 45]]) synth(b, t, 0.1, m, { wave: 'square', pw: 0.5, voices: 2, detune: 18, spread: 0.3, a: 0.004, d: 0.1, s: 0.8, r: 0.03, cutoff: 900, q: 0.9, gain: 0.25 }); return finishSfx(b); },
  correct: () => { const b = stereo(S(0.6)); bell(b, 0, 84, { gain: 0.5, dur: 0.5, pan: -0.15 }); bell(b, 0.1, 91, { gain: 0.5, dur: 0.55, pan: 0.15 });
    synthTone(b, 0, mtof(84), 0.12, 0.25, { pan: -0.15 }); synthTone(b, 0.1, mtof(91), 0.15, 0.25, { pan: 0.15 }); return finishSfx(b, { rev: 0.15, fadeMs: 30 }); },
  shimmer: () => { const b = stereo(S(1.7)); sparkle(b, 0, 1.4, { gain: 0.25, count: 55, scale: [84, 88, 91, 93, 96, 100, 103, 105], seedv: 777, grow: 0 });
    noiseHit(b, 0, { gain: 0.05, dec: 0.5, len: 1.5, att: 0.3, type: 'hp', f: 9000, q: 0.7 }); return finishSfx(b, { rev: 0.4, revRoom: 0.75, fadeMs: 60 }); },
  swipe: () => { const b = stereo(S(0.24)); whoosh(b, 0, 0.2, { gain: 0.6, f1: 1200, f2: 7000, q: 1.5, peak: 0.4, panFrom: -0.8, panTo: 0.8 }); return finishSfx(b); },
};
// ============================================================ verification
function analyse(file) {
  const w = readWav(file); let pk = 0, ss = 0;
  for (let i = 0; i < w.x.length; i++) { const a = Math.abs(w.x[i]); if (a > pk) pk = a; ss += w.x[i] * w.x[i]; }
  // max sample-to-sample jump in the first/last 2 ms (click check at file boundaries)
  const ends = Math.max(Math.abs(w.x[0]), Math.abs(w.x[1]), Math.abs(w.x[w.x.length - 1]), Math.abs(w.x[w.x.length - 2]));
  return { ...w, peak: g2db(pk), rms: g2db(Math.sqrt(ss / w.x.length)), ends };
}

// ============================================================ main
const tracks = [
  ['premium', premium, 28.8], ['premium-v', premiumV, 28.8], ['cyberpunk', cyberpunk, 28.0], ['trendy', trendy, 26.0],
];
const only = process.argv[2];
const t00 = Date.now(), report = [];
for (const [name, fn, len] of tracks) {
  if (only && only !== name && only !== 'music') continue;
  const t = Date.now(); const buf = fn();
  const f = path.join(ROOT, 'public/audio', `${name}.wav`); writeWav(f, buf);
  const a = analyse(f);
  const ok = Math.abs(a.frames - Math.round(len * SR)) <= 1;
  report.push({ file: `public/audio/${name}.wav`, dur: a.dur, frames: a.frames, expect: len, ok, peak: a.peak, rms: a.rms, ends: a.ends });
  console.log(`rendered ${name} in ${((Date.now() - t) / 1000).toFixed(1)}s`);
}
if (!only || only === 'sfx') for (const [name, fn] of Object.entries(SFX)) {
  seed(9000 + name.length * 31 + name.charCodeAt(0));
  const f = path.join(ROOT, 'public/sfx', `${name}.wav`); writeWav(f, fn());
  const a = analyse(f);
  report.push({ file: `public/sfx/${name}.wav`, dur: a.dur, frames: a.frames, ok: true, peak: a.peak, rms: a.rms, ends: a.ends });
}
console.log('\nfile                              duration(s)   frames   peak dBFS  RMS dBFS  endSample');
for (const r of report) {
  console.log(`${r.file.padEnd(33)} ${r.dur.toFixed(6).padStart(11)} ${String(r.frames).padStart(8)} ${r.peak.toFixed(2).padStart(10)} ${r.rms.toFixed(2).padStart(9)} ${r.ends.toFixed(5).padStart(10)}${r.expect ? (r.ok ? '  OK' : `  LENGTH MISMATCH (expected ${r.expect}s)`) : ''}`);
}
console.log(`\ntotal ${((Date.now() - t00) / 1000).toFixed(1)}s`);
if (report.some((r) => !r.ok)) process.exitCode = 1;
