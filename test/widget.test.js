// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadWidget, serveModuleScripts, widgetSource, moduleSource, MODULES } from './helpers/load-widget.js';

let W;

beforeEach(async () => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  localStorage.clear();
  W = await loadWidget();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('template syntax', () => {
  it('inserts fields and escapes HTML', () => {
    expect(W.render('<h3>{property_name}</h3>', { property_name: '<b>Villa</b> & "Sea"' }))
      .toBe('<h3>&lt;b&gt;Villa&lt;/b&gt; &amp; &quot;Sea&quot;</h3>');
  });

  it('renders unknown fields as empty, never as raw braces', () => {
    expect(W.render('a{nope}b{#nothing}x{/nothing}c', {})).toBe('abc');
  });

  it('repeats lists with {.} and item fields', () => {
    expect(W.render('<ul>{#amenities}<li>{.}</li>{/amenities}</ul>', { amenities: ['Wi-Fi', 'Pool'] }))
      .toBe('<ul><li>Wi-Fi</li><li>Pool</li></ul>');
    expect(W.render('{#photos}<img src="{url}" alt="{caption}">{/photos}', { photos: [{ url: 'https://x/1.jpg', caption: 'Pool' }] }))
      .toBe('<img src="https://x/1.jpg" alt="Pool">');
  });

  it('shows flag sections only when true or not empty, and inverts with ^', () => {
    const t = '{#pets_allowed}Pets welcome{/pets_allowed}{^pets_allowed}No pets{/pets_allowed}';
    expect(W.render(t, { pets_allowed: true })).toBe('Pets welcome');
    expect(W.render(t, { pets_allowed: false })).toBe('No pets');
    expect(W.render(t, {})).toBe('No pets');
    expect(W.render('{#list}x{/list}{^list}empty{/list}', { list: [] })).toBe('empty');
  });

  it('reads parent fields inside a list, dotted paths and loop meta', () => {
    const data = { currency: 'EUR', rooms: [{ name: 'A', bed: { type: 'queen' } }, { name: 'B', bed: { type: 'twin' } }] };
    expect(W.render('{#rooms}{_number}.{name}:{bed.type}:{currency}{^_last},{/_last}{/rooms}', data))
      .toBe('1.A:queen:EUR,2.B:twin:EUR');
  });

  it('leaves CSS braces alone', () => {
    const css = '<style>.card { font-family: Georgia, serif; } h3{color:#2e7d32}</style>';
    expect(W.render(css, {})).toBe(css);
  });

  it('accepts tags wrapped in HTML comments (for tables)', () => {
    expect(W.render('<table><!--{#fees}--><tr><td>{name}</td></tr><!--{/fees}--></table>', { fees: [{ name: 'Cleaning' }] }))
      .toBe('<table><tr><td>Cleaning</td></tr></table>');
  });

  it('uses list.0 as a "has items" flag without repeating', () => {
    expect(W.render('{#fees.0}<ul>{#fees}<li>{name}</li>{/fees}</ul>{/fees.0}', { fees: [{ name: 'A' }, { name: 'B' }] }))
      .toBe('<ul><li>A</li><li>B</li></ul>');
    expect(W.render('{#fees.0}<ul></ul>{/fees.0}', { fees: [] })).toBe('');
  });

  it('joins plain arrays when used as a field', () => {
    expect(W.render('{amenities}', { amenities: ['Wi-Fi', 'Pool'] })).toBe('Wi-Fi, Pool');
  });
});

describe('analyze', () => {
  it('finds the data sets a template needs', () => {
    expect(W.analyze('<h3>{property_name}</h3>').datasets).toEqual(['property']);
    expect(W.analyze('{price_from_formatted}').datasets.sort()).toEqual(['calendar', 'property']);
    expect(W.analyze('{rating_average} {#reviews}{text}{/reviews}').datasets.sort()).toEqual(['property', 'reviews']);
    expect(W.analyze('{host_name}').datasets).toEqual(['host']);
  });

  it('treats fields inside a list as item fields', () => {
    // A property card's price_from must not pull in a calendar.
    expect(W.analyze('{#properties}{property_name} {price_from_formatted}{/properties}').datasets).toEqual(['properties']);
  });
});

describe('derived fields', () => {
  it('formats key facts', () => {
    const d = W.derive({ max_guests: 6, bedrooms: 0, beds: 1, bathrooms: 1.5, check_in: '15:00', property_type: 'villa', room_type: 'entire_home', city: 'Ubud', country: 'Indonesia' }, { locale: 'en-US' });
    expect(d.guests_label).toBe('6 guests');
    expect(d.bedrooms_label).toBe('Studio');
    expect(d.beds_label).toBe('1 bed');
    expect(d.bathrooms_label).toBe('1.5 baths');
    expect(d.check_in_formatted).toBe('3:00 PM');
    expect(d.property_type_label).toBe('Villa');
    expect(d.room_type_label).toBe('Entire home');
    expect(d.location).toBe('Ubud, Indonesia');
  });

  it('limits amenities and counts the rest', () => {
    const d = W.derive({ amenities: ['a', 'b', 'c', 'd'] }, { amenitiesLimit: '2' });
    expect(d.amenities).toEqual(['a', 'b']);
    expect(d.amenities_more).toBe(2);
    expect(d.amenity_count).toBe(4);
  });

  it('keeps the full amenity list next to the shortened one', () => {
    const d = W.derive({ amenities: ['a', 'b', 'c'] }, { amenitiesLimit: '1' });
    expect(d.amenities).toEqual(['a']);
    expect(d.amenities_all).toEqual(['a', 'b', 'c']);
    expect(d.amenities_more).toBe(2);
  });

  it("renames guide topics with the host's own names", () => {
    const guide = [{ title: 'Local attractions', items: [] }, { title: 'Where to eat', items: [] }];
    const d = W.derive({ guide }, { guideTitles: JSON.stringify({ 'Local attractions': 'Things to do' }) });
    expect(d.guide.map((t) => t.title)).toEqual(['Things to do', 'Where to eat']);
    expect(guide[0].title).toBe('Local attractions'); // the data itself is untouched
    expect(W.derive({ guide }, { guideTitles: 'not json' }).guide.map((t) => t.title)).toEqual(['Local attractions', 'Where to eat']);
  });

  it('builds house rules from booleans', () => {
    const d = W.derive({ pets_allowed: true, smoking_allowed: false, events_allowed: null });
    expect(d.rules).toEqual([
      { rule: 'Pets', allowed: true, text: 'Pets allowed' },
      { rule: 'Smoking', allowed: false, text: 'No smoking' },
    ]);
  });

  it('computes price from, min stay and month grids from the calendar', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 18, 12));
    const calendar = [
      { date: '2026-10-17', available: true, price: 50, min_stay: 1 },
      { date: '2026-10-18', available: false, price: 200, min_stay: 2 },
      { date: '2026-10-19', available: true, price: 180, min_stay: 3 },
      { date: '2026-10-20', available: true, price: 150, min_stay: 2 },
    ];
    const d = W.derive({ calendar, currency: 'USD' }, { locale: 'en-US', months: '2', weekStart: 'monday' });
    expect(d.price_from).toBe(150); // the past $50 night does not count
    expect(d.price_from_formatted).toBe('$150');
    expect(d.min_stay).toBe(2);
    expect(d.min_stay_label).toBe('2 nights minimum');
    expect(d.next_available).toBe('October 19');
    expect(d.months).toHaveLength(2);
    expect(d.months[0].label).toBe('October 2026');
    expect(d.months[0].weekdays[0].label).toBe('Mon');
    const cells = d.months[0].weeks.flatMap((w) => w.days);
    expect(cells.filter((c) => c.blank)).toHaveLength(3 + 1); // Oct 1 2026 is a Thursday; Oct ends on a Saturday
    const byDate = Object.fromEntries(cells.filter((c) => c.date).map((c) => [c.date, c]));
    expect(byDate['2026-10-17'].state).toBe('past');
    expect(byDate['2026-10-18']).toMatchObject({ state: 'booked', today: true });
    expect(byDate['2026-10-19']).toMatchObject({ state: 'available', price_formatted: '$180' });
    expect(byDate['2026-10-25'].state).toBe('unknown');
  });

  it('applies review display choices from the snippet', () => {
    const reviews = [
      { id: 'r1', rating: 5, text: 'Lovely', date: '2026-01-02', guest_name: 'ana' },
      { id: 'r2', rating: 3, text: 'Okay', date: '2026-05-02', guest_name: 'Ben' },
      { id: 'r3', rating: 4, text: '', date: '2026-06-02', guest_name: 'Cy' },
      { id: 'r4', rating: 4, text: 'Nice', date: '2026-07-02', guest_name: 'Di', platform: 'airbnb' },
    ];
    const newest = W.derive({ reviews, rating_average: 4.9, review_count: 128 }, { minRating: '4', locale: 'en-US' });
    expect(newest.reviews.map((r) => r.id)).toEqual(['r4', 'r1']);
    expect(newest.reviews[0]).toMatchObject({ stars: '★★★★☆', date_formatted: 'July 2026', platform_label: 'Airbnb' });
    expect(newest.reviews[1].guest_initial).toBe('A');
    expect(newest.rating_average_formatted).toBe('4.9');
    expect(newest.review_count_label).toBe('128 reviews');
    const picked = W.derive({ reviews }, { reviewIds: 'r2, r1' });
    expect(picked.reviews.map((r) => r.id)).toEqual(['r2', 'r1']);
    expect(W.derive({ reviews }, { reviewsLimit: '1' }).reviews).toHaveLength(1);
  });

  it('formats money with the listing currency', () => {
    const d = W.derive({ currency: 'EUR', fees: [{ name: 'Cleaning', amount: 60 }, { name: 'Service', amount: 3, type: 'percent' }] }, { locale: 'en-US' });
    expect(d.fees.map((f) => f.formatted)).toEqual(['€60', '3%']);
  });
});

