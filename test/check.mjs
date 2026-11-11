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
// Yahoo!の出し方（src/affiliate.json）に合わせて確かめる：affiliate=もしも経由で自分のID／plain=もしも経由のリンクが1つも無い／off=Yahoo!リンクが無い
const YMODE = JSON.parse(read("src/affiliate.json")).yahoo;
if (!app.includes(`const YAHOO_MODE = "${YMODE}"`)) errs.push("app.js の YAHOO_MODE が src/affiliate.json と合っていません");
for (const d of pagesToCheck) {
  const h = read(`dist/${d}/index.html`);
  const mo = [...h.matchAll(/href="(https:\/\/af\.moshimo\.com[^"]*)"/g)].map(m => m[1]).filter(u => !/p_id=7702&amp;/.test(u)), yh = [...h.matchAll(/href="(https:\/\/shopping\.yahoo\.co\.jp[^"]*)"/g)];
  if (YMODE === "affiliate") { for (const u of mo) if (!/a_id=5838536&/.test(u.replace(/&amp;/g, "&"))) errs.push(`${d}: もしものIDがちがうリンク ${u.slice(0, 80)}`); }
  else if (mo.length) errs.push(`${d}: yahoo=${YMODE} なのに、もしものリンクが残っています`);
  if (YMODE === "off" && (yh.length || /data-yh/.test(h))) errs.push(`${d}: yahoo=off なのに、Yahoo!のリンクが残っています`);
  if (YMODE === "plain") { for (const m of h.matchAll(/<a [^>]*data-yh[^>]*>/g)) if (/sponsored/.test(m[0]) || !/href="https:\/\/shopping\.yahoo\.co\.jp\//.test(m[0])) errs.push(`${d}: plainのYahoo!リンクにsponsoredが付いているか、直接のURLではありません`); }
}
if (YMODE === "affiliate" && !app.includes('a_id: "5838536"')) errs.push("app.js から もしも（Yahoo!）のIDが消えています");
if (YMODE !== "affiliate") for (const f of ["index.html"]) if (fs.existsSync(`dist/${f}`) && /もしもアフィリエイト/.test(read(`dist/${f}`))) errs.push(`${f}: yahoo=${YMODE} なのに、もしもアフィリエイトの記載が残っています`);
// 国内航空券（グッド・エアーズ／もしも）：素材のとおりのリンクが、承認した条件のページにだけ出ていること
{
  const { airOk, AIR_Q, AIR_TEXT } = await import("../src/air.mjs");
  const { areasOf } = await import("../src/seo.mjs");
  const TODAY = new Date().toISOString().slice(0, 10), isEv = x => x.cat === "event" || x.cat === "cafe";
  const all = JSON.parse(read("data/items.json")), list = (Array.isArray(all) ? all : all.items).filter(x => !x.hidden);
  const wantItems = new Set(list.filter(x => airOk(x, areasOf(x).map(a => a.name), TODAY, isEv)).map(x => x.id));
  const q = AIR_Q.replace(/&/g, "&amp;");
  const gotPages = [];
  const walk = d => { for (const n of fs.readdirSync(d, { withFileTypes: true })) { const f = `${d}/${n.name}`; if (n.isDirectory()) walk(f); else if (n.name.endsWith(".html")) { const h = fs.readFileSync(f, "utf8"); if (/af\.moshimo\.com\/af\/c\/click\?a_id=5849049|data-air/.test(h)) gotPages.push([f, h]); } } };
  walk("dist");
  const gotItems = new Set();
  for (const [f, h] of gotPages) {
    const m = f.match(/^dist\/(items|area)\/([^/]+)\/index\.html$/);
    if (!m) { errs.push(`${f}: 国内航空券のリンクが、詳細ページ・地域ページ以外にあります`); continue; }
    const tags = [...h.matchAll(/<a [^>]*data-air[^>]*>[\s\S]*?<\/a>/g)];
    if (tags.length !== 1) { errs.push(`${f}: 国内航空券のリンクが${tags.length}個あります（1個のはず）`); continue; }
    const t = tags[0][0];
    if (!t.includes(`href="https://af.moshimo.com/af/c/click?${q}"`)) errs.push(`${f}: 国内航空券のリンクが、承認した広告コードとちがいます`);
    if (!/rel="[^"]*sponsored[^"]*"/.test(t) || !/rel="[^"]*nofollow[^"]*"/.test(t) || !/rel="[^"]*noopener[^"]*"/.test(t)) errs.push(`${f}: 国内航空券のリンクの rel（sponsored / nofollow / noopener）が足りません`);
    if (!/referrerpolicy="no-referrer-when-downgrade"/.test(t) || !/ attributionsrc[ >]/.test(t)) errs.push(`${f}: 国内航空券のリンクから referrerpolicy / attributionsrc が消えています`);
    if (!t.includes(`<span class="trip-t">${AIR_TEXT}</span>`)) errs.push(`${f}: 国内航空券の広告文が素材とちがいます（改変しない）`);
    if (!/<span class="tag">PR<\/span>/.test(t)) errs.push(`${f}: 国内航空券のリンクに PR 表記がありません`);
    if (!h.includes(`<img src="https://i.moshimo.com/af/i/impression?${q}" width="1" height="1"`)) errs.push(`${f}: 国内航空券の計測用の画像（impression）がありません`);
    if ((h.match(/i\.moshimo\.com\/af\/i\/impression/g) || []).length !== 1) errs.push(`${f}: 計測用の画像が1個ではありません`);
    if (m[1] === "items") { gotItems.add(decodeURIComponent(m[2])); if (!wantItems.has(decodeURIComponent(m[2]))) errs.push(`${f}: 条件に合わないイベントに国内航空券が出ています`); }
  }
  const wantAreas = new Set(list.filter(x => wantItems.has(x.id)).flatMap(x => areasOf(x).map(a => a.slug)));
  const gotAreas = new Set(gotPages.map(([f]) => f.match(/^dist\/area\/([^/]+)\//)).filter(Boolean).map(m => m[1]));
  for (const a of wantAreas) if (!gotAreas.has(a)) errs.push(`area/${a}: 条件に合うのに国内航空券が出ていません`);
  for (const a of gotAreas) if (!wantAreas.has(a)) errs.push(`area/${a}: 条件に合う掲載がないのに国内航空券が出ています`);
  console.log(`国内航空券：詳細ページ${gotItems.size}件・地域ページ${gotAreas.size}件（${[...gotAreas].join("・")}）`);
  for (const id of wantItems) if (!gotItems.has(id)) errs.push(`items/${id}: 条件に合うのに国内航空券が出ていません`);
}
// 運営者のコラム（/note/）：承認済みの記事が出ていること、AI利用の注記・非公式の注記があること、サイトマップに載っていること
{
  const lock = JSON.parse(read("data/articles.lock.json"));
  if (!fs.existsSync("dist/note/index.html")) errs.push("note/index.html がありません");
  for (const slug of Object.keys(lock)) {
    const f = `dist/note/${slug}/index.html`;
    if (!fs.existsSync(f)) { errs.push(`${f} がありません`); continue; }
    const h = read(f);
    if (!/すべて運営者本人のものです/.test(h) || !/AIを使い/.test(h)) errs.push(`${f}: AI利用の注記（体験・考えは運営者本人のもの、AIは整える補助）がありません`);
    if (!/権利者とは関係のない/.test(h)) errs.push(`${f}: 非公式の注記がありません`);
    if (!/<h1>/.test(h) || /\*\*|^## /m.test(h.replace(/<script[\s\S]*?<\/script>/g, ""))) errs.push(`${f}: Markdownの記号が残っています`);
    if (!read("dist/sitemap.xml").includes(`/note/${slug}/`)) errs.push(`sitemap.xml に /note/${slug}/ がありません`);
  }
}
// カレンダーの今日のマス（.day.today）を隠すCSSがないこと。ヘッダーの「今日」（.topr .today）だけを隠す書き方でないと、スマホでカレンダーの今日が消えて、翌日以降の曜日がずれる（2026-11-05 に発生）
{
  const css = read("src/style.css").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim(), body = m[2];
    if (!/display\s*:\s*none/.test(body)) continue;
    for (const one of sel.split(",").map(x => x.trim())) if (/^\.today\b/.test(one) || /(^|[\s>+~])\.today$/.test(one) && !/\.topr\s+\.today$/.test(one)) errs.push(`style.css: ${one} が display:none で、カレンダーの今日のマス（.day.today）にも当たります`);
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
  { const m = /^https:\/\/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\//.exec(it.xpost || ""); if (m && !OFFICIAL_X[m[1].toLowerCase()] && !(it.xpostVia && OFFICIAL_X[String(it.xpostVia).toLowerCase()])) errs.push(`${it.id}: xpost の @${m[1]} は公式アカウントの一覧（data/official-x.json）にありません。公式と確かめてから一覧に足すか、一覧にある公式アカウントがリポストしたもの（xpostVia にそのアカウント名）だけにしてください`); }
  if (it.xpostVia && !OFFICIAL_X[String(it.xpostVia).toLowerCase()]) errs.push(`${it.id}: xpostVia の @${it.xpostVia} が公式アカウントの一覧にありません`);
  if (it.xpostVia && !it.xpost) errs.push(`${it.id}: xpostVia があるのに xpost がありません`);
  if (it.how !== undefined && (!Array.isArray(it.how) || it.how.length < 1 || it.how.length > 6 || it.how.some(s => typeof s !== "string" || !s.trim() || s.length > 90))) errs.push(`${it.id}: how は、90字以内の文字列を1〜6個の配列にしてください`);
  if (it.how && !/^https:\/\//.test(it.src || "")) errs.push(`${it.id}: how を入れるときは、公式の根拠として src（https）が必要です`);
  if (it.log !== undefined && (!Array.isArray(it.log) || it.log.length > 8 || it.log.some(x => !x || !/^\d{4}-\d{2}-\d{2}$/.test(x.d || "") || typeof x.t !== "string" || !x.t.trim() || x.t.length > 60))) errs.push(`${it.id}: log は {d:"YYYY-MM-DD", t:"60字以内の一言"} の配列（最大8件）にしてください`);
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
// 見張り役のニュース判定：ちいかわと関係のない記事（「ナガノ」を含むだけのものなど）を拾わない
{
  const { CHII } = await import("../worker/index.js");
  for (const t of ["無料パチンコ・パチスロアプリ『777Real』「ナガノアニエラフェスタ2026」出展レポート", "長野県ナガノの観光キャンペーン"]) if (CHII.test(t)) errs.push("ニュース判定がちいかわと関係のない記事を拾う: " + t);
  for (const t of ["ちいかわの新グッズ", "ハチワレのぬいぐるみ", "Chiikawa POP UP", "吉伊卡哇 快閃店"]) if (!CHII.test(t)) errs.push("ニュース判定がちいかわの記事を拾えない: " + t);
}
if (warns.length) console.log("注意（止めはしません）:\n- " + warns.join("\n- "));
if (errs.length) { console.error("チェックNG:\n- " + errs.join("\n- ")); process.exit(1); }
console.log(`チェックOK（${items.length}件）`);
