// scorecard/render.js — 지표 스코어보드 순수 변환 (UMD: Node + 브라우저)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Scorecard = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function parseDate(s) { return new Date((s.length === 7 ? s + '-01' : s) + 'T00:00:00Z'); }
  function cutoff(rangeMonths, asOf) {
    var d = (typeof asOf === 'string') ? parseDate(asOf) : new Date(asOf);
    d.setUTCMonth(d.getUTCMonth() - rangeMonths); return d;
  }
  function filterRange(history, rangeMonths, asOf) {
    const co = cutoff(rangeMonths, asOf);
    return (history || []).filter(function (p) { return parseDate(p[0]) >= co; });
  }
  function changeInfo(history) {
    var h = (history || []).filter(function (p) { return p[1] != null; });
    if (!h.length) return { latest: null, prev: null, pct: null, up: null };
    var latest = h[h.length - 1][1];
    var prev = h.length >= 2 ? h[h.length - 2][1] : null;
    var pct = null, up = null;
    if (prev != null && prev !== 0) { pct = (latest - prev) / prev * 100; up = pct >= 0; }
    return { latest: latest, prev: prev, pct: pct, up: up };
  }
  function dayLabel(s) { return s.slice(5, 7) + '/' + s.slice(8, 10); }
  function monthLabel(ym) { return ym.slice(2, 4) + '.' + ym.slice(5, 7); }
  function aggregate(history, gran) {
    var h = (history || []).filter(function (p) { return p[1] != null; });
    if (gran === 'day') {
      var step = Math.max(1, Math.ceil(h.length / 180));
      var out = h.filter(function (_, i) { return i % step === 0 || i === h.length - 1; });
      return out.map(function (p) { return [dayLabel(p[0]), p[1], p[2] !== false]; });
    }
    var bucket = new Map();
    h.forEach(function (p) { bucket.set(p[0].slice(0, 7), p); });
    return Array.from(bucket.values())
      .sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; })
      .map(function (p) {
        return [monthLabel(p[0].slice(0, 7)), p[1], p[2] !== false];
      });
  }
  function formatValue(v, unit) {
    if (typeof v !== 'number') return '—';
    var s = Math.abs(v) >= 1000 ? v.toLocaleString('en-US') : String(v);
    return s + (unit || '');
  }
  function groupByCategory(indicators, order) {
    return order.map(function (cat) {
      return [cat, (indicators || []).filter(function (i) { return i.category === cat; })];
    }).filter(function (g) { return g[1].length > 0; });
  }
  return { parseDate: parseDate, cutoff: cutoff, filterRange: filterRange,
           changeInfo: changeInfo, aggregate: aggregate, formatValue: formatValue,
           groupByCategory: groupByCategory };
});
