/*! Hospitable Listing Widgets | modules/analyze.js | MIT
 *  Works out what a template needs: its data sets (from the fields it uses)
 *  and the modules that format and animate it (formatting itself is built in). The builder writes the answer
 *  into each snippet (data-hosp-data, data-hosp-modules), so websites only
 *  load this for hand-written snippets. */
(function (H) {
  'use strict';
  if (!H) return;

  H.define('analyze', [], function (api) {
    var DATASETS = [
      ['calendar', /^(calendar|months|price_from|min_stay|next_available|available_nights)/],
      ['reviews', /^(reviews|rating_|review_count)/],
      ['guide', /^guide/],
      ['host', /^host_/],
      ['properties', /^properties$/]
    ];

    // Fields that hold lists of objects. Names inside a section over one of
    // them belong to its items: a property card's {price_from} does not mean
    // the page needs a calendar.
    var LIST_FIELDS = /^(properties|photos|photos_all|amenities_all|rooms|fees|channels|reviews|calendar|months|guide|rules|weeks|days|items)$/;

    function rootNames(nodes, names, inList) {
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (node.type === 'text' || node.name === '.') continue;
        var root = node.name.split('.')[0];
        if (!inList) names[root] = true;
        if (node.children) rootNames(node.children, names, inList || (node.type === 'section' && LIST_FIELDS.test(root)));
      }
      return names;
    }

    function analyze(template) {
      var names = Object.keys(rootNames(api.parse(template).children, {}, false));
      var sets = {};
      var needsProperty = false;
      names.forEach(function (n) {
        var hit = null;
        for (var i = 0; i < DATASETS.length; i++) {
          if (DATASETS[i][1].test(n)) { hit = DATASETS[i][0]; break; }
        }
        if (hit) sets[hit] = true;
        else if (!/^_/.test(n)) needsProperty = true;
      });
      if (needsProperty || sets.calendar || sets.reviews || sets.guide) sets.property = true;
      return { fields: names, datasets: Object.keys(sets) };
    }

    function plan(template, datasets) {
      var sets = datasets || analyze(template).datasets;
      var mods = [];
      if (sets.indexOf('calendar') !== -1) mods.push('calendar');
      if (sets.indexOf('reviews') !== -1) mods.push('reviews');
      if (/data-hosp-(lightbox|open)/.test(template)) mods.push('lightbox');
      if (/data-hosp-pager/.test(template)) mods.push('pager');
      return mods;
    }

    return { analyze: analyze, plan: plan };
  });
})(window.HospWidgets);
