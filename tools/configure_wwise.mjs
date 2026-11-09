// 配置：循环、Random Container、3D Positioning + Attenuation
// 运行：node tools/configure_wwise.mjs
import { WaapiClient } from './waapi.mjs';

const AH = '\\Actor-Mixer Hierarchy\\Default Work Unit';
const MIXER = `${AH}\\Ambience_CityIntersection`;
const BED = `${MIXER}\\AMB_CityIntersection_Bed`;
const CONTAINERS = [`${MIXER}\\SFX_Vehicles_Random`, `${MIXER}\\SFX_Horns_Random`];
const ATT_PARENT = '\\Attenuations\\Default Work Unit';
const ATT_NAME = 'ATT_CityStreet_Distance';

const c = new WaapiClient();
const RET = { return: ['id', 'name', 'type', 'path'] };
const log = (...a) => console.log(...a);

const setProp = async (object, property, value, label) => {
  await c.call('ak.wwise.core.object.setProperty', { object, property, value });
  log(`  ✓ ${label ?? property} = ${JSON.stringify(value)}`);
};

const setRef = async (object, reference, value, label) => {
  await c.call('ak.wwise.core.object.setReference', { object, reference, value });
  log(`  ✓ ${label ?? reference} → ${typeof value === 'string' ? value : value.name ?? 'obj'}`);
};

async function ensureAttenuation() {
  const kids = await c.call('ak.wwise.core.object.get',
    { from: { path: [ATT_PARENT] }, transform: [{ select: ['children'] }] }, RET);
  const hit = (kids.return ?? []).find((k) => k.name === ATT_NAME);
  if (hit) { log(`  = ${ATT_NAME}`); return hit; }
  const created = await c.call('ak.wwise.core.object.create',
    { type: 'Attenuation', name: ATT_NAME, parent: ATT_PARENT, onNameConflict: 'rename' });
  log(`  + ${ATT_NAME}`);
  const id = created.id ?? (await c.call('ak.wwise.core.object.get',
    { from: { path: [ATT_PARENT + '\\' + ATT_NAME] }, transform: [{ select: ['id', 'path'] }] }, RET)).return?.[0];
  return { ...created, id: id?.id ?? id };
}

try {
  log('▶ 基底环境声：无限循环（源循环 + 播放循环）');
  await setProp(BED, 'IsLoopingEnabled', true, 'IsLoopingEnabled(源循环)');
  await setProp(BED, 'IsLoopingInfinite', true, 'IsLoopingInfinite(无限循环)');
  // 基底是全局环境层，不做距离衰减
  await setProp(BED, 'EnableAttenuation', false, 'EnableAttenuation(关闭距离衰减)');

  log('\n▶ Random Container 配置');
  for (const path of CONTAINERS) {
    log(` ${path.split('\\').pop()}`);
    await setProp(path, 'RandomOrSequence', 1, 'Play Type = Random');
    await setProp(path, 'PlayMechanismStepOrContinuous', 1, 'Play Mode = Step（每次触发随机选一个）');
    await setProp(path, 'RandomAvoidRepeating', true, '避免连续重复');
    await setProp(path, 'EnableAttenuation', true, 'EnableAttenuation = true');
    await setProp(path, '3DPosition', 0, '3D Position = Emitter');
  }

  log('\n▶ Attenuation ShareSet');
  const att = await ensureAttenuation();

  log('  距离曲线（Volume）');
  await c.call('ak.wwise.core.object.setAttenuationCurve', {
    object: att.id ?? ATT_PARENT + '\\' + ATT_NAME,
    curveType: 'VolumeDryUsage',
    use: 'Custom',
    points: [
      { x: 0, y: 0, shape: 'Linear' },
      { x: 3, y: -1.5, shape: 'Log3' },
      { x: 8, y: -7, shape: 'Log3' },
      { x: 16, y: -16, shape: 'Log3' },
      { x: 32, y: -32, shape: 'Log3' },
      { x: 60, y: -58, shape: 'Log3' },
      { x: 100, y: -96, shape: 'Linear' },
    ],
  });
  log('  ✓ VolumeDryUsage 0m/0dB → 100m/-96dB');

  log('  距离低通曲线（远处变闷）');
  await c.call('ak.wwise.core.object.setAttenuationCurve', {
    object: att.id ?? ATT_PARENT + '\\' + ATT_NAME,
    curveType: 'LowPassFilterUsage',
    use: 'Custom',
    points: [
      { x: 0, y: 0, shape: 'Linear' },
      { x: 15, y: 20, shape: 'Log3' },
      { x: 45, y: 60, shape: 'Log3' },
      { x: 100, y: 100, shape: 'Linear' },
    ],
  });
  log('  ✓ LowPassFilterUsage 0% → 100%');

  log('  声像扩散曲线（Spread）');
  await c.call('ak.wwise.core.object.setAttenuationCurve', {
    object: att.id ?? ATT_PARENT + '\\' + ATT_NAME,
    curveType: 'SpreadUsage',
    use: 'Custom',
    points: [
      { x: 0, y: 0, shape: 'Linear' },
      { x: 20, y: 45, shape: 'SCurve' },
      { x: 60, y: 90, shape: 'SCurve' },
      { x: 100, y: 100, shape: 'Linear' },
    ],
  });
  log('  ✓ SpreadUsage 0% → 100%');

  log('\n▶ 把 Attenuation 挂到两个 Random Container');
  for (const path of CONTAINERS) {
    await setRef(path, 'Attenuation', att.id ?? ATT_PARENT + '\\' + ATT_NAME, 'Attenuation 引用');
  }

  log('\n▶ 回读校验');
  const check = await c.call('ak.wwise.core.object.get', {
    from: { path: [BED, ...CONTAINERS] },
    transform: [{ select: ['name', '@IsLoopingEnabled', '@IsLoopingInfinite', '@RandomOrSequence', '@PlayMechanismStepOrContinuous', '@EnableAttenuation', '@3DPosition', '@Attenuation'] }],
  });
  for (const o of check.return ?? []) console.log(' ', JSON.stringify(o));

  await c.call('ak.wwise.core.project.save');
  log('\n✓ 已保存');
} catch (e) {
  console.error('\nERR', e.message.slice(0, 1500));
  process.exitCode = 1;
} finally {
  c.close();
  setTimeout(() => process.exit(process.exitCode ?? 0), 300);
}
