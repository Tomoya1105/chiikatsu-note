// 検索から来る人のためのまとめページ（月別・地域別）を作る。build.mjs から使う。
// ・/month/2026-10/ … その月に発売・開始するもの＋その月に開催中のイベント
// ・/area/tokyo/ など … 都道府県（海外は国・地域）ごとの POP UP・イベント・カフェ
// データ（items.json）から毎回自動で作り直すので、自動更新で情報が増えるとページも育っていく。

const PREFS = [
  ["hokkaido", "北海道", "北海道・東北"], ["aomori", "青森", "北海道・東北"], ["iwate", "岩手", "北海道・東北"], ["miyagi", "宮城", "北海道・東北"], ["akita", "秋田", "北海道・東北"], ["yamagata", "山形", "北海道・東北"], ["fukushima", "福島", "北海道・東北"],
  ["ibaraki", "茨城", "関東"], ["tochigi", "栃木", "関東"], ["gunma", "群馬", "関東"], ["saitama", "埼玉", "関東"], ["chiba", "千葉", "関東"], ["tokyo", "東京", "関東"], ["kanagawa", "神奈川", "関東"],
  ["niigata", "新潟", "中部"], ["toyama", "富山", "中部"], ["ishikawa", "石川", "中部"], ["fukui", "福井", "中部"], ["yamanashi", "山梨", "中部"], ["nagano", "長野", "中部"], ["gifu", "岐阜", "中部"], ["shizuoka", "静岡", "中部"], ["aichi", "愛知", "中部"],
  ["mie", "三重", "近畿"], ["shiga", "滋賀", "近畿"], ["kyoto", "京都", "近畿"], ["osaka", "大阪", "近畿"], ["hyogo", "兵庫", "近畿"], ["nara", "奈良", "近畿"], ["wakayama", "和歌山", "近畿"],
  ["tottori", "鳥取", "中国・四国"], ["shimane", "島根", "中国・四国"], ["okayama", "岡山", "中国・四国"], ["hiroshima", "広島", "中国・四国"], ["yamaguchi", "山口", "中国・四国"], ["tokushima", "徳島", "中国・四国"], ["kagawa", "香川", "中国・四国"], ["ehime", "愛媛", "中国・四国"], ["kochi", "高知", "中国・四国"],
  ["fukuoka", "福岡", "九州・沖縄"], ["saga", "佐賀", "九州・沖縄"], ["nagasaki", "長崎", "九州・沖縄"], ["kumamoto", "熊本", "九州・沖縄"], ["oita", "大分", "九州・沖縄"], ["miyazaki", "宮崎", "九州・沖縄"], ["kagoshima", "鹿児島", "九州・沖縄"], ["okinawa", "沖縄", "九州・沖縄"],
];
const FULL = { "北海道": "北海道", "東京": "東京都", "大阪": "大阪府", "京都": "京都府" };
const prefFull = n => FULL[n] || n + "県";
// 都道府県名が書かれていないときの手がかり（駅・街の名前）
const CITY = [
  [/池袋|渋谷|原宿|新宿|銀座|表参道|東京駅|TOKYO|丸の内|秋葉原|吉祥寺|立川|町田|お台場|ソラマチ|スカイツリー|押上|羽田|八王子|二子玉川|有楽町|日本橋|上野|浅草/, "東京"],
  [/梅田|難波|なんば|心斎橋|天王寺|OSAKA|泉ヶ丘|あべの/, "大阪"],
  [/名古屋/, "愛知"], [/博多|天神/, "福岡"], [/札幌/, "北海道"], [/仙台/, "宮城"],
  [/横浜|川崎|みなとみらい/, "神奈川"], [/那覇|NAHA/, "沖縄"], [/神戸|三宮/, "兵庫"],
];
const OVERSEAS = { tw: ["taiwan", "台湾"], kr: ["korea", "韓国"], hk: ["hongkong", "香港"], cn: ["china", "中国"], th: ["thailand", "タイ"], sg: ["singapore", "シンガポール"], my: ["malaysia", "マレーシア"], us: ["usa", "アメリカ"] };

// 1件の情報が、どの地域のページに入るか（複数あり）
export function areasOf(it) {
  const r = it.region || "jp";
  if (r !== "jp") return OVERSEAS[r] ? [{ slug: OVERSEAS[r][0], name: OVERSEAS[r][1] }] : [];
  let hay = `${it.place || ""} ${it.area || ""}`;
  const found = new Set();
  if (/東京都/.test(hay)) { found.add("東京"); hay = hay.replace(/東京都/g, ""); }
  for (const [, n] of PREFS) if (n !== "京都" ? hay.includes(n) : /(^|[^東])京都/.test(hay)) found.add(n);
  for (const [re, n] of CITY) if (re.test(hay)) found.add(n);
  return PREFS.filter(p => found.has(p[1])).map(([slug, n]) => ({ slug, name: n }));
}
export const monthOf = it => it.s.slice(0, 7);

