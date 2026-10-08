// ちいかわ検定：受験結果を受け取り、サーバーで採点し直して D1（QUIZDB）に1行保存し、みんなの成績（平均・上位％）を返す。
// 通信はこの1回だけ。データベースが使えないときも、エラーにせず「保存できなかった」と返す（クイズの結果表示は止めない）。
import { QUIZ_VER, grade, validPicks, statsOf, MIN_SEC, MAX_SEC } from "../../../src/quizcore.mjs";

const J = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const ID = /^[a-z0-9-]{16,40}$/;

export async function onRequestPost({ request, env }) {
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
    const seen = await db.prepare("SELECT 1 FROM attempts WHERE dev = ? LIMIT 1").bind(b.dev).first();
    const first = seen ? 0 : 1;
    const valid = dur >= MIN_SEC && dur <= MAX_SEC ? 1 : 0;
    const cats = ["s", "c", "w", "f"].map(k => g.cats[k].ok).join(",");
    const ins = await db.prepare("INSERT OR IGNORE INTO attempts (id, created, ver, dev, first, score, cats, ans, dur, valid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(b.id, Math.floor(Date.now() / 1000), QUIZ_VER, b.dev, first, g.score, cats, g.ans, dur, valid).run();
    const added = !!(ins && ins.meta && ins.meta.changes);
    result.saved = added; result.first = !!first;
    if (added && valid) {
      const up = "INSERT INTO hist (ver, kind, score, n) VALUES (?, ?, ?, 1) ON CONFLICT (ver, kind, score) DO UPDATE SET n = n + 1";
      const stm = [db.prepare(up).bind(QUIZ_VER, "a", g.score)];
      if (first) stm.push(db.prepare(up).bind(QUIZ_VER, "f", g.score));
      await db.batch(stm);
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
