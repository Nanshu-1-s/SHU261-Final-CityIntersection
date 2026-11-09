import { WaapiClient } from './waapi.mjs';
const c = new WaapiClient();
try {
  await new Promise((r) => setTimeout(r, 5000));
  const r = await c.call('ak.wwise.core.object.get',
    { from: { path: ['\\Soundcaster Sessions'] }, transform: [{ select: ['descendants'] }] },
    { return: ['name', 'type', 'path'] });
  console.log('== Soundcaster Sessions ==');
  for (const o of r.return ?? []) console.log(` ${String(o.type).padEnd(22)} ${o.path}`);

  const p = await c.call('ak.wwise.core.getProjectInfo');
  console.log('\n工程:', p?.name, '| 版本:', p?.version?.displayName ?? '', '| 平台:', (p?.platforms ?? []).map((x) => x.name ?? x).join(','));

  await c.call('ak.wwise.core.project.save');
  console.log('✓ 已保存（Wwise 已接受该会话）');
} catch (e) {
  console.error('ERR', e.message.slice(0, 800));
} finally {
  c.close();
  setTimeout(() => process.exit(0), 300);
}
