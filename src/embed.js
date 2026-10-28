// /embed/<type>: one widget on a page of its own, for websites that show it in
// an iframe. Widgets for signed-in guests only work this way, so their token
// stays with this Worker; any other widget can be embedded like this too, for
// site builders that only accept a link.
//
// The page names a starter template and nothing else: the query becomes the
// snippet's data-hosp-* attributes, escaped, and no HTML from the URL reaches
// the page. Scripts run only from widget.js's own address, and pages for
// signed-in guests may only be framed by the websites in GUEST_SITES.

import { guestSettings } from './guest.js';

export const DEFAULT_WIDGET_URL = 'https://cdn.jsdelivr.net/gh/agmadt/hospitable-widgets@1/widget/widget.min.js';

/** Starter templates that show a signed-in guest's stay; a test keeps this in step with widget/templates. */
export const GUEST_WIDGETS = ['guest-login', 'stay-summary', 'door-code', 'wifi', 'getting-there', 'house-manual', 'payment', 'guest-guide'];

// Attributes a query may not set: they choose the template, the Worker or how it mounts.
const RESERVED = new Set(['template', 'worker', 'fallback', 'manual', 'eager', 'lang']);

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** WIDGET_URL: where the page loads widget.js from. https, or a local address while developing. */
export function widgetUrl(env) {
  const v = String(env.WIDGET_URL || '').trim();
  return /^https:\/\/[^\s"'<>]+$/.test(v) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/[^\s"'<>]*$/.test(v) ? v : DEFAULT_WIDGET_URL;
}

function nonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

// Tells the page around the iframe how tall the widget is, so it can fit it.
const REPORT_HEIGHT = "(function(){var last=0;function send(){var h=Math.ceil(document.documentElement.getBoundingClientRect().height);if(h&&h!==last&&parent!==window){last=h;parent.postMessage({type:'hosp:height',height:h},'*')}}if(window.ResizeObserver)new ResizeObserver(send).observe(document.documentElement);addEventListener('load',send);send()})();";

function page(status, csp, body, lang = 'en') {
  return new Response(
    `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Hospitable widget</title>` +
      `<style>html,body{margin:0;padding:0;background:transparent}.off{margin:0;padding:16px;font:14px/1.5 system-ui,sans-serif;color:#71717a;text-align:center}</style></head><body>${body}</body></html>`,
    {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': csp,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      },
    },
  );
}

/** GET /embed/<type>?property=…&options=…&style=…&<display choice>=… */
export function handleEmbed(request, url, type, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed\n', { status: 405, headers: { Allow: 'GET' } });
  const guest = GUEST_WIDGETS.includes(type);
  const settings = guestSettings(env);
  const builder = (() => {
    try {
      return new URL(String(env.BUILDER_URL || '').trim()).origin;
    } catch {
      return null;
    }
  })();
  // The builder may always show a widget; guest pages only the host's own websites besides.
  const ancestors = guest ? (settings.sites.includes('*') ? ['*'] : [...settings.sites, ...(builder ? [builder] : [])]) : ['*'];
  const base = `default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors ${ancestors.length ? ancestors.join(' ') : "'none'"}`;

  if (!/^[a-z][a-z-]{1,40}$/.test(type)) return page(404, base, '<p class="off">There is no widget with that name.</p>');
  if (guest && !settings.on) {
    return page(200, base, `<p class="off">Guest sign-in is not set up on this Worker yet: it needs ${settings.missing.join(' and ')}.</p>`);
  }

  const src = widgetUrl(env);
  const n = nonce();
  const cdn = new URL(src).origin;
  const csp = `${base}; script-src 'nonce-${n}' 'strict-dynamic' ${cdn}; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src https: data:; connect-src 'self' ${cdn}`;

  let attrs = ` data-hosp="${esc(type)}" data-hosp-worker="${esc(url.origin)}" data-hosp-eager`;
  for (const [key, value] of url.searchParams) {
    if (!/^[a-z][a-z0-9-]{0,40}$/.test(key) || RESERVED.has(key)) continue;
    attrs += ` data-hosp-${key}="${esc(value.slice(0, 4000))}"`;
  }
  const lang = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(url.searchParams.get('lang') || '') ? url.searchParams.get('lang') : 'en';
  return page(200, csp, `<div${attrs}></div><script nonce="${n}" src="${esc(src)}"></script><script nonce="${n}">${REPORT_HEIGHT}</script>`, lang);
}
