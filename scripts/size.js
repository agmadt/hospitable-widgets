// Download size of widget.js and its modules, as jsDelivr serves them
// (minified, then compressed), and what typical widgets load in total.
//   npm run size            print the table and write widget/sizes.json
//   npm run size -- --check fail if widget/sizes.json is out of date (CI)
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { minify } from 'terser';

const dir = new URL('../widget/', import.meta.url);
const FILES = ['widget.js', 'modules/analyze.js', 'modules/calendar.js', 'modules/reviews.js', 'modules/lightbox.js', 'modules/pager.js'];
// Snippets from the builder say what they need, so analyze.js is not part of these.
const WIDGETS = {
  'Description, Key facts, Amenities, …': ['widget.js'],
  'Photo gallery': ['widget.js', 'modules/lightbox.js'],
  'Availability calendar': ['widget.js', 'modules/calendar.js', 'modules/pager.js'],
  'Reviews (carousel)': ['widget.js', 'modules/reviews.js', 'modules/pager.js'],
};

const sizes = {};
for (const file of FILES) {
  const src = readFileSync(new URL(file, dir), 'utf8');
  const min = (await minify(src)).code;
  sizes[file] = { raw: src.length, min: min.length, gzip: gzipSync(min, { level: 9 }).length };
}

const kb = (n) => (n / 1024).toFixed(1).padStart(5) + ' KB';
console.log('File                    minified   gzip');
for (const [file, s] of Object.entries(sizes)) console.log(`${file.padEnd(22)} ${kb(s.min)} ${kb(s.gzip)}`);
console.log('\nWidget                                  downloads (gzip)');
for (const [name, files] of Object.entries(WIDGETS)) {
  console.log(`${name.padEnd(38)} ${kb(files.reduce((t, f) => t + sizes[f].gzip, 0))}  ${files.map((f) => f.replace(/^modules\/|\.js$/g, '')).join(' + ')}`);
}

const out = new URL('sizes.json', dir);
const json = JSON.stringify(Object.fromEntries(Object.entries(sizes).map(([f, s]) => [f, s.gzip])), null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (readFileSync(out, 'utf8') !== json) {
    console.error('\nwidget/sizes.json is out of date: run npm run size and commit it.');
    process.exit(1);
  }
} else {
  writeFileSync(out, json);
}
