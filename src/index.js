// Hospitable Listing Widgets: the Worker.
// It only reads from Hospitable, refreshes once an hour, and only hands out
// public listing data.

import { Listings, NotFound, Unavailable, isDummy } from './listings.js';
import { demoPage } from './demo.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function respond(body, status, env, extra = {}) {
  const headers = {
    ...CORS,
    'Content-Type': 'application/json; charset=utf-8',
    'X-Hosp-Mode': isDummy(env) ? 'dummy' : 'live',
    'X-Content-Type-Options': 'nosniff',
    ...extra,
  };
  return new Response(JSON.stringify(body), { status, headers });
}

function data(body, env, fresh) {
  return respond({ mode: isDummy(env) ? 'dummy' : 'live', ...body }, 200, env, {
    // Data refreshes hourly, so a visitor's browser may keep it for an hour.
    'Cache-Control': fresh ? 'no-store' : 'public, max-age=3600',
  });
}

function publicStatus(status) {
  if (!status) return null;
  return {
    token: status.token || 'unknown',
    last_run: status.last_run || null,
    last_success: status.last_success || null,
    error: status.error || null,
    partial: !!status.partial,
  };
}

const INCLUDES = new Set(['calendar', 'reviews', 'guide', 'host']);

const ROUTES = [
  [/^\/api\/properties$/, 'list'],
  [/^\/api\/properties\/([^/]+)$/, 'property'],
  [/^\/api\/properties\/([^/]+)\/calendar$/, 'calendar'],
  [/^\/api\/properties\/([^/]+)\/reviews$/, 'reviews'],
  [/^\/api\/properties\/([^/]+)\/guide$/, 'guide'],
  [/^\/api\/host$/, 'host'],
];

async function api(route, id, url, env, listings) {
  const fresh = url.searchParams.get('for') === 'builder';
  switch (route) {
    case 'list': {
      const list = await listings.list({ widget: !fresh });
      const status = fresh && listings.mode === 'live' ? publicStatus(await listings.status()) : undefined;
      return data({ updated_at: list.updated_at, status, properties: list.properties }, env, fresh);
    }
    case 'property': {
      // ?include=calendar,reviews,guide,host folds the other data sets into this
      // response. widget.js asks for all of them, so every widget of a property
      // shares one URL: one request per page view, one copy in the browser's cache.
      const include = (url.searchParams.get('include') || '').split(',').map((s) => s.trim()).filter((s) => INCLUDES.has(s));
      const [property, settled] = await Promise.all([
        listings.property(id),
        Promise.allSettled(include.map((set) => (set === 'host' ? listings.host() : listings[set](id)))),
      ]);
      // A set that fails doesn't take the others down with it; widget.js shows
      // the widgets that need it from the visitor's last copy.
      const parts = [property];
      const missing = [];
      settled.forEach((r, i) => {
        if (r.status === 'fulfilled') parts.push(r.value);
        else {
          missing.push(include[i]);
          console.error(`[hospitable-widgets] could not load ${include[i]} for ${id}`, r.reason);
        }
      });
      const merged = Object.assign({}, ...parts);
      merged.updated_at = parts.map((p) => p.updated_at).filter(Boolean).sort()[0] || null;
      if (missing.length) merged.missing = missing;
      // An incomplete answer must not sit in browsers' caches for an hour.
      return data(merged, env, fresh || missing.length > 0);
    }
    case 'calendar':
      return data(await listings.calendar(id), env, fresh);
    case 'reviews':
      return data(await listings.reviews(id), env, fresh);
    case 'guide':
      return data(await listings.guide(id), env, fresh);
    case 'host':
      return data(await listings.host(), env, fresh);
  }
}

export default {
  /**
   * @param {Request} request
   * @param {any} env
   * @param {ExecutionContext} ctx
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return respond({ error: 'method_not_allowed' }, 405, env, { Allow: 'GET, HEAD, OPTIONS' });
    }

    if (path === '/') {
      const builder = String(env.BUILDER_URL || '').trim();
      if (!builder) return new Response('Hospitable Widgets Worker is running. Open /demo to see it work.', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      const target = new URL(builder);
      target.searchParams.set('worker', url.origin);
      return Response.redirect(target.toString(), 302);
    }

    if (path === '/demo') {
      return new Response(await demoPage(url, env, (e) => new Listings(e)), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Hosp-Mode': isDummy(env) ? 'dummy' : 'live' },
      });
    }

    for (const [pattern, route] of ROUTES) {
      const m = pattern.exec(path);
      if (!m) continue;
      const id = m[1] ? decodeURIComponent(m[1]) : null;
      try {
        return await api(route, id, url, env, new Listings(env));
      } catch (err) {
        if (err instanceof NotFound) return respond({ error: 'not_found' }, 404, env, { 'Cache-Control': 'public, max-age=60' });
        if (err instanceof Unavailable) {
          return respond({ error: 'unavailable', token: err.token, message: err.message }, 503, env, { 'Cache-Control': 'no-store', 'Retry-After': '60' });
        }
        console.error('[hospitable-widgets] unexpected error', err);
        return respond({ error: 'internal' }, 500, env, { 'Cache-Control': 'no-store' });
      }
    }

    return respond({ error: 'not_found' }, 404, env);
  },

  /**
   * Hourly refresh of every data set a widget has asked for.
   * @param {ScheduledController} controller
   * @param {any} env
   * @param {ExecutionContext} ctx
   */
  async scheduled(controller, env, ctx) {
    if (isDummy(env)) return;
    const report = await new Listings(env).refresh();
    console.log('[hospitable-widgets] refresh', JSON.stringify(report));
  },
};
