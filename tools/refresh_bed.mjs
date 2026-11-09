// 重建基底 Sound（替换音频源并保持循环/衰减设置）
// 运行：node tools/refresh_bed.mjs
import { WaapiClient } from './waapi.mjs';

const WAV = 'E:/SHU261_Final_Audio/AudioAssets/Exported/Base/AMB_RainCityIntersection_Bed_Loop.wav';
const AH = '\\Actor-Mixer Hierarchy\\Default Work Unit';
const BED = `${AH}\\Ambience_CityIntersection\\AMB_RainCityIntersection_Bed`;

const c = new WaapiClient();
try {
  try {
    await c.call('ak.wwise.core.object.delete', { object: BED });
    console.log('✓ 删除旧基底 Sound');
  } catch (e) {
    console.log('删除跳过:', e.message.slice(0, 120));
  }

  const r = await c.call('ak.wwise.core.audio.import', {
    importOperation: 'createNew',
    imports: [{ audioFile: WAV, objectPath: BED, objectType: 'Sound' }],
  });
  const err = (r.log ?? []).find((l) => l.severity === 'Error');
  if (err) throw new Error('导入失败: ' + err.message);

  for (const [p, v] of [['IsLoopingEnabled', true], ['IsLoopingInfinite', true], ['EnableAttenuation', false]]) {
    await c.call('ak.wwise.core.object.setProperty', { object: BED, property: p, value: v });
  }

  const info = await c.call('ak.wwise.core.object.get', { from: { path: [BED] } }, { return: ['id', 'name'] });
  console.log('✓ 基底重建完成，GUID:', info.return?.[0]?.id);

  await c.call('ak.wwise.core.project.save');
  console.log('✓ 已保存');
} catch (e) {
  console.error('ERR', e.message.slice(0, 600));
  process.exitCode = 1;
} finally {
  c.close();
  setTimeout(() => process.exit(process.exitCode ?? 0), 300);
}
