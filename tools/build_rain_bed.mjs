// 用真实雨声重建基底：真实小雨（Mixkit #1253）+ 合成城市层
// 运行：node tools/build_rain_bed.mjs
//   前置：node tools/gen_assets.mjs --city-only-bed
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '_library_cache');
const OUT = join(ROOT, 'AudioAssets', 'Exported', 'Base');
const DEST = join(OUT, 'AMB_RainCityIntersection_Bed_Loop.wav');
const FS = 48000;
const SECONDS = 60;
const PERIOD = 30;   // 无缝周期：60s 正好平铺两次
const XFADE = 3;
const RAIN_ID = 1253; // Light rain loop（39.4s）

mkdirSync(CACHE, { recursive: true });
mkdirSync(OUT, { recursive: true });

/* ---------------- WAV 读写 ---------------- */
function readWav24(path) {
  const b = readFileSync(path);
  const channels = b.readUInt16LE(22);
  let off = 12;
  while (off < b.length - 8) {
    const id = b.toString('ascii', off, off + 4);
    const size = b.readUInt32LE(off + 4);
    if (id === 'data') {
      const frames = size / (channels * 3);
      const ch = Array.from({ length: channels }, () => new Float64Array(frames));
      for (let i = 0; i < frames; i++) {
        for (let c = 0; c < channels; c++) {
          const p = off + 8 + (i * channels + c) * 3;
          let v = b[p] | (b[p + 1] << 8) | (b[p + 2] << 16);
          if (v & 0x800000) v |= ~0xffffff;
          ch[c][i] = v / 8388608;
        }
      }
      return ch;
    }
    off += 8 + size + (size % 2);
  }
  throw new Error('无 data 块: ' + path);
}

function writeWav24(path, [l, r]) {
  const frames = l.length;
  const dataBytes = frames * 6;
  const b = Buffer.alloc(44 + dataBytes);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(36 + dataBytes, 4);
  b.write('WAVE', 8, 'ascii');
  b.write('fmt ', 12, 'ascii');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(2, 22);
  b.writeUInt32LE(FS, 24);
  b.writeUInt32LE(FS * 6, 28);
  b.writeUInt16LE(6, 32);
  b.writeUInt16LE(24, 34);
  b.write('data', 36, 'ascii');
  b.writeUInt32LE(dataBytes, 40);
  const FULL = 8388607;
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (const x of [l[i], r[i]]) {
      b.writeIntLE(Math.max(-FULL - 1, Math.min(FULL, Math.round(Math.max(-1, Math.min(1, x)) * FULL))), o, 3);
      o += 3;
    }
  }
  writeFileSync(path, b);
}

/* ---------------- 滤波 ---------------- */
function biquadCoeffs(type, f0, Q, gainDb = 0) {
  const w0 = (2 * Math.PI * f0) / FS;
  const cosw = Math.cos(w0), sinw = Math.sin(w0);
  const alpha = sinw / (2 * Q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'hp') {
    b0 = (1 + cosw) / 2; b1 = -(1 + cosw); b2 = (1 + cosw) / 2;
    a0 = 1 + alpha; a1 = -2 * cosw; a2 = 1 - alpha;
  } else if (type === 'lp') {
    b0 = (1 - cosw) / 2; b1 = 1 - cosw; b2 = (1 - cosw) / 2;
    a0 = 1 + alpha; a1 = -2 * cosw; a2 = 1 - alpha;
  } else {
    const A = Math.pow(10, gainDb / 40);
    b0 = 1 + alpha * A; b1 = -2 * cosw; b2 = 1 - alpha * A;
    a0 = 1 + alpha / A; a1 = -2 * cosw; a2 = 1 - alpha / A;
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}
function applyBiquad(x, c) {
  const out = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = c.b0 * x[i] + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    out[i] = y; x2 = x1; x1 = x[i]; y2 = y1; y1 = y;
  }
  return out;
}
const hp = (x, f, q = 0.7) => applyBiquad(x, biquadCoeffs('hp', f, q));
const lp = (x, f, q = 0.6) => applyBiquad(x, biquadCoeffs('lp', f, q));
const peak = (x, f, q, gainDb) => applyBiquad(x, biquadCoeffs('peak', f, q, gainDb));

const rms = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
const db = (v) => Math.pow(10, v / 20);

