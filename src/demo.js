// GET /demo: a page with sample widgets pointing at this Worker, for testing
// in an online iframe tester or just a browser tab.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const BASE = `<style>
:host{--a:#0f766e;--t:#1c1917;--m:#78716c;--l:#e7e5e4;--s:#f0fdfa}
*{box-sizing:border-box}
.w{font:16px/1.55 ui-sans-serif,system-ui,-apple-system,sans-serif;color:var(--t);background:#fff;border:1px solid var(--l);border-radius:16px;padding:24px}
h2{font-size:1.35rem;margin:0 0 .6em;line-height:1.2}
p{margin:0 0 .8em}.m{color:var(--m)}.pre{white-space:pre-line}
ul{margin:0;padding:0;list-style:none}
.tag{display:inline-block;font:600 11px/1 system-ui;letter-spacing:.06em;text-transform:uppercase;padding:5px 8px;border-radius:99px;background:var(--s);color:var(--a);margin-bottom:12px}
</style>`;

const SAMPLE = '{#sample_data}<span class="tag">Sample data</span>{/sample_data}';

const WIDGETS = [
  ['Description', `<div class="w">${SAMPLE}<h2>{property_name}</h2><p class="m">{location}</p><p><b>{summary}</b></p><p class="pre">{description}</p></div>`],
  ['Key facts', `<style>.f{display:flex;flex-wrap:wrap;gap:8px}.f li{background:var(--s);padding:8px 14px;border-radius:99px;font-weight:600}</style><div class="w">${SAMPLE}<ul class="f"><li>{guests_label}</li><li>{bedrooms_label}</li><li>{beds_label}</li><li>{bathrooms_label}</li><li>Check-in {check_in_formatted}</li><li>Check-out {check_out_formatted}</li></ul></div>`],
  ['Photo gallery', `<style>.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}.g img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px;display:block}</style><div class="w">${SAMPLE}<div class="g" data-hosp-lightbox>{#photos}<img src="{thumbnail_url}" alt="{alt}" data-index="{index}">{/photos}</div></div>`],
  ['Amenities', `<style>.am{columns:2 180px}.am li{padding:4px 0}.am li::before{content:"✓ ";color:var(--a);font-weight:700}</style><div class="w">${SAMPLE}<h2>What this place offers</h2><ul class="am">{#amenities}<li>{.}</li>{/amenities}</ul>{#amenities_more}<p class="m">+ {amenities_more} more</p>{/amenities_more}</div>`],
  ['Price from', `<div class="w">${SAMPLE}<p style="font-size:1.1rem;margin:0">From <b style="font-size:2rem">{price_from_formatted}</b> / night</p><p class="m" style="margin:0">{min_stay_label}</p></div>`],
  ['Availability calendar', `<style>table{width:100%;border-spacing:3px;table-layout:fixed}th{font-size:.7rem;color:var(--m)}td{text-align:center;padding:8px 0;border-radius:6px;font-size:.9rem}.available{background:var(--s);font-weight:600}.booked{color:var(--m);text-decoration:line-through}.past,.unknown{color:var(--l)}.nav{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}button{border:1px solid var(--l);background:#fff;border-radius:99px;width:34px;height:34px;cursor:pointer}</style><div class="w" data-hosp-pager>${SAMPLE}<div class="nav"><button data-hosp-prev aria-label="Previous">‹</button><b data-hosp-page-label></b><button data-hosp-next aria-label="Next">›</button></div>{#months}<div data-hosp-page><h2 style="text-align:center;font-size:1rem">{label}</h2><table><tr><!--{#weekdays}--><th>{label}</th><!--{/weekdays}--></tr><!--{#weeks}--><tr><!--{#days}--><td class="{state}">{day}</td><!--{/days}--></tr><!--{/weeks}--></table></div>{/months}<p class="m" style="margin:8px 0 0;font-size:.85rem">Updated hourly</p></div>`],
  ['Reviews', `<style>.r{display:grid;gap:12px}.r li{border:1px solid var(--l);border-radius:12px;padding:14px}.st{color:var(--a)}</style><div class="w">${SAMPLE}<h2>★ {rating_average_formatted} · {review_count_label}</h2><ul class="r">{#reviews}<li><div class="st">{stars}</div><p>{text}</p><p class="m" style="margin:0"><b>{guest_name}</b> · {date_formatted}</p></li>{/reviews}</ul></div>`],
  ['Local guide', `<div class="w">${SAMPLE}<h2>Local guide</h2>{#guide}<h3>{title}</h3><ul>{#items}<li><p>{#title}<b>{title}:</b> {/title}{body}</p></li>{/items}</ul>{/guide}{^guide}<p class="m">No public topics yet. Set PUBLIC_GUIDE_TOPICS on the Worker.</p>{/guide}</div>`],
  ['Meet your host', `<style>.h{display:flex;gap:16px;align-items:center}.h img{width:72px;height:72px;border-radius:50%;object-fit:cover}</style><div class="w">${SAMPLE}<div class="h">{#host_picture}<img src="{host_picture}" alt="">{/host_picture}<div><p class="m" style="margin:0">Your host</p><h2 style="margin:0">{host_name}</h2></div></div></div>`],
  ['Property list', `<style>.pl{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px}.pl img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px}</style><div class="w"><div class="pl">{#properties}<div><img src="{photo}" alt=""><b>{property_name}</b><p class="m">{city} · {guests_label}{#price_from_formatted} · from {price_from_formatted}{/price_from_formatted}</p></div>{/properties}</div></div>`],
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
    ? WIDGETS.map(([name, tpl], i) => {
        const id = `demo-${i}`;
        return `<section><h2 class="label">${esc(name)}</h2><template id="${id}">${BASE}${tpl}</template>
<div data-hosp-template="${id}" data-hosp-worker="${esc(origin)}" data-hosp-property="${esc(chosen.id)}"${name === 'Amenities' ? ' data-hosp-amenities-limit="12"' : ''}${name === 'Reviews' ? ' data-hosp-reviews-limit="3"' : ''}${name === 'Availability calendar' ? ' data-hosp-months="6"' : ''}></div></section>`;
      }).join('\n')
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
<p style="margin:0;color:#78716c">Every widget below loads from <code>${esc(origin)}</code> and renders with <code>widget.js</code>, exactly as on a website.</p>
${properties.length > 1 ? `<nav>${properties.map((p) => `<a href="?property=${encodeURIComponent(p.id)}"${p === chosen ? ' aria-current="page"' : ''}>${esc(p.property_name)}</a>`).join('')}</nav>` : ''}
</header>
<main>
${blocks}
</main>
<script src="${esc(widgetSrc)}" defer></script>
</body></html>`;
}