export function buildSeo(ctx) {
  const { items, page, write, esc, fmt, md, CAT, REG, BRAND, FOOT, SITE, TODAY, isEvent, aff, sjisEncode, rakutenSearch, writeOg } = ctx;
  // まとめページ用の共有画像（キャラクターは使わず、文字だけ）。作れなかったときはトップの画像
  const og = (name, opt) => (writeOg && writeOg(name, opt)) ? `/og/${name}.png` : "/og/home.png";
  const urls = [];
  const live = items.filter(x => !x.hidden).sort((a, b) => a.s.localeCompare(b.s) || a.t.localeCompare(b.t));
  const endOf = it => it.e || (isEvent(it) ? it.s : null);
  const statusOf = it => {
    if (it.s > TODAY) return ["soon", "これから"];
    const e = endOf(it);
    if (e && e < TODAY) return ["end", "終了"];
    return ["now", isEvent(it) ? "開催中" : "発売中"];
  };
  const when = it => {
    const s = it.sp && it.sp !== "day" ? fmt(it.s, it.sp).replace(/^\d+年/, "") : md(it.s);
    return it.e ? `${s}〜${md(it.e)}` : s;
  };
  const row = (it, { buy = false } = {}) => {
    const [k, label] = statusOf(it);
    const sub = [it.place, it.price, it.eNote].filter(Boolean).map(esc).join("　");
    const pr = buy && it.q && k !== "end" ? `<a class="slbuy" href="${esc(rakutenSearch(it.q))}" target="_blank" rel="noopener sponsored">楽天で探す<span class="tag">PR</span></a>` : "";
    return `<li class="sl"><a class="slmain" href="/items/${encodeURIComponent(it.id)}/"><span class="slw">${esc(when(it))}</span><span class="slt">${esc(it.t)}</span></a><span class="sls s-${k}">${label}</span>${sub ? `<span class="slm">${sub}</span>` : ""}${pr}</li>`;
  };
  const list = (arr, opt) => arr.length ? `<ul class="sllist">${arr.map(x => row(x, opt)).join("")}</ul>` : "";
  const crumbs = (trail) => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: trail.map(([name, url], i) => ({ "@type": "ListItem", position: i + 1, name, item: SITE + url })) })}</script>`;
  const itemList = (arr) => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "ItemList", itemListElement: arr.slice(0, 50).map((it, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/items/${encodeURIComponent(it.id)}/`, name: it.t })) })}</script>`;
  const crumbHtml = trail => `<p class="crumb">${trail.map(([n, u], i) => i < trail.length - 1 ? `<a href="${u}">${esc(n)}</a>` : esc(n)).join(" › ")}</p>`;
  const wrap = (trail, inner) => `<div class="wrap">${BRAND}${crumbHtml(trail)}<main class="doc seo">${inner}</main>${FOOT}</div>`;

  // ---------- 月別 ----------
  const months = [...new Set(live.map(monthOf))].sort();
  const ym = m => { const [y, mo] = m.split("-").map(Number); return { y, mo, label: `${y}年${mo}月` }; };
  const thisMonth = TODAY.slice(0, 7);
  const GROUPS = [
    ["予約・受注", it => !!it.rsv && !isEvent(it)],
    ["グッズ", it => it.cat === "goods" && !it.rsv], ["お菓子・食品", it => it.cat === "food"], ["くじ", it => it.cat === "kuji"],
    ["本・カレンダー", it => it.cat === "book"], ["POP UP・イベント", it => it.cat === "event"], ["カフェ・お店", it => it.cat === "cafe"],
  ];
  for (const m of months) {
    const { y, mo, label } = ym(m);
    const starts = live.filter(it => monthOf(it) === m);
    const jp = starts.filter(it => (it.region || "jp") === "jp"), os = starts.filter(it => (it.region || "jp") !== "jp");
    const first = `${m}-01`, last = `${m}-31`;
    const ongoing = live.filter(it => isEvent(it) && it.s < first && endOf(it) && endOf(it) >= first && (it.region || "jp") === "jp");
    const goodsN = jp.filter(it => !isEvent(it)).length, evN = jp.filter(isEvent).length;
    const i = months.indexOf(m), prev = months[i - 1], next = months[i + 1];
    const url = `/month/${m}/`;
    const trail = [["ちい活ノート", "/"], ["月別まとめ", "/month/"], [`${label}`, url]];
    const sections = GROUPS.map(([g, f]) => { const a = jp.filter(f); return a.length ? `<h2>${g}（${a.length}件）</h2>${list(a, { buy: !isEvent(a[0]) })}` : ""; }).join("");
    const body = wrap(trail, `<h1>${label}のちいかわ新商品・発売日・イベントまとめ</h1>
