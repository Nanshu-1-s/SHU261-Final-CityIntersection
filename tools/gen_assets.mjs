// SHU261 基础实践 Final —— 环境声素材生成器 (v2)
// 场景：城市十字路口 / City Intersection
// 输出：48 kHz · 24 bit · stereo .wav
//
// v2 修正：
//   1. 无缝循环改为等功率交叉淡化（cos/sin），修掉接缝跳变
//   2. 全素材加 12 Hz 直流阻断
//   3. 基底与驶过声加入多段频谱校准，使能量分布符合真实街道
//   4. 事件素材裁掉尾部静音
//
// 运行：node tools/gen_assets.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_BED = join(ROOT, 'AudioAssets', 'Exported', 'Base');
const OUT_SFX = join(ROOT, 'AudioAssets', 'Exported', 'Random');
const FS = 48000;

mkdirSync(OUT_BED, { recursive: true });
mkdirSync(OUT_SFX, { recursive: true });

/* ------------------------------ 随机数 ------------------------------ */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------ 工具 ------------------------------ */
const dbToGain = (db) => Math.pow(10, db / 20);
const gainToDb = (g) => 20 * Math.log10(Math.max(g, 1e-12));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);

/* ------------------------------ 噪声 ------------------------------ */
function whiteNoise(n, rnd) {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = rnd() * 2 - 1;
  return out;
}

function pinkNoise(n, rnd) {
  const out = new Float64Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = rnd() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return out;
}

function brownNoise(n, rnd) {
  const out = new Float64Array(n);
  let last = 0;
  for (let i = 0; i < n; i++) {
    last = (last + 0.02 * (rnd() * 2 - 1)) * 0.9997;
    out[i] = last * 3.5;
  }
  return out;
}

/* ------------------------------ 滤波 ------------------------------ */
function biquadCoeffs(type, f0, Q, gainDb = 0) {
  const w0 = (2 * Math.PI * clamp(f0, 10, FS * 0.49)) / FS;
  const cosw = Math.cos(w0);
  const sinw = Math.sin(w0);
  const alpha = sinw / (2 * Q);
  let b0, b1, b2, a0, a1, a2;

  if (type === 'lowpass') {
    b0 = (1 - cosw) / 2; b1 = 1 - cosw; b2 = (1 - cosw) / 2;
    a0 = 1 + alpha; a1 = -2 * cosw; a2 = 1 - alpha;
  } else if (type === 'highpass') {
    b0 = (1 + cosw) / 2; b1 = -(1 + cosw); b2 = (1 + cosw) / 2;
    a0 = 1 + alpha; a1 = -2 * cosw; a2 = 1 - alpha;
  } else if (type === 'bandpass') {
    b0 = alpha; b1 = 0; b2 = -alpha;
    a0 = 1 + alpha; a1 = -2 * cosw; a2 = 1 - alpha;
  } else if (type === 'peak') {
    const A = Math.pow(10, gainDb / 40);
    b0 = 1 + alpha * A; b1 = -2 * cosw; b2 = 1 - alpha * A;
    a0 = 1 + alpha / A; a1 = -2 * cosw; a2 = 1 - alpha / A;
  } else {
    throw new Error('未知滤波类型 ' + type);
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function applyBiquad(input, coeffs) {
  const { b0, b1, b2, a1, a2 } = coeffs;
  const out = new Float64Array(input.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x0 = input[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y0;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
  }
  return out;
}

const lowpass = (x, f, Q = 0.707) => applyBiquad(x, biquadCoeffs('lowpass', f, Q));
const highpass = (x, f, Q = 0.707) => applyBiquad(x, biquadCoeffs('highpass', f, Q));
const bandpass = (x, f, Q = 1) => applyBiquad(x, biquadCoeffs('bandpass', f, Q));

function bandpassSweep(input, centerFn, Q = 1) {
  const out = new Float64Array(input.length);
  const blockSize = 128;
  let c = biquadCoeffs('bandpass', centerFn(0), Q);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    if (i % blockSize === 0) c = biquadCoeffs('bandpass', centerFn(i / FS), Q);
    const x0 = input[i];
    const y0 = c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    out[i] = y0;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
  }
  return out;
}

// 12 Hz 直流阻断（一阶高通两次串联）
function dcBlock(input) {
  const R = Math.exp(-2 * Math.PI * 12 / FS);
  const out = new Float64Array(input.length);
  let x1 = 0, y1 = 0;
  for (let i = 0; i < input.length; i++) {
    const y = input[i] - x1 + R * y1;
    x1 = input[i]; y1 = y;
    out[i] = y;
  }
  let x1b = 0, y1b = 0;
  for (let i = 0; i < out.length; i++) {
    const y = out[i] - x1b + R * y1b;
    x1b = out[i]; y1b = y;
    out[i] = y;
  }
  return out;
}

/* --------------------------- 频谱测量与校准 --------------------------- */
const BANDS = [
  [25, 60], [60, 150], [150, 400], [400, 1200],
  [1200, 3500], [3500, 10000], [10000, 18000],
];

function goertzel(x, f, start, len) {
  const k = (2 * Math.PI * f) / FS;
  const coeff = 2 * Math.cos(k);
  let s1 = 0, s2 = 0;
  for (let i = start; i < start + len; i++) {
    const s0 = x[i] + coeff * s1 - s2;
    s2 = s1; s1 = s0;
  }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2)) / len;
}

