// 通知の申し込み・解除・「ほしい」リストの更新。保存先は KV（REPORTS）の p:<id>。
import { PUSH_HOSTS, subId } from "../../src/webpush.js";
export async function onRequestPost({ request, env }) {
  if (!env.REPORTS) return new Response("not configured", { status: 503 });
  let b; try { b = await request.json(); } catch (e) { return new Response("bad request", { status: 400 }); }
  const sub = b && b.sub;
  if (!sub || typeof sub.endpoint !== "string" || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return new Response("bad request", { status: 400 });
  let host; try { host = new URL(sub.endpoint).hostname; } catch (e) { return new Response("bad request", { status: 400 }); }
  if (!PUSH_HOSTS.test(host)) return new Response("bad request", { status: 400 });
  const id = await subId(sub.endpoint);
  if (b.off) { await env.REPORTS.delete(`p:${id}`); return Response.json({ ok: true, off: true }); }
  const want = Array.isArray(b.want) ? b.want.filter(x => typeof x === "string").slice(0, 300).map(x => x.slice(0, 100)) : [];
  const CH = ["ちいかわ", "ハチワレ", "うさぎ", "モモンガ", "くりまんじゅう", "ラッコ", "シーサー", "古本屋"];
  const chars = Array.isArray(b.chars) ? b.chars.filter(c => CH.includes(c)) : [];
  const rec = { rsv: b.rsv !== false, news: b.news !== false, chars, sub: { endpoint: sub.endpoint, keys: { p256dh: String(sub.keys.p256dh).slice(0, 200), auth: String(sub.keys.auth).slice(0, 100) } }, want, at: new Date().toISOString() };
  await env.REPORTS.put(`p:${id}`, JSON.stringify(rec), { expirationTtl: 60 * 60 * 24 * 180 });
  return Response.json({ ok: true, id });
}
