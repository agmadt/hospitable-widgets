/*! Hospitable Listing Widgets | modules/pager.js | MIT
 *  data-hosp-pager on a container of data-hosp-page children, with
 *  data-hosp-prev / data-hosp-next buttons and an optional
 *  data-hosp-page-label. data-hosp-per-view="2" or "auto" shows several pages
 *  side by side; the count is in the CSS variable --hosp-per-view. */
(function (H) {
  'use strict';
  if (!H) return;

  H.define('pager', [], function () {
    function setUp(box) {
      var pages = Array.prototype.slice.call(box.querySelectorAll('[data-hosp-page]'));
      var prev = box.querySelector('[data-hosp-prev]');
      var next = box.querySelector('[data-hosp-next]');
      var label = box.querySelector('[data-hosp-page-label]');
      var mode = box.getAttribute('data-hosp-per-view') || '1';
      var at = 0;

      function perView() {
        if (mode !== 'auto') return Math.max(1, parseInt(mode, 10) || 1);
        var min = parseInt(box.getAttribute('data-hosp-min-width'), 10) || 280;
        return Math.max(1, Math.floor((box.clientWidth || min) / min));
      }
      function update() {
        var n = perView();
        at = Math.max(0, Math.min(at, Math.max(0, pages.length - n)));
        pages.forEach(function (p, i) { p.hidden = i < at || i >= at + n; });
        if (prev) prev.disabled = at === 0;
        if (next) next.disabled = at + n >= pages.length;
        if (label) label.textContent = pages.length ? (n > 1 ? at + 1 + '–' + Math.min(pages.length, at + n) : String(at + 1)) + ' / ' + pages.length : '';
        box.style.setProperty('--hosp-per-view', String(n));
      }
      function step(dir) { at += dir * perView(); update(); }

      if (prev) prev.addEventListener('click', function () { step(-1); });
      if (next) next.addEventListener('click', function () { step(1); });
      box.addEventListener('keydown', function (e) {
        if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
        if (e.key === 'ArrowRight') step(1);
        else if (e.key === 'ArrowLeft') step(-1);
      });
      if (mode === 'auto' && typeof ResizeObserver === 'function') new ResizeObserver(update).observe(box);
      update();
    }

    return {
      wire: function (root) {
        Array.prototype.forEach.call(root.querySelectorAll('[data-hosp-pager]'), setUp);
      }
    };
  });
})(window.HospWidgets);
