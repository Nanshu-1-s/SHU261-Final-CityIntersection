// 原地替换已有 AudioFileSource 的音频文件（保持 GUID 与层级不变）
// 运行：node tools/refresh_assets.mjs
import { WaapiClient } from './waapi.mjs';

const EXP = 'E:/SHU261_Final_Audio/AudioAssets/Exported';
const AH = '\\Actor-Mixer Hierarchy\\Default Work Unit';
const MIX = `${AH}\\Ambience_CityIntersection`;

const TARGETS = [
  [`${MIX}\\AMB_RainCityIntersection_Bed`, `${EXP}/Base/AMB_RainCityIntersection_Bed_Loop.wav`],
  [`${MIX}\\SFX_Vehicles_Random`, `${EXP}/Random/SFX_CarPassby_01.wav`, 'SFX_CarPassby_01'],
  [`${MIX}\\SFX_Vehicles_Random`, `${EXP}/Random/SFX_CarPassby_02.wav`, 'SFX_CarPassby_02'],
  [`${MIX}\\SFX_Vehicles_Random`, `${EXP}/Random/SFX_CarPassby_03.wav`, 'SFX_CarPassby_03'],
  [`${MIX}\\SFX_Horns_Random`, `${EXP}/Random/SFX_EbikeHorn_01.wav`, 'SFX_EbikeHorn_01'],
  [`${MIX}\\SFX_Horns_Random`, `${EXP}/Random/SFX_EbikeHorn_02.wav`, 'SFX_EbikeHorn_02'],
  [`${MIX}\\SFX_Horns_Random`, `${EXP}/Random/SFX_EbikeHorn_03.wav`, 'SFX_EbikeHorn_03'],
  [`${MIX}\\SFX_Horns_Random`, `${EXP}/Random/SFX_CarHorn_01.wav`, 'SFX_CarHorn_01'],
  [`${MIX}\\SFX_Horns_Random`, `${EXP}/Random/SFX_CarHorn_02.wav`, 'SFX_CarHorn_02'],
  [`${MIX}\\SFX_Horns_Random`, `${EXP}/Random/SFX_CarHorn_03.wav`, 'SFX_CarHorn_03'],
  [`${MIX}\\SFX_Rain_Random`, `${EXP}/Random/SFX_RainOnCanopy_01.wav`, 'SFX_RainOnCanopy_01'],
  [`${MIX}\\SFX_Rain_Random`, `${EXP}/Random/SFX_RainOnCanopy_02.wav`, 'SFX_RainOnCanopy_02'],
  [`${MIX}\\SFX_Rain_Random`, `${EXP}/Random/SFX_PuddleStep_01.wav`, 'SFX_PuddleStep_01'],
  [`${MIX}\\SFX_Rain_Random`, `${EXP}/Random/SFX_PuddleStep_02.wav`, 'SFX_PuddleStep_02'],
];

const c = new WaapiClient();

const listSources = async (soundPath) => {
  try {
    const r = await c.call('ak.wwise.core.object.get',
      { from: { path: [soundPath] }, transform: [{ select: ['children'] }] },
      { return: ['name', 'type', 'path'] });
    return r.return ?? [];
  } catch {
    return []; // 路径不存在
  }
};

try {
  let ok = 0, fail = 0;
  for (const [parent, wav, soundName] of TARGETS) {
    const base = wav.split('/').pop().replace(/\.wav$/, '');
    const soundPath = soundName ? `${parent}\\${soundName}` : parent;
    const srcPath = `${soundPath}\\${base}`;
    try {
      // 新素材（Sound 尚不存在）先建出来
      const exists = await listSources(soundPath).then((k) => k.length > 0);
      if (!exists) {
        const r = await c.call('ak.wwise.core.audio.import', {
          importOperation: 'createNew',
          imports: [{ audioFile: wav, objectPath: soundPath, objectType: 'Sound' }],
        });
        const err0 = (r.log ?? []).find((l) => l.severity === 'Error');
        if (err0) throw new Error(err0.message);
        console.log(`+ 新建 ${soundPath.split('\\').pop()}`);
        ok++;
        continue;
      }

      const r = await c.call('ak.wwise.core.audio.import', {
        importOperation: 'useExisting',
        imports: [{ audioFile: wav, objectPath: srcPath, objectType: 'AudioFileSource' }],
      });
      const err = (r.log ?? []).find((l) => l.severity === 'Error');
      if (err) throw new Error(err.message);

      const kids = await listSources(soundPath);
      const srcs = kids.filter((k) => k.type === 'AudioFileSource');
      if (srcs.length !== 1) throw new Error(`音源数量异常：${srcs.length}`);
      console.log(`✓ ${soundPath.split('\\').pop()}  (音源 ${srcs.map((s) => s.name).join(', ')})`);
      ok++;
    } catch (e) {
      console.log(`✗ ${soundPath.split('\\').pop()}: ${e.message.slice(0, 160)}`);
      fail++;
    }
  }
  await c.call('ak.wwise.core.project.save');
  console.log(`\n完成：成功 ${ok}，失败 ${fail}；工程已保存`);
} catch (e) {
  console.error('ERR', e.message.slice(0, 600));
  process.exitCode = 1;
} finally {
  c.close();
  setTimeout(() => process.exit(process.exitCode ?? 0), 300);
}
