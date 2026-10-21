/* ═══════════════════════════════════════════════════════════════════════════
   briefing/charts.js — 브리핑의 모든 그래프. briefing·index 가 함께 쓴다.

   ## 왜 공용으로 뺐나 (2026-09-04)

   같은 그래프 코드가 두 파일에 복사돼 있었고, **색이 토큰이 아니라 하드코딩**이었다
   (`#dc2626` · `#16a34a` · `#9ca3af`). 그래서 다크모드에서 선 색만 라이트 값으로 남고,
   한쪽을 고치면 다른 쪽이 그대로 남았다.

   여기서는 색을 **실행 시점에 CSS 변수에서 읽는다.** 테마가 바뀌면 다시 그리면 된다.

   ## 그리기 원칙 (FT Chart Doctor · ui-ux-pro-max chart 가이드)

   - **색만으로 구분하지 않는다.** 선 굵기·점·직접 라벨을 함께 쓴다.
   - **점을 다 찍지 않는다.** 10점짜리 스파크라인에 점 10개를 찍으면 추세가 아니라
     점 무더기로 보인다. 마지막 값만 찍는다.
   - **기준선을 준다.** 2주 전 값에 옅은 점선을 깔면 "지금이 그때보다 위냐 아래냐"가
     숫자를 읽지 않아도 보인다. 스파크라인의 가장 큰 결함이 이 기준의 부재였다.
   - 격자는 최소로. y축 격자 여러 줄은 작은 차트에서 노이즈다.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
'use strict';

function cssVar(name, fallback) {
  try {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch (e) { return fallback; }
}

/* 토큰을 실제 색으로 풀어 준다. SVG·canvas 는 var() 를 못 받는 자리가 있다. */
function palette() {
  return {
    up:    cssVar('--neg', '#ce2c31'),      // 한국 관행 — 상승은 빨강
    down:  cssVar('--info', '#0d74ce'),
    flat:  cssVar('--txt-lbl', '#8d8d86'),
    line:  cssVar('--bdr', '#dad9d6'),
    faint: cssVar('--divider', '#f1f0ef'),
    text:  cssVar('--txt-sub', '#63635e'),
    accent: cssVar('--accent', '#D8003B')
  };
}

/* ── 환율 스파크라인 ──────────────────────────────────────────────────────
   values : 오래된 것 → 최신 순
   isNeg  : 이 통화가 '약세'인가 (호출부의 f.dir 를 그대로 받는다)          */
function fxSparkline(values, isNeg, idx, opts) {
  opts = opts || {};
  var W = opts.w || 210, H = opts.h || 46, PX = 6, PY = 8;
  var n = values.length;
  var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
  var range = (max - min) || (values[0] * 0.001) || 1;
  var p = palette();
  var color = isNeg ? p.up : p.down;

  var px = function (i) { return PX + i / (n - 1) * (W - PX * 2); };
  var py = function (v) { return PY + (1 - (v - min) / range) * (H - PY * 2); };
  var pts = values.map(function (v, i) { return { x: px(i), y: py(v) }; });

  var d = 'M ' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
  for (var i = 1; i < n; i++) {
    var cpx = ((pts[i - 1].x + pts[i].x) / 2).toFixed(1);
    d += ' C ' + cpx + ' ' + pts[i - 1].y.toFixed(1) + ', ' + cpx + ' ' + pts[i].y.toFixed(1)
       + ', ' + pts[i].x.toFixed(1) + ' ' + pts[i].y.toFixed(1);
  }
  var fillD = d + ' L ' + pts[n - 1].x.toFixed(1) + ' ' + H
                + ' L ' + pts[0].x.toFixed(1) + ' ' + H + ' Z';

  // 시작값 기준선 — "2주 전보다 위냐 아래냐"를 숫자 없이 읽게 한다
  var base = py(values[0]).toFixed(1);

  return '<svg id="fxsp-' + idx + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none"'
    + ' style="touch-action:none;cursor:pointer;overflow:visible;" role="img"'
    + ' aria-label="최근 ' + n + '거래일 추이">'
    + '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="transparent" pointer-events="all"/>'
    + '<line x1="0" y1="' + base + '" x2="' + W + '" y2="' + base + '"'
    +   ' stroke="' + p.line + '" stroke-width="1" stroke-dasharray="3 3"/>'
    + '<path d="' + fillD + '" fill="' + color + '" opacity="0.08"/>'
    + '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="1.7"'
    +   ' stroke-linecap="round" stroke-linejoin="round"/>'
    // 점은 마지막 하나만. 10개를 다 찍으면 추세가 점 무더기가 된다
    + '<circle cx="' + pts[n - 1].x.toFixed(1) + '" cy="' + pts[n - 1].y.toFixed(1) + '"'
    +   ' r="3.2" fill="' + color + '"/>'
    + '<circle cx="' + pts[n - 1].x.toFixed(1) + '" cy="' + pts[n - 1].y.toFixed(1) + '"'
    +   ' r="5.5" fill="' + color + '" opacity="0.18"/>'
    + '</svg>';
}

