// ちいかわ検定：受験結果を受け取り、サーバーで採点し直して D1（QUIZDB）に1行保存し、みんなの成績（平均・上位％）を返す。
// 通信はこの1回だけ。データベースが使えないときも、エラーにせず「保存できなかった」と返す（クイズの結果表示は止めない）。
//
// 大量送信への備え（どれも無料）：
//  1. 送信元のページ（Origin）が、ちい活ノートか、そのプレビューでなければ受け付けない（D1 に触る前に断る）
//  2. 本番と確認用の記録が混ざらないよう、データベースに書いた「本番／確認用」の印と、送信先のドメインが合うときだけ保存する
//  3. 同じ端末からの保存は1日 DEV_DAY_MAX 回まで
//  4. 全体の保存は1日 DAY_MAX 回まで（D1 無料枠の書き込み1日10万行を、検定が使い切らないための上限。超えた分も点数は返す）
//  5. 同じ受験番号は2回保存しない（主キー）
// さらに、Cloudflare の無料のレート制限ルール（WAF）で、同じIPからの連続送信を Functions に届く前に止める（設定は運営者が行う）。
import { QUIZ_VER, grade, validPicks, statsOf, MIN_SEC, MAX_SEC } from "../../../src/quizcore.mjs";

export const PROD_HOST = "chiikatsunote.com";
export const DAY_MAX = 8000;      // 1日に保存する受験の上限（1件あたり書き込み約5行 → 最大約4万行）
export const DEV_DAY_MAX = 10;    // 同じ端末から1日に保存する上限

const J = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const ID = /^[a-z0-9-]{16,40}$/;

export function originOk(origin) {
  if (!origin) return false;
  let u; try { u = new URL(origin); } catch (e) { return false; }
  if (u.protocol === "https:" && (u.hostname === PROD_HOST || u.hostname === "chiikatsu-note.pages.dev" || u.hostname.endsWith(".chiikatsu-note.pages.dev"))) return true;
  return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
}
// データベースの印（meta.env）と送信先のドメインが合うか。印がないデータベースには書かない
export function envMatches(dbEnv, host) {
  if (dbEnv === "production") return host === PROD_HOST;
  if (dbEnv === "preview") return host !== PROD_HOST;
  return false;
}
const jstDay = () => Number(new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, ""));

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("origin");
  if (!originOk(origin) && origin !== new URL(request.url).origin) return J({ ok: false, error: "origin" }, 403);
  const text = await request.text();
  if (text.length > 4000) return J({ ok: false, error: "too_large" }, 413);
  let b; try { b = JSON.parse(text); } catch (e) { return J({ ok: false, error: "bad_json" }, 400); }
  if (!b || b.ver !== QUIZ_VER) return J({ ok: false, error: "old_version" }, 409);
  if (!ID.test(b.id || "") || !ID.test(b.dev || "")) return J({ ok: false, error: "bad_id" }, 400);
  if (!validPicks(b.picks)) return J({ ok: false, error: "bad_picks" }, 400);
  const dur = Math.max(0, Math.min(86400, b.dur | 0));
  const g = grade(b.picks);   // ブラウザが送ってきた点数は使わない
  const result = { ok: true, score: g.score, saved: false, stats: null };
  const db = env.QUIZDB;
  if (!db) return J(result);
  try {
    const host = new URL(request.url).hostname, day = jstDay(), since = Math.floor(Date.now() / 1000) - 86400;
    const [meta, daily, mine] = await db.batch([
      db.prepare("SELECT v FROM meta WHERE k = 'env'"),
      db.prepare("SELECT n FROM hist WHERE ver = 0 AND kind = 'd' AND score = ?").bind(day),
      db.prepare("SELECT COUNT(*) AS c, MIN(first) AS seen FROM attempts WHERE dev = ? AND created >= ?").bind(b.dev, since),
    ]);
    const dbEnv = meta.results && meta.results[0] && meta.results[0].v;
    const dayN = daily.results && daily.results[0] ? daily.results[0].n : 0;
    const devN = mine.results && mine.results[0] ? mine.results[0].c : 0;
    let canSave = envMatches(dbEnv, host);
    if (!canSave) result.skip = "env";
    else if (dayN >= DAY_MAX) { canSave = false; result.skip = "day_max"; }
    else if (devN >= DEV_DAY_MAX) { canSave = false; result.skip = "dev_max"; }
    if (canSave) {
      const seen = devN ? 1 : await db.prepare("SELECT 1 FROM attempts WHERE dev = ? LIMIT 1").bind(b.dev).first();
      const first = seen ? 0 : 1;
      const valid = dur >= MIN_SEC && dur <= MAX_SEC ? 1 : 0;
      const cats = ["s", "c", "w", "f"].map(k => g.cats[k].ok).join(",");
      const ins = await db.prepare("INSERT OR IGNORE INTO attempts (id, created, ver, dev, first, score, cats, ans, dur, valid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(b.id, Math.floor(Date.now() / 1000), QUIZ_VER, b.dev, first, g.score, cats, g.ans, dur, valid).run();
      const added = !!(ins && ins.meta && ins.meta.changes);
      result.saved = added; result.first = !!first;
      if (added) {
        const up = "INSERT INTO hist (ver, kind, score, n) VALUES (?, ?, ?, 1) ON CONFLICT (ver, kind, score) DO UPDATE SET n = n + 1";
        const stm = [db.prepare(up).bind(0, "d", day)];   // 今日の保存数
        if (valid) { stm.push(db.prepare(up).bind(QUIZ_VER, "a", g.score)); if (first) stm.push(db.prepare(up).bind(QUIZ_VER, "f", g.score)); }
        await db.batch(stm);
      }
    }
    const rows = (await db.prepare("SELECT kind, score, n FROM hist WHERE ver = ?").bind(QUIZ_VER).all()).results || [];
    const hist = {}; let total = 0;
    for (const r of rows) { if (r.kind === "f") hist[r.score] = r.n; else if (r.kind === "a") total += r.n; }
    result.stats = statsOf(hist, g.score, total);
  } catch (e) {
    result.error = "db";   // 無料枠の上限などで使えないとき。結果の表示は続ける
  }
  return J(result);
}

export async function onRequestGet() { return J({ ok: false, error: "post_only" }, 405); }
