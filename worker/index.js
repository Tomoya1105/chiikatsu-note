// ちい活ノートの見張り役（Cloudflare Worker・1分ごとに動く）
// ・5分ごとに、ちいかわマーケットの新着の予約と再入荷を確かめ、見つけたらすぐ通知する
// ・通知の送り残し（KV の "jobs"）を少しずつ送る
import { addJob, loadJobs, saveJobs, runJob, PER_RUN } from "../src/push-jobs.js";

const MARKET = "https://chiikawamarket.jp";
const RSV_RE = /予約|受注|抽選/;
const COOL = 6 * 3600e3; // 同じ商品の通知は6時間あける

// 「【予約】【送料無料】ちいかわ ○○【2026年12月…】」→「ちいかわ ○○」
const clean = t => String(t || "").replace(/【[^】]*】/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);

export async function watchMarket(env, fetcher = fetch, now = Date.now()) {
  const r = await fetcher(`${MARKET}/products.json?limit=150`, { headers: { "user-agent": "chiikatsu-note-watch/1.0 (+https://chiikatsu-note.pages.dev/)" } });
  if (!r.ok) {
    // 読めなかった理由を残す（同じ理由なら書き直さない＝保存回数の節約）
    const why = `HTTP ${r.status}`;
    if ((await env.REPORTS.get("w:err")) !== why) await env.REPORTS.put("w:err", why, { expirationTtl: 86400 });
    return { ok: false, status: r.status };
  }
  let prods;
  try { prods = ((await r.json()) || {}).products || []; }
  catch (e) { if ((await env.REPORTS.get("w:err")) !== "not-json") await env.REPORTS.put("w:err", "not-json", { expirationTtl: 86400 }); return { ok: false, status: "not-json" }; }
  const snap = JSON.parse((await env.REPORTS.get("w:market")) || "null");
  const next = snap ? { ...snap } : {};
  const events = []; let changed = !snap;
  for (const p of prods) {
    const h = String(p.handle || ""); if (!h) continue;
    const a = (p.variants || []).some(v => v.available) ? 1 : 0;
    const rv = RSV_RE.test((p.title || "") + " " + (Array.isArray(p.tags) ? p.tags.join(" ") : p.tags || "")) ? 1 : 0;
    const old = snap && snap[h];
    const ent = { a, r: rv, t: clean(p.title), s: now, n: old ? old.n || 0 : 0 };
    if (snap) {
      const cool = now - (ent.n || 0) > COOL;
      if (!old && rv && a && cool) { events.push({ h, kind: "rsv", t: ent.t }); ent.n = now; }
      else if (old && old.a === 0 && a === 1 && cool) { events.push({ h, kind: "restock", t: ent.t, rv }); ent.n = now; }
    }
    if (!old || old.a !== a || old.r !== rv) changed = true;
    next[h] = ent;
  }
  // 古いものから捨てて 500 件まで
  const keys = Object.keys(next).sort((x, y) => (next[y].s || 0) - (next[x].s || 0)).slice(0, 500);
  const trimmed = Object.fromEntries(keys.map(k => [k, next[k]]));
  changed = changed || events.length > 0;
  if (changed) await env.REPORTS.put("w:market", JSON.stringify(trimmed));
  // 同時にいくつも見つかったときは、種類ごとに1つの通知にまとめる（通知がうるさくならないように）
  for (const kind of ["rsv", "restock"]) {
    const list = events.filter(e => e.kind === kind); if (!list.length) continue;
    const head = kind === "rsv" ? "🛒 予約開始" : "🔄 再入荷";
    const one = list.length === 1;
    await addJob(env, { type: "broadcast", at: now, payload: {
      title: one ? `${head}：${list[0].t}` : `${head} ${list.length}件：${list[0].t} ほか`,
      body: one ? "ちいかわマーケット（公式通販）・タップで商品ページへ" : list.slice(1, 4).map(e => e.t).join("\n"),
      url: one ? `${MARKET}/products/${encodeURIComponent(list[0].h)}` : `${MARKET}/collections/all?sort_by=created-descending`,
      tag: `mk-${kind}-${now}`,
    } });
  }
  return { ok: true, products: prods.length, events, first: !snap };
}

export async function tick(env, t = Date.now()) {
  const out = {};
  if (new Date(t).getUTCMinutes() % 5 === 0) {
    try { out.watch = await watchMarket(env, fetch, t); }
    catch (e) { out.watch = { ok: false, error: String(e) }; try { await env.REPORTS.put("w:err", "error: " + String(e).slice(0, 200), { expirationTtl: 86400 }); } catch (e2) {} }
  }
  if (!env.VAPID_PRIVATE) return out;
  let jobs = await loadJobs(env); if (!jobs.length) return out;
  let budget = PER_RUN; out.sent = 0;
  while (jobs.length && budget > 0) {
    const r = await runJob(env, jobs[0], budget);
    budget -= Math.max(1, r.used); out.sent += r.sent;
    if (r.done) jobs.shift(); else { jobs[0] = r.job; break; }
  }
  await saveJobs(env, jobs);
  return out;
}

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(tick(env, event.scheduledTime)); },
  async fetch(request, env) {
    const u = new URL(request.url);
    if (u.pathname === "/run" && env.REPORT_KEY && u.searchParams.get("key") === env.REPORT_KEY) {
      return Response.json(await tick(env, Math.floor(Date.now() / 300000) * 300000)); // 動作確認用：見張りと送信を今すぐ1回
    }
    return new Response("ちい活ノートの見張り役です。", { headers: { "content-type": "text/plain; charset=utf-8" } });
  },
};
