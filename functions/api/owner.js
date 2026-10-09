// 運営者ページ（/owner/）用。運営者だけが知っている合言葉（URLの # のあと）で、
// 見つけた情報を送る・投稿案のページを開く・通知を受け取る端末を登録する。
// 合言葉そのものは保存せず、ハッシュ（下の OWNER_HASH）だけを置いている。
import { token } from "./xdraft.js";
import { sendPush } from "../../src/webpush.js";
import { REDUCE, STOP, jstDay, cfDay } from "./hit.js";
const OWNER_HASH = "a10f78fbd8ad0dbfa641861a3de409679e8fc7e76bb53cc0e0355411363982e9";
const jstNow = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ");
async function sha256(s) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch (e) { return new Response("bad request", { status: 400 }); }
  if (!b || typeof b.t !== "string" || (await sha256(b.t)) !== OWNER_HASH) return Response.json({ ok: false, reason: "合言葉がちがいます" }, { status: 403 });
  if (!env.REPORTS && b.op !== "stats") return new Response("not configured", { status: 503 });   // 確認用（プレビュー）では KV がないので、数字を見ることだけできる
  const tok = b.op === "stats" ? "" : await token(env);
  if (b.op === "page") return Response.json({ ok: true, url: `/api/xdraft?tok=${tok}` });
  if (b.op === "tip") {
    const text = String(b.text || "").trim().slice(0, 2000);
    if (!text) return Response.json({ ok: false, reason: "空です" });
    const tips = JSON.parse((await env.REPORTS.get("x:tips")) || "[]");
    tips.push({ id: Date.now().toString(36), at: jstNow(), text });
    await env.REPORTS.put("x:tips", JSON.stringify(tips.slice(-50)));
    return Response.json({ ok: true, count: tips.length });
  }
  if (b.op === "claim") {
    const id = await env.REPORTS.get("x:lasttest");
    if (!id) return Response.json({ ok: false, reason: "先にアプリで「テスト通知を送る」を押してください（押してから10分以内）" });
    const owners = JSON.parse((await env.REPORTS.get("x:owners")) || "[]");
    if (!owners.includes(id)) owners.unshift(id);
    await env.REPORTS.put("x:owners", JSON.stringify(owners.slice(0, 5)));
    await env.REPORTS.delete("x:lasttest");
    let sent = false;
    const rec = JSON.parse((await env.REPORTS.get(`p:${id}`)) || "null");
    if (rec && env.VAPID_PRIVATE) { try { sent = (await sendPush(rec.sub, { title: "投稿案の通知を登録しました", body: "これから朝・昼・夜に、Xの投稿案ができたらお知らせします。", url: `/api/xdraft?tok=${tok}`, tag: "x-claim" }, { privateD: env.VAPID_PRIVATE, subject: "https://chiikatsunote.com" })) < 300; } catch (e) {} }
    return Response.json({ ok: true, sent });
  }
  if (b.op === "stats") {
    // 新方式（D1）：日ごとの合計と、計測の状態（接続・最終記録時刻・上限）。旧方式（KV）の数字は参考として別に返す
    const now = Date.now(), day0 = jstDay(now), from = jstDay(now - 27 * 864e5);
    const st = { binding: !!env.STATSDB, ok: false, env: null, want: new URL(request.url).hostname === "chiikatsunote.com" ? "production" : "preview", days: [], rows: [], err: null };
    try { if (env.REPORTS) st.err = JSON.parse((await env.REPORTS.get("stats:err")) || "null"); } catch (e) {}
    if (env.STATSDB) {
      try {
        // 書き込み量の1日は Cloudflare の区切り（UTC 0時＝日本の朝9時）。表の集計の日（日本の日付）とは別に持つ
        const fromCf = cfDay(now - 28 * 864e5);
        const meta = (await env.STATSDB.prepare("SELECT k, v, t FROM meta WHERE k = 'env' OR substr(k, 3) >= ?1").bind(fromCf).all()).results || [];
        const er = meta.find(r => r.k === "env"); st.env = er ? er.t : null;
        const mv = k => meta.find(r => r.k === k);
        st.rows = ((await env.STATSDB.prepare("SELECT day, seg, k, n FROM daily WHERE day >= ?1").bind(from).all()).results || []).map(r => [r.day, r.seg, r.k, r.n]);
        const hasRows = new Set(st.rows.map(r => r[0]));
        const c0 = cfDay(now), w0 = mv("w:" + c0), m0 = mv("m:" + c0);
        st.cf = { day: c0, w: w0 ? w0.v : 0, last: w0 ? w0.t : null, mode: m0 ? m0.v : 0, modeAt: m0 ? m0.t : null };
        for (let i = 0; i < 28; i++) {
          const d = jstDay(now - i * 864e5), c2 = cfDay(new Date(d + "T00:00:00Z").getTime()), c1 = cfDay(new Date(d + "T00:00:00Z").getTime() - 864e5);
          // 日本の1日は、Cloudflareの2つの「1日」にまたがる（朝9時までと、朝9時から）。どちらかで止まっていれば、その日は一部が止まっていた
          const ms = [mv("m:" + c1), mv("m:" + c2)].filter(Boolean), md = ms.reduce((a, r) => r.v > a ? r.v : a, 0);
          const lasts = [mv("w:" + c1), mv("w:" + c2)].filter(r => r && r.t && r.t.slice(0, 10) === d).map(r => r.t).sort();
          st.days.push({ day: d, w: hasRows.has(d) ? 1 : 0, last: lasts.length ? lasts[lasts.length - 1] : null, mode: md, modeAt: (ms.find(r => r.v === md) || {}).t || null });
        }
        st.ok = true;
      } catch (e) { st.dbErr = String(e && e.message || e).slice(0, 200); }
    }
    st.limits = { reduce: REDUCE, stop: STOP }; st.today = day0;
    // 旧方式（10/5〜切り替え日。テストを含む・定義がちがう参考値）
    const days = [];
    for (let i = 0; i < 28; i++) {
      const day = jstDay(now - i * 864e5);
      const v = env.REPORTS ? await env.REPORTS.get(`s:${day}`) : null;
      if (v) days.push({ day, ...JSON.parse(v) });
    }
    const AFF = ["c:rk", "c:rkpre", "c:rksearch", "c:books", "c:shop", "c:travel", "c:yahoo", "c:amazon"];
    const sum = (arr, k) => arr.reduce((a, d) => a + (d[k] || 0), 0);
    const legacy = days.length ? {
      from: days[days.length - 1].day, to: days[0].day, visits: sum(days, "visits"), dev: sum(days, "u:dev"), ret: sum(days, "u:ret"), fav: sum(days, "u:fav"), push: sum(days, "u:push"),
      aff: AFF.reduce((a, k) => a + sum(days, k), 0), rk: sum(days, "c:rk") + sum(days, "c:rkpre") + sum(days, "c:rksearch") + sum(days, "c:books") + sum(days, "c:shop") + sum(days, "c:travel"), yahoo: sum(days, "c:yahoo"), amazon: sum(days, "c:amazon"),
      want: sum(days, "mark:want"), share: ["share:line", "share:x", "share:copy", "share:nudge"].reduce((a, k) => a + sum(days, k), 0),
    } : null;
    return Response.json({ ok: true, stats: st, legacy });
  }
  return Response.json({ ok: false, reason: "op が必要" });
}
