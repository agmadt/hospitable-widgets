/*! Hospitable Listing Widgets | modules/reviews.js | MIT
 *  Reviews: the host's display choices (picked, minimum rating, order,
 *  limit), stars, dates, and the rating summary. */
(function (H) {
  'use strict';
  if (!H) return;

  H.define('reviews', ['format'], function (api) {
    var f = api.module('format').fmt;
    var PLATFORMS = { airbnb: 'Airbnb', homeaway: 'Vrbo', vrbo: 'Vrbo', booking: 'Booking.com', direct: 'Direct booking', google: 'Google' };

    function byDate(a, b) {
      return String(b.date).localeCompare(String(a.date));
    }

    function derive(d, opts, ctx) {
      if (Array.isArray(d.reviews)) {
        var list = d.reviews.slice();
        if (opts.reviewIds) {
          var ids = String(opts.reviewIds).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
          list = ids.map(function (id) { return list.filter(function (r) { return String(r.id) === id; })[0]; }).filter(Boolean);
        }
        var min = parseFloat(opts.minRating);
        if (min > 0) list = list.filter(function (r) { return typeof r.rating === 'number' && r.rating >= min; });
        if (opts.reviewsWithText !== 'false') list = list.filter(function (r) { return r.text && String(r.text).trim(); });
        if (opts.reviewsSort === 'highest') list.sort(function (a, b) { return (b.rating || 0) - (a.rating || 0) || byDate(a, b); });
        else if (!opts.reviewIds) list.sort(byDate);
        var limit = f.num(opts.reviewsLimit);
        if (limit) list = list.slice(0, limit);
        d.reviews = list.map(function (r) {
          var o = f.copy(r);
          f.setDefault(o, 'stars', f.stars(r.rating));
          f.setDefault(o, 'date_formatted', f.date(r.date, ctx.locale, { month: 'long', year: 'numeric' }));
          f.setDefault(o, 'guest_initial', String(r.guest_name || '?').charAt(0).toUpperCase());
          f.setDefault(o, 'platform_label', r.platform ? PLATFORMS[String(r.platform).toLowerCase()] || f.titleCase(r.platform) : '');
          return o;
        });
        d.reviews_shown = d.reviews.length;
      }
      if (typeof d.rating_average === 'number') {
        f.setDefault(d, 'rating_average_formatted', (Math.round(d.rating_average * 100) / 100).toFixed(2).replace(/0$/, ''));
        f.setDefault(d, 'rating_stars', f.stars(d.rating_average));
        f.setDefault(d, 'rating_percent', Math.round((d.rating_average / 5) * 100));
      }
      if (typeof d.review_count === 'number') f.setDefault(d, 'review_count_label', f.plural(d.review_count, 'review', 'reviews'));
    }

    return { derive: derive };
  });
})(window.HospWidgets);
