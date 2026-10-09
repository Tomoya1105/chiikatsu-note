import { chromium } from "playwright";
// 手元で dist を配信し、/api/hit に届いた中身を /api/_got で返す小さなサーバー（test/serve-hit.mjs）を 8791 番で動かしてから実行する
const B = process.env.B || "http://localhost:8791";
const browser = await chromium.launch({ executablePath: process.env.CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const out = []; const ok = (n, c, x = "") => out.push(`${c ? "OK" : "NG"} ${n} ${x}`);
const got = async () => await (await fetch(B + "/api/_got")).json();
const sum = (bs, seg) => { const s = {}; bs.filter(b => (b.t ? "t" : "g") === seg).forEach(b => Object.entries(b.ev).forEach(([k, v]) => s[k] = (s[k] || 0) + v)); return s; };
async function mk(){
  const c = await browser.newContext({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true });
  const p = await c.newPage();
  await p.addInitScript(() => { document.addEventListener("click", e => { const a = e.target.closest && e.target.closest("a[href^='http']"); if (a) e.preventDefault(); }); });
  return { c, p };
}
const hide = p => p.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); });
await got();
let { c, p } = await mk();
const errs = []; p.on("pageerror", e => errs.push(e.message));
// 1) 初回のトップ → 詳細 → 詳細で楽天 → 一覧で公式通販・Yahoo!・♡
await p.goto(B + "/"); await p.waitForTimeout(700);
await p.evaluate(() => { const o = document.querySelector(".ob"); if (o) o.remove(); });
const card = await p.evaluate(() => { const c = [...document.querySelectorAll("#view-list .card")].find(c => c.querySelector("a.lnk[href*='chiikawamarket.jp/products/']")); return c ? c.dataset.id : null; });
if (card) await p.click(`#view-list .card[data-id="${card}"] a.lnk[href*='chiikawamarket.jp/products/']`, { force: true });
await p.evaluate(() => { const a = document.querySelector("#view-list a.yh"); a.click(); });
await p.evaluate(() => { const a = [...document.querySelectorAll("#view-list a.lnk")].find(a => /公式情報/.test(a.textContent) && !/chiikawamarket\.jp\/products/.test(a.href)); a.click(); });
await p.evaluate(() => document.querySelector("#view-list [data-mark='want']").click()); await p.waitForTimeout(300);
await hide(p);
const item = await p.evaluate(() => document.querySelector("#view-list .card a.yh").closest(".card").querySelector("h3 a").getAttribute("href"));
await p.goto(B + item); await p.waitForTimeout(500);
await p.evaluate(() => document.querySelector("[data-rkd]").click());
await p.evaluate(() => document.querySelector("[data-rkd]").click());
await hide(p); await p.waitForTimeout(300);
let g = sum(await got(), "g"), id = decodeURIComponent(item.split("/")[2]);
ok("訪問は1回（ページをまたいでも）", g["v:new"] === 1, JSON.stringify({ v: g["v:new"] }));
ok("トップ・詳細・トップ→詳細", g["f:h"] === 1 && g["f:i"] === 1 && g["f:hi"] === 1);
ok("一覧の公式通販・Yahoo!", (card ? g["b:list:off"] === 1 : true) && g["b:list:yh"] === 1, card ? "" : "（公式通販の商品がトップに無い）");
ok("公式情報は購入先に入れない", g["o:info"] === 1 && !g["b:list:info"]);
ok("詳細の楽天（2回押すと回数は2・訪問の印は1）", g["b:item:rk"] === 2 && g["f:ib"] === 1 && g["f:b"] === 1 && g["f:lb"] === 1);
ok("商品別（一覧のYahoo!1回＋詳細の楽天2回）", g["bi:" + id] === 3 + (card === id ? 1 : 0), JSON.stringify(Object.entries(g).filter(([k]) => k.startsWith("bi:"))) + " id=" + id);
ok("♡（その日に押した分も端末として数える）", g["f:w"] === 1 && g["mark:want"] === 1 && g["u:fav"] === 1);
ok("端末の数（日・週）", g["u:dev"] === 1 && g["u:wk"] === 1 && !g["u:wkret"]);
ok("一般の区分", !Object.keys(sum(await got(), "t")).length);
// 2) 30分あけると新しい訪問
await p.evaluate(() => { const v = JSON.parse(sessionStorage.getItem("chiikatsu-vs")); v.t -= 31 * 60e3; sessionStorage.setItem("chiikatsu-vs", JSON.stringify(v)); });
await p.goto(B + "/"); await p.waitForTimeout(500); await hide(p); await p.waitForTimeout(200);
g = sum(await got(), "g");
ok("30分あけると新しい訪問・同じ日の端末は数え直さない", g["v:new"] === 1 && g["f:h"] === 1 && !g["u:dev"] && !g["u:wk"]);
// 3) テストモード：オン → 区分が変わり、新しい訪問。オンにする前の分は一般で送られる
await p.evaluate(() => document.querySelector("#tab-cal").click());
await hide(p); await p.waitForTimeout(200);
await p.goto(B + "/?test=on"); await p.waitForTimeout(600);
ok("テスト中の印", await p.isVisible(".tm-badge"));
await p.evaluate(() => document.querySelector("#tab-cal").click());
await hide(p); await p.waitForTimeout(200);
let bs = await got(); g = sum(bs, "g"); let tt = sum(bs, "t");
ok("オンにする前の操作は一般、後はテスト・訪問は重ならない", g["tab:cal"] === 1 && tt["tab:cal"] === 1 && tt["v:new"] === 1 && !g["v:new"], JSON.stringify({ g, tt }));
// 印を2回押してオフ → 押す前の分はテスト、後は一般の新しい訪問
await p.evaluate(() => document.querySelector("#tab-list").click());
await p.click(".tm-badge"); await p.click(".tm-badge"); await p.waitForTimeout(200);
ok("印から終了", !(await p.isVisible(".tm-badge")));
await p.evaluate(() => document.querySelector("#tab-mine").click());
await hide(p); await p.waitForTimeout(200);
bs = await got(); g = sum(bs, "g"); tt = sum(bs, "t");
ok("オフの前後で区分が分かれる", tt["tab:list"] === 1 && g["tab:mine"] === 1 && g["v:new"] === 1 && !tt["tab:mine"], JSON.stringify({ g, tt }));
// 4) 30日たったテストモードは自動でオフ
await p.evaluate(() => localStorage.setItem("chiikatsu-test", JSON.stringify({ on: 1, at: Date.now() - 31 * 864e5 })));
await p.goto(B + "/about/"); await p.waitForTimeout(500);
ok("30日で自動オフ（お知らせ）", !(await p.isVisible(".tm-badge")) && /30日/.test(await p.evaluate(() => (document.getElementById("toast") || document.querySelector(".toast") || {}).textContent || "")));
await hide(p); await got();
ok("エラーなし", !errs.length, errs.join("|"));
await c.close();
// 5) Xのリンクから詳細ページに来た訪問・先週も来たブラウザ・ホーム画面から
({ c, p } = await mk());
await p.goto(B + "/about/");
await p.evaluate(() => { const d = new Date(Date.now() + 9 * 3600e3), w = (d.getUTCDay() + 6) % 7; const mon = new Date(Date.now() + 9 * 3600e3 - (w + 7) * 864e5).toISOString().slice(0, 10); localStorage.setItem("chiikatsu-u", JSON.stringify({ first: "2026-10-01", last: "2026-10-01", wk: mon })); });
await hide(p); await p.waitForTimeout(200); await got();
await p.goto(B + item + "?utm_source=x&utm_medium=social"); await p.waitForTimeout(500);
await p.evaluate(() => document.querySelector("[data-rkd]").click());
await hide(p); await p.waitForTimeout(200);
g = sum(await got(), "g");
ok("Xから詳細に直接：v:x・f:xi・f:xb", g["v:x"] === 1 && g["f:xi"] === 1 && g["f:xb"] === 1 && !g["f:hi"], JSON.stringify(g));
ok("先週も来たブラウザ・前の日にも来た端末", g["u:wk"] === 1 && g["u:wkret"] === 1 && g["u:ret"] === 1);
await c.close();
console.log(out.join("\n")); await browser.close();
