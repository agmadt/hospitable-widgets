import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../widget');
export const widgetSource = readFileSync(resolve(dir, 'widget.js'), 'utf8');
export const MODULES = ['analyze', 'templates', 'calendar', 'reviews', 'lightbox', 'pager'];
export const moduleSource = Object.fromEntries(MODULES.map((m) => [m, readFileSync(resolve(dir, `modules/${m}.js`), 'utf8')]));

// Indirect eval runs a script in global scope, like a <script> tag.
const run = (src) => (0, eval)(src);

/**
 * Runs widget.js in the current (happy-dom) window and returns its API.
 * By default every module is loaded and widgets mount eagerly, so tests can
 * focus on behavior; pass { modules: [] } or { lazy: true } to test those parts.
 */
export async function loadWidget({ modules = MODULES, lazy = false } = {}) {
  delete window.HospWidgets;
  const io = window.IntersectionObserver;
  if (!lazy) window.IntersectionObserver = undefined;
  run(widgetSource);
  window.IntersectionObserver = io;
  for (const m of modules) run(moduleSource[m]);
  await window.HospWidgets.need(modules);
  return window.HospWidgets;
}

/** Plays the browser's part when the loader adds <script src=".../modules/x.js">. */
export function serveModuleScripts() {
  const served = [];
  for (const s of document.querySelectorAll('script[src*="modules/"]')) {
    if (s.__served) continue;
    s.__served = true;
    const name = /modules\/([a-z]+)(\.min)?\.js$/.exec(s.src)[1];
    served.push(s.src);
    run(moduleSource[name]);
  }
  return served;
}
