// 詳細ページの通知の案内：`node test/pn.mjs`（先に node build.mjs を実行）
// 計測の許可リスト・公開ページへの組み込み・公開鍵の一致を確かめる（ブラウザでの動きは、手元の確認で別に見る）。
import fs from "node:fs";
import { okKey, pick } from "../functions/api/hit.js";
let fails = 0; const ok = (name, c, info = "") => { console.log((c ? "ok  " : "NG  ") + name + (c ? "" : "  " + info)); if (!c) fails++; };
for (const k of ["pn:show", "pn:tap", "pn:grant", "pn:deny", "pn:later", "push:on"]) ok("許可リストに入っている " + k, okKey(k));
for (const k of ["pn:", "pn:other", "pn:show:x", "pnx:show"]) ok("許可されない " + k, !okKey(k));
ok("pick が pn:* を通す", JSON.stringify(pick({ "pn:show": 2, "pn:bad": 5 }, 0)) === JSON.stringify([["pn:show", 2]]));
const app = fs.readFileSync("src/app.js", "utf8"), lite = fs.readFileSync("dist/push-lite.js", "utf8");
const key = app.match(/const VAPID = "([^"]+)"/)[1];
ok("push-lite.js の公開鍵が app.js と同じ", lite.includes(`var VAPID = "${key}"`) && !lite.includes("/*VAPID*/"));
const items = fs.readdirSync("dist/items").filter(d => fs.existsSync(`dist/items/${d}/index.html`));
let bad = 0, withWant = 0;
for (const d of items) { const h = fs.readFileSync(`dist/items/${d}/index.html`, "utf8"); if (!h.includes('class="wantrow"')) continue; withWant++; if (!h.includes('"chiikatsu-want"') || !h.includes("/push-lite.js")) bad++; }
ok(`「ほしい」のある詳細ページ（${withWant}件）すべてに通知の案内の部品がある`, withWant > 0 && bad === 0, bad + "件で不足");
ok("トップには、詳細ページ用の部品を入れていない", !fs.readFileSync("dist/index.html", "utf8").includes("push-lite.js"));
ok("Functions を通さない静的ファイルに指定している", fs.readFileSync("dist/_routes.json", "utf8").includes("/push-lite.js"));
ok("通知の許可は、押したときだけ（読み込み時に requestPermission を呼ばない）", (lite.match(/requestPermission\(/g) || []).length === 1 && /function turnOn\(\)\{\s*ct\("pn:tap"\);\s*Notification\.requestPermission/.test(lite));
console.log(fails ? `NG ${fails}` : "pn OK"); process.exit(fails ? 1 : 0);
