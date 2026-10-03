// ちい活ノート：サイトを組み立てるスクリプト
// Cloudflare Pages のビルドコマンド `node build.mjs` で実行され、dist/ に公開用ファイルを書き出す。
import fs from "node:fs";
import path from "node:path";

const SITE = "https://chiikatsu-note.pages.dev";
const AFF = "582a6f7f.e1ade2b2.582a6f84.d5f85faa";
const OUT = "dist";
const TODAY = new Date().toISOString().slice(0, 10);

const items = JSON.parse(fs.readFileSync("data/items.json", "utf8")).filter(x => !x.hidden);
const css = fs.readFileSync("src/style.css", "utf8");
const app = fs.readFileSync("src/app.js", "utf8");
let homeBody = fs.readFileSync("src/home-body.html", "utf8");
const installJs = fs.readFileSync("src/install.js", "utf8");
const swJs = fs.readFileSync("src/sw.js", "utf8");
const BUILD = Date.now().toString(36);

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const CAT = { goods: "グッズ", food: "お菓子・食品", kuji: "くじ", event: "イベント", cafe: "カフェ・お店", book: "本・カレンダー" };
const REG = { jp: "日本", tw: "台湾", kr: "韓国", hk: "香港", cn: "中国" };
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
const aff = u => `https://hb.afl.rakuten.co.jp/hgc/${AFF}/?pc=${encodeURIComponent(u)}`;
const rakutenSearch = q => aff("https://search.rakuten.co.jp/search/mall/" + encodeURIComponent(q) + "/");
const travel = a => aff("https://kw.travel.rakuten.co.jp/keyword/Search.do?f_query=" + sjisEncode(a));

const BRAND = `<header class="top">
    <a class="brand" href="/" style="text-decoration:none;color:inherit">
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><rect x="3" y="7" width="34" height="30" rx="11" fill="var(--acc-soft)"/><rect x="3" y="7" width="34" height="11" rx="5.5" fill="var(--acc)"/><rect x="11" y="3" width="4" height="9" rx="2" fill="var(--ink)"/><rect x="25" y="3" width="4" height="9" rx="2" fill="var(--ink)"/><circle cx="14" cy="26" r="2.2" fill="var(--ink)"/><circle cx="26" cy="26" r="2.2" fill="var(--ink)"/><path d="M18 30.5q2 1.8 4 0" stroke="var(--ink)" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>
      <div><p style="font-family:var(--display);font-weight:900;font-size:22px;margin:0;line-height:1.1">ちい活ノート</p><p>ちいかわグッズとイベントのスケジュール帳（非公式）</p></div>
    </a>
  </header>`;
const ICO = `<img src="/icons/icon-192.png" alt="" width="48" height="48" class="appicon">`;
const INSTALL_CARD = `<div class="ins-card" data-ins-card>${ICO}<div class="ins-txt"><b>ホーム画面に追加して、アプリのように使う</b><span>アイコンをタップするだけで、すぐにスケジュールを確認できます。無料・登録なし。</span></div><button type="button" class="ins-cta" data-install>追加のしかたを見る</button></div>`;
const INSTALL_TOP = `<div class="ins-card ins-top" data-ins-card>${ICO}<div class="ins-txt"><b>ホーム画面に追加しておくと便利です</b><span>アプリのようにワンタップで開けます</span></div><button type="button" class="ins-cta" data-install>追加する</button><button type="button" class="ins-x" data-ins-hide aria-label="この案内を閉じる">×</button></div>`;
const INSTALL_MINE = `<div class="ins-card ins-mine" data-ins-card>${ICO}<div class="ins-txt"><b>マイリストをすぐ見られるように</b><span>ホーム画面に追加すると、アイコンからワンタップで開けます</span></div><button type="button" class="ins-cta" data-install>追加する</button></div>`;
const FOOT = `<footer class="about">
    ${INSTALL_CARD}
    <div class="sitelinks"><a href="/">トップ</a><a href="/about/">運営者について</a><a href="/privacy/">プライバシーポリシー</a></div>
    <p class="credit"><a href="https://webservice.rakuten.co.jp/" target="_blank" rel="noopener">Supported by Rakuten Developers</a></p>
    <p>©nagano / chiikawa committee　本サイトは権利者とは関係のない個人運営のサイトです。</p>
  </footer>`;