function measureBands(x, start, len) {
  return BANDS.map(([lo, hi]) => {
    let acc = 0;
    const pts = 10;
    for (let i = 0; i < pts; i++) {
      const f = lo * Math.pow(hi / lo, i / (pts - 1));
      acc += goertzel(x, f, start, len);
    }
    return gainToDb(acc / pts);
  });
}

// 迭代式多段峰值校准：把实测频段电平拉向目标曲线
function correctSpectrum(chans, targets, { iters = 5, minF = 25, maxF = 18000, tol = 0.8 } = {}) {
  const len = 32768;
  const start = Math.floor(chans[0].length * 0.3);
  const safeStart = Math.min(start, chans[0].length - len - 2);
  let cur = measureBands(chans[0], safeStart, len);

  for (let it = 0; it < iters; it++) {
    const deltas = targets.map((t, i) => t - cur[i]);
    if (deltas.every((d) => Math.abs(d) < tol)) break;

    for (let b = 0; b < BANDS.length; b++) {
      const g = clamp(deltas[b], -14, 14);
      if (Math.abs(g) < 0.3) continue;
      const [lo, hi] = BANDS[b];
      const f0 = Math.sqrt(lo * hi);
      const Q = clamp(f0 / (hi - lo), 0.6, 4);
      const c = biquadCoeffs('peak', clamp(f0, minF, maxF), Q, g);
      for (let ch = 0; ch < chans.length; ch++) chans[ch] = applyBiquad(chans[ch], c);
    }
    cur = measureBands(chans[0], safeStart, len);
  }
  return { bands: cur, start: safeStart, len };
}

/* ------------------------------ 电平 ------------------------------ */
function peakOf(a) { let p = 0; for (let i = 0; i < a.length; i++) p = Math.max(p, Math.abs(a[i])); return p; }
function rmsOf(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * a[i]; return Math.sqrt(s / a.length); }

function normalizePeak([l, r], targetDb) {
  const g = dbToGain(targetDb) / (Math.max(peakOf(l), peakOf(r)) || 1);
  for (let i = 0; i < l.length; i++) { l[i] *= g; r[i] *= g; }
  return [l, r];
}

function normalizeRms([l, r], targetDb) {
  const rms = Math.sqrt((rmsOf(l) ** 2 + rmsOf(r) ** 2) / 2);
  const g = dbToGain(targetDb) / (rms || 1);
  for (let i = 0; i < l.length; i++) { l[i] *= g; r[i] *= g; }
  return [l, r];
}

function softLimit([l, r], ceilingDb = -1) {
  const c = dbToGain(ceilingDb), knee = 0.7 * c;
  const f = (x) => {
    const a = Math.abs(x);
    if (a <= knee) return x;
    return Math.sign(x) * (knee + (c - knee) * Math.tanh((a - knee) / (c - knee)));
  };
  for (let i = 0; i < l.length; i++) { l[i] = f(l[i]); r[i] = f(r[i]); }
  return [l, r];
}

