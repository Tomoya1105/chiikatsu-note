// かんたんなアクセス・クリック計測（段階0）。1ページぶんの回数をまとめて受け取り、D1（STATSDB）の「日ごとの合計」に足す。
// ・保存するのは 日付 × 区分（一般 g／テスト t）× 項目 の合計だけ。端末を見分ける番号・個人の操作履歴・IPアドレスは保存しない。
// ・足し算はD1の中で1回で行う（ON CONFLICT DO UPDATE）ので、同時に人が来ても数字は消えない。
// ・D1の無料枠（書き込み1日10万行・アカウント全体で検定と共有。UTC 0時＝日本の朝9時に切り替わる）を守るため、その区切りの1日の書き込みが
//   REDUCE 行を超えたら「大事な項目だけ」に縮小、STOP 行を超えたらその日は記録しない（推定値は作らない）。
// ・どんな失敗でも 204 を返すだけ。サイト本体・通知の登録などには影響しない。KV には書かない（エラーの記録だけ、30分に1回まで）。
import { IDS as ID_LIST } from "./_ids.js";   // 掲載中の商品ID（build.mjs が公開のたびに作る）

export const REDUCE = 30000, STOP = 45000;
const IDS = new Set(ID_LIST);
// 大事な項目（縮小中も記録する）：訪問の流れ・購入先クリック・♡・ご案内・端末の数
export const CORE = /^(v:(new|hs|x)|f:(h|i|hi|b|ib|lb|w|xi|xb|xw)|b:(list|item|mine|shop|sum):(off|rsv|rk|yh|am)|bi:.+|mark:want|ob:(show|done|skip|close|add|help)|u:(dev|wk|wkret|app|fav|push)|push:on)$/;
// それ以外の項目（ふだんは記録、縮小中は省く）
export const DETAIL = /^(pv:(home|item|other)|tab:(list|cal|mine|shop|news)|st:[a-z]{2,12}|o:(info|travel|gcal|news|fresh|dl)|mark:got|fav|shopq|install|x:embed|nudge:show|share:(nudge|line|x|copy)|u:(ret|saved)|tip:(open|send)|ins:(intro|bar:want)|ob:(s2|s3|want|item))$/;
export function okKey(k){ if (k.startsWith("bi:")) return IDS.has(k.slice(3)); return CORE.test(k) || DETAIL.test(k); }

export const jstDay = (ms = Date.now()) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
// D1の無料枠（書き込み1日10万行）は UTC の0時（日本の朝9時）で切り替わる。書き込み量の数え方・縮小・停止は、この区切り（cfDay）に合わせる。表の集計（日ごとの合計）は日本の日付のまま
export const cfDay = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10);
const jstNow = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ");
// この isolate（サーバーの1つの実行単位）が覚えておくこと。止まった日は D1 を読まずに返す
let memo = { day: "", stop: false };

export function pick(ev, mode){
  const out = []; let bi = 0;
  for (const [k, raw] of Object.entries(ev || {}).slice(0, 60)) {
    if (typeof k !== "string" || k.length > 80 || !okKey(k)) continue;
    if (mode === 1 && !CORE.test(k)) continue;
    if (k.startsWith("bi:") && ++bi > 3) continue;
    const v = Math.min(50, Math.max(0, raw | 0)); if (!v) continue;
    out.push([k, v]); if (out.length >= 40) break;
  }
  return out;
}

export async function record(db, body, host, now = Date.now()){
  const day = jstDay(now), cd = cfDay(now);
  if (memo.day !== cd) memo = { day: cd, stop: false };
  if (memo.stop) return { skip: "stop" };
  const meta = (await db.prepare("SELECT k, v, t FROM meta WHERE k IN ('env', ?1, ?2)").bind("w:" + cd, "m:" + cd).all()).results || [];
  const get = k => meta.find(r => r.k === k);
  // 本番の画面からは本番用、それ以外（プレビュー）からは確認用のデータベースにだけ書く（つなぎ間違いで混ざらないように）
  const want = host === "chiikatsunote.com" ? "production" : "preview", envRow = get("env");
  if (!envRow || envRow.t !== want) return { skip: "env" };
  const used = (get("w:" + cd) || {}).v || 0, mrow = get("m:" + cd), mode = used >= STOP ? 2 : used >= REDUCE ? 1 : 0;
  const setMode = m => db.prepare("INSERT INTO meta (k, v, t) VALUES (?1, ?2, ?3) ON CONFLICT (k) DO UPDATE SET v = excluded.v, t = excluded.t WHERE meta.v < excluded.v").bind("m:" + cd, m, jstNow()).run();
  if (mode === 2) { memo.stop = true; if (!mrow || mrow.v < 2) await setMode(2); return { skip: "stop" }; }
  if (mode === 1 && (!mrow || mrow.v < 1)) await setMode(1);
  const seg = body && body.t === 1 ? "t" : "g";
  const rows = pick(body && body.ev, mode);
  if (!rows.length) return { wrote: 0 };
  const up = db.prepare("INSERT INTO daily (day, seg, k, n) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (day, seg, k) DO UPDATE SET n = n + excluded.n");
  const res = await db.batch(rows.map(([k, v]) => up.bind(day, seg, k, v)));
  // Cloudflare が数えた書き込み行数をそのまま足す（＋この記録自体のぶんとして 2 を多めに見積もる）
  const wrote = res.reduce((a, r) => a + ((r && r.meta && r.meta.rows_written) || 0), 0) + 2;
  await db.prepare("INSERT INTO meta (k, v, t) VALUES (?1, ?2, ?3) ON CONFLICT (k) DO UPDATE SET v = v + excluded.v, t = excluded.t").bind("w:" + cd, wrote, jstNow()).run();
  // その日の最初の記録のついでに、400日より古い合計を片付ける
  if (!get("w:" + cd)) {
    const cut = jstDay(now - 400 * 864e5), cutCf = cfDay(now - 400 * 864e5);
    await db.batch([db.prepare("DELETE FROM daily WHERE day < ?1").bind(cut), db.prepare("DELETE FROM meta WHERE (k LIKE 'w:%' OR k LIKE 'm:%') AND substr(k, 3) < ?1").bind(cutCf)]);
  }
  return { wrote, mode, seg };
}

// 計測が失敗したことだけを KV に残す（運営者メニューで「計測できなかった」と分かるように）。30分に1回まで
let lastErr = 0;
async function noteErr(env, e){
  try {
    if (!env.REPORTS || Date.now() - lastErr < 30 * 60e3) return;
    lastErr = Date.now();
    const cur = JSON.parse((await env.REPORTS.get("stats:err")) || "null");
    if (cur && Date.now() - cur.ms < 30 * 60e3) return;
    await env.REPORTS.put("stats:err", JSON.stringify({ ms: Date.now(), at: jstNow(), msg: String(e && e.message || e).slice(0, 200) }), { expirationTtl: 60 * 60 * 24 * 30 });
  } catch (e2) {}
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.STATSDB) return new Response(null, { status: 204 });
    let b; try { b = JSON.parse(await request.text()); } catch (e) { return new Response(null, { status: 204 }); }
    if (!b || typeof b.ev !== "object") return new Response(null, { status: 204 });
    await record(env.STATSDB, b, new URL(request.url).hostname);
  } catch (e) { await noteErr(env, e); }
  return new Response(null, { status: 204 });
}
