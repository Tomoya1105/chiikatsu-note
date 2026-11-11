// 国内航空券（グッド・エアーズ）の検査：①出す条件（airOk）②クリックが専用の分類（o:air）で数えられ、既存の分類を増やさない
// 実行：node test/serve-hit.mjs dist 8791 を起動してから node test/air.mjs（先に node build.mjs）
import { chromium } from "playwright";
import { airOk, airLink, AIR_Q, AIR_TEXT } from "../src/air.mjs";
import { DETAIL } from "../functions/api/hit.js";
const out = []; const ok = (n, c, x = "") => out.push(`${c ? "OK" : "NG"} ${n} ${x}`);
const isEv = x => x.cat === "event" || x.cat === "cafe", T = "2026-11-11";
const base = { cat: "event", region: "jp", area: "旭川", s: "2026-11-21", e: "2026-12-06" };
ok("国内・イベント・北海道・開催前 → 出す", airOk(base, ["北海道"], T, isEv));
ok("開催中（会期の途中） → 出す", airOk({ ...base, s: "2026-11-01" }, ["北海道"], T, isEv));
ok("終了 → 出さない", !airOk({ ...base, s: "2026-10-01", e: "2026-11-10" }, ["北海道"], T, isEv));
ok("終了日なしの終了済み（開始日で判断） → 出さない", !airOk({ ...base, s: "2026-10-01", e: null }, ["北海道"], T, isEv));
ok("本州（東京） → 出さない", !airOk(base, ["東京"], T, isEv));
ok("開催地が複数の都道府県 → 出さない", !airOk(base, ["北海道", "沖縄"], T, isEv));
ok("開催地が判定できない → 出さない", !airOk(base, [], T, isEv));
ok("area なし → 出さない", !airOk({ ...base, area: "" }, ["北海道"], T, isEv));
ok("海外 → 出さない", !airOk({ ...base, region: "tw" }, ["北海道"], T, isEv));
ok("商品（goods） → 出さない", !airOk({ ...base, cat: "goods" }, ["北海道"], T, isEv));
ok("非表示 → 出さない", !airOk({ ...base, hidden: true }, ["北海道"], T, isEv));
ok("カフェは対象", airOk({ ...base, cat: "cafe" }, ["沖縄"], T, isEv));
const L = airLink();
ok("広告コードのとおり（href・rel・referrerpolicy・attributionsrc・impression・PR）",
  L.includes(`href="https://af.moshimo.com/af/c/click?${AIR_Q.replace(/&/g, "&amp;")}"`) && /rel="noopener sponsored nofollow"/.test(L) && L.includes('referrerpolicy="no-referrer-when-downgrade"') && / attributionsrc /.test(L) &&
  L.includes("i.moshimo.com/af/i/impression?") && L.includes(">PR</span>") && L.includes(AIR_TEXT) && AIR_Q === "a_id=5849049&p_id=7702&pc_id=22300&pl_id=96316");
ok("SNS専用リンクは使っていない（素材は pl_id=96316 のみ）", !/pl_id=(?!96316)/.test(L));
ok("サーバーが o:air を受け付ける", DETAIL.test("o:air") && DETAIL.test("o:travel") && !DETAIL.test("o:airx"));
const B = process.env.B || "http://localhost:8791";
const browser = await chromium.launch({ executablePath: process.env.CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const got = async () => await (await fetch(B + "/api/_got")).json();
const sum = bs => { const s = {}; bs.forEach(b => Object.entries(b.ev || {}).forEach(([k, v]) => s[k] = (s[k] || 0) + v)); return s; };
const c = await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
const p = await c.newPage();
await p.addInitScript(() => { document.addEventListener("click", e => { const a = e.target.closest && e.target.closest("a[href]"); if (a) e.preventDefault(); }, false); });
await p.route(/i\.moshimo\.com/, r => r.fulfill({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==", "base64") }));
await p.goto(B + "/items/20261121-pus-asahikawa-ekimae/", { waitUntil: "load" }); await got();
await p.click("a[data-air]"); await p.waitForTimeout(300);
await p.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
await p.waitForTimeout(500);
const g = sum(await got());
ok("航空券のクリックは o:air として数える", g["o:air"] === 1, JSON.stringify(g));
ok("購入先（b:*）・楽天（c:rk など）・Yahoo!（yh）・トラベル（o:travel）には数えない", !Object.keys(g).some(k => /^b:|^c:|yh|am|o:travel/.test(k)), JSON.stringify(g));
await p.click("a.trip:not(.air)"); await p.waitForTimeout(300);
await p.evaluate(() => { document.dispatchEvent(new Event("visibilitychange")); });
await p.waitForTimeout(500);
const g2 = sum(await got());
ok("既存のホテルのクリックは o:travel のまま（o:air にならない）", g2["o:travel"] === 1 && !g2["o:air"], JSON.stringify(g2));
await browser.close();
console.log(out.join("\n")); if (out.some(l => l.startsWith("NG"))) { console.log("air NG"); process.exit(1); } console.log(`air OK ${out.length}件`);