/* ------------------------------ 空间 ------------------------------ */
function panToStereo(mono, panFn) {
  const l = new Float64Array(mono.length);
  const r = new Float64Array(mono.length);
  for (let i = 0; i < mono.length; i++) {
    const a = (clamp(panFn(i / FS), -1, 1) + 1) * Math.PI / 4;
    l[i] = mono[i] * Math.cos(a);
    r[i] = mono[i] * Math.sin(a);
  }
  return [l, r];
}

function outdoorReflections(samples, taps) {
  const out = new Float64Array(samples.length + Math.round(0.2 * FS));
  out.set(samples, 0);
  for (const { delay, gain, lp } of taps) {
    const d = Math.round(delay * FS);
    const src = lp ? lowpass(samples, lp) : samples;
    for (let i = 0; i < src.length; i++) out[i + d] += src[i] * gain;
  }
  return out;
}

// 裁掉尾部静音，仅保留 tail 秒余量
function trimTail([l, r], tail = 0.15, floorDb = -86) {
  const thr = dbToGain(floorDb);
  let last = 0;
  for (let i = l.length - 1; i >= 0; i--) {
    if (Math.abs(l[i]) > thr || Math.abs(r[i]) > thr) { last = i; break; }
  }
  const end = Math.min(l.length, last + Math.round(tail * FS));
  return [l.subarray(0, end), r.subarray(0, end)];
}

function applyGainInPlace(arr, gainFn) {
  for (let i = 0; i < arr.length; i++) arr[i] *= gainFn(i / FS);
  return arr;
}

function addIn(dest, src, offsetSec = 0, gain = 1) {
  const off = Math.round(offsetSec * FS);
  for (let i = 0; i < src.length; i++) {
    const j = off + i;
    if (j >= 0 && j < dest.length) dest[j] += src[i] * gain;
  }
  return dest;
}

/* ------------------------------ WAV 写出 ------------------------------ */
function writeWav24(path, [l, r], { dither = true } = {}) {
  const frames = l.length;
  const blockAlign = 2 * 3;
  const dataBytes = frames * blockAlign;
  const b = Buffer.alloc(44 + dataBytes);
  const rnd = mulberry32(0x5eed);

  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(36 + dataBytes, 4);
  b.write('WAVE', 8, 'ascii');
  b.write('fmt ', 12, 'ascii');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(2, 22);
  b.writeUInt32LE(FS, 24);
  b.writeUInt32LE(FS * blockAlign, 28);
  b.writeUInt16LE(blockAlign, 32);
  b.writeUInt16LE(24, 34);
  b.write('data', 36, 'ascii');
  b.writeUInt32LE(dataBytes, 40);

  const FULL = 8388607;
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (const ch of [l[i], r[i]]) {
      let v = clamp(ch, -1, 1) * FULL;
      if (dither) v += (rnd() - rnd()) * 0.5;
      b.writeIntLE(clamp(Math.round(v), -FULL - 1, FULL), o, 3);
      o += 3;
    }
  }
  writeFileSync(path, b);
  return dataBytes + 44;
}

/* ================================================================== */
/* 素材 1：十字路口基底环境声（60s 无缝循环）                            */
/* ================================================================== */
const BED_TARGET = [-54, -52, -53, -56, -62, -70, -80];

