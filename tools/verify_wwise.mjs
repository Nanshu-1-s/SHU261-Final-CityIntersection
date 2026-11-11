// 工程终检：层级、循环、随机容器、衰减曲线、Soundcaster 会话
import { WaapiClient } from './waapi.mjs';

const AH = '\\Actor-Mixer Hierarchy\\Default Work Unit\\Ambience_CityIntersection';
const BED = '\\Actor-Mixer Hierarchy\\Default Work Unit\\Ambience_CityIntersection\\AMB_RainCityIntersection_Bed';
const RCS = ['SFX_Rain_Random', 'SFX_Vehicles_Random', 'SFX_Horns_Random']
  .map((n) => `\\Actor-Mixer Hierarchy\\Default Work Unit\\Ambience_CityIntersection\\${n}`);
const ATT = '\\Attenuations\\Default Work Unit\\ATT_CityStreet_Distance';

const c = new WaapiClient();
const ok = (b) => (b ? '✓' : '✗');

try {
  console.log('== 基底 ==');
  const bed = await c.call('ak.wwise.core.object.get', { from: { path: [BED] } },
    { return: ['name', '@IsLoopingEnabled', '@IsLoopingInfinite', '@EnableAttenuation'] });
  const b = bed.return?.[0] ?? {};
  console.log(` ${b.name}`);
  console.log(` ${ok(b['@IsLoopingEnabled'])} 源循环  ${ok(b['@IsLoopingInfinite'])} 无限循环  ${ok(b['@EnableAttenuation'] === false)} 关闭距离衰减`);

  console.log('\n== Random Container ==');
  for (const rc of RCS) {
    const info = await c.call('ak.wwise.core.object.get', { from: { path: [rc] } },
      { return: ['name', '@RandomOrSequence', '@PlayMechanismStepOrContinuous', '@RandomAvoidRepeating', '@3DPosition', '@Attenuation'] });
    const o = info.return?.[0] ?? {};
    const kids = await c.call('ak.wwise.core.object.get',
      { from: { path: [rc] }, transform: [{ select: ['children'] }] }, { return: ['name', 'type'] });
    const sounds = (kids.return ?? []).filter((k) => k.type === 'Sound').map((k) => k.name);
    console.log(` ${o.name}`);
    console.log(`   Play Type=${o['@RandomOrSequence']} Play Mode=${o['@PlayMechanismStepOrContinuous']} 避免重复=${o['@RandomAvoidRepeating']} 3DPosition=${o['@3DPosition']}`);
    console.log(`   Attenuation=${o['@Attenuation']?.name ?? '(无)'} · ${sounds.length} 个 Sound: ${sounds.join(', ')}`);
  }

  console.log('\n== 衰减曲线 ==');
  for (const ct of ['VolumeDryUsage', 'LowPassFilterUsage', 'SpreadUsage']) {
    const cur = await c.call('ak.wwise.core.object.getAttenuationCurve', { object: ATT, curveType: ct });
    console.log(` ${ct}: ` + (cur?.points ?? []).map((p) => `(${p.x}m,${p.y})`).join(' → '));
  }

  console.log('\n== Soundcaster 会话 ==');
  const s = await c.call('ak.wwise.core.object.get',
    { from: { path: ['\\Soundcaster Sessions'] }, transform: [{ select: ['descendants'] }] },
    { return: ['name', 'type'] });
  for (const o of s.return ?? []) console.log(` ${String(o.type).padEnd(20)} ${o.name}`);
} catch (e) {
  console.error('ERR', e.message.slice(0, 600));
  process.exitCode = 1;
} finally {
  c.close();
  setTimeout(() => process.exit(process.exitCode ?? 0), 300);
}
