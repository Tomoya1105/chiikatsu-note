// ニュースの見張りが「もう見た記事」を覚えるための道具（見張り役 worker/ が使う）。
//
// 直した問題（2026-10-13）：Bing ニュースのリンクには tid= という「取得のたびに変わる印」が入っている。
// リンク全体を記事の識別子にしていたため、同じ記事が10分ごとに「新着」になり、
//  ・KV への書き込みが1日に約290回ふえ、
//  ・運営者が送った情報が自動の候補に押し出され、
//  ・PR TIMES など公式の記録が、600件の上限から押し出されていた。
// ここでは、(1) 記事のURLを取り出してそろえ、(2) 情報源ごとに別枠で覚える。

// 取得のたびに変わる・記事の中身に関係ない印（これだけを捨てる。ほかの query は記事の見分けに使うので残す）
const DROP_PARAM = /^(utm_[a-z0-9_]+|fbclid|gclid|yclid|igshid|ref_src|mc_cid|mc_eid|_ga|tid)$/i;

// Bing ニュースの中継リンク（bing.com/news/apiclick.aspx?...&url=<記事のURL>）から、記事のURLを取り出す
function inner(link, depth = 0) {
  let u; try { u = new URL(String(link || "").trim()); } catch (e) { return null; }
  if (depth < 2 && /(^|\.)bing\.com$/i.test(u.hostname) && /\/news\/apiclick/i.test(u.pathname)) {
    const t = u.searchParams.get("url");
    const r = t && inner(t, depth + 1);
    if (r) return r;
  }
  return u;
}

function parts(link) {
  const u = inner(link);
  if (!u) return null;
  u.hash = "";
  for (const k of [...u.searchParams.keys()]) if (DROP_PARAM.test(k)) u.searchParams.delete(k);
  u.searchParams.sort();
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const path = u.pathname.replace(/\/+$/, "") || "";
  return { proto: u.protocol, host, path, search: u.search };
}

// 記事の見分け用（http/https・www・末尾の/・追跡用の印のちがいは同じ記事として扱う）
export function canonKey(link) {
  const p = parts(link);
  if (!p) return String(link || "").trim().slice(0, 200);
  return (p.host + p.path + p.search).slice(0, 200);
}

// 候補の本文に載せる、きれいなURL（Bing の中継リンクではなく、記事そのもの）
export function cleanUrl(link) {
  const p = parts(link);
  if (!p) return String(link || "").trim().slice(0, 300);
  return `${p.proto}//${p.host}${p.path}${p.search}`.slice(0, 300);
}

// ---- 情報源ごとの「見た記事」---- { 情報源のkey: [記事の識別子…（古い順）] }
// 情報源ごとに上限を持つので、ある情報源がたくさん入っても、ほかの情報源の記録は押し出されない
export const SEEN_CAP = 200;
export const seenHas = (store, src, key) => Array.isArray(store[src]) && store[src].includes(key);
export const seenHasAny = (store, key) => Object.values(store).some(a => Array.isArray(a) && a.includes(key));
export function seenAdd(store, src, key) {
  const a = store[src] || (store[src] = []);
  if (a.includes(key)) return false;
  a.push(key);
  if (a.length > SEEN_CAP) a.splice(0, a.length - SEEN_CAP);
  return true;
}

// 旧方式（KV の w:seen:news：「情報源:リンク全体」を600件まで）から引き継ぐ。
// Bing の重複は、記事のURLでまとまる。w:fresh（直近の速報）にあるURLも覚えておく（同じ速報をもう一度出さないため）
export function fromLegacy(legacy, fresh, feeds) {
  const store = {};
  for (const id of Array.isArray(legacy) ? legacy : []) {
    const s = String(id), i = s.indexOf(":");
    if (i < 1) continue;
    seenAdd(store, s.slice(0, i), canonKey(s.slice(i + 1)));
  }
  for (const e of Array.isArray(fresh) ? fresh : []) {
    const f = feeds.find(x => x.name === e.src);
    if (f && e.url && /^https?:/.test(e.url)) seenAdd(store, f.key, canonKey(e.url));
  }
  return store;
}
