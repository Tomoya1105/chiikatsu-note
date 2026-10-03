// 読者からの「情報のまちがい報告」を受け取って保存する（Cloudflare Pages Functions）
// 保存先：KV（名前 REPORTS）。Cloudflare の設定で KV をこのサイトに結び付ける必要があります。
export async function onRequestPost({ request, env }) {
  if (!env.REPORTS) return new Response("not configured", { status: 503 });
  let b;
  try { b = await request.json(); } catch (e) { return new Response("bad request", { status: 400 }); }
  const kinds = ["date", "place", "price", "cancel", "other"];
  const rep = {
    itemId: String(b.itemId || "").slice(0, 100),
    title: String(b.title || "").slice(0, 200),
    kind: kinds.includes(b.kind) ? b.kind : "other",
    text: String(b.text || "").slice(0, 400),
    createdAt: new Date().toISOString(),
    status: "open",
  };
  if (!rep.itemId) return new Response("bad request", { status: 400 });
  const key = `r:${rep.createdAt}:${crypto.randomUUID().slice(0, 8)}`;
  await env.REPORTS.put(key, JSON.stringify(rep), { expirationTtl: 60 * 60 * 24 * 90 });
  return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
}
