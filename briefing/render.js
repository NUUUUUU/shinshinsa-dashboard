// briefing/render.js — 일일 브리핑 순수 렌더 헬퍼 (UMD: Node + 브라우저 전역 Briefing)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Briefing = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var MINI_IDS = ["usdkrw", "wti", "copper", "kr_base_rate", "us_sent", "us_cpi"];
  function _hasLG(item) {
    var t = (item.tags || []).join(' ').toLowerCase();
    return t.indexOf('lg') >= 0 || (item.title || '').toLowerCase().indexOf('lg') >= 0;
  }
  // 지역 분류: 해외는 country 우선, 국내/미상은 '한국'. (LG는 filterNews에서 교차필터)
  function classifyNews(item) {
    var c = (item && (item.country || item.category)) || '';
    return ['중국', '태국', '이집트'].indexOf(c) >= 0 ? c : '한국';
  }
  function filterNews(news, cat) {
    var arr = news || [];
    if (cat === 'all') return arr.slice();
    if (cat === 'lg') return arr.filter(_hasLG);            // LG 교차필터(지역 무관)
    return arr.filter(function (i) { return classifyNews(i) === cat; });
  }
  function stars(importance) {
    var n = parseInt(importance, 10);
    return n >= 3 ? '★★★' : n === 2 ? '★★' : n === 1 ? '★' : '';
  }
  function kpiClass(type) { return ['pos', 'neg', 'gld', 'inf'].indexOf(type) >= 0 ? type : 'neu'; }
  function pickMiniIndicators(indicators, ids) {
    var byId = {};
    (indicators || []).forEach(function (i) { byId[i.id] = i; });
    return (ids || []).map(function (id) { return byId[id]; }).filter(Boolean);
  }
  function sparkPath(values, w, h) {
    var vals = (values || []).filter(function (v) { return v != null; });
    if (vals.length < 2) return '';
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals), span = (max - min) || 1, n = vals.length;
    return vals.map(function (v, i) {
      return (i === 0 ? 'M' : 'L') + ((i / (n - 1)) * w).toFixed(1) + ' ' + (h - ((v - min) / span) * h).toFixed(1);
    }).join(' ');
  }
  function discBadge(importance) { return stars(importance); }

  /* 환율 라벨 — 'KRW' 와 '한국' 을 나란히 두면 같은 말이 두 번이다.
     임원이 읽는 건 통화쌍이므로 「원/달러」처럼 한 줄로 만든다 (2026-09-03). */
  var FX_KO = {KRW:'원', CNY:'위안', THB:'바트', EGP:'이집트파운드', JPY:'엔', EUR:'유로'};
  function fxPairLabel(f) {
    var c = (f && f.currency) || '';
    var ko = FX_KO[c];
    return ko ? (ko + '/달러') : (c ? (c + '/USD') : ((f && f.country) || ''));
  }

  return { MINI_IDS: MINI_IDS, classifyNews: classifyNews, filterNews: filterNews, stars: stars,
           kpiClass: kpiClass, pickMiniIndicators: pickMiniIndicators, sparkPath: sparkPath,
           discBadge: discBadge, FX_KO: FX_KO, fxPairLabel: fxPairLabel };
});
