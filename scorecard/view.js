/* ═══════════════════════════════════════════════════════════════════════════
   scorecard/view.js — 경영지표 시세표 컨트롤러. scorecard·index·briefing 이 함께 쓴다.

   ## 왜 하나로 모았나 (2026-09-15)
   같은 지표 렌더 코드가 **세 벌**이었다(scorecard.html · index.html · briefing.html).
   분류 순서 배열도 세 벌이었고, 그중 scorecard.html 판에만 「시장·지수」가 없어
   KOSPI·금·VIX·상해종합이 그 화면에서만 사라졌다. 이제 순서는 indicators.json 의
   `categories` 하나를 따르고, 그리는 코드는 여기 하나다.

   ## 역할 나눔
   scorecard/render.js — 문자열만 만든다(Node 에서 시험)
   이 파일              — DOM 에 붙이고, 누르면 펼치고, 차트를 그린다
   briefing/charts.js   — 실제 Chart.js 호출(색은 CSS 변수에서 읽는다)

   ## 쓰는 법
     var v = ScorecardView.mount(rootEl, indicatorsJson, { compact: true });
     v.redraw();   // 테마가 바뀌면
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
'use strict';

var S = global.Scorecard;
var RANGES = [[3, '3개월'], [6, '6개월'], [12, '1년'], [24, '2년']];

function el(html) {
  var t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content;
}

function toneColor(tone) {
  var C = global.BriefingCharts;
  if (!C) return '#63635e';
  return tone === 'good' ? C.cssVar('--pos', '#2a7e3b')
       : tone === 'bad' ? C.cssVar('--neg', '#ce2c31')
       : C.cssVar('--info', '#0d74ce');
}

function mount(root, data, opts) {
  opts = opts || {};
  var state = { country: opts.country || 'ALL', range: opts.range || 12, open: {} };
  var inds = (data && data.indicators) || [];
  var order = (data && data.categories) || [];
  var countries = (data && data.countries) || [];
  var asOf = ((data && data.generated_at) || new Date().toISOString()).slice(0, 10);
  var byId = {};
  inds.forEach(function (i) { byId[i.id] = i; });

  root.classList.add('ms-root');
  if (opts.compact) root.classList.add('ms-compact');

  function chipRow(kind, items, active) {
    return '<div class="ms-chips" data-kind="' + kind + '" role="group">'
      + items.map(function (it) {
          return '<button type="button" class="chip' + (String(it[0]) === String(active) ? ' active' : '')
            + '" data-v="' + it[0] + '">' + it[1] + '</button>';
        }).join('') + '</div>';
  }

  function toolbar() {
    var counts = {};
    inds.forEach(function (i) { counts[i.country] = (counts[i.country] || 0) + 1; });
    var cs = [['ALL', '전체 <span class="ms-n">' + inds.length + '</span>']].concat(
      countries.filter(function (c) { return counts[c[0]]; })
               .map(function (c) { return [c[0], c[1] + ' <span class="ms-n">' + counts[c[0]] + '</span>']; }));
    return '<div class="ms-toolbar">' + chipRow('country', cs, state.country)
      + '<div class="ms-range"><span class="ms-range-lbl">차트</span>' + chipRow('range', RANGES, state.range) + '</div></div>';
  }

  function signalsHtml(list) {
    if (!list.length) return '';
    return '<div class="ms-signals-wrap"><div class="sec-label">주목 신호</div><div class="ms-signals">'
      + list.map(function (s) {
          var t = S.tone(s.ind);
          return '<button type="button" class="ms-sig tone-' + t + '" data-jump="' + S.esc(s.ind.id) + '">'
            + '<span class="ms-sig-lbl">' + S.esc(s.ind.label) + '</span>'
            + '<span class="ms-sig-val">' + S.esc(S.formatValue(S.changeInfo(s.ind.history).latest, s.ind.unit)) + '</span>'
            + '<span class="ms-sig-txt">' + S.esc(s.text) + '</span></button>';
        }).join('') + '</div></div>';
  }

  function sectionsHtml(list) {
    var groups = S.groupByCategory(list, order);
    if (!groups.length) return '<div class="empty-msg">해당 국가 지표 없음</div>';
    return groups.map(function (g) {
      return '<section class="ms-sec" data-cat="' + S.esc(g[0]) + '">'
        + '<div class="sec-label">' + S.esc(g[0]) + '<span class="ms-sec-n">' + g[1].length + '</span></div>'
        + '<div class="ms-head" aria-hidden="true"><span>지표</span><span>최신</span><span>변동</span><span>추세</span><span>기준</span></div>'
        + g[1].map(function (i) { return S.rowHtml(i, countries); }).join('')
        + '</section>';
    }).join('');
  }

  function render() {
    var list = S.filterCountry(inds, state.country);
    var sig = opts.signals === false ? [] : S.signals(list, opts.compact ? 3 : 6);
    root.innerHTML = '';
    root.appendChild(el(toolbar() + signalsHtml(sig) + '<div class="ms-body">' + sectionsHtml(list) + '</div>'));
    Object.keys(state.open).forEach(function (id) { if (state.open[id]) openRow(id, true); });
    if (opts.onRender) opts.onRender(list);
  }

  function detailHtml(ind) {
    return '<div class="ms-chart"><canvas id="msc_' + S.esc(ind.id) + '"></canvas></div>'
      + (ind.impact ? '<p class="ms-imp">' + S.esc(ind.impact) + '</p>' : '')
      + '<p class="ms-src">출처 ' + S.esc(ind.source || '—')
      + ' · 기준 ' + S.esc(ind.as_of || '—')
      + (ind.stale ? ' · <b class="ms-stale">갱신 지연</b>' : '')
      + (ind._error ? ' · <b class="ms-err">최근 수집 실패: ' + S.esc(ind._error) + '</b>' : '')
      + '</p>';
  }

  function draw(ind) {
    if (!global.BriefingCharts) return;
    var gran = ind.freq === 'M' ? 'month' : 'day';
    var pts = S.aggregate(S.filterRange(ind.history, state.range, asOf), gran);
    global.BriefingCharts.miniLine('msc_' + ind.id, pts, toneColor(S.tone(ind)), ind.neutral, ind.unit || '',
      function (v) { return S.formatValue(v, ''); });
  }

  function openRow(id, keep) {
    var row = root.querySelector('.ms-row[data-id="' + id + '"]');
    var det = root.querySelector('.ms-detail[data-for="' + id + '"]');
    var ind = byId[id];
    if (!row || !det || !ind) return;
    var willOpen = keep ? true : row.getAttribute('aria-expanded') !== 'true';
    row.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    state.open[id] = willOpen;
    if (!willOpen) { det.hidden = true; det.innerHTML = ''; return; }
    det.innerHTML = detailHtml(ind);
    det.hidden = false;
    draw(ind);
  }

  root.addEventListener('click', function (e) {
    var chip = e.target.closest('.ms-chips .chip');
    if (chip) {
      var kind = chip.parentNode.getAttribute('data-kind');
      if (kind === 'country') state.country = chip.getAttribute('data-v');
      if (kind === 'range') state.range = parseInt(chip.getAttribute('data-v'), 10);
      render();
      return;
    }
    var jump = e.target.closest('.ms-sig');
    if (jump) {
      var id = jump.getAttribute('data-jump');
      if (!root.querySelector('.ms-row[data-id="' + id + '"]')) { state.country = 'ALL'; render(); }
      if (!state.open[id]) openRow(id);
      var r = root.querySelector('.ms-row[data-id="' + id + '"]');
      if (r && r.scrollIntoView) r.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    var row = e.target.closest('.ms-row');
    if (row) openRow(row.getAttribute('data-id'));
  });
  root.addEventListener('keydown', function (e) {
    var row = e.target.closest && e.target.closest('.ms-row');
    if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openRow(row.getAttribute('data-id')); }
  });

  render();
  return {
    render: render,
    redraw: function () { Object.keys(state.open).forEach(function (id) { if (state.open[id] && byId[id]) draw(byId[id]); }); },
    state: state
  };
}

global.ScorecardView = { mount: mount };
})(window);
