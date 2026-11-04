/* 詳細ページで「ほしい」を押した直後に、その場で通知をオンにできるようにする（トップの通知の登録と同じ宛先・同じ保存先 /api/push-sub を使う）。
 * ・許可のダイアログは、「通知をオンにする」を押したときだけ出す。ページを開いただけでは出さない。
 * ・最初の設定は「ほしい」に入れた予定の通知だけ（予約開始・再入荷・ニュース速報はオフ）。トップの設定画面から足せる。
 * ・すでに通知がオンの人には、案内を出さずに「ほしい」の一覧だけをそっと更新する。通知が使えない・ブロック中・「あとで」から30日以内は、何も出さない。
 * ・数える項目：pn:show（案内を出した）／pn:tap（押した）／pn:grant（許可された）／pn:deny（許可されなかった）／pn:later（あとで）。通知がオンになったときは push:on も数える。
 * VAPID の公開鍵は build.mjs が src/app.js の値をここに埋め込む（鍵が2つにならないように）。 */
(function(){
  var VAPID = "/*VAPID*/";
  var OK = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  var IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var APP = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  var K = "chiikatsu-mine", LATER = "chiikatsu-pn-later", LATER_MS = 30 * 864e5;
  var box = null, shown = false, syncT = null;
  function ct(k){ if (window.ct) window.ct(k); }
  function ls(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function lset(k, v){ try { localStorage.setItem(k, v); } catch(e){} }
  function wants(){ try { var m = JSON.parse(ls(K) || "{}") || {}; return Object.keys(m).filter(function(i){ return m[i] === "want"; }); } catch(e){ return []; } }
  function chars(){ try { var c = JSON.parse(ls("chiikatsu-push-chars") || "[]"); return Array.isArray(c) ? c : []; } catch(e){ return []; } }
  function u8(s){ s = s.replace(/-/g, "+").replace(/_/g, "/"); var b = atob(s + "===".slice((s.length + 3) % 4)); return Uint8Array.from(b, function(c){ return c.charCodeAt(0); }); }
  function post(sub){
    return fetch("/api/push-sub", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sub: sub.toJSON(), want: wants(), rsv: ls("chiikatsu-push-rsv") !== "0", news: ls("chiikatsu-push-news") !== "0", chars: chars(), favN: 0 }) })
      .then(function(r){ if (!r.ok) throw new Error(r.status); });
  }
  function existing(){ return navigator.serviceWorker.getRegistration().then(function(reg){ return reg ? reg.pushManager.getSubscription() : null; }); }
  function where(){ var w = document.querySelector(".wantrow"); if (!w) return null; if (!box) { box = document.createElement("div"); box.className = "pnbox"; box.setAttribute("role", "status"); box.hidden = true; w.appendChild(box); } return box; }
  function draw(html){ var b = where(); if (!b) return; b.innerHTML = html; b.hidden = !html; }
  function offer(){
    if (shown) return; shown = true; ct("pn:show");
    draw('<p>発売・開始の前日の夜と当日の朝に、通知でお知らせしますか？</p><div class="pnacts"><button type="button" class="btn ok" data-pn="on">通知をオンにする</button><button type="button" class="btn" data-pn="later">あとで</button></div>');
  }
  function guideIos(){
    if (shown) return; shown = true; ct("pn:show");
    draw('<p>iPhone・iPadは、ホーム画面に追加すると、通知で発売日をお知らせできます。</p><div class="pnacts"><button type="button" class="btn" data-install>ホーム画面に追加する方法</button></div>');
  }
  function onWant(e){
    var d = e.detail || {};
    if (!d.on) { if (OK && Notification.permission === "granted") { clearTimeout(syncT); syncT = setTimeout(function(){ existing().then(function(s){ if (s) post(s).catch(function(){}); }); }, 1500); } return; }
    if (!OK) { if (IOS && !APP) guideIos(); return; }
    if (Notification.permission === "denied") return;
    existing().then(function(sub){
      if (sub) { post(sub).catch(function(){}); return; }                    // すでにオン：案内は出さず、一覧だけ更新
      var t = parseInt(ls(LATER) || "0", 10); if (t && Date.now() - t < LATER_MS) return;
      offer();
    }).catch(function(){});
  }
  function turnOn(){
    ct("pn:tap");
    Notification.requestPermission().then(function(perm){
      if (perm !== "granted") { ct("pn:deny"); draw(""); return null; }
      return navigator.serviceWorker.register("/sw.js").then(function(){ return navigator.serviceWorker.ready; })
        .then(function(reg){ return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(VAPID) }); })
        .then(function(sub){
          if (ls("chiikatsu-push-rsv") === null) lset("chiikatsu-push-rsv", "0");      // 最初は「ほしい」の通知だけ
          if (ls("chiikatsu-push-news") === null) lset("chiikatsu-push-news", "0");
          return post(sub);
        })
        .then(function(){ ct("pn:grant"); ct("push:on"); draw('<p>通知をオンにしました。「ほしい」に入れた予定を、前日の夜と当日の朝にお知らせします。予約開始や再入荷のお知らせは、<a href="/?v=mine">トップの「マイリスト」</a>で足せます。</p>'); });
    }).catch(function(){ draw('<p>通知をオンにできませんでした。時間をおいてお試しください。</p>'); });
  }
  document.addEventListener("click", function(e){
    var b = e.target.closest && e.target.closest("[data-pn]"); if (!b) return;
    if (b.dataset.pn === "on") turnOn();
    else { lset(LATER, String(Date.now())); ct("pn:later"); draw(""); }
  });
  document.addEventListener("chiikatsu-want", onWant);
})();
