// After a release tag is pushed, asks jsDelivr for every file a page may load,
// so it minifies and caches them before the first visitor does, then purges @1
// so snippets move to the new release. Usage: node scripts/warm.mjs v1.2.0
import { readdirSync } from 'node:fs';

const REPO = 'agmadt/hospitable-widgets';
const version = (process.argv[2] || '').replace(/^v/, '');
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('usage: node scripts/warm.mjs v1.2.0');
  process.exit(1);
}
const dir = new URL('../widget/', import.meta.url);
const files = ['widget.min.js', 'sizes.json']
  .concat(readdirSync(new URL('modules/', dir)).filter((f) => f.endsWith('.js')).map((f) => `modules/${f.replace(/\.js$/, '.min.js')}`))
  .concat(readdirSync(new URL('templates/', dir)).map((f) => `templates/${f}`));

async function get(url) {
  // A freshly tagged file can fail while jsDelivr fetches and minifies it.
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url).catch(() => null);
    if (res?.ok) return res;
    await new Promise((r) => setTimeout(r, attempt * 3000));
  }
  throw new Error(`jsDelivr did not serve ${url}`);
}

let failed = 0;
for (const f of files) {
  const url = `https://cdn.jsdelivr.net/gh/${REPO}@${version}/widget/${f}`;
  try {
    const res = await get(url);
    const type = res.headers.get('content-type') || '';
    const ok = f.endsWith('.js') ? type.includes('javascript') : true;
    console.log(`${ok ? '✓' : '✗'} ${f}  ${type}`);
    if (!ok) failed++;
  } catch (err) {
    console.log(`✗ ${f}  ${err.message}`);
    failed++;
  }
}

const purge = await get(`https://purge.jsdelivr.net/gh/${REPO}@${version.split('.')[0]}/widget/widget.min.js`);
console.log(`purge @${version.split('.')[0]}: ${(await purge.json()).status}`);
process.exit(failed ? 1 : 0);
