// 戻る操作で復元された古いページが、詳細ページの付けた「訪問の印」を消さないことの確認（test/serve-hit.mjs を 8791 番で起動して実行）
import { chromium } from "playwright";
const B = process.env.B || "http://localhost:8791";
const browser = await chromium.launch({ executablePath: process.env.CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const c = await browser.newContext({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true });
const p = await c.newPage();
await p.goto(B + "/?test=on"); await p.waitForTimeout(700);
// 詳細ページが印(i,hi)を付けたあとの状態を作る（別ページが書いた想定）
await p.evaluate(() => { const v = JSON.parse(sessionStorage.getItem("chiikatsu-vs")); v.f.i = 1; v.f.hi = 1; sessionStorage.setItem("chiikatsu-vs", JSON.stringify(v)); });
// 戻ってきた古いトップページが、画面を触る／離れる
await p.mouse.click(5, 5); await p.waitForTimeout(200);
await p.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
const f = await p.evaluate(() => JSON.parse(sessionStorage.getItem("chiikatsu-vs")).f);
console.log("保存されている印:", JSON.stringify(f), f.i && f.hi ? "OK 残っている" : "NG 消えた");
await browser.close();
