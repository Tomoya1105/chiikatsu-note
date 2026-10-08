// ニュース速報（見張り役が見つけた、公式の新しい発表）。サイトのニュース欄がすぐに表示するために読む。だれでも読める。
export async function onRequestGet({ env }) {
  if (!env.REPORTS) return Response.json({ items: [] });
  const now = Date.now();
  // 題名にちいかわ関連の言葉がないものは出さない（公式店のお知らせ＝ちいかわもぐもぐ本舗は題名に「ちいかわ」がなくても出す）。
  // 見張り役の判定を直す前に入った、関係のない記事（パチンコなど）もここで消える
  const CHII = /ちいかわ|チイカワ|chiikawa|ハチワレ|吉伊卡哇|치이카와/i;
  const items = JSON.parse((await env.REPORTS.get("w:fresh")) || "[]").filter(x => now - x.at < 48 * 3600e3)
    .filter(x => x.src === "ちいかわもぐもぐ本舗" || CHII.test(x.title || ""))
    .map(({ at, src, title, url }) => ({ at, src, title, url }));
  const st = JSON.parse((await env.REPORTS.get("w:news:status")) || "null");
  return Response.json({ items, checkedAt: st ? st.at : null, sources: st && st.s ? JSON.parse(st.s) : null }, { headers: { "cache-control": "public, max-age=60" } });
}
