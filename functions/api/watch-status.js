// 見張り役（worker/）が動いているかの確認用（運営者と自動更新だけ）。?key=REPORT_KEY
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  if (!env.REPORTS || !env.REPORT_KEY || u.searchParams.get("key") !== env.REPORT_KEY) return new Response("forbidden", { status: 403 });
  const snap = JSON.parse((await env.REPORTS.get("w:market")) || "null");
  const jobs = JSON.parse((await env.REPORTS.get("jobs")) || "[]");
  const err = await env.REPORTS.get("w:err");
  const list = snap ? Object.entries(snap) : [];
  const latest = list.reduce((m, [, v]) => Math.max(m, v.s || 0), 0);
  const rsvOpen = list.filter(([, v]) => v.r && v.a).map(([h, v]) => ({ h, t: v.t })).slice(0, 10);
  return Response.json({
    watching: !!snap, products: list.length,
    lastChange: latest ? new Date(latest + 9 * 3600e3).toISOString().replace("T", " ").slice(0, 16) + "（日本時間）" : null,
    reservationsOpenNow: rsvOpen, jobsWaiting: jobs.length, lastError: err,
  }, { headers: { "cache-control": "no-store" } });
}