describe('rendering into the page', () => {
  function snippet({ template, fallback, attrs = '' }) {
    document.body.innerHTML =
      `<template id="t1">${template}</template>` +
      (fallback ? `<script type="application/json" id="t1-fallback">${JSON.stringify(fallback)}</script>` : '') +
      `<div id="w" data-hosp-template="t1" data-hosp-worker="https://w.example.workers.dev/" data-hosp-property="p1" ${attrs}></div>`;
    return document.getElementById('w');
  }

  function stubFetch(routes) {
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      calls.push(String(url));
      const path = new URL(url).pathname;
      if (!(path in routes)) return new Response('{}', { status: 404 });
      const body = routes[path];
      if (body instanceof Error) throw body;
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    return calls;
  }

  it('makes one request per property, shared by its widgets, and renders in a shadow root', async () => {
    const calls = stubFetch({
      '/api/properties/p1': { property_name: 'Relaxing Villa near the sea', amenities: ['Wi-Fi'], reviews: [], rating_average: 4.8, review_count: 9 },
    });
    const el = snippet({ template: '<h3>{property_name}</h3><p>{rating_average_formatted}</p>' });
    document.body.insertAdjacentHTML('beforeend', '<div id="w2" data-hosp-template="t1" data-hosp-worker="https://w.example.workers.dev" data-hosp-property="p1"></div>');
    await W.scan();
    expect(el.shadowRoot.querySelector('h3').textContent).toBe('Relaxing Villa near the sea');
    expect(el.shadowRoot.querySelector('p').textContent).toBe('4.8');
    expect(document.getElementById('w2').shadowRoot.querySelector('h3').textContent).toBe('Relaxing Villa near the sea');
    expect(el.getAttribute('data-hosp-state')).toBe('live');
    expect(calls).toEqual(['https://w.example.workers.dev/api/properties/p1?include=calendar,guide,host,reviews']);
  });

  it('asks for the same URL whatever a widget needs', async () => {
    const calls = stubFetch({ '/api/properties/p1': { property_name: 'Villa', reviews: [], calendar: [], host_name: 'Rina' } });
    document.body.innerHTML = '<template id="a">{property_name}</template><template id="b">{#reviews}{text}{/reviews}</template><template id="c">{host_name}</template>' +
      ['a" data-hosp-data="property', 'b" data-hosp-data="property,reviews', 'c" data-hosp-data="host']
        .map((t) => `<div data-hosp-template="${t}" data-hosp-modules="" data-hosp-worker="https://w.example.workers.dev" data-hosp-property="p1"></div>`).join('');
    await W.scan();
    expect(calls).toEqual(['https://w.example.workers.dev/api/properties/p1?include=calendar,guide,host,reviews']);
    // Without a property, a host-only widget asks for the host alone.
    expect(await W.fetchData('https://w.example.workers.dev', null, ['host']).catch(() => null)).toBeNull();
    expect(calls.at(-1)).toBe('https://w.example.workers.dev/api/host');
  });

  it("falls back for a widget whose data set the Worker couldn't load, and keeps the others live", async () => {
    stubFetch({ '/api/properties/p1': { property_name: 'Villa', missing: ['calendar'] } });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    document.body.innerHTML = '<template id="a">{property_name}</template><template id="b">{#calendar}x{/calendar}</template>' +
      '<div id="wa" data-hosp-template="a" data-hosp-data="property" data-hosp-modules="" data-hosp-worker="https://w.example.workers.dev" data-hosp-property="p1"></div>' +
      '<div id="wb" data-hosp-template="b" data-hosp-data="property,calendar" data-hosp-modules="" data-hosp-worker="https://w.example.workers.dev" data-hosp-property="p1"></div>';
    await W.scan();
    expect(document.getElementById('wa').getAttribute('data-hosp-state')).toBe('live');
    expect(document.getElementById('wb').getAttribute('data-hosp-state')).toBe('unavailable');
    // An incomplete answer is not kept as the visitor's copy.
    expect(Object.keys(localStorage).filter((k) => k.startsWith('hosp:'))).toEqual([]);
  });

  it('renders the fallback snapshot when the Worker is unreachable', async () => {
    stubFetch({ '/api/properties/p1': new TypeError('Failed to fetch') });
    const el = snippet({ template: '<h3>{property_name}</h3>', fallback: { property_name: 'Villa (snapshot)' } });
    await W.scan();
    expect(el.shadowRoot.querySelector('h3').textContent).toBe('Villa (snapshot)');
    expect(el.getAttribute('data-hosp-state')).toBe('snapshot');
  });

  it('renders the fallback when the daily limit is hit (non-JSON error page)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Error 1027</html>', { status: 429 })));
    const el = snippet({ template: '<h3>{property_name}</h3>', fallback: { property_name: 'Villa (snapshot)' } });
    await W.scan();
    expect(el.shadowRoot.querySelector('h3').textContent).toBe('Villa (snapshot)');
  });

  it('shows a short message and warns when there is no fallback', async () => {
    stubFetch({});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = snippet({ template: '<h3>{property_name}</h3>' });
    await W.scan();
    expect(el.getAttribute('data-hosp-state')).toBe('unavailable');
    expect(el.shadowRoot.querySelector('h3')).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('could not load "t1"'));
  });

  it('keeps unsafe links out of the page', async () => {
    stubFetch({
      '/api/properties/p1': {
        photos: [{ url: 'javascript:alert(1)' }, { url: 'http://insecure.example/a.jpg' }, { url: 'data:text/html,x' }, { url: 'https://ok.example/b.jpg' }],
        link: 'javascript:alert(2)',
        note: 'Check-in: from 3 pm',
        sneaky: ['javascript: alert(3)', 'java\tscript:alert(4)', ' javascript:alert(5)', 'JaVaScRiPt:alert(6)', '\njavascript:alert(7)', 'vbscript:x', 'data: text/html,x'],
      },
    });
    const el = snippet({ template: '{#photos}<img src="{url}">{/photos}<a href="{link}">x</a><p>{note}</p>{#sneaky}<a class="s" href="{.}">s</a>{/sneaky}<script>window.pwned=1</script>' });
    await W.scan();
    const imgs = [...el.shadowRoot.querySelectorAll('img')];
    // Refused links come out empty, and empty images are hidden by the base style.
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual(['', '', '', 'https://ok.example/b.jpg']);
    expect(el.shadowRoot.querySelector('style').textContent).toContain('img[src=""]');
    expect(el.shadowRoot.querySelector('a').getAttribute('href')).toBe('');
    expect(el.shadowRoot.querySelector('p').textContent).toBe('Check-in: from 3 pm'); // ordinary text with a colon stays
    // Spaces, tabs, line breaks and odd case don't sneak a javascript: link through.
    expect([...el.shadowRoot.querySelectorAll('a.s')].map((a) => a.getAttribute('href'))).toEqual(['', '', '', '', '', '', '']);
    expect(window.pwned).toBeUndefined();
  });

  it('passes display choices from data-hosp-* attributes', async () => {
    stubFetch({ '/api/properties/p1': { amenities: ['a', 'b', 'c'] } });
    const el = snippet({ template: '{#amenities}<i>{.}</i>{/amenities}<b>+{amenities_more}</b>', attrs: 'data-hosp-amenities-limit="2"' });
    await W.scan();
    expect(el.shadowRoot.querySelectorAll('i')).toHaveLength(2);
    expect(el.shadowRoot.querySelector('b').textContent).toBe('+1');
  });

  it('mounts widgets added after load', async () => {
    stubFetch({ '/api/host': { host_name: 'Rina' } });
    document.body.insertAdjacentHTML('beforeend', '<template id="h">{host_name}</template><div id="late" data-hosp-template="h" data-hosp-worker="https://w.example.workers.dev"></div>');
    await W.scan();
    expect(document.getElementById('late').shadowRoot.textContent).toContain('Rina');
  });

  it('opens and closes the photo viewer', async () => {
    stubFetch({ '/api/properties/p1': { photos: [{ url: 'https://x/1.jpg', caption: 'One' }, { url: 'https://x/2.jpg', caption: 'Two' }] } });
    const el = snippet({ template: '<div data-hosp-lightbox>{#photos}<img src="{url}" data-index="{index}">{/photos}</div>' });
    await W.scan();
    el.shadowRoot.querySelectorAll('img')[1].click();
    const lb = el.shadowRoot.querySelector('.hosp-lb');
    expect(lb).not.toBeNull();
    expect(lb.querySelector('.hosp-lb-cap').textContent).toBe('Two');
    expect(lb.querySelector('.hosp-lb-count').textContent).toBe('2 / 2');
    // Arrows sit on the photo's sides, and the filmstrip marks the current photo.
    expect(lb.querySelector('.hosp-lb-stage .hosp-lb-prev')).not.toBeNull();
    expect(lb.querySelectorAll('.hosp-lb-strip button')[1].getAttribute('aria-current')).toBe('true');
    lb.querySelector('.hosp-lb-next').click();
    expect(lb.querySelector('.hosp-lb-cap').textContent).toBe('One');
    expect(lb.querySelectorAll('.hosp-lb-strip button')[0].getAttribute('aria-current')).toBe('true');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(el.shadowRoot.querySelector('.hosp-lb')).toBeNull();
  });

  it('pages through pages with prev and next buttons', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    W.renderTo(el, '<div data-hosp-pager><button data-hosp-prev>p</button><span data-hosp-page-label></span><button data-hosp-next>n</button>{#months}<section data-hosp-page>{label}</section>{/months}</div>',
      { months: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] }, {});
    const root = el.shadowRoot;
    const visible = () => [...root.querySelectorAll('section')].filter((s) => !s.hidden).map((s) => s.textContent);
    expect(visible()).toEqual(['A']);
    expect(root.querySelector('[data-hosp-prev]').disabled).toBe(true);
    root.querySelector('[data-hosp-next]').click();
    root.querySelector('[data-hosp-next]').click();
    expect(visible()).toEqual(['C']);
    expect(root.querySelector('[data-hosp-page-label]').textContent).toBe('3 / 3');
    expect(root.querySelector('[data-hosp-next]').disabled).toBe(true);
  });

  it('isolates the widget CSS from the page', async () => {
    stubFetch({ '/api/properties/p1': { property_name: 'X' } });
    const el = snippet({ template: '<style>h3{color:red}</style><h3>{property_name}</h3>' });
    await W.scan();
    expect(document.querySelectorAll('style')).toHaveLength(0);
    expect(el.shadowRoot.querySelectorAll('style').length).toBeGreaterThan(0);
  });
});

