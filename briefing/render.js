// briefing/render.js — 일일 브리핑 순수 렌더 헬퍼 (UMD: Node + 브라우저 전역 Briefing)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Briefing = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var MINI_IDS = ["usdkrw", "wti", "lme_copper", "kr_base_rate", "us_cci", "us_cpi_yoy"];   // 2026-09-15 id 정리
  function _hasLG(item) {
    var t = (item.tags || []).join(' ').toLowerCase();
    return t.indexOf('lg') >= 0 || (item.title || '').toLowerCase().indexOf('lg') >= 0;
  }
  // 지역 분류: 해외는 country 우선, 국내/미상은 '한국'. (LG는 filterNews에서 교차필터)
  function classifyNews(item) {
    var c = (item && (item.country || item.category)) || '';
    return ['중국', '태국', '이집트', '글로벌'].indexOf(c) >= 0 ? c : '한국';
  }
  // 가전업계 기사 (2026-10-21) — 지역과 무관하게 category 로 묶는다. 삼성 기사는 한국,
  // 월풀·일렉트로룩스는 글로벌이지만 임원이 보려는 것은 「업계」 한 묶음이다.
  function _isIndustry(item) { return !!item && item.category === '가전업계'; }
  function filterNews(news, cat) {
    var arr = news || [];
    if (cat === 'all') return arr.slice();
    if (cat === 'lg') return arr.filter(_hasLG);            // LG 교차필터(지역 무관)
    if (cat === 'ind') return arr.filter(_isIndustry);      // 가전업계 교차필터(지역 무관)
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

  /* 공시 카드 — **2026-09-23 까지 어느 화면에도 그려지지 않았다.**
     `data.json.disclosures` 는 계속 만들어지고 있었는데 `briefing.html`·`index.html`
     어디에도 호출부가 없었다. 최근 회차가 연속 0건이라 아무도 눈치채지 못했고,
     9/23 에 LG씨엔에스↔LG전자 5년 2,578억 계약이 잡히면서 드러났다.

     빈 배열과 수집 실패를 구분한다 — 0건이면 「접수 없음」을 적고, 수집이 실패했으면
     그 사유를 적는다. 둘을 같은 화면으로 만들면 「없다」와 「못 봤다」가 섞인다. */
  function disclosuresHtml(items, opts) {
    var o = opts || {}, bold = !!o.bold;
    var esc = function (t) {
      return String(t == null ? '' : t)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };
    var fmt = function (t) {
      var s = esc(t);
      return bold ? s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') : s;
    };
    if (items && !Array.isArray(items) && items.error) {
      return '<div class="disc-empty disc-fail">공시 수집 실패 — ' + esc(items.error) + '</div>';
    }
    var list = Array.isArray(items) ? items : [];
    if (!list.length) {
      return '<div class="disc-empty">오늘 접수된 중대 공시가 없습니다.</div>';
    }
    return list.map(function (x) {
      var co = esc(x.company || ''), dt = esc(x.date || '');
      var title = fmt(x.title || ''), impact = x.impact ? fmt(x.impact) : '';
      var head = x.url
        ? '<a class="disc-title" href="' + esc(x.url) + '" target="_blank" rel="noopener">' + title + '</a>'
        : '<span class="disc-title">' + title + '</span>';
      return '<div class="disc-row">'
        + '<div class="disc-meta">' + stars(x.importance)
        + (co ? '<span class="disc-co">' + co + '</span>' : '')
        + (dt ? '<span class="disc-date">' + dt + '</span>' : '') + '</div>'
        + head
        + (impact ? '<div class="disc-impact">' + impact + '</div>' : '')
        + '</div>';
    }).join('');
  }


  /* 재무 베이스라인 — 2026-10-13 신설.
     `data.json.financials` 는 DART 에서 공들여 검증해 넣는데 **어느 렌더러도
     읽지 않았다.** 신신사 683%·LG 131% 가 화면에 한 번도 나오지 않았고,
     09-23 의 「공시 카드가 어느 화면에도 없었다」와 같은 구조다.

     ⚠ 회사마다 기준일이 다르다(신신사 2025-12-31 비상장 연1회 감사보고서 /
     LG전자 2026-06-30 반기). **공통 `as_of` 는 빈 문자열이 정상이고** 각 행이
     자기 `date` 를 들고 나온다 — 단일 날짜로 덮으면 서로 다른 기준일이 섞인다. */
  function financialsHtml(fin, opts) {
    var o = opts || {}, bold = !!o.bold;
    var esc = function (t) {
      return String(t == null ? '' : t)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };
    var fmt = function (t) {
      var s = esc(t);
      return bold ? s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') : s;
    };
    var items = (fin && Array.isArray(fin.items)) ? fin.items : [];
    if (!items.length) return '';
    var rows = items.map(function (x) {
      /* `as_of_note` 에는 파이프라인 내부 지시(「단일 as_of 로 덮지 말 것」 같은
         것)가 섞여 있다 — 임원 화면에 기술 메모가 나가면 보고서가 지저분해진다.
         **첫 문장만** 쓰고, 머리에 이미 날짜를 보여주므로 「기준일 YYYY-MM-DD — 」
         접두는 뗀다. 남는 것은 「비상장 연1회 감사보고서다」처럼 읽는 사람에게
         왜 기준일이 다른지 알려주는 한 줄이다. */
      var note = '';
      if (x.as_of_note) {
        var first = String(x.as_of_note).split(/\.\s/)[0] || '';
        first = first.replace(/^기준일\s*\d{4}-\d{2}-\d{2}\s*[\u2014\-]\s*/, '');
        if (first) {
          if (!/[.!?]$/.test(first)) first += '.';
          note = '<div class="fin-note">' + fmt(first) + '</div>';
        }
      }
      var cells = [
        ['부채비율', x.debt_ratio],
        ['영업이익률', x.operating_margin]
      ].filter(function (c) { return c[1]; }).map(function (c) {
        return '<span class="fin-kv"><span class="fin-k">' + c[0] + '</span>'
             + '<span class="fin-v">' + esc(c[1]) + '</span></span>';
      }).join('');
      return '<div class="fin-row">'
        + '<div class="fin-head">'
        + '<span class="fin-co">' + esc(x.company || '') + '</span>'
        + (x.date ? '<span class="fin-date">' + esc(x.date) + ' 기준</span>' : '')
        + '</div>'
        + '<div class="fin-kvs">' + cells + '</div>'
        + note
        + '</div>';
    }).join('');
    return '<div class="fin-label">재무 베이스라인</div>' + rows;
  }

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


  /* ── 가전업계 동향 (2026-10-21 신설) ──────────────────────────────────────
     카드는 「국내」「글로벌」 두 장이다. 해외 국가 카드(ov-card)와 같은 모양을 쓴다.
     요약 아래 「방향」「기회」 두 줄을 따로 그린다 — 가전업계 수집의 목적이 ① 우리가 나아갈 방향
     ② 신규시장 기회 포착이다(2026-10-21 사용자 지정). 요약 안에 묻으면 두 답이 안 보인다.
     카드가 하나도 없으면 빈 문자열을 돌려준다 — 화면은 섹션과 칩을 함께 숨긴다
     (공시·용어집과 같은 처리). 「없음」 문구를 찍으면 수집 실패와 구분이 안 된다. */
  function industryHtml(cards, bold) {
    bold = bold || esc;
    var arr = (cards || []).filter(function (c) { return c && (c.summary || '').trim(); });
    if (!arr.length) return '';
    return arr.map(function (c) {
      var name = esc(c.group || '') + (c.companies ? ' — ' + esc(c.companies) : '');
      return '<div class="ov-card">'
           + '<div class="ov-head"><span class="ov-name">' + name + '</span></div>'
           + (c.indicators ? '<div class="ov-inds">' + bold(c.indicators) + '</div>' : '')
           + '<div class="ov-sum">' + bold(c.summary) + '</div>'
           + (c.direction ? '<div class="ind-row"><span class="ind-tag dir">방향</span><span>' + bold(c.direction) + '</span></div>' : '')
           + (c.opportunity ? '<div class="ind-row"><span class="ind-tag opp">기회</span><span>' + bold(c.opportunity) + '</span></div>' : '')
           + '</div>';
    }).join('');
  }

  /* ── 출장자 현황 ─────────────────────────────────────────────────────────
     2026-09-15 — 옛 `renderTrips` 는 목록이 비면 **섹션을 통째로 숨겼다.**
     그래서 「오늘 출장자가 0명」과 「수집이 실패했다」가 화면에서 완전히 같았다.
     그날 실제로 그룹웨어 세션이 만료(401)돼 아무것도 안 받았는데 보고서는
     조용히 그 자리를 비웠다. 09-14 에 카톡에서 고친 문제가 화면에는 남아 있었다.

     상태가 셋이다.
       목록 있음      → 표로 보여준다
       목록 비고 note → **note 를 보여준다** (수집 실패 등)
       목록 비고 무   → 「등록 없음」 (0명이 사실인 경우)
     어느 경우에도 **섹션을 숨기지 않는다** — 빈 자리는 아무것도 말해 주지 않는다. */
  function travelersHtml(t, bold) {
    bold = bold || esc;
    var list = (t && t.travelers) || [];
    var md = function (d) { return d ? String(d).slice(5).replace('-', '/') : ''; };
    if (!list.length) {
      var note = t && t.note;
      return '<div class="trip-empty">' + (note ? bold(note) : '등록 없음') + '</div>';
    }
    var rows = list.map(function (v) {
      var kind = v.kind === 'inbound' ? '<span class="trip-kind">입국</span>' : '';
      return '<div class="trip-row">'
        + '<div class="trip-who">'
        + (v.dept ? '<span class="trip-dept">' + esc(v.dept) + '</span>' : '')
        + esc(v.name || '') + '</div>'
        + '<div class="trip-period">' + esc(md(v.depart)) + ' ~ ' + esc(md(v.ret)) + '</div>'
        + '<div class="trip-dest">' + esc(v.dest || '') + kind + '</div>'
        + '</div>';
    }).join('');
    return rows + (t.as_of
      ? '<div class="trip-asof">' + esc(md(t.as_of)) + ' 기준</div>' : '');
  }

  /* 티커 칩에 붙일 기준일 — **칩마다 날짜가 다르다.**
     실측(2026-09-22): 원/달러·KOSPI·LG전자는 9/21 확정인데 WTI·구리는 Yahoo·LME 일봉이
     하루 늦어 9/18 이다. 날짜 없이 한 줄에 늘어놓으면 전부 같은 시점으로 읽힌다.
     그날 본문이 「유가가 100달러선 아래로 밀렸다」인데 티커가 날짜 없이 100.30 을 찍고 있었다.
     `change` 문구 안의 `(9/18 …)` 을 그대로 쓴다 — 없으면 빈 문자열이라 칩이 예전처럼 나온다. */
  function tickerDate(txt) {
    var m = String(txt == null ? '' : txt).match(/\((\d{1,2})[\/.](\d{1,2})/);
    return m ? m[1] + '/' + m[2] : '';
  }

  return { MINI_IDS: MINI_IDS, classifyNews: classifyNews, filterNews: filterNews, stars: stars,
           tickerDate: tickerDate,
           kpiClass: kpiClass, pickMiniIndicators: pickMiniIndicators, sparkPath: sparkPath,
           discBadge: discBadge, disclosuresHtml: disclosuresHtml,
           financialsHtml: financialsHtml,
           FX_KO: FX_KO, fxPairLabel: fxPairLabel,
           fmtReason: fmtReason, isGaejo: isGaejo,
           monitoringHtml: monitoringHtml, MON_DUE: MON_DUE,
           industryHtml: industryHtml,
           travelersHtml: travelersHtml };
});
