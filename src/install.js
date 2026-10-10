/* ちい活ノート：ホーム画面に追加（アプリのように使う）ための案内 */
(function(){
  "use strict";
  var KEY = "chiikatsu-install";
  var ua = navigator.userAgent || "";
  var isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var isAndroid = /Android/.test(ua);
  var isMobile = isIOS || isAndroid;
  var inApp = /Line\/|Instagram|FBAN|FBAV|FB_IAB|Twitter|TikTok|BytedanceWebview|musical_ly/i.test(ua);
  var isLine = /Line\//i.test(ua);
  var iosOther = isIOS && /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua); // iPhone の Chrome など
  var standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  var deferred = null;

  function load(){ try{ return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; }catch(e){ return {}; } }
  function save(s){ try{ localStorage.setItem(KEY, JSON.stringify(s)); }catch(e){} }
  var st = load();

  // オフラインでも開けるようにする仕組み（Service Worker）
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function(){ navigator.serviceWorker.register("/sw.js").catch(function(){}); });
  }

  if (standalone) {
    st.installed = true; save(st);
    document.documentElement.classList.add("is-app");
  }

  window.addEventListener("beforeinstallprompt", function(e){
    e.preventDefault(); deferred = e;
  });
  window.addEventListener("appinstalled", function(){
    if (window.ct) window.ct("install");
    st.installed = true; save(st); closeBar(); closeSheet();
    say("ホーム画面に追加しました。次からはアイコンから開けます");
  });

  /* ---- かんたんな計測（段階0）：ページごとに回数をまとめ、ページを離れるときに1回だけ送る ----
     サーバーには「日ごとの合計」しか残らない。端末を見分ける番号は作らず、送らない。
     訪問＝同じタブで開いている間のひとまとまり（30分何もしなければ次は新しい訪問）。訪問の中で何をしたかの印は、このタブの中（sessionStorage）にだけ持つ。
     テストモード（運営者・お友達の確認用）の端末は、区分「テスト」として送る（一般の数字に混ざらない）。 */
  var EV = {};
  function ct(k){ EV[k] = (EV[k] || 0) + 1; }
  window.ct = ct;
  var path = location.pathname, now0 = Date.now();
  var isHomeP = path === "/" || path === "/index.html", isItemP = path.indexOf("/items/") === 0;
  function jst(ms){ return new Date(ms + 9 * 3600e3).toISOString().slice(0, 10); }
  function lsGet(k, d){ try { return JSON.parse(localStorage.getItem(k) || "null") || d; } catch (e) { return d; } }
  function lsSet(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  // テストモード：?test=on / ?test=off、運営者メニュー、画面左下の印から切り替える。30日たつと自動でオフ
  var TKEY = "chiikatsu-test", TEST = lsGet(TKEY, null), qs0 = (isHomeP && window.__chiikatsuOnbQ) || location.search, tmMsg = "";
  if (TEST && !(TEST.on && now0 - (TEST.at || 0) < 30 * 864e5)) { if (TEST.on) tmMsg = "テストモードを終了しました（30日たったため）"; TEST = null; try { localStorage.removeItem(TKEY); } catch (e) {} }
  var tq = /[?&]test=(on|off)\b/.exec(qs0);
  if (tq) {
    if (tq[1] === "on" && !TEST) { TEST = { on: 1, at: now0 }; lsSet(TKEY, TEST); tmMsg = "この端末をテストモードにしました（数字は「テスト」に入ります）"; }
    if (tq[1] === "off" && TEST) { TEST = null; try { localStorage.removeItem(TKEY); } catch (e) {} tmMsg = "テストモードを終了しました"; }
    if (!isHomeP) try { history.replaceState(history.state, "", location.pathname + location.search.replace(/([?&])test=(on|off)&?/, "$1").replace(/[?&]$/, "") + location.hash); } catch (e) {}
  }
  function flush(){
    if (!Object.keys(EV).length) return;
    try { if (navigator.sendBeacon("/api/hit", JSON.stringify({ ev: EV, t: TEST ? 1 : 0 }))) EV = {}; } catch (e) {}
  }

  // 訪問のひとまとまり（このタブの中だけ）。区分（一般／テスト）が変わったら新しい訪問にする（同じ訪問が両方に入らないように）
  var VKEY = "chiikatsu-vs", VS = null;
  // 戻る操作で復元された古いページが、別ページの付けた印を消さないように、保存する前と印を付ける前に、保存されている最新を読み直して合わせる
  // 同じ訪問の印は、別のタブ（ページ復元・「新しいタブで開く」で引き継がれたタブ）とも合わせる。保存するのは、ランダムな訪問番号と印だけ
  var VF = "chiikatsu-vf";
  function vfGet(){ try { var m = JSON.parse(localStorage.getItem(VF) || "null"); return m && typeof m === "object" ? m : {}; } catch (e) { return {}; } }
  function vfPut(x){ try { var m = vfGet(), ks = Object.keys(m), now = Date.now(); ks.forEach(function(k){ if (!m[k] || now - (m[k].t || 0) > 2 * 3600e3) delete m[k]; }); if (VS) m[VS.id] = { f: VS.f, x: x || VS.x || 0, t: now }; ks = Object.keys(m).sort(function(a, b){ return m[b].t - m[a].t; }); ks.slice(6).forEach(function(k){ delete m[k]; }); localStorage.setItem(VF, JSON.stringify(m)); } catch (e) {} }
  function vsPull(){
    try {
      var cur = JSON.parse(sessionStorage.getItem(VKEY) || "null");
      if (cur && cur.f && VS) { if (cur.id !== VS.id) VS = cur; else { for (var k in cur.f) VS.f[k] = 1; if (cur.x) VS.x = 1; } }
      var sh = VS && vfGet()[VS.id];
      if (sh && sh.f) { for (var k2 in sh.f) VS.f[k2] = 1; if (sh.x) VS.x = 1; }
    } catch (e) {}
  }
  function vsSave(){ try { vsPull(); sessionStorage.setItem(VKEY, JSON.stringify(VS)); } catch (e) {} vfPut(); }
  function newVisit(){
    VS = { id: Date.now() + "." + Math.floor(Math.random() * 1e6), t: Date.now(), s: TEST ? "t" : "g", f: {} };
    ct("v:new");
    if (standalone) ct("v:hs");
    var xin = null; try { xin = sessionStorage.getItem("chiikatsu-xin"); } catch (e) {}
    if (xin === "1" || (!isHomeP && /[?&]utm_source=(x|twitter)\b/i.test(location.search))) { VS.x = 1; ct("v:x"); }
    try { sessionStorage.setItem(VKEY, JSON.stringify(VS)); } catch (e) {}   // 新しい訪問は、古い保存を読み直さずにそのまま書く
    vfPut();
  }
  function once(f, k){ vsPull(); if (!VS || VS.f[f]) return; VS.f[f] = 1; ct(k); vsSave(); }
  try {
    VS = JSON.parse(sessionStorage.getItem(VKEY) || "null");
    if (!VS || !VS.f || Date.now() - (VS.t || 0) > 30 * 60e3 || VS.s !== (TEST ? "t" : "g")) newVisit();
    else { VS.t = Date.now(); if (!VS.x && (sessionStorage.getItem("chiikatsu-xin") === "1" || (!isHomeP && /[?&]utm_source=(x|twitter)\b/i.test(location.search)))) { VS.x = 1; ct("v:x"); } vsSave(); }
    try { if (sessionStorage.getItem("chiikatsu-xin") === "1") sessionStorage.setItem("chiikatsu-xin", "2"); } catch (e) {}
  } catch (e) { VS = null; }   // 保存できないブラウザでは、訪問の流れは数えない（ページ表示だけ数える）
  function touch(){ if (VS) { VS.t = Date.now(); vsSave(); } }

  ct(isHomeP ? "pv:home" : isItemP ? "pv:item" : "pv:other");
  if (isHomeP) once("h", "f:h");
  if (isItemP) { once("i", "f:i"); if (VS && VS.f.h) once("hi", "f:hi"); if (VS && VS.x) once("xi", "f:xi"); }

  /* 1日1回・1週1回だけ、この端末の様子を数える（数えたかどうかは、この端末の中にだけ覚える）：
     使った端末 / 前の日以前にも来た端末 / その週に使った端末と、先週も使った端末 / ホーム画面から開いた端末 /
     「ほしい」か♡が1つ以上ある端末（その日に押した分も含む）/ 通知を許可している端末 */
  var U = lsGet("chiikatsu-u", {}), today = jst(now0);
  function weekOf(ms){ var d = new Date(ms + 9 * 3600e3), w = (d.getUTCDay() + 6) % 7; return jst(ms - w * 864e5); }   // その週の月曜（日本時間）
  function nSaved(){ var m = lsGet("chiikatsu-mine", {}), f = lsGet("chiikatsu-fav", []); return Object.keys(m).filter(function(k){ return m[k] === "want"; }).length + (f.length || 0); }
  function favCheck(){ if (U.fav !== today && nSaved()) { U.fav = today; ct("u:fav"); lsSet("chiikatsu-u", U); } }
  try {
    if (U.last !== today) {
      ct("u:dev");
      if (U.first && U.first < today) ct("u:ret");
      var ns = nSaved(); if (ns) EV["u:saved"] = Math.min(50, ns);
      if (window.Notification && Notification.permission === "granted") ct("u:push");
      U.first = U.first || today; U.last = today;
    }
    var wk = weekOf(now0);
    if (U.wk !== wk) { ct("u:wk"); if (U.wk === weekOf(now0 - 7 * 864e5)) ct("u:wkret"); U.wk = wk; }
    if (standalone && U.app !== today) { U.app = today; ct("u:app"); }
    lsSet("chiikatsu-u", U);
    favCheck();
  } catch (e) {}
  // 「はじめての方へのご案内」を見た訪問で、詳細ページを見たか（1回だけ）
  try { if (sessionStorage.getItem("chiikatsu-obs") === "1" && isItemP && !sessionStorage.getItem("chiikatsu-obi")) { ct("ob:item"); sessionStorage.setItem("chiikatsu-obi", "1"); } } catch (e) {}

  document.addEventListener("visibilitychange", function(){ if (document.visibilityState === "hidden") { touch(); flush(); } });
  window.addEventListener("pagehide", flush);

  // 購入先の見分け：公式通販（公式通販の商品ページだと分かるものだけ）／公式の予約ページ／楽天／Yahoo!／Amazon。それ以外の公式リンクは「公式情報」
  var OFFSHOP = /^https:\/\/(www\.)?chiikawamarket\.jp\/products\//;
  function destOf(a, h){
    if (/hb\.afl\.rakuten/.test(h)) return a.classList.contains("trip") ? "o:travel" : "rk";
    if (/af\.moshimo\.com/.test(h)) return /p_id=1225/.test(h) ? "yh" : "am";
    if (a.hasAttribute("data-rsv")) return "rsv";
    if (OFFSHOP.test(h)) return "off";
    if (a.closest(".ncard")) return "o:news";
    if (a.hasAttribute("data-fresh")) return "o:fresh";
    if (a.hasAttribute("data-dl")) return "o:dl";
    if (/calendar\.google/.test(h)) return "o:gcal";
    if (a.classList.contains("off") || /公式/.test(a.textContent)) return "o:info";
    return "";
  }
  function placeOf(a){
    if (isItemP) return "item";
    if (isHomeP) return a.closest("#view-mine") ? "mine" : a.closest("#view-shop") ? "shop" : "list";
    return "sum";
  }
  document.addEventListener("click", function(e){
    touch();
    // サイト内の別ページへ移る直前に、ここまでの分を送っておく（移動中に送信が落ちて、訪問や「トップを見た」印が欠けないように。件数は変わらない）
    var ia = e.target.closest && e.target.closest("a[href]"); if (ia && ia.origin === location.origin && !ia.hasAttribute("download") && !ia.target) flush();
    var sb = e.target.closest("[data-share]"); if (sb) ct("share:" + sb.getAttribute("data-share"));
    if (e.target.closest("[data-mark='want'],[data-nmark]")) {
      once("w", "f:w"); if (VS && VS.x) once("xw", "f:xw");
      try { if (sessionStorage.getItem("chiikatsu-obs") === "1" && !sessionStorage.getItem("chiikatsu-obw")) { ct("ob:want"); sessionStorage.setItem("chiikatsu-obw", "1"); } } catch (err) {}
      setTimeout(favCheck, 0);
    }
    var a = e.target.closest("a[href]"); if (!a) return;
    var h = a.href;
    if (/^https:\/\/line\.me\/R\/share/.test(h)) ct("share:line");
    else if (/^https:\/\/(x|twitter)\.com\/intent\//.test(h) && !sb) ct("share:x");
    var d = destOf(a, h); if (!d) return;
    if (d.indexOf("o:") === 0) { ct(d); return; }
    var pl = placeOf(a); ct("b:" + pl + ":" + d);
    var card = a.closest(".card"), id = card ? card.getAttribute("data-id") : isItemP ? decodeURIComponent(path.split("/")[2] || "") : "";
    if (id && pl !== "shop") ct("bi:" + id);
    once("b", "f:b");
    if (pl === "item") once("ib", "f:ib");
    if (pl === "list") once("lb", "f:lb");
    if (VS && VS.x) once("xb", "f:xb");
  }, true);

  // テストモードの印（この端末にだけ見える）。押すと「やめる」が出て、もう一度押すと終了
  function setTest(on){
    flush();   // ここまでの分は、今までの区分で送ってから切り替える
    if (on) { TEST = { on: 1, at: Date.now() }; lsSet(TKEY, TEST); } else { TEST = null; try { localStorage.removeItem(TKEY); } catch (e) {} }
    try { if (VS) newVisit(); } catch (e) {}
    drawTest();
  }
  window.chiikatsuTest = { set: setTest, get: function(){ return !!TEST; } };
  var tmEl = null;
  function drawTest(){
    if (!TEST) { if (tmEl) { tmEl.remove(); tmEl = null; } return; }
    if (tmEl) return;
    tmEl = document.createElement("button"); tmEl.type = "button"; tmEl.className = "tm-badge"; tmEl.textContent = "テスト中";
    tmEl.setAttribute("aria-label", "この端末はテストモードです。押すと、やめるボタンが出ます");
    tmEl.style.cssText = "position:fixed;left:calc(8px + env(safe-area-inset-left,0px));bottom:calc(8px + env(safe-area-inset-bottom,0px));z-index:95;border:0;border-radius:99px;padding:6px 11px;font:700 11.5px/1.2 system-ui,sans-serif;background:#3A3346;color:#fff;opacity:.82;cursor:pointer";
    tmEl.onclick = function(){
      if (tmEl.dataset.open) { setTest(false); say("テストモードを終了しました"); return; }
      tmEl.dataset.open = "1"; tmEl.textContent = "テストモードをやめる ×"; tmEl.style.background = "#E27496";
      setTimeout(function(){ if (tmEl && tmEl.dataset.open) { delete tmEl.dataset.open; tmEl.textContent = "テスト中"; tmEl.style.background = "#3A3346"; } }, 4000);
    };
    (document.body || document.documentElement).appendChild(tmEl);
  }
  function tmStart(){ drawTest(); if (tmMsg) say(tmMsg); }
  if (document.body) setTimeout(tmStart, 0); else document.addEventListener("DOMContentLoaded", tmStart);

  /* ---- 公式Xの投稿（画像）を、押したときだけここに表示する（サイトから離れずに見られる） ---- */
  var xLoading = null;
  function loadX(){
    if (window.twttr && window.twttr.widgets && window.twttr.widgets.load) return Promise.resolve(window.twttr);
    if (xLoading) return xLoading;
    xLoading = new Promise(function(res, rej){
      var s = document.createElement("script");
      s.src = "https://platform.twitter.com/widgets.js"; s.async = true; s.charset = "utf-8";
      s.onload = function(){ if (window.twttr && window.twttr.ready) window.twttr.ready(function(t){ res(t); }); else rej(); };
      s.onerror = function(){ xLoading = null; rej(); };
      document.head.appendChild(s);
    });
    return xLoading;
  }
  function isDark(){
    var t = document.documentElement.getAttribute("data-theme");
    return t ? t === "dark" : !!(window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
  }
  function xFail(f, id){
    f.innerHTML = '<p class="xwait">画像を読み込めませんでした。通信の状態や、広告・トラッキングをブロックする設定を確かめてください。<a href="https://x.com/i/status/' + id + '" target="_blank" rel="noopener">Xで見る</a></p>';
  }
  // auto：詳細ページで自動表示するとき。読み込めない（削除・非公開・通信不可）ときは、枠ごと消して「画像なし」に戻す
  function openX(b, auto){
    var box = b.closest(".xbox"), f = box.querySelector(".xframe"), id = b.getAttribute("data-xembed");
    if (!/^\d+$/.test(id)) return;
    box.classList.add("open"); if (auto) box.classList.add("auto");
    b.setAttribute("aria-expanded", "true"); b.querySelector(".xl").textContent = "画像をとじる";
    f.innerHTML = auto ? '' : '<p class="xwait">公式の投稿を読み込み中…</p>';
    ct("x:embed");
    var done = false;
    function fail(){ if (auto) { box.hidden = true; f.innerHTML = ""; } else xFail(f, id); }
    setTimeout(function(){ if (!done && box.classList.contains("open") && !f.querySelector("iframe")) { done = true; fail(); } }, 12000);
    loadX().then(function(t){
      // blockquote + widgets.load は、描画が終わる前に完了して「失敗」と誤判定することがあった。createTweet は描画後に要素を返す（診断ページで20件すべて表示を確認）
      return t.widgets.createTweet(id, f, { dnt: true, conversation: "none", lang: "ja", theme: isDark() ? "dark" : "light" });
    }).then(function(el){
      if (done) return; done = true;
      var w = f.querySelector(".xwait"); if (w) w.remove();
      if (!el || !f.querySelector("iframe")) fail(); else box.classList.add("ready");
    }).catch(function(){ if (!done) { done = true; fail(); } });
  }
  document.addEventListener("click", function(e){
    var b = e.target.closest("[data-xembed]"); if (!b) return;
    e.preventDefault();
    var box = b.closest(".xbox"), f = box.querySelector(".xframe");
    if (box.classList.contains("open")){
      box.classList.remove("open", "auto", "ready"); f.innerHTML = ""; b.setAttribute("aria-expanded", "false");
      b.querySelector(".xl").textContent = "公式の画像を見る"; return;
    }
    // 一覧では同時に開くのは1件だけ（重さと縦の長さを抑える）
    if (box.classList.contains("xlist")) document.querySelectorAll(".xbox.xlist.open").forEach(function(o){
      var ob = o.querySelector("[data-xembed]"); o.classList.remove("open", "ready"); o.querySelector(".xframe").innerHTML = ""; ob.setAttribute("aria-expanded", "false"); ob.querySelector(".xl").textContent = "公式の画像を見る";
    });
    openX(b, false);
  });
  // 詳細ページでは、公式の投稿が画面に近づいたら自動で表示する（最初の表示は軽いまま。Xの読み込みは近づいてから）
  if (/^\/items\//.test(location.pathname) && "IntersectionObserver" in window) {
    var xo = new IntersectionObserver(function(ents){
      ents.forEach(function(en){ if (!en.isIntersecting) return; xo.unobserve(en.target); var b = en.target.querySelector("[data-xembed]"); if (b && !en.target.classList.contains("open")) openX(b, true); });
    }, { rootMargin: "250px 0px" });
    document.querySelectorAll(".detail .xbox").forEach(function(x){ x.classList.add("auto"); xo.observe(x); });
  }


  /* ---- 詳細ページ：楽天で「同じ商品」が見つかったら、ページ上部に商品画像を出し、ボタンをその商品ページへ直接つなぐ ----
     画像は楽天ウェブサービス（商品検索API）が返す楽天のサーバー上の画像をそのまま表示する（保存・コピーはしない）。
     同じ商品かどうかは RKM.pick で厳しく判定し、怪しければ画像は出さない。 */
  (function(){
    var bs = document.querySelectorAll("[data-rkd]"), b = bs[0]; if (!b) return;   // 購入先は上と下の2か所。どちらも同じ内容にそろえる
    var d; try { d = JSON.parse(b.getAttribute("data-rkd")); } catch (e) { return; }
    var it = { t: d.t, q: d.q, price: d.p, cat: d.cat || "goods" };
    var p = RKM.plan(it); if (!p) return;   // 商品を特定できる言葉がない → 画像なし（枠も作っていない）
    var RAK = { app: "d328e43a-4e55-4bd7-8ce4-f265afcf674d", key: "pk_xcGUmu6xmFCHvq4iCebKJjAiwMb2IAKrSJhQgGb49vo",
  ep: "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701" }, AFF = { rakutenId: "582a6f7f.e1ade2b2.582a6f84.d5f85faa" };
    function esc(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, function(c){ return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
    function paint(h){
      if (!h) return fillHero(null, b.href);
      var search = b.href;
      Array.prototype.forEach.call(bs, function(x){
        x.href = h.url; x.setAttribute("data-hit", "1"); if (d.pre) x.setAttribute("data-pre", "1");
        x.innerHTML = (d.pre ? "楽天で予約する " : "楽天で見る ") + "¥" + Number(h.price).toLocaleString("ja-JP") + ' <span class="tag">PR</span>';
        var more = document.createElement("a");
        more.className = "rkmore"; more.href = search; more.target = "_blank"; more.rel = "noopener sponsored";
        more.textContent = "ほかの商品も楽天で探す";
        x.parentNode.appendChild(more);
      });
      fillHero(h, search);
    }
    // ページ上部の枠（高さは最初から確保してあるので、中身が変わっても下の文章は動かない）
    function fillHero(h, search){
      var hero = document.querySelector("[data-dhero]"); if (!hero) return;
      if (h && /^https:\/\/(thumbnail\.image|shop\.r10s|tshop\.r10s|image)\.rakuten\.co\.jp\//.test(h.img || "")) {
        hero.className = "dhero on";
        hero.innerHTML = '<a class="dh-img" href="' + esc(h.url) + '" target="_blank" rel="noopener sponsored" data-rkhero' + (d.pre ? ' data-pre="1"' : '') + '><img src="' + esc(h.img) + '" alt="' + esc(h.name) + '" width="160" height="160" decoding="async"></a>' +
          '<div class="dh-txt"><p class="dh-k">楽天市場の商品 <span class="tag">PR</span></p><p class="dh-n">' + esc(h.name) + '</p><a class="dh-b" href="' + esc(h.url) + '" target="_blank" rel="noopener sponsored" data-rkhero' + (d.pre ? ' data-pre="1"' : '') + '>' + (d.pre ? "楽天で予約する" : "楽天で見る") + ' ¥' + Number(h.price).toLocaleString("ja-JP") + '</a></div>';
      } else {
        // 同じ商品と言い切れないときは画像を出さない（まちがった商品の画像を見せないため）
        hero.className = "dhero none";
        hero.innerHTML = '<div class="dh-txt"><p class="dh-k">楽天市場では、まだ同じ商品が見つかっていません</p><a class="dh-b sub" href="' + esc(search || b.href) + '" target="_blank" rel="noopener sponsored">関連する商品を楽天で探す</a> <span class="tag">PR</span></div>';
      }
    }
    var ck = "rkd3:" + p.query;   // リンクの作り方を直したので、古い覚え書きは使わない
    try { var c = JSON.parse(localStorage.getItem(ck) || "null"); if (c && Date.now() - c.t < 6 * 3600e3) return paint(c.v); } catch (e) {}
    var qs = new URLSearchParams({ applicationId: RAK.app, accessKey: RAK.key, affiliateId: AFF.rakutenId, format: "json", formatVersion: "2",
      availability: "1", imageFlag: "1", NGKeyword: "中古 USED 美品", keyword: p.query, hits: "10" });
    fetch(RAK.ep + "?" + qs.toString()).then(function(r){ return r.ok ? r.json() : null; }).then(function(j){
      var list = (j && j.Items || []).map(function(i){
        var x = i.Item || i, img = (x.mediumImageUrls || [])[0];
        if (img && typeof img === "object") img = img.imageUrl;
        if (img) img = img.replace(/\?_ex=\d+x\d+/, "") + "?_ex=400x400";
        return { name: x.itemName || "", price: +x.itemPrice || 0, img: img || "",
          url: RKM.affUrl(x.affiliateUrl, x.itemUrl) };
      });
      var v = RKM.pick(it, list);
      try { localStorage.setItem(ck, JSON.stringify({ t: Date.now(), v: v })); } catch (e) {}
      paint(v);
    }).catch(function(){ fillHero(null, b.href); });
  })();

  /* ---- 小さな部品 ---- */
  var SHARE = '<svg class="ii" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5H16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  var DOTS3 = '<svg class="ii" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/></svg>';
  var KEBAB = '<svg class="ii" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="19" r="2" fill="currentColor"/></svg>';
  var PLUS = '<svg class="ii" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8.5v7M8.5 12h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  var ICON = '<img src="/icons/icon-192.png" alt="" width="44" height="44" class="appicon">';

  function say(msg){
    var t = document.getElementById("toast");
    if (!t){ t = document.createElement("div"); t.className = "toast"; t.setAttribute("role","status"); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(say._t); say._t = setTimeout(function(){ t.hidden = true; }, 3200);
  }

  function steps(){
    var lead = '<p class="ins-lead">一度追加すると、ホーム画面のアイコンからアプリのようにすぐ開けます。登録やダウンロードは必要ありません。</p>';
    if (standalone) return '<p class="ins-lead">いまホーム画面のアイコンから開いています。追加はもう完了しています。</p>';
    if (inApp) {
      var ext = isLine ? '<a class="ins-btn" href="' + location.pathname + '?openExternalBrowser=1">' + (isIOS ? "Safari" : "ブラウザ") + 'で開く</a>' : "";
      return lead +
        '<p class="ins-note">いまはLINEやSNSアプリの中でページを開いているため、このままでは追加できません。先に' + (isIOS ? "Safari" : "Chrome") + 'で開いてください。</p>' +
        (ext ||
        '<ol class="ins-steps"><li><b>' + DOTS3 + '</b><span>画面の右上か右下にある「…」や共有ボタンをタップ</span></li>' +
        '<li><b>2</b><span>「' + (isIOS ? "Safariで開く" : "ブラウザで開く") + '」を選ぶ</span></li>' +
        '<li><b>3</b><span>開いたページで、もう一度この案内のとおりに追加します</span></li></ol>');
    }
    if (isIOS && !iosOther) return lead +
      '<ol class="ins-steps">' +
      '<li><b>' + SHARE + '</b><span>画面の下にある<strong>共有ボタン</strong>をタップ<small>見つからないときは、右下の「…」をタップすると出てきます</small></span></li>' +
      '<li><b>' + PLUS + '</b><span>メニューを上にスクロールして<strong>「ホーム画面に追加」</strong>をタップ</span></li>' +
      '<li><b>3</b><span>右上の<strong>「追加」</strong>をタップして完了です</span></li></ol>';
    if (iosOther) return lead +
      '<ol class="ins-steps">' +
      '<li><b>' + SHARE + '</b><span>アドレスバーの右にある<strong>共有ボタン</strong>をタップ</span></li>' +
      '<li><b>' + PLUS + '</b><span><strong>「ホーム画面に追加」</strong>をタップ<small>出てこないときは「その他」の中を探してください</small></span></li>' +
      '<li><b>3</b><span>右上の<strong>「追加」</strong>をタップして完了です</span></li></ol>';
    if (deferred) return lead + '<button class="ins-btn" type="button" data-go>ホーム画面に追加する</button>';
    if (isAndroid) return lead +
      '<ol class="ins-steps">' +
      '<li><b>' + KEBAB + '</b><span>画面右上の<strong>「︙」</strong>をタップ</span></li>' +
      '<li><b>' + PLUS + '</b><span><strong>「ホーム画面に追加」</strong>または<strong>「アプリをインストール」</strong>をタップ</span></li>' +
      '<li><b>3</b><span><strong>「追加」</strong>（または「インストール」）をタップして完了です</span></li></ol>';
    return '<p class="ins-lead">スマートフォンでこのページを開くと、ホーム画面に追加してアプリのように使えます。</p>' +
      '<p class="ins-note">iPhoneはSafariの共有ボタン →「ホーム画面に追加」、Androidは右上の「︙」→「ホーム画面に追加」です。</p>';
  }

  /* ---- 説明シート ---- */
  var sheet = null;
  function openSheet(){
    closeBar();
    if (!sheet){
      sheet = document.createElement("div");
      sheet.className = "ins-sheet"; sheet.hidden = true;
      sheet.innerHTML = '<div class="ins-back" data-close></div><div class="ins-panel" role="dialog" aria-modal="true" aria-labelledby="insTitle"><div class="ins-head">' + ICON + '<div><h2 id="insTitle">ホーム画面に追加する</h2><p>ちい活ノートをアプリのように</p></div><button class="ins-x" type="button" data-close aria-label="閉じる">×</button></div><div class="ins-body"></div></div>';
      document.body.appendChild(sheet);
      sheet.addEventListener("click", function(e){
        if (e.target.closest("[data-close]")) closeSheet();
        if (e.target.closest("[data-go]")) prompt();
      });
      document.addEventListener("keydown", function(e){ if (e.key === "Escape") closeSheet(); });
    }
    sheet.querySelector(".ins-body").innerHTML = steps();
    sheet.hidden = false;
    document.documentElement.classList.add("ins-open");
    var x = sheet.querySelector(".ins-x"); if (x) x.focus();
  }
  function closeSheet(){ if (sheet){ sheet.hidden = true; document.documentElement.classList.remove("ins-open"); } }

  function prompt(){
    if (!deferred) return openSheet();
    deferred.prompt();
    deferred.userChoice.then(function(r){
      if (r && r.outcome === "accepted"){ st.installed = true; save(st); closeSheet(); }
      deferred = null;
    });
  }

  /* ---- 画面下のおすすめバー（スマホだけ・押しつけない） ---- */
  var bar = null;
  function closeBar(){ if (bar){ bar.remove(); bar = null; } }
  function showBar(why){
    if (bar || standalone || st.installed || !isMobile) return;
    if ((st.no || 0) >= 3) return;                                  // 3回閉じたら、もう出さない
    if (st.later && Date.now() - st.later < 14 * 864e5) return;     // 閉じたら2週間は出さない
    bar = document.createElement("div");
    bar.className = "ins-bar";
    var sub = why === "want" ? "「ほしい」に入れた予定を、アイコンからすぐ見られます" : "アイコンからすぐ開けて、毎日の確認がラクになります";
    bar.innerHTML = ICON + '<p><b>ホーム画面に追加しませんか？</b><span>' + sub + '</span></p><button type="button" class="ins-open-btn">' + (inApp ? (isIOS ? "Safariで開く方法" : "ブラウザで開く方法") : "追加のしかた") + '</button><button type="button" class="ins-x" aria-label="閉じる">×</button>';
    if (why) ct("ins:bar:" + why);
    bar.querySelector(".ins-open-btn").onclick = function(){ deferred ? prompt() : openSheet(); };
    bar.querySelector(".ins-x").onclick = function(){ st.later = Date.now(); st.no = (st.no || 0) + 1; save(st); closeBar(); };
    document.body.appendChild(bar);
  }

  // 出すタイミング：2回目以降の訪問ですこし経ってから／初回は「ほしい」などを押したとき
  st.visits = (st.visits || 0) + 1; save(st);
  var isHome = location.pathname === "/" || location.pathname === "/index.html";
  if (isHome && st.visits >= 2 && document.documentElement.classList.contains("ins-off")) setTimeout(showBar, 6000);
  document.addEventListener("click", function(e){
    // 「♡ ほしい」を押したとき（はじめての訪問でも）、保存した予定をすぐ見られることと結びつけて1回だけ案内する
    var mk = e.target.closest("[data-mark]");
    if (mk) {
      var card = mk.closest(".card,.wantrow"), mid = card && card.getAttribute("data-id"), tries = 0;
      // 「追加しました♡」の案内（トースト）が出ている間は待ってから出す（重ならないように）
      var wait = function(){
        var t = document.getElementById("toast");
        if (t && !t.hidden && tries++ < 16) return setTimeout(wait, 500);
        var want = false;
        try { want = !!mid && (JSON.parse(localStorage.getItem("chiikatsu-mine") || "{}") || {})[mid] === "want"; } catch (err) {}
        showBar(want ? "want" : "");
      };
      setTimeout(wait, 900);
    }
    if (e.target.closest("[data-intro-add]")) ct("ins:intro");
    if (e.target.closest("[data-ins-hide]")){ st.topOff = true; save(st); document.documentElement.classList.add("ins-off"); return; }
    var b = e.target.closest("[data-install]");
    if (b){ e.preventDefault(); openSheet(); }
  });

  /* ---- 載っていない情報を教えてもらう（一覧の件数の行・検索で見つからないとき・月別／地域別のまとめページ） ----
     送られた内容は手がかりとしてだけ使い、自動更新が公式の発表で確かめられたものだけを載せる */
  var tipSheet = null, TIPK = "chiikatsu-tips";
  function tipOpen(b){
    ct("tip:open");
    if (!tipSheet){
      tipSheet = document.createElement("div");
      tipSheet.className = "ins-sheet tip-sheet"; tipSheet.hidden = true;
      tipSheet.innerHTML = '<div class="ins-back" data-tipclose></div><div class="ins-panel" role="dialog" aria-modal="true" aria-labelledby="tipTitle">' +
        '<div class="ins-head"><div><h2 id="tipTitle">載っていない情報を教える</h2><p>新商品・イベント・予約開始など</p></div><button class="ins-x" type="button" data-tipclose aria-label="閉じる">×</button></div>' +
        '<form class="tipform" novalidate><label>どんな情報ですか？<textarea name="text" maxlength="600" rows="3" placeholder="例：〇〇でちいかわのPOP UPが11月から開催されるみたいです"></textarea></label>' +
        '<label>情報がのっているページのURL（あれば）<input name="url" type="url" inputmode="url" maxlength="500" placeholder="https://"></label>' +
        '<p class="tipnote">公式サイトや公式Xのリンクがあると、早く確かめられます。お名前やメールアドレスは必要ありません。</p>' +
        '<p class="tipnote">いただいた情報は、公式の発表で確かめられたものだけを掲載します。</p>' +
        '<button type="submit" class="ins-btn">送る</button><p class="tipmsg" role="status"></p></form></div>';
      document.body.appendChild(tipSheet);
      tipSheet.addEventListener("click", function(e){ if (e.target.closest("[data-tipclose]")) tipClose(); });
      tipSheet.querySelector("form").addEventListener("submit", tipSend);
    }
    var f = tipSheet.querySelector("form"), q = b.getAttribute("data-tipq"), c = b.getAttribute("data-tipctx");
    f.reset(); f.querySelector(".tipmsg").textContent = ""; f.querySelector("button").disabled = false;
    if (q) f.text.value = "「" + q + "」で探しましたが見つかりませんでした。";
    tipSheet.dataset.ctx = c || "";
    tipSheet.hidden = false; document.documentElement.classList.add("ins-open");
    setTimeout(function(){ try { f.text.focus(); } catch (e) {} }, 50);
  }
  function tipClose(){ if (tipSheet){ tipSheet.hidden = true; document.documentElement.classList.remove("ins-open"); } }
  function tipSend(e){
    e.preventDefault();
    var f = e.target, msg = f.querySelector(".tipmsg"), text = f.text.value.trim(), url = f.url.value.trim();
    if (text.length < 2 && !url){ msg.textContent = "情報を書くか、URLを入れてください"; return; }
    if (url && !/^https?:\/\/\S{3,}$/.test(url)){ msg.textContent = "URLは https:// から始まる形で入れてください"; return; }
    // 同じ端末からの送りすぎを防ぐ（30秒に1回・1日10回まで）
    var now = Date.now(), log = [];
    try { log = (JSON.parse(localStorage.getItem(TIPK) || "[]") || []).filter(function(t){ return now - t < 864e5; }); } catch (err) {}
    if (log.length && now - log[log.length - 1] < 30e3){ msg.textContent = "少し時間をおいてから送ってください"; return; }
    if (log.length >= 10){ msg.textContent = "今日はたくさん送っていただきました。ありがとうございます。続きはまた明日お願いします"; return; }
    var btn = f.querySelector("button"); btn.disabled = true; msg.textContent = "送っています…";
    var ctx = tipSheet.dataset.ctx;
    fetch("/api/report", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId: "tip", title: "載っていない情報" + (ctx ? "（" + ctx + "）" : ""), kind: "tip", text: text.slice(0, 600), url: url.slice(0, 500), page: location.pathname }) })
      .then(function(r){
        if (!r.ok) throw new Error(r.status);
        log.push(now); try { localStorage.setItem(TIPK, JSON.stringify(log)); } catch (err) {}
        ct("tip:send"); tipClose();
        say("ありがとうございます！公式の発表で確かめられたら掲載します");
      })
      .catch(function(){ btn.disabled = false; msg.textContent = "送れませんでした。時間をおいてもう一度お試しください"; });
  }
  document.addEventListener("click", function(e){ var b = e.target.closest("[data-tip]"); if (b){ e.preventDefault(); tipOpen(b); } });
  document.addEventListener("keydown", function(e){ if (e.key === "Escape") tipClose(); });

  // 「はじめての方へ」のボタン：X・LINE・インスタなどのアプリの中で開いているときは、先にSafari（ブラウザ）で開く必要があることを伝える
  try { var ib = document.querySelector("[data-intro-add]"); if (ib && inApp) ib.textContent = (isIOS ? "Safari" : "ブラウザ") + "で開いて、ホーム画面に追加する ›"; } catch (e) {}

  window.chiikatsuInstall = { open: openSheet };
})();

/* 「Xでポスト」：スマホではXアプリを直接開いて、投稿文を入れた状態にする。
   ホーム画面のアプリから普通のリンクで開くと、ログインしていない別のブラウザ画面になってしまうため。
   Xアプリが入っていないときは、少し待ってからこれまでどおりWeb版を開く。 */
(function(){
  var ua = navigator.userAgent || "";
  var mobile = /iPhone|iPad|iPod|Android/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!mobile) return;
  document.addEventListener("click", function(e){
    var a = e.target.closest && e.target.closest('a[href^="https://x.com/intent/"],a[href^="https://twitter.com/intent/"]');
    if (!a) return;
    var u; try { u = new URL(a.href); } catch (err) { return; }
    var p = u.searchParams, msg = p.get("text") || "";
    if (p.get("url")) msg += (msg ? "\n" : "") + p.get("url");
    if (p.get("hashtags")) msg += " " + p.get("hashtags").split(",").map(function(h){ return "#" + h.trim(); }).join(" ");
    e.preventDefault();
    var left = false;
    var onHide = function(){ if (document.visibilityState === "hidden") left = true; };
    var onBlur = function(){ left = true; };   // 「Xで開きますか？」の確認が出たときも、画面からフォーカスが外れる
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("blur", onBlur);
    location.href = "twitter://post?message=" + encodeURIComponent(msg);
    setTimeout(function(){
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("blur", onBlur);
      if (!left && document.visibilityState === "visible") location.href = a.href;   // アプリが開かなかった（入っていない）
    }, 1800);
  }, true);
})();