// 推しカラーを詳細ページにも反映する小さな処理
const OSHI_BOOT = `<script>try{var ic=JSON.parse(localStorage.getItem("chiikatsu-install")||"{}")||{};if(ic.topOff)document.documentElement.classList.add("ins-off");if(ic.installed||(window.matchMedia&&matchMedia("(display-mode: standalone)").matches)||navigator.standalone)document.documentElement.classList.add("is-app")}catch(e){}</script><script>try{var k=localStorage.getItem("chiikatsu-oshi");if(k)document.documentElement.dataset.oshi=k;else document.documentElement.dataset.oshi="chiikawa"}catch(e){document.documentElement.dataset.oshi="chiikawa"}</script>`;

function page({ title, desc, url, body, head = "", scripts = "", ogType = "website" }) {
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
<meta name="twitter:card" content="summary">
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
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@500;700;900&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap">
<link rel="stylesheet" href="/style.css?v=${TODAY}">
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
write("app.js", app);
write("install.js", installJs);
write("sw.js", swJs.replace("__VER__", BUILD));
fs.mkdirSync(path.join(OUT, "icons"), { recursive: true });
for (const f of fs.readdirSync("src/icons")) fs.copyFileSync(path.join("src/icons", f), path.join(OUT, "icons", f));
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
    { name: "まもなく終了", url: "/?v=ending", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    { name: "カレンダー", url: "/?v=cal", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    { name: "マイリスト", url: "/?v=mine", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
  ],
}, null, 2));

// ---- トップページ
const sorted = items.slice().sort((a, b) => a.s.localeCompare(b.s));
const allLinks = `<details><summary class="credit" style="cursor:pointer">掲載中のすべての情報（${sorted.length}件）</summary><ul class="alllinks">${sorted.map(it => `<li><a href="/items/${encodeURIComponent(it.id)}/">${esc(it.t)}</a></li>`).join("")}</ul></details>`;
homeBody = homeBody.replace("{{INSTALL_CARD}}", INSTALL_CARD).replace("{{INSTALL_TOP}}", INSTALL_TOP).replace("{{INSTALL_MINE}}", INSTALL_MINE).replace("{{ALL_LINKS}}", allLinks).replace("<h1>ちい活ノート</h1>", "<h1>ちい活ノート</h1>");
const homeLd = { "@context": "https://schema.org", "@type": "WebSite", name: "ちい活ノート", url: SITE + "/", inLanguage: "ja" };
write("index.html", page({
  title: "ちい活ノート｜ちいかわグッズの発売日・イベント日程カレンダー",
  desc: "ちいかわの新商品の発売日、POP UP STOREやコラボカフェの開催期間、海外のちいかわイベントをまとめた非公式スケジュール帳。まもなく終わるものや今週発売のグッズがひと目でわかります。",
  url: "/",
  head: `<script type="application/ld+json">${JSON.stringify(homeLd)}</script>`,
  body: homeBody,
  scripts: `<script>window.__ITEMS=${JSON.stringify(items).replace(/</g, "\\u003c")};</script>\n<script src="/app.js?v=${TODAY}"></script>`,
}));

