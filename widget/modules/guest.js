/*! Hospitable Listing Widgets | modules/guest.js | MIT
 *  Widgets for signed-in guests: the sign-in form, the guest's token and
 *  their stay from the Worker's /stay. They only run on the Worker's own
 *  embed pages, shown in an iframe on the host's website, so the token is
 *  kept in the Worker's storage in the guest's browser, never the website's.
 *  Sign-in and sign-out reach the guest's other widgets on the page too. */
(function (H) {
  'use strict';
  if (!H) return;

  H.define('guest', [], function (api) {
    var KEY = 'hosp:guest';
    var ERRORS = {
      no_match: 'We couldn’t find a booking with those details. Check the code and the name on the booking.',
      not_confirmed: 'This booking isn’t confirmed, so there is nothing to show yet.',
      stay_over: 'This stay has ended. We hope to see you again!',
      too_many: 'Too many tries. Please wait a few minutes and try again.',
      unavailable: 'Signing in isn’t possible right now. Please try again in a minute.'
    };

    // Where storage is blocked, the token lives as long as the page.
    var memory = null;

    function token() {
      try {
        var t = JSON.parse(localStorage.getItem(KEY));
        if (t && t.token && Date.parse(t.expires_at) > Date.now()) return t.token;
        localStorage.removeItem(KEY);
        return null;
      } catch (e) {
        return memory;
      }
    }

    function keep(t) {
      memory = t ? t.token : null;
      try {
        if (t) localStorage.setItem(KEY, JSON.stringify(t));
        else localStorage.removeItem(KEY);
      } catch (e) { /* see token() */ }
    }

    /** The guest's stay, or { signed_in: false }. Only on the Worker's own pages. */
    function load(worker) {
      if (location.origin !== worker) {
        return Promise.reject(new Error('widgets for signed-in guests only work in an iframe from ' + worker + '/embed/'));
      }
      var t = token();
      if (!t) return Promise.resolve({ signed_in: false });
      return fetch(worker + '/stay', { headers: { Authorization: 'Bearer ' + t }, credentials: 'omit', cache: 'no-store' }).then(function (res) {
        if (res.status === 401) {
          keep(null);
          return { signed_in: false };
        }
        if (!res.ok) throw new Error('HTTP ' + res.status + ' from ' + worker + '/stay');
        return res.json().then(function (d) {
          if (d.mode === 'dummy') d.sample_data = true;
          delete d.mode;
          return d;
        });
      });
    }

    /** Shows every widget on the page again, after the guest signed in or out. */
    function refresh() {
      var els = document.querySelectorAll('[data-hosp]');
      for (var i = 0; i < els.length; i++) {
        if (!els[i].__hospMounted) continue;
        els[i].__hospMounted = null;
        api.mount(els[i]);
      }
    }

    // A sign-in or sign-out in another of the guest's widgets on this website.
    window.addEventListener('storage', function (e) {
      if (e.key === KEY) refresh();
    });

    function signIn(form, worker) {
      var button = form.querySelector('button');
      var out = form.querySelector('[data-hosp-signin-error]');
      if (button) button.disabled = true;
      if (out) out.textContent = '';
      fetch(worker + '/stay/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: form.elements.code.value, check: form.elements.check.value }),
        credentials: 'omit'
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (b) {
          return res.ok && b.token ? b : Promise.reject(b.error || 'unavailable');
        });
      }).then(function (b) {
        keep({ token: b.token, expires_at: b.expires_at });
        // The page for signed-in guests, when the host named one. Browsers allow it right after a click.
        var after = form.getAttribute('data-after');
        if (after && /^https:\/\//.test(after)) {
          try { window.top.location.href = after; } catch (e) { /* the button on the signed-in view still works */ }
        }
        refresh();
      }, function (code) {
        if (button) button.disabled = false;
        if (out) out.textContent = form.getAttribute('data-msg-' + code) || ERRORS[code] || ERRORS.unavailable;
      });
    }

    function copy(button) {
      var text = button.getAttribute('data-hosp-copy');
      var label = button.textContent;
      var done = function () {
        button.textContent = button.getAttribute('data-copied') || 'Copied';
        setTimeout(function () { button.textContent = label; }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () {});
    }

    function party(d, plural) {
      var parts = [];
      [['stay_adults', 'adult', 'adults'], ['stay_children', 'child', 'children'], ['stay_infants', 'infant', 'infants'], ['stay_pets', 'pet', 'pets']].forEach(function (p) {
        if (d[p[0]] > 0) parts.push(plural(d[p[0]], p[1], p[2]));
      });
      return parts.join(', ');
    }

    return {
      load: load,
      refresh: refresh,
      keep: keep,

      derive: function (d, opts, ctx) {
        if (!('signed_in' in d)) return;
        var f = api.module('format').fmt;
        var L = ctx.locale;
        var day = { weekday: 'short', day: 'numeric', month: 'short' };
        if (d.stay_arrival_date) f.setDefault(d, 'stay_arrival_formatted', f.date(d.stay_arrival_date, L, day));
        if (d.stay_departure_date) f.setDefault(d, 'stay_departure_formatted', f.date(d.stay_departure_date, L, day));
        if (d.stay_check_in) f.setDefault(d, 'stay_check_in_formatted', f.time(d.stay_check_in, L));
        if (d.stay_check_out) f.setDefault(d, 'stay_check_out_formatted', f.time(d.stay_check_out, L));
        if (d.stay_nights) f.setDefault(d, 'stay_nights_label', f.plural(d.stay_nights, 'night', 'nights'));
        f.setDefault(d, 'stay_party_label', party(d, f.plural) || undefined);
        if (d.stay_access_date) f.setDefault(d, 'stay_access_formatted', f.date(d.stay_access_date, L, { weekday: 'long', day: 'numeric', month: 'long' }) + (d.stay_access_time ? ', ' + f.time(d.stay_access_time, L) : ''));
        if (d.stay_phase) {
          d['stay_is_' + d.stay_phase] = true;
          var n = d.stay_days_to_arrival;
          f.setDefault(d, 'stay_countdown', {
            upcoming: n === 1 ? 'Tomorrow' : 'In ' + n + ' days',
            arrival: 'Today',
            staying: 'You’re here',
            departure: 'Check-out today',
            over: 'Thank you for staying'
          }[d.stay_phase]);
        }
        // One column of money: all with cents as soon as one line has them.
        var lines = Array.isArray(d.stay_payment) ? d.stay_payment : [];
        var cents = lines.concat([{ amount: d.stay_total }]).some(function (l) { return typeof l.amount === 'number' && l.amount % 1 !== 0; });
        var money = function (n) {
          try {
            return new Intl.NumberFormat(L, { style: 'currency', currency: d.stay_currency || 'USD', minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }).format(n);
          } catch (e) {
            return f.money(n, d.stay_currency, L);
          }
        };
        d.stay_payment = lines.map(function (line) {
          var o = f.copy(line);
          if (typeof line.amount === 'number') f.setDefault(o, 'formatted', money(line.amount));
          o['is_' + line.kind] = true;
          return o;
        });
        if (typeof d.stay_total === 'number') f.setDefault(d, 'stay_total_formatted', money(d.stay_total));
      },

      wire: function (root) {
        var host = root.host;
        var worker = String((host && host.getAttribute('data-hosp-worker')) || '').replace(/\/+$/, '');
        var form = root.querySelector('form[data-hosp-signin]');
        if (form) {
          form.addEventListener('submit', function (e) {
            e.preventDefault();
            // In the builder's preview there is no Worker to ask; it shows the signed-in view instead.
            if (worker) signIn(form, worker);
            else host.dispatchEvent(new CustomEvent('hosp:signin', { bubbles: true }));
          });
        }
        var outs = root.querySelectorAll('[data-hosp-signout]');
        for (var i = 0; i < outs.length; i++) {
          outs[i].addEventListener('click', function () {
            if (!worker) return host.dispatchEvent(new CustomEvent('hosp:signout', { bubbles: true }));
            keep(null);
            refresh();
          });
        }
        var copies = root.querySelectorAll('[data-hosp-copy]');
        for (var j = 0; j < copies.length; j++) {
          copies[j].addEventListener('click', function (e) { copy(e.currentTarget); });
        }
      }
    };
  });
})(window.HospWidgets);
