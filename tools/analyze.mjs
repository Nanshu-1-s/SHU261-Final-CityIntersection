// 素材自检：读取 24bit WAV，检查 DC、峰值、循环接缝、频段能量分布
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXP = join(ROOT, 'AudioAssets', 'Exported');

function readWav24(path) {
  const b = readFileSync(path);
  if (b.toString('ascii', 0, 4) !== 'RIFF') throw new Error('非 RIFF');
  const channels = b.readUInt16LE(22);
  const rate = b.readUInt32LE(24);
  const bits = b.readUInt16LE(34);
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
      return { rate, bits, channels, frames, ch };
    }
    off += 8 + size + (size % 2);
  }
  throw new Error('无 data 块');
}

// Goertzel：单频点能量
function goertzel(x, f, rate, start, len) {
  const k = (2 * Math.PI * f) / rate;
  const coeff = 2 * Math.cos(k);
  let s1 = 0, s2 = 0;
  for (let i = start; i < start + len; i++) {
    const s0 = x[i] + coeff * s1 - s2;
    s2 = s1; s1 = s0;
  }
  const p = s1 * s1 + s2 * s2 - coeff * s1 * s2;
  return Math.sqrt(Math.max(0, p)) / len;
}

function bandRms(x, lo, hi, rate, start, len) {
  // 在频段内对数取样若干点，取平均幅度
  const pts = [];
  for (let i = 0; i < 12; i++) {
    const f = lo * Math.pow(hi / lo, i / 11);
    pts.push(goertzel(x, f, rate, start, len));
  }
  const mean = pts.reduce((a, b) => a + b, 0) / pts.length;
  return 20 * Math.log10(Math.max(mean, 1e-9));
}

const bands = [[25, 60], [60, 150], [150, 400], [400, 1200], [1200, 3500], [3500, 10000], [10000, 18000]];

function analyze(path) {
  const w = readWav24(path);
  const L = w.ch[0], R = w.ch[1] ?? w.ch[0];
  let dc = 0, peak = 0, sum = 0;
  for (let i = 0; i < L.length; i++) {
    dc += L[i] + R[i];
    sum += L[i] * L[i] + R[i] * R[i];
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const rms = Math.sqrt(sum / (2 * L.length));
  const dcOff = dc / (2 * L.length);

  // 循环接缝：首尾差值 vs 内部相邻差值的典型量级
  const seam = Math.abs(L[0] - L[L.length - 1]);
  let inner = 0;
  for (let i = 1; i < 2000; i++) inner += Math.abs(L[i] - L[i - 1]);
  inner /= 1999;

  // 中段频谱（避开淡入区）
  const start = Math.floor(L.length * 0.25);
  const len = Math.min(16384, L.length - start - 1);
  const spec = bands.map(([lo, hi]) => `${lo}-${hi}Hz:${bandRms(L, lo, hi, w.rate, start, len).toFixed(1)}`);

  // 包络轮廓（用于检查事件型素材是否中段达到峰值）
  const seg = 10, segLen = Math.floor(L.length / seg);
  const env = [];
  for (let s = 0; s < seg; s++) {
    let m = 0;
    for (let i = s * segLen; i < (s + 1) * segLen; i++) m = Math.max(m, Math.abs(L[i]), Math.abs(R[i]));
    env.push((20 * Math.log10(Math.max(m, 1e-9))).toFixed(0));
  }

  return {
    file: path.replace(EXP + '\\', '').replace(/\\/g, '/'),
    dur: (L.length / w.rate).toFixed(2),
    fmt: `${w.rate}/${w.bits}bit/${w.channels}ch`,
    peak: (20 * Math.log10(peak)).toFixed(1),
    rms: (20 * Math.log10(rms)).toFixed(1),
    dc: dcOff.toExponential(1),
    seam: `${seam.toExponential(1)} (inner ${inner.toExponential(1)})`,
    spec: spec.join(' '),
    env: env.join(','),
  };
}

const files = [];
for (const sub of ['Base', 'Random']) {
  for (const f of readdirSync(join(EXP, sub)).filter((x) => x.endsWith('.wav'))) files.push(join(EXP, sub, f));
}
for (const f of files) {
  const r = analyze(f);
  console.log(`\n=== ${r.file}  ${r.dur}s  ${r.fmt}`);
  console.log(`    peak ${r.peak} dBFS | rms ${r.rms} dBFS | DC ${r.dc}`);
  console.log(`    loop seam Δ: ${r.seam}`);
  console.log(`    bands  ${r.spec}`);
  console.log(`    env    [${r.env}] dBFS`);
}