function buildCityBed(seconds = 60, xfade = 3) {
  const total = seconds + xfade;
  const n = Math.round(total * FS);
  const rnd = mulberry32(20261109);

  // ① 低频城市隆隆
  const rumble = lowpass(brownNoise(n, rnd), 130, 0.8);
  const subRumble = lowpass(brownNoise(n, rnd), 55, 0.9);

  // ② 中频车流
  const traffic = bandpass(pinkNoise(n, rnd), 700, 0.5);

  // ③ 轮胎/路面宽带嘶声（街道的高频主体）
  const tire = applyBiquad(whiteNoise(n, rnd), biquadCoeffs('bandpass', 2600, 0.45));

  // ④ 远处人声轰鸣
  const crowd = bandpass(pinkNoise(n, rnd), 1600, 0.8);

  // ⑤ 空气底噪
  const air = highpass(whiteNoise(n, rnd), 6000, 0.7);

  // ⑥ 50Hz 电网嗡鸣
  const hum = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / FS;
    hum[i] = Math.sin(2 * Math.PI * 50 * t) * 0.6
           + Math.sin(2 * Math.PI * 150 * t) * 0.18
           + Math.sin(2 * Math.PI * 250 * t) * 0.07;
  }

  const mix = (arr, breathFn) => {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = arr[i] * breathFn(i / FS);
    return out;
  };

  const L = new Float64Array(n);
  const R = new Float64Array(n);

  const breathA = (t) => 1 + 0.18 * Math.sin(2 * Math.PI * (1 / 9) * t + 0.7)
                         + 0.10 * Math.sin(2 * Math.PI * (1 / 17) * t + 2.1);
  const breathB = (t) => 1 + 0.16 * Math.sin(2 * Math.PI * (1 / 11) * t + 1.9);
  const flowA = (t) => 0.55 + 0.30 * Math.sin(2 * Math.PI * (1 / 23) * t + 1.3)
                          + 0.15 * Math.sin(2 * Math.PI * (1 / 7) * t + 3.4);
  const flowB = (t) => 0.55 + 0.30 * Math.sin(2 * Math.PI * (1 / 19) * t + 0.4)
                          + 0.15 * Math.sin(2 * Math.PI * (1 / 8.5) * t + 2.7);
  const crowdA = (t) => Math.max(0, 0.45 + 0.4 * Math.sin(2 * Math.PI * (1 / 31) * t)
                                    + 0.15 * Math.sin(2 * Math.PI * (1 / 5.3) * t + 1.1));
  const crowdB = (t) => Math.max(0, 0.45 + 0.4 * Math.sin(2 * Math.PI * (1 / 27) * t + 1.9));

  for (let i = 0; i < n; i++) {
    const t = i / FS;
    const lowMid = (rumble[i] * 0.55 + subRumble[i] * 1.1) * breathA(t);
    const tireA = tire[i] * (0.85 + 0.15 * Math.sin(2 * Math.PI * (1 / 13) * t));
    L[i] = lowMid
         + traffic[i] * flowA(t) * 2.4
         + tireA * 0.55
         + crowd[i] * crowdA(t) * 0.9
         + air[i] * 0.16
         + hum[i] * 0.010;
  }

  // 右声道用独立噪声源重建同类纹理，避免完全单声道
  const rndR = mulberry32(77123);
  const rumbleR = lowpass(brownNoise(n, rndR), 130, 0.8);
  const subRumbleR = lowpass(brownNoise(n, rndR), 55, 0.9);
  const trafficR = bandpass(pinkNoise(n, rndR), 740, 0.5);
  const tireR = applyBiquad(whiteNoise(n, rndR), biquadCoeffs('bandpass', 2500, 0.45));
  const crowdR = bandpass(pinkNoise(n, rndR), 1550, 0.8);
  const airR = highpass(whiteNoise(n, rndR), 6200, 0.7);

  for (let i = 0; i < n; i++) {
    const t = i / FS;
    const lowMid = (rumbleR[i] * 0.55 + subRumbleR[i] * 1.1) * breathB(t);
    const tireB = tireR[i] * (0.85 + 0.15 * Math.sin(2 * Math.PI * (1 / 12) * t + 0.9));
    R[i] = lowMid
         + trafficR[i] * flowB(t) * 2.4
         + tireB * 0.55
         + crowdR[i] * crowdB(t) * 0.9
         + airR[i] * 0.16
         + hum[i] * 0.010;
  }

  // 频谱校准 → 直流阻断
  let chans = [dcBlock(L), dcBlock(R)];
  const cal = correctSpectrum(chans, BED_TARGET);
  chans = chans.map((c) => dcBlock(c));

  // 等功率交叉淡化：末段与首段功率互补，接缝处连续
  const fadeN = Math.round(xfade * FS);
  const loopN = Math.round(seconds * FS);
  const outL = new Float64Array(loopN);
  const outR = new Float64Array(loopN);
  for (let i = 0; i < loopN; i++) {
    if (i < fadeN) {
      // w=0 时取尾部内容（与 out[loopN-1] 连续），w=1 时回到头部
      const w = i / fadeN;
      const a = Math.cos(w * Math.PI / 2);
      const b = Math.sin(w * Math.PI / 2);
      outL[i] = chans[0][loopN + i] * a + chans[0][i] * b;
      outR[i] = chans[1][loopN + i] * a + chans[1][i] * b;
    } else {
      outL[i] = chans[0][i];
      outR[i] = chans[1][i];
    }
  }

  let st = [outL, outR];
  st = normalizeRms(st, -23);
  if (Math.max(peakOf(st[0]), peakOf(st[1])) > dbToGain(-9)) st = normalizePeak(st, -9);
  return { st, cal };
}

