// 画像の台帳とその点検。
// 画像は保存しない。ここに記録するのは「どの情報に、どこの画像を、どんな根拠で、どこへのリンクで出したか」だけ。
//   POST /api/visuals            … 端末が楽天で同じ商品を見つけて画像を出したときの記録（1日1回まで）
//   GET  /api/visuals            … 表示率の集計と、情報ごとの記録（取得元・利用根拠・リンク先）
//   GET  /api/visuals?audit=1    … サーバーから楽天APIとXの埋め込み可否を確かめ直す。1回に5件ずつ（続きは次の呼び出しで）
import { RKM } from "../../src/rkmatch.mjs";

const AFF = "582a6f7f.e1ade2b2.582a6f84.d5f85faa";
const RAK = { app: "d328e43a-4e55-4bd7-8ce4-f265afcf674d", key: "pk_xcGUmu6xmFCHvq4iCebKJjAiwMb2IAKrSJhQgGb49vo", ep: "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701" };
const RK_SRC = "楽天市場（楽天ウェブサービス 商品検索API）";
const RK_BASIS = "楽天ウェブサービス利用規約・楽天アフィリエイト。APIが返す楽天の画像URLをそのまま表示（画像の保存・加工はしない）";
const X_BASIS = "X公式の埋め込み（ポストを丸ごと表示。画像の保存・切り抜きはしない）";
const IMG_OK = /^https:\/\/(thumbnail\.image|shop\.r10s|tshop\.r10s|image)\.rakuten\.co\.jp\//;
const LINK_OK = u => typeof u === "string" && u.startsWith(`https://hb.afl.rakuten.co.jp/hgc/${AFF}/`);
const json = (o, s = 200) => new Response(JSON.stringify(o, null, 1), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });

async function ledger(request, env) {
  const r = await env.ASSETS.fetch(new URL("/visuals.json", request.url));
  return r.ok ? (await r.json()).items || [] : [];
}

export async function onRequestPost({ request, env }) {
  if (!env.REPORTS) return new Response(null, { status: 204 });
  let b; try { b = JSON.parse(await request.text()); } catch (e) { return new Response(null, { status: 400 }); }
  if (!b || typeof b.id !== "string" || !LINK_OK(b.link) || (b.img && !IMG_OK.test(b.img))) return new Response(null, { status: 400 });
  const it = (await ledger(request, env)).find(x => x.id === b.id);
  if (!it || !it.rakuten) return new Response(null, { status: 404 });
  // 端末の判定をうのみにせず、同じ判定をもう一度通す
  if (!RKM.pick({ t: it.t, q: it.q, price: it.price, cat: it.cat }, [{ name: String(b.name || ""), price: +b.price || 0 }])) return new Response(null, { status: 422 });
  const key = `v:rk:${b.id}`, cur = JSON.parse((await env.REPORTS.get(key)) || "null");
  if (cur && cur.link === b.link && Date.now() - Date.parse(cur.at) < 12 * 3600e3) return new Response(null, { status: 204 });
  await env.REPORTS.put(key, JSON.stringify({ kind: "rakuten", src: RK_SRC, basis: RK_BASIS, name: String(b.name).slice(0, 200), price: +b.price || 0, link: b.link, img: b.img || "", by: "端末", at: new Date().toISOString() }), { expirationTtl: 60 * 60 * 24 * 14 });
  return new Response(null, { status: 204 });
}

async function audit(items, env) {
  const out = { rakutenErrors: 0, rakutenChecked: 0, xChecked: 0 };
  let last = 0;
  for (const it of items) {
    if (it.rakuten) {
      const wait = last + 1300 - Date.now(); if (wait > 0) await new Promise(r => setTimeout(r, wait));
      last = Date.now();
      const qs = new URLSearchParams({ applicationId: RAK.app, accessKey: RAK.key, affiliateId: AFF, format: "json", formatVersion: "2", availability: "1", imageFlag: "1", NGKeyword: "中古 USED 美品", keyword: it.rakuten.query, hits: "10" });
      try {
        const get = () => fetch(`${RAK.ep}?${qs}`, { headers: { Referer: "https://chiikatsunote.com/", Origin: "https://chiikatsunote.com" } });
        let r = await get();
        if (r.status === 429) { await new Promise(x => setTimeout(x, 1600)); last = Date.now(); r = await get(); }   // 混んでいたら少し待ってもう一度
        out.rakutenChecked++;
        if (!r.ok) { out.rakutenErrors++; out.lastRakutenStatus = r.status; out.lastRakutenBody = (await r.text()).slice(0, 200); continue; }
        const list = ((await r.json()).Items || []).map(i => { const x = i.Item || i; let img = (x.mediumImageUrls || [])[0]; if (img && typeof img === "object") img = img.imageUrl;
          return { name: x.itemName || "", price: +x.itemPrice || 0, img: img ? img.replace(/\?_ex=\d+x\d+/, "") + "?_ex=400x400" : "", link: (x.affiliateUrl || "").includes("hb.afl.rakuten.co.jp") ? x.affiliateUrl : `https://hb.afl.rakuten.co.jp/hgc/${AFF}/?pc=${encodeURIComponent(x.itemUrl || "")}` }; });
        const h = RKM.pick({ t: it.t, q: it.q, price: it.price, cat: it.cat }, list);
        if (h && IMG_OK.test(h.img)) await env.REPORTS.put(`v:rk:${it.id}`, JSON.stringify({ kind: "rakuten", src: RK_SRC, basis: RK_BASIS, name: h.name.slice(0, 200), price: h.price, link: h.link, img: h.img, by: "点検", at: new Date().toISOString() }), { expirationTtl: 60 * 60 * 24 * 14 });
        else await env.REPORTS.delete(`v:rk:${it.id}`);
      } catch (e) { out.rakutenErrors++; out.lastRakutenError = String(e).slice(0, 200); }
    }
    if (it.x) {
      // 削除・非公開のポストは X の oEmbed が 404 などを返す
      try {
        const r = await fetch(`https://publish.twitter.com/oembed?omit_script=1&url=${encodeURIComponent(it.x.url)}`);
        out.xChecked++;
        await env.REPORTS.put(`v:x:${it.id}`, JSON.stringify({ kind: "x", ok: r.ok, status: r.status, src: `${it.x.account}のXの投稿`, basis: X_BASIS, link: it.x.url, at: new Date().toISOString() }), { expirationTtl: 60 * 60 * 24 * 14 });
      } catch (e) {}
    }
  }
  return out;
}

