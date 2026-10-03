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
    st.installed = true; save(st); closeBar(); closeSheet();
    say("ホーム画面に追加しました。次からはアイコンから開けます");
  });

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
  function showBar(){
    if (bar || standalone || st.installed || !isMobile) return;
    if ((st.no || 0) >= 3) return;                                  // 3回閉じたら、もう出さない
    if (st.later && Date.now() - st.later < 14 * 864e5) return;     // 閉じたら2週間は出さない
    bar = document.createElement("div");
    bar.className = "ins-bar";
    bar.innerHTML = ICON + '<p><b>ホーム画面に追加しませんか？</b><span>アイコンからすぐ開けて、毎日の確認がラクになります</span></p><button type="button" class="ins-open-btn">追加のしかた</button><button type="button" class="ins-x" aria-label="閉じる">×</button>';
    bar.querySelector(".ins-open-btn").onclick = function(){ deferred ? prompt() : openSheet(); };
    bar.querySelector(".ins-x").onclick = function(){ st.later = Date.now(); st.no = (st.no || 0) + 1; save(st); closeBar(); };
    document.body.appendChild(bar);
  }

  // 出すタイミング：2回目以降の訪問ですこし経ってから／初回は「ほしい」などを押したとき
  st.visits = (st.visits || 0) + 1; save(st);
  var isHome = location.pathname === "/" || location.pathname === "/index.html";
  if (isHome && st.visits >= 2) setTimeout(showBar, 6000);
  document.addEventListener("click", function(e){
    if (e.target.closest("[data-mark]")) setTimeout(showBar, 900);
    var b = e.target.closest("[data-install]");
    if (b){ e.preventDefault(); openSheet(); }
  });

  window.chiikatsuInstall = { open: openSheet };
})();
