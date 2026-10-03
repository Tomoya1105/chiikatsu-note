// 届いた報告の一覧（運営者と毎朝の更新処理だけが使う）。?key= に環境変数 REPORT_KEY と同じ値が必要。
export async function onRequestGet({ request, env }) {
  const key = new URL(request.url).searchParams.get("key");
  if (!env.REPORTS || !env.REPORT_KEY || key !== env.REPORT_KEY) return new Response("forbidden", { status: 403 });
  const list = await env.REPORTS.list({ prefix: "r:" });
  const out = [];
  for (const k of list.keys) {
    const v = await env.REPORTS.get(k.name);
    if (v) out.push({ key: k.name, ...JSON.parse(v) });
  }
  return new Response(JSON.stringify(out, null, 1), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
