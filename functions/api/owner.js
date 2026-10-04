// 運営者ページ（/owner/）用。運営者だけが知っている合言葉（URLの # のあと）で、
// 見つけた情報を送る・投稿案のページを開く・通知を受け取る端末を登録する。
// 合言葉そのものは保存せず、ハッシュ（下の OWNER_HASH）だけを置いている。
import { token } from "./xdraft.js";
import { sendPush } from "../../src/webpush.js";
const OWNER_HASH = "a10f78fbd8ad0dbfa641861a3de409679e8fc7e76bb53cc0e0355411363982e9";
const jstNow = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ");
async function sha256(s) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }

export async function onRequestPost({ request, env }) {
  if (!env.REPORTS) return new Response("not configured", { status: 503 });
  let b; try { b = await request.json(); } catch (e) { return new Response("bad request", { status: 400 }); }
  if (!b || typeof b.t !== "string" || (await sha256(b.t)) !== OWNER_HASH) return Response.json({ ok: false, reason: "合言葉がちがいます" }, { status: 403 });
  const tok = await token(env);
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
    // 直近の日ごとの数字から、7日・28日の合計と割合を出す
    const days = [];
    for (let i = 0; i < 28; i++) {
      const day = new Date(Date.now() + 9 * 3600e3 - i * 864e5).toISOString().slice(0, 10);
      const v = await env.REPORTS.get(`s:${day}`);
      days.push({ day, ...(v ? JSON.parse(v) : {}) });
    }
    const AFF = ["c:rk", "c:rkpre", "c:rksearch", "c:books", "c:shop", "c:travel", "c:yahoo", "c:amazon"];
    const sum = (arr, k) => arr.reduce((a, d) => a + (d[k] || 0), 0);
    const pack = arr => {
      const dev = sum(arr, "u:dev"), visits = sum(arr, "visits"), fav = sum(arr, "u:fav");
      return {
        visits, dev, ret: sum(arr, "u:ret"), fav, saved: sum(arr, "u:saved"), push: sum(arr, "u:push"),
        aff: AFF.reduce((a, k) => a + sum(arr, k), 0), rk: sum(arr, "c:rk") + sum(arr, "c:rkpre") + sum(arr, "c:rksearch") + sum(arr, "c:books") + sum(arr, "c:shop") + sum(arr, "c:travel"), yahoo: sum(arr, "c:yahoo"), amazon: sum(arr, "c:amazon"),
        want: sum(arr, "mark:want"), favp: sum(arr, "fav"), pushOn: sum(arr, "push:on"), install: sum(arr, "install"),
        share: ["share:line", "share:x", "share:copy", "share:nudge"].reduce((a, k) => a + sum(arr, k), 0), nudgeShow: sum(arr, "nudge:show"), nudge: sum(arr, "share:nudge"),
      };
    };
    return Response.json({ ok: true, d7: pack(days.slice(0, 7)), d28: pack(days), since: days.filter(d => d["u:dev"]).map(d => d.day).pop() || null, daily: days.slice(0, 14).map(d => ({ day: d.day, visits: d.visits || 0, dev: d["u:dev"] || 0 })) });
  }
  return Response.json({ ok: false, reason: "op が必要" });
}
