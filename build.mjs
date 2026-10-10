// ちい活ノート：サイトを組み立てるスクリプト
// Cloudflare Pages のビルドコマンド `node build.mjs` で実行され、dist/ に公開用ファイルを書き出す。
import fs from "node:fs";
import path from "node:path";
import { makeOg, ogAvailable } from "./src/og.mjs";
import { buildSeo, areasOf, monthOf } from "./src/seo.mjs";

const SITE = "https://chiikatsunote.com";
const AFF = "582a6f7f.e1ade2b2.582a6f84.d5f85faa";
const OUT = "dist";
const TODAY = new Date().toISOString().slice(0, 10);

const items = JSON.parse(fs.readFileSync("data/items.json", "utf8")).filter(x => !x.hidden);
const css = fs.readFileSync("src/style.css", "utf8");
const app = fs.readFileSync("src/app.js", "utf8");
import { RKM } from "./src/rkmatch.mjs";
const RKM_SRC = fs.readFileSync("src/rkmatch.mjs", "utf8").replace(/^export /m, "");   // ブラウザ用（export を外して埋め込む）
let homeBody = fs.readFileSync("src/home-body.html", "utf8");
let news = [];
try { news = JSON.parse(fs.readFileSync("data/news.json", "utf8")).filter(n => !n.hidden).sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 80); } catch (e) {}
let camps = [];
try { camps = JSON.parse(fs.readFileSync("data/campaigns.json", "utf8")).filter(c => c.end >= TODAY); } catch (e) {}
const installJs = fs.readFileSync("src/install.js", "utf8");
const OFFICIAL_X = JSON.parse(fs.readFileSync("data/official-x.json", "utf8")).accounts;
const XPOST_SRC = fs.readFileSync("src/xpost.js", "utf8").replace("/*OFFICIAL_X*/{}", JSON.stringify(Object.fromEntries(Object.entries(OFFICIAL_X).map(([k, v]) => [k.toLowerCase(), v.name]))));
const { xpostOf, xbox } = new Function(XPOST_SRC + "; return { xpostOf, xbox };")();
const swJs = fs.readFileSync("src/sw.js", "utf8");
const BUILD = Date.now().toString(36);

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const CAT = { goods: "グッズ", food: "お菓子・食品", kuji: "くじ", event: "イベント", cafe: "カフェ・お店", book: "本・カレンダー" };
const REG = { jp: "日本", tw: "台湾", kr: "韓国", hk: "香港", cn: "中国", th: "タイ", sg: "シンガポール", my: "マレーシア", us: "アメリカ" };
const DOW = ["日", "月", "火", "水", "木", "金", "土"];
const isEvent = it => it.cat === "event" || it.cat === "cafe";
const fmt = (s, sp = "day") => {
  const [y, m, d] = s.split("-").map(Number);
  if (sp && sp !== "day") return `${y}年${m}月${{ early: "上旬", mid: "中旬", late: "下旬", month: "" }[sp]}`;
  const w = DOW[new Date(y, m - 1, d).getDay()];
  return `${y}年${m}月${d}日(${w})`;
};

