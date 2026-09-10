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


  /* ── TOP3 reason 렌더 ───────────────────────────────────────────────────
     2026-09-10 문체 규정: 문단① 기사문, 문단②③ 개조식(□ 절 / ○ 항).

     ## 왜 공용으로 뺐나
     briefing.html 과 index.html 에 **서로 다른 두 벌**이 있었다(2,029자 vs 1,906자).
     한쪽만 고치면 다른 쪽이 남는다 — 토큰 129개 중 83개가 갈렸던 것과 같은 구도다.

     ## 왜 고쳤나
     옛 판본은 `split(/\n{2,}|\n/)` 로 **모든 줄바꿈에서 쪼개고 `trim()`** 했다.
     개조식을 넣으니 ○ 항 하나하나가 별도 문단이 되고 들여쓰기가 사라졌다.
     문단은 **빈 줄로만** 나누고, 항의 매달림 들여쓰기는 CSS 로 준다
     (`white-space:pre-line` 은 줄 앞 공백을 뭉갠다 — 공백으로는 안 된다). */
  var GJ_HEAD = /^□\s*(.+)$/;          // 절
  var GJ_ITEM = /^\s*[○•]\s*(.+)$/;    // 항
  var GJ_SUB  = /^\s*[-–]\s*(.+)$/;    // 세부

  function esc(t){ return String(t==null?'':t)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  /* 개조식 블록인가 — □ 나 ○ 로 시작하는 줄이 하나라도 있으면 그렇다 */
  function isGaejo(block){
    return block.split('\n').some(function(l){
      return GJ_HEAD.test(l.trim()) || GJ_ITEM.test(l); });
  }

  function renderGaejo(block, bold){
    var html = '', lines = block.split('\n'), buf = null;
    function flush(){
      if(buf !== null){ html += '<span class="gj-i">' + bold(buf) + '</span>'; buf = null; }
    }
    lines.forEach(function(raw){
      var line = raw.replace(/\s+$/,'');
      if(!line.trim()) return;
      var m;
      if((m = line.trim().match(GJ_HEAD))){
        flush(); html += '<span class="gj-h">' + bold(m[1]) + '</span>';
      } else if((m = line.match(GJ_ITEM))){
        flush(); buf = m[1];
      } else if((m = line.match(GJ_SUB))){
        flush(); html += '<span class="gj-s">' + bold(m[1]) + '</span>';
      } else if(buf !== null){
        buf += ' ' + line.trim();          // 항의 이어지는 줄
      } else {
        flush(); html += '<span class="gj-p">' + bold(line.trim()) + '</span>';
      }
    });
    flush();
    return html;
  }

  /* bold: `**…**` 를 <strong> 으로 바꾸는 함수. 페이지의 mdBold 를 넘겨준다.
     안 넘기면 이스케이프만 한다 — 별표가 글자로 새지 않도록. */
  function fmtReason(reason, bold){
    var s = String(reason || '').trim();
    if(!s) return '';
    bold = bold || esc;
    // 문단은 **빈 줄로만** 나눈다. 단일 줄바꿈은 문단 구분이 아니다.
    var blocks = s.split(/\n{2,}/).map(function(b){ return b.replace(/\s+$/,''); })
                  .filter(function(b){ return b.trim(); });
    return blocks.map(function(b){
      var gaejo = isGaejo(b);
      // 「조치」 절은 왼쪽 선으로 할 일임을 표시한다 (라벨 반복을 피한다)
      var act = /^□\s*(조치|액션|대응)/.test(b.trim());
      var cls = 'tr-seg ' + (act ? 'tr-act' : (gaejo ? 'tr-gj' : 'tr-lead'));
      return '<span class="' + cls + '">'
           + (gaejo ? renderGaejo(b, bold) : bold(b.trim()))
           + '</span>';
    }).join('');
  }


  /* ── 단기 모니터링 포인트 ────────────────────────────────────────────────
     2026-09-10 — TOP3 의 `□ 조치` 절을 없애고 **할 일을 여기 한 곳으로 모았다**
     (사용자 결정). 그래서 이 목록이 「지켜볼 것」과 「할 것」을 함께 담는다.

     둘을 눈으로 가르기 위해 **기한이 적힌 항목에 배지**를 붙인다.
       기한 있음 → 조치. (금일)·(금주)·(차주)·(금월 내)
       기한 없음 → 관찰. 조건이 차면 그때 움직인다(트리거).

     ⚠ 이 함수가 세 벌로 갈라져 있었다 — briefing.html 1벌, index.html **2벌**
     (뒤엣것이 앞엣것을 덮고 있었다). 순수 문자열 생성만 여기 두고 DOM 주입은
     페이지가 한다. 그래야 Node 에서 시험할 수 있다. */
  var MON_DUE = /[(（]\s*(금일|오늘|금주|이번\s*주|차주|다음\s*주|금월\s*내|이달\s*내)\s*[)）]/;

  function monitoringHtml(items, bold) {
    bold = bold || esc;
    var arr = (items || []).filter(Boolean);
    if (!arr.length) return '<div class="empty-msg">모니터링 포인트 없음</div>';
    return arr.map(function (m) {
      var t = (typeof m === 'string') ? m : (m && (m.text || m.point || m.title) || '');
      var due = String(t).match(MON_DUE);
      // 배지로 뽑았으면 본문에서는 뺀다 — 같은 말이 두 번 보이지 않게
      // 배지를 떼면 「확인 . LME」처럼 구두점 앞에 공백이 남는다 — 같이 정리한다
      var body = due
        ? String(t).replace(MON_DUE, '')
                   .replace(/\s+([.,·)\]])/g, '$1')
                   .replace(/\s{2,}/g, ' ').trim()
        : String(t);
      return '<div class="mpt-row' + (due ? ' mpt-due' : '') + '">'
           + '<div class="mpt-dot"></div><div>'
           + (due ? '<span class="mpt-badge">' + esc(due[1].replace(/\s+/g, ' ')) + '</span>' : '')
           + bold(body) + '</div></div>';
    }).join('');
  }

  return { MINI_IDS: MINI_IDS, classifyNews: classifyNews, filterNews: filterNews, stars: stars,
           kpiClass: kpiClass, pickMiniIndicators: pickMiniIndicators, sparkPath: sparkPath,
           discBadge: discBadge, FX_KO: FX_KO, fxPairLabel: fxPairLabel,
           fmtReason: fmtReason, isGaejo: isGaejo,
           monitoringHtml: monitoringHtml, MON_DUE: MON_DUE };
});
