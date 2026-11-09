import { chromium } from "playwright";
// M0（追加の計測）：詳細ページへの遷移の「回数」（lc:list・nw:item・nw:src・rel:go）は、タップのたびに数える（重複防止なし）。
// 「セッション数」（ls:list・ls:nw・ls:rel）は、1回の訪問で1回だけ。既存の項目（f:*・b:*・o:*・pv:* など）は変えない。
// 実行：node test/serve-hit.mjs dist を 8791 番で起動してから node test/m0.mjs（CHROME=… で Chrome の場所を指定できる）
const B = process.env.B || "http://localhost:8791";
const browser = await chromium.launch({ executablePath: process.env.CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const out = []; const ok = (n, c, x = "") => out.push(`${c ? "OK" : "NG"} ${n} ${x}`);
const got = async () => await (await fetch(B + "/api/_got")).json();
const sum = (bs, seg = "g") => { const s = {}; bs.filter(b => (b.t ? "t" : "g") === seg).forEach(b => Object.entries(b.ev).forEach(([k, v]) => s[k] = (s[k] || 0) + v)); return s; };
const hide = p => p.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); });
const c = await browser.newContext({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true });
const p = await c.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
// 別ページへ移らず、押した記録だけを見る（計測の処理は先に動く）
await p.addInitScript(() => { document.addEventListener("click", e => { const a = e.target.closest && e.target.closest("a[href]"); if (a) e.preventDefault(); }, false); });
await got();
await p.goto(B + "/"); await p.waitForTimeout(800);
await p.evaluate(() => { const o = document.querySelector(".ob"); if (o) o.remove(); });

// 1) 一覧のカード→詳細：同じ訪問で複数の商品を見ても、回数はすべて数え、セッション数は1
const links = await p.$$("#view-list .card h3 a[href^='/items/']");
ok("一覧にカードがある", links.length >= 3, String(links.length));
await links[0].click({ force: true }); await links[0].click({ force: true }); await links[1].click({ force: true }); await links[2].click({ force: true });
await hide(p); await p.waitForTimeout(300);
let g = sum(await got());
ok("lc:list は4回（重複防止なし）", g["lc:list"] === 4, JSON.stringify({ lc: g["lc:list"] }));
ok("ls:list は1（1訪問に1回）", g["ls:list"] === 1, JSON.stringify({ ls: g["ls:list"] }));
ok("訪問は1回・既存の「トップを見た」は1回", g["v:new"] === 1 && g["f:h"] === 1);

// 2) ニュース→商品／出典
await p.evaluate(() => document.querySelector("#tab-news").click()); await p.waitForTimeout(600);
const nIt = await p.$$(".ncard .nitem a[href^='/items/']"), nSrc = await p.$$(".ncard a.nsrc"), nTit = await p.$$(".ncard h3 a");
ok("ニュースカードがある", nIt.length >= 1 && nSrc.length >= 1 && nTit.length >= 1, JSON.stringify([nIt.length, nSrc.length, nTit.length]));
await nIt[0].click({ force: true }); await nIt[0].click({ force: true }); await nSrc[0].click({ force: true }); await nTit[0].click({ force: true });
await hide(p); await p.waitForTimeout(300);
g = sum(await got());
ok("nw:item は2回・ls:nw は1", g["nw:item"] === 2 && g["ls:nw"] === 1, JSON.stringify(g));
ok("nw:src は2回（出典リンクと見出し）", g["nw:src"] === 2);
ok("既存の o:news は変わらない（ニュースカード内のリンクを押した回数＝4）", g["o:news"] === 4, String(g["o:news"]));
ok("一覧の lc:list はニュースのリンクでは増えない", !g["lc:list"]);

// 3) 関連商品（data-rel）と、ちい活ノート内の導線（data-own：「公式」の文字があっても公式情報・購入先に数えない）
await p.evaluate(() => {
  const d = document.createElement("div"); d.id = "t-rel"; d.setAttribute("data-rel", "");
  d.innerHTML = '<a id="t-r1" href="/items/test-a/" data-own>公式の関連商品</a><a id="t-r2" href="https://example.com/x">外部</a>';
  document.body.appendChild(d);
  const e = document.createElement("a"); e.id = "t-own"; e.href = "/items/test-b/"; e.setAttribute("data-own", ""); e.textContent = "公式を見る"; document.body.appendChild(e);
  const f = document.createElement("a"); f.id = "t-off"; f.href = "https://example.com/y"; f.className = "off"; f.textContent = "公式サイト"; document.body.appendChild(f);
});
await p.click("#t-r1", { force: true }); await p.click("#t-r1", { force: true }); await p.click("#t-r2", { force: true }); await p.click("#t-own", { force: true }); await p.click("#t-off", { force: true });
await hide(p); await p.waitForTimeout(300);
g = sum(await got());
ok("rel:go は2回・ls:rel は1（外部リンクは数えない）", g["rel:go"] === 2 && g["ls:rel"] === 1, JSON.stringify(g));
ok("data-own は「公式」の文字があっても o:info・購入先に数えない（既存の公式リンクは o:info 1）", g["o:info"] === 1 && !Object.keys(g).some(k => k.startsWith("b:")), JSON.stringify(g));

// 4) 新しい訪問（30分あく）：セッション数は数え直し、回数は足される
await p.evaluate(() => { const v = JSON.parse(sessionStorage.getItem("chiikatsu-vs")); v.t -= 31 * 60e3; sessionStorage.setItem("chiikatsu-vs", JSON.stringify(v)); });
await p.goto(B + "/"); await p.waitForTimeout(800);
await p.evaluate(() => { const o = document.querySelector(".ob"); if (o) o.remove(); });
await p.evaluate(() => { const t = document.querySelector("#tab-list"); if (t) t.click(); }); await p.waitForTimeout(400);
const l2 = await p.$$("#view-list .card h3 a[href^='/items/']"); await l2[0].click({ force: true });
await hide(p); await p.waitForTimeout(300);
g = sum(await got());
ok("新しい訪問では ls:list を数え直す（1）・lc:list は1", g["ls:list"] === 1 && g["lc:list"] === 1 && g["v:new"] === 1, JSON.stringify(g));

// 5) テストモード：新しい項目もテスト区分に入る
await p.goto(B + "/?test=on"); await p.waitForTimeout(800);
await p.evaluate(() => { const o = document.querySelector(".ob"); if (o) o.remove(); });
await p.evaluate(() => { const t = document.querySelector("#tab-list"); if (t) t.click(); }); await p.waitForTimeout(400);
const l3 = await p.$$("#view-list .card h3 a[href^='/items/']"); await l3[0].click({ force: true });
await hide(p); await p.waitForTimeout(300);
const bs = await got();
ok("テスト中は区分「テスト」に入り、一般には入らない", sum(bs, "t")["lc:list"] === 1 && !sum(bs, "g")["lc:list"]);
ok("エラーなし", !errs.length, errs.join("|"));
await c.close(); await browser.close();
console.log(out.join("\n")); process.exit(out.some(l => l.startsWith("NG")) ? 1 : 0);