<p class="lead">${label}に発売・開始する『ちいかわ』のグッズ、食品、くじ、本と、POP UP STORE・コラボイベントの予定を日付順にまとめました。${goodsN || evN ? `日本では新商品${goodsN}件、イベント・お店${evN}件の予定があります。` : ""}${m >= thisMonth ? "新しい発表があり次第、毎日自動で追加します。" : ""}</p>
<p class="credit">発売日や会期は変わることがあります。購入・お出かけの前に、各ページの公式情報をご確認ください。</p>
${sections || `<p>この月に始まる予定は、まだありません。</p>`}
${ongoing.length ? `<h2>${mo}月も開催中のイベント・お店</h2>${list(ongoing)}` : ""}
${os.length ? `<h2>海外のちいかわ情報（${os.length}件）</h2>${list(os)}` : ""}
<nav class="slnav">${prev ? `<a class="btn" href="/month/${prev}/">← ${ym(prev).label}</a>` : "<span></span>"}<a class="btn" href="/month/">月別まとめ一覧</a>${next ? `<a class="btn" href="/month/${next}/">${ym(next).label} →</a>` : "<span></span>"}</nav>
<p><a href="/area/">地域別のPOP UP・イベント情報はこちら →</a></p>`);
    write(`month/${m}/index.html`, page({
      title: `${label}のちいかわ新商品・発売日・イベントまとめ｜ちい活ノート`,
      desc: `${label}に発売のちいかわグッズ・お菓子・くじ・本と、POP UP STORE・コラボイベントの日程を日付順にまとめました。${goodsN ? `新商品${goodsN}件` : ""}${evN ? `・イベント${evN}件` : ""}。毎日更新。`.slice(0, 140),
      url, body, head: crumbs(trail) + itemList(starts),
      ogImage: og(`month-${m}`, { label: "月別まとめ", title: `${label} ちいかわ発売・イベントカレンダー`, when: [goodsN ? `新商品${goodsN}件` : "", evN ? `イベント${evN}件` : ""].filter(Boolean).join("・") || "発売日とイベント日程", sub: "グッズ・お菓子・くじ・本・POP UP STOREの日程を日付順に", accent: "#E27496" }),
    }));
    urls.push(url);
  }
  {
    const trail = [["ちい活ノート", "/"], ["月別まとめ", "/month/"]];
    const byYear = {};
    for (const m of months) (byYear[m.slice(0, 4)] ||= []).push(m);
    const body = wrap(trail, `<h1>ちいかわ新商品・イベントの月別まとめ</h1><p class="lead">月ごとに、発売するグッズと開催されるイベントをまとめています。</p>
${Object.entries(byYear).reverse().map(([y, ms]) => `<h2>${y}年</h2><ul class="slmonths">${ms.slice().reverse().map(m => `<li><a href="/month/${m}/"${m === thisMonth ? ' class="cur"' : ""}>${ym(m).mo}月${m === thisMonth ? "（今月）" : ""}<small>${live.filter(it => monthOf(it) === m).length}件</small></a></li>`).join("")}</ul>`).join("")}`);
    write("month/index.html", page({ title: "ちいかわ新商品・イベントの月別まとめ｜ちい活ノート", desc: "ちいかわグッズの発売日とPOP UP STORE・イベントの日程を、月ごとにまとめた一覧です。", url: "/month/", body, head: crumbs(trail) }));
    urls.push("/month/");
  }

  // ---------- 地域別 ----------
  const byArea = new Map();
  for (const it of live) for (const a of areasOf(it)) { if (!byArea.has(a.slug)) byArea.set(a.slug, { ...a, items: [] }); byArea.get(a.slug).items.push(it); }
  const recentCut = (() => { const d = new Date(TODAY); d.setDate(d.getDate() - 45); return d.toISOString().slice(0, 10); })();
  const areaPages = [];
  for (const [slug, a] of byArea) {
    const isJp = PREFS.some(p => p[0] === slug);
    const now = a.items.filter(it => statusOf(it)[0] === "now"), soon = a.items.filter(it => statusOf(it)[0] === "soon");
    const ended = a.items.filter(it => statusOf(it)[0] === "end" && (endOf(it) || it.s) >= recentCut).reverse();
    const nm = isJp ? a.name : a.name, full = isJp ? prefFull(a.name) : a.name;
    const url = `/area/${slug}/`;
    const trail = [["ちい活ノート", "/"], ["地域別", "/area/"], [nm, url]];
    const hotel = isJp ? { url: aff("https://kw.travel.rakuten.co.jp/keyword/Search.do?f_query=" + sjisEncode(full)), label: `${full}のホテルを探す` } : null;
    const body = wrap(trail, `<h1>${esc(nm)}のちいかわPOP UP・イベント・カフェ情報</h1>
