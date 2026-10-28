import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { MemoryKV, clearMemory } from '../src/store.js';
import { resetState } from '../src/listings.js';
import { dummyFetch } from '../src/dummy.js';
import { resetGuest, signToken, readToken, siteList, nameKey } from '../src/guest.js';
import { GUEST_WIDGETS } from '../src/embed.js';

const ORIGIN = 'https://rina-widgets.example.workers.dev';
const VILLA = '550e8400-e29b-41d4-a716-446655440000';
const PAT = 'pat_live_TOKEN_must_never_leak';
const SECRET = 'a-long-random-guest-secret-0123456789abcdef';

// Words only in fields nobody outside Hospitable may see, not even the guest.
const NEVER = ['SECRET', 'PEACHTREE', 'john.doe@', 'webcal', 'Weber'];
// What a signed-in guest may see, and nobody else.
export const GUEST_ONLY = ['Pantai Suluban', 'banyan tree', 'pool pump', 'Relaxing-Villa-5G', 'ombak-laut', 'yellow for packaging', 'Loft-Senefelder', 'kastanie-1234', '"4711"'];

const dummyEnv = { HOSPITABLE_PAT: 'dummy', BUILDER_URL: 'https://builder.example.com/' };
const liveEnv = (extra = {}) => ({ HOSPITABLE_PAT: PAT, LISTINGS: new MemoryKV(), BUILDER_URL: 'https://builder.example.com/', GUEST_SECRET: SECRET, GUEST_SITES: 'villakayu.com, https://www.villakayu.com', ...extra });

let ip = 0;
function signIn(code, check, env = dummyEnv, headers = {}) {
  return worker.fetch(
    new Request(ORIGIN + '/stay/login', {
      method: 'POST',
      // A new address each time, so only the per-code limit applies unless a test says otherwise.
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': `203.0.113.${++ip % 250}`, ...headers },
      body: JSON.stringify({ code, check }),
    }),
    env,
  );
}

async function tokenFor(code, check, env = dummyEnv) {
  const res = await signIn(code, check, env);
  expect(res.status).toBe(200);
  return (await res.json()).token;
}

function stay(token, env = dummyEnv) {
  return worker.fetch(new Request(ORIGIN + '/stay', { headers: token ? { Authorization: `Bearer ${token}` } : {} }), env);
}