export async function onRequestGet({ request, env }) {
  if (!env.REPORTS) return json({ ok: false, reason: "not configured" }, 503);
  const items = await ledger(request, env);
  const u = new URL(request.url);
  let auditInfo = null;
  if (u.searchParams.get("audit") === "1") {
    // 時間切れにならないよう、点検が必要な情報を5件ずつ順番に確かめる（cursor を KV に覚える）
    const ids = (u.searchParams.get("ids") || "").split(",").filter(Boolean);
    const targets = items.filter(it => (it.rakuten || it.x) && (!ids.length || ids.includes(it.id)));
    const lock = await env.REPORTS.get("v:auditLock");
    if (lock && Date.now() - +lock < 20e3) auditInfo = { skipped: "ほかの点検が動いています。20秒後にもう一度" };
    else {
      await env.REPORTS.put("v:auditLock", String(Date.now()), { expirationTtl: 60 });
      let cur = ids.length ? 0 : +(await env.REPORTS.get("v:auditCursor")) || 0; if (cur >= targets.length) cur = 0;
      const batch = targets.slice(cur, cur + 4);
      auditInfo = await audit(batch, env);
      const next = cur + batch.length;
      if (!ids.length) await env.REPORTS.put("v:auditCursor", String(next >= targets.length ? 0 : next));
      auditInfo.range = `${cur + 1}〜${next} / ${targets.length}件`; auditInfo.done = next >= targets.length;
      await env.REPORTS.delete("v:auditLock");
    }
  }
  const rows = [];
  for (const it of items) {
    const rk = it.rakuten ? JSON.parse((await env.REPORTS.get(`v:rk:${it.id}`)) || "null") : null;
    const xv = it.x ? JSON.parse((await env.REPORTS.get(`v:x:${it.id}`)) || "null") : null;
    const xOk = !!(it.x && (!xv || xv.ok));   // まだ確かめていないものは表示できる扱い（端末側でも読めなければ消える）
    const visual = rk ? "rakuten" : xOk ? "x" : "none";
    rows.push({ id: it.id, t: it.t, event: it.event, visual,
      image: rk ? { src: rk.src, basis: rk.basis, link: rk.link, img: rk.img, name: rk.name, at: rk.at, by: rk.by } : null,
      x: it.x ? { src: `${it.x.account}のXの投稿`, basis: X_BASIS, link: it.x.url, note: it.x.note || "", checked: xv ? (xv.ok ? "表示できる" : `表示できない（${xv.status}）`) : "未確認" } : null,
      none: visual === "none" ? (it.qNone || (it.event ? "公式Xの投稿がまだ登録されていない" : it.rakuten ? "楽天で同じ商品が見つかっていない" : "検索語がない")) : undefined });
  }
  const goods = rows.filter(r => !r.event), events = rows.filter(r => r.event);
  const pct = (a, b) => b ? Math.round(a / b * 1000) / 10 : 0;
  const summary = {
    goods: goods.length, goodsWithImage: goods.filter(r => r.image).length, goodsImageRate: pct(goods.filter(r => r.image).length, goods.length),
    events: events.length, eventsWithX: events.filter(r => r.visual === "x" || (r.x && r.x.checked !== "表示できない")).length,
    all: rows.length, allVisual: rows.filter(r => r.visual !== "none").length,
  };
  summary.eventXRate = pct(summary.eventsWithX, summary.events);
  summary.allVisualRate = pct(summary.allVisual, summary.all);
  summary.noVisual = summary.all - summary.allVisual;
  if (u.searchParams.get("format") === "csv") {
    // スプレッドシートで開ける形（chiikatsu-visuals.xlsx の「情報ごとの状況」と同じ列）
    const q = s => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const head = ["ID", "名前", "区分", "ビジュアル", "取得元", "利用根拠", "リンク先", "楽天で一致した商品名", "確認内容", "表示の確認", "画像なしの理由", "記録日時"];
    const lines = rows.map(r => [r.id, r.t, r.event ? "イベント" : "グッズ", r.visual === "rakuten" ? "楽天の商品画像" : r.visual === "x" ? "公式Xの投稿" : "なし",
      r.image ? r.image.src : r.x ? r.x.src : "", r.image ? r.image.basis : r.x ? r.x.basis : "", r.image ? r.image.link : r.x ? r.x.link : "",
      r.image ? r.image.name : "", r.x ? r.x.note : "", r.x ? r.x.checked : "", r.none || "", r.image ? r.image.at : ""].map(q).join(","));
    return new Response("\uFEFF" + [head.map(q).join(","), ...lines].join("\r\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=chiikatsu-visuals.csv", "cache-control": "no-store", "x-robots-tag": "noindex" } });
  }
  return json({ ok: true, at: new Date().toISOString(), audit: auditInfo, summary, items: rows });
}