<p class="lead">${esc(full)}で開催中・開催予定の『ちいかわ』POP UP STORE、コラボカフェ、イベント、限定グッズをまとめました。${now.length ? `いま開催中は${now.length}件、` : ""}${soon.length ? `これから始まるものが${soon.length}件あります。` : "新しい予定は決まり次第、毎日自動で追加します。"}</p>
<p class="credit">会期・営業時間・入場方法（整理券など）は変わることがあります。お出かけ前に各ページの公式情報をご確認ください。</p>
${now.length ? `<h2>開催中・発売中（${now.length}件）</h2>${list(now)}` : ""}
${soon.length ? `<h2>これから（${soon.length}件）</h2>${list(soon)}` : ""}
${!now.length && !soon.length ? `<p>いま${esc(nm)}で予定されているものはありません。決まり次第追加します。</p>` : ""}
${hotel && (now.length || soon.length) ? `<a class="trip" href="${esc(hotel.url)}" target="_blank" rel="noopener sponsored"><span class="trip-k">遠征するなら</span><span class="trip-t">${esc(hotel.label)}（楽天トラベル）</span><span class="tag">PR</span></a>` : ""}
${ended.length ? `<h2>最近終わったもの</h2>${list(ended)}` : ""}
<p style="margin-top:18px"><a class="btn" href="/area/">ほかの地域を見る</a> <a class="btn" href="/month/${thisMonth}/">今月の新商品まとめ</a></p>`);
    write(`area/${slug}/index.html`, page({
      title: `${nm}のちいかわPOP UP・イベント・コラボカフェ情報（開催中・これから）｜ちい活ノート`,
      desc: `${full}で開催中・開催予定のちいかわPOP UP STORE、コラボカフェ、イベントの会期と場所をまとめました。${now.length + soon.length ? `現在${now.length + soon.length}件。` : ""}毎日更新。`.slice(0, 140),
      url, body, head: crumbs(trail) + itemList([...now, ...soon]),
      ogImage: og(`area-${slug}`, { label: isJp ? "地域別" : "海外", title: `${nm}のちいかわPOP UP・イベント情報`, when: now.length + soon.length ? [now.length ? `開催中${now.length}件` : "", soon.length ? `これから${soon.length}件` : ""].filter(Boolean).join("・") : "開催情報まとめ", sub: "POP UP STORE・コラボカフェ・イベントの会期と場所", accent: "#3E9C83" }),
    }));
    urls.push(url);
    areaPages.push({ slug, nm, isJp, group: isJp ? PREFS.find(p => p[0] === slug)[2] : "海外", n: now.length + soon.length });
  }
  {
    const trail = [["ちい活ノート", "/"], ["地域別", "/area/"]];
    const order = ["北海道・東北", "関東", "中部", "近畿", "中国・四国", "九州・沖縄", "海外"];
    const sortKey = p => p.isJp ? PREFS.findIndex(x => x[0] === p.slug) : 100;
    const body = wrap(trail, `<h1>地域別：ちいかわPOP UP・イベント・カフェ情報</h1><p class="lead">都道府県・国ごとに、開催中とこれからのPOP UP STORE・コラボカフェ・イベントをまとめています。（ ）の数字は開催中・予定の件数です。</p>
${order.map(g => { const ps = areaPages.filter(p => p.group === g).sort((a, b) => sortKey(a) - sortKey(b)); return ps.length ? `<h2>${g}</h2><ul class="slmonths">${ps.map(p => `<li><a href="/area/${p.slug}/">${esc(p.nm)}<small>${p.n}件</small></a></li>`).join("")}</ul>` : ""; }).join("")}`);
    write("area/index.html", page({ title: "地域別 ちいかわPOP UP・イベント・カフェ情報｜ちい活ノート", desc: "東京・大阪・名古屋・福岡など、都道府県ごと・海外の国ごとに、ちいかわPOP UP STOREとイベントの開催情報をまとめました。", url: "/area/", body, head: crumbs(trail) }));
    urls.push("/area/");
  }
  return { urls };
}
