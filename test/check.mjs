// 公開前の自動チェック：`node test/check.mjs`（先に node build.mjs を実行）
// サイトが壊れていないか、アフィリエイトIDが消えていないかを確かめる。
import fs from "node:fs";
import { execSync } from "node:child_process";
import { srcTypeOf, SRC_TYPES } from "./sources.mjs";
import { RKM } from "../src/rkmatch.mjs";
const OFFICIAL_X = JSON.parse(fs.readFileSync("data/official-x.json", "utf8")).accounts;
const AFF = "582a6f7f.e1ade2b2.582a6f84.d5f85faa";
const RAK_APP = "d328e43a-4e55-4bd7-8ce4-f265afcf674d";
const errs = [];
const read = f => fs.readFileSync(f, "utf8");
// ページに直接書いたスクリプト（<script>…</script>）の文法も確かめる（1つ壊れると、そのページのボタンが全部動かなくなるため）
{ const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(`${d}/${e.name}`) : e.name.endsWith(".html") ? [`${d}/${e.name}`] : []);
  for (const f of walk("dist")) for (const m of read(f).matchAll(/<script(?![^>]*(?:type="application\/ld\+json"|src=))[^>]*>([\s\S]*?)<\/script>/g)) {
    try { new Function(m[1]); } catch (e) { errs.push(`${f} のページ内スクリプトに文法エラー: ${e.message}`); } } }
