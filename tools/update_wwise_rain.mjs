// 把 Wwise 工程从"无雨路口"更新为"小雨路口"
// 运行：node tools/update_wwise_rain.mjs
import { WaapiClient } from './waapi.mjs';

const ROOT = 'E:/SHU261_Final_Audio';
const EXP = ROOT + '/AudioAssets/Exported';
const AH = '\\Actor-Mixer Hierarchy\\Default Work Unit';
const MIXER = `${AH}\\Ambience_CityIntersection`;
const OLD_BED = `${MIXER}\\AMB_CityIntersection_Bed`;
const NEW_BED = `${MIXER}\\AMB_RainCityIntersection_Bed`;
const RAIN_RC = `${MIXER}\\SFX_Rain_Random`;
const ATT = '\\Attenuations\\Default Work Unit\\ATT_CityStreet_Distance';

const c = new WaapiClient();
const log = (...a) => console.log(...a);

const exists = async (path) => {
  try {
    const r = await c.call('ak.wwise.core.object.get', { from: { path: [path] } }, { return: ['id'] });
    return (r.return ?? []).length > 0;
  } catch { return false; }
};

try {
  // 1. 基底：重命名 + 替换音频源
  if (await exists(OLD_BED)) {
    await c.call('ak.wwise.core.object.setName', { object: OLD_BED, value: 'AMB_RainCityIntersection_Bed' });
    log('✓ 重命名 AMB_CityIntersection_Bed → AMB_RainCityIntersection_Bed');
  }
  if (await exists(NEW_BED)) {
    const wav = `${EXP}/Base/AMB_RainCityIntersection_Bed_Loop.wav`;
    let replaced = false;
    try {
      const r = await c.call('ak.wwise.core.audio.import', {
        importOperation: 'useExisting',
        imports: [{ audioFile: wav, objectPath: NEW_BED, objectType: 'Sound' }],
      });
      const err = (r.log ?? []).find((l) => l.severity === 'Error');
      if (err) log('  useExisting 未生效: ' + err.message);
      else replaced = true;
    } catch (e) {
      log('  useExisting 异常: ' + e.message.slice(0, 160));
    }

    if (replaced) {
      log('✓ 基底音频源已替换（保留原对象与 GUID）');
    } else {
      // 退路：重建 Sound，GUID 会变，之后会重新生成 Soundcaster 会话
      await c.call('ak.wwise.core.object.delete', { object: NEW_BED });
      const r = await c.call('ak.wwise.core.audio.import', {
        importOperation: 'createNew',
        imports: [{ audioFile: wav, objectPath: NEW_BED, objectType: 'Sound' }],
      });
      const err = (r.log ?? []).find((l) => l.severity === 'Error');
      if (err) throw new Error('重建基底失败: ' + err.message);
      await c.call('ak.wwise.core.object.setProperty', { object: NEW_BED, property: 'IsLoopingEnabled', value: true });
      await c.call('ak.wwise.core.object.setProperty', { object: NEW_BED, property: 'IsLoopingInfinite', value: true });
      await c.call('ak.wwise.core.object.setProperty', { object: NEW_BED, property: 'EnableAttenuation', value: false });
      log('✓ 基底已重建（GUID 变更，会话需重新生成）');
    }
  } else {
    throw new Error('找不到基底 Sound，工程状态与预期不符');
  }

  // 2. 新建雨声 Random Container
  if (!(await exists(RAIN_RC))) {
    await c.call('ak.wwise.core.object.create', {
      type: 'RandomSequenceContainer', name: 'SFX_Rain_Random', parent: MIXER,
    });
    log('+ 新建 SFX_Rain_Random');
  } else {
    log('= SFX_Rain_Random 已存在');
  }

  // 3. 导入 4 个雨声事件
  const files = ['SFX_RainOnCanopy_01', 'SFX_RainOnCanopy_02', 'SFX_PuddleStep_01', 'SFX_PuddleStep_02'];
  const importList = [];
  for (const name of files) {
    if (await exists(`${RAIN_RC}\\${name}`)) { log(`= ${name} 已存在`); continue; }
    importList.push({ audioFile: `${EXP}/Random/${name}.wav`, objectPath: `${RAIN_RC}\\${name}`, objectType: 'Sound' });
  }
  if (importList.length) {
    const r = await c.call('ak.wwise.core.audio.import', { importOperation: 'createNew', imports: importList });
    const err = (r.log ?? []).find((l) => l.severity === 'Error');
    if (err) throw new Error('导入失败: ' + err.message);
    log(`✓ 导入 ${importList.length} 个雨声事件`);
  }

  // 4. 配置 Random Container
  const props = [
    ['RandomOrSequence', 1], ['PlayMechanismStepOrContinuous', 1],
    ['RandomAvoidRepeating', true], ['EnableAttenuation', true], ['3DPosition', 0],
  ];
  for (const [p, v] of props) {
    await c.call('ak.wwise.core.object.setProperty', { object: RAIN_RC, property: p, value: v });
  }
  await c.call('ak.wwise.core.object.setReference', { object: RAIN_RC, reference: 'Attenuation', value: ATT });
  log('✓ SFX_Rain_Random 配置完成（Random / Step / 距离衰减）');

  await c.call('ak.wwise.core.project.save');
  log('✓ 工程已保存');
} catch (e) {
  console.error('ERR', e.message.slice(0, 1200));
  process.exitCode = 1;
} finally {
  c.close();
  setTimeout(() => process.exit(process.exitCode ?? 0), 300);
}
