/* ちい活ノート：はじめての方へのご案内（3枚のスライド）
   表示するかどうかはトップページ先頭の小さな判定（build.mjs の ONB_GATE）が決め、出す人にだけこのファイルを読み込む。
   ・Xから初めてトップに来た人（utm_source=x など）だけ／一度閉じたら二度と出さない（localStorage: chiikatsu-onb）
   ・ブラウザの「戻る」には手を出さない（履歴を足さない）／JavaScript が動かなければ何も出ず、ふつうのトップのまま
   ・計測は既存のかんたん計測（install.js の ct → /api/hit）に相乗りするだけ。新しい送信先・個人情報はなし */
(function(){
  "use strict";
  if (window.__chiikatsuOnb) return; window.__chiikatsuOnb = 1;
  var DONE = "chiikatsu-onb";
  var DOW = ["日","月","火","水","木","金","土"];
  var reduce = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

  // 計測：install.js（defer）が読み込まれる前でも取りこぼさない
  function T(k, n){ n = n || 0; if (window.ct) window.ct(k); else if (n < 20) setTimeout(function(){ T(k, n + 1); }, 300); }
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, function(c){ return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ---- 実際に載っている予定から、見本に使うものを選ぶ（なければ例を出す） ---- */
  var J = new Date(Date.now() + 9 * 3600e3), TODAY = J.toISOString().slice(0, 10), NOWJ = J.toISOString().slice(0, 16);
  function md(s){ var d = new Date(s.slice(0, 10) + "T00:00:00Z"); return (d.getUTCMonth() + 1) + "/" + d.getUTCDate() + "(" + DOW[d.getUTCDay()] + ")"; }
  function addDays(s, n){ var d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  var ALL = (window.__ITEMS || []).filter(function(it){ return it && !it.hidden && it.region === "jp" && it.t && /^\d{4}-\d{2}-\d{2}$/.test(it.s || "") && (it.sp || "day") === "day"; });
  var isEv = function(it){ return it.cat === "event" || it.cat === "cafe"; };
  var used = {};
  function take(list){ for (var i = 0; i < list.length; i++) if (!used[list[i].id]) { used[list[i].id] = 1; return list[i]; } return null; }
  var rsv = take(ALL.filter(function(it){ return it.rs && it.rs.slice(0, 16) > NOWJ; }).sort(function(a, b){ return a.rs.localeCompare(b.rs); }));
  var rel = take(ALL.filter(function(it){ return !isEv(it) && it.s > TODAY && !(it.rs && it.rs.slice(0, 16) <= NOWJ); }).sort(function(a, b){ return a.s.localeCompare(b.s); }));
  var ev = take(ALL.filter(function(it){ return isEv(it) && it.e && it.s <= TODAY && it.e >= TODAY; }).sort(function(a, b){ return a.e.localeCompare(b.e); }))
        || take(ALL.filter(function(it){ return isEv(it) && it.s > TODAY; }).sort(function(a, b){ return a.s.localeCompare(b.s); }));
  // 予約開始前のものがなければ、受付中のもの（締切の日）で見せる
  if (!rsv) rsv = take(ALL.filter(function(it){ return it.rs && it.re && it.rs.slice(0, 16) <= NOWJ && it.re.slice(0, 16) > NOWJ; }).sort(function(a, b){ return a.re.localeCompare(b.re); }));
  var rows = [];
  if (rel) rows.push({ k: "rel", lab: md(rel.s) + " 発売", t: rel.t });
  if (rsv) rows.push(rsv.rs.slice(0, 16) > NOWJ ? { k: "rsv", lab: md(rsv.rs) + " " + rsv.rs.slice(11, 16) + " 予約開始", t: rsv.t } : { k: "rsv", lab: "予約受付中 〜" + md(rsv.re), t: rsv.t });
  if (ev) rows.push({ k: "ev", lab: ev.s <= TODAY ? "開催中 〜" + md(ev.e) : md(ev.s) + "〜 開催", t: ev.t });
  // 3つそろわないときは、ほかの近い予定で埋める（それでも足りないときだけ例を出す）
  while (rows.length < 3) {
    var more = take(ALL.filter(function(it){ return (it.e || it.s) >= TODAY; }).sort(function(a, b){ return Math.abs(a.s.localeCompare(TODAY)) - Math.abs(b.s.localeCompare(TODAY)) || a.s.localeCompare(b.s); }));
    if (!more) break;
    rows.push(isEv(more) ? { k: "ev", lab: more.s <= TODAY ? "開催中" + (more.e ? " 〜" + md(more.e) : "") : md(more.s) + "〜 開催", t: more.t } : { k: "rel", lab: more.s > TODAY ? md(more.s) + " 発売" : "発売中", t: more.t });
  }
  if (rows.length < 3) {   // 掲載が少ない時期でも見本の形がくずれないように
    var ex = [{ k: "rel", lab: "○/○ 発売", t: "新作ぬいぐるみ（例）" }, { k: "rsv", lab: "○/○ 10:00 予約開始", t: "公式通販の受注商品（例）" }, { k: "ev", lab: "開催中 〜○/○", t: "POP UP STORE（例）" }];
    ex.forEach(function(x){ if (rows.length < 3 && !rows.some(function(r){ return r.k === x.k; })) rows.push(x); });
  }
  // 「今週の予定」：今日から7日間、始まる・予約が始まる予定がある日に印
  var week = [];
  for (var i = 0; i < 7; i++) {
    var ds = addDays(TODAY, i), dd = new Date(ds + "T00:00:00Z");
    var n = ALL.filter(function(it){ return it.s === ds || (it.rs && it.rs.slice(0, 10) === ds); }).length;
    week.push({ d: dd.getUTCDate(), w: DOW[dd.getUTCDay()], n: n, wd: dd.getUTCDay() });
  }
  // 2枚目の見本：これから発売のもの（なければ例）
  var pick = take(ALL.filter(function(it){ return !isEv(it) && it.s > TODAY; }).sort(function(a, b){ return a.s.localeCompare(b.s); })) || rel || rsv;
  var p2 = pick ? { t: pick.t, d: md(pick.s) + " 発売", place: pick.place || "" } : { t: "ちいかわ 新作マスコット（例）", d: "○/○ 発売", place: "全国のショップ" };

  /* ---- 見た目 ---- */
  var CSS = [
    "html.ob-on{overflow:hidden}",
    ".ob{position:fixed;top:0;left:0;right:0;height:100vh;height:100dvh;height:var(--ob-h,100dvh);box-sizing:border-box;z-index:90;display:flex;flex-direction:column;background:var(--bg);color:var(--ink);font-family:var(--body);padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) calc(env(safe-area-inset-bottom,0px) + var(--ob-res,0px)) env(safe-area-inset-left,0px);overscroll-behavior:contain;-webkit-text-size-adjust:100%}",
    ".ob::before{content:'';position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 60% at 50% 0%,var(--acc-soft),transparent 70%)}",
    ".ob>*{position:relative}",
    ".ob-top{display:flex;align-items:center;justify-content:space-between;height:52px;padding:0 6px 0 8px;flex:none}",
    ".ob-skip,.ob-x{border:0;background:none;color:var(--ink-2);font:inherit;cursor:pointer;min-width:44px;min-height:44px;border-radius:12px}",
    ".ob-skip{font-size:14px;padding:0 12px}",
    ".ob-x{font-size:24px;line-height:1;width:44px}",
    ".ob-skip:focus-visible,.ob-x:focus-visible,.ob-btn:focus-visible,.ob-sub:focus-visible,.ob-heart:focus-visible{outline:3px solid var(--acc);outline-offset:2px}",
    ".ob-track{flex:1;min-height:0;display:flex;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;scrollbar-width:none;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain}",
    ".ob-track::-webkit-scrollbar{display:none}",
    ".ob-s{flex:0 0 100%;scroll-snap-align:center;scroll-snap-stop:always;display:flex;flex-direction:column;padding:4px 24px 8px;box-sizing:border-box;overflow-y:auto;overscroll-behavior-y:contain;text-align:center}",
    ".ob-in{margin:auto 0;width:100%;display:flex;flex-direction:column;align-items:center}",
    ".ob-vis{flex:none;width:100%;max-width:340px;height:calc(300px * var(--vs,1));position:relative;margin:0 auto 20px}",
    ".ob-stage{position:absolute;left:50%;top:0;width:340px;height:300px;transform:translateX(-50%) scale(var(--vs,1));transform-origin:50% 0}",
    ".ob-h{font-family:var(--display);font-weight:900;font-size:clamp(22px,6.4vw,27px);line-height:1.4;margin:0 0 10px;letter-spacing:.01em;outline:none}",
    ".ob-p{font-size:15.5px;line-height:1.7;color:var(--ink-2);margin:0;max-width:22em}",
    ".ob-fn{font-size:12px;line-height:1.6;color:var(--ink-3);margin:10px 0 0;max-width:26em}",
    ".ob-foot{flex:none;padding:6px 20px 14px}",
    ".ob-dots{display:flex;justify-content:center;gap:8px;margin:2px 0 14px}",
    ".ob-dots i{width:8px;height:8px;border-radius:99px;background:var(--line);transition:width .25s,background .25s}",
    ".ob-dots i.on{width:22px;background:var(--acc)}",
    ".ob-nav{display:flex;gap:10px;align-items:center;max-width:420px;margin:0 auto}",
    ".ob-back{flex:none;border:1.5px solid var(--line);background:var(--surface);color:var(--ink-2);border-radius:16px;min-height:52px;padding:0 16px;font:inherit;font-size:15px;font-weight:700;cursor:pointer}",
    ".ob-back[aria-hidden=true]{display:none}",
    ".ob-btn{flex:1;border:0;border-radius:16px;min-height:54px;padding:0 16px;font:inherit;font-size:16.5px;font-weight:700;background:var(--acc);color:var(--on-acc);cursor:pointer;box-shadow:0 8px 18px -10px var(--acc)}",
    ".ob-btn:active{transform:scale(.98)}",
    ".ob-sub{display:block;margin:10px auto 0;border:0;background:none;color:var(--acc);font:inherit;font-size:14px;font-weight:700;text-decoration:underline;text-underline-offset:3px;min-height:40px;cursor:pointer}",
    ".ob-sub[hidden]{display:none}",
    ".ob-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}",
    /* 見本の画面（共通） */
    ".ob-card{background:var(--surface);border:1px solid var(--line);border-radius:20px;box-shadow:var(--shadow);text-align:left}",
    /* 1枚目：今週の予定と一覧 */
    ".ob-v1{position:absolute;inset:0;display:flex;flex-direction:column;gap:10px;padding:14px}",
    ".ob-wk{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;padding:10px 8px}",
    ".ob-wk b{display:block;font-size:10.5px;color:var(--ink-3);font-weight:700;text-align:center}",
    ".ob-wk span{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:15px;font-weight:700;padding:4px 0;border-radius:10px}",
    ".ob-wk span.t{background:var(--acc);color:var(--on-acc)}.ob-wk span.t b{color:inherit}",
    ".ob-wk span.su b{color:var(--pink)}.ob-wk span.sa b{color:var(--sky)}",
    ".ob-wk em{width:6px;height:6px;border-radius:9px;background:transparent}.ob-wk em.y{background:var(--acc)}.ob-wk .t em.y{background:var(--on-acc)}",
    ".ob-row{display:flex;gap:10px;align-items:center;padding:10px 12px}",
    ".ob-tag{flex:none;font-size:11.5px;font-weight:700;border-radius:8px;padding:5px 7px;white-space:nowrap}",
    ".ob-tag.rel{background:var(--pink-soft);color:var(--pink)}.ob-tag.rsv{background:var(--butter-soft);color:var(--butter)}.ob-tag.ev{background:var(--mint-soft);color:var(--mint)}",
    ".ob-rt{font-size:13px;line-height:1.45;font-weight:700;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}",
    /* 2枚目：♡ほしい */
    ".ob-v2{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:10px;padding:0 14px}",
    ".ob-noti{position:relative;margin:0 -4px;display:flex;gap:10px;align-items:center;padding:10px 12px;border-radius:18px;background:var(--surface);border:1px solid var(--line);box-shadow:0 10px 26px -12px rgba(58,51,70,.45);text-align:left}",
    ".ob-noti img{width:36px;height:36px;border-radius:9px;flex:none}",
    ".ob-noti p{margin:0;font-size:12.5px;line-height:1.45;color:var(--ink-2);min-width:0}",
    ".ob-noti p b{display:block;color:var(--ink);font-size:12.5px}",
    ".ob-noti p span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".ob-noti small{position:absolute;right:10px;top:8px;font-size:10px;color:var(--ink-3)}",
    ".ob-item{padding:14px 14px 12px}",
    ".ob-item .ob-tag{display:inline-block;margin-bottom:6px}",
    ".ob-it{font-size:15px;line-height:1.5;font-weight:700;margin:0 0 4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}",
    ".ob-pl{font-size:12px;color:var(--ink-3);margin:0 0 10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".ob-heart{position:relative;display:flex;align-items:center;justify-content:center;gap:6px;width:100%;min-height:46px;border-radius:14px;border:2px solid var(--acc);background:var(--surface);color:var(--acc);font:inherit;font-size:16px;font-weight:700;cursor:pointer}",
    ".ob-heart .hh{font-size:19px;line-height:1}",
    ".ob-heart.on{background:var(--acc);color:var(--on-acc)}",
    ".ob-heart .burst{position:absolute;left:50%;top:50%;width:0;height:0;pointer-events:none}",
    ".ob-heart .burst i{position:absolute;font-style:normal;font-size:13px;color:var(--acc);opacity:0}",
    ".ob-mine{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;font-size:13.5px;font-weight:700}",
    ".ob-mine .c{min-width:26px;height:26px;border-radius:99px;background:var(--acc-soft);color:var(--acc);display:inline-flex;align-items:center;justify-content:center;font-size:13px;padding:0 6px;transition:background .3s,color .3s}",
    ".ob-mine .c.on{background:var(--acc);color:var(--on-acc)}",
    /* 3枚目：ホーム画面 */
    ".ob-v3{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}",
    ".ob-phone{height:100%;width:auto;aspect-ratio:9/16;max-width:70%;border-radius:30px;border:6px solid var(--ink);background:linear-gradient(160deg,var(--acc-soft),var(--sky-soft));box-sizing:border-box;padding:24px 11px 12px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:max-content;gap:12px 8px;position:relative}",
    ".ob-phone i{display:block;aspect-ratio:1;border-radius:24%;background:rgba(255,255,255,.55)}",
    ".ob-app{display:flex;flex-direction:column;align-items:center;gap:4px;position:relative;min-width:0}",
    ".ob-app img{width:100%;height:auto;aspect-ratio:1;border-radius:24%;box-shadow:0 4px 10px -4px rgba(58,51,70,.5);display:block}",
    ".ob-app span{font-size:9px;font-weight:700;color:var(--ink);white-space:nowrap}",
    ".ob-ring{position:absolute;left:50%;top:38%;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:99px;border:3px solid var(--acc);opacity:0;pointer-events:none}",
    ".ob-badges{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin:12px 0 0}",
    ".ob-badges span{font-size:12px;font-weight:700;color:var(--ink-2);background:var(--surface);border:1px solid var(--line);border-radius:99px;padding:4px 10px}",
    /* 動き（動きを減らす設定のときは出さない） */
    "@media (prefers-reduced-motion:no-preference){",
    " .ob{animation:obIn .28s ease-out}",
    " @keyframes obIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}",
    " .ob-s.on .ob-v1>*{animation:obUp .5s both}",
    " .ob-s.on .ob-v1>*:nth-child(2){animation-delay:.12s}.ob-s.on .ob-v1>*:nth-child(3){animation-delay:.24s}.ob-s.on .ob-v1>*:nth-child(4){animation-delay:.36s}",
    " @keyframes obUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}",
    " .ob-s.on .ob-noti.show{animation:obDrop .5s cubic-bezier(.2,.9,.3,1.2) both}",
    " @keyframes obDrop{from{opacity:0;transform:translateY(-24px) scale(.96)}to{opacity:1;transform:none}}",
    " .ob-heart.pop .hh{animation:obPop .45s ease-out}",
    " @keyframes obPop{0%{transform:scale(1)}40%{transform:scale(1.5)}100%{transform:scale(1)}}",
    " .ob-heart.pop .burst i{animation:obBurst .7s ease-out both}",
    " @keyframes obBurst{0%{opacity:1;transform:translate(0,0) scale(.6)}100%{opacity:0;transform:translate(var(--x),var(--y)) scale(1.1)}}",
    " .ob-heart.tap::after{content:'';position:absolute;left:62%;top:60%;width:34px;height:34px;margin:-17px;border-radius:99px;background:var(--ink);opacity:0;animation:obTap .6s ease-out}",
    " @keyframes obTap{0%{opacity:.28;transform:scale(.4)}100%{opacity:0;transform:scale(1.6)}}",
    " .ob-s.on .ob-app.new{animation:obBounce .7s .25s both}",
    " @keyframes obBounce{0%{opacity:0;transform:scale(.3)}60%{opacity:1;transform:scale(1.12)}100%{transform:scale(1)}}",
    " .ob-s.on .ob-ring{animation:obRing 1.6s 1.1s ease-out 2}",
    " @keyframes obRing{0%{opacity:.9;transform:scale(.6)}100%{opacity:0;transform:scale(1.7)}}",
    " .ob-track{scroll-behavior:smooth}",
    "}",
    ".ob.cmp .ob-top{height:44px}",
    ".ob.cmp .ob-vis{margin-bottom:12px}",
    ".ob.cmp .ob-h{font-size:21px;line-height:1.38;margin-bottom:6px}",
    ".ob.cmp .ob-p{font-size:14px;line-height:1.6}",
    ".ob.cmp .ob-fn{font-size:11.5px;line-height:1.5;margin-top:6px}",
    ".ob.cmp .ob-s:nth-child(3) .ob-fn{display:none}",
    ".ob.cmp .ob-badges{margin-top:8px}",
    ".ob.cmp .ob-foot{padding:4px 16px 8px}",
    ".ob.cmp .ob-dots{margin:0 0 8px}",
    ".ob.cmp .ob-btn,.ob.cmp .ob-back{min-height:50px}",
    ".ob.cmp .ob-sub{min-height:36px;margin-top:2px}",
    ".ob.tiny .ob-h{font-size:19px}.ob.tiny .ob-p{font-size:13.5px}.ob.tiny .ob-badges{display:none}.ob.tiny .ob-top{height:40px}",
    /* 閉じたあと：一覧の最初の「♡ ほしい」をそっと光らせる（押しつけない・数秒で消える） */
    "@media (prefers-reduced-motion:no-preference){.ob-hint{animation:obHint 1.2s ease-in-out 3}}",
    "@keyframes obHint{0%,100%{box-shadow:0 0 0 0 transparent}50%{box-shadow:0 0 0 6px var(--acc-soft)}}"
  ].join("\n");

  var ICON = '<img src="/icons/icon-192.png" alt="" width="36" height="36">';
  function wk(){
    return '<div class="ob-card ob-wk" aria-hidden="true">' + week.map(function(d, i){
      return '<span class="' + (i === 0 ? "t" : d.wd === 0 ? "su" : d.wd === 6 ? "sa" : "") + '"><b>' + (i === 0 ? "今日" : d.w) + '</b>' + d.d + '<em class="' + (d.n ? "y" : "") + '"></em></span>';
    }).join("") + '</div>';
  }
  var S = [
    { h: "ちいかわの予定、<br>もう見逃さない。", p: "新商品・予約開始・イベント情報を<br>まとめてチェック！",
      vis: '<div class="ob-v1">' + wk() + rows.slice(0, 3).map(function(r){
        return '<div class="ob-card ob-row"><span class="ob-tag ' + r.k + '">' + esc(r.lab) + '</span><span class="ob-rt">' + esc(r.t) + '</span></div>';
      }).join("") + '</div>',
      alt: "見本：今週の予定と、発売日・予約開始・開催期間の一覧" },
    { h: "気になるグッズは、<br>♡で保存。", p: "ほしいものをまとめて、<br>発売日も忘れずチェック！",
      fn: "「通知を受け取る」をオンにすると、♡の予定を前日の夜と当日の朝にお知らせ（iPhoneはホーム画面に追加すると使えます）。",
      vis: '<div class="ob-v2"><div class="ob-noti" aria-hidden="true">' + ICON + '<p><b>ちい活ノート</b><span>明日発売：' + esc(p2.t) + '</span></p><small>通知の例</small></div>' +
        '<div class="ob-card ob-item"><span class="ob-tag rel">' + esc(p2.d) + '</span><p class="ob-it">' + esc(p2.t) + '</p>' + (p2.place ? '<p class="ob-pl">' + esc(p2.place) + '</p>' : "") +
        '<button type="button" class="ob-heart" aria-pressed="false" data-ob-heart><span class="hh" aria-hidden="true">♡</span><span class="hl">ほしい</span><span class="burst" aria-hidden="true"></span></button></div>' +
        '<div class="ob-card ob-mine" aria-hidden="true"><span>マイリスト「ほしい」</span><span class="c" data-ob-c>0</span></div></div>',
      alt: "見本：商品の「♡ ほしい」を押すとマイリストに入り、発売前日に通知が届く様子" },
    { h: "ちい活を、<br>もっと便利に。", p: "ホーム画面に追加すれば、<br>いつでもワンタップ！",
      fn: "ブラウザの「ホーム画面に追加」で置ける、アプリのように開けるショートカットです。",
      after: '<div class="ob-badges" aria-hidden="true"><span>無料</span><span>登録なし</span><span>ダウンロード不要</span></div>',
      vis: '<div class="ob-v3" aria-hidden="true"><div class="ob-phone"><i></i><i></i><i></i><i></i><i></i><div class="ob-app new"><img src="/icons/icon-192.png" alt="" width="60" height="60"><span>ちい活ノート</span><b class="ob-ring"></b></div><i></i><i></i><i></i><i></i><i></i><i></i></div></div>',
      alt: "見本：スマートフォンのホーム画面に、ちい活ノートのアイコンが並んでいる様子" }
  ];

  var root, track, slides, dots, back, next, sub, live, cur = 0, seen = { 0: 1 }, lastFocus = null, closed = false, outs = [];

  function build(){
    if (!document.getElementById("ob-css")) { var st = document.createElement("style"); st.id = "ob-css"; st.textContent = CSS; document.head.appendChild(st); }
    root = document.createElement("div");
    root.className = "ob"; root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-roledescription", "はじめての方へのご案内");
    root.setAttribute("aria-label", "ちい活ノートの使い方（3枚）");
    root.innerHTML =
      '<div class="ob-top"><button type="button" class="ob-skip" data-ob="skip">スキップ</button><button type="button" class="ob-x" data-ob="close" aria-label="閉じる">×</button></div>' +
      '<div class="ob-track" tabindex="-1">' + S.map(function(s, i){
        return '<section class="ob-s" role="group" aria-roledescription="スライド" aria-label="3枚中' + (i + 1) + '枚目"' + (i ? ' aria-hidden="true" inert' : "") + '>' +
          '<div class="ob-in"><div class="ob-vis" role="img" aria-label="' + esc(s.alt) + '"><div class="ob-stage">' + s.vis + '</div></div>' +
          '<h2 class="ob-h" tabindex="-1">' + s.h + '</h2><p class="ob-p">' + s.p + '</p>' + (s.after || "") + (s.fn ? '<p class="ob-fn">' + s.fn + '</p>' : "") + '</div></section>';
      }).join("") + '</div>' +
      '<div class="ob-foot"><div class="ob-dots" aria-hidden="true"><i></i><i></i><i></i></div>' +
      '<div class="ob-nav"><button type="button" class="ob-back" data-ob="back">戻る</button><button type="button" class="ob-btn" data-ob="next">次へ</button></div>' +
      '<button type="button" class="ob-sub" data-ob="add" hidden>ホーム画面に追加する方法を見る</button>' +
      '<p class="ob-sr" aria-live="polite"></p></div>';
    track = root.querySelector(".ob-track"); slides = root.querySelectorAll(".ob-s"); dots = root.querySelectorAll(".ob-dots i");
    back = root.querySelector(".ob-back"); next = root.querySelector(".ob-btn"); sub = root.querySelector(".ob-sub"); live = root.querySelector(".ob-sr");
    // ホーム画面から開いている人・すでに追加済みの人には、追加の案内ボタンは出さない
    var app = document.documentElement.classList.contains("is-app");
    if (app) { var b3 = slides[2].querySelector(".ob-badges"); if (b3) b3.remove(); }
    root.__app = app;

    // 背景のページは触れない・読み上げない
    Array.prototype.forEach.call(document.body.children, function(el){
      if (el.tagName === "SCRIPT" || el.tagName === "STYLE") return;
      if (!el.hasAttribute("inert")) { el.setAttribute("inert", ""); el.setAttribute("aria-hidden", "true"); outs.push(el); }
    });
    document.body.appendChild(root);
    document.documentElement.classList.add("ob-on");
    lastFocus = document.activeElement;

    root.addEventListener("click", onClick);
    root.addEventListener("keydown", onKey);
    var tmr = null;
    track.addEventListener("scroll", function(){
      clearTimeout(tmr);
      tmr = setTimeout(function(){ var i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth)); if (i !== cur) setCur(i, true); }, 80);
    }, { passive: true });
    var relayout = function(){ if (closed) return; fit(); track.scrollLeft = cur * track.clientWidth; };
    window.__obRelayout = relayout;
    if (!window.__obBound) {   // 2回目以降（「使い方」から開き直したとき）に同じ見張りを重ねない
      window.__obBound = 1;
      var rl = function(){ if (window.__obRelayout) window.__obRelayout(); };
      window.addEventListener("resize", rl);
      window.addEventListener("orientationchange", function(){ setTimeout(rl, 300); });
      if (window.visualViewport) visualViewport.addEventListener("resize", rl);
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
    fit();
    setCur(0, false);
    setTimeout(function(){ var h = slides[0].querySelector(".ob-h"); if (h) h.focus({ preventScroll: true }); }, 50);
  }

  /* 表示できる高さに合わせる。
     iPhone の Xアプリ内ブラウザは、ページの下の部分にXの投稿のシート（と、その上のツールバー）が重なって出る。
     ページ側からはシートの大きさを知る方法がないので、Xアプリ内と分かるときだけ、画面の下 約1/3 を空けて
     ボタンをその上に置く（画面写真で、シートとツールバーは画面の下 約31% を覆っていた）。
     そのうえで、イラストを縮め、それでも入らないときは説明の部分だけをスクロールできるようにする。 */
  var ua = navigator.userAgent || "", iOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var qs = window.__chiikatsuOnbQ || "";
  var xApp = /[?&]obx=1\b/.test(qs) || (iOS && (/Twitter|\bX\/\d/i.test(ua) || (!/Safari\//.test(ua) && !!window.__chiikatsuOnbX)));
  function fit(){
    var vv = window.visualViewport, H = Math.round(Math.min(window.innerHeight || 9999, vv ? vv.height : 9999));
    if (!(H > 0) || H === 9999) H = document.documentElement.clientHeight;
    var sh = (window.screen && screen.height) || H;
    var res = xApp ? Math.max(0, Math.min(Math.round(H * 0.4), Math.round(H - sh * 0.66))) : 0;
    root.style.setProperty("--ob-h", H + "px");
    root.style.setProperty("--ob-res", res + "px");
    root.classList.toggle("ob-xapp", xApp);
    var cs = getComputedStyle(root), usable = H - res - (parseFloat(cs.paddingTop) || 0);
    root.classList.toggle("cmp", usable < 680);
    root.classList.toggle("tiny", usable < 480);   // とても狭いとき（iPhone SE を Xアプリで開いたときなど）
    // スライドごとに、文章とボタンを入れたうえで残る高さまでイラストを縮める
    var avail = track.clientHeight;
    for (var k = 0; k < slides.length; k++) {
      var sl = slides[k], vis = sl.querySelector(".ob-vis"), inn = sl.querySelector(".ob-in");
      sl.style.setProperty("--vs", "1");
      var mb = parseFloat(getComputedStyle(vis).marginBottom) || 0, ps = getComputedStyle(sl);
      var other = inn.offsetHeight - vis.offsetHeight - mb;   // イラスト以外（文章など）の高さ
      var room = avail - other - mb - (parseFloat(ps.paddingTop) || 0) - (parseFloat(ps.paddingBottom) || 0);
      var w = Math.max(200, sl.clientWidth - 48);
      var vs = Math.max(0.42, Math.min(1, room / 300, w / 340));
      sl.style.setProperty("--vs", vs.toFixed(3));
    }
  }

  function go(i){
    i = Math.max(0, Math.min(S.length - 1, i));
    track.scrollTo({ left: i * track.clientWidth, behavior: reduce ? "auto" : "smooth" });
    setCur(i, false);
  }
  function setCur(i, bySwipe){
    cur = i;
    for (var k = 0; k < slides.length; k++) {
      slides[k].classList.toggle("on", k === i);
      if (k === i) { slides[k].removeAttribute("aria-hidden"); slides[k].removeAttribute("inert"); } else { slides[k].setAttribute("aria-hidden", "true"); slides[k].setAttribute("inert", ""); }
      dots[k].classList.toggle("on", k === i);
    }
    var last = i === S.length - 1;
    back.setAttribute("aria-hidden", i ? "false" : "true"); back.tabIndex = i ? 0 : -1;
    next.textContent = last ? "ちい活ノートをはじめる ♡" : "次へ";
    sub.hidden = !last || root.__app;
    if (sub.hidden !== root.__subH) { root.__subH = sub.hidden; fit(); }   // 最後の1枚はリンクのぶんボタンの場所が上がるので、イラストを測り直す
    live.textContent = "3枚中" + (i + 1) + "枚目：" + slides[i].querySelector(".ob-h").textContent;
    if (!seen[i]) { seen[i] = 1; M("ob:s" + (i + 1)); }
    if (i === 1) play2();
    if (bySwipe) { var h = slides[i].querySelector(".ob-h"); if (h && root.contains(document.activeElement) && document.activeElement.classList.contains("ob-h")) h.focus({ preventScroll: true }); }
  }

  // 2枚目：♡を押す → マイリストに入る → 通知が届く、を一度だけ自動で見せる（押せば何度でも試せる）
  var played = false, timers = [];
  function heart(on){
    var b = root.querySelector("[data-ob-heart]"), c = root.querySelector("[data-ob-c]");
    b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false");
    b.querySelector(".hh").textContent = on ? "♥" : "♡";
    c.textContent = on ? "1" : "0"; c.classList.toggle("on", on);
    if (on && !reduce) {
      var bu = b.querySelector(".burst"), html = "";
      for (var k = 0; k < 7; k++) { var a = k / 7 * Math.PI * 2; html += '<i style="--x:' + Math.round(Math.cos(a) * 46) + 'px;--y:' + Math.round(Math.sin(a) * 30) + 'px">♥</i>'; }
      bu.innerHTML = html; b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop");
    }
    var n = root.querySelector(".ob-noti");
    if (on) { n.style.visibility = ""; n.classList.remove("show"); void n.offsetWidth; n.classList.add("show"); }
    else n.style.visibility = "hidden";
  }
  function play2(){
    if (played) return; played = true;
    if (reduce) { heart(true); return; }
    heart(false);
    var b = root.querySelector("[data-ob-heart]");
    timers.push(setTimeout(function(){ b.classList.add("tap"); }, 700));
    timers.push(setTimeout(function(){ b.classList.remove("tap"); heart(true); }, 1000));
  }

  function onClick(e){
    var hb = e.target.closest("[data-ob-heart]");
    if (hb) { timers.forEach(clearTimeout); played = true; heart(hb.getAttribute("aria-pressed") !== "true"); return; }
    var b = e.target.closest("[data-ob]"); if (!b) return;
    var a = b.getAttribute("data-ob");
    if (a === "next") { if (cur < S.length - 1) go(cur + 1); else finish("done"); }
    else if (a === "back") go(cur - 1);
    else if (a === "skip") finish("skip");
    else if (a === "close") finish("close");
    else if (a === "add") { M("ob:add"); finish("done", true); }
  }
  function onKey(e){
    if (e.key === "Escape") { e.preventDefault(); finish("close"); return; }
    if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && !/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) { e.preventDefault(); go(cur + (e.key === "ArrowRight" ? 1 : -1)); return; }
    if (e.key === "Tab") {   // ご案内の中だけを移動する
      var f = Array.prototype.filter.call(root.querySelectorAll("button,[tabindex='0']"), function(el){ return !el.hidden && el.tabIndex >= 0 && el.getAttribute("aria-hidden") !== "true" && !el.closest("[aria-hidden='true']") && el.offsetParent !== null; });
      if (!f.length) return;
      var i = f.indexOf(document.activeElement);
      if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && (i === f.length - 1 || i === -1)) { e.preventDefault(); f[0].focus(); }
    }
  }

  function finish(how, openAdd){
    if (closed) return; closed = true;
    try { localStorage.setItem(DONE, JSON.stringify({ r: how, at: cur + 1, d: TODAY })); } catch (e) {}
    try { localStorage.setItem("chiikatsu-intro-off", "1"); } catch (e) {}   // 「はじめての方へ」の案内は、ここで見たので重ねて出さない
    var intro = document.getElementById("intro"); if (intro) intro.hidden = true;
    document.documentElement.classList.remove("has-intro");
    M("ob:" + how);
    timers.forEach(clearTimeout);
    outs.forEach(function(el){ el.removeAttribute("inert"); el.removeAttribute("aria-hidden"); });
    document.documentElement.classList.remove("ob-on");
    root.remove();
    if (lastFocus && lastFocus.focus && lastFocus !== document.body) try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
    if (openAdd && window.chiikatsuInstall) { window.chiikatsuInstall.open(); return; }
    // そっと「♡ ほしい」の場所を教える（画面に見えているものだけ。数秒で消える）
    if (how === "done") setTimeout(function(){
      var w = document.querySelectorAll("#view-list [data-mark='want']"), vh = window.innerHeight;
      for (var k = 0; k < w.length; k++) { var r = w[k].getBoundingClientRect(); if (r.top > 0 && r.bottom < vh) { var el = w[k]; el.classList.add("ob-hint"); setTimeout(function(){ el.classList.remove("ob-hint"); }, 3800); break; } }
    }, 250);
  }

  // 「使い方」から開いたとき（help）は、はじめての方の数字と混ざらないよう ob:help だけを数える
  var help = false;
  function M(k){ if (!help) T(k); }
  function start(){
    if (!closed && root || !document.body) return;
    help = !!window.__chiikatsuOnbForce || /[?&]ob=1\b/.test(window.__chiikatsuOnbQ || "");
    if (help) { open(); return; }
    try { if (localStorage.getItem(DONE)) return; } catch (e) {}
    try { sessionStorage.setItem("chiikatsu-obs", "1"); } catch (e) {}   // この訪問で見た印（「ほしい」・詳細ページの利用を数えるため）
    build();
    T("ob:show");
  }
  // トップの下の「使い方」から、何度でも開き直せる
  function open(){
    if (root && !closed) return;
    help = true; closed = false; cur = 0; seen = { 0: 1 }; played = false; timers = []; outs = []; lastFocus = null;
    build();
    T("ob:help");
  }
  window.chiikatsuOnb = { open: open };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
