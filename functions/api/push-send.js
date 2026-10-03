// 「ほしい」に入れた予定の前日（mode=eve）・当日（mode=day）にお知らせを送る。
// あわせて、公式通販の予約開始を、予約のお知らせをオンにしている人に前日・当日に送る。
// mode=rsv&id=… は、予約がすでに始まっていた新しい情報を見つけたときに1回だけ送る。
// 自動更新が ?key=REPORT_KEY&mode=eve|day|rsv で呼ぶ。同じ日の同じ種類は1回だけ。
// たくさんの人に送るときは、残りを見張り役（worker/）が1分ごとに続けて送る。
import { startJob } from "../../src/push-jobs.js";
const jst = (d = 0) => new Date(Date.now() + 9 * 3600e3 + d * 864e5).toISOString().slice(0, 10);
const pick = it => ({ id: it.id, t: it.t, cat: it.cat, place: it.place || "", rs: it.rs || null, re: it.re || null });

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  if (!env.REPORTS || !env.REPORT_KEY || u.searchParams.get("key") !== env.REPORT_KEY) return new Response("forbidden", { status: 403 });
  if (!env.VAPID_PRIVATE) return Response.json({ ok: false, reason: "VAPID_PRIVATE が未設定" });
  const m0 = u.searchParams.get("mode");
  const mode = m0 === "day" ? "day" : m0 === "rsv" ? "rsv" : "eve";
  const rid = (u.searchParams.get("id") || "").slice(0, 100);
  if (mode === "rsv" && !rid) return Response.json({ ok: false, reason: "id が必要" });
  const day = mode === "eve" ? jst(1) : jst(0);
  const mark = mode === "rsv" ? `ps:rsv:${rid}` : `ps:${jst(0)}:${mode}`;
  if (!u.searchParams.get("force") && await env.REPORTS.get(mark)) return Response.json({ ok: true, skipped: "送信済み" });
  const items = await (await fetch(new URL("/push-items.json", u.origin))).json();
  const starts = [], ends = [], rsv = [];
  for (const it of items) {
    if (mode === "rsv") { if (it.id === rid && it.rsv) rsv.push(pick(it)); continue; }
    if (it.rsv && it.rs && it.rs.slice(0, 10) === day) { rsv.push(pick(it)); continue; }   // 予約開始
    if (it.sp === "day" && it.s === day && !it.rsv) starts.push(pick(it));
    if (it.e === day && it.e !== it.s) ends.push(pick(it));
  }
  await env.REPORTS.put(mark, "1", { expirationTtl: 60 * 60 * 48 });
  if (!starts.length && !ends.length && !rsv.length) return Response.json({ ok: true, mode, day, items: 0, sent: 0 });
  const r = await startJob(env, { type: "daily", mode, day, starts, ends, rsv, at: Date.now() });
  return Response.json({ ok: true, mode, day, items: starts.length + ends.length + rsv.length, ...r });
}