// 楽天トラベルのキーワード検索は Shift_JIS で受け取るので変換する
const sjis = new Map();
try {
  const dec = new TextDecoder("shift_jis");
  for (let a = 0x81; a <= 0xfc; a++) {
    if (a > 0x9f && a < 0xe0) continue;
    for (let b = 0x40; b <= 0xfc; b++) {
      if (b === 0x7f) continue;
      const ch = dec.decode(new Uint8Array([a, b]));
      if (ch.length === 1 && ch.charCodeAt(0) !== 0xfffd && !sjis.has(ch)) sjis.set(ch, "%" + a.toString(16).toUpperCase() + "%" + b.toString(16).toUpperCase());
    }
  }
} catch (e) {}
const sjisEncode = str => [...str].map(ch => /[A-Za-z0-9\-_.]/.test(ch) ? ch : ch === " " ? "+" : sjis.get(ch) || (ch.charCodeAt(0) < 128 ? "%" + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0") : "")).join("");
const MOSHIMO_YAHOO = "a_id=5838536&p_id=1225&pc_id=1925&pl_id=18502";   // もしもアフィリエイト（Yahoo!ショッピング）。2026-10-09 アカウント作り直しで a_id を 5838536 に変更
const yahooSearch = q => `https://af.moshimo.com/af/c/click?${MOSHIMO_YAHOO}&url=${encodeURIComponent("https://shopping.yahoo.co.jp/search?p=" + encodeURIComponent(/ちいかわ|chiikawa/i.test(q) ? q : "ちいかわ " + q))}`;
const aff = u => `https://hb.afl.rakuten.co.jp/hgc/${AFF}/?pc=${encodeURIComponent(u)}`;
const rakutenSearch = q => aff("https://search.rakuten.co.jp/search/mall/" + encodeURIComponent(/ちいかわ|chiikawa/i.test(q) ? q : "ちいかわ " + q) + "/");
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
const travel = it => { const h = hotelLink(it); return h && { url: aff(h.url), label: h.label }; };

const BRAND = `<header class="top">
    <a class="brand" href="/" style="text-decoration:none;color:inherit">
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><rect x="3" y="7" width="34" height="30" rx="11" fill="var(--acc-soft)"/><rect x="3" y="7" width="34" height="11" rx="5.5" fill="var(--acc)"/><rect x="11" y="3" width="4" height="9" rx="2" fill="var(--ink)"/><rect x="25" y="3" width="4" height="9" rx="2" fill="var(--ink)"/><circle cx="14" cy="26" r="2.2" fill="var(--ink)"/><circle cx="26" cy="26" r="2.2" fill="var(--ink)"/><path d="M18 30.5q2 1.8 4 0" stroke="var(--ink)" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>
      <div><p style="font-family:var(--display);font-weight:900;font-size:22px;margin:0;line-height:1.1">ちい活ノート</p><p>ちいかわグッズとイベントのスケジュール帳（非公式）</p></div>
    </a>
  </header>`;
// ---- 公式リンク集（作り手へのリスペクト）
const OFFICIAL = [
  ["作品・作者", [
    ["ナガノさん（作者）", "https://x.com/ngntrtr", "作者ナガノさんの公式X"],
    ["ちいかわ（原作）", "https://x.com/ngnchiikawa", "原作マンガが更新される公式X"],
    ["コミックス『ちいかわ なんか小さくてかわいいやつ』", "https://morning.kodansha.co.jp/c/chiikawa.html", "講談社 モーニング公式サイト"],
    ["アニメ『ちいかわ』", "https://www.anime-chiikawa.jp/", "アニメ公式サイト"],
    ["『映画ちいかわ 人魚の島のひみつ』", "https://chiikawa.toho-movie.jp/", "映画公式サイト"],
  ]],
  ["グッズ・お店", [
    ["ちいかわインフォ", "https://chiikawa-info.jp/", "グッズ・POP UP STOREの公式情報"],
    ["ちいかわマーケット", "https://chiikawamarket.jp/", "公式オンラインショップ"],
    ["ちいかわらんど", "https://chiikawa-info.jp/ck_land.html", "公式の常設店"],
    ["ちいかわベーカリー", "https://chiikawabakery.jp/", "ベーカリーの公式サイト"],
    ["ちいかわパーク", "https://chiikawapark-tokyo.jp/", "池袋の体験型施設の公式サイト"],
    ["ちいかわグッズ公式", "https://x.com/chiikawa_kouhou", "新しいグッズのお知らせ（公式X）"],
  ]],
  ["ゲーム", [
    ["ちいかわぽけっと", "https://jp.chiikawa-pocket.com/ja/", "スマホアプリの公式サイト"],
  ]],
];
const officialHtml = OFFICIAL.map(([g, list]) => `<h2>${esc(g)}</h2><ul class="offlist">${list.map(([n, u, d]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener"><b>${esc(n)}</b><span>${esc(d)}</span></a></li>`).join("")}</ul>`).join("");
const RESPECT = `<div class="respect"><p>ちい活ノートは、ナガノさんの『ちいかわ』が大好きなファンが作っている非公式のスケジュール帳です。最新の情報は公式の発表がいちばん正確です。公式グッズを買うことが、作品と作り手さんの応援につながります。</p><a href="/official/">公式サイト・公式アカウントのリンク集 →</a></div>`;

const ICO = `<img src="/icons/icon-192.png" alt="" width="48" height="48" class="appicon">`;
const INSTALL_CARD = `<div class="ins-card" data-ins-card>${ICO}<div class="ins-txt"><b>ホーム画面に追加して、アプリのように使う</b><span>アイコンをタップするだけで、すぐにスケジュールを確認できます。無料・登録なし。</span></div><button type="button" class="ins-cta" data-install>追加のしかたを見る</button></div>`;
const INSTALL_TOP = `<div class="ins-card ins-top" data-ins-card>${ICO}<div class="ins-txt"><b>ホーム画面に追加すると便利</b><span>アプリのようにワンタップで開けます</span></div><button type="button" class="ins-cta" data-install>追加する</button><button type="button" class="ins-x" data-ins-hide aria-label="この案内を閉じる">×</button></div>`;
const INSTALL_MINE = `<div class="ins-card ins-mine" data-ins-card>${ICO}<div class="ins-txt"><b>マイリストをすぐ見られるように</b><span>ホーム画面に追加すると、アイコンからワンタップで開けます</span></div><button type="button" class="ins-cta" data-install>追加する</button></div>`;
const FOOT = `<footer class="about">
    ${INSTALL_CARD}
    ${RESPECT}
    <div class="sitelinks"><a href="/">トップ</a><a href="/goods/">グッズまとめ</a><a href="/month/">月別まとめ</a><a href="/area/">地域別</a><a href="/about/">運営者について</a><a href="/contact/">お問い合わせ</a><a href="/privacy/">プライバシーポリシー</a></div>
    <p class="credit"><a href="https://webservice.rakuten.co.jp/" target="_blank" rel="noopener">Supported by Rakuten Developers</a></p>
    <p>©nagano / chiikawa committee　本サイトは権利者とは関係のない個人運営のサイトです。</p>
  </footer>`;
// 推しカラーを詳細ページにも反映する小さな処理
const OSHI_BOOT = `<script>(function(){var d=new Date(Date.now()+9*3600e3),m=d.getUTCMonth()+1,t=d.getUTCDate(),s=m===10?"halloween":(m===12&&t<=25)?"xmas":((m===12&&t>=26)||(m===1&&t<=7))?"newyear":"";if(s)document.documentElement.dataset.season=s})()</script><script>try{var ic=JSON.parse(localStorage.getItem("chiikatsu-install")||"{}")||{};if(ic.topOff)document.documentElement.classList.add("ins-off");if(ic.installed||(window.matchMedia&&matchMedia("(display-mode: standalone)").matches)||navigator.standalone)document.documentElement.classList.add("is-app")}catch(e){}</script><script>try{var k=localStorage.getItem("chiikatsu-oshi");if(k)document.documentElement.dataset.oshi=k;else document.documentElement.dataset.oshi="chiikawa"}catch(e){document.documentElement.dataset.oshi="chiikawa"}</script>`;

function page({ title, desc, url, body, head = "", scripts = "", ogType = "website", ogImage = "/og/home.png" }) {
  return `<!doctype html>
<html lang="ja" data-oshi="chiikawa">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}${url}">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="ちい活ノート">
<meta property="og:locale" content="ja_JP">
<meta property="og:image" content="${SITE}${ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="max-image-preview:large">
<meta name="theme-color" content="#FBF6F8">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icons/icon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/icons/icon-180.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="ちい活ノート">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<script src="/install.js?v=${BUILD}" defer></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@700;900&display=swap" media="print" onload="this.media='all'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@700;900&display=swap"></noscript>
<link rel="stylesheet" href="/style.css?v=${BUILD}">
${OSHI_BOOT}
${head}
</head>
<body>
${body}
${scripts}
</body>
</html>
`;
}

function write(file, content) {
  const p = path.join(OUT, file);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
write("style.css", css);
// 画像の出し方の台帳（どの情報に、どこの画像を、どんな根拠で出すか）。サーバーの点検（/api/visuals）が使う
write("visuals.json", JSON.stringify({ builtAt: new Date().toISOString(), items: items.filter(it => !it.hidden).map(it => {
  const x = xpostOf(it), plan = RKM.plan(it);
  return { id: it.id, t: it.t, cat: it.cat, q: it.q || "", price: it.price || "", event: isEvent(it),
    rakuten: plan ? { query: plan.query } : null, qNone: it.qNone || "", src: it.src || "",
    x: x ? { url: `https://x.com/i/status/${x.id}`, account: x.name, note: it.xpostNote || "（情報源のURLとして登録された公式ポスト）" } : null };
}) }));
write("app.js", RKM_SRC + "\n" + XPOST_SRC + "\n" + app);
write("install.js", RKM_SRC + "\n" + installJs);
// 計測の受け口（functions/api/hit.js）が「掲載中の商品か」を確かめるためのID一覧。Functions は build のあとに組み立てられるので、ここで作る
fs.writeFileSync("functions/api/_ids.js", "// build.mjs が作るファイル（手で直さない）\nexport const IDS = " + JSON.stringify(items.map(it => it.id)) + ";\n");
write("onboard.js", fs.readFileSync("src/onboard.js", "utf8"));
write("sw.js", swJs.replace("__VER__", BUILD));
fs.mkdirSync(path.join(OUT, "icons"), { recursive: true });
for (const f of fs.readdirSync("src/icons")) fs.copyFileSync(path.join("src/icons", f), path.join(OUT, "icons", f));
write("camps.json", JSON.stringify(camps.map(c => ({ id: c.id, name: c.name, start: c.start, end: c.end }))));
write("push-items.json", JSON.stringify(items.map(it => ({ id: it.id, t: it.t, s: it.s, sp: it.sp || "day", e: it.e || null, cat: it.cat, place: it.place || "", rs: it.rs || null, re: it.re || null, rsv: Array.isArray(it.rsv) ? it.rsv.some(x => !x.so) : !!it.rsv, dl: (Array.isArray(it.dl) ? it.dl : []).filter(x => x && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(x.until || "")).map(x => ({ k: x.k || "応募", until: x.until, n: x.n || "" })) }))));
write("manifest.webmanifest", JSON.stringify({
  id: "/",
  name: "ちい活ノート｜ちいかわのスケジュール帳",
  short_name: "ちい活ノート",
  description: "ちいかわグッズの発売日とイベントの日程をまとめた非公式スケジュール帳",
  lang: "ja",
  start_url: "/?from=homescreen",
  scope: "/",
  display: "standalone",
  orientation: "portrait",
  background_color: "#FBF6F8",
  theme_color: "#FBF6F8",
  icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
  shortcuts: [
    { name: "まもなく締切・終了", url: "/?v=ending", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    { name: "カレンダー", url: "/?v=cal", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    { name: "マイリスト", url: "/?v=mine", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
  ],
}, null, 2));

// ---- トップページ
const sorted = items.slice().sort((a, b) => a.s.localeCompare(b.s));
const allLinks = `<details><summary class="credit" style="cursor:pointer">掲載中のすべての情報（${sorted.length}件）</summary><ul class="alllinks">${sorted.map(it => `<li><a href="/items/${encodeURIComponent(it.id)}/">${esc(it.t)}</a></li>`).join("")}</ul></details>`;
homeBody = homeBody.replace("{{RESPECT}}", RESPECT).replace("{{INSTALL_CARD}}", INSTALL_CARD).replace("{{INSTALL_TOP}}", INSTALL_TOP).replace("{{INSTALL_MINE}}", INSTALL_MINE).replace("{{ALL_LINKS}}", allLinks).replace("<h1>ちい活ノート</h1>", "<h1>ちい活ノート</h1>");
// ---- はじめての方へのご案内（オンボーディング）の判定。トップの先頭で、app.js が URL を整理する前に1回だけ動く。
// 出す人：Xから（utm_source=x／twitter、または t.co・x.com からのリンク）トップに初めて来た人で、まだご案内を閉じていない人。
// 出さない人：リピーター、ホーム画面から開いた人、ちいかわ検定から来た人（検定の歓迎案内が出るため）。?ob=1 で確認用に必ず出す。
// 出す人にだけ /onboard.js を読み込むので、ほかの人のページの重さは変わらない。
// トップの下の「使い方」（data-ob-open）を押すと、閉じた人もいつでも見直せる。
const ONB_GATE = String.raw`<script>(function(){function L(){var e=document.createElement("script");e.src="/onboard.js?v=${BUILD}";e.async=true;document.head.appendChild(e)}document.addEventListener("click",function(v){var a=v.target&&v.target.closest&&v.target.closest("[data-ob-open]");if(!a)return;v.preventDefault();window.__chiikatsuOnbForce=1;if(window.chiikatsuOnb)window.chiikatsuOnb.open();else L()});try{var q=new URLSearchParams(location.search),s=(q.get("utm_source")||"").toLowerCase(),fx=s==="x"||s==="twitter"||s==="t.co",rx=/^https?:\/\/(t\.co|([a-z]+\.)?(x|twitter)\.com)\//i.test(document.referrer||""),force=q.get("ob")==="1";if(fx)sessionStorage.setItem("chiikatsu-xin","1");window.__chiikatsuOnbQ=location.search;window.__chiikatsuOnbX=fx||rx;if(!force){if(!(fx||rx))return;if(q.get("from"))return;if(sessionStorage.getItem("chiikatsu-qarr")||sessionStorage.getItem("chiikatsu-qwel"))return;if((window.matchMedia&&matchMedia("(display-mode: standalone)").matches)||navigator.standalone)return;if(localStorage.getItem("chiikatsu-onb"))return;var ic=JSON.parse(localStorage.getItem("chiikatsu-install")||"{}")||{};if(ic.visits>0||ic.installed)return;var u=JSON.parse(localStorage.getItem("chiikatsu-u")||"{}")||{};if(u.first)return}L()}catch(e){}})()</script>`;
homeBody = homeBody.replace("{{ONB_GATE}}", ONB_GATE);
const homeLd = { "@context": "https://schema.org", "@type": "WebSite", name: "ちい活ノート", url: SITE + "/", inLanguage: "ja" };
write("index.html", page({
  title: "ちい活ノート｜ちいかわグッズの発売日・イベント日程カレンダー",
  desc: "ちいかわの新商品の発売日、POP UP STOREやコラボカフェの開催期間、海外のちいかわイベントをまとめた非公式スケジュール帳。まもなく終わるものや今週発売のグッズがひと目でわかります。",
  url: "/",
  head: `<script type="application/ld+json">${JSON.stringify(homeLd)}</script>`,
  body: homeBody,
  scripts: `<script>window.__ITEMS=${JSON.stringify(items).replace(/</g, "\\u003c")};window.__NEWS=${JSON.stringify(news).replace(/</g, "\\u003c")};window.__CAMP=${JSON.stringify(camps).replace(/</g, "\\u003c")};</script>\n<script src="/app.js?v=${BUILD}"></script>`,
}));

// ---- 共有用の画像（OGP）
const ogOk = ogAvailable();
const md = s => { const [y, m, d] = s.split("-").map(Number); return `${m}/${d}(${DOW[new Date(y, m - 1, d).getDay()]})`; };
const mdSp = (s, sp) => sp && sp !== "day" ? fmt(s, sp).replace(/^\d+年/, "") : md(s);
function writeOg(name, opt) {
  if (!ogOk) return false;
  try { const png = makeOg(opt); if (!png) return false; fs.mkdirSync(path.join(OUT, "og"), { recursive: true }); fs.writeFileSync(path.join(OUT, "og", name + ".png"), png); return true; }
  catch (e) { console.warn("OGP画像を作れませんでした:", name, e.message); return false; }
}
writeOg("home", { label: "非公式スケジュール帳", title: "ちいかわグッズの発売日とイベント日程が、ひと目でわかる", when: "まもなく終了・今週発売もすぐチェック", sub: "日本と海外（台湾・韓国・香港・中国）のちいかわ情報" });

const ogWhenText = it => it.e ? `${mdSp(it.s, it.sp)}〜${md(it.e)}` : `${mdSp(it.s, it.sp)}${isEvent(it) ? "から" : "発売"}`;
// ---- 項目ごとのページ（検索から来た人の入口）

// 詳細ページ「あわせてチェック」：同じ会場・同じシリーズ・同じ日に始まるもの（終了したものは出さない）
const REL_GENERIC = /^(ちいかわマーケット|ちいかわらんど|全国|各地|国内線|全店|書店|通販|コンビニ|スーパー|ECサイト|オンライン|ドン・キホーテ|上映館|対象)/;
const REL_SERIES = /(ちいかわパーク|ちいかわベーカリー|映画ちいかわ|ちいかわ ?POP ?UP ?STORE|ちいかわらんど|アニメちいかわ|ちいかわぽけっと|ちいかわもぐもぐ本舗|まじかるちいかわ|ちいかわ×[^\s　・（(]{2,10})/i;
function venueKey(x) { const v = String(x.place || "").split(/[、,（(／/]/)[0].trim(); return v.length >= 4 && !REL_GENERIC.test(v) ? v : ""; }
function seriesKey(x) { const m = REL_SERIES.exec(x.t || ""); return m ? m[1].replace(/\s/g, "").toLowerCase() : ""; }
function relatedOf(it, all) {
  const vk = venueKey(it), sk = seriesKey(it), out = [];
  for (const x of all) {
    if (x.id === it.id || (x.e && x.e < TODAY)) continue;
    const why = [];
    if (vk && venueKey(x) === vk) why.push("同じ会場");
    if (sk && seriesKey(x) === sk) why.push("同じシリーズ");
    if (x.s && x.s === it.s) why.push("同じ日スタート");
    if (!why.length) continue;
    out.push({ x, why: why[0], sc: why.length * 10 - Math.min(9, Math.abs((new Date(x.s) - new Date(it.s)) / 864e5) / 10) });
  }
  return out.sort((p, q) => q.sc - p.sc).slice(0, 6);
}
const ev0 = it => it.cat === "event" || it.cat === "cafe";

for (const it of items) {
  const reg = REG[it.region] || "日本";
  const ev = isEvent(it);
  const start = fmt(it.s, it.sp);
  const end = it.e ? fmt(it.e) : "";
  const when = end ? `${start}〜${end}` : `${start}${ev ? "から" : "発売"}`;
  // 検索する人の疑問（いつ？どこで？）に答える形の題名。ページの中身（文字数）は変えない
  const ask = it.rsv && !ev ? "予約はいつまで？価格" : ev ? `いつからいつまで？場所${it.time ? "・時間" : ""}` : `いつ発売？どこで買える？${it.price ? "価格" : ""}`;
  const title = `${it.t}｜${ask}【ちい活ノート】`;
  const desc = `${it.t}は${when}。${it.place ? "場所：" + it.place + "。" : ""}${it.price ? "価格：" + it.price + "。" : ""}${it.note || ""}`.slice(0, 150);
  const url = `/items/${encodeURIComponent(it.id)}/`;

  const ogWhen = it.e ? `${mdSp(it.s, it.sp)} 〜 ${md(it.e)}` : `${mdSp(it.s, it.sp)} ${ev ? "から" : "発売"}`;
  const hasOg = writeOg(it.id, { label: (CAT[it.cat] || "") + (reg !== "日本" ? "・" + reg : ""), title: it.t, when: ogWhen, sub: it.place || it.price || "", accent: ev ? "#3E9C83" : "#E27496" });
  // 構造化データ（イベント）：会場で期間限定に開かれる催しだけ。常設店・全国キャンペーン・入場者特典などは「イベント」にしない。
  // 主催者（organizer）は公式の情報で分かったときだけ（items.json の org）。値段・出演者は分からないので入れない（推測で書かない）。
  const isRealEvent = ev && it.sp === "day" && !!it.e && !/常設/.test(it.eNote || "") && !/全国|各地|上映館|国内線|全店/.test(it.place || "");
  const ld = isRealEvent ? {
    "@context": "https://schema.org", "@type": "Event", name: it.t, startDate: it.s, endDate: it.e,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode", eventStatus: "https://schema.org/EventScheduled",
    location: { "@type": "Place", name: it.place || reg, address: it.place || reg }, description: desc, url: SITE + url,
    ...(hasOg ? { image: [`${SITE}/og/${encodeURIComponent(it.id)}.png`] } : {}),
    ...(it.org && it.org.name ? { organizer: { "@type": "Organization", name: it.org.name, ...(/^https:\/\//.test(it.org.url || "") ? { url: it.org.url } : {}) } } : {}),
  } : null;
  const related = sorted.filter(x => x.id !== it.id && (x.region || "jp") === (it.region || "jp") && x.cat === it.cat).slice(-6);
  // 購入先のブロック（公式の予約・楽天・Yahoo!・公式情報）。上と下の2か所に同じ中身を置く（URLも同じ。計測は a の属性で見分けるので、どちらを押しても同じ定義で数える）
  const buyInner = `${(() => { const L = Array.isArray(it.rsv) ? it.rsv : it.rsv ? [{ n: "", u: it.rsv }] : []; const ok = L.filter(x => /^https:\/\//.test(x.u || "")); if (!ok.length || (it.re && new Date(it.re + ":00+09:00") < new Date())) return "";
      if (ok.every(x => x.so)) return `<div class="rsvbox closed"><div class="rsvh">予約はすべて完売しました</div></div>`;
      return `<div class="rsvbox open"><div class="rsvh">予約・受注${it.re ? `<small>締切 ${esc(fmt(it.re.slice(0, 10)))} ${esc(it.re.slice(11, 16))}</small>` : ""}</div><div class="rsvbtns">${ok.slice().sort((p, q) => (p.so ? 1 : 0) - (q.so ? 1 : 0)).map(x => x.so ? `<span class="btn rsvbtn so">${x.n ? esc(x.n) + " " : ""}完売</span>` : `<a class="btn rsvbtn" href="${esc(x.u)}" target="_blank" rel="noopener" data-rsv>予約はこちら${x.n ? "（" + esc(x.n) + "）" : ""}</a>`).join("")}</div></div>`; })()}
    <div class="acts">
      ${(() => { const L = (Array.isArray(it.rb) ? it.rb : []).filter(x => x && /^https:\/\/books\.rakuten\.co\.jp\/rb\/\d+\/?$/.test(x.u || "")); const pre = it.s > TODAY;
        return L.map(x => `<a class="btn buy" href="${esc(aff(x.u))}" target="_blank" rel="noopener sponsored" data-rb>${pre ? "楽天ブックスで予約する" : "楽天ブックスで見る"}${x.n ? "（" + esc(x.n) + "）" : ""} <span class="tag">PR</span></a>`).join(""); })()}
      ${it.q && !(Array.isArray(it.rb) && it.rb.length) ? `<a class="btn buy" href="${esc(rakutenSearch(it.q))}" target="_blank" rel="noopener sponsored" data-rkd="${esc(JSON.stringify({ q: it.q, t: it.t, p: it.price || "", pre: it.s > TODAY, cat: it.cat }))}">楽天市場で探す <span class="tag">PR</span></a>` : ""}
      ${it.q ? `<a class="btn" href="${esc(yahooSearch(it.q))}" target="_blank" rel="noopener sponsored" data-yh>Yahoo!ショッピングで探す <span class="tag">PR</span></a>` : ""}
      ${/^https:\/\//.test(it.src || "") ? `<a class="btn" href="${esc(it.src)}" target="_blank" rel="noopener">公式情報</a>` : ""}
    </div>`;
  const hasBuy = /class="(btn|rsvbtn)/.test(buyInner);
  // ♡ ほしい（トップのカードと同じ「マイリスト」＝この端末の chiikatsu-mine に保存。通知がすぐ登録されたとは言わない）
  const wantRow = `<div class="wantrow" data-id="${esc(it.id)}" data-end="${esc((it.e || it.s || "").slice(0, 10))}"><button type="button" class="btn want" data-mark="want" aria-pressed="false">♡ ほしい</button><p class="wantnote" role="status" hidden></p></div>`;
  const body = `<div class="wrap">
  ${BRAND}
  <p class="crumb"><a href="/">ちい活ノート</a> › ${esc(CAT[it.cat] || "")}${reg !== "日本" ? "（" + reg + "）" : ""}</p>
  <main class="detail">
    <div class="meta"><span class="pill rg">${esc(reg)}</span><span class="cat">${esc(CAT[it.cat] || "")}</span></div>
    <h1>${esc(it.t)}</h1>
    <dl class="info">
      <dt>${it.rsv ? "予約受付" : ev ? "開始" : "発売"}</dt><dd>${esc(start)}${it.time ? " " + esc(it.time) : ""}</dd>
      ${end ? `<dt>${it.rsv ? "締切" : "終了"}</dt><dd>${esc(end)}${it.rsv && it.re && it.re.length > 10 ? " " + esc(it.re.slice(11, 16)) : ""}</dd>` : `<dt>終了</dt><dd>${esc(it.eNote || (ev ? "未定" : "なくなり次第終了"))}</dd>`}
      ${(Array.isArray(it.dl) ? it.dl : []).filter(x => x && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(x.until || "")).map(x => `<dt>${esc(x.k || "応募")}締切</dt><dd><b>${esc(fmt(x.until.slice(0, 10)))} ${esc(x.until.slice(11, 16))}まで</b>${x.n ? `<br><small>${esc(x.n)}</small>` : ""}${/^https:\/\//.test(x.u || "") ? `<br><a href="${esc(x.u)}" target="_blank" rel="noopener">応募・くわしくはこちら →</a>` : ""}</dd>`).join("")}
      ${it.place ? `<dt>場所</dt><dd>${esc(it.place)}</dd>` : ""}
      ${it.price ? `<dt>価格</dt><dd>${esc(it.price)}${(it.region || "jp") === "jp" ? "（税込）" : ""}</dd>` : ""}
      ${it.note ? `<dt>メモ</dt><dd>${esc(it.note)}</dd>` : ""}
    </dl>
    ${wantRow}
    <script>(function(){var w=document.querySelector(".wantrow");if(!w)return;var id=w.dataset.id,b=w.querySelector("button"),n=w.querySelector(".wantnote"),K="chiikatsu-mine";
var d=new Date(Date.now()+9*36e5).toISOString().slice(0,10);if(w.dataset.end&&w.dataset.end<d){w.hidden=true;return;}
function rd(){try{return JSON.parse(localStorage.getItem(K)||"{}")||{}}catch(e){return{}}}
function ui(){var on=rd()[id]==="want";b.setAttribute("aria-pressed",on);b.textContent=on?"\u2665 \u30DE\u30A4\u30EA\u30B9\u30C8\u306B\u5165\u308C\u3066\u3044\u307E\u3059":"\u2661 \u307B\u3057\u3044";if(!on)n.hidden=true;}
b.addEventListener("click",function(){var m=rd();if(m[id]==="want"){delete m[id];}else{m[id]="want";}try{localStorage.setItem(K,JSON.stringify(m));}catch(e){n.hidden=false;n.textContent="\u3053\u306E\u7AEF\u672B\u3067\u306F\u4FDD\u5B58\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F";return;}
ui();if(m[id]==="want"){n.hidden=false;n.innerHTML="\u3053\u306E\u7AEF\u672B\u306E\u30DE\u30A4\u30EA\u30B9\u30C8\u306B\u4FDD\u5B58\u3057\u307E\u3057\u305F\u3002\u901A\u77E5\u306F\u3001<a href='/?v=mine'>\u30C8\u30C3\u30D7\u306E\u300C\u30DE\u30A4\u30EA\u30B9\u30C8\u300D</a>\u3067\u30AA\u30F3\u306B\u3057\u3066\u3044\u308B\u5834\u5408\u3001\u30C8\u30C3\u30D7\u3092\u958B\u3044\u305F\u3068\u304D\u306B\u53CD\u6620\u3055\u308C\u307E\u3059\u3002";}});
addEventListener("pageshow",ui);addEventListener("storage",ui);ui();})();</script>
    ${hasBuy ? `<div class="buybox" data-buy="top">${buyInner}</div>` : ""}
    ${RKM.plan(it) ? `<div class="dhero" data-dhero><div class="dh-img" aria-hidden="true"></div><div class="dh-txt"><p class="dh-k">楽天市場で同じ商品を探しています…</p></div></div>` : ""}
    ${xbox(xpostOf(it))}
    ${(() => { const H = (Array.isArray(it.how) ? it.how : []).filter(s => typeof s === "string" && s.trim()).slice(0, 6); return H.length ? `<section class="howbox"><h2 class="howh">買い方・参加のしかた</h2><ul>${H.map(s => `<li>${esc(s)}</li>`).join("")}</ul><p class="hown">公式の発表をもとにしています。変更されることがあるので、行く前・買う前に公式情報でご確認ください。</p></section>` : ""; })()}
    ${hasBuy ? `<div class="buybox" data-buy="bottom"><p class="buyh">この商品の購入先・予約</p>${buyInner}</div>` : ""}
    ${hasBuy ? `<script>(function(){var bb=document.querySelector('[data-buy="bottom"]'),tb=document.querySelector('[data-buy="top"]');if(!bb||!tb)return;bb.hidden=true;
function f(){var sh=document.querySelector(".share");if(!sh)return;var h=document.querySelector("[data-dhero]"),long=(h&&/(^| )on( |$)/.test(h.className))||(sh.getBoundingClientRect().top-tb.getBoundingClientRect().bottom>innerHeight*.6);bb.hidden=!long;}
document.addEventListener("DOMContentLoaded",f);addEventListener("load",f);addEventListener("resize",f);if(window.ResizeObserver){var m=document.querySelector("main");if(m)new ResizeObserver(f).observe(m);}
var hh=document.querySelector("[data-dhero]");if(hh&&window.MutationObserver)new MutationObserver(f).observe(hh,{attributes:true,attributeFilter:["class"]});})();</script>` : ""}
    ${(() => { const tr = it.area ? travel(it) : null; return tr ? `<a class="trip" href="${esc(tr.url)}" target="_blank" rel="noopener sponsored"><span class="trip-k">遠征するなら</span><span class="trip-t">${esc(tr.label)}（楽天トラベル）</span><span class="tag">PR</span></a>` : ""; })()}
    ${(() => { const R = relatedOf(it, items); return R.length ? `<section class="relbox"><h2 class="relh">あわせてチェック</h2><ul class="rel">${R.map(r => `<li><a href="/items/${encodeURIComponent(r.x.id)}/"><span class="relk">${esc(r.why)}</span><span class="relt">${esc(r.x.t)}</span><span class="reld">${(md => md(r.x.s) + (r.x.e ? "〜" + md(r.x.e) : ""))(v => Number(v.slice(5, 7)) + "/" + Number(v.slice(8, 10)))}</span></a></li>`).join("")}</ul></section>` : ""; })()}
    <div class="share"><span class="k">友だちに教える</span>
      <a class="btn" href="https://line.me/R/share?text=${encodeURIComponent(it.t + "\n" + SITE + url)}" target="_blank" rel="noopener">LINEで送る</a>
      <a class="btn" href="https://x.com/intent/post?text=${encodeURIComponent(it.t + "（" + ogWhenText(it) + "）")}&url=${encodeURIComponent(SITE + url)}&hashtags=${encodeURIComponent("ちいかわ")}" target="_blank" rel="noopener">Xでポスト</a>
      <button class="btn" type="button" data-share="copy" onclick="(navigator.share?navigator.share({title:document.title,url:location.href}):navigator.clipboard.writeText(location.href).then(()=>alert('URLをコピーしました'))).catch(()=>{})">URLをコピー・共有</button>
    </div>
    <details class="drep"><summary>情報のまちがいを報告する</summary>
      <form class="drepf" data-id="${esc(it.id)}" data-t="${esc(it.t)}">
        <div class="rep-k">${[["date","日付がちがう"],["place","場所がちがう"],["price","価格がちがう"],["cancel","中止・延期になった"],["other","その他"]].map(([k, l], i) => `<label><input type="radio" name="rk" value="${k}"${i === 0 ? " checked" : ""}> ${l}</label>`).join("")}</div>
        <textarea maxlength="400" placeholder="正しい情報や、わかった場所（公式のお知らせのURLなど）があれば書いてください"></textarea>
        <button class="btn" type="submit">報告する</button><span class="drepmsg" role="status"></span>
      </form>
    </details>
    <script>document.querySelector(".drepf").addEventListener("submit",async function(e){e.preventDefault();var f=this,m=f.querySelector(".drepmsg"),b=f.querySelector("button");b.disabled=true;try{var r=await fetch("/api/report",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({itemId:f.dataset.id,title:f.dataset.t,kind:(f.querySelector("input:checked")||{}).value||"other",text:f.querySelector("textarea").value.trim().slice(0,400)})});if(!r.ok)throw 0;f.reset();m.textContent="報告ありがとうございます。確認して直します";}catch(err){b.disabled=false;m.textContent="送れませんでした。時間をおいてもう一度お試しください";}});</script>
    ${(() => { const Lg = (Array.isArray(it.log) ? it.log : []).filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(x.d || "") && typeof x.t === "string" && x.t.trim()).sort((p, q) => q.d.localeCompare(p.d)).slice(0, 3); return Lg.length ? `<section class="logbox"><h2 class="logh">更新の記録</h2><ul>${Lg.map(x => `<li><time datetime="${esc(x.d)}">${esc(fmt(x.d))}</time> ${esc(x.t)}</li>`).join("")}</ul></section>` : ""; })()}
    <p class="credit">掲載情報の更新日：${esc(it.updatedAt || it.addedAt || "")}。発売日や会期は変わることがあります。お出かけ・購入の前に公式情報をご確認ください。</p>
  </main>
  <p style="margin:18px 0"><a class="btn" href="/">ちいかわのスケジュールを一覧で見る</a></p>
  <p class="slrel"><span>まとめて見る</span><a href="/month/${monthOf(it)}/">${Number(it.s.slice(0, 4))}年${Number(it.s.slice(5, 7))}月の新商品・イベント</a>${areasOf(it).map(a => `<a href="/area/${a.slug}/">${esc(a.name)}のPOP UP・イベント</a>`).join("")}</p>
  ${related.length ? `<h2 class="wk">ほかの${esc(CAT[it.cat] || "")}</h2><ul class="alllinks" style="margin-top:8px">${related.map(x => `<li><a href="/items/${encodeURIComponent(x.id)}/">${esc(x.t)}</a></li>`).join("")}</ul>` : ""}
  ${FOOT}
</div>`;
  write(`items/${it.id}/index.html`, page({ title, desc, url, body, ogType: "article", ogImage: hasOg ? `/og/${encodeURIComponent(it.id)}.png` : "/og/home.png", head: (ld ? `<script type="application/ld+json">${JSON.stringify(ld)}</script>` : "") + `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [["ちい活ノート", "/"], [`${Number(it.s.slice(0, 4))}年${Number(it.s.slice(5, 7))}月のまとめ`, `/month/${monthOf(it)}/`], [it.t, url]].map(([name, u], i) => ({ "@type": "ListItem", position: i + 1, name, item: SITE + u })) })}</script>` }));
}

// ---- 運営者について・プライバシーポリシー
const doc = (t, inner) => `<div class="wrap">${BRAND}<main class="doc"><h1>${t}</h1>${inner}</main>${FOOT}</div>`;
write("about/index.html", page({
  title: "運営者について｜ちい活ノート", desc: "ちい活ノートの運営方針と情報の集め方について。", url: "/about/",
  body: doc("運営者について", `<p>ちい活ノートは、ちいかわが大好きな個人が運営している非公式のスケジュール帳です。グッズの発売日やイベントの会期を、買い逃し・行き逃しがないようにひとつの場所で見られることを目指しています。</p>
<h2>情報の集め方</h2><p>ちいかわ公式サイト・公式SNS、各社のプレスリリース、会場の公式発表をもとに、毎日AIを使って情報を集めて掲載しています。まちがいを見つけた方は、各情報の「情報のまちがいを報告する」から、載っていない情報を見つけた方は一覧の「＋ 情報を教える」から教えてください。公式の発表で確かめて直したり載せたりします。</p>
<h2>運営者のX</h2><p><a href="https://x.com/ishi_chiikatsu" target="_blank" rel="noopener me">@ishi_chiikatsu</a>（いし｜ちい活はじめました）。ちい活ノートを作った本人のアカウントです。サイトの更新や、ちいかわの好きなところをつぶやいています。</p>
<h2>連絡先</h2><p><a href="mailto:contact@chiikatsunote.com">contact@chiikatsunote.com</a>（<a href="/contact/">お問い合わせフォーム</a>からも送れます）</p>
<h2>広告について</h2><p>当サイトは楽天アフィリエイトと、もしもアフィリエイト（Yahoo!ショッピングなど）を利用しています。「PR」と表示したリンクから商品の購入や宿泊の予約があると、運営者に紹介料が支払われます。紹介料によって掲載内容や順番を変えることはありません。</p>
<h2>権利について</h2><p>「ちいかわ」に関する著作権・商標権はナガノ氏および権利者に帰属します。当サイトは権利者とは関係がなく、キャラクターの画像やイラストを当サイトに保存・掲載することはしていません。商品画像は楽天ウェブサービスを通じて、公式の画像は「公式の画像を見る」を押したときにX（旧Twitter）の埋め込み機能で公式アカウントの投稿をそのまま表示しています。</p>`),
}));
write("official/index.html", page({
  title: "ちいかわ公式サイト・公式アカウントのリンク集｜ちい活ノート",
  desc: "ちいかわの公式サイト・公式アカウントのまとめ。作者ナガノさん、アニメ・映画の公式サイト、ちいかわインフォ、ちいかわマーケット、ちいかわベーカリー、ちいかわぽけっとなど。",
  url: "/official/",
  body: doc("公式サイト・公式アカウント", `<p>『ちいかわ』に関する公式のサイトとアカウントをまとめました。発売日や会期の最新情報、購入の方法は、こちらの公式の発表をご確認ください。</p>${officialHtml}<p class="credit">リンク先はすべて公式のページです（ちい活ノートとは関係ありません）。リンクの誤りに気づいたら、トップページ下の「サイトへのご意見」から教えてください。</p>`),
}));
write("owner/index.html", fs.readFileSync("src/owner.html", "utf8"));   // 運営者メニュー（検索に出さない・サイトマップに入れない）
write("contact/index.html", page({
  title: "お問い合わせ｜ちい活ノート", desc: "ちい活ノートへのお問い合わせ・ご意見・情報提供はこちらから。", url: "/contact/",
  body: doc("お問い合わせ", `<p>ちい活ノートへのご意見・不具合のお知らせ・情報の提供・企業やメディアの方からのご連絡は、こちらのフォームからお送りください。運営者が確認します。メールの場合は <a href="mailto:contact@chiikatsunote.com">contact@chiikatsunote.com</a> へどうぞ。</p>
<p class="credit">掲載情報のまちがいは、各情報のページにある「情報のまちがいを報告する」からも送れます（そちらのほうが早く直せます）。ちいかわの商品やイベントについてのお問い合わせは、それぞれの公式窓口へお願いします。</p>
<form class="cform" id="cform">
<label>お問い合わせの種類<select name="kind"><option value="site">サイトへのご意見・不具合</option><option value="info">情報の提供・掲載のお願い</option><option value="biz">企業・メディアの方</option><option value="other">その他</option></select></label>
<label>お名前（ニックネームでも大丈夫です・なくても可）<input name="name" maxlength="50" autocomplete="nickname"></label>
<label>返信先のメールアドレス（返信が必要な方だけ）<input name="email" type="email" maxlength="120" autocomplete="email" inputmode="email"></label>
<label>お問い合わせ内容（必須）<textarea name="text" rows="7" maxlength="2000" required></textarea></label>
<input name="hp" tabindex="-1" autocomplete="off" aria-hidden="true" class="hp">
<button class="btn cbtn" type="submit">送信する</button>
<p class="cmsg" id="cmsg" role="status"></p>
</form>
<p class="credit">送っていただいた内容は、お返事と、サイトをよくするためだけに使い、180日たつと自動で消えます。運営者が読むため、同じ内容を運営者のメールにも転送します。くわしくは<a href="/privacy/">プライバシーポリシー</a>をご覧ください。</p>
<script>document.getElementById("cform").addEventListener("submit",async function(e){e.preventDefault();var f=this,m=document.getElementById("cmsg"),b=f.querySelector("button");b.disabled=true;m.textContent="送信中…";try{var r=await fetch("/api/contact",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind:f.kind.value,name:f.name.value,email:f.email.value,text:f.text.value,hp:f.hp.value})});var j=await r.json();if(!j.ok)throw new Error(j.reason||"");f.reset();m.textContent="送信しました。お問い合わせありがとうございます。";}catch(err){m.textContent=(err&&err.message)||"送れませんでした。時間をおいてもう一度お試しください";}b.disabled=false;});</script>`),
}));
write("privacy/index.html", page({
  title: "プライバシーポリシー｜ちい活ノート", desc: "ちい活ノートのプライバシーポリシー。", url: "/privacy/",
  body: doc("プライバシーポリシー", `<h2>集める情報</h2><p>当サイトは会員登録の仕組みを持たず、氏名やメールアドレスなどの個人情報を集めていません。マイリストと推しカラーの設定は、閲覧している端末のブラウザ（ローカルストレージ）にだけ保存され、運営者には送られません。</p><h2>通知について</h2><p>「通知を受け取る」を選んだ方の、通知を届けるための宛先（ブラウザが発行する文字列）と「ほしい」に入れた予定のIDだけを保存し、発売前日・当日のお知らせにのみ使います。マイリストの「通知をやめる」でいつでも削除できます。</p><h2>アクセスの集計</h2><p>サイトをよりよくするため、ページの表示回数や、タブ・リンクが押された回数を日ごとの合計として集計しています。Cookieは使わず、IPアドレスなど個人を特定できる情報は保存していません。同じ訪問の中で「詳細を見た」「購入先を押した」などの流れを数えるため、ブラウザの中（タブを閉じると消える領域）に一時的な印を置きますが、送るのは日ごとの合計に足す回数だけです。運営者や確認に協力いただく方の端末は「テストモード」にでき、その印はその端末のブラウザの中にだけ保存されます。また、Cloudflare社の「Cloudflare Web Analytics」で、訪問数や表示の速さを集計しています。こちらもCookieを使わず、個人を特定する情報は集めません。</p>
<h2>Xの投稿の表示について</h2><p>「公式の画像を見る」を押したときだけ、X（旧Twitter）の埋め込み機能で公式アカウントの投稿を表示します。そのとき、閲覧情報がX社に送られることがあります（X社のプライバシーポリシーが適用されます）。押さなければXには何も送られません。トラッキングを控える設定（DNT）で読み込んでいます。</p><h2>お問い合わせについて</h2><p>お問い合わせ先：<a href="mailto:contact@chiikatsunote.com">contact@chiikatsunote.com</a>（またはお問い合わせフォーム）。お問い合わせフォームから送られた内容（種類・お名前・メールアドレス・本文）は、お返事とサイトの改善のためだけに使い、第三者に渡すことはありません。180日たつと自動で消えます。送りすぎを防ぐため、IPアドレスから作った一時的な値を1日だけ使いますが、IPアドレスそのものは保存しません。</p><h2>まちがい報告・情報の提供</h2><p>「情報のまちがいを報告する」と「情報を教える」から送られた内容（選んだ項目、入力した文章とURL）は、掲載情報を直したり、新しい情報を確かめて載せたりするためだけに使い、90日たつと自動で消えます。送られた情報は、公式の発表で確かめられたものだけを掲載します。個人を特定できる情報は書き込まないでください。</p>
<h2>アフィリエイトについて</h2><p>当サイトは楽天グループ株式会社の「楽天アフィリエイト」と、株式会社もしもの「もしもアフィリエイト」（Yahoo!ショッピングなど）に参加しています。リンク先の楽天のサービスでは、楽天のプライバシーポリシーに基づいてCookieなどが使われることがあります。</p>
<h2>アクセス解析・広告配信について</h2><p>今後、アクセス解析ツールや第三者配信の広告（Google AdSense など）を導入する場合は、Cookieを使って閲覧情報を集めることがあります。導入する際はこのページでお知らせします。</p>
<h2>免責事項</h2><p>掲載情報は正確になるよう努めていますが、発売日や会期は変更されることがあります。掲載内容によって生じた損害について、運営者は責任を負いません。最新の情報は必ず公式の発表をご確認ください。</p>
<p class="credit">制定日：2026年10月3日</p>`),
}));
write("offline/index.html", page({ title: "電波がつながっていません｜ちい活ノート", desc: "", url: "/offline/", body: doc("電波がつながっていません", `<p>インターネットにつながると、最新のスケジュールが表示されます。電波のよいところで開き直してください。</p><p><a class="btn" href="/">もう一度開く</a></p>`) }).replace("<head>", '<head>\n<meta name="robots" content="noindex">'));
write("404.html", page({ title: "ページが見つかりません｜ちい活ノート", desc: "", url: "/404", body: doc("ページが見つかりません", `<p>お探しのページは移動したか、掲載を終えた可能性があります。</p><p><a class="btn" href="/">トップへ戻る</a></p>`) }));

// ---- 検索エンジン向け
// ---- 検索から来る人のためのまとめページ（月別・地域別）
const seo = buildSeo({ items, page, write, esc, fmt, md, CAT, REG, BRAND, FOOT, SITE, TODAY, isEvent, aff, sjisEncode, rakutenSearch, writeOg });
const urls = ["/", ...seo.urls, "/official/", "/about/", "/contact/", "/privacy/", ...items.map(it => `/items/${encodeURIComponent(it.id)}/`)];
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${SITE}${u}</loc><lastmod>${TODAY}</lastmod></url>`).join("\n")}\n</urlset>\n`);
// Functions（サーバー側の処理）を通すURLを絞る。画像・スクリプトなどの静的ファイルは Functions を通さず配信（無料枠を使わない）。
// ページ本体（HTML）と /api/ は今までどおり通す（.pages.dev・www からの転送と API のため）。
write("_routes.json", JSON.stringify({ version: 1, include: ["/*"], exclude: ["/og/*", "/icons/*", "/app.js", "/install.js", "/onboard.js", "/style.css", "/sw.js", "/manifest.webmanifest", "/camps.json", "/push-items.json", "/visuals.json", "/robots.txt", "/sitemap.xml"] }, null, 1));
write("robots.txt", `User-agent: *\nAllow: /\nDisallow: /owner/\nSitemap: ${SITE}/sitemap.xml\n`);

console.log(`built ${items.length} items → ${OUT}/`);