/* ================================================================== */
/* 素材 2：车辆驶过                                                    */
/* ================================================================== */
const PASSBY_TARGET = [-58, -55, -47, -43, -47, -60, -72];

function buildCarPassby(seed, { duration = 5.2, closeness = 0.72, peakAt = 0.56, speed = 1.0 } = {}) {
  const n = Math.round(duration * FS);
  const rnd = mulberry32(seed);
  const src = pinkNoise(n * 2, rnd);

  const doppler = new Float64Array(n);
  let readPos = 0;
  for (let i = 0; i < n; i++) {
    const prog = (i / FS) / duration;
    const signed = prog - peakAt;
    const rate = speed * (1 - 0.16 * Math.tanh(signed * 9));
    readPos += rate;
    const idx = Math.floor(readPos);
    const frac = readPos - idx;
    const a = src[idx % src.length];
    const b = src[(idx + 1) % src.length];
    const near = Math.exp(-Math.pow((prog - peakAt) / 0.30, 2));
    doppler[i] = (a + (b - a) * frac) * ((1 - closeness) + closeness * near);
  }

  // 带通中心随距离扫动：远 → 近 → 远
  const whoosh = bandpassSweep(doppler, (t) => {
    const d = Math.abs(t / duration - peakAt);
    return 300 + 1500 * Math.exp(-Math.pow(d / 0.22, 2));
  }, 0.8);

  // 高频气流
  const air = bandpass(highpass(whiteNoise(n, mulberry32(seed + 23)), 2200, 0.7), 4600, 0.6);
  for (let i = 0; i < n; i++) {
    const d = Math.abs((i / FS) / duration - peakAt);
    whoosh[i] += air[i] * 0.55 * Math.exp(-Math.pow(d / 0.17, 2));
  }

  // 低频滚动
  const rumble = lowpass(brownNoise(n, mulberry32(seed + 11)), 95, 0.8);
  for (let i = 0; i < n; i++) {
    const d = Math.abs((i / FS) / duration - peakAt);
    whoosh[i] += rumble[i] * 0.28 * (Math.exp(-Math.pow(d / 0.34, 2)) + 0.05);
  }

  // 频谱校准（在主体能量窗口内测）
  const cal = correctSpectrum([whoosh], PASSBY_TARGET, { iters: 4 });
  let mono = dcBlock(whoosh);

  const fadeIn = 0.08, fadeOut = 0.4;
  applyGainInPlace(mono, (t) => {
    let g = 1;
    if (t < fadeIn) g *= smoothstep(t / fadeIn);
    if (t > duration - fadeOut) g *= smoothstep((duration - t) / fadeOut);
    return g;
  });

  const startPan = seed % 2 === 0 ? -0.75 : 0.7;
  let st = panToStereo(mono, (t) => lerp(startPan, -startPan, smoothstep(clamp(t / duration, 0, 1))));
  st = [outdoorReflections(st[0], [{ delay: 0.041, gain: 0.22, lp: 2600 }, { delay: 0.077, gain: 0.14, lp: 2000 }]),
        outdoorReflections(st[1], [{ delay: 0.053, gain: 0.20, lp: 2400 }, { delay: 0.089, gain: 0.12, lp: 1900 }])];
  st = [st[0].subarray(0, n), st[1].subarray(0, n)];

  st = normalizePeak(st, -3.5);
  st = softLimit(st, -1.5);
  return { st, cal };
}

