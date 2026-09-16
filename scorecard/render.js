// scorecard/render.js — 경영지표 순수 변환·마크업 (UMD: Node 단위테스트 + 브라우저 전역 Scorecard)
//
// ## 2026-09-15 개편 — 카드 격자에서 시세표로
// 지표가 24개에서 52개가 됐다. 차트 카드를 늘어놓으면 **스크롤만 길어지고 훑어지지 않는다.**
// FT·Economist 의 시세표처럼 한 줄 한 지표로 바꿨다 — 이름·값·변동·추세·기준일이 한 눈에 들어온다.
// 2년 차트는 줄을 눌렀을 때만 그린다.
//
// ## 색은 오르내림이 아니라 **우리에게 좋은지**다
// 보고서 티커와 같은 규칙이다(2026-09-03 사용자 결정). `polarity` 는 수집기가 지표마다 정한다.
// 0(환율·금리·물가)은 방향만 보여 주고 색으로 단정하지 않는다.
//
// ## 이 파일은 DOM 을 만지지 않는다
// 문자열만 만든다. 그래야 Node 에서 시험할 수 있다. 붙이고 그리는 일은 scorecard/view.js 가 한다.
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
  function valid(history) { return (history || []).filter(function (p) { return p[1] != null; }); }
  function changeInfo(history) {
    var h = valid(history);
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
    var h = valid(history);
    if (gran === 'day') {
      var step = Math.max(1, Math.ceil(h.length / 180));
      var out = h.filter(function (_, i) { return i % step === 0 || i === h.length - 1; });
      return out.map(function (p) { return [dayLabel(p[0]), p[1], p[2] !== false]; });
    }
    var bucket = new Map();
    h.forEach(function (p) { bucket.set(p[0].slice(0, 7), p); });
    return Array.from(bucket.values())
      .sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; })
      .map(function (p) { return [monthLabel(p[0].slice(0, 7)), p[1], p[2] !== false]; });
  }

  /* ── 숫자 ─────────────────────────────────────────────────────────────
     자릿수는 크기로 정한다. 위안/달러 6.708 을 두 자리로 자르면 움직임이 안 보이고,
     LME 구리 14,044 에 소수 둘째 자리를 붙이면 읽는 눈만 느려진다. */
  function digits(v) {
    var a = Math.abs(v);
    return a >= 1000 ? 0 : a >= 100 ? 2 : a >= 10 ? 2 : 3;
  }
  function num(v, d) {
    if (typeof v !== 'number' || !isFinite(v)) return '—';
    var n = d == null ? digits(v) : d;
    var s = v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: n });
    return s;
  }
  var PREFIX = { '$': true };
  function formatValue(v, unit) {
    if (typeof v !== 'number') return '—';
    var s = Math.abs(v) >= 1000 ? num(v, Math.abs(v) >= 10000 ? 0 : 2) : num(v);
    if (!unit) return s;
    return PREFIX[unit] ? unit + s : s + unit;
  }

  /* ── 변동 ─────────────────────────────────────────────────────────────
     % 단위(YoY·금리·물가)는 **%p** 로 읽는다. 금리 2.75→3.00 을 「+9.09%」라고 쓰면 틀린 말이다. */
  function isPercentUnit(ind) { return (ind && ind.unit) === '%'; }
  /* 기준선이 있는 지수(PMI 50·심리 100)는 포인트로 읽는다 — 「PMI ▼1.51%」는 쓰지 않는 표현이다.
     기준선 0 인 YoY 는 단위가 % 라 앞의 %p 분기가 먼저 받는다. */
  function isIndexPoint(ind) { return ind && ind.neutral != null; }
  function change(ind) {
    var h = valid(ind && ind.history);
    var basis = (ind && ind.freq) === 'M' ? '전월' : '전일';
    if (h.length < 2) return { dir: 0, text: '—', basis: basis, delta: null };
    var last = h[h.length - 1][1], prev = h[h.length - 2][1];
    var delta = last - prev;
    var dir = Math.abs(delta) < 1e-9 ? 0 : (delta > 0 ? 1 : -1);
    var arrow = dir > 0 ? '▲' : dir < 0 ? '▼' : '—';
    var body;
    if (isPercentUnit(ind)) body = Math.abs(delta).toFixed(2) + '%p';
    else if (isIndexPoint(ind)) body = Math.abs(delta).toFixed(1) + 'p';
    else if (prev) body = Math.abs(delta / prev * 100).toFixed(2) + '%';
    else body = num(Math.abs(delta));
    return { dir: dir, text: dir === 0 ? '보합' : arrow + ' ' + body, basis: basis, delta: delta };
  }
  function tone(ind) {
    var c = change(ind), pol = (ind && ind.polarity) || 0;
    if (!c.dir || !pol) return 'flat';
    return c.dir * pol > 0 ? 'good' : 'bad';
  }

  /* ── 기준선 신호 ──────────────────────────────────────────────────────
     PMI 50 · 심리지수 100 · YoY 0. 숫자보다 **어느 편에 있는지**가 먼저 읽혀야 한다. */
  var SIDE_WORD = { 50: ['확장', '위축'], 100: ['낙관', '비관'], 0: ['증가', '감소'] };
  function side(ind) {
    var h = valid(ind && ind.history);
    if (ind == null || ind.neutral == null || !h.length) return null;
    var words = SIDE_WORD[ind.neutral] || ['기준 위', '기준 아래'];
    var last = h[h.length - 1][1];
    var s = { above: last >= ind.neutral, word: last >= ind.neutral ? words[0] : words[1], crossed: false };
    if (h.length >= 2) {
      var prevAbove = h[h.length - 2][1] >= ind.neutral;
      s.crossed = prevAbove !== s.above;
    }
    return s;
  }

  /* ── 주목 신호 ────────────────────────────────────────────────────────
     매일 50여 줄을 다 읽을 수는 없다. 기준선을 넘나든 것과 평소보다 크게 움직인 것만 올린다.
     문턱은 분류별로 다르다 — 환율 1% 는 크고, 천연가스 1% 는 잡음이다. */
  var MOVE_TH = { '환율': 1.0, '원가·원자재': 3.0, '시장·지수': 2.5 };
  function signals(indicators, limit) {
    var out = [];
    (indicators || []).forEach(function (ind) {
      if (ind.stale) return;
      var s = side(ind);
      if (s && s.crossed) {
        var head = ind.neutral === 0 ? (s.above ? '플러스' : '마이너스') : ind.neutral + ' ' + (s.above ? '상회' : '하회');
        out.push({ ind: ind, kind: 'cross', score: 100, text: head + ' 전환 — ' + s.word });
        return;
      }
      var th = MOVE_TH[ind.category];
      var c = change(ind);
      if (th && ind.freq !== 'M' && c.dir) {
        var h = valid(ind.history), prev = h[h.length - 2][1];
        var pct = Math.abs(c.delta / prev * 100);
        if (pct >= th) out.push({ ind: ind, kind: 'move', score: pct / th, text: c.basis + ' ' + c.text });
      }
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out.slice(0, limit == null ? 6 : limit);
  }

  function asOfLabel(ind) {
    var d = ind && ind.as_of;
    if (!d) return '—';
    return ind.freq === 'M' ? (d.slice(2, 4) + '.' + d.slice(5, 7) + '월') : (d.slice(5, 7) + '/' + d.slice(8, 10));
  }

  /* ── 추세선 ───────────────────────────────────────────────────────────
     색은 CSS 가 준다(stroke: currentColor). 다크모드 전환에 다시 그릴 필요가 없다. */
  function sparkPoints(ind) {
    var h = valid(ind && ind.history);
    return h.slice(-(ind && ind.freq === 'M' ? 12 : 60)).map(function (p) { return p[1]; });
  }
  function sparkSvg(values, neutral, w, hgt) {
    var W = w || 96, H = hgt || 26, P = 3;
    var v = (values || []).filter(function (x) { return x != null; });
    if (v.length < 2) return '<svg class="ms-spark-svg" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true"></svg>';
    var lo = Math.min.apply(null, v), hi = Math.max.apply(null, v);
    var showNeutral = neutral != null && neutral >= lo - (hi - lo) * 0.25 && neutral <= hi + (hi - lo) * 0.25;
    if (showNeutral) { lo = Math.min(lo, neutral); hi = Math.max(hi, neutral); }
    var span = (hi - lo) || 1, n = v.length;
    var x = function (i) { return (P + i / (n - 1) * (W - P * 2)).toFixed(1); };
    var y = function (val) { return (P + (1 - (val - lo) / span) * (H - P * 2)).toFixed(1); };
    var d = v.map(function (val, i) { return (i ? 'L' : 'M') + x(i) + ' ' + y(val); }).join(' ');
    return '<svg class="ms-spark-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">'
      + (showNeutral ? '<line class="ms-spark-base" x1="0" x2="' + W + '" y1="' + y(neutral) + '" y2="' + y(neutral) + '"/>' : '')
      + '<path d="' + d + '"/>'
      + '<circle cx="' + x(n - 1) + '" cy="' + y(v[n - 1]) + '" r="2.2"/></svg>';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function countryName(code, countries) {
    var hit = (countries || []).filter(function (c) { return c[0] === code; })[0];
    return hit ? hit[1] : (code || '');
  }

  /* 한 줄. <button> 안에 블록을 넣으면 안 되므로 role=button 인 div 다. */
  function rowHtml(ind, countries) {
    var c = change(ind), s = side(ind), t = tone(ind);
    var hasData = valid(ind.history).length > 0;
    return '<div class="ms-row tone-' + t + (ind.stale ? ' is-stale' : '') + '" role="button" tabindex="0"'
      + ' aria-expanded="false" data-id="' + esc(ind.id) + '">'
      + '<span class="ms-name"><span class="ms-lbl">' + esc(ind.label) + '</span>'
      +   '<span class="ms-cty">' + esc(countryName(ind.country, countries)) + '</span></span>'
      + '<span class="ms-val">' + (hasData ? esc(formatValue(changeInfo(ind.history).latest, ind.unit)) : '<em class="ms-none">수집 실패</em>') + '</span>'
      + '<span class="ms-chg"><b>' + esc(c.text) + '</b><i>' + c.basis + '</i></span>'
      + '<span class="ms-spark">' + sparkSvg(sparkPoints(ind), ind.neutral) + '</span>'
      + '<span class="ms-meta">'
      +   (s ? '<span class="ms-side ' + (s.above ? 'above' : 'below') + '">' + s.word + '</span>' : '')
      +   '<span class="ms-asof">' + asOfLabel(ind) + '</span>'
      +   (ind.stale ? '<span class="ms-stale">지연</span>' : '')
      + '</span>'
      + '</div>'
      + '<div class="ms-detail" data-for="' + esc(ind.id) + '" hidden></div>';
  }

  function filterCountry(indicators, code) {
    if (!code || code === 'ALL') return (indicators || []).slice();
    return (indicators || []).filter(function (i) { return i.country === code; });
  }

  function groupByCategory(indicators, order) {
    return order.map(function (cat) {
      return [cat, (indicators || []).filter(function (i) { return i.category === cat; })];
    }).filter(function (g) { return g[1].length > 0; });
  }

  return { parseDate: parseDate, cutoff: cutoff, filterRange: filterRange,
           changeInfo: changeInfo, aggregate: aggregate, formatValue: formatValue,
           groupByCategory: groupByCategory, change: change, tone: tone, side: side,
           signals: signals, asOfLabel: asOfLabel, sparkPoints: sparkPoints, sparkSvg: sparkSvg,
           rowHtml: rowHtml, filterCountry: filterCountry, countryName: countryName, esc: esc };
});