/** Hospitable stand-in for live mode, as in worker.test.js. */
function hospitable(override) {
  const calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    const u = new URL(url);
    calls.push(u.pathname.replace('/v2', '') + u.search);
    expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer ${PAT}`);
    return (override && (await override(u))) || dummyFetch(url, { headers: { Authorization: 'Bearer dummy' } });
  }));
  return calls;
}

beforeEach(() => {
  clearMemory();
  resetState();
  resetGuest();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('guest sign-in settings', () => {
  it('is off in live mode until GUEST_SECRET and GUEST_SITES are set', async () => {
    hospitable();
    const env = liveEnv({ GUEST_SECRET: '', GUEST_SITES: '' });
    const res = await signIn('HM4CXJ4KPX', 'Moore', env);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'guest_login_off', missing: ['GUEST_SECRET', 'GUEST_SITES'] });
    const { guest } = await (await worker.fetch(new Request(ORIGIN + '/api/properties?for=builder'), env)).json();
    expect(guest).toEqual({ on: false, missing: ['GUEST_SECRET', 'GUEST_SITES'], sites: [], reveal_hours: 24 });
    // A short secret is as good as none.
    expect((await signIn('HM4CXJ4KPX', 'Moore', liveEnv({ GUEST_SECRET: 'short' }))).status).toBe(404);
    const page = await (await worker.fetch(new Request(ORIGIN + '/embed/door-code'), env)).text();
    expect(page).toContain('Guest sign-in is not set up on this Worker yet: it needs GUEST_SECRET and GUEST_SITES.');
    expect(page).not.toContain('<script');
  });

  it('is on in dummy mode, for any website', async () => {
    const { guest } = await (await worker.fetch(new Request(ORIGIN + '/api/properties?for=builder'), dummyEnv)).json();
    expect(guest).toMatchObject({ on: true, sites: ['*'] });
    expect((await (await worker.fetch(new Request(ORIGIN + '/api/properties'), dummyEnv)).json()).guest).toBeUndefined();
  });

  it('reads the websites hosts list', () => {
    expect(siteList('villakayu.com, https://www.villakayu.com/ *.villakayu.com http://localhost:5173')).toEqual(['https://villakayu.com', 'https://www.villakayu.com', 'https://*.villakayu.com', 'http://localhost:5173']);
    expect(siteList('not a site, javascript:alert(1)')).toEqual([]);
    expect(siteList('villakayu.com, *')).toEqual(['*']);
  });
});

describe('signing in', () => {
  it('takes the booking code and the last name, however they are typed', async () => {
    for (const [code, name] of [['HM4CXJ4KPX', 'Moore'], [' hm4cxj4kpx ', 'MOORE'], ['HM4CXJ4KPX', ' moore ']]) {
      const res = await signIn(code, name);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ first_name: 'Hannah', token: expect.stringMatching(/^[\w-]+\.[\w-]+$/) });
      // Until three days after check-out.
      expect(Date.parse(body.expires_at) - Date.now()).toBeGreaterThan(4 * 86_400_000);
    }
    expect(nameKey('Sánchez-Ruiz')).toBe(nameKey('sanchez ruiz'));
  });

  it('takes the email on the booking instead, such as a Booking.com alias', async () => {
    expect((await signIn('4182736455', 'LBecker.482917@guest.booking.com')).status).toBe(200);
    expect((await signIn('4182736455', 'lukas@becker.de')).status).toBe(401);
  });

  it('gives the same answer for an unknown code and a wrong name', async () => {
    for (const [code, name] of [['HM4CXJ4KPX', 'Smith'], ['HMNOTREAL1', 'Moore'], ['HM', 'Moore'], ['HM4CXJ4KPX', ''], ['<script>', 'Moore']]) {
      const res = await signIn(code, name);
      expect(res.status, `${code} ${name}`).toBe(401);
      expect(await res.json()).toEqual({ error: 'no_match' });
    }
  });

  it('refuses cancelled stays and stays that ended', async () => {
    expect(await (await signIn('HMCANCEL22', 'Taylor')).json()).toEqual({ error: 'not_confirmed' });
    expect(await (await signIn('DIR-20417', 'Sanchez Ruiz')).json()).toEqual({ error: 'stay_over' });
  });

  it('only answers the Worker’s own pages', async () => {
    expect((await signIn('HM4CXJ4KPX', 'Moore', dummyEnv, { Origin: 'https://evil.example' })).status).toBe(403);
    const res = await signIn('HM4CXJ4KPX', 'Moore');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const preflight = await worker.fetch(new Request(ORIGIN + '/stay/login', { method: 'OPTIONS' }), dummyEnv);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect((await worker.fetch(new Request(ORIGIN + '/stay/login'), dummyEnv)).status).toBe(405);
  });

  it('slows down guessing, per booking code and per address', async () => {
    for (let i = 0; i < 5; i++) expect((await signIn('HM4CXJ4KPX', 'Wrong')).status).toBe(401);
    expect((await signIn('HM4CXJ4KPX', 'Wrong')).status).toBe(429);
    // Even the right name waits now.
    expect((await signIn('HM4CXJ4KPX', 'Moore')).status).toBe(429);
    resetGuest();
    const same = { 'CF-Connecting-IP': '198.51.100.7' };
    for (let i = 0; i < 10; i++) await signIn(`HMGUESS${i}00`, 'Moore', dummyEnv, same);
    expect((await signIn('4182736455', 'Becker', dummyEnv, same)).status).toBe(429);
  });

  it('says so when Hospitable cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('fetch failed');
    }));
    const res = await signIn('HM4CXJ4KPX', 'Moore', liveEnv());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'unavailable' });
  });

  it('keeps booking codes out of the logs', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    await signIn('HM4CXJ4KPX', 'Moore', liveEnv());
    expect(JSON.stringify(console.error.mock.calls)).not.toContain('HM4CXJ4KPX');
  });
});

describe('a signed-in guest’s stay', () => {
  it('shows the guest their own stay, door code and Wi-Fi on arrival day', async () => {
    const res = await stay(await tokenFor('HM4CXJ4KPX', 'Moore'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const body = await res.json();
    expect(body).toMatchObject({
      mode: 'dummy',
      signed_in: true,
      stay_guest_name: 'Hannah',
      stay_code: 'HM4CXJ4KPX',
      stay_platform: 'Airbnb',
      stay_property_name: 'Relaxing Villa near the sea',
      stay_nights: 4,
      stay_check_in: '15:00',
      stay_check_out: '11:00',
      stay_guests: 3,
      stay_phase: 'arrival',
      stay_access_open: true,
      stay_door_code: '4711',
      stay_wifi_name: 'Relaxing-Villa-5G',
      stay_wifi_password: 'ombak-laut-2580',
      stay_address: '12 Jl. Pantai Suluban, 80361 Uluwatu, ID',
      stay_map_url: 'https://www.google.com/maps/search/?api=1&query=-8.8291,115.0849',
      stay_currency: 'USD',
      stay_total: 1471.32,
    });
    expect(body.stay_checkin_instructions).toContain('banyan tree');
    expect(body.stay_house_manual).toContain('pool pump');
    expect(body.stay_payment.map((l) => [l.label, l.amount])).toEqual([['Accommodation', 1280], ['Cleaning fee', 90], ['Service fee', 192.12], ['Weekly discount', -128], ['Tourism tax', 137.2]]);
    // Public topics and the ones only guests may read.
    expect(body.stay_guide.map((t) => t.title)).toEqual(['Local attractions', 'Where to eat', 'Arrival information']);
  });

  it('holds back arrival details until shortly before check-in', async () => {
    const body = await (await stay(await tokenFor('4182736455', 'Becker'))).json();
    expect(body).toMatchObject({ stay_phase: 'upcoming', stay_days_to_arrival: 12, stay_access_open: false, stay_door_code: null, stay_wifi_name: null, stay_wifi_password: null, stay_checkin_instructions: null });
    // When they appear, on the property's own clock.
    expect(body.stay_access_time).toBe('16:00');
    expect(body.stay_address).toBe('37a Senefelderplatz, 10405 Berlin, DE');
    // REVEAL_HOURS can bring them forward by a week at most.
    const early = await (await stay(await tokenFor('4182736455', 'Becker', { ...dummyEnv, REVEAL_HOURS: '400' }))).json();
    expect(early.stay_door_code).toBeNull();
  });

  it('never shows what is private even to the guest', async () => {
    hospitable();
    const text = await (await stay(await tokenFor('HM4CXJ4KPX', 'Moore', liveEnv()), liveEnv())).text();
    for (const word of NEVER) expect(text, `/stay leaks "${word}"`).not.toContain(word);
    expect(text).not.toMatch(/"(notes|email|last_name|phone_numbers|host|revenue|other_details|latitude)"\s*:/);
  });

  it('keeps arrival details out of every public endpoint and KV', async () => {
    hospitable();
    const env = liveEnv({ GUEST_GUIDE_TOPICS: 'Arrival information' });
    await stay(await tokenFor('HM4CXJ4KPX', 'Moore', env), env);
    for (const path of ['/api/properties', '/api/host', `/api/properties/${VILLA}?include=calendar,guide,host,reviews`, '/embed/door-code']) {
      const text = await (await worker.fetch(new Request(ORIGIN + path), env)).text();
      for (const word of GUEST_ONLY) expect(text, `${path} leaks ${word}`).not.toContain(word.replace(/"/g, ''));
    }
    const stored = [...env.LISTINGS.data.values()].map((v) => v.value).join('\n');
    for (const word of [...GUEST_ONLY, 'Moore', 'HM4CXJ4KPX']) expect(stored, `KV holds ${word}`).not.toContain(word.replace(/"/g, ''));
  });

  it('asks Hospitable once a minute at most, whatever the number of widgets', async () => {
    const calls = hospitable();
    const env = liveEnv();
    const token = await tokenFor('HM4CXJ4KPX', 'Moore', env);
    calls.length = 0;
    for (let i = 0; i < 5; i++) expect((await stay(token, env)).status).toBe(200);
    expect(calls.filter((c) => c.startsWith('/reservations/'))).toEqual([`/reservations/c3d7a1e2-4b5f-4c6d-8e9f-1a2b3c4d5e01?include=guest%2Cproperties%2Cfinancials%2Csmartlock_code`]);
    expect(calls.filter((c) => c.startsWith('/properties/'))).toHaveLength(1);
  });

  it('still shows the stay when Hospitable refuses the door code include', async () => {
    hospitable((u) => (u.searchParams.get('include')?.includes('smartlock_code') ? new Response('{}', { status: 422 }) : null));
    const body = await (await stay(await tokenFor('HM4CXJ4KPX', 'Moore', liveEnv()), liveEnv())).json();
    expect(body).toMatchObject({ signed_in: true, stay_door_code: null, stay_wifi_name: 'Relaxing-Villa-5G' });
  });

  it('signs out a forged, expired or foreign token, and a stay that was cancelled', async () => {
    const good = await tokenFor('HM4CXJ4KPX', 'Moore');
    const [body, sig] = good.split('.');
    const forged = btoa(JSON.stringify({ r: 'c3d7a1e2-4b5f-4c6d-8e9f-1a2b3c4d5e02', x: 4102444800 })).replace(/=+$/, '') + '.' + sig;
    const expired = await signToken({ r: 'c3d7a1e2-4b5f-4c6d-8e9f-1a2b3c4d5e01', x: Math.floor(Date.now() / 1000) - 1 }, 'dummy-mode-only-guest-secret-0000');
    const foreign = await signToken({ r: 'c3d7a1e2-4b5f-4c6d-8e9f-1a2b3c4d5e01', x: 4102444800 }, 'someone-else-s-secret-0123456789abcdef');
    const cancelled = await signToken({ r: 'c3d7a1e2-4b5f-4c6d-8e9f-1a2b3c4d5e03', x: 4102444800 }, 'dummy-mode-only-guest-secret-0000');
    for (const t of [null, 'nonsense', `${body}.${sig}x`, forged, expired, foreign, cancelled]) {
      const res = await stay(t);
      expect(res.status, String(t)).toBe(401);
      expect(await res.json()).toEqual({ error: 'signed_out' });
    }
    expect(await readToken(good, 'dummy-mode-only-guest-secret-0000')).toMatchObject({ r: 'c3d7a1e2-4b5f-4c6d-8e9f-1a2b3c4d5e01' });
    // A new GUEST_SECRET signs everyone out.
    expect((await stay(good, { ...dummyEnv, GUEST_SECRET: SECRET })).status).toBe(401);
  });
});

describe('embed pages', () => {
  const page = (path, env = dummyEnv) => worker.fetch(new Request(ORIGIN + path), env);

  it('puts one starter on a page, with the query as its display choices', async () => {
    const res = await page('/embed/amenities?property=p1&options=heading%3DInside%2520the%2520villa&amenities-limit=8&lang=de-DE');
    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    const html = await res.text();
    expect(html).toContain('<html lang="de-DE">');
    expect(html).toContain(`<div data-hosp="amenities" data-hosp-worker="${ORIGIN}" data-hosp-eager data-hosp-property="p1" data-hosp-options="heading=Inside%20the%20villa" data-hosp-amenities-limit="8"></div>`);
    expect(html).toContain('src="https://cdn.jsdelivr.net/gh/agmadt/hospitable-widgets@1/widget/widget.min.js"');
    expect(html).toContain("postMessage({type:'hosp:height'");
  });

  it('lets no HTML or other Worker in through the query', async () => {
    const html = await (await page('/embed/amenities?property=%22%3E%3Cscript%3Ealert(1)%3C/script%3E&worker=https://evil.example&template=x&on%22click=1&lang=%22%3E')).text();
    expect(html).toContain('data-hosp-property="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"');
    expect(html).not.toContain('evil.example');
    expect(html).not.toContain('data-hosp-template');
    expect(html).toContain('<html lang="en">');
    expect((await page('/embed/<b>')).status).toBe(404);
  });

  it('runs only widget.js, with a fresh nonce each time', async () => {
    const a = await page('/embed/gallery');
    const csp = a.headers.get('Content-Security-Policy');
    const nonce = /'nonce-([^']+)'/.exec(csp)[1];
    expect(csp).toContain(`script-src 'nonce-${nonce}' 'strict-dynamic' https://cdn.jsdelivr.net;`);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'self' https://cdn.jsdelivr.net");
    const html = await a.text();
    expect(html.match(/<script nonce="([^"]+)"/g)).toEqual([`<script nonce="${nonce}"`, `<script nonce="${nonce}"`]);
    expect((await page('/embed/gallery')).headers.get('Content-Security-Policy')).not.toContain(nonce);
  });

  it('lets any website frame public widgets, and only the host’s websites frame guest ones', async () => {
    hospitable();
    const env = liveEnv();
    expect((await page('/embed/gallery', env)).headers.get('Content-Security-Policy')).toContain('frame-ancestors *;');
    for (const type of GUEST_WIDGETS) {
      expect((await page(`/embed/${type}`, env)).headers.get('Content-Security-Policy'), type).toContain('frame-ancestors https://villakayu.com https://www.villakayu.com https://builder.example.com;');
    }
  });

  it('loads widget.js from WIDGET_URL when set', async () => {
    const res = await page('/embed/gallery', { ...dummyEnv, WIDGET_URL: 'http://127.0.0.1:5173/hosp/widget.js' });
    expect(await res.text()).toContain('src="http://127.0.0.1:5173/hosp/widget.js"');
    expect(res.headers.get('Content-Security-Policy')).toContain("'strict-dynamic' http://127.0.0.1:5173;");
    expect(await (await page('/embed/gallery', { ...dummyEnv, WIDGET_URL: 'javascript:alert(1)' })).text()).toContain('cdn.jsdelivr.net');
  });
});
