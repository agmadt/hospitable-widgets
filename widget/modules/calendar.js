/*! Hospitable Listing Widgets | modules/calendar.js | MIT
 *  Availability: price from, minimum stay, next opening, and month grids. */
(function (H) {
  'use strict';
  if (!H) return;

  H.define('calendar', ['format'], function (api) {
    var f = api.module('format').fmt;

    function weekStart(locale, opt) {
      if (opt === '0' || opt === 'sunday') return 0;
      if (opt === '1' || opt === 'monday') return 1;
      try {
        var info = new Intl.Locale(locale);
        var wi = info.getWeekInfo ? info.getWeekInfo() : info.weekInfo;
        if (wi && wi.firstDay) return wi.firstDay % 7;
      } catch (e) { /* older browsers */ }
      return 0;
    }

    function months(days, opts, currency, locale) {
      var byDate = Object.create(null);
      days.forEach(function (d) { byDate[d.date] = d; });
      var count = f.num(opts.months) || 12;
      var first = weekStart(locale, opts.weekStart);
      var now = f.today();
      var start = f.parseDate(now);
      var dayLabel = new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
      var weekdays = [];
      for (var w = 0; w < 7; w++) {
        // 2023-01-01 was a Sunday.
        weekdays.push({ label: f.date(f.isoDay(new Date(Date.UTC(2023, 0, 1 + ((first + w) % 7)))), locale, { weekday: 'short' }) });
      }
      var out = [];
      for (var i = 0; i < count; i++) {
        var monthStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
        var y = monthStart.getUTCFullYear();
        var mo = monthStart.getUTCMonth();
        var daysInMonth = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
        var cells = [];
        for (var p = (monthStart.getUTCDay() - first + 7) % 7; p > 0; p--) cells.push({ blank: true, state: 'blank', day: '' });
        for (var n = 1; n <= daysInMonth; n++) {
          var day = new Date(Date.UTC(y, mo, n));
          var iso = f.isoDay(day);
          var info = byDate[iso];
          var past = iso < now;
          var available = !past && !!info && info.available === true;
          cells.push({
            day: n,
            date: iso,
            label: dayLabel.format(day),
            past: past,
            today: iso === now,
            available: available,
            booked: !past && !!info && !available,
            unknown: !past && !info,
            state: past ? 'past' : !info ? 'unknown' : available ? 'available' : 'booked',
            price: available ? info.price : null,
            price_formatted: available ? f.money(info.price, currency, locale, true) : '',
            min_stay: info ? info.min_stay : null
          });
        }
        while (cells.length % 7) cells.push({ blank: true, state: 'blank', day: '' });
        var weeks = [];
        for (var c = 0; c < cells.length; c += 7) weeks.push({ days: cells.slice(c, c + 7) });
        var iso1 = f.isoDay(monthStart);
        out.push({ label: f.date(iso1, locale, { month: 'long', year: 'numeric' }), month: f.date(iso1, locale, { month: 'long' }), year: y, weekdays: weekdays, weeks: weeks });
      }
      return out;
    }

    function derive(d, opts, ctx) {
      var locale = ctx.locale;
      var currency = d.currency || 'USD';
      if (Array.isArray(d.calendar)) {
        var now = f.today();
        var open = d.calendar.filter(function (day) { return day.date >= now && day.available && typeof day.price === 'number'; });
        if (open.length) {
          f.setDefault(d, 'price_from', Math.min.apply(null, open.map(function (day) { return day.price; })));
          f.setDefault(d, 'next_available', f.date(open[0].date, locale, { month: 'long', day: 'numeric' }));
          var stays = open.map(function (day) { return day.min_stay; }).filter(function (n) { return typeof n === 'number' && n > 0; });
          if (stays.length) f.setDefault(d, 'min_stay', Math.min.apply(null, stays));
        }
        d.available_nights = open.length;
        if (!d.months) d.months = months(d.calendar, opts, currency, locale);
      }
      if (typeof d.price_from === 'number') f.setDefault(d, 'price_from_formatted', f.money(d.price_from, currency, locale, true));
      if (typeof d.min_stay === 'number') f.setDefault(d, 'min_stay_label', f.plural(d.min_stay, 'night', 'nights') + ' minimum');
    }

    return { derive: derive };
  });
})(window.HospWidgets);
