/* ═══════════════════════════════════════════════════════════════════════════
   briefing/annotate.js — 화면 텍스트에 두 가지를 덧입힌다. 여러 페이지가 함께 쓴다.

     ① 용어 툴팁   어려운 말에 점선 밑줄, 마우스오버·탭하면 뜻이 뜬다
     ② 수치 하이라이트  8.2% · 90.22달러 · 1.1%p 처럼 판단의 근거가 되는 숫자에
                      형광펜 자국을 남긴다

   ## 왜 데이터가 아니라 화면에서 하는가 (2026-09-02 결정, 09-03 확장)

   **본문은 순수 텍스트여야 한다.** 카카오톡으로 그대로 나가고, `summary_line` 은
   `textContent` 로 들어가 태그가 글자로 보인다. 그래서 `data.json` 에는 마크업을
   넣지 않고, **렌더가 끝난 뒤 화면의 텍스트 노드만** 훑어 감싼다.
   데이터·카톡·아카이브는 그대로다.

   > ⚠ 같은 이유로 **`**강조**` 를 `summary_line`·`top3.reason` 에 넣지 마라.**
   > 그 둘은 카카오톡으로 나가므로 별표가 대표이사 화면에 그대로 찍힌다.
   > 강조가 필요하면 여기 ②가 숫자를 자동으로 잡는다.

   사용법 — 페이지에서:
     <div id="gl-pop" role="tooltip" aria-hidden="true"></div>   (팝업 그릇, 1개)
     Annotate.setGlossary(data.glossary);
     Annotate.run(['summary-text','top3-list', ...]);            (렌더 후 호출)
   ═══════════════════════════════════════════════════════════════════════════ */