// ---- 項目ごとのページ（検索から来た人の入口）
for (const it of items) {
  const reg = REG[it.region] || "日本";
  const ev = isEvent(it);
  const start = fmt(it.s, it.sp);
  const end = it.e ? fmt(it.e) : "";
  const when = end ? `${start}〜${end}` : `${start}${ev ? "から" : "発売"}`;
  const title = `${it.t}｜${ev ? "開催期間・場所" : "発売日・販売場所"}【ちい活ノート】`;
  const desc = `${it.t}は${when}。${it.place ? "場所：" + it.place + "。" : ""}${it.price ? "価格：" + it.price + "。" : ""}${it.note || ""}`.slice(0, 150);
  const url = `/items/${encodeURIComponent(it.id)}/`;
  const ld = ev && it.sp === "day" ? {
    "@context": "https://schema.org", "@type": "Event", name: it.t, startDate: it.s, endDate: it.e || it.s,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode", eventStatus: "https://schema.org/EventScheduled",
    location: { "@type": "Place", name: it.place || reg, address: it.place || reg }, description: desc, url: SITE + url,
  } : null;
  const related = sorted.filter(x => x.id !== it.id && (x.region || "jp") === (it.region || "jp") && x.cat === it.cat).slice(-6);
  const body = `<div class="wrap">
  ${BRAND}
  <p class="crumb"><a href="/">ちい活ノート</a> › ${esc(CAT[it.cat] || "")}${reg !== "日本" ? "（" + reg + "）" : ""}</p>
  <main class="detail">
    <div class="meta"><span class="pill rg">${esc(reg)}</span><span class="cat">${esc(CAT[it.cat] || "")}</span></div>
    <h1>${esc(it.t)}</h1>
    <dl class="info">
      <dt>${ev ? "開始" : "発売"}</dt><dd>${esc(start)}${it.time ? " " + esc(it.time) : ""}</dd>
      ${end ? `<dt>終了</dt><dd>${esc(end)}</dd>` : `<dt>終了</dt><dd>${esc(it.eNote || (ev ? "未定" : "なくなり次第終了"))}</dd>`}
      ${it.place ? `<dt>場所</dt><dd>${esc(it.place)}</dd>` : ""}
      ${it.price ? `<dt>価格</dt><dd>${esc(it.price)}${(it.region || "jp") === "jp" ? "（税込）" : ""}</dd>` : ""}
      ${it.note ? `<dt>メモ</dt><dd>${esc(it.note)}</dd>` : ""}
    </dl>
    <div class="acts">
      ${it.q ? `<a class="btn buy" href="${esc(rakutenSearch(it.q))}" target="_blank" rel="noopener sponsored">楽天市場で探す <span class="tag">PR</span></a>` : ""}
      ${/^https:\/\//.test(it.src || "") ? `<a class="btn" href="${esc(it.src)}" target="_blank" rel="noopener">公式情報</a>` : ""}
    </div>
    ${it.area ? `<a class="trip" href="${esc(travel(it.area))}" target="_blank" rel="noopener sponsored"><span class="trip-k">遠征するなら</span><span class="trip-t">${esc(it.area)}周辺のホテルを探す（楽天トラベル）</span><span class="tag">PR</span></a>` : ""}
    <p class="credit">掲載情報の更新日：${esc(it.updatedAt || it.addedAt || "")}。発売日や会期は変わることがあります。お出かけ・購入の前に公式情報をご確認ください。</p>
  </main>
  <p style="margin:18px 0"><a class="btn" href="/">ちいかわのスケジュールを一覧で見る</a></p>
  ${related.length ? `<h2 class="wk">ほかの${esc(CAT[it.cat] || "")}</h2><ul class="alllinks" style="margin-top:8px">${related.map(x => `<li><a href="/items/${encodeURIComponent(x.id)}/">${esc(x.t)}</a></li>`).join("")}</ul>` : ""}
  ${FOOT}
</div>`;
  write(`items/${it.id}/index.html`, page({ title, desc, url, body, ogType: "article", head: ld ? `<script type="application/ld+json">${JSON.stringify(ld)}</script>` : "" }));
}