// 運営者ページ（投稿案・お問い合わせ）はサーバーで作るので、仮のデータで作ってみて確かめる
{ const { onRequestGet } = await import("../functions/api/xdraft.js");
  const kv = new Map(); const env = { REPORT_KEY: "K", REPORTS: { get: async k => kv.get(k) ?? null, put: async (k, v) => kv.set(k, v), delete: async k => kv.delete(k), list: async () => ({ keys: [] }) } };
  const call = q => onRequestGet({ request: new Request("https://chiikatsunote.com/api/xdraft?" + q), env });
  await call("key=K&op=add&slot=" + encodeURIComponent("朝") + "&p1=" + encodeURIComponent("テスト\n2行目") + "&r1=" + encodeURIComponent("https://x.com/chiikawa_kouhou/status/1"));
  const html = await (await call("tok=" + kv.get("x:tok"))).text();
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) { try { new Function(m[1]); } catch (e) { errs.push(`運営者ページ（/api/xdraft）のスクリプトに文法エラー: ${e.message}`); } } }
for (const f of ["dist/app.js", "dist/install.js", "dist/sw.js"]) {
  try { execSync(`node --check ${f}`, { stdio: "pipe" }); } catch (e) { errs.push(`${f} に文法エラー: ${e.stderr}`); }
}
const html = read("dist/index.html"), app = read("dist/app.js");
const ids = new Set([...app.matchAll(/getElementById\("([^"]+)"\)/g)].map(m => m[1]));
for (const id of ids) if (!html.includes(`id="${id}"`) && !["toast","newsPeek","favGrid"].includes(id)) errs.push(`トップページに id="${id}" がありません（app.js が使っています）`);
if (!app.includes(AFF)) errs.push("app.js から楽天アフィリエイトIDが消えています");
if (!app.includes(RAK_APP)) errs.push("app.js から楽天APIのアプリIDが消えています");
// 楽天の商品リンクは必ず自分のアフィリエイトIDで作る（API の affiliateUrl は別のIDのことがある）
{ const ok1 = RKM.affUrl("https://hb.afl.rakuten.co.jp/hgc/g00t6k4o.gnvjz135.g00t6k4o.gnvk4ef1/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fa%2Fb%2F", "https://item.rakuten.co.jp/a/b/");
  const ok2 = RKM.fixAff("https://hb.afl.rakuten.co.jp/hgc/g00t6k4o.gnvjz135.g00t6k4o.gnvk4ef1/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fa%2Fb%2F&m=x");
  if (!ok1.includes(`/hgc/${AFF}/`) || !ok2.includes(`/hgc/${AFF}/`) || !ok2.includes(encodeURIComponent("https://item.rakuten.co.jp/a/b/"))) errs.push("楽天の商品リンクが自分のアフィリエイトIDで作られていません（RKM.affUrl / fixAff）");
  for (const f of ["dist/app.js", "dist/install.js"]) if (/affiliateUrl\s*:\s*|\?\s*x\.affiliateUrl\s*:/.test(read(f))) errs.push(`${f}: API の affiliateUrl をそのまま使っています。RKM.affUrl を使ってください`); }
const pagesToCheck = ["items", "month", "area"].flatMap(dir => fs.existsSync(`dist/${dir}`) ? fs.readdirSync(`dist/${dir}`).filter(d => fs.existsSync(`dist/${dir}/${d}/index.html`)).map(d => `${dir}/${d}`) : []);
for (const d of pagesToCheck) {
  const h = read(`dist/${d}/index.html`);
  for (const m of h.matchAll(/href="(https:\/\/[^"]*rakuten[^"]*)"/g)) {
    if (m[1].startsWith("https://webservice.rakuten.co.jp")) continue; // 楽天APIのクレジット表記（必須・対象外）
    if (!m[1].startsWith(`https://hb.afl.rakuten.co.jp/hgc/${AFF}/`) && !m[1].startsWith("https://af.moshimo.com/")) errs.push(`${d}: アフィリエイトIDのない楽天リンク ${m[1].slice(0, 80)}`);
  }
}
// もしもアフィリエイトのリンクは、必ず自分のID（a_id）になっていること
for (const d of pagesToCheck) for (const m of read(`dist/${d}/index.html`).matchAll(/href="(https:\/\/af\.moshimo\.com[^"]*)"/g)) if (!/a_id=5833703&/.test(m[1].replace(/&amp;/g, "&"))) errs.push(`${d}: もしものIDがちがうリンク ${m[1].slice(0, 80)}`);
if (!app.includes('a_id: "5833703"')) errs.push("app.js から もしも（Yahoo!）のIDが消えています");
try { JSON.parse(read("dist/manifest.webmanifest")); } catch (e) { errs.push("manifest.webmanifest が壊れています"); }
const items = JSON.parse(read("data/items.json"));
const seen = new Set();
for (const it of items) {
  if (seen.has(it.id)) errs.push(`id が重複: ${it.id}`); seen.add(it.id);
  for (const k of ["id", "t", "cat", "s"]) if (!it[k]) errs.push(`${it.id || "?"}: ${k} がありません`);
  if (it.s && !/^\d{4}-\d{2}-\d{2}$/.test(it.s)) errs.push(`${it.id}: s の形がちがいます`);
  if (it.e && !/^\d{4}-\d{2}-\d{2}$/.test(it.e)) errs.push(`${it.id}: e の形がちがいます`);
  if (it.q && !/ちいかわ|chiikawa/i.test(it.q)) errs.push(`${it.id}: q（楽天の検索語）に「ちいかわ」を入れてください（ないと関係ない商品が出ます）`);
  if (it.rb && (!Array.isArray(it.rb) || it.rb.some(x => !x || !/^https:\/\/books\.rakuten\.co\.jp\/rb\/\d+\/?$/.test(x.u || "")))) errs.push(`${it.id}: rb は [{"n":"版の名前 or 空","u":"https://books.rakuten.co.jp/rb/数字/"}] の形にしてください`);
  if (it.dl && (!Array.isArray(it.dl) || it.dl.some(x => !x || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(x.until || "") || (x.u && !/^https:\/\//.test(x.u))))) errs.push(`${it.id}: dl は [{"k":"抽選|予約|受注|整理券|応募","n":"説明","until":"YYYY-MM-DDTHH:MM（日本時間）","u":"https のURL"}] の形にしてください`);
  // 根拠（情報源）の記録
  if (!it.src) errs.push(`${it.id}: src（根拠のURL）がありません`);
  else if (srcTypeOf(it.src) === "aggregator") errs.push(`${it.id}: src がまとめサイト・個人ブログです（${it.src.slice(0, 60)}）。公式・メーカー・プレスリリース・報道のURLにしてください`);
  if (!SRC_TYPES.includes(it.srcType)) errs.push(`${it.id}: srcType は ${SRC_TYPES.join("|")} のどれか（いま "${it.srcType ?? ""}"）`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(it.verifiedAt || "")) errs.push(`${it.id}: verifiedAt（最後に情報源で確かめた日 YYYY-MM-DD）がありません`);
  if (it.xpost && !/^https:\/\/(x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/status\/\d{5,25}/.test(it.xpost)) errs.push(`${it.id}: xpost は https://x.com/（アカウント）/status/（数字） の形にしてください`);
  // 公式Xの埋め込み：一覧（data/official-x.json）にある公式アカウントのポストだけ
  { const m = /^https:\/\/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\//.exec(it.xpost || ""); if (m && !OFFICIAL_X[m[1].toLowerCase()]) errs.push(`${it.id}: xpost の @${m[1]} は公式アカウントの一覧（data/official-x.json）にありません。公式と確かめてから一覧に足すか、xpost を外してください`); }
  if (it.xpost && !String(it.xpostNote || "").trim()) errs.push(`${it.id}: xpost を入れたときは xpostNote に確かめた内容（投稿日、本文にあった会場・期間など）を書いてください`);
  // グッズは画像を出すための検索語（q）が原則必須。商品を1つに決められないものは qNone に理由を書く（画像なしでよい）
  if (!it.hidden && it.cat !== "event" && it.cat !== "cafe" && !RKM.plan(it) && !String(it.qNone || "").trim()) errs.push(`${it.id}: グッズの検索語 q がない（または「ちいかわ ぬいぐるみ」のような種類名だけ）です。商品名の固有の言葉を入れるか、楽天で同じ商品を特定できない理由を qNone に書いてください`);
  if (it.srcs && (!Array.isArray(it.srcs) || it.srcs.some(u => !/^https:\/\//.test(u)))) errs.push(`${it.id}: srcs は https のURLの配列にしてください`);
}

try {
  for (const n of JSON.parse(read("data/news.json"))) if (n.x && !/^https:\/\/(x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/status\/\d{5,25}/.test(n.x)) errs.push(`news ${n.id}: x は https://x.com/（アカウント）/status/（数字） の形にしてください`);
} catch (e) { errs.push("data/news.json が読めません"); }

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