/* ================================================================== */
/* 素材 3：电瓶车鸣笛                                                  */
/* ================================================================== */
function buildEbikeHorn(seed, { far = false, beeps = 2 } = {}) {
  const rnd = mulberry32(seed);
  const beepLen = 0.15, gap = 0.11, startT = 0.05;
  const contentEnd = startT + beeps * (beepLen + gap) + (far ? 0.5 : 0.2);
  const duration = far ? 1.9 : contentEnd;
  const n = Math.round(duration * FS);
  const out = new Float64Array(n);

  const base = 1180 + (rnd() * 120 - 60);

  for (let b = 0; b < beeps; b++) {
    const t0 = startT + b * (beepLen + gap);
    const i0 = Math.round(t0 * FS);
    const i1 = Math.round((t0 + beepLen) * FS);
    let phase = 0;
    for (let i = i0; i < i1 && i < n; i++) {
      const lt = (i - i0) / FS;
      const f = base * (1 + 0.012 * Math.sin(2 * Math.PI * 7 * lt)) * (1 - 0.03 * lt / beepLen);
      phase += (2 * Math.PI * f) / FS;
      const s = Math.sin(phase) * 0.6 + Math.sin(2 * phase) * 0.22
              + Math.sin(3 * phase) * 0.13 + Math.sin(5 * phase) * 0.07;
      const env = Math.min(1, lt / 0.008) * Math.min(1, (beepLen - lt) / 0.012);
      out[i] += s * Math.max(0, env);
    }
  }

  let shaped = bandpass(out, base, 1.4);
  shaped = applyBiquad(shaped, biquadCoeffs('peak', base * 2.4, 2.5, 4));
  if (far) {
    shaped = lowpass(shaped, 1500, 0.8);
    applyGainInPlace(shaped, (t) => Math.exp(-t * 1.5));
  }
  shaped = dcBlock(shaped);

  const pan = seed % 2 === 0 ? -0.45 : 0.5;
  let st = panToStereo(shaped, () => pan);
  st = [outdoorReflections(st[0], [{ delay: 0.062, gain: 0.18, lp: 3200 }]),
        outdoorReflections(st[1], [{ delay: 0.071, gain: 0.16, lp: 3000 }])];
  st = [st[0].subarray(0, n), st[1].subarray(0, n)];
  st = trimTail(st, 0.12);
  st = normalizePeak(st, far ? -9 : -4);
  st = softLimit(st, -1.5);
  return { st };
}

/* ================================================================== */
/* 素材 4：汽车喇叭                                                    */
/* ================================================================== */
function buildCarHorn(seed, { double = true } = {}) {
  const rnd = mulberry32(seed);
  const honkLen = 0.42, gap = 0.09, startT = 0.06;
  const count = double ? 2 : 1;
  const duration = startT + count * (honkLen + gap) + 0.25;
  const n = Math.round(duration * FS);
  const out = new Float64Array(n);

  const f1 = 404 + rnd() * 14;
  const f2 = f1 * 1.26;

  for (let b = 0; b < count; b++) {
    const t0 = startT + b * (honkLen + gap);
    const i0 = Math.round(t0 * FS);
    const i1 = Math.round((t0 + honkLen) * FS);
    for (let i = i0; i < i1 && i < n; i++) {
      const lt = (i - i0) / FS;
      const bend = 1 - 0.02 * (lt / honkLen);
      let s = 0;
      for (const [f, g] of [[f1, 0.5], [f2, 0.42]]) {
        const ph = 2 * Math.PI * f * bend * lt;
        s += g * (Math.sin(ph) + 0.45 * Math.sin(2 * ph) + 0.25 * Math.sin(3 * ph) + 0.12 * Math.sin(4 * ph));
      }
      const env = Math.min(1, lt / 0.010) * Math.min(1, (honkLen - lt) / 0.020);
      out[i] += s * Math.max(0, env) * 0.35;
    }
  }

  let shaped = lowpass(out, 5200, 0.7);
  shaped = applyBiquad(shaped, biquadCoeffs('peak', 900, 1.1, 3));
  shaped = dcBlock(shaped);

  const pan = seed % 2 === 0 ? 0.35 : -0.4;
  let st = panToStereo(shaped, () => pan);
  st = [outdoorReflections(st[0], [{ delay: 0.058, gain: 0.20, lp: 2800 }, { delay: 0.11, gain: 0.10, lp: 2200 }]),
        outdoorReflections(st[1], [{ delay: 0.067, gain: 0.18, lp: 2700 }, { delay: 0.12, gain: 0.09, lp: 2100 }])];
  st = [st[0].subarray(0, n), st[1].subarray(0, n)];
  st = trimTail(st, 0.2);
  st = normalizePeak(st, -5);
  st = softLimit(st, -1.5);
  return { st };
}

