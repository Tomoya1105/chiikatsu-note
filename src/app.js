/* ===== 設定 ===== */
const AFF = { rakutenId: "582a6f7f.e1ade2b2.582a6f84.d5f85faa" };
/* 楽天ウェブサービス（Webアプリケーション。許可サイト chiikatsunote.com と chiikatsu-note.pages.dev からのみ使えるキー） */
const RAK = { app: "d328e43a-4e55-4bd7-8ce4-f265afcf674d", key: "pk_xcGUmu6xmFCHvq4iCebKJjAiwMb2IAKrSJhQgGb49vo",
  ep: "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701" };

const OSHI = {"chiikawa": ["ちいかわ", "#E27496", "#FBE3EB"], "hachiware": ["ハチワレ", "#4A74B5", "#E0E9F6"], "usagi": ["うさぎ", "#C4961A", "#FAF0CE"], "momonga": ["モモンガ", "#8A68C8", "#ECE5F8"], "kuri": ["くりまんじゅう", "#9C6A3F", "#F2E5D8"], "furuhon": ["古本屋", "#D0533C", "#FADDD6"], "rakko": ["ラッコ", "#7A6A5E", "#ECE6E1"], "shisa": ["シーサー", "#D8731C", "#FCE6D2"]};
function applyOshi(k){
  if (!OSHI[k]) k = "chiikawa";
  document.documentElement.dataset.oshi = k;
  document.querySelectorAll("#swatches .sw").forEach(b=>b.setAttribute("aria-pressed", b.dataset.k===k));
  try{ localStorage.setItem("chiikatsu-oshi", k); }catch(e){}
}
document.getElementById("swatches").innerHTML = Object.entries(OSHI).map(([k,[n,a,s]])=>
  `<button class="sw" data-k="${k}" aria-pressed="false"><i style="background:conic-gradient(${a} 0 50%,${s} 0 100%)"></i>${n}</button>`).join("");
document.getElementById("swatches").onclick = e=>{ const b=e.target.closest(".sw"); if(!b) return; applyOshi(b.dataset.k); };
function oshiOpen(open){
  const p = document.getElementById("oshiPanel"); p.hidden = !open;
  document.getElementById("oshiBtn").setAttribute("aria-expanded", open);
}
document.getElementById("oshiBtn").onclick = e=>{ e.stopPropagation(); oshiOpen(document.getElementById("oshiPanel").hidden); };
document.addEventListener("click", e=>{
  const p = document.getElementById("oshiPanel"); if (p.hidden) return;
  if (e.target.closest("[data-oshiclose]")){ oshiOpen(false); const k = document.documentElement.dataset.oshi; if (OSHI[k] && typeof toast==="function") toast(`推しカラーを「${OSHI[k][0]}」にしました`); return; }
  if (!e.target.closest("#oshiPanel") && !e.target.closest("#oshiBtn")) oshiOpen(false);   // パネルの外を押したら閉じる
});
document.addEventListener("keydown", e=>{ if (e.key==="Escape") oshiOpen(false); });
{ let k0 = "chiikawa"; try{ k0 = localStorage.getItem("chiikatsu-oshi") || "chiikawa"; }catch(e){} applyOshi(k0); }

const CAT = {goods:"グッズ",food:"お菓子・食品",kuji:"くじ",event:"イベント",cafe:"カフェ・お店",book:"本・カレンダー"};
const SP = {day:"日付まで決定",early:"上旬",mid:"中旬",late:"下旬",month:"月のみ"};
const DOW = ["日","月","火","水","木","金","土"];
const DAYMS = 86400000;
const TODAY = (()=>{const d=new Date();d.setHours(0,0,0,0);return d})();
const P = s => {const [y,m,d]=String(s).split("-").map(Number);return new Date(y,(m||1)-1,d||1)};
const diffDays = (a,b) => Math.round((a-b)/DAYMS);
const isEvent = it => it.cat==="event"||it.cat==="cafe";
const ymd = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const esc = s => String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const safeUrl = u => /^https:\/\//.test(u||"") ? u : "";

/* ===== データ（共有の保存庫から読み込み） ===== */
let ITEMS = [];
/* ===== 日本／海外 ===== */
const REG = {jp:"日本",tw:"台湾",kr:"韓国",hk:"香港",cn:"中国",th:"タイ",sg:"シンガポール",my:"マレーシア",us:"アメリカ"};
const R = {region:"jp", country:"all"};
try{ const r0 = JSON.parse(localStorage.getItem("chiikatsu-region")||"null"); if (r0 && r0.region) Object.assign(R, r0); }catch(e){}
const regionOf = it => REG[it.region] ? it.region : "jp";
function inRegion(it){
  const r = regionOf(it);
  if (R.region==="jp") return r==="jp";
  if (r==="jp") return false;
  return R.country==="all" || r===R.country;
}
const VIS = () => ITEMS.filter(inRegion);
let loaded = false, loadFailed = false;
function prep(id, d){
  const it = Object.assign({}, d, {id});
  it.sp = it.sp || "day";
  it.sd = P(it.s);
  it.ed = it.e ? P(it.e) : null;
  return it;
}

