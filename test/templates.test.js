// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWidget } from './helpers/load-widget.js';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../widget/templates');
const TYPES = readdirSync(dir).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5));
const file = (name) => readFileSync(resolve(dir, name), 'utf8');
const CDN = 'https://cdn.example.com/hospitable-widgets/widget/';

let W;
let T;

/** Serves template files from disk and widget data from routes, like jsDelivr and a Worker. */
function stubFetch(routes = {}) {
  const calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    calls.push(String(url));
    const u = new URL(url);
    if (u.href.startsWith(CDN + 'templates/')) return new Response(file(u.pathname.split('/').pop()));
    const body = routes[u.pathname + u.search] ?? routes[u.pathname];
    if (body === undefined) return new Response('{}', { status: 404 });
    if (body instanceof Error) throw body;
    return new Response(JSON.stringify(body));
  }));
  return calls;
}

beforeEach(async () => {
  document.head.innerHTML = `<script src="${CDN}widget.js"></script>`;
  document.body.innerHTML = '';
  localStorage.clear();
  W = await loadWidget();
  T = W.module('templates');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('starter templates', () => {
  it('has all 16', () => {
    expect(TYPES).toHaveLength(16);
  });

  it.each(TYPES)('%s: valid header, no builder tags left with default options', (type) => {
    const s = T.parse(file(`${type}.html`));
    expect(s.meta.name).toBeTruthy();
    const out = T.render(s, {}, {}, '');
    expect(out).not.toMatch(/\[\[/);
    expect(out).toMatch(/^<style>:host\{--hw-accent:#0f766e;/);
  });

  it.each(TYPES)('%s: no template tag where the HTML parser would mangle it', (type) => {
    const body = T.parse(file(`${type}.html`)).body;
    // Inside a start tag, a tag outside quotes is read as an attribute name and torn apart.
    for (const tag of body.match(/<[a-zA-Z][^<>]*>/g) ?? []) {
      expect(tag.replace(/"[^"]*"|'[^']*'/g, '""'), tag).not.toMatch(/\{[#^/]?[\w.]+\}/);
    }
    // Between table rows the parser moves bare text out of the table.
    expect(body).not.toMatch(/<(tr|thead|tbody|table)[^>]*>\s*\{[#^/]/);
  });
});

describe('options and style', () => {
  const meta = { options: [{ key: 'title', type: 'text' }, { key: 'link', type: 'url' }, { key: 'more', type: 'text', tokens: { count: 'amenity_count' } }] };

  it('applies sections, values and tokens', () => {
    expect(T.applyOptions('[[#a]]A[[/a]][[^a]]B[[/a]][[#l=grid]]G[[/l=grid]]', { a: 'on', l: 'grid' }, meta)).toBe('AG');
    expect(T.applyOptions('[[#a]]1[[#b]]2[[/b]]3[[/a]]', { a: 'on', b: 'off' }, meta)).toBe('13');
    expect(T.applyOptions('[[more]]', { more: 'Show all {count}' }, meta)).toBe('Show all {amenity_count}');
  });

  it('keeps typed text from becoming HTML or a template tag', () => {
    const out = T.applyOptions('<h2>[[title]]</h2>', { title: '<b>{property_name}</b> & co' }, meta);
    expect(out).toContain('&lt;b&gt;');
    expect(out).not.toMatch(/\{property_name\}/);
    expect(T.applyOptions('[[link]]', { link: 'javascript:alert(1)' }, meta)).toBe('#');
    expect(T.applyOptions('[[link]]', { link: 'https://example.com/book' }, meta)).toBe('https://example.com/book');
  });

  it('writes style variables and refuses unsafe values', () => {
    expect(T.styleCss({ accent: '#c2410c', radius: '4' })).toContain('--hw-accent:#c2410c;');
    expect(T.styleCss({ radius: '4' })).toContain('--hw-radius:4px;');
    expect(T.styleCss({ accent: 'red;}body{display:none' })).toContain('--hw-accent:#0f766e;');
    expect(T.fontHref({ font: 'inter', headingFont: 'lora' })).toBe('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Lora:wght@400;600;700&display=swap');
    expect(T.fontHref({})).toBe('');
  });

  it('round-trips snippet parameters', () => {
    const p = T.writeParams({ heading: 'Où dormir & plus', card: '' });
    expect(T.readParams(p)).toEqual({ heading: 'Où dormir & plus', card: '' });
  });
});

describe('one-line snippets', () => {
  const property = { property_name: 'Relaxing Villa near the sea', amenities: ['Shower', 'Oven', 'Wi-Fi'], max_guests: 6 };

  function widget(attrs) {
    document.body.innerHTML = `<div id="w" data-hosp-worker="https://w.example.workers.dev" data-hosp-property="p1" ${attrs}></div>`;
    return document.getElementById('w');
  }

  it('renders a starter template by name with the snippet’s options and style', async () => {
    const calls = stubFetch({ '/api/properties/p1': property });
    const el = widget('data-hosp="amenities" data-hosp-data="property" data-hosp-modules="" data-hosp-amenities-limit="2" data-hosp-options="heading=Inside%20the%20villa" data-hosp-style="accent=%23c2410c&font=inter"');
    await W.scan();
    const root = el.shadowRoot;
    expect(el.getAttribute('data-hosp-state')).toBe('live');
    expect(root.querySelector('h2').textContent).toBe('Inside the villa');
    expect(root.querySelector('.am').querySelectorAll('li')).toHaveLength(2); // the pop-up holds all 3
    expect(root.querySelector('.am-more').textContent).toBe('Show all 3 amenities');
    expect([...root.querySelectorAll('style')].map((x) => x.textContent).join('')).toContain('--hw-accent:#c2410c');
    // The font goes into the page, where shadow roots can use it.
    expect(document.head.querySelector('link[data-hosp-font]').href).toContain('family=Inter');
    expect(calls.filter((c) => c.includes('/templates/')).sort()).toEqual([`${CDN}templates/_base.css`, `${CDN}templates/amenities.html`]);
  });

  it('works out what a snippet needs when it does not say', async () => {
    const calls = stubFetch({ '/api/properties/p1?include=reviews': { ...property, reviews: [{ id: 'a', rating: 5, text: 'Lovely', date: '2026-01-01', guest_name: 'Ana' }], rating_average: 5, review_count: 1 } });
    const el = widget('data-hosp="rating-summary"');
    await W.scan();
    expect(el.getAttribute('data-hosp-state')).toBe('live');
    expect(el.shadowRoot.textContent).toContain('1 review');
    expect(calls).toContain('https://w.example.workers.dev/api/properties/p1?include=reviews');
  });

  it("shows the visitor's last copy when the Worker can't be reached", async () => {
    stubFetch({ '/api/properties/p1': property });
    let el = widget('data-hosp="description" data-hosp-data="property" data-hosp-modules=""');
    await W.scan();
    expect(el.getAttribute('data-hosp-state')).toBe('live');

    // Next visit: the Worker is down.
    W = await loadWidget();
    stubFetch({ '/api/properties/p1': new TypeError('Failed to fetch') });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    el = widget('data-hosp="description" data-hosp-data="property" data-hosp-modules=""');
    await W.scan();
    expect(el.getAttribute('data-hosp-state')).toBe('cached');
    expect(el.shadowRoot.querySelector('h2').textContent).toBe('Relaxing Villa near the sea');
  });

  it('shows a short message to a first-time visitor when the Worker is down', async () => {
    stubFetch({ '/api/properties/p1': new TypeError('Failed to fetch') });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = widget('data-hosp="description" data-hosp-data="property" data-hosp-modules=""');
    await W.scan();
    expect(el.getAttribute('data-hosp-state')).toBe('unavailable');
    expect(el.shadowRoot.textContent).toContain("can’t be shown right now");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('could not load "description"'));
  });

  it('refuses a widget type that is not a file name', async () => {
    stubFetch({ '/api/properties/p1': property });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = widget('data-hosp="../../evil" data-hosp-data="property" data-hosp-modules=""');
    await W.scan();
    expect(el.getAttribute('data-hosp-state')).toBe('unavailable');
  });
});