/* ---------------- 1. 取真实雨声 ---------------- */
const raw = join(CACHE, `${RAIN_ID}.wav`);
if (!existsSync(raw)) {
  const res = await fetch(`https://assets.mixkit.co/active_storage/sfx/${RAIN_ID}/${RAIN_ID}.wav`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error('下载失败: ' + res.status);
  writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
  console.log(`↓ 下载 ${RAIN_ID}.wav`);
}

const conv = join(CACHE, 'rain_48k24.wav');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-t', String(PERIOD + XFADE + 1),
  '-af', 'aresample=48000,highpass=f=70,equalizer=f=320:width_type=o:width=1:g=-2,' +
        'aformat=sample_fmts=s32:sample_rates=48000:channel_layouts=stereo',
  '-c:a', 'pcm_s24le', conv]);

let [rl, rr] = readWav24(conv);
rl = peak(peak(rl, 4500, 0.7, 5.0), 8000, 0.9, 3.5);
rr = peak(peak(rr, 4500, 0.7, 5.0), 8000, 0.9, 3.5);
console.log(`雨声素材: ${(rl.length / FS).toFixed(2)}s`);

/* ---------------- 2. 做成 30s 无缝周期 ---------------- */
function makeSeamlessLoop(src, periodSec, fadeSec) {
  const period = Math.round(periodSec * FS);
  const fade = Math.round(fadeSec * FS);
  const out = new Float64Array(period);
  for (let i = 0; i < period; i++) {
    if (i < fade) {
      const w = i / fade;
      const a = Math.cos(w * Math.PI / 2), b = Math.sin(w * Math.PI / 2);
      out[i] = src[period + i] * a + src[i] * b;
    } else {
      out[i] = src[i];
    }
  }
  return out;
}

const loopL = makeSeamlessLoop(rl, PERIOD, XFADE);
const loopR = makeSeamlessLoop(rr, PERIOD, XFADE);

/* ---------------- 3. 平铺到 60s ---------------- */
const total = Math.round(SECONDS * FS);
const rainL = new Float64Array(total), rainR = new Float64Array(total);
for (let i = 0; i < total; i++) {
  rainL[i] = loopL[i % loopL.length];
  rainR[i] = loopR[i % loopR.length];
}

/* ---------------- 4. 与城市层混合 ---------------- */
const cityPath = join(CACHE, 'city_bed_60s.wav');
if (!existsSync(cityPath)) throw new Error('缺少城市层，先运行：node tools/gen_assets.mjs --city-only-bed');
const [cl, cr] = readWav24(cityPath);

const rainRms = Math.sqrt((rms(rainL) ** 2 + rms(rainR) ** 2) / 2);
const cityRms = Math.sqrt((rms(cl) ** 2 + rms(cr) ** 2) / 2);
const gRain = db(-27) / rainRms;
const gCity = db(-29.5) / cityRms;

let outL = new Float64Array(total), outR = new Float64Array(total);
for (let i = 0; i < total; i++) {
  outL[i] = rainL[i] * gRain + cl[i] * gCity;
  outR[i] = rainR[i] * gRain + cr[i] * gCity;
}

/* ---------------- 5. 收尾处理 ---------------- */
outL = lp(hp(outL, 28), 17000);
outR = lp(hp(outR, 28), 17000);

// 150 Hz 以下居中，保证单声道不塌
{
  const ml = lp(outL, 150), mr = lp(outR, 150);
  for (let i = 0; i < outL.length; i++) {
    const m = 0.5 * (ml[i] + mr[i]);
    outL[i] = outL[i] - ml[i] + m;
    outR[i] = outR[i] - mr[i] + m;
  }
}

const g = db(-28) / Math.sqrt((rms(outL) ** 2 + rms(outR) ** 2) / 2);
const ceil = db(-7);
for (let i = 0; i < outL.length; i++) {
  outL[i] = Math.tanh(outL[i] * g / ceil) * ceil;
  outR[i] = Math.tanh(outR[i] * g / ceil) * ceil;
}

writeWav24(DEST, [outL, outR]);

let seam = Math.abs(outL[0] - outL[outL.length - 1]);
let inner = 0;
for (let i = 1; i < 2000; i++) inner += Math.abs(outL[i] - outL[i - 1]);
inner /= 1999;
console.log(`✓ ${DEST}`);
console.log(`  60.00s（30s 周期 ×2）· RMS -28 dBFS · 接缝差 ${seam.toExponential(1)}（相邻采样差 ${inner.toExponential(1)}）`);
