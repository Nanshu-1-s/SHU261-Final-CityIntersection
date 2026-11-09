// 用 WAAPI 构建 Wwise 工程：层级 + 导入素材
// 运行：node tools/build_wwise.mjs
import { WaapiClient } from './waapi.mjs';

const ROOT = 'E:/SHU261_Final_Audio';
const EXP = ROOT + '/AudioAssets/Exported';
const AH = '\\Actor-Mixer Hierarchy\\Default Work Unit';
const MIXER = 'Ambience_CityIntersection';

const c = new WaapiClient();
const RET = { return: ['id', 'name', 'type', 'path'] };
const log = (...a) => console.log(...a);

async function childrenOf(parentPath) {
  const r = await c.call('ak.wwise.core.object.get',
    { from: { path: [parentPath] }, transform: [{ select: ['children'] }] }, RET);
  return r.return ?? [];
}

async function ensureObject(type, name, parentPath) {
  const kids = await childrenOf(parentPath);
  const hit = kids.find((k) => k.name === name);
  if (hit) { log(`  = ${name} (${hit.type})`); return hit; }
  const created = await c.call('ak.wwise.core.object.create',
    { type, name, parent: parentPath, onNameConflict: 'rename' });
  log(`  + ${name} (${type})`);
  return created;
}

async function importSound(audioFile, parentPath, soundName) {
  const objectPath = `${parentPath}\\${soundName}`;
  const r = await c.call('ak.wwise.core.audio.import', {
    importOperation: 'createNew',
    imports: [{ audioFile, objectPath, objectType: 'Sound' }],
  }, RET);
  const err = (r.log ?? []).find((l) => l.severity === 'Error');
  if (err) throw new Error(`导入失败 ${soundName}: ${err.message}`);
  log(`  ✓ ${soundName}  ← ${audioFile.split('/').pop()}`);
  return { name: soundName, path: objectPath };
}

try {
  log('▶ 容器层级');
  await ensureObject('ActorMixer', MIXER, AH);
  await ensureObject('RandomSequenceContainer', 'SFX_Vehicles_Random', `${AH}\\${MIXER}`);
  await ensureObject('RandomSequenceContainer', 'SFX_Horns_Random', `${AH}\\${MIXER}`);

  log('\n▶ 基底环境声');
  await importSound(`${EXP}/Base/AMB_CityIntersection_Bed_Loop.wav`, `${AH}\\${MIXER}`, 'AMB_CityIntersection_Bed');

  log('\n▶ 车辆驶过 ×3');
  for (const n of ['01', '02', '03']) {
    await importSound(`${EXP}/Random/SFX_CarPassby_${n}.wav`, `${AH}\\${MIXER}\\SFX_Vehicles_Random`, `SFX_CarPassby_${n}`);
  }

  log('\n▶ 鸣笛 ×5');
  for (const n of ['SFX_EbikeHorn_01', 'SFX_EbikeHorn_02', 'SFX_EbikeHorn_03', 'SFX_CarHorn_01', 'SFX_CarHorn_02']) {
    await importSound(`${EXP}/Random/${n}.wav`, `${AH}\\${MIXER}\\SFX_Horns_Random`, n);
  }

  log('\n▶ 结构');
  const all = await c.call('ak.wwise.core.object.get',
    { from: { path: [AH] }, transform: [{ select: ['descendants'] }] }, RET);
  for (const o of all.return ?? []) log(`  ${String(o.type).padEnd(24)} ${o.path}`);
} catch (e) {
  console.error('\nERR', e.message);
  process.exitCode = 1;
} finally {
  c.close();
  setTimeout(() => process.exit(process.exitCode ?? 0), 200);
}
