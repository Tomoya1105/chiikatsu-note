// 「テスト通知を送る」ボタン用。申し込み済みの本人の端末にだけ送る。
import { sendPush, subId } from "../../src/webpush.js";
export async function onRequestPost({ request, env }) {
  if (!env.REPORTS || !env.VAPID_PRIVATE) return new Response("not configured", { status: 503 });
  let b; try { b = await request.json(); } catch (e) { return new Response("bad request", { status: 400 }); }
  const id = await subId(String(b && b.endpoint || ""));
  const rec = JSON.parse((await env.REPORTS.get(`p:${id}`)) || "null");
  if (!rec) return new Response("not found", { status: 404 });
  await env.REPORTS.put("x:lasttest", id, { expirationTtl: 600 });   // 運営者の端末の登録（/api/xdraft?op=claim）に使う
  const st = await sendPush(rec.sub, { title: "ちい活ノート", body: "通知のテストです。「ほしい」に入れた予定の前日と当日にお知らせします。", url: "/?v=mine" }, { privateD: env.VAPID_PRIVATE, subject: "https://chiikatsu-note.pages.dev" });
  return Response.json({ ok: st < 300, status: st });
}