// ---- 運営者について・プライバシーポリシー
const doc = (t, inner) => `<div class="wrap">${BRAND}<main class="doc"><h1>${t}</h1>${inner}</main>${FOOT}</div>`;
write("about/index.html", page({
  title: "運営者について｜ちい活ノート", desc: "ちい活ノートの運営方針と情報の集め方について。", url: "/about/",
  body: doc("運営者について", `<p>ちい活ノートは、ちいかわが大好きな個人が運営している非公式のスケジュール帳です。グッズの発売日やイベントの会期を、買い逃し・行き逃しがないようにひとつの場所で見られることを目指しています。</p>
<h2>情報の集め方</h2><p>ちいかわ公式サイト・公式SNS、各社のプレスリリース、会場の公式発表をもとに、毎日AIを使って情報を集めて掲載しています。まちがいを見つけた方は、各情報の「情報のまちがいを報告する」から教えてください。確認して直します。</p>
<h2>広告について</h2><p>当サイトは楽天アフィリエイトを利用しています。「PR」と表示したリンクから商品の購入や宿泊の予約があると、運営者に紹介料が支払われます。紹介料によって掲載内容や順番を変えることはありません。</p>
<h2>権利について</h2><p>「ちいかわ」に関する著作権・商標権はナガノ氏および権利者に帰属します。当サイトは権利者とは関係がなく、キャラクターの画像やイラストは掲載していません。商品画像は楽天ウェブサービスを通じて表示しています。</p>`),
}));
write("privacy/index.html", page({
  title: "プライバシーポリシー｜ちい活ノート", desc: "ちい活ノートのプライバシーポリシー。", url: "/privacy/",
  body: doc("プライバシーポリシー", `<h2>集める情報</h2><p>当サイトは会員登録の仕組みを持たず、氏名やメールアドレスなどの個人情報を集めていません。マイリストと推しカラーの設定は、閲覧している端末のブラウザ（ローカルストレージ）にだけ保存され、運営者には送られません。</p>
<h2>まちがい報告</h2><p>「情報のまちがいを報告する」から送られた内容（選んだ項目と入力した文章）は、掲載情報を直すためだけに使います。個人を特定できる情報は書き込まないでください。</p>
<h2>アフィリエイトについて</h2><p>当サイトは楽天グループ株式会社の「楽天アフィリエイト」に参加しています。リンク先の楽天のサービスでは、楽天のプライバシーポリシーに基づいてCookieなどが使われることがあります。</p>
<h2>アクセス解析・広告配信について</h2><p>今後、アクセス解析ツールや第三者配信の広告（Google AdSense など）を導入する場合は、Cookieを使って閲覧情報を集めることがあります。導入する際はこのページでお知らせします。</p>
<h2>免責事項</h2><p>掲載情報は正確になるよう努めていますが、発売日や会期は変更されることがあります。掲載内容によって生じた損害について、運営者は責任を負いません。最新の情報は必ず公式の発表をご確認ください。</p>
<p class="credit">制定日：2026年10月3日</p>`),
}));
write("offline/index.html", page({ title: "電波がつながっていません｜ちい活ノート", desc: "", url: "/offline/", body: doc("電波がつながっていません", `<p>インターネットにつながると、最新のスケジュールが表示されます。電波のよいところで開き直してください。</p><p><a class="btn" href="/">もう一度開く</a></p>`) }).replace("<head>", '<head>\n<meta name="robots" content="noindex">'));
write("404.html", page({ title: "ページが見つかりません｜ちい活ノート", desc: "", url: "/404", body: doc("ページが見つかりません", `<p>お探しのページは移動したか、掲載を終えた可能性があります。</p><p><a class="btn" href="/">トップへ戻る</a></p>`) }));

// ---- 検索エンジン向け
const urls = ["/", "/about/", "/privacy/", ...items.map(it => `/items/${encodeURIComponent(it.id)}/`)];
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${SITE}${u}</loc><lastmod>${TODAY}</lastmod></url>`).join("\n")}\n</urlset>\n`);
write("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);

console.log(`built ${items.length} items → ${OUT}/`);
