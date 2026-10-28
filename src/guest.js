// Guest sign-in, and what signed-in guests see.
//
// A guest proves a booking with its code and their last name (or the email on
// the booking) and gets a signed token for that one reservation, valid until
// three days after check-out. Widgets for signed-in guests only run inside
// this Worker's own embed pages (src/embed.js), which websites show in an
// iframe: the token stays in this Worker's storage in the guest's browser, out
// of reach of the website around it, and /stay answers no other website (no
// CORS headers). Nothing a guest sees is stored in KV or cached by a browser.
//
// It is off until GUEST_SECRET and GUEST_SITES are set; dummy mode has it on.

import { createClient, HospitableError, BudgetError } from './hospitable.js';
import * as N from './normalize.js';
import { isDummy } from './listings.js';
import { dummyFetch, DUMMY_GUEST_TOPICS, DUMMY_TOPICS } from './dummy.js';

const HOUR = 3_600_000;
/** How long after check-out a guest can still sign in and see the receipt. */
export const AFTER_STAY_HOURS = 72;
const DUMMY_SECRET = 'dummy-mode-only-guest-secret-0000';
const CACHE_MS = { reservation: 60_000, property: 300_000 };
const LIMITS = { ip: [10, 10 * 60_000], code: [5, 10 * 60_000] };

const cache = new Map();
const tries = new Map();

export function resetGuest() {
  cache.clear();
  tries.clear();
}

/** "villakayu.com, https://www.villakayu.com" → frame-ancestors sources. Anything else is dropped. */
export function siteList(value) {
  const out = [];
  for (let s of String(value || '').split(/[\s,]+/)) {
    s = s.trim().replace(/\/+$/, '');
    if (!s) continue;
    if (s === '*') return ['*'];
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    const ok = /^https:\/\/(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?$/i.test(s) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(s);
    if (ok && !out.includes(s.toLowerCase())) out.push(s.toLowerCase());
    else if (!ok) console.error(`[hospitable-widgets] GUEST_SITES: "${s}" is not a website address; skipped`);
  }
  return out;
}

/** REVEAL_HOURS: how long before check-in arrival details appear. 24 by default, a week at most. */
export function revealHours(env) {
  const raw = String(env.REVEAL_HOURS ?? '').trim();
  const n = raw === '' ? NaN : Number(raw);
  return Number.isFinite(n) ? Math.min(168, Math.max(0, n)) : 24;
}

/** Whether guest sign-in is on, and what it still needs. */
export function guestSettings(env) {
  const dummy = isDummy(env);
  const secret = String(env.GUEST_SECRET || '').trim() || (dummy ? DUMMY_SECRET : '');
  let sites = siteList(env.GUEST_SITES);
  if (!sites.length && dummy) sites = ['*'];
  const missing = [];
  if (secret.length < 32) missing.push('GUEST_SECRET');
  if (!sites.length) missing.push('GUEST_SITES');
  const publicTopics = N.topicList(env.PUBLIC_GUIDE_TOPICS);
  const guestTopics = N.topicList(env.GUEST_GUIDE_TOPICS);
  const topics = [...new Set(dummy && !publicTopics.length && !guestTopics.length ? [...DUMMY_TOPICS, ...DUMMY_GUEST_TOPICS] : [...publicTopics, ...guestTopics])];
  return { on: missing.length === 0, missing, secret, sites, reveal: revealHours(env), topics };
}

/** For the builder: whether sign-in is on, and where guest widgets may show. */
export function guestStatus(env) {
  const s = guestSettings(env);
  return { on: s.on, missing: s.missing, sites: s.sites, reveal_hours: s.reveal };
}

// --- Tokens: base64url(JSON) + "." + base64url(HMAC-SHA256) ------------------------

const enc = new TextEncoder();

function b64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signToken(claims, secret) {
  const body = b64url(enc.encode(JSON.stringify(claims)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

/** The claims of a token this Worker signed and that hasn't expired, else null. */
export async function readToken(token, secret, now = Date.now()) {
  const m = /^([A-Za-z0-9_-]{10,600})\.([A-Za-z0-9_-]{20,100})$/.exec(String(token || ''));
  if (!m) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), unb64url(m[2]), enc.encode(m[1]));
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(unb64url(m[1])));
    return typeof claims?.r === 'string' && typeof claims.x === 'number' && claims.x * 1000 > now ? claims : null;
  } catch {
    return null;
  }
}

// --- Checks ------------------------------------------------------------------------