describe('size', () => {
  it('keeps the core small; everything else loads only when used', async () => {
    const { gzipSync } = await import('node:zlib');
    const { minify } = await import('terser');
    // As jsDelivr serves them: minified, then compressed.
    const size = async (src) => gzipSync((await minify(src)).code, { level: 9 }).length;
    expect(await size(widgetSource)).toBeLessThan(6.5 * 1024);
    // The photo viewer, with its filmstrip, is the biggest module.
    for (const m of MODULES) expect(await size(moduleSource[m]), m).toBeLessThan((m === 'lightbox' ? 3 : 2.5) * 1024);
  });
});

describe('release', () => {
  it('states the same version in widget.js, its header and package.json', async () => {
    const { readFileSync } = await import('node:fs');
    const pkg = JSON.parse(readFileSync(`${process.cwd()}/package.json`, 'utf8'));
    // Modules load from @<this version>, which must be a released git tag.
    expect(W.version).toBe(pkg.version);
    expect(widgetSource).toContain(`Hospitable Listing Widgets v${pkg.version} |`);
  });
});

describe('modules', () => {
  it('plans only the modules a template uses', () => {
    expect(W.plan('<h2>{property_name}</h2>')).toEqual([]);
    expect(W.plan('<div data-hosp-lightbox>{#photos}<img src="{url}">{/photos}</div>')).toEqual(['lightbox']);
    expect(W.plan('<div data-hosp-pager>{#months}{label}{/months}</div>')).toEqual(['calendar', 'pager']);
    expect(W.plan('{rating_average} {#reviews}{text}{/reviews}')).toEqual(['reviews']);
    expect(W.plan('<p>Static text only</p>')).toEqual([]);
  });

  it('loads modules from next to widget.js, pinned to its exact version', async () => {
    document.head.innerHTML = '<script src="https://cdn.jsdelivr.net/gh/rina/hospitable-widgets@1/widget/widget.min.js"></script>';
    const H = await loadWidget({ modules: [] });
    expect(H.base).toEqual({ dir: `https://cdn.jsdelivr.net/gh/rina/hospitable-widgets@${H.version}/widget/`, ext: '.min.js' });
    const ready = H.need(['calendar']);
    expect(serveModuleScripts()).toEqual([`https://cdn.jsdelivr.net/gh/rina/hospitable-widgets@${H.version}/widget/modules/calendar.min.js`]);
    await ready;
    expect(H.module('calendar')).toBeTruthy();
  });

  it('loads code and data side by side, then renders', async () => {
    document.head.innerHTML = '<script src="https://w.example.workers.dev/widget.js"></script>';
    const H = await loadWidget({ modules: [] });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ photos: [{ url: 'https://x/1.jpg' }] }))));
    document.body.innerHTML = '<template id="t"><div data-hosp-lightbox>{#photos}<img src="{url}">{/photos}</div></template>' +
      '<div id="w" data-hosp-template="t" data-hosp-worker="https://w.example.workers.dev" data-hosp-property="p1" data-hosp-data="property" data-hosp-modules="lightbox"></div>';
    const done = H.scan();
    await Promise.resolve();
    // Neither waited for the other: the data request and the module are both on their way.
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(serveModuleScripts()).toEqual(['https://w.example.workers.dev/modules/lightbox.js']);
    await done;
    expect(document.getElementById('w').shadowRoot.querySelector('img').style.cursor).toBe('zoom-in');
  });

  it('works out what a hand-written snippet needs', async () => {
    const H = await loadWidget({ modules: [] });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ reviews: [{ id: 'a', rating: 5, text: 'Great', date: '2026-01-01' }], review_count: 1 }))));
    document.body.innerHTML = '<template id="t"><p>{review_count_label}{#reviews}<i>{stars}</i>{/reviews}</p></template>' +
      '<div id="w" data-hosp-template="t" data-hosp-worker="https://w.example.workers.dev" data-hosp-property="p1"></div>';
    const done = H.scan();
    expect(serveModuleScripts()).toEqual(['http://localhost:3000/modules/analyze.js']);
    await new Promise((r) => setTimeout(r, 0));
    expect(serveModuleScripts()).toEqual(['http://localhost:3000/modules/reviews.js']);
    await done;
    expect(fetch).toHaveBeenCalledWith('https://w.example.workers.dev/api/properties/p1?include=calendar,guide,host,reviews', expect.anything());
    expect(document.getElementById('w').shadowRoot.querySelector('p').textContent).toBe('1 review★★★★★');
  });

  it('re-renders once a missing module arrives', async () => {
    const H = await loadWidget({ modules: ['analyze'] });
    const el = document.createElement('div');
    document.body.appendChild(el);
    H.renderTo(el, '<b>{price_from_formatted}</b>', { currency: 'USD', calendar: [{ date: '2999-01-01', available: true, price: 99 }] }, {});
    expect(el.shadowRoot.querySelector('b').textContent).toBe('');
    serveModuleScripts();
    await H.need(['calendar']);
    await new Promise((r) => setTimeout(r, 0));
    expect(el.shadowRoot.querySelector('b').textContent).toBe('$99');
  });

  it('still renders raw fields when a module cannot load', async () => {
    const H = await loadWidget({ modules: [] });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ property_name: 'Villa', calendar: [] }))));
    document.body.innerHTML = '<template id="t"><h3>{property_name}</h3><p>{price_from_formatted}</p></template>' +
      '<div id="w" data-hosp-template="t" data-hosp-worker="https://w.example.workers.dev" data-hosp-property="p1" data-hosp-data="property,calendar" data-hosp-modules="calendar"></div>';
    const done = H.scan();
    await new Promise((r) => setTimeout(r, 0));
    document.querySelector('script[src*="modules/calendar"]').onerror();
    await done;
    expect(document.getElementById('w').shadowRoot.querySelector('h3').textContent).toBe('Villa');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('could not load module calendar'));
  });
});

describe('lazy mounting', () => {
  it('waits until a widget nears the viewport', async () => {
    const observed = [];
    let callback;
    window.IntersectionObserver = class {
      constructor(cb, options) {
        callback = cb;
        this.options = options;
      }
      observe(el) { observed.push(el); }
      unobserve() {}
    };
    const H = await loadWidget({ lazy: true });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ property_name: 'Villa' }))));
    document.body.innerHTML = '<template id="t"><h3>{property_name}</h3></template>' +
      '<div id="lazy" data-hosp-template="t" data-hosp-worker="https://w.example.workers.dev" data-hosp-property="p1"></div>' +
      '<div id="eager" data-hosp-template="t" data-hosp-worker="https://w.example.workers.dev" data-hosp-property="p2" data-hosp-eager></div>';
    const done = H.scan();
    await new Promise((r) => setTimeout(r, 0));
    expect(observed.map((e) => e.id)).toEqual(['lazy']);
    expect(fetch).toHaveBeenCalledTimes(1); // only the eager one
    callback([{ isIntersecting: true, target: observed[0] }]);
    await done;
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(document.getElementById('lazy').shadowRoot.querySelector('h3').textContent).toBe('Villa');
  });
});
