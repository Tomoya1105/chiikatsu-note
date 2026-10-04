// 公開前の自動チェック：`node test/check.mjs`（先に node build.mjs を実行）
// サイトが壊れていないか、アフィリエイトIDが消えていないかを確かめる。
import fs from "node:fs";
import { execSync } from "node:child_process";
import { srcTypeOf, SRC_TYPES } from "./sources.mjs";
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
  // 根拠（情報源）の記録
  if (!it.src) errs.push(`${it.id}: src（根拠のURL）がありません`);
  else if (srcTypeOf(it.src) === "aggregator") errs.push(`${it.id}: src がまとめサイト・個人ブログです（${it.src.slice(0, 60)}）。公式・メーカー・プレスリリース・報道のURLにしてください`);
  if (!SRC_TYPES.includes(it.srcType)) errs.push(`${it.id}: srcType は ${SRC_TYPES.join("|")} のどれか（いま "${it.srcType ?? ""}"）`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(it.verifiedAt || "")) errs.push(`${it.id}: verifiedAt（最後に情報源で確かめた日 YYYY-MM-DD）がありません`);
  if (it.srcs && (!Array.isArray(it.srcs) || it.srcs.some(u => !/^https:\/\//.test(u)))) errs.push(`${it.id}: srcs は https のURLの配列にしてください`);
}

// 重複のうたがい（止めずに知らせる。自動更新は報告に書き、同じものなら1つにまとめる）
const warns = [];
const norm = s => String(s || "").toLowerCase().replace(/[\s・、。,.!！?？（）()「」『』【】［］\[\]〜~ー\-–—_:：/／]/g, "").replace(/(予約|受注|販売|発売|開催|限定|新商品|グッズ|ちいかわ)/g, "");
const venue = t => (String(t).split(/[＠@]/)[1] || "");
const bigr = s => { const a = new Set(); for (let i = 0; i < s.length - 1; i++) a.add(s.slice(i, i + 2)); return a; };
const sim = (a, b) => { const A = bigr(a), B = bigr(b); if (!A.size || !B.size) return a === b ? 1 : 0; let n = 0; for (const x of A) if (B.has(x)) n++; return n / (A.size + B.size - n); };
const live = items.filter(x => !x.hidden);
for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
  const a = live[i], b = live[j];
  if ((a.region || "jp") !== (b.region || "jp")) continue;
  const va = venue(a.t), vb = venue(b.t);
  if (va && vb && norm(va) !== norm(vb)) continue;               // 会場がちがう POP UP は別物
  const aEnd = a.e || a.s, bEnd = b.e || b.s;
  const overlap = a.s <= bEnd && b.s <= aEnd;
  const t = sim(norm(a.t), norm(b.t));
  if ((a.s === b.s && t >= 0.5) || (overlap && t >= 0.8)) warns.push(`重複のうたがい: ${a.id}「${a.t}」と ${b.id}「${b.t}」`);
}
if (warns.length) console.log("注意（止めはしません）:\n- " + warns.join("\n- "));
if (errs.length) { console.error("チェックNG:\n- " + errs.join("\n- ")); process.exit(1); }
console.log(`チェックOK（${items.length}件）`);
