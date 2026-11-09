import { WaapiClient } from './waapi.mjs';
const c = new WaapiClient();
const AH = '\\Actor-Mixer Hierarchy\\Default Work Unit';
const MIXER = `${AH}\\Ambience_CityIntersection`;
const BED = `${MIXER}\\AMB_CityIntersection_Bed`;
const RCS = [`${MIXER}\\SFX_Vehicles_Random`, `${MIXER}\\SFX_Horns_Random`];
const ATT = '\\Attenuations\\Default Work Unit\\ATT_CityStreet_Distance';

try {
  const r = await c.call('ak.wwise.core.object.get',
    { from: { path: [BED, ...RCS, ATT] } },
    { return: ['name', 'type', 'path',
      '@IsLoopingEnabled', '@IsLoopingInfinite',
      '@RandomOrSequence', '@PlayMechanismStepOrContinuous', '@RandomAvoidRepeating',
      '@EnableAttenuation', '@3DPosition', '@Attenuation'] });

  for (const o of r.return ?? []) {
    console.log(`\n${o.type}  ${o.path}`);
    const p = o['@IsLoopingEnabled'];
    const keep = {};
    for (const [k, v] of Object.entries(o)) {
      if (k.startsWith('@') && v !== null && v !== undefined) keep[k] = v;
    }
    console.log(' ', Object.keys(keep).length ? JSON.stringify(keep) : '(全部为默认值)');
  }

  console.log('\n== 距离衰减曲线 ==');
  for (const ct of ['VolumeDryUsage', 'LowPassFilterUsage', 'SpreadUsage']) {
    const cur = await c.call('ak.wwise.core.object.getAttenuationCurve', { object: ATT, curveType: ct });
    const pts = cur?.points ?? [];
    console.log(` ${ct}: ` + pts.map((p) => `(${p.x}m, ${p.y})`).join(' → '));
  }

  const cnt = await c.call('ak.wwise.core.object.get',
    { from: { path: [`${MIXER}\\SFX_Vehicles_Random`, `${MIXER}\\SFX_Horns_Random`] }, transform: [{ select: ['children'] }] },
    { return: ['name', 'type'] });
  console.log('\n== Playlist 子对象 ==');
  console.log(' ', (cnt.return ?? []).map((o) => o.name).join(', '));

  await c.call('ak.wwise.core.project.save');
  console.log('\n✓ 已保存');
} catch (e) {
  console.error('ERR', e.message.slice(0, 900));
} finally {
  c.close();
  setTimeout(() => process.exit(0), 300);
}
