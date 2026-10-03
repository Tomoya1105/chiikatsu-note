// 見張り役が読んでおいた、ちいかわインフォの文字（自動更新が使う）。?key=REPORT_KEY&p=pus|top
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  if (!env.REPORTS || !env.REPORT_KEY || u.searchParams.get("key") !== env.REPORT_KEY) return new Response("forbidden", { status: 403 });
  const p = u.searchParams.get("p") === "top" ? "top" : "pus";
  const v = JSON.parse((await env.REPORTS.get(`w:info:${p}`)) || "null");
  if (!v) return new Response("まだ読み込まれていません（見張り役が30分ごとに読みます）", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const at = new Date(v.at + 9 * 3600e3).toISOString().replace("T", " ").slice(0, 16);
  return new Response(`取得元：${v.url}\n最後に内容が変わった時刻：${at}（日本時間）\n\n${v.text}`, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