/* ================================================================== */
/* 主流程                                                              */
/* ================================================================== */
const fmt = (b) => (b / 1048576).toFixed(1) + ' MB';
const lvl = ([l, r]) =>
  `RMS ${gainToDb(Math.sqrt((rmsOf(l) ** 2 + rmsOf(r) ** 2) / 2)).toFixed(1)} / peak ${gainToDb(Math.max(peakOf(l), peakOf(r))).toFixed(1)} dBFS`;

console.log('▶ 基底环境声 AMB_CityIntersection_Bed_Loop.wav');
const bed = buildCityBed(60, 3);
const bedBytes = writeWav24(join(OUT_BED, 'AMB_CityIntersection_Bed_Loop.wav'), bed.st);
console.log(`  ✓ 60.00s · ${fmt(bedBytes)} · ${lvl(bed.st)}`);
console.log(`    频段: ${bed.cal.bands.map((b, i) => `${BANDS[i][0]}-${BANDS[i][1]}Hz:${b.toFixed(1)}`).join(' ')}`);

console.log('▶ 车辆驶过 SFX_CarPassby_01..03.wav');
[[101, { closeness: 0.80, peakAt: 0.52, duration: 4.6 }],
 [202, { closeness: 0.62, peakAt: 0.60, duration: 5.4 }],
 [303, { closeness: 0.90, peakAt: 0.48, duration: 4.0 }]].forEach(([seed, opt], i) => {
  const { st, cal } = buildCarPassby(seed, opt);
  writeWav24(join(OUT_SFX, `SFX_CarPassby_0${i + 1}.wav`), st);
  console.log(`  ✓ SFX_CarPassby_0${i + 1}.wav · ${(st[0].length / FS).toFixed(2)}s · ${lvl(st)}`);
  console.log(`    频段: ${cal.bands.map((b, j) => `${BANDS[j][0]}-${BANDS[j][1]}Hz:${b.toFixed(1)}`).join(' ')}`);
});

console.log('▶ 电瓶车鸣笛 SFX_EbikeHorn_01..03.wav');
[[401, { far: false }], [502, { far: true }], [603, { far: false, beeps: 3 }]].forEach(([seed, opt], i) => {
  const { st } = buildEbikeHorn(seed, opt);
  writeWav24(join(OUT_SFX, `SFX_EbikeHorn_0${i + 1}.wav`), st);
  console.log(`  ✓ SFX_EbikeHorn_0${i + 1}.wav · ${(st[0].length / FS).toFixed(2)}s · ${lvl(st)}`);
});

console.log('▶ 汽车喇叭 SFX_CarHorn_01..02.wav');
[[701, { double: true }], [802, { double: false }]].forEach(([seed, opt], i) => {
  const { st } = buildCarHorn(seed, opt);
  writeWav24(join(OUT_SFX, `SFX_CarHorn_0${i + 1}.wav`), st);
  console.log(`  ✓ SFX_CarHorn_0${i + 1}.wav · ${(st[0].length / FS).toFixed(2)}s · ${lvl(st)}`);
});

console.log('完成 → AudioAssets/Exported/{Base,Random}');