/* ── 경제지표 미니 라인차트 (Chart.js) ─────────────────────────────────── */
var _charts = {};

function miniLine(canvasId, points, color, neutral, unit, fmt) {
  var el = document.getElementById(canvasId);
  if (!el || !global.Chart) return;
  if (_charts[canvasId]) _charts[canvasId].destroy();

  var p = palette();
  var labels = points.map(function (x) { return x[0]; });
  var values = points.map(function (x) { return x[1]; });
  var obs    = points.map(function (x) { return x[2]; });
  var last   = points.length - 1;
  var dense  = points.length > 60;

  var ds = [{
    data: values,
    borderColor: color,
    backgroundColor: color + '14',
    tension: 0.25,
    fill: true,
    order: 2,
    borderWidth: 1.6,
    // 마지막 점만 남긴다. 관측/추정 구분은 모양으로 준다 — 색만으로 나누지 않는다.
    pointRadius: points.map(function (_, i) { return i === last ? 3 : 0; }),
    pointHoverRadius: dense ? 3 : 4,
    pointStyle: obs.map(function (o) { return o ? 'circle' : 'rectRot'; }),
    pointBackgroundColor: obs.map(function (o) { return o ? color : p.flat; }),
    pointBorderWidth: 0
  }];

  if (neutral != null) {
    ds.push({ data: labels.map(function () { return neutral; }),
      borderColor: p.flat, borderDash: [4, 4], borderWidth: 1,
      pointRadius: 0, fill: false, order: 1 });
  }

  _charts[canvasId] = new global.Chart(el, {
    type: 'line',
    data: { labels: labels, datasets: ds },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: cssVar('--txt', '#21201c'),
          titleFont: { size: 11 }, bodyFont: { size: 11 }, padding: 8,
          displayColors: false,
          callbacks: { afterLabel: function (c) {
            return c.datasetIndex === 0 ? (obs[c.dataIndex] ? '● 관측' : '◇ 추정') : null; } }
        }
      },
      scales: {
        x: { ticks: { font: { size: 9 }, color: p.text, maxRotation: 0,
                      autoSkip: true, maxTicksLimit: 4 },
             grid: { display: false }, border: { color: p.line } },
        // y 격자를 여러 줄 깔면 작은 차트에서 선이 데이터보다 많아진다 → 눈금만
        y: { ticks: { font: { size: 9 }, color: p.text, maxTicksLimit: 3,
                      callback: function (v) { return fmt ? fmt(v) : v; } },
             grid: { display: false }, border: { color: p.line } }
      }
    }
  });
  return _charts[canvasId];
}

function destroyAll() {
  Object.keys(_charts).forEach(function (k) {
    try { _charts[k].destroy(); } catch (e) {}
    delete _charts[k];
  });
}

global.BriefingCharts = {
  palette: palette,
  cssVar: cssVar,
  fxSparkline: fxSparkline,
  miniLine: miniLine,
  charts: _charts,
  destroyAll: destroyAll
};
})(window);
