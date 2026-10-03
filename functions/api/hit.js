// かんたんなアクセス・クリック計測。1回の訪問ぶんの回数をまとめて受け取り、日ごとの合計に足す。
// 個人を特定する情報（IPアドレスなど）は保存しない。保存先は報告と同じ KV（REPORTS）。
const OK = /^(pv:(home|item|other)|tab:(list|cal|mine|shop|news)|st:[a-z]+|c:(rk|rkpre|rksearch|shop|travel|official|news|gcal|rsv)|mark:(want|got)|shopq|install|push:on)$/;
export async function onRequestPost({ request, env }) {
  if (!env.REPORTS) return new Response(null, { status: 204 });
  let b;
  try { b = JSON.parse(await request.text()); } catch (e) { return new Response(null, { status: 400 }); }
  const ev = b && typeof b.ev === "object" ? b.ev : {};
  const add = {};
  for (const [k, v] of Object.entries(ev).slice(0, 40)) if (OK.test(k)) add[k] = Math.min(50, Math.max(0, v | 0));
  if (!Object.keys(add).length) return new Response(null, { status: 204 });
  const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // 日本時間の日付
  const key = `s:${day}`;
  const cur = JSON.parse((await env.REPORTS.get(key)) || "{}");
  for (const [k, v] of Object.entries(add)) cur[k] = (cur[k] || 0) + v;
  cur.visits = (cur.visits || 0) + 1;
  await env.REPORTS.put(key, JSON.stringify(cur), { expirationTtl: 60 * 60 * 24 * 400 });
  return new Response(null, { status: 204 });
}
