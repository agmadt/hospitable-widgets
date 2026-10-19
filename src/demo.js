// GET /demo: a page with sample widgets pointing at this Worker, for testing
// in an online iframe tester or just a browser tab.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Each one is the short snippet the builder writes: a starter template by name.
const WIDGETS = [
  ['description', 'Description'],
  ['key-facts', 'Key facts'],
  ['gallery', 'Photo gallery'],
  ['amenities', 'Amenities', 'data-hosp-amenities-limit="10"'],
  ['price-from', 'Price from', 'data-hosp-options="button_text="'],
  ['calendar', 'Availability calendar', 'data-hosp-months="6"'],
  ['reviews', 'Reviews', 'data-hosp-min-rating="4" data-hosp-reviews-limit="9"'],
  ['rating-summary', 'Rating summary'],
  ['house-rules', 'House rules'],
  ['sleeping', 'Sleeping arrangements'],
  ['space-area', 'The space and the area'],
  ['policies-fees', 'Policies and fees'],
  ['local-guide', 'Local guide'],
  ['also-listed-on', 'Also listed on'],
  ['meet-host', 'Meet your host'],
  ['property-list', 'Property list'],
];

export async function demoPage(url, env, makeListings) {
  const origin = url.origin;
  const dummy = String(env.HOSPITABLE_PAT || '').trim() === 'dummy';
  let properties = [];
  let problem = null;
  try {
    properties = (await makeListings(env).list({ widget: false })).properties;
  } catch (err) {
    problem = err.message;
  }
  const chosen = properties.find((p) => p.id === url.searchParams.get('property')) || properties[0];
  const widgetSrc = String(env.WIDGET_URL || '').trim() || '/widget.js';

  const blocks = chosen
    ? WIDGETS.map(([type, name, attrs]) => `<section><h2 class="label">${esc(name)}</h2>
<div data-hosp="${type}" data-hosp-worker="${esc(origin)}" data-hosp-property="${esc(chosen.id)}"${attrs ? ' ' + attrs : ''}></div></section>`).join('\n')
    : `<p class="empty">${esc(problem || 'No listed properties yet.')}</p>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hospitable Widgets demo</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23134e4a'/%3E%3C/svg%3E">
<style>
body{margin:0;background:#fafaf9;color:#1c1917;font:15px/1.5 ui-sans-serif,system-ui,-apple-system,sans-serif}
header{padding:28px 16px 8px;max-width:880px;margin:0 auto}
h1{font-size:1.5rem;margin:0 0 4px}
.pill{display:inline-block;font:600 12px/1 system-ui;padding:6px 10px;border-radius:99px;background:${dummy ? '#fef3c7;color:#92400e' : '#dcfce7;color:#166534'};vertical-align:middle;margin-left:8px}
nav{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 0}
nav a{padding:6px 12px;border-radius:99px;border:1px solid #e7e5e4;color:inherit;text-decoration:none;background:#fff}
nav a[aria-current]{background:#1c1917;color:#fff;border-color:#1c1917}
main{max-width:880px;margin:0 auto;padding:8px 16px 48px;display:grid;gap:28px}
.label{font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;color:#78716c;margin:0 0 8px}
.empty{padding:24px;background:#fff;border-radius:12px;border:1px solid #e7e5e4}
code{background:#f5f5f4;padding:2px 6px;border-radius:6px}
</style></head>
<body>
<header>
<h1>Hospitable Widgets demo${dummy ? '<span class="pill">Sample data</span>' : '<span class="pill">Live data</span>'}</h1>
<p style="margin:0;color:#78716c">Every widget below is a one-line snippet: it loads its data from <code>${esc(origin)}</code> and its template and code from next to <code>widget.js</code>, exactly as on a website.</p>
${properties.length > 1 ? `<nav>${properties.map((p) => `<a href="?property=${encodeURIComponent(p.id)}"${p === chosen ? ' aria-current="page"' : ''}>${esc(p.property_name)}</a>`).join('')}</nav>` : ''}
</header>
<main>
${blocks}
</main>
<script src="${esc(widgetSrc)}" defer></script>
</body></html>`;
}
