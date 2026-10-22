/*! Hospitable Listing Widgets v1.2.0 | MIT | github.com/agmadt/hospitable-widgets */
// The core: finds each widget (data-hosp or data-hosp-template), fetches its data from
// the host's Worker (one request per widget), fills the template and renders
// it into a shadow root. Formatting is built in; calendar, reviews, the photo
// viewer and the pager are modules next to this file (modules/*.js), loaded
// only when a widget uses them, side by side with its data.
(function () {
  'use strict';

  var VERSION = '1.2.0';

  if (window.HospWidgets && window.HospWidgets.version) {
    // Loaded twice (two snippets on one page): reuse the first copy.
    window.HospWidgets.scan();
    return;
  }

  var SNAPSHOT_DELAY = 1500; // ms before the fallback is shown while the Worker is slow
  var FETCH_TIMEOUT = 8000;
  var LAZY_MARGIN = '400px'; // start loading a widget this far before it scrolls into view

  // Modules load from next to this file, pinned to this exact version, so a
  // cached core never meets newer modules: .../repo@1/widget/ → .../repo@1.0.0/widget/
  var BASE = (function () {
    var me = document.currentScript;
    if (!me || !me.src) {
      var all = document.querySelectorAll('script[src]');
      for (var i = all.length - 1; i >= 0; i--) {
        if (/\/widget(\.min)?\.js(\?|#|$)/.test(all[i].src)) { me = all[i]; break; }
      }
    }
    var src = (me && me.src) || '';
    return {
      dir: src.replace(/[?#].*$/, '').replace(/[^/]*$/, '').replace(/(\/gh\/[^/]+\/[^/@]+)@[^/]+\//, '$1@' + VERSION + '/'),
      ext: /\.min\.js(\?|#|$)/.test(src) ? '.min.js' : '.js'
    };
  })();

  // ---------------------------------------------------------------------------
  // Template engine
  //
  //   {field}             value, HTML-escaped
  //   {a.b}               nested field
  //   {#list}...{/list}   repeat per item; {.} is the item itself
  //   {#flag}...{/flag}   only when the value is true or not empty
  //   {^flag}...{/flag}   only when the value is false or empty
  //   <!--{#rows}-->      a tag may sit in an HTML comment (useful inside tables)
  //
  // Inside a list: {_index} (0-based), {_number} (1-based), {_first}, {_last}.
  // Unknown fields render as empty, never as raw braces.
  // ---------------------------------------------------------------------------

  var TAG = /\{([#^\/]?)([A-Za-z_][\w.]*|\.)\}/g;
  var COMMENT_TAG = /<!--\s*(\{[#^\/]?(?:[A-Za-z_][\w.]*|\.)\})\s*-->/g;
  var parseCache = Object.create(null);

  function parse(src) {
    src = String(src == null ? '' : src);
    if (parseCache[src]) return parseCache[src];
    var text = src.replace(COMMENT_TAG, '$1');
    var root = { type: 'root', children: [] };
    var stack = [root];
    var last = 0;
    var m;
    TAG.lastIndex = 0;
    while ((m = TAG.exec(text))) {
      var top = stack[stack.length - 1];
      if (m.index > last) top.children.push({ type: 'text', value: text.slice(last, m.index) });
      last = TAG.lastIndex;
      var sigil = m[1];
      var name = m[2];
      if (sigil === '#' || sigil === '^') {
        var node = { type: sigil === '#' ? 'section' : 'inverted', name: name, children: [] };
        top.children.push(node);
        stack.push(node);
      } else if (sigil === '/') {
        // Close the nearest open section with this name; ignore stray closers.
        for (var i = stack.length - 1; i > 0; i--) {
          if (stack[i].name === name) {
            stack.length = i;
            break;
          }
        }
      } else {
        top.children.push({ type: 'var', name: name });
      }
    }
    if (last < text.length) stack[stack.length - 1].children.push({ type: 'text', value: text.slice(last) });
    parseCache[src] = root;
    return root;
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"'`]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c];
    });
  }

  function lookup(stack, name) {
    if (name === '.') return stack[stack.length - 1];
    var parts = name.split('.');
    var value;
    var found = false;
    for (var i = stack.length - 1; i >= 0; i--) {
      var frame = stack[i];
      if (frame !== null && typeof frame === 'object' && Object.prototype.hasOwnProperty.call(frame, parts[0])) {
        value = frame[parts[0]];
        found = true;
        break;
      }
    }
    if (!found) return undefined;
    for (var j = 1; j < parts.length; j++) {
      if (value === null || typeof value !== 'object') return undefined;
      value = Object.prototype.hasOwnProperty.call(value, parts[j]) ? value[parts[j]] : undefined;
    }
    return value;
  }

  function isEmpty(value) {
    if (value === null || value === undefined || value === false || value === '' || value === 0) return true;
    if (Array.isArray(value)) return value.length === 0;
    return false;
  }

  function toText(value) {
    if (value === null || value === undefined || value === false) return '';
    if (Array.isArray(value)) return value.filter(function (v) { return typeof v !== 'object'; }).join(', ');
    if (typeof value === 'object') return '';
    return String(value);
  }

  function renderNodes(nodes, stack) {
    var out = '';
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (node.type === 'text') {
        out += node.value;
      } else if (node.type === 'var') {
        var text = toText(lookup(stack, node.name));
        // A value that is a link may only be https, mailto: or tel: (no javascript:, data:, http:).
        // Browsers ignore leading spaces and any tab or line break in a link, so check it that way too.
        var link = text.replace(/[\t\n\r]/g, '').replace(/^[\u0000-\u0020]+/, '');
        if (/^(javascript|vbscript|data):/i.test(link) || (/^[a-z][a-z0-9+.\-]*:\S*$/i.test(link) && !/^(https|mailto|tel):/i.test(link))) text = '';
        out += escapeHTML(text);
      } else if (node.type === 'section') {
        var value = lookup(stack, node.name);
        if (isEmpty(value)) continue;
        if (Array.isArray(value)) {
          for (var k = 0; k < value.length; k++) {
            var meta = { _index: k, _number: k + 1, _first: k === 0, _last: k === value.length - 1 };
            out += renderNodes(node.children, stack.concat([meta, value[k]]));
          }
        } else {
          out += renderNodes(node.children, stack.concat([value]));
        }
      } else if (node.type === 'inverted') {
        if (isEmpty(lookup(stack, node.name))) out += renderNodes(node.children, stack);
      }
    }
    return out;
  }

  function renderString(template, data) {
    return renderNodes(parse(template).children, [data || {}]);
  }

  // ---------------------------------------------------------------------------
  // Modules
  //
  //   HospWidgets.define(name, deps, function (api) { return { derive, wire } })
  //
  // derive(data, opts, ctx) adds formatted fields; wire(root, data) adds
  // behavior after each render. A module file is a plain script that calls
  // define(), so it loads anywhere a <script> does.
  // ---------------------------------------------------------------------------

  var MODULE_ORDER = ['format', 'calendar', 'reviews', 'lightbox', 'pager'];
  var modules = Object.create(null);
  var pending = Object.create(null);

  function deferred() {
    var d = {};
    d.promise = new Promise(function (resolve, reject) { d.resolve = resolve; d.reject = reject; });
    return d;
  }

  function define(name, deps, factory) {
    if (modules[name]) return;
    var slot = pending[name] || (pending[name] = deferred());
    need(deps || []).then(function () {
      modules[name] = factory(api) || {};
      slot.resolve(modules[name]);
    }, slot.reject);
  }

  function need(names) {
    return Promise.all((names || []).map(function (name) {
      if (modules[name]) return modules[name];
      var slot = pending[name];
      if (!slot) {
        slot = pending[name] = deferred();
        var s = document.createElement('script');
        s.src = BASE.dir + 'modules/' + name + BASE.ext;
        s.async = true;
        s.onerror = function () {
          delete pending[name];
          slot.reject(new Error('could not load module ' + name + ' from ' + s.src));
        };
        (document.head || document.documentElement).appendChild(s);
      }
      return slot.promise;
    }));
  }

  /** Runs every loaded module's derive(), in a fixed order. */
  function derive(input, opts) {
    opts = opts || {};
    var d = {};
    for (var key in input) d[key] = input[key];
    var ctx = { locale: opts.locale || (document.documentElement && document.documentElement.lang) || navigator.language || 'en-US' };
    MODULE_ORDER.forEach(function (name) {
      if (modules[name] && modules[name].derive) modules[name].derive(d, opts, ctx);
    });
    return d;
  }

  // ---------------------------------------------------------------------------
  // Formatting, built in because nearly every widget needs it: labels, money,
  // dates, times, and the fields derived from property, host and list data.
  // calendar.js and reviews.js reuse these helpers through module('format').
  // Formatted fields never replace ones the data already has.
  // ---------------------------------------------------------------------------

  function formatModule() {
    function plural(n, one, many) {
      return n + ' ' + (n === 1 ? one : many);
    }

    function titleCase(slug) {
      return String(slug || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }).replace(/\b(And|Or|Of|With)\b/g, function (w) { return w.toLowerCase(); });
    }

    function sentenceCase(slug) {
      var s = String(slug || '').replace(/[_-]+/g, ' ').toLowerCase();
      return s.charAt(0).toUpperCase() + s.slice(1);
    }

    function money(amount, currency, locale, compact) {
      if (typeof amount !== 'number' || !isFinite(amount)) return '';
      var whole = compact || amount % 1 === 0;
      try {
        return new Intl.NumberFormat(locale, { style: 'currency', currency: currency || 'USD', maximumFractionDigits: whole ? 0 : 2, minimumFractionDigits: whole ? 0 : 2 }).format(amount);
      } catch (e) {
        return (currency || '') + ' ' + amount;
      }
    }

    function parseDate(iso) {
      var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
      return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
    }

    function isoDay(d) {
      return d.toISOString().slice(0, 10);
    }

    function date(iso, locale, options) {
      var d = parseDate(iso);
      if (!d) return '';
      try {
        var o = { timeZone: 'UTC' };
        for (var k in options) o[k] = options[k];
        return new Intl.DateTimeFormat(locale, o).format(d);
      } catch (e) {
        return iso;
      }
    }

    function time(hhmm, locale) {
      var m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || ''));
      if (!m) return hhmm || '';
      try {
        return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, 0, 1, +m[1], +m[2])));
      } catch (e) {
        return hhmm;
      }
    }

    function stars(rating) {
      var full = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
      return new Array(full + 1).join('★') + new Array(6 - full).join('☆');
    }

    function num(value) {
      var n = parseInt(value, 10);
      return isFinite(n) && n > 0 ? n : 0;
    }

    function setDefault(obj, key, value) {
      if (obj[key] === undefined && value !== undefined) obj[key] = value;
    }

    function copy(o) {
      var c = {};
      for (var k in o) c[k] = o[k];
      return c;
    }

    function today() {
      var now = new Date();
      return isoDay(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
    }

    function bedrooms(n) {
      return n === 0 ? 'Studio' : plural(n, 'bedroom', 'bedrooms');
    }

    var RULES = [
      ['pets_allowed', 'Pets', 'Pets allowed', 'No pets'],
      ['smoking_allowed', 'Smoking', 'Smoking allowed', 'No smoking'],
      ['events_allowed', 'Events', 'Events allowed', 'No parties or events'],
      ['children_allowed', 'Children', 'Children welcome', 'Not suitable for children']
    ];

    function derive(d, opts, ctx) {
      var locale = ctx.locale;
      var currency = d.currency || 'USD';

      // Key facts
      if (typeof d.max_guests === 'number') setDefault(d, 'guests_label', plural(d.max_guests, 'guest', 'guests'));
      if (typeof d.bedrooms === 'number') setDefault(d, 'bedrooms_label', bedrooms(d.bedrooms));
      if (typeof d.beds === 'number') setDefault(d, 'beds_label', plural(d.beds, 'bed', 'beds'));
      if (typeof d.bathrooms === 'number') setDefault(d, 'bathrooms_label', plural(d.bathrooms, 'bath', 'baths'));
      if (d.check_in) setDefault(d, 'check_in_formatted', time(d.check_in, locale));
      if (d.check_out) setDefault(d, 'check_out_formatted', time(d.check_out, locale));
      if (d.property_type) setDefault(d, 'property_type_label', titleCase(d.property_type));
      if (d.room_type) setDefault(d, 'room_type_label', sentenceCase(d.room_type));
      setDefault(d, 'location', [d.city, d.state, d.country].filter(Boolean).join(', ') || undefined);

      // Amenities: optional "top few"
      if (Array.isArray(d.amenities)) {
        var limit = num(opts.amenitiesLimit);
        d.amenity_count = d.amenities.length;
        d.amenities_all = d.amenities;
        if (limit && d.amenities.length > limit) {
          d.amenities_more = d.amenities.length - limit;
          d.amenities = d.amenities.slice(0, limit);
        }
      }

      // Photos: the viewer always gets all of them; the page may show fewer
      if (Array.isArray(d.photos)) {
        d.photo_count = d.photos.length;
        setDefault(d, 'cover_photo', d.photos[0] && d.photos[0].url);
        d.photos_all = d.photos.map(function (p, i) {
          var o = copy(p);
          setDefault(o, 'index', i);
          setDefault(o, 'thumbnail_url', p.url);
          setDefault(o, 'alt', p.caption || d.property_name || 'Photo ' + (i + 1));
          return o;
        });
        d.photos = d.photos_all;
        var plimit = num(opts.photosLimit);
        if (plimit && d.photos.length > plimit) {
          d.photos_more = d.photos.length - plimit;
          d.photos = d.photos.slice(0, plimit);
        }
        // Gallery layouts address photos by position: {photo_1.url} ... {photo_5.url}
        for (var pi = 0; pi < 5; pi++) setDefault(d, 'photo_' + (pi + 1), d.photos_all[pi]);
      }

      // House rules as a list
      if (!d.rules && ('pets_allowed' in d || 'smoking_allowed' in d || 'events_allowed' in d)) {
        d.rules = RULES.filter(function (r) { return typeof d[r[0]] === 'boolean'; }).map(function (r) {
          return { rule: r[1], allowed: d[r[0]], text: d[r[0]] ? r[2] : r[3] };
        });
      }

      // Rooms
      if (Array.isArray(d.rooms)) {
        d.rooms = d.rooms.map(function (room) {
          var o = copy(room);
          if (Array.isArray(room.beds) && !room.beds_text) {
            o.beds_text = room.beds.map(function (b) {
              var q = b.quantity || 1;
              var label = (b.label || titleCase(b.type) + ' bed').toLowerCase();
              return q + ' ' + (q === 1 ? label : label.replace(/bed$/, 'beds').replace(/(sofa|couch)$/, '$1s'));
            }).join(', ');
          }
          return o;
        });
        setDefault(d, 'room_count', d.rooms.length);
      }

      // Money
      if (Array.isArray(d.fees)) {
        d.fees = d.fees.map(function (f) {
          var o = copy(f);
          if (typeof f.amount === 'number' && !f.formatted) o.formatted = f.type === 'percent' ? f.amount + '%' : money(f.amount, currency, locale);
          return o;
        });
      }
      ['security_deposit', 'extra_guest_fee', 'pet_fee', 'cleaning_fee'].forEach(function (k) {
        if (typeof d[k] === 'number') setDefault(d, k + '_formatted', money(d[k], currency, locale));
      });

      // Local guide: the host's own names for Knowledge Hub topics
      if (Array.isArray(d.guide) && opts.guideTitles) {
        var names = {};
        try { names = JSON.parse(opts.guideTitles) || {}; } catch (e) { /* keep Hospitable's names */ }
        d.guide = d.guide.map(function (t) {
          var o = copy(t);
          if (names[t.title]) o.title = names[t.title];
          return o;
        });
      }

      // Host
      if (d.host_name) setDefault(d, 'host_initial', String(d.host_name).charAt(0).toUpperCase());

      // Property list
      if (Array.isArray(d.properties)) {
        d.properties = d.properties.map(function (p) {
          var o = copy(p);
          if (typeof p.price_from === 'number') setDefault(o, 'price_from_formatted', money(p.price_from, p.currency || currency, locale, true));
          if (typeof p.max_guests === 'number') setDefault(o, 'guests_label', plural(p.max_guests, 'guest', 'guests'));
          if (typeof p.bedrooms === 'number') setDefault(o, 'bedrooms_label', bedrooms(p.bedrooms));
          return o;
        });
        setDefault(d, 'property_count', d.properties.length);
      }

      if (d.updated_at) setDefault(d, 'updated_at_formatted', date(d.updated_at, locale, { month: 'short', day: 'numeric', year: 'numeric' }));
    }

    return {
      derive: derive,
      fmt: { plural: plural, titleCase: titleCase, money: money, parseDate: parseDate, isoDay: isoDay, date: date, stars: stars, num: num, setDefault: setDefault, copy: copy, today: today }
    };
  }

  // ---------------------------------------------------------------------------
  // Data. Every widget of a property asks for the same URL, which folds in all
  // its data sets: widgets on a page share one request, and the browser's
  // cache (the Worker's CACHE_MINUTES) serves it to the site's other pages and embeds.
  // ---------------------------------------------------------------------------

  var EVERYTHING = 'calendar,guide,host,reviews';

  var requests = Object.create(null);

  function fetchJSON(url) {
    if (requests[url]) return requests[url];
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, FETCH_TIMEOUT);
    var p = fetch(url, { signal: controller ? controller.signal : undefined, credentials: 'omit' })
      .then(function (res) {
        clearTimeout(timer);
        if (!res.ok) throw new Error('HTTP ' + res.status + ' from ' + url);
        return res.json();
      }, function (err) {
        clearTimeout(timer);
        throw err;
      });
    // Failed requests are not cached, so a later mount can retry.
    p.catch(function () { delete requests[url]; });
    requests[url] = p;
    return p;
  }

  function workerBase(url) {
    url = String(url || '').trim().replace(/\/+$/, '');
    if (!/^https:\/\//.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) {
      throw new Error('data-hosp-worker must be an https:// address, got "' + url + '"');
    }
    return url;
  }

  /** The Worker URLs that hold a widget's data sets. Throws on a bad snippet. */
  function dataUrls(worker, propertyId, datasets) {
    var base = workerBase(worker);
    var sets = datasets && datasets.length ? datasets : ['property'];
    var urls = [];
    var perProperty = sets.some(function (s) { return s !== 'host' && s !== 'properties'; });
    if (perProperty && !propertyId) throw new Error('data-hosp-property is missing');
    // A host-only widget that names a property shares that property's request.
    if (perProperty || (propertyId && sets.indexOf('host') !== -1)) {
      urls.push(base + '/api/properties/' + encodeURIComponent(propertyId) + '?include=' + EVERYTHING);
    } else if (sets.indexOf('host') !== -1) {
      urls.push(base + '/api/host');
    }
    if (sets.indexOf('properties') !== -1) urls.push(base + '/api/properties');
    return urls;
  }

  function fetchData(worker, propertyId, datasets) {
    var urls;
    try {
      urls = dataUrls(worker, propertyId, datasets);
    } catch (e) {
      return Promise.reject(e);
    }
    return Promise.all(urls.map(fetchJSON)).then(function (parts) {
      var merged = {};
      parts.forEach(function (part) {
        for (var k in part) {
          if (k === 'mode' || k === 'updated_at' || k === 'status') continue;
          merged[k] = part[k];
        }
        if (part.updated_at && (!merged.updated_at || part.updated_at < merged.updated_at)) merged.updated_at = part.updated_at;
        if (part.mode === 'dummy') merged.sample_data = true;
      });
      // The Worker lists the sets it couldn't load. A widget that needs one
      // of them falls back to the visitor's last copy instead.
      var lost = (merged.missing || []).filter(function (s) { return (datasets || []).indexOf(s) !== -1; });
      if (lost.length) throw new Error('the Worker could not load ' + lost.join(', '));
      return merged;
    });
  }

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------

  function readOptions(el) {
    var opts = {};
    var ds = el.dataset || {};
    for (var key in ds) {
      if (key.indexOf('hosp') !== 0 || key.length <= 4) continue;
      var name = key.charAt(4).toLowerCase() + key.slice(5);
      if (/^(template|worker|property|style|options|data|modules|eager|manual|fallback)$/.test(name)) continue;
      opts[name] = ds[key];
    }
    return opts;
  }

  function templateSource(id) {
    var node = document.getElementById(id);
    if (!node) return null;
    return node.tagName === 'TEMPLATE' ? node.innerHTML : node.textContent;
  }

  function fallbackData(el, id) {
    var node = document.getElementById(el.getAttribute('data-hosp-fallback') || (id ? id + '-fallback' : ''));
    if (!node) return null;
    try {
      return JSON.parse(node.textContent);
    } catch (e) {
      warn('fallback snapshot for "' + id + '" is not valid JSON');
      return null;
    }
  }

  function warn(msg) {
    if (window.console && console.warn) console.warn('[hospitable-widgets] ' + msg);
  }

  /**
   * Renders a template with data into el's shadow root, with whatever modules
   * are loaded. Missing ones are fetched, and the widget re-renders once they arrive.
   */
  function renderTo(el, template, data, opts, state) {
    opts = opts || readOptions(el);
    var root = el.shadowRoot || el.attachShadow({ mode: 'open' });
    var ctx = derive(data || {}, opts);
    var holder = document.createElement('template');
    holder.innerHTML = renderString(template, ctx);
    var style = document.createElement('style');
    // An image whose link was refused shows nothing rather than a broken icon.
    style.textContent = ':host{display:block}[hidden],img[src=""],img:not([src]){display:none!important}';
    root.innerHTML = '';
    root.appendChild(style);
    root.appendChild(holder.content);
    var imgs = root.querySelectorAll('img:not([loading])');
    for (var i = 0; i < imgs.length; i++) imgs[i].setAttribute('loading', 'lazy');
    MODULE_ORDER.forEach(function (name) {
      if (modules[name] && modules[name].wire) modules[name].wire(root, ctx);
    });
    el.setAttribute('data-hosp-state', state || 'preview');
    try {
      el.dispatchEvent(new CustomEvent('hosp:render', { bubbles: true, detail: { state: state || 'preview', data: ctx } }));
    } catch (e) { /* very old browsers */ }
    var missing = modules.analyze ? modules.analyze.plan(template).filter(function (n) { return !modules[n]; }) : [];
    if (missing.length) {
      need(missing).then(function () { renderTo(el, template, data, opts, state); }, function (err) { warn(err.message); });
    }
    return root;
  }

  function list(el, attr) {
    var v = el.getAttribute(attr);
    return v == null ? null : v.split(/[\s,]+/).filter(Boolean);
  }

  /** The widget's template: its own <template>, or the starter data-hosp names. */
  function templateOf(el) {
    var id = el.getAttribute('data-hosp-template');
    if (id) {
      var src = templateSource(id);
      return src == null ? Promise.reject(new Error('no <template id="' + id + '"> found')) : Promise.resolve(src);
    }
    return need(['templates']).then(function () {
      return modules.templates.compile(el.getAttribute('data-hosp'), el.getAttribute('data-hosp-options'), el.getAttribute('data-hosp-style'));
    });
  }

  /** { datasets, modules } for a widget: from the snippet, or worked out from its template. */
  function needsOf(el, template) {
    var datasets = list(el, 'data-hosp-data');
    var mods = list(el, 'data-hosp-modules');
    if (datasets && mods) return Promise.resolve({ datasets: datasets, modules: mods });
    return Promise.all([template, need(['analyze'])]).then(function (r) {
      var a = modules.analyze;
      datasets = datasets || a.analyze(r[0]).datasets;
      return { datasets: datasets, modules: mods || a.plan(r[0], datasets) };
    });
  }

  // The last data each widget showed is kept in the visitor's browser, so a
  // returning visitor still sees the widget while the Worker can't be reached.
  var CACHE = 'hosp:v2:';
  var stored = Object.create(null);

  // v1 kept a copy per widget; v2 keeps one per property. Clear the old ones.
  try {
    for (var n = localStorage.length - 1; n >= 0; n--) {
      if ((localStorage.key(n) || '').indexOf('hosp:v1:') === 0) localStorage.removeItem(localStorage.key(n));
    }
  } catch (e) { /* storage blocked */ }

  function remember(key, data) {
    // Widgets of one property share a key; a partial answer must not replace a full copy.
    if (stored[key] || data.missing) return;
    stored[key] = true;
    try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), data: data })); } catch (e) { /* storage full or blocked */ }
  }

  function recall(key) {
    try {
      var hit = JSON.parse(localStorage.getItem(key));
      return hit && hit.data ? hit.data : null;
    } catch (e) {
      return null;
    }
  }

  function unavailable(el) {
    var root = el.shadowRoot || el.attachShadow({ mode: 'open' });
    root.innerHTML = '<p style="margin:0;padding:16px;font:14px/1.5 system-ui,sans-serif;color:#71717a;text-align:center">This content can’t be shown right now. Please try again later.</p>';
    el.setAttribute('data-hosp-state', 'unavailable');
  }

  function mount(el) {
    if (el.__hospMounted) return el.__hospMounted;
    var id = el.getAttribute('data-hosp-template');
    var label = id || el.getAttribute('data-hosp');
    var opts = readOptions(el);
    var worker = el.getAttribute('data-hosp-worker');
    var property = el.getAttribute('data-hosp-property');
    var key = null;
    var done = false;
    var backupShown = false;

    // Template, code and data load side by side; data waits for nothing when
    // the snippet says what the widget needs.
    var template = templateOf(el);
    var needs = needsOf(el, template);
    var code = Promise.all([template, needs.then(function (n) { return need(n.modules); }).catch(function (err) { warn(err.message); })])
      .then(function (r) { return r[0]; });
    var data = needs.then(function (n) {
      try { key = CACHE + dataUrls(worker, property, n.datasets).join(' '); } catch (e) { /* fetchData reports it */ }
      return fetchData(worker, property, n.datasets);
    });

    // While the Worker is slow or down: the snippet's own snapshot (older
    // snippets), else this visitor's last copy, else a short message.
    function showBackup(reason) {
      if (done || backupShown) return Promise.resolve();
      return code.then(function (tpl) {
        if (done) return;
        var snapshot = fallbackData(el, id);
        var cached = snapshot ? null : key && recall(key);
        if (snapshot || cached) {
          backupShown = true;
          renderTo(el, tpl, snapshot || cached, opts, snapshot ? 'snapshot' : 'cached');
        } else if (reason) {
          warn('could not load "' + label + '" (' + reason + ')');
          unavailable(el);
        }
      }, function (err) {
        if (!reason) return;
        warn('could not load "' + label + '" (' + err.message + ')');
        unavailable(el);
      });
    }

    var slow = setTimeout(showBackup, SNAPSHOT_DELAY);
    var p = Promise.all([data, code]).then(function (r) {
      clearTimeout(slow);
      done = true;
      if (key) remember(key, r[0]);
      renderTo(el, r[1], r[0], opts, 'live');
    }, function (err) {
      clearTimeout(slow);
      return showBackup((err && err.message) || 'error').then(function () { done = true; });
    });
    el.__hospMounted = p;
    return p;
  }

  // Widgets mount as they near the viewport, so a widget nobody scrolls to
  // costs no Worker request. data-hosp-eager mounts right away.
  var observer = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        observer.unobserve(e.target);
        e.target.__hospResolve(mount(e.target));
      });
    }, { rootMargin: LAZY_MARGIN })
    : null;

  function scan(root) {
    var nodes = (root || document).querySelectorAll('[data-hosp-template], [data-hosp]');
    var all = [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.hasAttribute('data-hosp-manual')) continue;
      if (el.__hospMounted || el.__hospWaiting) {
        all.push(el.__hospMounted || el.__hospWaiting);
      } else if (observer && !el.hasAttribute('data-hosp-eager')) {
        el.__hospWaiting = new Promise(function (resolve) { el.__hospResolve = resolve; });
        observer.observe(el);
        all.push(el.__hospWaiting);
        // Warm the code now; it is small and cached.
        if (el.getAttribute('data-hosp-modules')) need(list(el, 'data-hosp-modules')).catch(function () {});
        if (el.hasAttribute('data-hosp') && !el.hasAttribute('data-hosp-template')) templateOf(el).catch(function () {});
      } else {
        all.push(mount(el));
      }
    }
    return Promise.all(all);
  }

  // ---------------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------------

  modules.format = formatModule();

  var api = {
    version: VERSION,
    base: BASE,
    render: renderString,
    parse: parse,
    renderTo: renderTo,
    derive: derive,
    // After need(['analyze']): what a template needs.
    analyze: function (t) { return modules.analyze.analyze(t); },
    plan: function (t, sets) { return modules.analyze.plan(t, sets); },
    fetchData: fetchData,
    define: define,
    need: need,
    module: function (name) { return modules[name]; },
    mount: mount,
    scan: scan,
    escape: escapeHTML,
    warn: warn
  };
  window.HospWidgets = api;

  function start() {
    scan();
    if (typeof MutationObserver === 'function') {
      // Site builders often add embeds after load.
      var queued = false;
      new MutationObserver(function (records) {
        if (queued) return;
        for (var i = 0; i < records.length; i++) {
          if (records[i].addedNodes.length) {
            queued = true;
            setTimeout(function () { queued = false; scan(); }, 50);
            return;
          }
        }
      }).observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
