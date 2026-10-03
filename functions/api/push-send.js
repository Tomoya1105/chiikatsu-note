// 「ほしい」に入れた予定の前日（mode=eve）・当日（mode=day）にお知らせを送る。
// あわせて、公式通販の予約開始を、予約のお知らせをオンにしている全員に前日・当日に送る。
// mode=rsv&id=… は、予約がすでに始まっていた新しい情報を見つけたときに1回だけ全員に送る。
// 自動更新が ?key=REPORT_KEY&mode=eve|day|rsv で呼ぶ。同じ日の同じ種類は1回だけ送る。
import { sendPush } from "../../src/webpush.js";
const jst = (d = 0) => new Date(Date.now() + 9 * 3600e3 + d * 864e5).toISOString().slice(0, 10);
const isEv = it => it.cat === "event" || it.cat === "cafe";
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
  const starts = new Map(), ends = new Map(), rsvOpen = [];
  for (const it of items) {
    if (mode === "rsv") { if (it.id === rid && it.rsv) rsvOpen.push(it); continue; }
    if (it.rsv && it.rs && it.rs.slice(0, 10) === day) { rsvOpen.push(it); continue; }   // 予約開始
    if (it.sp === "day" && it.s === day && !it.rsv) starts.set(it.id, it);
    if (it.e === day && it.e !== it.s) ends.set(it.id, it);
  }
  const hm = s => (s && s.length > 10 ? s.slice(11, 16) : "");
  const md = s => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return `${m}/${d}`; };
  let sent = 0, gone = 0, users = 0, cursor;
  if (starts.size || ends.size || rsvOpen.length) do {
    const page = await env.REPORTS.list({ prefix: "p:", cursor });
    for (const k of page.keys) {
      const rec = JSON.parse((await env.REPORTS.get(k.name)) || "null"); if (!rec) continue;
      users++;
      const s = rec.want.map(id => starts.get(id)).filter(Boolean), e = rec.want.map(id => ends.get(id)).filter(Boolean);
      const r = rec.rsv === false ? [] : rsvOpen;
      if (!s.length && !e.length && !r.length) continue;
      const w = mode === "eve" ? "明日" : "今日";
      const lines = [
        ...r.map(it => mode === "rsv" ? `予約受付中：${it.t}${it.re ? `（締切 ${md(it.re)} ${hm(it.re)}）` : ""}` : `${w}${hm(it.rs)}から予約開始：${it.t}`),
        ...s.map(it => `${w}${isEv(it) ? "から" : "発売"}：${it.t}`),
        ...e.map(it => `${w}${mode === "eve" ? "で終了" : "まで"}：${it.t}`)];
      const first = r[0] || s[0] || e[0];
      const payload = { title: lines.length > 1 ? `${lines[0]} ほか${lines.length - 1}件` : lines[0], body: lines.length > 1 ? lines.slice(1, 4).join("\n") : (first.place || "くわしくはちい活ノートで"), url: lines.length > 1 ? "/?v=mine" : `/items/${encodeURIComponent(first.id)}/`, tag: `${mode}-${day}` };
      try {
        const st = await sendPush(rec.sub, payload, { privateD: env.VAPID_PRIVATE, subject: "https://chiikatsu-note.pages.dev" });
        if (st === 404 || st === 410) { await env.REPORTS.delete(k.name); gone++; } else if (st < 300) sent++;
      } catch (err) {}
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  await env.REPORTS.put(mark, "1", { expirationTtl: 60 * 60 * 48 });
  return Response.json({ ok: true, mode, day, items: starts.size + ends.size + rsvOpen.length, users, sent, gone });
}
