// 独自ドメイン（chiikatsunote.com）に1本化する。旧URL（chiikatsu-note.pages.dev）と www 付きから、同じページへ転送（301）する。
// /api/ は転送しない（自動更新・見張り役・通知の仕組みが旧URLでも動き続けるように）。sw.js も転送しない（古いアプリが壊れないように）。
// 楽天APIの許可サイトに新しいドメインを追加済み（2026-10-04）。
const APEX = "chiikatsunote.com";
const REDIRECT = true;
const FROM = new Set(["chiikatsu-note.pages.dev", "www.chiikatsunote.com"]);
export async function onRequest(ctx) {
  const u = new URL(ctx.request.url);
  if (REDIRECT && FROM.has(u.hostname) && !u.pathname.startsWith("/api/") && u.pathname !== "/sw.js") {
    u.protocol = "https:"; u.hostname = APEX; u.port = "";
    return Response.redirect(u.toString(), 301);
  }
  return ctx.next();
}
