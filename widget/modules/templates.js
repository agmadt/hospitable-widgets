/*! Hospitable Listing Widgets | modules/templates.js | MIT
 *  The starter templates in templates/*.html, for snippets that name one
 *  (<div data-hosp="gallery">) instead of carrying their own HTML. Applies the
 *  builder's options and style, and loads web fonts into the page. */
(function (H) {
  'use strict';
  if (!H) return;

  H.define('templates', [], function (api) {
    // [label, font stack, Google Fonts family]. "site" sets no font, so the
    // widget inherits the website's own (not inside an iframe, such as Wix's).
    var FONTS = {
      site: ['Same as my website', null],
      system: ['System (matches most sites)', 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'],
      inter: ['Inter', 'Inter, ui-sans-serif, system-ui, sans-serif', 'Inter:wght@400;600;700'],
      'dm-sans': ['DM Sans', '"DM Sans", ui-sans-serif, system-ui, sans-serif', 'DM+Sans:wght@400;600;700'],
      poppins: ['Poppins', 'Poppins, ui-sans-serif, system-ui, sans-serif', 'Poppins:wght@400;600;700'],
      montserrat: ['Montserrat', 'Montserrat, ui-sans-serif, system-ui, sans-serif', 'Montserrat:wght@400;600;700'],
      nunito: ['Nunito', 'Nunito, ui-sans-serif, system-ui, sans-serif', 'Nunito:wght@400;600;700'],
      lora: ['Lora (serif)', 'Lora, Georgia, serif', 'Lora:wght@400;600;700'],
      playfair: ['Playfair Display (serif)', '"Playfair Display", Georgia, serif', 'Playfair+Display:wght@500;600;700'],
      cormorant: ['Cormorant Garamond (serif)', '"Cormorant Garamond", Georgia, serif', 'Cormorant+Garamond:wght@500;600;700'],
      georgia: ['Georgia (serif)', 'Georgia, "Times New Roman", serif']
    };
    var STYLE = { accent: '#0f766e', text: '#1c1917', background: '#ffffff', font: 'system', headingFont: 'same', radius: '16', space: '16', card: 'card-border' };
    var files = Object.create(null);

    function fetchText(name) {
      if (!files[name]) {
        files[name] = fetch(api.base.dir + 'templates/' + name, { credentials: 'omit' }).then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status + ' for templates/' + name);
          return res.text();
        });
        files[name].catch(function () { delete files[name]; });
      }
      return files[name];
    }

    /** "<!--hw {meta} -->body" → { meta, body } */
    function parse(text) {
      var m = /^\s*<!--hw\s*([\s\S]*?)-->\s*/.exec(text);
      if (!m) return { meta: { name: 'Widget', options: [] }, body: text };
      return { meta: JSON.parse(m[1]), body: text.slice(m[0].length).trim() };
    }

    function load(type) {
      if (!/^[a-z][a-z-]*$/.test(type)) return Promise.reject(new Error('unknown widget type "' + type + '"'));
      return fetchText(type + '.html').then(parse);
    }

    function baseCss() {
      return fetchText('_base.css').then(function (css) { return css.replace(/\s*\n\s*/g, ''); });
    }

    function isOn(v) {
      return v !== undefined && v !== null && ['', 'off', '0', 'false'].indexOf(String(v)) === -1;
    }

    var HTTPS = /^https:\/\/[^\s"'<>]+\.[^\s"'<>]+$/;

    /** An option's value as template text. */
    function optionText(value, type, tokens) {
      var v = String(value == null ? '' : value);
      if (type === 'url') return HTTPS.test(v.trim()) ? api.escape(v.trim()) : '#';
      // A pattern may contain {id}, which the template engine fills in per property.
      if (type === 'pattern') return /^https:\/\/[^\s"'<>]+$/.test(v.trim()) ? v.trim().replace(/"/g, '%22') : '#';
      // Typed text must not become a template tag, except the option's own tokens
      // ({count}). A zero-width space after "{" survives the HTML parser; an entity would not.
      tokens = tokens || {};
      return api.escape(v).replace(/\{(\w+)\}|\{|\[\[/g, function (m, name) {
        if (name && tokens[name]) return '{' + tokens[name] + '}';
        return m === '[[' ? '[​[' : '{​' + m.slice(1);
      });
    }

    /** Every option with its default, then the snippet's choices on top. */
    function values(meta, chosen) {
      var out = {};
      (meta.options || []).forEach(function (o) { out[o.key] = o['default'] == null ? '' : o['default']; });
      for (var k in chosen) out[k] = chosen[k];
      return out;
    }

    // Builder-time tags: [[key]], [[#key]]…[[/key]], [[^key]]…[[/key]], [[#key=value]]…[[/key=value]]
    var SECTION = /\[\[([#^])([\w-]+)(?:=([\w-]+))?\]\]([\s\S]*?)\[\[\/\2(?:=\3)?\]\]/g;

    function applyOptions(body, vals, meta) {
      var byKey = {};
      ((meta && meta.options) || []).forEach(function (o) { byKey[o.key] = o; });
      var out = body;
      // Sections can nest; each pass resolves the outermost ones.
      for (var pass = 0; pass < 20 && /\[\[[#^]/.test(out); pass++) {
        out = out.replace(SECTION, function (all, sigil, key, eq, inner) {
          var on = eq !== undefined && eq !== '' ? String(vals[key]) === eq : isOn(vals[key]);
          return (sigil === '#') === on ? inner : '';
        });
      }
      return out.replace(/\[\[([\w-]+)\]\]/g, function (all, key) {
        var o = byKey[key] || {};
        return optionText(vals[key], o.type, o.tokens);
      });
    }

    function style(chosen) {
      var s = {};
      for (var k in STYLE) s[k] = chosen && chosen[k] != null && chosen[k] !== '' ? chosen[k] : STYLE[k];
      if (chosen && chosen.card === '') s.card = '';
      return s;
    }

    /** Black or white, whichever reads better on the accent color. */
    function onAccent(hex) {
      var n = parseInt(String(hex).replace('#', ''), 16);
      if (isNaN(n)) return '#ffffff';
      var c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (x) {
        x /= 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] > 0.45 ? '#111111' : '#ffffff';
    }

    var COLOR = /^#[0-9a-f]{3,8}$/i;
    // "google:Playfair Display": any Google font the host types in.
    var GOOGLE = /^google:([A-Za-z0-9][A-Za-z0-9 ]{0,39})$/;

    function fontOf(key) {
      if (FONTS[key]) return FONTS[key];
      var m = GOOGLE.exec(String(key || ''));
      if (!m) return null;
      var name = m[1].replace(/ +/g, ' ').trim();
      // Only the regular weight: asking for weights a family lacks fails the whole request.
      return [name, '"' + name + '", ui-sans-serif, system-ui, sans-serif', name.replace(/ /g, '+')];
    }

    /** The --hw-* variables every starter template reads. */
    function styleCss(chosen) {
      var s = style(chosen);
      var font = fontOf(s.font) || FONTS.system;
      var heading = s.headingFont === 'same' ? font : fontOf(s.headingFont) || font;
      var color = function (v, fallback) { return COLOR.test(v) ? v : fallback; };
      var px = function (v, fallback) { var n = parseFloat(v); return isFinite(n) ? Math.max(0, Math.min(64, n)) + 'px' : fallback; };
      // Without --hw-font, "font-family: var(--hw-font)" falls back to inheriting the page's font.
      return ':host{--hw-accent:' + color(s.accent, STYLE.accent) + ';--hw-text:' + color(s.text, STYLE.text) + ';--hw-bg:' + color(s.background, STYLE.background) +
        (font[1] ? ';--hw-font:' + font[1] : '') + (heading[1] ? ';--hw-heading-font:' + heading[1] : '') +
        ';--hw-radius:' + px(s.radius, '16px') + ';--hw-space:' + px(s.space, '16px') +
        ';--hw-on-accent:' + onAccent(color(s.accent, STYLE.accent)) + '}';
    }

    /** Google Fonts stylesheet for the chosen fonts, or "". */
    function fontHref(chosen) {
      var s = style(chosen);
      var fams = [];
      [s.font, s.headingFont].forEach(function (k) {
        var f = fontOf(k);
        if (f && f[2] && fams.indexOf(f[2]) === -1) fams.push(f[2]);
      });
      return fams.length ? 'https://fonts.googleapis.com/css2?' + fams.map(function (f) { return 'family=' + f; }).join('&') + '&display=swap' : '';
    }

    /** Fonts must be declared in the page: a font loaded inside a shadow root isn't applied. */
    function useFonts(chosen) {
      var href = fontHref(chosen);
      if (!href || document.querySelector('link[data-hosp-font="' + href + '"]')) return;
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.setAttribute('data-hosp-font', href);
      (document.head || document.documentElement).appendChild(link);
    }

    /** The finished template: style variables, shared CSS and the body with options applied. */
    function render(starter, chosenOptions, chosenStyle, css) {
      var vals = values(starter.meta, chosenOptions);
      vals.card = style(chosenStyle).card;
      return '<style>' + styleCss(chosenStyle) + '\n' + css + '</style>\n' + applyOptions(starter.body, vals, starter.meta);
    }

    /** "a=1&b=two%20words" → { a: '1', b: 'two words' } */
    function readParams(str) {
      var out = {};
      String(str || '').split('&').forEach(function (pair) {
        if (!pair) return;
        var i = pair.indexOf('=');
        var k = decodeURIComponent((i < 0 ? pair : pair.slice(0, i)).replace(/\+/g, ' '));
        out[k] = i < 0 ? '' : decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' '));
      });
      return out;
    }

    function writeParams(obj) {
      return Object.keys(obj).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]); }).join('&');
    }

    /** Loads a starter and renders it with a snippet's options and style. */
    function compile(type, optionsParam, styleParam) {
      var chosenStyle = readParams(styleParam);
      useFonts(chosenStyle);
      return Promise.all([load(type), baseCss()]).then(function (r) {
        return render(r[0], readParams(optionsParam), chosenStyle, r[1]);
      });
    }

    return {
      FONTS: FONTS,
      fontOf: fontOf,
      STYLE: STYLE,
      parse: parse,
      load: load,
      baseCss: baseCss,
      isOn: isOn,
      optionText: optionText,
      values: values,
      applyOptions: applyOptions,
      styleCss: styleCss,
      fontHref: fontHref,
      useFonts: useFonts,
      render: render,
      readParams: readParams,
      writeParams: writeParams,
      compile: compile
    };
  });
})(window.HospWidgets);
