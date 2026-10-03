// 公開前の自動チェック：`node test/check.mjs`（先に node build.mjs を実行）
// サイトが壊れていないか、アフィリエイトIDが消えていないかを確かめる。
import fs from "node:fs";
import { execSync } from "node:child_process";
const AFF = "582a6f7f.e1ade2b2.582a6f84.d5f85faa";
const RAK_APP = "d328e43a-4e55-4bd7-8ce4-f265afcf674d";
const errs = [];
const read = f => fs.readFileSync(f, "utf8");
for (const f of ["dist/app.js", "dist/install.js", "dist/sw.js"]) {
  try { execSync(`node --check ${f}`, { stdio: "pipe" }); } catch (e) { errs.push(`${f} に文法エラー: ${e.stderr}`); }
}
const html = read("dist/index.html"), app = read("dist/app.js");
const ids = new Set([...app.matchAll(/getElementById\("([^"]+)"\)/g)].map(m => m[1]));
for (const id of ids) if (!html.includes(`id="${id}"`) && !["toast","newsPeek"].includes(id)) errs.push(`トップページに id="${id}" がありません（app.js が使っています）`);
if (!app.includes(AFF)) errs.push("app.js から楽天アフィリエイトIDが消えています");
if (!app.includes(RAK_APP)) errs.push("app.js から楽天APIのアプリIDが消えています");
for (const d of fs.readdirSync("dist/items")) {
  const h = read(`dist/items/${d}/index.html`);
  for (const m of h.matchAll(/href="(https:\/\/[^"]*rakuten[^"]*)"/g)) {
    if (m[1].startsWith("https://webservice.rakuten.co.jp")) continue; // 楽天APIのクレジット表記（必須・対象外）
    if (!m[1].startsWith(`https://hb.afl.rakuten.co.jp/hgc/${AFF}/`)) errs.push(`items/${d}: アフィリエイトIDのない楽天リンク ${m[1].slice(0, 80)}`);
  }
}
try { JSON.parse(read("dist/manifest.webmanifest")); } catch (e) { errs.push("manifest.webmanifest が壊れています"); }
const items = JSON.parse(read("data/items.json"));
const seen = new Set();
for (const it of items) {
  if (seen.has(it.id)) errs.push(`id が重複: ${it.id}`); seen.add(it.id);
  for (const k of ["id", "t", "cat", "s"]) if (!it[k]) errs.push(`${it.id || "?"}: ${k} がありません`);
  if (it.s && !/^\d{4}-\d{2}-\d{2}$/.test(it.s)) errs.push(`${it.id}: s の形がちがいます`);
  if (it.e && !/^\d{4}-\d{2}-\d{2}$/.test(it.e)) errs.push(`${it.id}: e の形がちがいます`);
}
if (errs.length) { console.error("チェックNG:\n- " + errs.join("\n- ")); process.exit(1); }
console.log(`チェックOK（${items.length}件）`);