/** "Sánchez-Ruiz" and "sanchez ruiz" are the same name. */
export function nameKey(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/** The code is the booking's own, and the second field is the guest's last name or email. */
export function matches(raw, code, check) {
  if (String(raw?.platform_id || '').toUpperCase() !== code.toUpperCase()) return false;
  const g = raw.guest || {};
  if (check.includes('@')) return typeof g.email === 'string' && g.email.trim().toLowerCase() === check.trim().toLowerCase();
  const want = nameKey(g.last_name);
  return want.length > 0 && want === nameKey(check);
}

/** Counts an attempt (or only looks, with count false); true once the window has no tries left. */
function tooMany(key, [max, windowMs], now, count = true) {
  if (tries.size > 5000) for (const [k, v] of tries) if (v.until < now) tries.delete(k);
  let t = tries.get(key);
  if (!t || t.until < now) t = { n: 0, until: now + windowMs };
  if (count) t.n++;
  tries.set(key, t);
  return count ? t.n > max : t.n >= max;
}

/** Memory only, per Worker instance: guests' data never goes to KV. */
async function cached(key, ms, load) {
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  const value = await load();
  if (cache.size > 500) cache.clear();
  cache.set(key, { value, until: Date.now() + ms });
  return value;
}

function client(env) {
  return createClient({ token: String(env.HOSPITABLE_PAT || '').trim(), fetch: isDummy(env) ? dummyFetch : fetch, budget: 6 });
}

/** Booking codes are shown in capitals; a guest may type them in lower case. */
async function findByCode(api, code) {
  const found = await api.reservation(code, 'guest');
  if (found || code === code.toUpperCase()) return found;
  return api.reservation(code.toUpperCase(), 'guest');
}

// Door codes need the smartlock_code include; if Hospitable refuses it, the rest still shows.
async function fullReservation(api, id) {
  try {
    return await api.reservation(id, 'guest,properties,financials,smartlock_code');
  } catch (err) {
    if (err instanceof HospitableError && (err.status === 400 || err.status === 422)) return api.reservation(id, 'guest,properties,financials');
    throw err;
  }
}

// --- Responses -----------------------------------------------------------------------

function reply(body, status, env, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Hosp-Mode': isDummy(env) ? 'dummy' : 'live',
      ...extra,
    },
  });
}

function unavailable(err, env) {
  console.error(`[hospitable-widgets] guest: ${err.message}`);
  return reply({ error: 'unavailable' }, 503, env, { 'Retry-After': '60' });
}

/**
 * POST /stay/login {code, check} → {token, expires_at, first_name}
 * GET /stay with "Authorization: Bearer <token>" → the guest's stay
 */
export async function handleGuest(request, url, path, env) {
  // No CORS headers: a browser lets only this Worker's own pages call these.
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  const settings = guestSettings(env);
  if (!settings.on) return reply({ error: 'guest_login_off', missing: settings.missing }, 404, env);
  if (path === '/stay/login') {
    if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405, env, { Allow: 'POST' });
    return login(request, url, env, settings);
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return reply({ error: 'method_not_allowed' }, 405, env, { Allow: 'GET' });
  return stayData(request, env, settings);
}

async function login(request, url, env, settings) {
  if (request.headers.get('Origin') !== url.origin) return reply({ error: 'forbidden' }, 403, env);
  const now = Date.now();
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (tooMany(`ip:${ip}`, LIMITS.ip, now)) return reply({ error: 'too_many' }, 429, env, { 'Retry-After': '600' });
  let input;
  try {
    const text = await request.text();
    input = text.length <= 2000 ? JSON.parse(text) : null;
  } catch {
    input = null;
  }
  const code = String(input?.code ?? '').replace(/\s+/g, '');
  const check = String(input?.check ?? '').trim();
  if (!/^[A-Za-z0-9-]{4,40}$/.test(code) || !check || check.length > 200) return reply({ error: 'no_match' }, 401, env);
  const codeKey = `code:${code.toUpperCase()}`;
  if (tooMany(codeKey, LIMITS.code, now, false)) return reply({ error: 'too_many' }, 429, env, { 'Retry-After': '600' });

  let raw;
  try {
    raw = await findByCode(client(env), code);
  } catch (err) {
    if (err instanceof HospitableError || err instanceof BudgetError) return unavailable(err, env);
    throw err;
  }
  // The same answer whether the code is unknown or the name is wrong.
  if (!raw || !matches(raw, code, check)) {
    tooMany(codeKey, LIMITS.code, now);
    return reply({ error: 'no_match' }, 401, env);
  }
  if (!N.confirmed(raw)) return reply({ error: 'not_confirmed' }, 403, env);
  const expires = Date.parse(raw.check_out) + AFTER_STAY_HOURS * HOUR;
  if (!(expires > now)) return reply({ error: 'stay_over' }, 403, env);
  const token = await signToken({ r: String(raw.id), x: Math.floor(expires / 1000) }, settings.secret);
  return reply({ token, expires_at: new Date(expires).toISOString(), first_name: raw.guest?.first_name || null }, 200, env);
}

async function stayData(request, env, settings) {
  const now = Date.now();
  const auth = request.headers.get('Authorization') || '';
  const claims = await readToken(auth.replace(/^Bearer\s+/i, ''), settings.secret, now);
  if (!claims) return reply({ error: 'signed_out' }, 401, env);
  const api = client(env);
  try {
    const raw = await cached(`res:${claims.r}`, CACHE_MS.reservation, () => fullReservation(api, claims.r));
    // A cancelled stay signs its guest out.
    if (!raw || !N.confirmed(raw)) return reply({ error: 'signed_out' }, 401, env);
    const pid = raw.properties?.[0]?.id ? String(raw.properties[0].id) : null;
    const [property, hub] = await Promise.all([
      pid ? cached(`prop:${pid}`, CACHE_MS.property, () => api.property(pid)) : null,
      pid && settings.topics.length ? cached(`hub:${pid}`, CACHE_MS.property, () => api.knowledgeHub(pid)) : null,
    ]);
    const guide = hub ? N.guide(hub, settings.topics).guide : [];
    return reply({ mode: isDummy(env) ? 'dummy' : 'live', ...N.stay(raw, property?.details, guide, now, settings.reveal) }, 200, env);
  } catch (err) {
    if (err instanceof HospitableError || err instanceof BudgetError) return unavailable(err, env);
    throw err;
  }
}