(function(global){
'use strict';

var _GLOSS = [];
var _LATIN = /^[A-Za-z0-9 .\-]+$/;

function esc(t){ return String(t==null?'':t)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function termRe(m){
  var e = m.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  // 라틴 약어는 앞뒤 경계를 요구한다 — APF 가 APFx 에 걸리면 안 된다
  return _LATIN.test(m) ? new RegExp('(?<![A-Za-z0-9])'+e+'(?![A-Za-z0-9])')
                        : new RegExp(e);
}

/* ── ② 수치 하이라이트 ────────────────────────────────────────────────────
   임원이 3~5초에 스캔한다. 산문 속에 묻힌 숫자가 실제로 판단의 근거인데
   지금은 눈에 안 들어온다. 그래서 **숫자+단위 덩어리**에 형광펜을 칠한다.

   범위를 좁게 잡았다 — 아무 숫자나 칠하면 온 문장이 노래져 아무것도 안 보인다:
     퍼센트   8.2%  -3.99%  +0.25%p
     통화·단위 90.22달러  1,373원  982.5억달러  2,721만 대
     배수·지수 6,562.72  (네 자리 이상 + 소수)  ← 지수·주가
   날짜(8/28, 2026-09-01)와 조항 번호(75조)는 **뺐다.** 판단의 근거가 아니라 좌표다. */
var NUM_RE = new RegExp(
  '(' +
    '[+\\-−]?\\d[\\d,]*(?:\\.\\d+)?\\s?%p?' +                       // 8.2% · +0.25%p
    '|[+\\-−]?\\d[\\d,]*(?:\\.\\d+)?\\s?(?:억\\s?달러|만\\s?달러|달러|원|위안|바트|엔)' +
    '|\\d[\\d,]*(?:\\.\\d+)?\\s?(?:만\\s?대|억\\s?원|조\\s?원|만\\s?톤|톤)' +
  ')', 'g');

function isSkippable(p){
  return p && p.closest && p.closest(
    '.gl-tip,.hl,#glossary-section,#gl-pop,script,style,a,button,.tk,.bdg,.badge,.star,.fbdg');
}

function textNodes(root){
  var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: function(n){
      if(!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      if(isSkippable(n.parentElement)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  var out=[], n;
  while((n = w.nextNode())) out.push(n);
  return out;
}

/* 용어는 **구간별로 용어당 첫 등장 1회만** 감싼다. 전부 감싸면 밑줄이 도배된다.
   한 텍스트 노드에서는 가장 먼저 나오는 용어 하나만 처리한다. */
function annotateTerms(root){
  if(!root || !_GLOSS.length) return;
  var done = {};
  textNodes(root).forEach(function(node){
    var txt = node.nodeValue, best = null;
    _GLOSS.forEach(function(t, idx){
      if(done[idx]) return;
      var m = txt.match(termRe(t.term));
      if(m && (best===null || m.index < best.at))
        best = {idx:idx, at:m.index, len:m[0].length, hit:m[0]};
    });
    if(!best) return;
    done[best.idx] = true;
    var span = document.createElement('span');
    span.innerHTML = esc(txt.slice(0, best.at))
      + '<span class="gl-tip" tabindex="0" role="button" data-gi="' + best.idx + '">'
      + esc(best.hit) + '</span>'
      + esc(txt.slice(best.at + best.len));
    node.parentNode.replaceChild(span, node);
  });
}

/* 수치는 **문단(텍스트 노드)마다** 상한을 둔다.
   구간 전체에 총량 상한을 두면 문서 앞쪽이 예산을 다 써버려 **뒤쪽 문단의 핵심
   숫자가 잘린다.** 실제로 그랬다 — 리드 ②의 결론인 `1.1%p` 가 안 칠해졌다
   (2026-09-03 실측). 문단마다 배분하면 어느 문단도 굶지 않는다.

   그리고 한 문단에서 **가장 큰 값 순이 아니라 등장 순**으로 고른다.
   결론 숫자는 대개 문장 끝이 아니라 앞부분에 나오고, 순서를 뒤집으면
   읽는 흐름과 형광펜이 어긋난다. */
function highlightNumbers(root, cap){
  if(!root) return;
  var per = (typeof cap === 'number') ? cap : 3;   // 문단당 상한
  textNodes(root).forEach(function(node){
    var txt = node.nodeValue;
    NUM_RE.lastIndex = 0;
    if(!NUM_RE.test(txt)) return;
    NUM_RE.lastIndex = 0;
    var out='', last=0, m, used=0, blockStart=0;
    while((m = NUM_RE.exec(txt)) !== null){
      // ⚠ `summary_line` 은 textContent + white-space:pre-line 이라
      //    **문단 셋이 텍스트 노드 하나**에 들어 있다. 노드 단위로만 세면
      //    첫 문단이 예산을 다 쓴다(2026-09-03 실측). 빈 줄을 만나면 다시 센다.
      if(txt.slice(blockStart, m.index).indexOf('\n\n') >= 0){
        used = 0; blockStart = m.index;
      }
      if(used >= per) continue;
      out += esc(txt.slice(last, m.index)) + '<span class="hl">' + esc(m[0]) + '</span>';
      last = m.index + m[0].length; used++;
    }
    if(!last) return;
    out += esc(txt.slice(last));
    var span = document.createElement('span');
    span.innerHTML = out;
    node.parentNode.replaceChild(span, node);
  });
}

/* ── 팝업 ── */
function popShow(el){
  var t = _GLOSS[+el.dataset.gi]; if(!t) return;
  var pop = document.getElementById('gl-pop'); if(!pop) return;
  pop.innerHTML = '<div><span class="glp-term">'+esc(t.term)+'</span>'
    + '<span class="glp-short">'+esc(t.short)+'</span></div>'
    + '<div class="glp-desc">'+esc(t.desc)+'</div>';
  pop.classList.add('on'); pop.setAttribute('aria-hidden','false');
  var r = el.getBoundingClientRect(), pr = pop.getBoundingClientRect();
  var left = Math.min(Math.max(8, r.left), window.innerWidth - pr.width - 8);
  var top  = r.bottom + 6;
  if(top + pr.height > window.innerHeight - 8) top = Math.max(8, r.top - pr.height - 6);
  pop.style.left = left+'px'; pop.style.top = top+'px';
}
function popHide(){
  var pop = document.getElementById('gl-pop'); if(!pop) return;
  pop.classList.remove('on'); pop.setAttribute('aria-hidden','true');
}

/* 데스크톱은 마우스오버, 모바일은 탭. 둘 다 건다 —
   모바일엔 hover 가 없어 마우스오버만 달면 화면의 절반에서 안 뜬다. */
function bind(){
  if(bind._done) return; bind._done = true;
  document.addEventListener('mouseover', function(e){
    var el = e.target.closest && e.target.closest('.gl-tip'); if(el) popShow(el);
  });
  document.addEventListener('mouseout', function(e){
    if(e.target.closest && e.target.closest('.gl-tip')) popHide();
  });
  document.addEventListener('click', function(e){
    var el = e.target.closest && e.target.closest('.gl-tip');
    if(el){ e.stopPropagation(); popShow(el); }
    else if(!(e.target.closest && e.target.closest('#gl-pop'))) popHide();
  });
  document.addEventListener('focusin', function(e){
    var el = e.target.closest && e.target.closest('.gl-tip'); if(el) popShow(el);
  });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape') popHide(); });
  window.addEventListener('scroll', popHide, {passive:true});
  window.addEventListener('resize', popHide);
}

global.Annotate = {
  setGlossary: function(items){
    // 긴 용어부터 찾아야 「가이드 포스트」가 「가이드」에 먼저 먹히지 않는다
    _GLOSS = (items||[]).slice().sort(function(a,b){
      return (b.term||'').length - (a.term||'').length; });
    bind();
    return _GLOSS;
  },
  glossary: function(){ return _GLOSS; },
  terms: annotateTerms,
  numbers: highlightNumbers,
  /* 편의 — id 목록을 받아 용어와 수치를 한 번에 입힌다.
     opts.numbersOnly / opts.termsOnly / opts.cap 으로 조절한다. */
  run: function(ids, opts){
    opts = opts || {};
    (ids||[]).forEach(function(id){
      var el = (typeof id === 'string') ? document.getElementById(id) : id;
      if(!el) return;
      if(!opts.numbersOnly) annotateTerms(el);
      if(!opts.termsOnly)   highlightNumbers(el, opts.cap);
    });
  },
  hide: popHide
};
})(window);
