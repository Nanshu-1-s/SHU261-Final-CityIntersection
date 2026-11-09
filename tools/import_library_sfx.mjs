// 从 Mixkit（Mixkit License，免费商用、无需署名）导入真实喇叭素材
// 流程：下载 → 裁剪静音 → 变调（电瓶车）→ EQ → 48kHz/24bit 立体声 → 峰值归一
// 运行：node tools/import_library_sfx.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '_library_cache');
const OUT = join(ROOT, 'AudioAssets', 'Exported', 'Random');
const TMP = join(ROOT, '_library_cache', 'tmp');
const FS = 48000;

mkdirSync(CACHE, { recursive: true });
mkdirSync(TMP, { recursive: true });
mkdirSync(OUT, { recursive: true });

// id 对应的原始条目见 Docs/Scene_CityIntersection.md 的素材来源一节
const JOBS = [
  // 汽车喇叭：直接用原始录音
  { id: 1565, out: 'SFX_CarHorn_01', pitch: 1.00, hp: 90, peakDb: -4.0, note: 'Classic car horn' },
  { id: 719, out: 'SFX_CarHorn_02', pitch: 1.00, hp: 90, peakDb: -4.5, note: 'Car double horn' },
  { id: 718, out: 'SFX_CarHorn_03', pitch: 1.00, hp: 85, peakDb: -5.0, note: 'Car horn' },
  // 电瓶车鸣笛：小汽车喇叭上移音高，得到电子蜂鸣的"小喇叭"音色
  { id: 717, out: 'SFX_EbikeHorn_01', pitch: 1.25, hp: 240, peakDb: -5.0, note: 'Small car horn ×1.25' },
  { id: 717, out: 'SFX_EbikeHorn_02', pitch: 1.42, hp: 280, peakDb: -6.0, note: 'Small car horn ×1.42' },
  { id: 717, out: 'SFX_EbikeHorn_03', pitch: 1.58, hp: 320, peakDb: -5.5, note: 'Small car horn ×1.58' },

  // 雨点打伞 / 雨棚：真实雨声录音，补高频、裁到 3 秒左右
  { id: 1264, out: 'SFX_RainOnCanopy_01', pitch: 1.00, hp: 220, peakDb: -8.0, maxSec: 3.2, boost: [[5000, 0.8, 3.0]], note: 'Rain splashing' },
  { id: 1264, out: 'SFX_RainOnCanopy_02', pitch: 1.06, hp: 240, peakDb: -9.0, maxSec: 3.2, boost: [[4500, 0.8, 2.0]], note: 'Rain splashing ×1.06（远，偏暗）' },

  // 踩水：真实水花，压到 1 秒内
  { id: 1311, out: 'SFX_PuddleStep_01', pitch: 1.00, hp: 80, peakDb: -5.0, maxSec: 0.8, note: 'Water splash' },
  { id: 1311, out: 'SFX_PuddleStep_02', pitch: 0.90, hp: 70, peakDb: -6.0, maxSec: 0.8, note: 'Water splash ×0.90' },
];

/* ---------- 读取 24bit WAV ---------- */
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
      b.writeIntLE(Math.max(-FULL - 1, Math.min(FULL, Math.round(Math.max(-1, Math.min(1, x)) * FULL))), o, 3);
      o += 3;
    }
  }
  writeFileSync(path, b);
}

/* ---------- 下载 ---------- */
async function ensureSource(id) {
  const path = join(CACHE, `${id}.wav`);
  if (existsSync(path)) return path;
  const url = `https://assets.mixkit.co/active_storage/sfx/${id}/${id}.wav`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`下载失败 ${id}: HTTP ${res.status}`);
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  return path;
}

/* ---------- 处理 ---------- */
const log = (...a) => console.log(...a);

for (const job of JOBS) {
  const src = await ensureSource(job.id);
  const stage = join(TMP, `${job.out}.wav`);

  // 变调：asetrate 抬采样率（音高与时速同步变化），再重采样回 48k
  const filters = [];
  if (job.pitch !== 1) {
    filters.push(`asetrate=44100*${job.pitch}`, 'aresample=48000');
  } else {
    filters.push('aresample=48000');
  }
  filters.push(
    'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02',
    'areverse',
    'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05',
    'areverse',
    `highpass=f=${job.hp}`,
    'equalizer=f=320:width_type=o:width=1:g=-2',
  );
  // 可选的高频补偿（真实录音普遍偏暗）
  for (const [f, q, g] of job.boost ?? []) {
    filters.push(`equalizer=f=${f}:width_type=q:width=${q}:g=${g}`);
  }
  filters.push(
    'lowpass=f=16000',
    'aformat=sample_fmts=s32:sample_rates=48000:channel_layouts=stereo',
  );

  const ffArgs = ['-v', 'error', '-y', '-i', src];
  if (job.maxSec) ffArgs.push('-t', String(job.maxSec));
  ffArgs.push('-af', filters.join(','), '-c:a', 'pcm_s24le', stage);
  execFileSync('ffmpeg', ffArgs);

  // 峰值归一 + 软限幅 + 头尾 3ms 微淡（防爆音）
  const [l, r] = readWav24(stage);
  let peak = 0;
  for (let i = 0; i < l.length; i++) peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]));
  const g = Math.pow(10, job.peakDb / 20) / (peak || 1);
  const fade = Math.round(0.003 * FS);
  for (let i = 0; i < l.length; i++) {
    let k = 1;
    if (i < fade) k = i / fade;
    if (i > l.length - fade - 1) k = Math.min(k, (l.length - 1 - i) / fade);
    l[i] = Math.tanh(l[i] * g * 1.02) / 1.02 * k;
    r[i] = Math.tanh(r[i] * g * 1.02) / 1.02 * k;
  }

  const dest = join(OUT, `${job.out}.wav`);
  writeWav24(dest, [l, r]);
  log(`✓ ${job.out}.wav  ${(l.length / FS).toFixed(2)}s  peak ${job.peakDb} dB  ← ${job.note}`);
}

log('\n完成。来源：Mixkit（Mixkit License，免费商用、无需署名）');