// 公式通販などの予約・受注（rs=受付開始, re=締切, rsv=予約ページ）
const isRsv = it => !!(it.rsv && (Array.isArray(it.rsv) ? it.rsv.length : it.rsv));
const rsvList = it => Array.isArray(it.rsv) ? it.rsv.filter(x=>x && /^https:\/\//.test(x.u)) : (/^https:\/\//.test(it.rsv||"") ? [{n:"", u:it.rsv}] : []);
const PT = s => s ? new Date(s.length>10 ? s+":00+09:00" : s+"T00:00:00+09:00") : null;
function rsvState(it){
  if (!isRsv(it)) return null;
  const L = rsvList(it);
  if (L.length && L.every(x=>x.so)) return "soldout";
  const now = new Date(), a = PT(it.rs), b = PT(it.re);
  if (b && now > b) return "closed";
  if (a && now < a) return "before";
  return "open";
}
/* 抽選・受注・整理券などの締切（dl）。発売日とは別に、締切が近いものをわかりやすくする */
const dlList = it => (Array.isArray(it.dl) ? it.dl : []).filter(x => x && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(x.until||""));
const nextDls = it => dlList(it).filter(x => PT(x.until) > new Date()).sort((a,b)=>PT(a.until)-PT(b.until));
function leftText(until){
  const t = PT(until), ms = t - new Date(), h = ms/3600e3;
  const j = new Date(t.getTime()+9*3600e3), hm = until.slice(11,16);
  const today = new Date(Date.now()+9*3600e3).toISOString().slice(0,10), dd = until.slice(0,10);
  const tom = new Date(Date.now()+9*3600e3+864e5).toISOString().slice(0,10);
  if (h < 3){ const mm = Math.max(1,Math.floor(ms/60000)); return {txt:`あと${mm>=60?`${Math.floor(mm/60)}時間${mm%60}分`:`${mm}分`}（${hm}まで）`, hot:true}; }
  if (dd===today) return {txt:`今日${hm}まで（あと${Math.floor(h)}時間）`, hot:true};
  if (dd===tom) return {txt:`明日${hm}まで`, hot:h<24};
  return {txt:`${j.getUTCMonth()+1}/${j.getUTCDate()}(${DOW[j.getUTCDay()]}) ${hm}まで`, hot:false};
}
function status(it){
  const nd = nextDls(it)[0];
  if (nd && PT(nd.until) - new Date() < 7*864e5){
    const L = leftText(nd.until);
    return {k:"ending", label:`${nd.k||"応募"}締切 ${L.txt.replace(/（.*）$/,"")}`, rank:0};
  }
  const rv = rsvState(it);
  if (rv==="before"){
    const n = diffDays(it.sd,TODAY);
    return {k:n<=7?"soon":"upcoming", label:n===0?`今日${it.rs.slice(11,16)}から予約`:n===1?`明日${it.rs.slice(11,16)}から予約`:n<=7?`あと${n}日で予約開始`:"予約開始予定", rank:1};
  }
  if (rv==="open"){
    const n = it.ed ? diffDays(it.ed,TODAY) : 99;
    return {k:n<=7?"ending":"on", label:n===0?`予約は今日${(it.re||"").slice(11,16)}まで`:n===1?"予約は明日まで":`予約受付中`, rank:n<=7?0:2};
  }
  if (rv==="closed") return {k:"ended",label:"予約終了",rank:4};
  if (rv==="soldout") return {k:"ended",label:"完売（予約終了）",rank:4};
  const v = isEvent(it)? "開催":"発売";
  if (it.sd > TODAY){
    const n = diffDays(it.sd,TODAY);
    if (it.sp==="day" && n<=7) return {k:"soon",label:n===1?`明日${v}`:`あと${n}日で${v}`,rank:1};
    return {k:"upcoming",label:`${v}予定`,rank:3};
  }
  if (it.ed && it.ed < TODAY) return {k:"ended",label:"終了",rank:4};
  if (it.ed){
    const n = diffDays(it.ed,TODAY);
    if (n<=7){
      if (/締切|締め切り|受注|抽選|応募/.test(it.eNote||"")) return {k:"ending",label:n===0?"今日が締切":n===1?"明日が締切":`締切まであと${n}日`,rank:0};
      return {k:"ending",label:n===0?"今日まで":n===1?"明日まで":`あと${n}日で終了`,rank:0};
    }
  }
  return {k:"on",label:isEvent(it)?"開催中":"販売中",rank:2};
}
/* その情報で「次に気にする日」 */
function keyOf(it){
  const k = status(it).k;
  if (k==="ending" && it.sd > TODAY && nextDls(it).length) return {d:it.sd, kind:"start"};   // 抽選の締切が近い発売前の商品は、発売日を出す
  if (k==="ending" && !it.ed && nextDls(it).length) return {d:it.sd, kind:"since"};
  if (k==="upcoming"||k==="soon") return {d:it.sd, kind:"start"};
  if ((k==="on"||k==="ending") && it.ed) return {d:it.ed, kind:"end"};
  if (k==="on") return {d:it.sd, kind:"since"};
  return {d:it.ed||it.sd, kind:"ended"};
}
function fmtStart(it){
  const d=it.sd, m=d.getMonth()+1;
  if (it.sp!=="day") return `${m}月${it.sp==="month"?"予定":SP[it.sp]}`;
  return `${m}/${d.getDate()}(${DOW[d.getDay()]})`;
}
function fmtEnd(it){ const d=it.ed; return `${d.getMonth()+1}/${d.getDate()}(${DOW[d.getDay()]})`; }

/* ===== リンク ===== */
/* 楽天ブックス（本・コミック・カレンダー）の商品ページ。必ずアフィリエイトのリンクにする */
function rbList(it){
  const L = Array.isArray(it.rb) ? it.rb : [];
  return L.filter(x => x && /^https:\/\/books\.rakuten\.co\.jp\/rb\/\d+\/?$/.test(x.u||""));
}
/* もしもアフィリエイト（Yahoo!ショッピング）。検索結果へのリンクを作る */
const MOSHIMO = { yahoo: { a_id: "5833703", p_id: "1225", pc_id: "1925", pl_id: "18502" } };
function moshimo(kind, url){ const m = MOSHIMO[kind]; return m ? `https://af.moshimo.com/af/c/click?a_id=${m.a_id}&p_id=${m.p_id}&pc_id=${m.pc_id}&pl_id=${m.pl_id}&url=${encodeURIComponent(url)}` : ""; }
function yahooSearch(q){ if (!/ちいかわ|chiikawa/i.test(q)) q = "ちいかわ "+q; return moshimo("yahoo", "https://shopping.yahoo.co.jp/search?p="+encodeURIComponent(q)); }
function affLink(u){ return `https://hb.afl.rakuten.co.jp/hgc/${AFF.rakutenId}/?pc=${encodeURIComponent(u)}`; }
function rbBtns(it){
  const pre = it.sd > TODAY;
  return rbList(it).map(x => `<a class="btn buy${pre?" pre":""}" href="${esc(affLink(x.u))}" target="_blank" rel="noopener sponsored" data-rb>${pre?"楽天ブックスで予約":"楽天ブックスで見る"}${x.n?`（${esc(x.n)}）`:""} <span class="tag">PR</span></a>`).join("");
}
function rakuten(q){
  if (!/ちいかわ|chiikawa/i.test(q)) q = "ちいかわ "+q;   // 「ちいかわ」が入っていないと、ほかの商品（本物のまんじゅうなど）が出てしまう
  const u = "https://search.rakuten.co.jp/search/mall/"+encodeURIComponent(q)+"/";
  return AFF.rakutenId ? `https://hb.afl.rakuten.co.jp/hgc/${AFF.rakutenId}/?pc=${encodeURIComponent(u)}` : u;
}
/* 楽天トラベルのキーワード検索はShift_JISで受け取るため、地名をShift_JISに変換する */
let SJIS = null;
function sjisEncode(str){
  if (!SJIS){
    SJIS = new Map();
    try{
      const dec = new TextDecoder("shift_jis");
      for (let a=0x81; a<=0xFC; a++){ if (a>0x9F && a<0xE0) continue;
        for (let b=0x40; b<=0xFC; b++){ if (b===0x7F) continue;
          const ch = dec.decode(new Uint8Array([a,b]));
          if (ch.length===1 && ch.charCodeAt(0)!==0xFFFD && !SJIS.has(ch)) SJIS.set(ch, "%"+a.toString(16).toUpperCase()+"%"+b.toString(16).toUpperCase());
        } }
    }catch(e){}
  }
  let out = "";
  for (const ch of str){
    if (/[A-Za-z0-9\-_.]/.test(ch)) out += ch;
    else if (ch===" ") out += "+";
    else if (SJIS.has(ch)) out += SJIS.get(ch);
    else if (ch.charCodeAt(0)<128) out += "%"+ch.charCodeAt(0).toString(16).toUpperCase().padStart(2,"0");
  }
  return out;
}
// 海外は楽天トラベルの「海外ホテル」一覧へ（キーワード検索は国内のホテルしか出ないため）
const OS_HOTEL = [
  [/台北/, "03kaigaiTaiwanTaipei", "台北"], [/台中/, "03kaigaiTaiwanTaizhong", "台中"], [/高雄/, "03kaigaiTaiwanKaohsiung", "高雄"], [/台南/, "03kaigaiTaiwantainam", "台南"],
  [/ソウル/, "03kaigaiKoreaseoul", "ソウル"], [/釜山|プサン/, "03kaigaiKoreabusan", "釜山"],
  [/香港/, "02kaigaiHongkong", "香港"], [/マカオ/, "03kaigaiMakaumakau", "マカオ"],
  [/上海/, "03kaigaiChinashanghai", "上海"], [/北京/, "03kaigaiChinabeijing", "北京"], [/深セン|深圳|広東|広州|珠海/, "03kaigaiChinaguangdong", "広東省（深セン・広州）"],
  [/バンコク/, "03kaigaiThailandBangkok", "バンコク"], [/クアラルンプール/, "03kaigaiMalaysiaKUL", "クアラルンプール"], [/ロサンゼルス/, "03kaigaiU.S.A.LAX", "ロサンゼルス"], [/ニューヨーク/, "03kaigaiU.S.A.NYC", "ニューヨーク"],
];
const OS_COUNTRY = { tw: ["02kaigaiTaiwan", "台湾"], kr: ["02kaigaiKorea", "韓国"], hk: ["02kaigaiHongkong", "香港"], cn: ["02kaigaiChina", "中国"], th: ["02kaigaiThailand", "タイ"], sg: ["02kaigaiSingapore", "シンガポール"], my: ["03kaigaiMalaysiaKUL", "クアラルンプール"], us: ["02kaigaiU.S.A.", "アメリカ"] };
function hotelLink(it){
  const r = it.region || "jp";
  if (r === "jp") return { url: "https://kw.travel.rakuten.co.jp/keyword/Search.do?f_query=" + sjisEncode(it.area), label: it.area + "周辺のホテルを探す" };
  const hay = (it.area || "") + " " + (it.place || "");
  const hit = OS_HOTEL.find(x => x[0].test(hay)) || (OS_COUNTRY[r] && [null, ...OS_COUNTRY[r]]);
  if (!hit) return null;
  return { url: "https://travel.rakuten.co.jp/group/tiku/" + hit[1] + ".html", label: hit[2] + "のホテルを探す" };
}
function travel(it){
  const h = hotelLink(it); if (!h) return null;
  return { label: h.label, url: AFF.rakutenId ? `https://hb.afl.rakuten.co.jp/hgc/${AFF.rakutenId}/?pc=${encodeURIComponent(h.url)}` : h.url };
}
function gcal(it){
  if (it.sp!=="day") return null;
  const f = d=>ymd(d).replace(/-/g,"");
  const end = new Date((it.ed||it.sd).getTime()+DAYMS);
  const p = new URLSearchParams({action:"TEMPLATE",text:"ちいかわ："+it.t,dates:`${f(it.sd)}/${f(end)}`,details:`${it.place||""}\n${it.src||""}`});
  return "https://calendar.google.com/calendar/render?"+p.toString();
}

/* ===== マイリスト（この端末に保存） ===== */
let mine = {};
try { mine = JSON.parse(localStorage.getItem("chiikatsu-mine")||"{}")||{}; } catch(e){ mine = {}; }
function saveMine(){ try{ localStorage.setItem("chiikatsu-mine",JSON.stringify(mine)); }catch(e){} if (window.pushSync) window.pushSync(); }

/* ===== カード ===== */
function fmtDT(s){ const d = PT(s); if (!d) return ""; const j = new Date(d.getTime()+9*3600e3); return `${j.getUTCMonth()+1}/${j.getUTCDate()}(${DOW[j.getUTCDay()]}) ${s.length>10?s.slice(11,16):""}`.trim(); }
function card(it, opt){
  const st = status(it);
  const k = keyOf(it);
  const d = k.d;
  const KD = {start: isEvent(it)?"開始":"発売", end:"まで", since:"から", ended:"終了"};
  const fuzzyLbl = {early:"上旬",mid:"中旬",late:"下旬",month:"ごろ"};
  const stamp = (k.kind==="start" && it.sp!=="day")
    ? `<span class="m num">${d.getMonth()+1}月</span><span class="fz">${fuzzyLbl[it.sp]}</span><span class="kd start">${KD.start}予定</span>`
    : `<span class="m num">${d.getMonth()+1}月</span><span class="d num">${d.getDate()}</span><span class="w">${DOW[d.getDay()]}曜</span><span class="kd ${k.kind}">${KD[k.kind]}</span>`;
  const v = isRsv(it) ? "予約受付" : isEvent(it)?"開始":"発売";
  let period = `<span>${v} <b class="num">${fmtStart(it)}</b>${it.time?` <span class="num">${esc(it.time)}</span>`:""}</span>`;
  if (it.ed) period += `<span>${isRsv(it)?"締切":"終了"} <b class="num">${fmtEnd(it)}</b>${isRsv(it)&&it.re&&it.re.length>10?` <span class="num">${it.re.slice(11,16)}</span>`:""}</span>`;
  const en = isRsv(it) ? (it.eNote||"").replace(/^受注締切[^・（]*[・]?/, "") : it.eNote;
  if (en) period += `<span>${esc(en)}</span>`;
  else if (!it.ed && !isEvent(it)) period += `<span>なくなり次第終了</span>`;
  const dls = nextDls(it).slice(0,2);
  const dlh = dls.length ? `<div class="dlbs">${dls.map(x=>{ const L = leftText(x.until); const u = safeUrl(x.u); return `<div class="dlb${L.hot?" hot":""}"><span class="dlk">⏰ ${esc(x.k||"応募")}締切</span><span class="num">${esc(L.txt)}</span>${x.n?`<small>${esc(x.n)}</small>`:""}${u?`<a href="${esc(u)}" target="_blank" rel="noopener" data-dl>応募・くわしく →</a>`:""}</div>`; }).join("")}</div>` : "";
  const g = gcal(it), src = safeUrl(it.src);
  const m = mine[it.id]||"";
  return `<article class="card ${st.k==="ended"?"ended":""} ${m==="want"?"wanted":""}" data-id="${esc(it.id)}">
    <div class="stamp" aria-hidden="true">${stamp}</div>
    <div class="body">
      <div class="meta"><span class="pill st-${st.k}">${st.label}</span>${regionOf(it)!=="jp"?`<span class="pill rg">${REG[regionOf(it)]}</span>`:""}<span class="cat">${CAT[it.cat]||""}</span></div>
      <h3><a href="/items/${encodeURIComponent(it.id)}/">${esc(it.t)}</a></h3>
      <div class="period">${period}</div>
      ${dlh}
      <dl class="info">
        ${it.place?`<dt>場所</dt><dd>${esc(it.place)}</dd>`:""}
        ${it.price?`<dt>価格</dt><dd class="num">${esc(it.price)}${regionOf(it)==="jp"?"（税込）":""}</dd>`:""}
        ${it.note?`<dt>メモ</dt><dd>${esc(it.note)}</dd>`:""}
      </dl>
      ${(()=>{ const rv = rsvState(it), L = rsvList(it); if (!L.length || rv==="closed") return "";
        if (rv==="soldout") return `<div class="rsvbox closed"><div class="rsvh">すべて完売しました</div></div>`;
        const head = rv==="open" ? `予約受付中${it.re?`<small>締切 ${esc(fmtDT(it.re))}</small>`:""}` : `予約開始 ${esc(fmtDT(it.rs))}`;
        return `<div class="rsvbox ${rv}"><div class="rsvh">${head}</div><div class="rsvbtns">${L.slice().sort((p,q)=>(p.so?1:0)-(q.so?1:0)).map(x=>x.so ? `<span class="btn rsvbtn so">${x.n?esc(x.n)+" ":""}完売</span>` : `<a class="btn rsvbtn" href="${esc(x.u)}" target="_blank" rel="noopener" data-rsv>${rv==="open"?"予約はこちら":"予約ページ"}${x.n?`（${esc(x.n)}）`:""}</a>`).join("")}</div></div>`; })()}
      <div class="acts main">
        ${st.k!=="ended"?`<button class="btn want" data-mark="want" aria-pressed="${m==="want"}">${m==="want"?"♥ ほしい":"♡ ほしい"}</button>`:""}
        ${rbList(it).length ? rbBtns(it) : it.q?`<span class="rk" data-rk="${esc(it.id)}"></span>`:""}
      </div>
      <div class="acts sub">
        ${src?`<a class="lnk" href="${esc(src)}" target="_blank" rel="noopener">公式情報</a>`:""}
        ${g&&st.k!=="ended"?`<a class="lnk" href="${g}" target="_blank" rel="noopener">カレンダーに追加</a>`:""}
        ${it.q&&st.k!=="ended"?`<a class="lnk yh" href="${esc(yahooSearch(it.q))}" target="_blank" rel="noopener sponsored" data-yh>Yahoo!で探す<span class="tag">PR</span></a>`:""}
        <button class="lnk got" data-mark="got" aria-pressed="${m==="got"}">${m==="got"?"✓ ゲット済み":"ゲットした"}</button>
      </div>
      ${(()=>{ const tr = it.area && st.k!=="ended" ? travel(it) : null; return tr ? `<a class="trip" href="${esc(tr.url)}" target="_blank" rel="noopener sponsored"><span class="trip-k">遠征するなら</span><span class="trip-t">${esc(tr.label)}</span><span class="tag">楽天トラベル・PR</span></a>` : ""; })()}
    </div>
    ${it.q?`<div class="pimg" data-pimg="${esc(it.id)}"></div>`:""}
  </article>`;
}
// 広告枠：AdSense が決まるまでは何も出さない（決まったらここに広告のタグを入れる）
const AD = "";
function placeholder(){
  if (loadFailed) return `<div class="empty">データを読み込めませんでした。ページを開き直してください。</div>`;
  return `<div class="empty">読み込み中です…</div>`;
}

/* ===== 一覧 ===== */
const state = { st:"next", cat:"all", q:"", focus:null, fromSum:false };
const ST = [["next","これからの予定"],["ending","まもなく締切・終了"],["sellout","なくなり次第終了"],["rsv","予約・受注"],["onsale","販売中"],["ended","終了"]];
// 「なくなり次第終了」：在庫がなくなると買えなくなるもの（くじも含む）。終わったものは除く
const SELLOUT_RE = /なくなり次第|数量限定|在庫限り|在庫がなくなり|売り切れ次第|品切れ次第|完売次第/;
function isSellout(it){ return status(it).k!=="ended" && !isEvent(it) && (SELLOUT_RE.test((it.eNote||"")+" "+(it.note||"")) || it.cat==="kuji"); }
function chips(el,list,key){
  el.innerHTML = list.map(([k,l])=>`<button class="chip" data-k="${k}" aria-pressed="${state[key]===k}">${l}</button>`).join("");
  el.onclick = e=>{ const b=e.target.closest(".chip"); if(!b) return; state[key]=b.dataset.k; if(key==="st"){ state.focus=null; state.fromSum=false; if (window.ct) window.ct("st:"+state.st); } chips(el,list,key); renderList(); };
}
function bucket(it){ const k=status(it).k; return k==="ended"?"ended":(k==="on"&&!it.ed)?"onsale":"next"; }
function sortItems(arr){
  const order = {next:0, onsale:1, ended:2};
  return arr.slice().sort((a,b)=>{
    const ba=bucket(a), bb=bucket(b);
    if (ba!==bb) return order[ba]-order[bb];
    const ka=keyOf(a), kb=keyOf(b);
    if (ba==="next"){
      if (+ka.d!==+kb.d) return ka.d-kb.d;
      return (ka.kind==="end"?0:1)-(kb.kind==="end"?0:1);  // 同じ日なら「まで」を先に
    }
    return kb.d-ka.d;  // 販売中・終了は新しい順
  });
}
function withAds(html){ return html.map((h,i)=> (i===4||i===14)? h+AD : h).join(""); }
function weekLabel(d){
  const n = diffDays(d, TODAY);
  if (n<=0) return "今日";
  if (n===1) return "明日";
  const dow = (TODAY.getDay()+6)%7;           // 月曜=0
  const left = 6-dow;                          // 今週の日曜までの日数
  if (n<=left) return "今週";
  if (n<=left+7) return "来週";
  if (d.getFullYear()===TODAY.getFullYear() && d.getMonth()===TODAY.getMonth()) return "今月";
  return `${d.getFullYear()!==TODAY.getFullYear()?d.getFullYear()+"年":""}${d.getMonth()+1}月`;
}
// 上の「7日以内に〜」から来たとき、いちばん下に一覧へ戻るボタンを出す
function backAll(){
  if (!(state.focus || state.fromSum)) return "";
  return `<button class="btn backall" type="button" data-backall>← すべての予定の一覧に戻る</button>`;
}
function goAll(){
  state.st="next"; state.focus=null; state.fromSum=false; state.cat="all";
  chips(document.getElementById("stChips"),ST,"st"); chips(document.getElementById("catChips"),[["all","すべての種類"],...Object.entries(CAT)],"cat");
  renderList();
  const t = document.getElementById("view-list"); if (t) t.scrollIntoView({behavior:"smooth", block:"start"});
}
document.addEventListener("click", e=>{ if (e.target.closest("[data-backall]")) goAll(); });
document.addEventListener("click", e=>{
  if (!e.target.closest("[data-gorsv]")) return;
  state.st="rsv"; state.focus=null; state.fromSum=true; state.cat="all";
  chips(document.getElementById("stChips"),ST,"st"); renderList();
  document.getElementById("view-list").scrollIntoView({behavior:"smooth", block:"start"});
});
// 検索の表記ゆれをそろえる（全角/半角・カタカナ/ひらがな・大文字/小文字・空白、よくある言いかえ）
const SYN = [[/ぽっぷあっぷすとあ|ぽっぷあっぷ|popupstore|popup/g,"popup"],[/こらぼかふぇ|collaborationcafe|collabocafe/g,"こらぼかふぇ"],[/ぬいぐるみ|ぬい/g,"ぬい"],[/ますこっと/g,"ますこっと"],[/ちいかわべーかりー/g,"ちいかわべーかりー"]];
function sn(t){
  let x = String(t||"").normalize("NFKC").toLowerCase().replace(/[\u30a1-\u30f6]/g, c=>String.fromCharCode(c.charCodeAt(0)-0x60)).replace(/[\s・･\-ー＿_、。,.!！?？「」『』（）()]/g, m=> m==="ー" ? "ー" : "");
  SYN.forEach(([re,to])=>{ x = x.replace(re,to); });
  return x;
}
function renderList(){
  try{ renderListInner(); }catch(err){
    console.error(err);
    document.getElementById("list").innerHTML = `<div class="empty">一覧を表示できませんでした。ページを開き直してください。</div>`;
  }
}
function renderListInner(){
  const el = document.getElementById("list");
  const fb = document.getElementById("focusBar");
  if (!loaded){ el.innerHTML = placeholder(); document.getElementById("count").textContent=""; fb.hidden=true; return; }
  const q = sn(state.q.trim());
  let arr = VIS().filter(it=>{
    if (state.st==="ending" ? status(it).k!=="ending" : state.st==="sellout" ? !isSellout(it) : state.st==="rsv" ? !(isRsv(it) && (rsvState(it)==="open" || rsvState(it)==="before")) : bucket(it)!==state.st) return false;
    if (state.focus && status(it).k!==state.focus) return false;
    if (state.cat!=="all" && it.cat!==state.cat) return false;
    if (q && !sn(it.t+(it.place||"")+(it.note||"")+(CAT[it.cat]||"")+(it.eNote||"")+(REG[it.region]||"")).includes(q)) return false;
    return true;
  });
  if (state.st==="rsv"){
    // 受付中（締切が近い順）→ これから受付開始（近い順）
    const open = arr.filter(it=>rsvState(it)==="open").sort((a,b)=>(PT(a.re)||8e15)-(PT(b.re)||8e15));
    const before = arr.filter(it=>rsvState(it)==="before").sort((a,b)=>PT(a.rs)-PT(b.rs));
    arr = open.concat(before);
  } else if (state.st==="sellout"){
    // いま買えるもの（新しく出た順）→ これから出るもの（近い順）
    const now = arr.filter(it=>it.sd<=TODAY).sort((a,b)=>b.sd-a.sd);
    const later = arr.filter(it=>it.sd>TODAY).sort((a,b)=>a.sd-b.sd);
    arr = now.concat(later);
  } else arr = sortItems(arr);
  // 絞り込み中の表示
  fb.hidden = !(state.focus || state.fromSum);
  if (!fb.hidden) document.getElementById("focusTxt").textContent = state.focus==="soon" ? "7日以内に発売・開始するものだけ表示中" : "7日以内に締切・終了するものだけ表示中";
  const desc = {rsv:"公式通販などの予約・受注です。受付中のもの（締切が近い順）、これから受付が始まるものの順。", sellout:"在庫がなくなると終わるグッズ・くじです。いま買えるもの、これから出るものの順。", ending:"1週間以内に締切・終了するものです（抽選・受注の締切を含む）。近い順。", next:"日付が近い順（開催中のものは終わる日の順）", onsale:"終わりの日が決まっていない商品や常設店です。新しく出た順。", ended:"最近終わった順です。"}[state.st];
  document.getElementById("count").textContent = `${arr.length}件　${desc}`;
  if (!arr.length){
    const msg = R.region==="os"&&!VIS().length ? "この国・地域の情報はまだありません。"
      : (q||state.cat!=="all"||state.focus) ? "条件に合う情報が見つかりませんでした。キーワードや種類の絞り込みを変えてみてください。"
      : state.st==="next" ? "これからの予定はまだありません。" : state.st==="ending" ? "1週間以内に締切・終了するものはありません。" : state.st==="sellout" ? "いま「なくなり次第終了」のものはありません。" : state.st==="rsv" ? "いま受付中・受付予定の予約はありません。" : "まだありません。";
    el.innerHTML = `<div class="empty">${msg}</div>` + backAll();
    return;
  }
  let h = "", cur = "", groups = 0, campDone = false;
  const campHere = ()=>{ if (!campDone && R.region==="jp"){ campDone = true; h += `<div data-camp hidden></div>`; } };
  arr.forEach((it,i)=>{
    if (state.st==="rsv"){
      const w = rsvState(it)==="open" ? "いま予約できる" : "これから予約開始";
      if (w!==cur){ cur = w; h += `<h3 class="wk">${w}</h3>`; }
    } else if (state.st==="sellout"){
      const w = it.sd<=TODAY ? "いま買える" : "これから発売";
      if (w!==cur){ cur = w; h += `<h3 class="wk">${w}</h3>`; }
    } else if (state.st==="next"||state.st==="ending"){
      const w = weekLabel(keyOf(it).d);
      if (w!==cur){ cur = w; groups++; if (groups===2) campHere();   // 楽天セールの帯は最初の週のまとまりのあと
        h += `<h3 class="wk${w==="今日"?" is-today":""}">${w}</h3>`; }
    }
    h += card(it);
    if (i===4 || i===14) h += AD;
    if (i===5 && R.region==="jp") h += `<div class="popstrip" data-pop></div>`;   // 楽天の人気グッズは6件目のあと
    if (i===2 && groups<2 && arr.length<=6) campHere();
  });
  if (!campDone && arr.length) campHere();
  const ro = state.st!=="rsv" ? VIS().filter(x=>rsvState(x)==="open").length : 0;
  const rb = VIS().filter(x=>rsvState(x)==="before").length;
  const near = VIS().filter(x=>rsvState(x)==="open" && x.re).sort((a,b)=>PT(a.re)-PT(b.re))[0];
  const nextS = VIS().filter(x=>rsvState(x)==="before").sort((a,b)=>PT(a.rs)-PT(b.rs))[0];
  const sub = near ? `${esc(fmtDT(near.re))}締切：${esc(near.t.replace(/（予約）$/,""))}` : nextS ? `${esc(fmtDT(nextS.rs))}開始：${esc(nextS.t.replace(/（予約）$/,""))}` : "";
  // 72時間以内の締切（抽選・受注などの dl と、予約の締切）を近い順に
  const dlNear = [];
  for (const x of VIS()){
    for (const d of nextDls(x)) if (PT(d.until) - new Date() < 72*3600e3) dlNear.push({it:x, k:d.k||"応募", until:d.until});
    if (rsvState(x)==="open" && x.re && x.re.length>10 && PT(x.re) - new Date() < 72*3600e3) dlNear.push({it:x, k:"予約", until:x.re});
  }
  dlNear.sort((a,b)=>PT(a.until)-PT(b.until));
  const dlStrip = dlNear.length && state.st==="next" && !state.focus ? `<div class="dlstrip"><div class="dlsh"><b>⏰ 締切が近いもの</b><span>72時間以内</span></div>${dlNear.slice(0,4).map(d=>{ const L = leftText(d.until); return `<a class="dlrow${L.hot?" hot":""}" href="/items/${encodeURIComponent(d.it.id)}/"><span class="dlk">${esc(d.k)}</span><span class="dlt">${esc(d.it.t.replace(/（予約）$/,""))}</span><span class="dll num">${esc(L.txt)}</span></a>`; }).join("")}${(ro||rb)?`<button type="button" class="dlmore" data-gorsv>予約・受注の一覧を見る（${ro?`受付中${ro}件`:""}${ro&&rb?"・":""}${rb?`開始予定${rb}件`:""}）→</button>`:""}</div>` : "";
  const strip = dlStrip ? dlStrip : (ro||rb) && state.st==="next" && !state.focus ? `<button type="button" class="rsvstrip" data-gorsv><span class="rs-ic" aria-hidden="true">🛒</span><span class="rs-tx"><b>${ro?`いま予約受付中 ${ro}件`:""}${ro&&rb?"・":""}${rb?`予約開始予定 ${rb}件`:""}</b>${sub?`<small>${sub}</small>`:""}</span><span class="rs-go">見る →</span></button>` : "";
  el.innerHTML = strip + h + backAll();
  setTimeout(()=>{ fillPop(); fillCamp(); }, 0);   // 下で定義する部品が読み込まれてから
}
function renderMine(){
  const el = document.getElementById("mineList");
  if (!loaded){ el.innerHTML = placeholder(); return; }
  const want = sortItems(ITEMS.filter(it=>mine[it.id]==="want"));
  const got = sortItems(ITEMS.filter(it=>mine[it.id]==="got"));
  let h = "";
  if (!want.length && !got.length && !FAV.length) h = `<div class="empty">「♡ ほしい」を押した商品やイベントがここに集まります。<br>発売日や終了日が近い順に並ぶので、買い逃し防止に使えます。</div>`;
  if (want.length) h += `<h3 class="dayhead">ほしいもの（${want.length}）</h3>`+want.map(card).join("");
  if (got.length) h += `<h3 class="dayhead">ゲット済み（${got.length}）</h3>`+got.map(card).join("");
  if (FAV.length) h += `<h3 class="dayhead">気になる商品（${FAV.length}）</h3><p class="favnote">「おすすめ」で♡を押した楽天の商品です。値段は開いたときに楽天から読み直しています。</p><div class="pgrid" id="favGrid">${favCards()}</div>`;
  else h += `<p class="favnote">「おすすめ」タブの商品の♡を押すと、ここに「気になる商品」として保存されます。</p>`;
  el.innerHTML = h;
  if (FAV.length) setTimeout(refreshFav, 0);
}
function renderSummary(){
  const c = k=>VIS().filter(it=>status(it).k===k).length;
  document.getElementById("nSoon").innerHTML = c("soon")+"<small>件</small>";
  document.getElementById("nEnding").innerHTML = c("ending")+"<small>件</small>";
  const ids = new Set(ITEMS.map(i=>i.id));
  const w = Object.entries(mine).filter(([id,v])=>v==="want" && (!loaded || ids.has(id))).length;
  document.getElementById("nWant").innerHTML = w+"<small>件</small>";
  const tc = document.getElementById("tabCnt"); tc.textContent = w; tc.hidden = !w;
  const last = ITEMS.map(i=>i.updatedAt||"").sort().pop();
  document.getElementById("lastUpd").textContent = last ? `掲載情報の最終更新日：${last.replace(/^(\d+)-0?(\d+)-0?(\d+).*/,"$1年$2月$3日")}。` : "";
}

/* ===== カレンダー ===== */
let calM = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
let selDay = new Date(TODAY);
function renderCal(){
  const y=calM.getFullYear(), m=calM.getMonth();
  document.getElementById("calTitle").textContent = `${y}年${m+1}月`;
  const first = new Date(y,m,1).getDay(), days = new Date(y,m+1,0).getDate();
  let h = DOW.map(d=>`<div class="dow">${d}</div>`).join("");
  for (let i=0;i<first;i++) h += `<div class="day out" aria-hidden="true"></div>`;
  for (let d=1; d<=days; d++){
    const dt = new Date(y,m,d);
    const s = VIS().filter(it=>it.sp==="day" && +it.sd===+dt).length;
    const e = VIS().filter(it=>it.ed && +it.ed===+dt).length;
    const marks = "<i class='mk s'></i>".repeat(Math.min(s,4)) + "<i class='mk e'></i>".repeat(Math.min(e,4));
    const cls = ["day", +dt===+TODAY?"today":"", +dt===+selDay?"sel":""].join(" ");
    h += `<button class="${cls}" data-d="${d}" aria-label="${m+1}月${d}日 開始${s}件 終了${e}件"><span class="n num">${d}</span><span class="marks">${marks}</span></button>`;
  }
  document.getElementById("cal").innerHTML = h;
  renderDay();
}
function renderDay(){
  const from = selDay;
  const y = calM.getFullYear(), m = calM.getMonth();
  const monthEnd = new Date(y, m+1, 0);
  const isFirst = from.getDate()===1;
  document.getElementById("dayTitle").textContent = isFirst
    ? `${m+1}月のスケジュール`
    : `${m+1}月${from.getDate()}日(${DOW[from.getDay()]})からのスケジュール`;
  if (!loaded){ document.getElementById("dayList").innerHTML = placeholder(); return; }
  const inRange = d => d && d>=from && d<=monthEnd;
  // 日付ごとの予定（はじまる・おわる）
  const ev = [];
  VIS().forEach(it=>{
    if (it.sp==="day" && inRange(it.sd)) ev.push({d:it.sd, kind:"start", it});
    if (it.ed && inRange(it.ed) && !(it.sp==="day" && +it.ed===+it.sd)) ev.push({d:it.ed, kind:"end", it});
  });
  ev.sort((a,b)=>a.d-b.d || (a.kind==="start"?-1:1));
  let h = "", cur = null;
  ev.forEach(x=>{
    if (!cur || +cur!==+x.d){
      cur = x.d;
      h += `<h4 class="agdate num${+x.d===+TODAY?" is-today":""}">${x.d.getMonth()+1}/${x.d.getDate()}(${DOW[x.d.getDay()]})${+x.d===+TODAY?" 今日":""}</h4>`;
    }
    const v = isEvent(x.it) ? "開始" : "発売";
    h += `<div class="agtag ${x.kind}">${x.kind==="start"?`この日に${v}`:"この日が最終日"}</div>` + card(x.it);
  });
  // 日付がはっきりしないもの（上旬・中旬・下旬・月のみ）
  const fuzzy = sortItems(VIS().filter(it=>it.sp!=="day" && it.sd.getFullYear()===y && it.sd.getMonth()===m));
  if (fuzzy.length) h += `<h4 class="agdate">日付がまだ決まっていないもの</h4>` + fuzzy.map(card).join("");
  // 期間中ずっと開催・販売しているもの
  const ongoing = sortItems(VIS().filter(it=>it.ed && it.sd<from && it.ed>monthEnd));
  if (ongoing.length) h += `<h4 class="agdate">${m+1}月中ずっと開催・販売しているもの</h4>` + ongoing.map(card).join("");
  document.getElementById("dayList").innerHTML = h || `<div class="empty">${isFirst?`${m+1}月`:"この日以降"}に始まる・終わる情報はまだありません。</div>`;
}
function goMonth(delta){
  calM = new Date(calM.getFullYear(), calM.getMonth()+delta, 1);
  const thisMonth = calM.getFullYear()===TODAY.getFullYear() && calM.getMonth()===TODAY.getMonth();
  selDay = thisMonth ? new Date(TODAY) : new Date(calM);
  renderCal();
}
document.getElementById("cal").onclick = e=>{
  const b=e.target.closest(".day[data-d]"); if(!b) return;
  selDay = new Date(calM.getFullYear(), calM.getMonth(), +b.dataset.d); renderCal();
};
document.getElementById("prev").onclick = ()=>goMonth(-1);
document.getElementById("next").onclick = ()=>goMonth(1);

/* ===== まちがい報告 ===== */
const RKIND = {date:"日付がちがう",place:"場所がちがう",price:"価格がちがう",cancel:"中止・延期になった",other:"その他"};
function toast(msg){
  const t=document.getElementById("toast"); t.textContent=msg; t.hidden=false;
  clearTimeout(toast._t); toast._t=setTimeout(()=>{t.hidden=true},2800);
}
/* 読者からの報告フォーム */
document.addEventListener("click", async e=>{
  const open = e.target.closest("[data-report]");
  if (open){
    const c = open.closest(".card");
    let f = c.querySelector(".rep");
    if (f){ f.remove(); return; }
    const id = c.dataset.id;
    c.querySelector(".body").insertAdjacentHTML("beforeend", `<form class="rep">
      <p class="rep-h">どこがまちがっていましたか？</p>
      <div class="rep-k">${Object.entries(RKIND).map(([k,l],i)=>`<label><input type="radio" name="rk-${esc(id)}" value="${k}" ${i===0?"checked":""}> ${l}</label>`).join("")}</div>
      <textarea id="rt-${esc(id)}" maxlength="400" placeholder="正しい情報や、わかった場所（公式のお知らせのURLなど）があれば書いてください"></textarea>
      <div class="acts"><button class="btn ok" type="submit">報告する</button><button class="btn no" type="button" data-cancel>やめる</button></div>
    </form>`);
    return;
  }
  if (e.target.closest("[data-cancel]")) e.target.closest(".rep").remove();
});
document.addEventListener("submit", async e=>{
  const f = e.target.closest(".rep"); if(!f) return;
  e.preventDefault();
  const c = f.closest(".card"), id = c.dataset.id;
  const it = ITEMS.find(i=>i.id===id);
  f.querySelectorAll("button").forEach(x=>x.disabled=true);
  try{
    const r = await fetch("/api/report", {method:"POST", headers:{"content-type":"application/json"},
      body: JSON.stringify({itemId:id, title: it?it.t:"", kind:(f.querySelector("input[type=radio]:checked")||{}).value||"other", text:f.querySelector("textarea").value.trim().slice(0,400)})});
    if (!r.ok) throw new Error(r.status);
    f.remove();
    toast("報告ありがとうございます。確認して直します");
  }catch(err){
    f.querySelectorAll("button").forEach(x=>x.disabled=false);
    toast("送れませんでした。時間をおいてもう一度お試しください");
  }
});

/* サイトへのご意見・ご要望 */
document.addEventListener("submit", async e=>{
  const f = e.target.closest(".sitefb"); if(!f) return;
  e.preventDefault();
  const text = f.querySelector("textarea").value.trim();
  if (text.length < 4){ toast("ご意見を書いてから送ってください"); return; }
  const btn = f.querySelector("button"); btn.disabled = true;
  try{
    const r = await fetch("/api/report", {method:"POST", headers:{"content-type":"application/json"},
      body: JSON.stringify({itemId:"site", title:"サイトへのご意見", kind:"site", text:text.slice(0,600), page:location.pathname})});
    if (!r.ok) throw new Error(r.status);
    f.reset(); f.closest("details").open = false;
    toast("ありがとうございます。いただいたご意見を確認します");
  }catch(err){ toast("送れませんでした。時間をおいてもう一度お試しください"); }
  btn.disabled = false;
});

/* ===== タブ ===== */
const VIEWS = ["list","cal","mine","shop","news"];
function setView(v){
  VIEWS.forEach(k=>{
    document.getElementById("view-"+k).hidden = k!==v;
    document.querySelector(`[data-view="${k}"]`).setAttribute("aria-selected", k===v);
  });
  if (v==="cal"){ renderCal(); setTimeout(fillSeason, 0); }
  if (v==="mine") renderMine();
  if (v==="shop") renderShop();
  if (v==="news") renderNews();
  if (window.ct) window.ct("tab:"+v);
  try{ localStorage.setItem("chiikatsu-view",v); }catch(e){}
}
function currentView(){ return VIEWS.find(k=>!document.getElementById("view-"+k).hidden); }
function renderAll(){
  renderSummary();
  const v = currentView();
  if (v==="list") renderList(); else if (v==="cal") renderCal(); else if (v==="mine") renderMine();
}
document.querySelector(".tabs").onclick = e=>{ const b=e.target.closest("[data-view]"); if(b) setView(b.dataset.view); };
document.querySelector(".sum").onclick = e=>{
  const b=e.target.closest("[data-jump]"); if(!b) return;
  const j=b.dataset.jump;
  if (j==="mine"){ setView("mine"); requestAnimationFrame(()=>document.getElementById("view-mine").scrollIntoView({behavior:"smooth", block:"start"})); return; }
  state.st = j==="ending" ? "ending" : "next"; state.focus = j==="ending" ? null : j; state.fromSum = true; state.cat="all"; chips(document.getElementById("stChips"),ST,"st"); chips(document.getElementById("catChips"),[["all","すべての種類"],...Object.entries(CAT)],"cat"); setView("list"); renderList();
  // 押した内容が見えるように、一覧のところまで動かす
  requestAnimationFrame(()=>{ const t = document.getElementById("focusBar"); (t && !t.hidden ? t : document.getElementById("list")).scrollIntoView({behavior:"smooth", block:"start"}); });
};
document.addEventListener("click", e=>{
  const b = e.target.closest("[data-mark]"); if(!b) return;
  const id = b.closest(".card").dataset.id, k=b.dataset.mark;
  if (mine[id]===k) delete mine[id]; else { mine[id]=k; if (window.ct) window.ct("mark:"+k); }
  saveMine(); renderAll();
});
document.getElementById("q").addEventListener("input", e=>{ state.q=e.target.value; renderList(); });
document.getElementById("focusClear").onclick = goAll;
document.getElementById("today").textContent = `今日 ${TODAY.getMonth()+1}/${TODAY.getDate()}(${DOW[TODAY.getDay()]})`;

chips(document.getElementById("stChips"),ST,"st");
chips(document.getElementById("catChips"),[["all","すべての種類"],...Object.entries(CAT)],"cat");
let v0="list"; try{ v0 = localStorage.getItem("chiikatsu-view")||"list"; }catch(e){}
setView(["list","cal","mine"].includes(v0)?v0:"list");
renderSummary();


/* 日本／海外の切り替え */
function renderRegion(){
  document.querySelectorAll("#regionSw button").forEach(b=>b.setAttribute("aria-pressed", b.dataset.r===R.region));
  const cc = document.getElementById("countryChips");
  cc.hidden = R.region!=="os";
  const present = new Set(ITEMS.map(regionOf));
  // 情報が1件もない国・地域は出さない（見つかったら自動で出てくる）
  cc.innerHTML = [["all","すべての国・地域"],...Object.entries(REG).filter(([k])=>k!=="jp" && (!loaded || present.has(k)))]
    .map(([k,l])=>`<button class="chip" data-c="${k}" aria-pressed="${R.country===k}">${l}</button>`).join("");
  document.getElementById("osNote").hidden = R.region!=="os";
}
function setRegion(patch){
  Object.assign(R, patch);
  try{ localStorage.setItem("chiikatsu-region", JSON.stringify(R)); }catch(e){}
  renderRegion(); renderAll();
}
// 日本／海外を切り替えた人は、その地域の予定を見たいので、カレンダー以外の画面なら「一覧」に戻す
function regionToList(){ const v = currentView(); if (v!=="list" && v!=="cal") setView("list"); }
document.getElementById("regionSw").onclick = e=>{ const b=e.target.closest("[data-r]"); if(b){ setRegion({region:b.dataset.r, country:"all"}); regionToList(); } };
document.getElementById("countryChips").onclick = e=>{ const b=e.target.closest("[data-c]"); if(b && !b.disabled){ setRegion({country:b.dataset.c}); regionToList(); } };
renderRegion();

/* ===== データ読み込み（ビルド時にページへ埋め込み） ===== */
ITEMS = (window.__ITEMS||[]).filter(x=>!x.hidden).map(x=>prep(x.id, x));
loaded = true;
document.body.classList.add("can-report");
renderRegion(); renderAll();

/* ===== 楽天の商品情報（画像・価格・楽天で見る・おすすめ） ===== */
const CHARS = /ちいかわ|chiikawa|ハチワレ|ナガノ/i;
const NG = ["中古","USED","ユーズド","美品","未使用品","開封済","プレミア","入手困難","完売品","転売","並行輸入","非公式","互換","ノーブランド","ハンドメイド","レンタル","まとめ買い","ケース販売","業務用","大量"];
const BULK = /×\s?\d{2,}\s?(個|本|袋|枚)|\d{2,}\s?(個|袋)セット/;
/* 商品の種類を表す言葉。楽天の商品名にあって、掲載中の情報の名前にない種類なら別の商品とみなす */
const KINDS = ["かるた","ぬいぐるみ","キーホルダー","キーリング","Tシャツ","トレーナー","パーカー","ステッカー","缶バッジ","ポーチ","巾着","タオル","ハンカチ","ソックス","靴下","グミ","ガム","チョコ","クッキー","フィギュア","アクリルスタンド","アクスタ","下敷き","クリアファイル","ノート","付箋","ボールペン","マグ","コップ","お弁当箱","ランチボックス","パジャマ","スリッパ","ブランケット","クッション","バッグ","トート","リュック","財布","スマホケース","カレンダー","手帳","絵本","コミック","カード","シール","マスコット","入浴剤","ガチャ","くじ"];
const norm = s => String(s||"").normalize("NFKC").toLowerCase().replace(/\s+/g," ");
const yen = n => "¥"+Number(n).toLocaleString("ja-JP");
const firstPrice = p => { const m = String(p||"").replace(/,/g,"").match(/(\d{2,6})\s*円/); return m ? +m[1] : 0; };
// ほかのキャラクターもたくさん選べる商品（水筒・飾り付けなど）は、ちいかわファン向けではないので出さない
const OTHER_IP = /ディズニー|ミッキー|ミニー|プリンセス|アナと雪|アナ雪|トイ・?ストーリー|サンリオ|キティ|マイメロ|クロミ|シナモ|ポムポム|すみっコ|リラックマ|ポケモン|ピカチュウ|カービィ|マリオ|アンパンマン|ドラえもん|しんちゃん|クレヨンしんちゃん|鬼滅|呪術|スヌーピー|ムーミン|ミッフィー|トミカ|プラレール|戦隊|仮面ライダー|プリキュア|スパイダーマン|マーベル|ちいかわ以外/g;
function okItem(x, refPrice){
  const n = x.name;
  if (!CHARS.test(n)) return false;
  if (new Set(n.match(OTHER_IP)||[]).size >= 2) return false;
  if (NG.some(w=>n.includes(w))) return false;
  if (BULK.test(n)) return false;
  if (refPrice && x.price > refPrice*1.6) return false;
  return true;
}
function normItem(raw){
  const x = raw.Item || raw;
  let img = (x.mediumImageUrls||[])[0];
  if (img && typeof img==="object") img = img.imageUrl;
  if (img) img = img.replace(/\?_ex=\d+x\d+/, "?_ex=300x300");
  return { name:x.itemName||"", price:+x.itemPrice||0, url:(x.affiliateUrl && x.affiliateUrl.includes("hb.afl.rakuten.co.jp")) ? x.affiliateUrl : x.itemUrl ? `https://hb.afl.rakuten.co.jp/hgc/${AFF.rakutenId}/?pc=${encodeURIComponent(x.itemUrl)}` : "", img:img||"",
    shop:x.shopName||"", rc:+x.reviewCount||0, ra:+x.reviewAverage||0, code:x.itemCode||(x.itemUrl?"u:"+x.itemUrl:"") };
}
/* 楽天APIは1秒1回まで。順番待ちで呼び、結果は6時間この端末に覚えておく */
const RK_TTL = 6*3600*1000;
const RK_VER = "4";   // 保存する中身を変えたら上げる（古い覚え書きを使わないように）
let rkChain = Promise.resolve(), rkLast = 0;
function rkSearch(params){
  const qs = new URLSearchParams(Object.assign({applicationId:RAK.app, accessKey:RAK.key, affiliateId:AFF.rakutenId,
    format:"json", formatVersion:"2", availability:"1", imageFlag:"1", NGKeyword:"中古 USED 美品"}, params));
  const ck = "rk"+RK_VER+":"+qs.toString().replace(/accessKey=[^&]+&?/,"");
  try{ const c = JSON.parse(localStorage.getItem(ck)||"null"); if (c && Date.now()-c.t < RK_TTL) return Promise.resolve(c.v); }catch(e){}
  const job = rkChain.then(async ()=>{
    const wait = rkLast + 1100 - Date.now(); if (wait>0) await new Promise(r=>setTimeout(r,wait));
    rkLast = Date.now();
    let r = await fetch(RAK.ep+"?"+qs.toString());
    if (r.status===429 || r.status>=500){ await new Promise(x=>setTimeout(x,2200)); rkLast = Date.now(); r = await fetch(RAK.ep+"?"+qs.toString()); }   // 混んでいたら少し待ってもう一度
    if (!r.ok) throw new Error("rakuten "+r.status);
    const j = await r.json();
    const v = {items:(j.Items||[]).map(normItem), count:j.count||0, pageCount:j.pageCount||1};
    try{ localStorage.setItem(ck, JSON.stringify({t:Date.now(), v})); }catch(e){}
    return v;
  });
  rkChain = job.catch(()=>{});
  return job;
}
/* 掲載中の商品と同じものが楽天に出ているか探す */
const rkFound = {};
async function findOnRakuten(it){
  if (it.id in rkFound) return rkFound[it.id];
  const tokens = norm(it.q).split(" ").filter(t=>t && !/^(ちいかわ|アニメ|映画)$/.test(t));
  const ref = firstPrice(it.price);
  let hit = null;
  /* 「水」のような1文字や「マスコット」のような種類名だけでは同じ商品か判断できないので、探さない */
  const distinct = tokens.filter(t=>t.length>=2 && !KINDS.some(k=>norm(k)===t));
  if (!distinct.length){ rkFound[it.id] = null; return null; }
  try{
    const v = await rkSearch({keyword: it.q, hits:"10"});
    const mine = norm(it.t+" "+it.q);
    hit = v.items.find(x=>{
      const nm = norm(x.name);
      if (!okItem(x, ref) || !tokens.every(t=>nm.includes(t))) return false;
      return !KINDS.some(k=>nm.includes(norm(k)) && !mine.includes(norm(k)));
    }) || null;
  }catch(e){ hit = null; }
  rkFound[it.id] = hit;
  return hit;
}
function paintRakuten(id, hit){
  document.querySelectorAll(`[data-pimg="${CSS.escape(id)}"]`).forEach(el=>{
    if (!hit || !hit.img) return;
    el.innerHTML = `<a href="${esc(hit.url)}" target="_blank" rel="noopener sponsored"><img src="${esc(hit.img)}" alt="${esc(hit.name)}" loading="lazy"></a><small>楽天市場</small>`;
    el.classList.add("on");
  });
  document.querySelectorAll(`[data-rk="${CSS.escape(id)}"]`).forEach(el=>{
    if (!hit) return;
    const it = ITEMS.find(x=>x.id===id);
    const pre = it && it.sd > TODAY;
    el.innerHTML = `<a class="btn buy${pre?" pre":""}" href="${esc(hit.url)}" target="_blank" rel="noopener sponsored"${pre?' data-pre="1"':""}>${pre?"楽天で予約する":"楽天で見る"} ${yen(hit.price)} <span class="tag">PR</span></a>`;
  });
}
const rkObs = "IntersectionObserver" in window ? new IntersectionObserver(ents=>{
  ents.forEach(en=>{
    if (!en.isIntersecting) return;
    rkObs.unobserve(en.target);
    const id = en.target.dataset.id, it = ITEMS.find(i=>i.id===id);
    if (it) findOnRakuten(it).then(h=>paintRakuten(id,h));
  });
}, {rootMargin:"300px"}) : null;
function hookRakuten(){
  document.querySelectorAll("[data-pimg]:not(.hooked)").forEach(el=>{
    el.classList.add("hooked");
    const id = el.dataset.pimg;
    if (id in rkFound){ paintRakuten(id, rkFound[id]); return; }
    const card = el.closest(".card");   // 画像の枠は見つかるまで非表示なので、カード全体を見張る
    if (rkObs && card) rkObs.observe(card);
  });
}
new MutationObserver(()=>hookRakuten()).observe(document.body, {childList:true, subtree:true});
hookRakuten();

/* おすすめタブ */
const SHOPCAT = [["all","すべて",""],["nui","ぬいぐるみ・マスコット","ぬいぐるみ"],["bun","文房具","文房具"],["zakka","雑貨・キッチン","雑貨"],["bag","バッグ・ポーチ","バッグ"],["wear","アパレル","Tシャツ"],["food","お菓子","お菓子"],["book","本・コミック","本"]];
const SH = {cat:"all", kw:"", sort:"standard", page:1, items:[], pageCount:1, busy:false, err:false};
function shopChips(){
  document.getElementById("shopCats").innerHTML = SHOPCAT.map(([k,l])=>`<button class="chip" data-sc="${k}" aria-pressed="${SH.cat===k}">${l}</button>`).join("");
}
/* 気になる商品（楽天）：♡を押した商品をこの端末に保存して、マイリストに並べる */
const FAV_KEY = "chiikatsu-fav";
let FAV = []; try{ FAV = (JSON.parse(localStorage.getItem(FAV_KEY)||"[]")||[]).filter(x=>x && x.c); }catch(e){}
const favHas = c => FAV.some(x=>x.c===c);
function favSave(){ try{ localStorage.setItem(FAV_KEY, JSON.stringify(FAV.slice(0,60))); }catch(e){} }
let PROD_BY_CODE = {};
function prodCard(x, opt){
  if (x.code) PROD_BY_CODE[x.code] = x;
  const stars = x.rc ? `<span class="pr2">★${x.ra.toFixed(1)}（${x.rc}件）</span>` : "";
  const on = x.code && favHas(x.code);
  return `<div class="prodw${opt&&opt.gone?" gone":""}"><a class="prod" href="${esc(x.url)}" target="_blank" rel="noopener sponsored">
    <div class="ph"><img src="${esc(x.img)}" alt="" loading="lazy"></div>
    <div class="pb"><span class="pn">${esc(x.name)}</span>${stars}<span class="pp num">${opt&&opt.gone?"売り切れか、販売が終わったかもしれません":yen(x.price)}</span><span class="ps">${esc(x.shop)}</span><span class="tag">PR・楽天市場</span></div>
  </a>${x.code?`<button type="button" class="fav" data-fav="${esc(x.code)}" aria-pressed="${on}" aria-label="${on?"気になる商品から外す":"気になる商品に保存"}">${on?"♥":"♡"}</button>`:""}</div>`;
}
document.addEventListener("click", e=>{
  const b = e.target.closest("[data-fav]"); if (!b) return;
  e.preventDefault();
  const c = b.dataset.fav;
  if (favHas(c)){ FAV = FAV.filter(x=>x.c!==c); toast("気になる商品から外しました"); }
  else {
    const x = PROD_BY_CODE[c]; if (!x) return;
    FAV.unshift({c, n:x.name, p:x.price, i:x.img, u:x.url, s:x.shop, at:Date.now()});
    toast("マイリストの「気になる商品」に保存しました"); if (window.ct) window.ct("fav");
  }
  favSave();
  document.querySelectorAll(`[data-fav="${CSS.escape(c)}"]`).forEach(el=>{ const on = favHas(c); el.textContent = on?"♥":"♡"; el.setAttribute("aria-pressed", on); });
  if (document.getElementById("view-mine") && !document.getElementById("view-mine").hidden) renderMine();
});
/* マイリストを開いたら、保存した商品の今の値段を楽天から読み直す（6時間はこの端末に覚えておく） */
const FAV_FRESH = {};
async function refreshFav(){
  for (const f of FAV.slice(0,30)){
    if (f.c in FAV_FRESH || f.c.startsWith("u:")) continue;   // 商品コードがないものは、保存したときの情報のまま
    try{ const v = await rkSearch({itemCode:f.c, hits:"1"}); FAV_FRESH[f.c] = v.items[0] || null; }catch(e){ FAV_FRESH[f.c] = undefined; continue; }
    const g = document.getElementById("favGrid"); if (g) g.innerHTML = favCards();
  }
}
function favCards(){
  return FAV.map(f=>{ const fr = FAV_FRESH[f.c]; const x = fr ? fr : {name:f.n, price:f.p, img:f.i, url:f.u, shop:f.s, code:f.c, rc:0}; return prodCard(x, {gone: fr===null}); }).join("");
}
async function loadShop(reset){
  if (SH.busy) return;
  if (reset){ SH.page=1; SH.items=[]; }
  SH.busy = true; SH.err = false; drawShop();
  const word = (SHOPCAT.find(c=>c[0]===SH.cat)||[])[2]||"";
  const kw = SH.kw.replace(/ちいかわ|chiikawa/gi,"").trim();
  const p = {keyword: ("ちいかわ "+kw+" "+(kw?"":word)).replace(/\s+/g," ").trim(), hits:"30", page:String(SH.page), maxPrice:"30000"};
  if (SH.sort!=="standard") p.sort = SH.sort;
  try{
    const v = await rkSearch(p);
    const seen = new Set(SH.items.map(x=>x.url));
    v.items.filter(x=>okItem(x) && x.img && !seen.has(x.url)).forEach(x=>SH.items.push(x));
    SH.pageCount = Math.min(v.pageCount||1, 10);
  }catch(e){ SH.err = true; }
  SH.busy = false; drawShop();
}
function drawShop(){
  const g = document.getElementById("shopGrid");
  if (SH.err && !SH.items.length){ g.innerHTML = `<div class="empty" style="grid-column:1/-1">楽天の商品情報を読み込めませんでした。時間をおいて開き直してください。</div>`; }
  else if (!SH.items.length){ g.innerHTML = `<div class="empty" style="grid-column:1/-1">${SH.busy?"読み込み中です…":(SH.kw?`「${esc(SH.kw)}」のちいかわグッズは見つかりませんでした。ことばを変えてみてください。`:"商品が見つかりませんでした。")}</div>`; }
  else g.innerHTML = SH.items.map(prodCard).join("");
  document.getElementById("shopCount").textContent = SH.items.length ? `${SH.items.length}件` : "";
  const m = document.getElementById("shopMore");
  m.hidden = !(SH.items.length && SH.page < SH.pageCount);
  m.disabled = SH.busy; m.textContent = SH.busy ? "読み込み中…" : "もっと見る";
}
let shopStarted = false;
function renderShop(){ if (!shopStarted){ shopStarted = true; shopChips(); loadShop(true); } }
document.getElementById("shopCats").onclick = e=>{ const b=e.target.closest("[data-sc]"); if(!b) return; SH.cat=b.dataset.sc; SH.kw=""; document.getElementById("shopQ").value=""; shopChips(); loadShop(true); };
document.getElementById("shopSearch").onsubmit = e=>{
  e.preventDefault();
  const v = document.getElementById("shopQ").value.trim().slice(0,40);
  if (v===SH.kw) return;
  SH.kw = v; if (v) SH.cat = "all"; if (v && window.ct) window.ct("shopq"); shopChips(); loadShop(true);
  document.getElementById("shopQ").blur();
};
document.getElementById("shopQ").addEventListener("search", e=>{ if (!e.target.value && SH.kw){ SH.kw=""; loadShop(true); } });
document.getElementById("shopSort").onchange = e=>{ SH.sort=e.target.value; loadShop(true); };
document.getElementById("shopMore").onclick = ()=>{ SH.page++; loadShop(false); };
if (v0==="shop") setView("shop");
try{
  const st = JSON.parse(localStorage.getItem("chiikatsu-install")||"{}")||{};
  if (!localStorage.getItem("chiikatsu-intro-off") && (st.visits||0) <= 3){ document.getElementById("intro").hidden = false; document.documentElement.classList.add("has-intro"); }
}catch(e){ document.getElementById("intro").hidden = false; }
document.getElementById("introX").onclick = ()=>{ document.getElementById("intro").hidden = true; document.documentElement.classList.remove("has-intro"); try{ localStorage.setItem("chiikatsu-intro-off","1"); }catch(e){} };
try{ if (R.region==="jp" && !POP && !popBusy) loadPop(); }catch(e){}

/* ===== 楽天で人気のちいかわグッズ（一覧の途中） ===== */
var POP = null, popBusy = false, popTry = 0;
function loadPop(){
  popBusy = true; popTry++;
  rkSearch({keyword:"ちいかわ", hits:"30", sort:"-reviewCount", maxPrice:"30000"}).then(v=>{
    POP = v.items.filter(x=>okItem(x) && x.img).slice(0,10); popBusy = false; fillPop();
  }).catch(()=>{ popBusy = false; if (popTry < 3) setTimeout(()=>{ if (!POP) loadPop(); }, 4000 * popTry); else { POP = []; fillPop(); } });
}
function fillPop(){
  const els = document.querySelectorAll("[data-pop]"); if (!els.length) return;
  if (!POP){
    if (!popBusy) loadPop();
    return;
  }
  if (!POP.length){ els.forEach(e=>e.remove()); return; }
  const html = `<div class="pophead"><h3><span class="prtag">PR・楽天市場</span>楽天で人気のちいかわグッズ</h3><button type="button" class="peekmore" data-gopop>もっと見る →</button></div>
    <div class="poprow">${POP.map(x=>`<a class="popc" href="${esc(x.url)}" target="_blank" rel="noopener sponsored"><img src="${esc(x.img)}" alt="" loading="lazy"><span class="pn">${esc(x.name)}</span><span class="pp num">${yen(x.price)}</span></a>`).join("")}</div>
    <p class="tag" style="margin:4px 0 0">レビューの多い順</p>`;
  els.forEach(e=>{ if (!e.dataset.done){ e.innerHTML = html; e.dataset.done = "1"; } });
}
document.addEventListener("click", e=>{
  if (!e.target.closest("[data-gopop]")) return;
  SH.sort = "-reviewCount"; const sel = document.getElementById("shopSort"); if (sel) sel.value = "-reviewCount";
  shopStarted = true; shopChips(); setView("shop"); loadShop(true);
  document.getElementById("view-shop").scrollIntoView({behavior:"smooth", block:"start"});
});

/* ===== 季節のおすすめ（カレンダー・ニュースのタブだけ。一覧には出さない） ===== */
function seasonTheme(){
  const m = new Date(Date.now()+9*3600e3).getUTCMonth()+1;
  return ({1:["冬のちいかわグッズ","ちいかわ 冬"],2:["バレンタインのちいかわグッズ","ちいかわ バレンタイン"],3:["春のちいかわグッズ","ちいかわ 春"],4:["春のちいかわグッズ","ちいかわ 春"],5:["初夏のちいかわグッズ","ちいかわ 夏"],6:["夏のちいかわグッズ","ちいかわ 夏"],7:["夏のちいかわグッズ","ちいかわ 夏"],8:["夏のちいかわグッズ","ちいかわ 夏"],9:["秋のちいかわグッズ","ちいかわ 秋"],10:["ハロウィンのちいかわグッズ","ちいかわ ハロウィン"],11:["秋冬のちいかわグッズ","ちいかわ 冬"],12:["クリスマスのちいかわグッズ","ちいかわ クリスマス"]})[m];
}
var SEASON = null, seasonBusy = false;
function fillSeason(){
  const els = document.querySelectorAll("[data-season-strip]"); if (!els.length || R.region!=="jp") return;
  const [title, kw] = seasonTheme();
  if (!SEASON){
    if (!seasonBusy){ seasonBusy = true;
      rkSearch({keyword:kw, hits:"30", maxPrice:"30000"}).then(v=>{ SEASON = v.items.filter(x=>okItem(x) && x.img).slice(0,10); seasonBusy=false; fillSeason(); })
        .catch(()=>{ seasonBusy=false; SEASON = []; fillSeason(); });
    }
    return;
  }
  if (!SEASON.length){ els.forEach(e=>e.remove()); return; }
  const html = `<div class="pophead"><h3><span class="prtag">PR・楽天市場</span>${esc(title)}</h3></div>
    <div class="poprow">${SEASON.map(x=>`<a class="popc" href="${esc(x.url)}" target="_blank" rel="noopener sponsored"><img src="${esc(x.img)}" alt="" loading="lazy"><span class="pn">${esc(x.name)}</span><span class="pp num">${yen(x.price)}</span></a>`).join("")}</div>
`;
  els.forEach(e=>{ if (!e.dataset.done){ e.innerHTML = html; e.dataset.done = "1"; } });
}

/* ===== 楽天のセール期間の帯 ===== */
const CAMP = window.__CAMP || [];
function campNow(){
  const now = new Date(), t = s=>new Date(s+":00+09:00");
  const on = CAMP.find(c=>t(c.start)<=now && now<=t(c.end));
  if (on) return {c:on, mode:"on"};
  const soon = CAMP.find(c=>t(c.start)>now && t(c.start)-now < 36*3600e3);
  if (soon) return {c:soon, mode:"soon"};
  // 5と0のつく日（日本時間）
  const jd = new Date(Date.now()+9*3600e3).getUTCDate();
  if (jd%5===0) return {c:{id:"d50", name:"5と0のつく日", url:"https://event.rakuten.co.jp/campaign/card/pointday/", note:"楽天カードの利用でポイントアップ"}, mode:"day"};
  return null;
}
function fillCamp(){
  const x = campNow();
  document.querySelectorAll("[data-camp]").forEach(el=>{
    if (!x){ el.hidden = true; return; }
    const md = s=>{ const d=new Date(s+":00+09:00"); return `${d.getMonth()+1}/${d.getDate()} ${s.slice(11,16)}`; };
    const head = x.mode==="on" ? `${x.c.name} 開催中` : x.mode==="soon" ? `${x.c.name} まもなく開始` : `今日は楽天「${x.c.name}」`;
    const when = x.mode==="on" ? `${md(x.c.end)}まで` : x.mode==="soon" ? `${md(x.c.start)}から` : "";
    const u = `https://hb.afl.rakuten.co.jp/hgc/${AFF.rakutenId}/?pc=${encodeURIComponent(x.c.url)}`;
    el.hidden = false;
    el.innerHTML = `<a class="campbar${x.mode==="day"?" small":""}" href="${esc(u)}" target="_blank" rel="noopener sponsored"><b>${esc(head)}</b>${when?`<span class="w">${esc(when)}</span>`:""}<span class="nt">${esc(x.c.note||"")}</span><span class="tag">PR</span></a>`;
  });
}

/* ===== ニュース ===== */
const NTAG = {goods:"グッズ", event:"イベント", anime:"映画・アニメ", book:"本", overseas:"海外", topic:"話題"};
const NEWS = (window.__NEWS||[]).filter(n=>n && n.id && n.title && /^https:\/\//.test(n.src||"")).sort((a,b)=>(b.date||"").localeCompare(a.date||"") || (b.addedAt||"").localeCompare(a.addedAt||""));
const NS = {tag:"all"};
let newsSeen = new Set();
try{ newsSeen = new Set(JSON.parse(localStorage.getItem("chiikatsu-news-seen")||"[]")); }catch(e){}
function saveSeen(){ try{ localStorage.setItem("chiikatsu-news-seen", JSON.stringify(NEWS.map(n=>n.id).filter(id=>newsSeen.has(id)).slice(0,300))); }catch(e){} }
function nDate(s){ const [y,m,d]=(s||"").split("-").map(Number); if(!d) return ""; const dt=new Date(y,m-1,d); const n=diffDays(TODAY,dt); return n===0?"今日":n===1?"きのう":`${m}/${d}(${DOW[dt.getDay()]})`; }
function newsItem(n){
  const it = n.itemId && ITEMS.find(x=>x.id===n.itemId);
  if (!it) return "";
  const v = isEvent(it) ? "開始" : "発売";
  const when = it.sd > TODAY ? `${v}日 ${fmtStart(it)}` : it.ed && it.ed >= TODAY ? `${fmtEnd(it)}まで` : isEvent(it) ? "開催中" : "発売中";
  const on = mine[it.id]==="want";
  const g = status(it).k!=="ended" ? gcal(it) : null;   // 日付が決まっている予定だけ
  return `<div class="nitem"><span class="nwhen">📅 ${esc(when)}</span><div class="nbtns"><button class="btn nmark${on?" on":""}" type="button" data-nmark="${esc(it.id)}" aria-pressed="${on}">${on?"♥ ほしい":"♡ ほしい"}</button>${g?`<a class="btn" href="${g}" target="_blank" rel="noopener">カレンダーに追加</a>`:""}<a class="btn" href="/items/${encodeURIComponent(it.id)}/">くわしく</a></div></div>`;
}
function newsCard(n){
  const isNew = !newsSeen.has(n.id);
  return `<article class="ncard">
    <div class="nmeta"><span class="ntag t-${esc(n.tag||"topic")}">${esc(NTAG[n.tag]||"話題")}</span><time class="num">${esc(nDate(n.date))}</time>${isNew?`<span class="nnew">NEW</span>`:""}</div>
    <h3><a href="${esc(n.src)}" target="_blank" rel="noopener">${esc(n.title)}</a></h3>
    ${n.sum?`<p>${esc(n.sum)}</p>`:""}
    ${xbox(xpostOf(n) || xpostOf(n.itemId && ITEMS.find(x=>x.id===n.itemId)))}
    ${newsItem(n)}
    <a class="nsrc" href="${esc(n.src)}" target="_blank" rel="noopener">記事を読む（${esc(n.source||"出典")}）↗</a>
  </article>`;
}
/* ニュース速報：見張り役が10分ごとに見つけた公式の新しい発表を、すぐに表示する（/api/fresh） */
let FRESH = [];
const agoText = t => { const m = Math.max(1, Math.round((Date.now()-t)/60000)); return m < 60 ? `${m}分前` : m < 1440 ? `${Math.round(m/60)}時間前` : `${Math.round(m/1440)}日前`; };
function renderFresh(){
  const el = document.getElementById("freshBox"); if (!el) return;
  if (!FRESH.length){ el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<div class="freshh"><b>📣 速報</b><span>公式の発表を見つけしだい表示（10分ごとに確認）</span></div><ul>${FRESH.map(x=>`<li><a href="${esc(x.url)}" target="_blank" rel="noopener" data-fresh><span class="fm">${esc(x.src)}・${agoText(x.at)}${newsSeen.has("f:"+x.url)?"":`<i class="nnew">NEW</i>`}</span><span class="ft">${esc(x.title)}</span></a></li>`).join("")}</ul><p class="freshn">公式の見出しをそのまま載せています。くわしい内容は確認しだい、下のニュースと一覧に追加します。</p>`;
}
function loadFresh(){
  fetch("/api/fresh").then(r=>r.ok?r.json():null).then(j=>{ if (!j) return; FRESH = (j.items||[]).filter(x=>x && /^https:\/\//.test(x.url||"")); renderFresh(); renderNewsBadge(); }).catch(()=>{});
}
function renderNewsBadge(){
  const c = document.getElementById("newsCnt"); if (!c) return;
  const k = NEWS.filter(n=>!newsSeen.has(n.id)).length + FRESH.filter(x=>!newsSeen.has("f:"+x.url)).length;
  c.textContent = k>9 ? "9+" : k; c.hidden = !k;
}
function renderNewsPeek(){
  const el = document.getElementById("newsPeek"); if (!el) return;
  if (!NEWS.length){ el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<div class="peekhead"><h2>ちいかわニュース</h2><button type="button" class="peekmore" data-gonews>もっと見る →</button></div>
    <ul>${NEWS.slice(0,3).map(n=>`<li><button type="button" data-gonews="${esc(n.id)}"><time class="num">${esc(nDate(n.date))}</time><span>${esc(n.title)}</span>${newsSeen.has(n.id)?"":`<i class="ndot" aria-label="未読"></i>`}</button></li>`).join("")}</ul>`;
}
function renderNews(){
  const tags = [["all","すべて"], ...Object.entries(NTAG).filter(([k])=>NEWS.some(n=>n.tag===k))];
  document.getElementById("newsTags").innerHTML = tags.map(([k,l])=>`<button class="chip" data-nt="${k}" aria-pressed="${NS.tag===k}">${l}</button>`).join("");
  const arr = NEWS.filter(n=>NS.tag==="all" || n.tag===NS.tag);
  document.getElementById("newsList").innerHTML = arr.length
    ? arr.map((n,i)=>newsCard(n)+(i===3||i===13?AD:"")+(i===3?`<div class="popstrip season" data-season-strip></div>`:"")).join("") + (arr.length<=3?`<div class="popstrip season" data-season-strip></div>`:"")
    : `<div class="empty">まだニュースはありません。</div>`;
  // 開いたら既読に（NEW の表示は今回だけ残す）
  renderFresh(); loadFresh();
  NEWS.forEach(n=>newsSeen.add(n.id)); FRESH.forEach(x=>newsSeen.add("f:"+x.url)); saveSeen(); renderNewsBadge(); renderNewsPeek(); loadFresh(); fillCamp(); setTimeout(fillSeason, 0);
}
document.getElementById("newsTags").onclick = e=>{ const b=e.target.closest("[data-nt]"); if(!b) return; NS.tag=b.dataset.nt; renderNews(); };
document.addEventListener("click", e=>{
  const g = e.target.closest("[data-gonews]");
  if (g){
    setView("news");
    const id = g.dataset.gonews;
    const t = document.getElementById("view-news");
    if (t) t.scrollIntoView({behavior:"smooth", block:"start"});
    return;
  }
  const m = e.target.closest("[data-nmark]");
  if (m){
    const id = m.dataset.nmark;
    if (mine[id]==="want") delete mine[id]; else { mine[id]="want"; toast("マイリストの「ほしい」に入れました"); }
    saveMine(); renderAll(); renderNews();
  }
});
renderNewsBadge(); renderNewsPeek();
if (v0==="news") setView("news");

/* ===== 発売前日・当日の通知 ===== */
const VAPID = "BLcj6kLGL1ub20otavL50U2UJRfekzyX3zdS54fh10bhFW9yyn4vyeFoVulCPi6AljaZForJRTkXBjvpcNDZZ_o";
const PUSH_OK = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1);
const IS_APP = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone===true;
let pushSub = null;
const u8 = s=>{ s=s.replace(/-/g,"+").replace(/_/g,"/"); const b=atob(s+"===".slice((s.length+3)%4)); return Uint8Array.from(b,c=>c.charCodeAt(0)); };
const wantIds = ()=>Object.keys(mine).filter(id=>mine[id]==="want");
async function pushPost(body){ const r = await fetch("/api/push-sub",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}); if(!r.ok) throw new Error(r.status); return r.json(); }
let pushRsv = true; try{ pushRsv = localStorage.getItem("chiikatsu-push-rsv")!=="0"; }catch(e){}
let pushNews = true; try{ pushNews = localStorage.getItem("chiikatsu-push-news")!=="0"; }catch(e){}
const PCH = ["ちいかわ","ハチワレ","うさぎ","モモンガ","くりまんじゅう","ラッコ","シーサー","古本屋"];
let pushChars = []; try{ pushChars = JSON.parse(localStorage.getItem("chiikatsu-push-chars")||"[]").filter(c=>PCH.includes(c)); }catch(e){}
let syncT = null;
window.pushSync = ()=>{ if (!pushSub) return; clearTimeout(syncT); syncT = setTimeout(()=>pushPost({sub:pushSub.toJSON(), want:wantIds(), rsv:pushRsv, news:pushNews, chars:pushChars}).catch(()=>{}), 1200); };
const PUSH_WHAT = `<ul class="pwhat">
    <li><b>🛒 予約開始</b>ちいかわマーケットの予約は、始まる前の日の夜・当日の朝・30分前にお知らせ。予告なしで始まった予約も、5分以内にお知らせします</li>
    <li><b>🔄 再入荷</b>完売した商品がまた買えるようになったら、5分以内にお知らせ</li>
    <li><b>♡ ほしい</b>「ほしい」に入れた予定は、発売・開始の前日の夜と当日の朝に。終わる日の前日にも</li>
    <li><b>📣 ニュース速報</b>メーカー・コラボ先の公式発表や、公式通販の新商品を見つけたら、10分以内にお知らせ</li>
    <li><b>👆 通知を押すと</b>公式通販の商品ページがそのまま開くので、すぐに予約・購入できます</li>
  </ul>`;
function drawPush(){
  const el = document.getElementById("pushCard"); if (!el) return;
  let h = "";
  if (!PUSH_OK){
    if (IS_IOS && !IS_APP) h = `<b>🔔 予約開始・再入荷・発売日を通知でお知らせ</b><p>iPhone・iPadは、ホーム画面に追加したちい活ノートから通知を受け取れます。</p><button class="btn" type="button" data-install>ホーム画面に追加する方法</button>`;
    else { el.hidden = true; return; }
  } else if (Notification.permission==="denied"){
    h = `<b>🔔 通知がブロックされています</b><p>端末やブラウザの設定で、このサイトの通知を「許可」にすると受け取れます。</p>`;
  } else if (pushSub){
    h = `<b>🔔 通知はオンです</b><details class="pwd"><summary>どんなときに届く？</summary>${PUSH_WHAT}</details><label class="pchk"><input type="checkbox" data-prsv ${pushRsv?"checked":""}> <span>ちいかわマーケットの<strong>予約開始・再入荷</strong>も受け取る<small>オフにすると「ほしい」に入れた予定だけになります</small></span></label>${pushRsv?`<div class="pch"><span>推しで絞る：選んだキャラが出てくる商品だけお知らせ（何も選ばなければ全部）</span><div>${PCH.map(c=>`<button type="button" class="chip" data-pch="${c}" aria-pressed="${pushChars.includes(c)}">${c}</button>`).join("")}</div></div>`:""}<label class="pchk"><input type="checkbox" data-pnews ${pushNews?"checked":""}> <span><strong>ニュース速報</strong>（公式の新しい発表）も受け取る<small>新しいグッズやコラボの発表を見つけしだいお知らせします</small></span></label><div class="acts"><button class="btn" type="button" data-ptest>テスト通知を送る</button><button class="btn" type="button" data-poff>通知をやめる</button></div>`;
  } else {
    h = `<b>🔔 予約開始・再入荷・発売日を通知でお知らせ</b><p>争奪戦に負けないための、ちい活ノートの通知です。登録はいりません。</p>${PUSH_WHAT}<button class="btn ok" type="button" data-pon>通知を受け取る</button>`;
  }
  el.innerHTML = h; el.hidden = false;
  document.documentElement.classList.add("has-push");   // 通知の案内を出すときは、ホーム画面に追加の大きな案内は重ねない
}
async function pushInit(){
  if (PUSH_OK){ try{ const reg = await navigator.serviceWorker.getRegistration(); if (reg) pushSub = await reg.pushManager.getSubscription(); }catch(e){} }
  drawPush();
  if (pushSub) window.pushSync();
}
document.addEventListener("change", e=>{
  const c = e.target.closest("[data-pnews]"); if (!c) return;
  pushNews = c.checked; try{ localStorage.setItem("chiikatsu-push-news", pushNews?"1":"0"); }catch(err){}
  window.pushSync(); toast(pushNews ? "ニュース速報のお知らせをオンにしました" : "ニュース速報のお知らせをオフにしました");
});
document.addEventListener("change", e=>{
  const c = e.target.closest("[data-prsv]"); if (!c) return;
  pushRsv = c.checked; try{ localStorage.setItem("chiikatsu-push-rsv", pushRsv?"1":"0"); }catch(err){}
  window.pushSync(); drawPush(); toast(pushRsv ? "予約開始・再入荷のお知らせをオンにしました" : "予約開始・再入荷のお知らせをオフにしました");
});
document.addEventListener("click", e=>{
  const b = e.target.closest("[data-pch]"); if (!b) return;
  const c = b.dataset.pch;
  pushChars = pushChars.includes(c) ? pushChars.filter(x=>x!==c) : pushChars.concat(c);
  try{ localStorage.setItem("chiikatsu-push-chars", JSON.stringify(pushChars)); }catch(err){}
  b.setAttribute("aria-pressed", pushChars.includes(c)); window.pushSync();
});
document.addEventListener("click", async e=>{
  if (e.target.closest("[data-pon]")){
    try{
      const perm = await Notification.requestPermission();
      if (perm!=="granted"){ drawPush(); return; }
      const reg = await navigator.serviceWorker.register("/sw.js").then(()=>navigator.serviceWorker.ready);
      pushSub = await reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:u8(VAPID)});
      await pushPost({sub:pushSub.toJSON(), want:wantIds(), rsv:pushRsv, news:pushNews, chars:pushChars});
      toast("通知をオンにしました"); if (window.ct) window.ct("push:on");
    }catch(err){ toast("通知をオンにできませんでした。時間をおいてお試しください"); }
    drawPush();
  }
  if (e.target.closest("[data-poff]") && pushSub){
    try{ await pushPost({sub:pushSub.toJSON(), off:true}); await pushSub.unsubscribe(); }catch(err){}
    pushSub = null; toast("通知をやめました"); drawPush();
  }
  if (e.target.closest("[data-ptest]") && pushSub){
    try{ await pushPost({sub:pushSub.toJSON(), want:wantIds(), rsv:pushRsv, news:pushNews, chars:pushChars}); const r = await fetch("/api/push-test",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({endpoint:pushSub.endpoint})}); const j = await r.json().catch(()=>({})); toast(j.ok ? "テスト通知を送りました" : "テスト通知を送れませんでした"); }catch(err){ toast("テスト通知を送れませんでした"); }
  }
});
pushInit();

/* ホーム画面のアイコン長押しメニューなどから来たとき（?v=ending など）に、その画面を開く */
try{
  const qv = new URLSearchParams(location.search).get("v");
  if (qv==="ending"){ const b=document.querySelector('.sum [data-jump="ending"]'); if (b) b.click(); }
  else if (["cal","mine","shop","list","news"].includes(qv)) setView(qv);
  if (location.search) history.replaceState(null, "", "/" + location.hash);
}catch(e){}
