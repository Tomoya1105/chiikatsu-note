/* ちいかわ検定（非公式）：画面の動き。問題データと採点（quiz-data.mjs・quizcore.mjs）はビルド時にこの前に埋め込まれる。
   回答中は通信しない。終わったときに1回だけ結果を送り、みんなの成績を受け取る（送れなくても結果は表示する）。 */
(function(){
  "use strict";
  var SITE = "https://chiikatsunote.com";
  var LS = "chiikatsu-quiz", SS = "chiikatsu-quiz-run", SR = "chiikatsu-quiz-res";
  var root = document.getElementById("qz");
  if (!root) return;
  var top = document.getElementById("qzTop");
  var stage = document.getElementById("qzStage");
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  var isPreviewHost = /\.pages\.dev$|^localhost$|^127\./.test(location.hostname) && location.hostname !== "chiikatsu-note.pages.dev";

  function ct(k){ try { if (window.ct) window.ct(k); } catch (e) {} }
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function jget(store, k, d){ try { var v = JSON.parse(store.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function jset(store, k, v){ try { store.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function uid(){
    var a = new Uint8Array(12);
    try { crypto.getRandomValues(a); } catch (e) { for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); }
    return Array.prototype.map.call(a, function(x){ return ("0" + x.toString(16)).slice(-2); }).join("").replace(/^(.{8})(.{8})/, "$1-$2-");
  }
  var me = jget(localStorage, LS, {}) || {};
  if (!me.dev) { me.dev = uid(); jset(localStorage, LS, me); }

  var QS = QUESTIONS, N = QS.length;
  var LVNAME = { 1: "初級", 2: "中級", 3: "上級", 4: "激ムズ" };
  var LETTER = ["A", "B", "C", "D"];
  var run = null;   // 受験中の状態（sessionStorage に保存して、再読み込みしても続きから）

  function save(){ jset(sessionStorage, SS, run); }
  function choiceText(q, id){ for (var i = 0; i < q.choices.length; i++) if (q.choices[i].id === id) return q.choices[i].text; return ""; }

  /* ---------- トップ ---------- */
  function paintTop(){
    var box = document.getElementById("qzMine");
    if (box && me.plays) {
      box.innerHTML = '<p>前回 <b class="num">' + me.last + '点</b>　ベスト <b class="num">' + me.best + '点</b>（この端末の記録）</p>';
      box.hidden = false;
    }
    if (me.perfect) {   // 100点を取った端末では、隠していた称号を見せる
      var s = document.querySelector("[data-secret]");
      if (s) { var t = TITLES[0]; s.innerHTML = '<b>' + esc(t.name) + '</b><span>' + esc(t.sub) + '</span>'; s.classList.add("open"); }
    }
  }
  function showTop(){
    top.hidden = false; stage.hidden = true; stage.innerHTML = "";
    document.documentElement.classList.remove("qz-running");
    paintTop();
  }

  /* ---------- 開始 ---------- */
  function start(isRetry){
    run = { ver: QUIZ_VER, id: uid(), layout: makeLayout(), picks: [], idx: 0, phase: "q", started: Date.now() };
    sessionStorage.removeItem(SR);
    save();
    ct(isRetry ? "quiz:retry" : "quiz:start");
    try { history.pushState({ qz: 1 }, ""); } catch (e) {}
    top.hidden = true; stage.hidden = false;
    document.documentElement.classList.add("qz-running");
    render();
  }

  /* ---------- 画面の描き分け ---------- */
  function render(){
    if (run.phase === "lv") return renderLevel();
    if (run.phase === "final") return renderFinal();
    renderQuestion();
  }
  function progress(){
    var h = '<ol class="qz-prog" aria-hidden="true">';
    for (var i = 0; i < N; i++) {
      var st = i < run.picks.length ? (run.picks[i] === QS[i].ans ? "ok" : "ng") : i === run.idx ? "now" : "";
      h += '<li class="lv' + QS[i].lv + (st ? " " + st : "") + '"></li>';
    }
    return h + "</ol>";
  }
  function scrollTopNow(){ try { window.scrollTo(0, 0); } catch (e) {} }

  function renderQuestion(){
    var q = QS[run.idx], answered = run.picks.length > run.idx, pick = run.picks[run.idx];
    var lay = run.layout[run.idx];
    var h = '<div class="qz-q' + (reduce ? "" : " enter") + (q.n === N ? " final" : "") + '">' +
      '<div class="qz-head">' + progress() +
      '<p class="qz-meta"><span class="qz-lv lv' + q.lv + '">' + LVNAME[q.lv] + '</span><span class="num">Q' + q.n + '<small>／' + N + '</small></span>' + (q.n === N ? '<span class="qz-fin">FINAL</span>' : "") + '</p></div>' +
      '<h2 class="qz-text">' + esc(q.q) + '</h2><div class="qz-choices" role="group" aria-label="選択肢">';
    for (var i = 0; i < 4; i++) {
      var id = lay[i], cls = "qz-c";
      if (answered) { if (id === q.ans) cls += " right"; else if (id === pick) cls += " wrong"; else cls += " dim"; }
      h += '<button type="button" class="' + cls + '" data-pick="' + id + '"' + (answered ? " disabled" : "") + '><span class="qz-l">' + LETTER[i] + '</span><span class="qz-t">' + esc(choiceText(q, id)) + '</span>' +
        (answered && id === q.ans ? '<span class="qz-mk" aria-label="正解">○</span>' : answered && id === pick ? '<span class="qz-mk" aria-label="あなたの回答">×</span>' : "") + '</button>';
    }
    h += '</div>';
    if (answered) h += feedback(q, pick === q.ans);
    h += '</div>';
    stage.innerHTML = h;
    if (!answered) scrollTopNow();
  }
  function feedback(q, ok){
    var last = q.n === N;
    var next = last ? "結果を見る" : (q.n % 5 === 0 ? LVNAME[q.lv] + "クリア！ 次へ" : "次の問題へ");
    return '<div class="qz-fb ' + (ok ? "ok" : "ng") + '" role="status"><p class="qz-v">' + (ok ? "正解！" : "ざんねん…") +
      (ok ? "" : '<span>正解は「' + esc(choiceText(q, q.ans)) + '」</span>') + '</p>' +
      '<p class="qz-ex">' + esc(q.ex) + '</p>' +
      '<button type="button" class="qz-btn" data-next>' + next + '</button></div>';
  }

  function onPick(id){
    var q = QS[run.idx];
    if (run.picks.length > run.idx) return;   // 1問につき1回だけ
    run.picks[run.idx] = id; save();
    renderQuestion();
    var fb = stage.querySelector(".qz-fb");
    if (fb && fb.scrollIntoView) { try { fb.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" }); } catch (e) { fb.scrollIntoView(false); } }
    if (id === q.ans && !reduce && navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
  }
  function onNext(){
    var q = QS[run.idx];
    if (q.n === N) return finish();
    run.idx++;
    if (q.n % 5 === 0) { run.phase = "lv"; ct("quiz:lv" + (q.lv + 1)); }
    else if (run.idx === N - 1) { run.phase = "final"; ct("quiz:final"); }
    save(); render();
  }

  function renderLevel(){
    var lv = QS[run.idx].lv, prev = lv - 1, ok = 0;
    for (var i = (prev - 1) * 5; i < prev * 5; i++) if (run.picks[i] === QS[i].ans) ok++;
    var lines = { 2: "ここからは、ちゃんと見ていたら分かる問題です。", 3: "ここからは、覚えているけど迷う問題です。", 4: "ここからは、正解を見て「あーー！」となる問題です。" };
    stage.innerHTML = '<div class="qz-lvcard lv' + lv + (reduce ? "" : " enter") + '">' + progress() +
      '<p class="qz-clear">' + LVNAME[prev] + 'クリア　<b class="num">' + ok + '</b>／5問正解</p>' +
      '<p class="qz-next">次は</p><p class="qz-big">' + LVNAME[lv] + '</p><p class="qz-sub">' + lines[lv] + '</p>' +
      '<button type="button" class="qz-btn" data-lvgo>' + LVNAME[lv] + 'に進む</button></div>';
    scrollTopNow();
  }
  function renderFinal(){
    var ok = 0; for (var i = 0; i < run.picks.length; i++) if (run.picks[i] === QS[i].ans) ok++;
    stage.innerHTML = '<div class="qz-lvcard final' + (reduce ? "" : " enter") + '">' + progress() +
      '<p class="qz-clear">ここまで <b class="num">' + ok + '</b>／19問正解</p>' +
      '<p class="qz-next">いよいよ</p><p class="qz-big">最終問題</p><p class="qz-sub">激ムズの最後の1問です。</p>' +
      '<button type="button" class="qz-btn" data-lvgo>最終問題に挑む</button></div>';
    scrollTopNow();
  }

  /* ---------- 結果 ---------- */
  function finish(){
    var g = grade(run.picks), dur = Math.round((Date.now() - run.started) / 1000);
    var res = { ver: QUIZ_VER, id: run.id, picks: run.picks.slice(), score: g.score, dur: dur, prev: me.plays ? me.last : null, stats: null, sent: false };
    me.plays = (me.plays || 0) + 1; me.last = g.score; me.best = Math.max(me.best || 0, g.score);
    if (g.score === 100) me.perfect = true;
    jset(localStorage, LS, me);
    jset(sessionStorage, SR, res);
    sessionStorage.removeItem(SS); run = null;
    ct("quiz:done"); if (g.score === 100) ct("quiz:perfect");
    try { history.replaceState({ qz: 2 }, ""); } catch (e) {}
    showResult(res, true);
    send(res);
  }

  function send(res){
    var stEl = document.getElementById("qzStats");
    if (!window.fetch) return paintStats(null, res);
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function(){ if (ctl) ctl.abort(); }, 8000);
    fetch("/api/quiz/submit", { method: "POST", headers: { "content-type": "application/json" }, keepalive: true, signal: ctl ? ctl.signal : undefined,
      body: JSON.stringify({ ver: res.ver, id: res.id, dev: me.dev, picks: res.picks, dur: res.dur }) })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){ clearTimeout(timer); res.sent = true; res.stats = j && j.stats || null; res.reached = !!(j && j.ok); jset(sessionStorage, SR, res); paintStats(res.stats, res); })
      .catch(function(){ clearTimeout(timer); paintStats(null, res); });
    if (stEl) stEl.innerHTML = '<p class="qz-muted">みんなの成績を読み込み中…</p>';
  }

  function paintStats(s, res){
    var el = document.getElementById("qzStats"); if (!el) return;
    if (res && res.demo) { el.innerHTML = '<p class="qz-muted">プレビュー用の表示のため、みんなの成績は表示しません。</p>'; return; }
    if (!s && res && res.reached) { el.innerHTML = '<p class="qz-muted">みんなの成績は、いま準備中です。少し時間をおいて、また挑戦してみてください。</p>'; return; }
    if (!s) { el.innerHTML = '<p class="qz-muted">みんなの平均点は、いまは表示できません。通信できる状態で、あとでもう一度お試しください。</p>'; return; }
    if (!s.show) { el.innerHTML = '<p class="qz-muted">みんなの平均点と順位は、初回の挑戦が' + STATS_MIN + '回集まったら表示します。いまは集計中です。</p>'; return; }
    el.innerHTML = '<div class="qz-st"><div><span>みんなの平均</span><b class="num">' + s.avg + '<small>点</small></b></div>' +
      '<div><span>あなたの位置</span><b class="num"><small>上位</small>' + s.top + '<small>%</small></b></div>' +
      '<div><span>これまでの挑戦</span><b class="num">' + Number(s.total).toLocaleString("ja-JP") + '<small>回</small></b></div></div>' +
      '<p class="qz-muted">平均と順位は、各端末の初回の挑戦（' + Number(s.first).toLocaleString("ja-JP") + '回）から計算しています。</p>';
  }

  function shareText(score, t){
    return score === 100
      ? "ちいかわ検定（非公式）で100点！『" + t.name + "』になりました\n#ちいかわ検定 #ちい活ノート"
      : "ちいかわ検定（非公式）で" + score + "点でした！称号は『" + t.name + "』― " + t.sub + " ―\n#ちいかわ検定 #ちい活ノート";
  }

  function showResult(res, fresh){
    var g = grade(res.picks), t = titleOf(g.score), perfect = g.score === 100;
    var url = SITE + "/quiz/r/" + g.score + "/";
    var txt = shareText(g.score, t);
    var xurl = "https://x.com/intent/post?text=" + encodeURIComponent(txt) + "&url=" + encodeURIComponent(url);
    var lurl = "https://line.me/R/share?text=" + encodeURIComponent(txt.replace(/\n#.*$/, "") + "\n" + url);
    var rates = catRates(g.cats);
    var miss = QS.filter(function(q, i){ return res.picks[i] !== q.ans; });
    var month = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);

    var h = '<div class="qz-res">' +
      '<div class="qz-card' + (perfect ? " gold" : "") + (fresh && !reduce ? " pop" : "") + '">' +
        '<p class="qz-cl">ちいかわ検定<small>（非公式）</small></p>' +
        '<p class="qz-score num">' + g.score + '<small>点</small></p>' +
        (perfect ? '<p class="qz-star" aria-hidden="true">★ 全問正解 ★</p>' : "") +
        '<p class="qz-title">' + esc(t.name) + '</p><p class="qz-tsub">― ' + esc(t.sub) + ' ―</p>' +
        '<p class="qz-ok">' + g.ok + '／' + N + '問正解' + (res.prev != null ? '<span>前回 ' + res.prev + '点 → 今回 ' + g.score + '点</span>' : "") + '</p>' +
        '<p class="qz-brand"><img src="/icons/icon-192.png" alt="" width="22" height="22">ちい活ノート</p>' +
      '</div>' +
      (res.demo ? '<p class="qz-demo">プレビュー用の表示です（記録は送っていません）</p>' : "") +
      '<div class="qz-share"><p class="qz-h">結果をシェアする</p>' +
        '<a class="qz-sh x" href="' + esc(xurl) + '" target="_blank" rel="noopener" data-qshare="x">Xでポスト</a>' +
        '<a class="qz-sh line" href="' + esc(lurl) + '" target="_blank" rel="noopener" data-qshare="line">LINEで送る</a>' +
        '<button type="button" class="qz-sh copy" data-copy="' + esc(url) + '" data-qshare="copy">URLをコピー</button></div>' +
      '<section class="qz-sec"><h3>みんなの成績</h3><div id="qzStats"></div></section>' +
      '<section class="qz-sec"><h3>カテゴリ別の正答率<small>（参考）</small></h3><ul class="qz-bars">' +
        rates.map(function(r){ return '<li><span class="k">' + esc(r.name) + '</span><span class="bar"><i style="width:' + r.pct + '%"></i></span><span class="v num">' + r.pct + '%<small>（' + r.ok + '/' + r.n + '）</small></span></li>'; }).join("") +
      '</ul><p class="qz-muted">カテゴリによって難しさが違うので、参考としてお楽しみください。</p></section>' +
      (miss.length ? '<section class="qz-sec"><details class="qz-rev"><summary>まちがえた問題をふりかえる（' + miss.length + '問）</summary><ol>' +
        miss.map(function(q){ return '<li><p class="rq"><span class="qz-lv lv' + q.lv + '">Q' + q.n + '</span>' + esc(q.q) + '</p><p class="ra">正解：<b>' + esc(choiceText(q, q.ans)) + '</b></p><p class="rx">' + esc(q.ex) + '</p></li>'; }).join("") +
        '</ol></details></section>' : '<section class="qz-sec"><p class="qz-allok">まちがえた問題はありません。全問正解です！</p></section>') +
      '<button type="button" class="qz-btn ghost" data-retry>もう一度挑戦する</button>' +
      '<p class="qz-muted c">選択肢の並びは毎回変わります</p>' +
      // ちい活ノートの紹介（点数・共有のあと）
      '<section class="qz-promo" id="qzPromo"><p class="pk">この検定をつくったサイト</p>' +
        '<div class="ph"><img src="/icons/icon-192.png" alt="" width="52" height="52"><div><p class="pn">ちい活ノート</p><p class="pd">ちいかわグッズとイベントの予定帳（非公式）</p></div></div>' +
        '<ul class="pl">' +
          '<li><b>新作グッズ・お菓子の発売日</b>と、予約が始まる日・終わる日を一覧とカレンダーで</li>' +
          '<li><b>POP UP STOREやコラボカフェ</b>の開催期間を、地域別・月別にまとめて</li>' +
          '<li><b>「♡ ほしい」</b>に入れると、発売前日や予約開始を通知でお知らせ<small>（通知に対応した端末・ブラウザ）</small></li>' +
          '<li><b>ホーム画面に追加</b>すると、アイコンからワンタップで確認</li>' +
        '</ul><p class="pf">無料・会員登録なし。最新の情報は公式の発表がいちばん正確です。</p>' +
        '<a class="qz-btn big" href="/?from=quiz" data-qgo="toapp">ちい活ノートを見てみる</a>' +
        (standalone ? "" : '<a class="qz-btn sub" href="/?from=quiz&amp;add=1" data-qgo="addtap">ホーム画面に追加する</a><p class="qz-muted c">追加のしかたは、ちい活ノートのトップでご案内します</p>') +
        '<p class="pm"><a href="/month/' + month + '/" data-qgo="month">今月の発売・イベントカレンダーを見る →</a></p>' +
      '</section>' +
      '</div>';
    top.hidden = true; stage.hidden = false;
    document.documentElement.classList.remove("qz-running");
    stage.innerHTML = h;
    scrollTopNow();
    if (res.sent || res.demo) paintStats(res.stats, res);
    if (perfect && fresh) confetti();
    var promo = document.getElementById("qzPromo");
    if (promo && "IntersectionObserver" in window) {
      var io = new IntersectionObserver(function(es){ if (es[0].isIntersecting) { ct("quiz:promo"); io.disconnect(); } }, { threshold: 0.4 });
      io.observe(promo);
    }
  }

  function confetti(){
    if (reduce) return;
    var box = document.createElement("div"); box.className = "qz-confetti"; box.setAttribute("aria-hidden", "true");
    var colors = ["#E6B422", "#F3D27A", "#E27496", "#8FD3BF", "#9DBDEB"];
    for (var i = 0; i < 36; i++) {
      var s = document.createElement("i");
      s.style.left = Math.round(Math.random() * 100) + "%";
      s.style.background = colors[i % colors.length];
      s.style.animationDelay = (Math.random() * 0.35).toFixed(2) + "s";
      s.style.transform = "rotate(" + Math.round(Math.random() * 360) + "deg)";
      box.appendChild(s);
    }
    document.body.appendChild(box);
    setTimeout(function(){ box.remove(); }, 2200);
  }

  function copy(text, btn){
    function done(){ var o = btn.textContent; btn.textContent = "コピーしました"; setTimeout(function(){ btn.textContent = o; }, 1800); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    function fallback(){ var ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) {} ta.remove(); }
  }

  /* ---------- やめる確認（戻る操作） ---------- */
  function askQuit(){
    var sh = document.createElement("div"); sh.className = "qz-quit";
    sh.innerHTML = '<div class="qz-quitp" role="dialog" aria-modal="true" aria-label="検定をやめますか"><p><b>検定をやめますか？</b></p><p class="qz-muted">ここまでの回答は消えます。</p><div class="qz-row"><button type="button" class="qz-btn ghost" data-quit="no">続ける</button><button type="button" class="qz-btn sub" data-quit="yes">やめる</button></div></div>';
    document.body.appendChild(sh);
    sh.addEventListener("click", function(e){
      var b = e.target.closest("[data-quit]"); if (!b) return;
      sh.remove();
      if (b.getAttribute("data-quit") === "yes") { sessionStorage.removeItem(SS); run = null; showTop(); }
      else { try { history.pushState({ qz: 1 }, ""); } catch (err) {} }
    });
  }
  window.addEventListener("popstate", function(){
    if (run && !document.querySelector(".qz-quit")) askQuit();
    else if (!run && !stage.hidden) { sessionStorage.removeItem(SR); showTop(); }
  });

  /* ---------- 操作 ---------- */
  document.addEventListener("click", function(e){
    var el;
    if ((el = e.target.closest("[data-start]"))) { e.preventDefault(); return start(false); }
    if (!run && (el = e.target.closest("[data-retry]"))) { e.preventDefault(); return start(true); }
    if (run && (el = e.target.closest("[data-pick]"))) return onPick(el.getAttribute("data-pick"));
    if (run && e.target.closest("[data-next]")) return onNext();
    if (run && e.target.closest("[data-lvgo]")) { run.phase = "q"; save(); return renderQuestion(); }
    if ((el = e.target.closest("[data-qshare]"))) {
      var k = el.getAttribute("data-qshare");
      ct(k === "x" ? "quiz:sx" : k === "line" ? "quiz:sl" : "quiz:sc");
      if (k === "copy") copy(el.getAttribute("data-copy"), el);
      return;
    }
    if ((el = e.target.closest("[data-qgo]"))) { var g = el.getAttribute("data-qgo"); if (g === "toapp" || g === "addtap") ct("quiz:" + g); }
  });

  /* ---------- はじめに ---------- */
  ct("quiz:view");
  var qs = new URLSearchParams(location.search);
  if (qs.get("ref") === "share") { ct("quiz:fromshare"); try { history.replaceState(null, "", location.pathname); } catch (e) {} }
  // プレビュー環境だけ：?demo=100 などで結果画面を直接確かめられる（本番のドメインでは動かない）
  var demo = qs.get("demo");
  if (isPreviewHost && demo != null && /^\d+$/.test(demo)) {
    var want = Math.max(0, Math.min(N, Math.round(+demo / 5))), picks = QS.map(function(q, i){ return i < want ? q.ans : q.choices.filter(function(c){ return c.id !== q.ans; })[0].id; });
    showResult({ ver: QUIZ_VER, picks: picks, prev: null, demo: true, stats: null }, true);
    return;
  }
  // 再読み込み・戻るで来たときだけ、直前の結果を出し直す（入口から新しく開いたときはトップを出す）
  function navType(){ try { var e = performance.getEntriesByType("navigation")[0]; return e ? e.type : "navigate"; } catch (err) { return "navigate"; } }
  var saved = jget(sessionStorage, SS, null);
  var res = jget(sessionStorage, SR, null);
  if (saved && saved.ver === QUIZ_VER && Array.isArray(saved.layout) && saved.layout.length === N) {
    run = saved; top.hidden = true; stage.hidden = false; document.documentElement.classList.add("qz-running");
    try { history.replaceState({ qz: 0 }, ""); history.pushState({ qz: 1 }, ""); } catch (e) {}
    render();
  } else if (res && res.ver === QUIZ_VER && Array.isArray(res.picks) && navType() !== "navigate") {
    showResult(res, false);
    if (!res.sent) send(res);
  } else {
    showTop();
  }
})();
