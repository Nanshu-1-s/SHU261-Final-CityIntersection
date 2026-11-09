// 生成"成片"预览：基底 + 所有事件声按真实节奏排布，带距离衰减与左右定位
// 运行：node tools/mix_preview.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXP = join(ROOT, 'AudioAssets', 'Exported');
const OUT = join(EXP, 'Preview');
const FS = 48000;
const DURATION = 60;

mkdirSync(OUT, { recursive: true });

/* ---------------- 读写 ---------------- */
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
  const blockAlign = 6;
  const dataBytes = frames * blockAlign;
  const b = Buffer.alloc(44 + dataBytes);
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
    for (const x of [l[i], r[i]]) {
      const v = Math.max(-FULL - 1, Math.min(FULL, Math.round(Math.max(-1, Math.min(1, x)) * FULL)));
      b.writeIntLE(v, o, 3);
      o += 3;
    }
  }
  writeFileSync(path, b);
}

/* ---------------- 一阶低通（模拟远距离高频吸收） ---------------- */
function onePoleLP(input, fc) {
  const a = Math.exp(-2 * Math.PI * fc / FS);
  const out = new Float64Array(input.length);
  let y = 0;
  for (let i = 0; i < input.length; i++) { y = (1 - a) * input[i] + a * y; out[i] = y; }
  return out;
}

/* ---------------- 混音 ---------------- */
const L = new Float64Array(DURATION * FS);
const R = new Float64Array(DURATION * FS);
const db = (v) => Math.pow(10, v / 20);

function place(file, atSec, { gainDb = 0, pan = 0, lp = 0, label = '' } = {}) {
  const [cl, cr] = readWav24(file);
  const src = lp ? [onePoleLP(cl, lp), onePoleLP(cr, lp)] : [cl, cr];
  const g = db(gainDb);
  // 等功率声像
  const a = (Math.max(-1, Math.min(1, pan)) + 1) * Math.PI / 4;
  const gl = Math.cos(a) * Math.SQRT2 * g;
  const gr = Math.sin(a) * Math.SQRT2 * g;
  const off = Math.round(atSec * FS);
  for (let i = 0; i < src[0].length; i++) {
    const j = off + i;
    if (j >= 0 && j < L.length) {
      L[j] += src[0][i] * gl;
      R[j] += src[1][i] * gr;
    }
  }
  console.log(`  ${atSec.toFixed(1).padStart(5)}s  ${String(label || file.split(/[\\/]/).pop()).padEnd(24)} ${gainDb} dB  pan ${pan}`);
}

console.log('▶ 铺基底');
{
  const [bl, br] = readWav24(join(EXP, 'Base', 'AMB_RainCityIntersection_Bed_Loop.wav'));
  for (let i = 0; i < L.length; i++) {
    // 基底比素材电平再抬 2 dB，接近游戏内实际混音
    L[i] += bl[i] * db(2);
    R[i] += br[i] * db(2);
  }
}

console.log('▶ 排布事件');
const P = (n) => join(EXP, 'Random', n);

// 车辆驶过：远近交替，左右横穿
place(P('SFX_CarPassby_01.wav'), 4.2, { gainDb: -2, pan: 0.15 });      // 近，略右
place(P('SFX_CarPassby_02.wav'), 13.0, { gainDb: -9, pan: -0.35, lp: 5200 }); // 远
place(P('SFX_CarPassby_03.wav'), 21.6, { gainDb: 0, pan: -0.1 });
place(P('SFX_CarPassby_01.wav'), 33.4, { gainDb: -13, pan: 0.45, lp: 3800 }); // 很远的背景车
place(P('SFX_CarPassby_02.wav'), 44.8, { gainDb: -4, pan: 0.25 });
place(P('SFX_CarPassby_03.wav'), 52.2, { gainDb: -7, pan: -0.3, lp: 6000 });

// 电瓶车鸣笛：近距离，左右交替，间隔不规律
place(P('SFX_EbikeHorn_01.wav'), 7.8, { gainDb: -3, pan: -0.55 });
place(P('SFX_EbikeHorn_02.wav'), 17.6, { gainDb: -10, pan: 0.6, lp: 6000 }); // 远处
place(P('SFX_EbikeHorn_03.wav'), 27.2, { gainDb: -2, pan: 0.4 });
place(P('SFX_EbikeHorn_01.wav'), 38.6, { gainDb: -6, pan: -0.45 });
place(P('SFX_EbikeHorn_03.wav'), 49.6, { gainDb: -4, pan: 0.5 });

// 汽车喇叭：中距离，情绪性强
place(P('SFX_CarHorn_01.wav'), 11.2, { gainDb: -6, pan: -0.2, lp: 9000 });
place(P('SFX_CarHorn_02.wav'), 30.6, { gainDb: -9, pan: 0.35, lp: 7000 });
place(P('SFX_CarHorn_03.wav'), 47.0, { gainDb: -12, pan: 0.1, lp: 5000 });

// 雨点打伞 / 踩水：贴近听者的细节
place(P('SFX_RainOnCanopy_01.wav'), 6.4, { gainDb: -7, pan: -0.25 });
place(P('SFX_RainOnCanopy_02.wav'), 24.6, { gainDb: -11, pan: 0.3 });
place(P('SFX_PuddleStep_01.wav'), 15.4, { gainDb: -5, pan: -0.3 });
place(P('SFX_PuddleStep_02.wav'), 35.2, { gainDb: -8, pan: 0.25 });
place(P('SFX_PuddleStep_01.wav'), 51.4, { gainDb: -6, pan: 0.15 });

/* ---------------- 收尾：软限幅 + 归一 ---------------- */
let peak = 0;
for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const g = db(-1.5) / (peak || 1);
let sum = 0;
for (let i = 0; i < L.length; i++) {
  L[i] = Math.tanh(L[i] * g * 1.05) / 1.05;
  R[i] = Math.tanh(R[i] * g * 1.05) / 1.05;
  sum += L[i] * L[i] + R[i] * R[i];
}
const rms = Math.sqrt(sum / (2 * L.length));

writeWav24(join(OUT, 'CityIntersection_Preview_Mix_60s.wav'), [L, R]);
console.log(`\n✓ Preview/CityIntersection_Preview_Mix_60s.wav  60.00s  RMS ${(20 * Math.log10(rms)).toFixed(1)} dBFS`);
