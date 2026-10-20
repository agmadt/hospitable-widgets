// Brings a copy of this project (the repository the Deploy button made) up to
// a release, keeping what Cloudflare wrote into that copy on deploy: the
// Worker's name, its KV namespace and the values entered on the deploy page.
// Run by docs/update-workflow.yml in the host's copy:
//   node update-copy.mjs <release folder> <copy folder>
import { cpSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [release, copy] = process.argv.slice(2);
if (!release || !copy) {
  console.error('usage: node update-copy.mjs <release folder> <copy folder>');
  process.exit(1);
}

/** JSON with // and /* comments (wrangler.jsonc). Strings may contain "//", as in URLs. */
function parseJsonc(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      const end = text.indexOf('"', i + 1);
      let j = end;
      while (text[j - 1] === '\\') j = text.indexOf('"', j + 1);
      out += text.slice(i, j + 1);
      i = j;
    } else if (c === '/' && text[i + 1] === '/') {
      i = text.indexOf('\n', i) - 1;
      if (i < 0) break;
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i) + 1;
    } else {
      out += c;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

// What the copy's deploy decided.
const mine = parseJsonc(readFileSync(join(copy, 'wrangler.jsonc'), 'utf8'));
const myName = JSON.parse(readFileSync(join(copy, 'package.json'), 'utf8')).name;
const kvId = (mine.kv_namespaces || []).find((k) => k.binding === 'LISTINGS')?.id;
const myVars = mine.vars || {};

// Replace everything but git and GitHub settings with the release.
const KEEP = new Set(['.git', '.github']);
for (const entry of readdirSync(copy)) if (!KEEP.has(entry)) rmSync(join(copy, entry), { recursive: true, force: true });
for (const entry of readdirSync(release)) if (!KEEP.has(entry)) cpSync(join(release, entry), join(copy, entry), { recursive: true });

// The release's wrangler.jsonc, with this copy's name, storage and values.
let config = readFileSync(join(copy, 'wrangler.jsonc'), 'utf8');
const str = (v) => JSON.stringify(String(v));
config = config.replace(/"name"\s*:\s*"[^"]*"/, `"name": ${str(mine.name)}`);
if (kvId && !/"binding"\s*:\s*"LISTINGS"\s*,\s*"id"/.test(config)) {
  config = config.replace(/"binding"\s*:\s*"LISTINGS"/, `"binding": "LISTINGS", "id": ${str(kvId)}`);
}
config = config.replace(/("vars"\s*:\s*\{)([^}]*)(\})/, (all, open, body, close) => {
  for (const [key, value] of Object.entries(myVars)) {
    const line = new RegExp(`("${key}"\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"`);
    if (line.test(body)) {
      body = body.replace(line, (m, k) => k + str(value));
    } else {
      const last = [...body.matchAll(/"(?:[^"\\]|\\.)*"\s*:\s*"(?:[^"\\]|\\.)*"/g)].pop();
      const at = last ? last.index + last[0].length : 0;
      body = body.slice(0, at) + `${last ? ',' : ''}\n    "${key}": ${str(value)}` + body.slice(at);
    }
  }
  return open + body + close;
});
parseJsonc(config); // still valid
writeFileSync(join(copy, 'wrangler.jsonc'), config);

const pkg = JSON.parse(readFileSync(join(copy, 'package.json'), 'utf8'));
pkg.name = myName;
writeFileSync(join(copy, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

console.log(`Updated to ${pkg.version}, keeping the Worker name "${mine.name}"${kvId ? ', its KV namespace' : ''} and ${Object.keys(myVars).length} deploy-page value(s).`);
