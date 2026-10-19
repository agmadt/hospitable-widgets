/*! Hospitable Listing Widgets | modules/lightbox.js | MIT
 *  data-hosp-lightbox on a container: its images open a full-screen viewer
 *  with a filmstrip (arrow keys, swipe, Esc). data-hosp-open="3" on a button
 *  opens photo 3. */
(function (H) {
  'use strict';
  if (!H) return;

  var CSS =
    '.hosp-lb{position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;background:rgba(10,10,12,.96);color:#fff;font:14px/1.4 system-ui,-apple-system,sans-serif;animation:hosp-in .2s ease-out}' +
    '.hosp-lb-bar{flex:none;display:flex;align-items:center;justify-content:space-between;padding:12px 16px;font-variant-numeric:tabular-nums}' +
    '.hosp-lb-stage{position:relative;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:0 72px;touch-action:pan-y}' +
    '.hosp-lb-stage img{max-width:100%;max-height:100%;object-fit:contain;border-radius:6px;user-select:none;-webkit-user-drag:none;transition:opacity .2s}' +
    '.hosp-lb .hosp-lb-btn{all:unset;box-sizing:border-box;display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.12);cursor:pointer;transition:background .15s}' +
    '.hosp-lb .hosp-lb-btn:hover,.hosp-lb .hosp-lb-btn:focus-visible{background:rgba(255,255,255,.26)}' +
    '.hosp-lb .hosp-lb-btn svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}' +
    '.hosp-lb .hosp-lb-nav{position:absolute;top:50%;transform:translateY(-50%)}.hosp-lb .hosp-lb-prev{left:16px}.hosp-lb .hosp-lb-next{right:16px}' +
    '.hosp-lb-cap{flex:none;min-height:1.4em;padding:12px 16px 0;text-align:center;opacity:.85}' +
    '.hosp-lb-strip{flex:none;display:flex;gap:6px;justify-content:safe center;overflow-x:auto;padding:12px 16px 16px;scrollbar-width:none}' +
    '.hosp-lb-strip::-webkit-scrollbar{display:none}' +
    '.hosp-lb-strip button{all:unset;flex:none;width:64px;height:44px;border-radius:6px;overflow:hidden;cursor:pointer;opacity:.45;transition:opacity .15s}' +
    '.hosp-lb-strip button:hover,.hosp-lb-strip button[aria-current]{opacity:1}.hosp-lb-strip button[aria-current]{box-shadow:0 0 0 2px #fff}' +
    '.hosp-lb-strip button:focus-visible{outline:2px solid #fff;outline-offset:2px}' +
    '.hosp-lb-strip img{display:block;width:100%;height:100%;object-fit:cover}' +
    '@media (max-width:600px){.hosp-lb-stage{padding:0}.hosp-lb .hosp-lb-nav{background:rgba(0,0,0,.45)}.hosp-lb .hosp-lb-prev{left:8px}.hosp-lb .hosp-lb-next{right:8px}}' +
    '@media (max-height:520px){.hosp-lb-strip{display:none}}' +
    '@keyframes hosp-in{from{opacity:0}}@media (prefers-reduced-motion:reduce){.hosp-lb{animation:none}.hosp-lb-stage img{transition:none}}';
  var SAFE = /^https:\/\//i;
  var ICON = { close: 'M6 6l12 12M18 6 6 18', prev: 'M15 5l-7 7 7 7', next: 'M9 5l7 7-7 7' };

  function button(cls, label, icon) {
    return '<button type="button" class="hosp-lb-btn ' + cls + '" aria-label="' + label + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICON[icon] + '"/></svg></button>';
  }

  H.define('lightbox', [], function () {
    function wire(root, ctx) {
      var boxes = root.querySelectorAll('[data-hosp-lightbox]');
      if (!boxes.length) return;
      var style = document.createElement('style');
      style.textContent = CSS;
      root.appendChild(style);
      for (var i = 0; i < boxes.length; i++) setUp(root, boxes[i], ctx);
    }

    function setUp(root, box, ctx) {
      var imgs = Array.prototype.slice.call(box.querySelectorAll('img'));
      var all = ctx.photos_all || ctx.photos || [];
      var items = all.length >= imgs.length
        ? all.map(function (p) { return { src: p.url, thumb: p.thumbnail_url || p.url, caption: p.caption || '' }; })
        : imgs.map(function (img) { return { src: img.getAttribute('data-full') || img.src, thumb: img.src, caption: img.alt || '' }; });
      imgs.forEach(function (img, i) {
        var at = img.hasAttribute('data-index') ? +img.getAttribute('data-index') : i;
        img.style.cursor = 'zoom-in';
        img.setAttribute('tabindex', '0');
        img.setAttribute('role', 'button');
        img.addEventListener('click', function () { open(at); });
        img.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(at); } });
      });
      Array.prototype.forEach.call(box.querySelectorAll('[data-hosp-open]'), function (btn) {
        btn.addEventListener('click', function () { open(+btn.getAttribute('data-hosp-open') || 0); });
      });

      function open(start) {
        if (!items.length) return;
        var index = Math.max(0, Math.min(items.length - 1, start));
        var many = items.length > 1;
        var lastFocus = root.activeElement || document.activeElement;
        var prevOverflow = document.documentElement.style.overflow;
        var lb = document.createElement('div');
        lb.className = 'hosp-lb';
        lb.setAttribute('role', 'dialog');
        lb.setAttribute('aria-modal', 'true');
        lb.setAttribute('aria-label', 'Photo viewer');
        lb.innerHTML = '<div class="hosp-lb-bar"><span class="hosp-lb-count" aria-live="polite"></span>' + button('hosp-lb-close', 'Close', 'close') + '</div>' +
          '<div class="hosp-lb-stage"><img alt="">' + (many ? button('hosp-lb-nav hosp-lb-prev', 'Previous photo', 'prev') + button('hosp-lb-nav hosp-lb-next', 'Next photo', 'next') : '') + '</div>' +
          '<div class="hosp-lb-cap"></div>' + (many ? '<div class="hosp-lb-strip"></div>' : '');
        var q = function (s) { return lb.querySelector(s); };
        var img = q('.hosp-lb-stage img');
        var strip = q('.hosp-lb-strip');
        var thumbs = [];

        if (strip) {
          items.forEach(function (it, i) {
            var b = document.createElement('button');
            b.type = 'button';
            b.setAttribute('aria-label', 'Photo ' + (i + 1));
            if (SAFE.test(it.thumb)) b.innerHTML = '<img alt="" loading="lazy" src="' + H.escape(it.thumb) + '">';
            b.addEventListener('click', function () { index = i; show(); });
            strip.appendChild(b);
            thumbs.push(b);
          });
        }

        img.addEventListener('load', function () { img.style.opacity = '1'; });
        function show() {
          var it = items[index];
          img.style.opacity = '0';
          if (SAFE.test(it.src)) img.src = it.src;
          img.alt = it.caption || 'Photo ' + (index + 1);
          q('.hosp-lb-cap').textContent = it.caption;
          q('.hosp-lb-count').textContent = index + 1 + ' / ' + items.length;
          thumbs.forEach(function (t, i) {
            if (i === index) {
              t.setAttribute('aria-current', 'true');
              if (t.scrollIntoView) t.scrollIntoView({ block: 'nearest', inline: 'center' });
            } else {
              t.removeAttribute('aria-current');
            }
          });
          // Warm the neighbours so arrowing feels instant.
          [1, -1].forEach(function (step) {
            var n = items[(index + step + items.length) % items.length];
            if (n && SAFE.test(n.src)) new Image().src = n.src;
          });
        }
        function go(step) { index = (index + step + items.length) % items.length; show(); }
        function close() {
          document.removeEventListener('keydown', onKey, true);
          if (lb.parentNode) lb.parentNode.removeChild(lb);
          document.documentElement.style.overflow = prevOverflow;
          if (lastFocus && lastFocus.focus) lastFocus.focus();
        }
        function onKey(e) {
          if (e.key === 'Escape') { e.preventDefault(); close(); }
          else if (e.key === 'ArrowRight' && many) { e.preventDefault(); go(1); }
          else if (e.key === 'ArrowLeft' && many) { e.preventDefault(); go(-1); }
          else if (e.key === 'Tab') {
            // Keep focus inside the viewer.
            var f = Array.prototype.slice.call(lb.querySelectorAll('button'));
            e.preventDefault();
            f[(f.indexOf(root.activeElement) + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
          }
        }
        q('.hosp-lb-close').addEventListener('click', close);
        if (many) {
          q('.hosp-lb-prev').addEventListener('click', function () { go(-1); });
          q('.hosp-lb-next').addEventListener('click', function () { go(1); });
        }
        // A click on the dark area around the photo closes the viewer.
        q('.hosp-lb-stage').addEventListener('click', function (e) { if (e.target === e.currentTarget) close(); });
        var x0 = null;
        q('.hosp-lb-stage').addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
        q('.hosp-lb-stage').addEventListener('touchend', function (e) {
          if (x0 === null) return;
          var dx = e.changedTouches[0].clientX - x0;
          if (Math.abs(dx) > 40 && many) go(dx < 0 ? 1 : -1);
          x0 = null;
        });
        document.addEventListener('keydown', onKey, true);
        document.documentElement.style.overflow = 'hidden';
        root.appendChild(lb);
        show();
        q('.hosp-lb-close').focus();
      }
    }

    return { wire: wire };
  });
})(window.HospWidgets);
