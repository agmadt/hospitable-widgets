// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWidget } from './helpers/load-widget.js';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../widget/templates');
const file = (name) => readFileSync(resolve(dir, name), 'utf8');

const STAY = {
  mode: 'dummy',
  signed_in: true,
  stay_guest_name: 'Hannah',
  stay_code: 'HM4CXJ4KPX',
  stay_platform: 'Airbnb',
  stay_property_name: 'Relaxing Villa near the sea',
  stay_arrival_date: '2026-10-27',
  stay_departure_date: '2026-10-31',
  stay_nights: 4,
  stay_check_in: '15:00',
  stay_check_out: '11:00',
  stay_adults: 2,
  stay_children: 1,
  stay_infants: 0,
  stay_pets: 0,
  stay_phase: 'upcoming',
  stay_days_to_arrival: 3,
  stay_access_open: false,
  stay_access_ended: false,
  stay_access_date: '2026-10-26',
  stay_access_time: '15:00',
  stay_door_code: null,
  stay_currency: 'USD',
  stay_payment: [{ label: 'Accommodation', amount: 1280, kind: 'accommodation' }, { label: 'Weekly discount', amount: -128, kind: 'discount' }],
  stay_total: 1152,
  stay_guide: [],
};

let W;
let worker;

/** The Worker's /stay and /stay/login, and jsDelivr's templates. */
function stubWorker({ stay = STAY, login = { token: 'tok.en', expires_at: '2999-01-01T00:00:00Z', first_name: 'Hannah' }, loginStatus = 200 } = {}) {
  const calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ path: u.pathname, auth: new Headers(init.headers).get('Authorization'), body: init.body });
    if (u.pathname.includes('/templates/')) return new Response(file(u.pathname.split('/').pop()));
    if (u.pathname === '/stay/login') return new Response(JSON.stringify(loginStatus === 200 ? login : { error: login }), { status: loginStatus });
    if (u.pathname === '/stay') return typeof stay === 'number' ? new Response('{"error":"signed_out"}', { status: stay }) : new Response(JSON.stringify(stay));
    return new Response('{}', { status: 404 });
  }));
  return calls;
}

function widget(type, attrs = '') {
  document.body.insertAdjacentHTML('beforeend', `<div data-hosp="${type}" data-hosp-worker="${worker}" data-hosp-data="stay" data-hosp-modules="guest" ${attrs}></div>`);
  return document.body.lastElementChild;
}

