// 戻る・進む・複数タブ（新しいタブで開く）・30分経過・復元を、ランダムに組み合わせて、割合の分子が分母を超えないことを確かめる。
// 実行：node test/serve-hit.mjs を 8791 番で起動してから、SEED=21 RUNS=8 node test/stats-fuzz.mjs（複数を同時に動かさない：受信データが混ざる）
import { chromium } from "playwright";
const B = "http://localhost:8791";
const browser = await chromium.launch({ executablePath: process.env.CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const got = async () => await (await fetch(B + "/api/_got")).json();
const sum = bs => { const s = {}; bs.forEach(b => Object.entries(b.ev).forEach(([k, v]) => s[k] = (s[k] || 0) + v)); return s; };
let seed = +process.env.SEED || 1; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296; const pickR = a => a[Math.floor(rnd() * a.length)];
const hide = p => p.evaluate(() => { try { Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); } catch (e) {} }).catch(() => {});
const RUNS = +process.env.RUNS || 12, MULTI = process.env.MULTI !== "0";
const bad = [], tot = {};
for (let r = 0; r < RUNS; r++) {
  const c = await browser.newContext({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true });
  await c.addInitScript(() => { document.addEventListener("click", e => { const a = e.target.closest && e.target.closest("a[href^='http']"); if (a) e.preventDefault(); }); });
  let pages = [await c.newPage()]; await got();
  await pages[0].goto(B + "/"); await pages[0].waitForTimeout(250);
  for (let s = 0; s < 14; s++) {
    let p = pickR(pages); if (p.isClosed()) continue;
    const act = pickR(["item", "item", "back", "forward", "home", "buy", "heart", "idle", "newtab", "newtab", "hide", "reload"].filter(x => MULTI || x !== "newtab"));
    try {
      if (process.env.PRE !== "0" && ["back","forward","home","reload","newtab"].includes(act)) await hide(p);
      if (act === "item") { const l = await p.$$("h3 a[href^='/items/']"); if (l.length) { await pickR(l).click(); await p.waitForTimeout(250); } else { await p.goto(B + "/items/" + pickR(["20261001-pus-sendai", "20261010-tokuten6"]) + "/"); } }
      else if (act === "back") await p.goBack().catch(() => {});
      else if (act === "forward") await p.goForward().catch(() => {});
      else if (act === "home") await p.goto(B + "/");
      else if (act === "buy") { const l = await p.$$("a[href*='hb.afl.rakuten'], a[href*='af.moshimo'], a[data-rsv]"); if (l.length) await pickR(l).click({ timeout: 800 }).catch(() => {}); }
      else if (act === "heart") { const l = await p.$$("[data-mark='want']"); if (l.length) await pickR(l).click({ timeout: 800 }).catch(() => {}); }
      else if (act === "idle") await p.evaluate(() => { try { const v = JSON.parse(sessionStorage.getItem("chiikatsu-vs")); if (v) { v.t -= 31 * 60e3; sessionStorage.setItem("chiikatsu-vs", JSON.stringify(v)); } } catch (e) {} });
      else if (act === "newtab") { const [np] = await Promise.all([c.waitForEvent("page", { timeout: 2000 }).catch(() => null), p.evaluate(u => window.open(u, "_blank"), p.url())]); if (np) { pages.push(np); await np.waitForTimeout(250); } }
      else if (act === "hide") await hide(p);
      else if (act === "reload") await p.reload();
      await p.waitForTimeout(120);
    } catch (e) {}
  }
  for (const p of pages) { if (!p.isClosed()) await hide(p); }
  await pages[0].waitForTimeout(300);
  const s = sum(await got()); const v = k => s[k] || 0;
  for (const [k, x] of Object.entries(s)) tot[k] = (tot[k] || 0) + x;
  const pairs = [["f:hi", "f:h"], ["f:ib", "f:i"], ["f:lb", "f:h"], ["f:w", "v:new"], ["f:xi", "v:x"], ["f:xb", "f:xi"], ["f:b", "v:new"], ["v:x", "v:new"]];
  for (const [a, b] of pairs) if (v(a) > v(b)) bad.push({ run: r, a, b, av: v(a), bv: v(b) });
  await c.close();
}
const t = k => tot[k] || 0;
console.log("合計", JSON.stringify({ "v:new": t("v:new"), "f:h": t("f:h"), "f:hi": t("f:hi"), "f:i": t("f:i"), "f:ib": t("f:ib"), "f:lb": t("f:lb"), "f:w": t("f:w") }));
console.log(bad.length ? "NG 超えた組み合わせ " + JSON.stringify(bad.slice(0, 6)) + ` (${bad.length}件/${RUNS}回)` : `OK ${RUNS}回すべて 分子≦分母`);
await browser.close();
