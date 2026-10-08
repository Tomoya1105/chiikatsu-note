// 読者からの「情報のまちがい報告」と「サイトへのご意見」（itemId "site"）、「載っていない情報の提供」（itemId "tip"）を受け取って保存する（Cloudflare Pages Functions）
// 情報の提供は手がかりとしてだけ使う。自動更新が公式の発表で確かめられたものだけを載せる（ROUTINE.md）
// 保存先：KV（名前 REPORTS）。Cloudflare の設定で KV をこのサイトに結び付ける必要があります。
export async function onRequestPost({ request, env }) {
  if (!env.REPORTS) return new Response("not configured", { status: 503 });
  let b;
  try { b = await request.json(); } catch (e) { return new Response("bad request", { status: 400 }); }
  const kinds = ["date", "place", "price", "cancel", "other", "site", "tip"];
  const rep = {
    itemId: String(b.itemId || "").slice(0, 100),
    title: String(b.title || "").slice(0, 200),
    kind: kinds.includes(b.kind) ? b.kind : "other",
    text: String(b.text || "").slice(0, 600),
    page: String(b.page || "").slice(0, 200),
    url: /^https?:\/\/[^\s<>"]{3,}$/.test(String(b.url || "")) ? String(b.url).slice(0, 500) : "",
    createdAt: new Date().toISOString(),
    status: "open",
  };
  if (!rep.itemId) return new Response("bad request", { status: 400 });
  if (rep.kind === "tip" && rep.text.length < 2 && !rep.url) return new Response("bad request", { status: 400 });
  const key = `r:${rep.createdAt}:${crypto.randomUUID().slice(0, 8)}`;
  await env.REPORTS.put(key, JSON.stringify(rep), { expirationTtl: 60 * 60 * 24 * 90 });
  return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
}