const text = (el) => el.shadowRoot.textContent.replace(/\s+/g, ' ').trim();
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  document.head.innerHTML = '<script src="https://cdn.example.com/hospitable-widgets/widget/widget.js"></script>';
  document.body.innerHTML = '';
  localStorage.clear();
  W = await loadWidget();
  // The embed page: the widget runs on the Worker's own address.
  worker = location.origin;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('widgets for signed-in guests', () => {
  it('ask a guest who has not signed in to sign in, without calling the Worker', async () => {
    const calls = stubWorker();
    const el = widget('door-code', 'data-hosp-options="signin_url=https%3A%2F%2Fvillakayu.com%2Fsign-in"');
    await W.scan();
    expect(text(el)).toContain('Sign in with your booking to see this.');
    const a = el.shadowRoot.querySelector('.gs-out a');
    expect(a.getAttribute('href')).toBe('https://villakayu.com/sign-in');
    expect(a.getAttribute('target')).toBe('_top');
    expect(calls.filter((c) => c.path.startsWith('/stay'))).toEqual([]);
  });

  it('signs in, keeps the token in the Worker’s storage, and shows the stay', async () => {
    const calls = stubWorker();
    const login = widget('guest-login');
    const door = widget('door-code');
    await W.scan();
    const form = login.shadowRoot.querySelector('form');
    form.elements.code.value = 'HM4CXJ4KPX';
    form.elements.check.value = 'Moore';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(text(login)).toContain('Welcome, Hannah'));
    expect(JSON.parse(calls.find((c) => c.path === '/stay/login').body)).toEqual({ code: 'HM4CXJ4KPX', check: 'Moore' });
    expect(JSON.parse(localStorage.getItem('hosp:guest'))).toEqual({ token: 'tok.en', expires_at: '2999-01-01T00:00:00Z' });
    expect(calls.filter((c) => c.path === '/stay').map((c) => c.auth)).toContain('Bearer tok.en');
    // The other widget on the page follows.
    await vi.waitFor(() => expect(text(door)).toContain('Your code appears on'));
    // Nothing of the stay is kept as an offline copy.
    expect(Object.keys(localStorage).filter((k) => k.startsWith('hosp:v2'))).toEqual([]);
  });

  it('says why a sign-in failed, in the host’s words when they gave some', async () => {
    stubWorker({ login: 'no_match', loginStatus: 401 });
    const el = widget('guest-login', 'data-hosp-options="error_text=Hmm%2C%20try%20again"');
    await W.scan();
    const form = el.shadowRoot.querySelector('form');
    form.elements.code.value = 'X1234';
    form.elements.check.value = 'Nobody';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(el.shadowRoot.querySelector('[data-hosp-signin-error]').textContent).toBe('Hmm, try again'));
    expect(form.querySelector('button').disabled).toBe(false);
    expect(localStorage.getItem('hosp:guest')).toBeNull();
  });

  it('formats the stay in the visitor’s language', async () => {
    localStorage.setItem('hosp:guest', JSON.stringify({ token: 'tok.en', expires_at: '2999-01-01T00:00:00Z' }));
    stubWorker();
    const summary = widget('stay-summary');
    const pay = widget('payment');
    await W.scan();
    expect(text(summary)).toContain('In 3 days');
    expect(text(summary)).toContain('Tue, Oct 27');
    expect(text(summary)).toContain('from 3:00 PM');
    expect(text(summary)).toContain('2 adults, 1 child');
    expect(text(summary)).toContain('Sample data');
    const rows = [...pay.shadowRoot.querySelectorAll('tr')].map((tr) => [...tr.cells].map((td) => td.textContent));
    expect(rows).toEqual([['Accommodation', '$1,280'], ['Weekly discount', '-$128'], ['Total', '$1,152']]);
    // With cents in one line, every line shows them.
    pay.remove();
    stubWorker({ stay: { ...STAY, stay_payment: [...STAY.stay_payment, { label: 'Service fee', amount: 19.5, kind: 'fee' }], stay_total: 1171.5 } });
    const cents = widget('payment');
    await W.scan();
    expect([...cents.shadowRoot.querySelectorAll('td:last-child')].map((td) => td.textContent)).toEqual(['$1,280.00', '-$128.00', '$19.50', '$1,171.50']);
    expect(pay.shadowRoot.querySelector('tr.off td').textContent).toBe('Weekly discount');
  });

  it('shows the door code when it is time, with a copy button', async () => {
    localStorage.setItem('hosp:guest', JSON.stringify({ token: 'tok.en', expires_at: '2999-01-01T00:00:00Z' }));
    stubWorker({ stay: { ...STAY, stay_phase: 'arrival', stay_access_open: true, stay_door_code: '4711' } });
    const el = widget('door-code');
    await W.scan();
    expect(el.shadowRoot.querySelector('.dc-code').textContent).toBe('4711');
    expect(el.shadowRoot.querySelector('[data-hosp-copy]').getAttribute('data-hosp-copy')).toBe('4711');
  });

  it('forgets a token the Worker no longer takes, and signs out on request', async () => {
    localStorage.setItem('hosp:guest', JSON.stringify({ token: 'old', expires_at: '2999-01-01T00:00:00Z' }));
    stubWorker({ stay: 401 });
    const el = widget('wifi');
    await W.scan();
    expect(text(el)).toContain('Sign in with your booking');
    expect(localStorage.getItem('hosp:guest')).toBeNull();

    localStorage.setItem('hosp:guest', JSON.stringify({ token: 'tok.en', expires_at: '2999-01-01T00:00:00Z' }));
    stubWorker();
    const summary = widget('stay-summary');
    await W.scan();
    summary.shadowRoot.querySelector('[data-hosp-signout]').click();
    await vi.waitFor(() => expect(text(summary)).toContain('Sign in with your booking'));
    expect(localStorage.getItem('hosp:guest')).toBeNull();
  });

  it('forgets an expired token without asking the Worker', async () => {
    localStorage.setItem('hosp:guest', JSON.stringify({ token: 'tok.en', expires_at: '2001-01-01T00:00:00Z' }));
    const calls = stubWorker();
    widget('wifi');
    await W.scan();
    expect(calls.some((c) => c.path === '/stay')).toBe(false);
    expect(localStorage.getItem('hosp:guest')).toBeNull();
  });

  it('follows a sign-in in the guest’s other widgets on the website', async () => {
    stubWorker();
    const el = widget('house-manual');
    await W.scan();
    expect(text(el)).toContain('Sign in');
    localStorage.setItem('hosp:guest', JSON.stringify({ token: 'tok.en', expires_at: '2999-01-01T00:00:00Z' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'hosp:guest' }));
    await vi.waitFor(() => expect(text(el)).toContain('Your host hasn’t added a house manual yet.'));
  });

  it('only run on the Worker’s own embed pages, never on the website itself', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem('hosp:guest', JSON.stringify({ token: 'tok.en', expires_at: '2999-01-01T00:00:00Z' }));
    const calls = stubWorker();
    worker = 'https://rina-widgets.example.workers.dev';
    const el = widget('door-code');
    await W.scan();
    expect(el.getAttribute('data-hosp-state')).toBe('unavailable');
    expect(calls.some((c) => c.path === '/stay')).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('only work in an iframe from https://rina-widgets.example.workers.dev/embed/'));
  });

  it('let the builder preview the signed-in view without a Worker', async () => {
    stubWorker();
    const el = document.createElement('div');
    document.body.appendChild(el);
    const seen = vi.fn();
    el.addEventListener('hosp:signin', seen);
    W.renderTo(el, (await W.module('templates').compile('guest-login', '', '')), { signed_in: false }, {});
    el.shadowRoot.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(seen).toHaveBeenCalled();
    await tick();
  });
});

describe('analyze', () => {
  it('sends guest templates to the guest module and nothing else', async () => {
    expect(W.analyze('{#signed_in}{stay_door_code}{/signed_in}{#sample_data}x{/sample_data}').datasets).toEqual(['stay']);
    expect(W.plan('{#stay_payment}{label}{/stay_payment}')).toEqual(['guest']);
  });
});
