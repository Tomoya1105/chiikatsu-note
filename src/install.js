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

  /* ---- かんたんな計測：1回の訪問ぶんをまとめて、ページを離れるときに1回だけ送る ---- */
  var EV = {}, sent = false;
  function ct(k){ EV[k] = (EV[k] || 0) + 1; }
  window.ct = ct;
  var path = location.pathname;
  ct(path === "/" || path === "/index.html" ? "pv:home" : path.indexOf("/items/") === 0 ? "pv:item" : "pv:other");
  function flush(){
    if (sent || !Object.keys(EV).length) return;
    sent = true;
    try { navigator.sendBeacon("/api/hit", JSON.stringify({ ev: EV })); } catch (e) {}
  }
  document.addEventListener("visibilitychange", function(){ if (document.visibilityState === "hidden") flush(); });
  window.addEventListener("pagehide", flush);
  document.addEventListener("click", function(e){
    var a = e.target.closest("a[href]"); if (!a) return;
    var h = a.href;
    if (/hb\.afl\.rakuten/.test(h)) {
      if (a.hasAttribute("data-rb")) ct("c:books");
      else if (a.hasAttribute("data-rkd")) ct(a.dataset.hit ? (a.dataset.pre ? "c:rkpre" : "c:rk") : "c:rksearch");
      else if (a.classList.contains("trip")) ct("c:travel");
      else if (a.classList.contains("prod")) ct("c:shop");
      else if (a.closest("[data-rk]") || a.closest("[data-pimg]")) ct(a.dataset.pre ? "c:rkpre" : "c:rk");
      else ct("c:rksearch");
    } else if (/af\.moshimo\.com/.test(h)) ct(/p_id=1225/.test(h) ? "c:yahoo" : "c:amazon");
    else if (a.hasAttribute("data-rsv")) ct("c:rsv");
    else if (a.closest(".ncard")) ct("c:news");
    else if (a.hasAttribute("data-fresh")) ct("c:fresh");
    else if (/calendar\.google/.test(h)) ct("c:gcal");
    else if (a.classList.contains("off") || /公式/.test(a.textContent)) ct("c:official");
  }, true);


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
  document.addEventListener("click", function(e){
    var b = e.target.closest("[data-xembed]"); if (!b) return;
    e.preventDefault();
    var box = b.closest(".xbox"), f = box.querySelector(".xframe"), id = b.getAttribute("data-xembed");
    if (!/^\d+$/.test(id)) return;
    if (box.classList.contains("open")){
      box.classList.remove("open"); f.innerHTML = ""; b.setAttribute("aria-expanded", "false");
      b.querySelector(".xl").textContent = "公式の画像を見る"; return;
    }
    box.classList.add("open"); b.setAttribute("aria-expanded", "true"); b.querySelector(".xl").textContent = "画像をとじる";
    f.innerHTML = '<p class="xwait">読み込み中…</p><blockquote class="twitter-tweet" data-dnt="true" data-conversation="none" data-lang="ja" data-theme="' + (isDark() ? "dark" : "light") + '"><a href="https://twitter.com/i/status/' + id + '"></a></blockquote>';
    ct("x:embed");
    var done = false;
    setTimeout(function(){ if (!done && box.classList.contains("open") && !f.querySelector("iframe")) xFail(f, id); }, 12000);
    loadX().then(function(t){ return t.widgets.load(f); }).then(function(){
      done = true; var w = f.querySelector(".xwait"); if (w) w.remove();
      if (!f.querySelector("iframe")) xFail(f, id);
    }).catch(function(){ done = true; xFail(f, id); });
  });


  /* ---- 詳細ページ：楽天で「同じ商品」が見つかったら、検索ではなくその商品ページへ直接つなぐ ---- */
  (function(){
    var b = document.querySelector("[data-rkd]"); if (!b) return;
    var d; try { d = JSON.parse(b.getAttribute("data-rkd")); } catch (e) { return; }
    var RAK = { app: "d328e43a-4e55-4bd7-8ce4-f265afcf674d", key: "pk_xcGUmu6xmFCHvq4iCebKJjAiwMb2IAKrSJhQgGb49vo",
  ep: "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701" }, AFF = { rakutenId: "582a6f7f.e1ade2b2.582a6f84.d5f85faa" };
    var KINDS = ["かるた","ぬいぐるみ","キーホルダー","キーリング","Tシャツ","トレーナー","パーカー","ステッカー","缶バッジ","ポーチ","巾着","タオル","ハンカチ","ソックス","靴下","グミ","ガム","チョコ","クッキー","フィギュア","アクリルスタンド","アクスタ","下敷き","クリアファイル","ノート","付箋","ボールペン","マグ","コップ","お弁当箱","ランチボックス","パジャマ","スリッパ","ブランケット","クッション","バッグ","トート","リュック","財布","スマホケース","カレンダー","手帳","絵本","コミック","カード","シール","マスコット","入浴剤","ガチャ","くじ"], NG = ["中古","USED","ユーズド","美品","未使用品","開封済","プレミア","入手困難","完売品","転売","並行輸入","非公式","互換","ノーブランド","ハンドメイド","レンタル","まとめ買い","ケース販売","業務用","大量"], OTHER_IP = /ディズニー|ミッキー|ミニー|プリンセス|アナと雪|アナ雪|トイ・?ストーリー|サンリオ|キティ|マイメロ|クロミ|シナモ|ポムポム|すみっコ|リラックマ|ポケモン|ピカチュウ|カービィ|マリオ|アンパンマン|ドラえもん|しんちゃん|クレヨンしんちゃん|鬼滅|呪術|スヌーピー|ムーミン|ミッフィー|トミカ|プラレール|戦隊|仮面ライダー|プリキュア|スパイダーマン|マーベル|ちいかわ以外/g;
    var BULK = /×\s?\d{2,}\s?(個|本|袋|枚)|\d{2,}\s?(個|袋)セット/, CH = /ちいかわ|chiikawa|ハチワレ|ナガノ/i;
    var N = function(s){ return String(s || "").normalize("NFKC").toLowerCase().replace(/\s+/g, " "); };
    var q = /ちいかわ|chiikawa/i.test(d.q) ? d.q : "ちいかわ " + d.q;
    var tokens = N(d.q).split(" ").filter(function(t){ return t && !/^(ちいかわ|アニメ|映画)$/.test(t); });
    var distinct = tokens.filter(function(t){ return t.length >= 2 && !KINDS.some(function(k){ return N(k) === t; }); });
    if (!distinct.length) return;   // 種類名だけでは同じ商品か判断できない
    var m = String(d.p).replace(/,/g, "").match(/(\d{2,6})\s*円/), ref = m ? +m[1] : 0;
    var mine = N(d.t + " " + d.q);
    function ok(x){
      var n = x.itemName || "", nm = N(n);
      if (!CH.test(n) || BULK.test(n) || NG.some(function(w){ return n.indexOf(w) >= 0; })) return false;
      var ip = n.match(OTHER_IP) || []; if (new Set(ip).size >= 2) return false;
      if (ref && +x.itemPrice > ref * 1.6) return false;
      if (!tokens.every(function(t){ return nm.indexOf(t) >= 0; })) return false;
      return !KINDS.some(function(k){ return nm.indexOf(N(k)) >= 0 && mine.indexOf(N(k)) < 0; });
    }
    function paint(h){
      if (!h) return;
      var search = b.href;
      b.href = h.url; b.setAttribute("data-hit", "1"); if (d.pre) b.setAttribute("data-pre", "1");
      b.innerHTML = (d.pre ? "楽天で予約する " : "楽天で見る ") + "¥" + Number(h.price).toLocaleString("ja-JP") + ' <span class="tag">PR</span>';
      var more = document.createElement("a");
      more.className = "rkmore"; more.href = search; more.target = "_blank"; more.rel = "noopener sponsored";
      more.textContent = "ほかの商品も楽天で探す";
      b.parentNode.appendChild(more);
    }
    var ck = "rkd1:" + q;
    try { var c = JSON.parse(localStorage.getItem(ck) || "null"); if (c && Date.now() - c.t < 6 * 3600e3) return paint(c.v); } catch (e) {}
    var qs = new URLSearchParams({ applicationId: RAK.app, accessKey: RAK.key, affiliateId: AFF.rakutenId, format: "json", formatVersion: "2",
      availability: "1", imageFlag: "1", NGKeyword: "中古 USED 美品", keyword: q, hits: "10" });
    fetch(RAK.ep + "?" + qs.toString()).then(function(r){ return r.ok ? r.json() : null; }).then(function(j){
      var x = j && (j.Items || []).map(function(i){ return i.Item || i; }).filter(ok)[0];
      var v = x ? { price: +x.itemPrice, url: (x.affiliateUrl && x.affiliateUrl.indexOf("hb.afl.rakuten.co.jp") >= 0) ? x.affiliateUrl : "https://hb.afl.rakuten.co.jp/hgc/" + AFF.rakutenId + "/?pc=" + encodeURIComponent(x.itemUrl) } : null;
      try { localStorage.setItem(ck, JSON.stringify({ t: Date.now(), v: v })); } catch (e) {}
      paint(v);
    }).catch(function(){});
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
  if (isHome && st.visits >= 2 && document.documentElement.classList.contains("ins-off")) setTimeout(showBar, 6000);
  document.addEventListener("click", function(e){
    if (e.target.closest("[data-mark]")) setTimeout(showBar, 900);
    if (e.target.closest("[data-ins-hide]")){ st.topOff = true; save(st); document.documentElement.classList.add("ins-off"); return; }
    var b = e.target.closest("[data-install]");
    if (b){ e.preventDefault(); openSheet(); }
  });

  window.chiikatsuInstall = { open: openSheet };
})();
