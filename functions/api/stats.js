// 日ごとのアクセス・クリック数（運営者と自動更新だけが見る）。?key= に REPORT_KEY、&days= で日数（初期値14）。
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  if (!env.REPORTS || !env.REPORT_KEY || u.searchParams.get("key") !== env.REPORT_KEY) return new Response("forbidden", { status: 403 });
  const days = Math.min(90, Math.max(1, +u.searchParams.get("days") || 14));
  const out = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(Date.now() + 9 * 3600e3 - i * 864e5).toISOString().slice(0, 10);
    const v = await env.REPORTS.get(`s:${day}`);
    out.push({ day, ...(v ? JSON.parse(v) : {}) });
  }
  return new Response(JSON.stringify(out, null, 1), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
