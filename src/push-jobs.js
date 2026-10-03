// 通知の「送信ジョブ」。たくさんの人に送るときは、1回に送る数を区切って（無料プランの上限対策）、
// 残りは KV の "jobs" に置いておき、見張り役（worker/）が1分ごとに続きを送る。
// Pages Functions（/api/push-send）と Worker の両方から使う。
import { sendPush } from "./webpush.js";

const SUBJECT = "https://chiikatsu-note.pages.dev";
export const CHARS = ["ちいかわ", "ハチワレ", "うさぎ", "モモンガ", "くりまんじゅう", "ラッコ", "シーサー", "古本屋"];
export const PER_RUN = 40; // 1回で送る最大数（無料プランの外部への接続の上限 50 より少なく）

// 推しで絞る：キャラ名が入っていて、どれも推しでないときだけ送らない（キャラ名がないものは送る）
function charOk(rec, text) {
  const c = Array.isArray(rec.chars) ? rec.chars : [];
  if (!c.length) return true;
  const named = CHARS.filter(n => text.includes(n));
  return !named.length || named.some(n => c.includes(n));
}

const isEv = it => it.cat === "event" || it.cat === "cafe";
const hm = s => (s && s.length > 10 ? s.slice(11, 16) : "");
const md = s => { const [, m, d] = s.slice(0, 10).split("-").map(Number); return `${m}/${d}`; };

// 1人ぶんの中身を作る（送らないときは null）
export function payloadFor(job, rec) {
  if (job.type === "broadcast") {
    if (rec.rsv === false) return null;
    if (!charOk(rec, job.payload.title + " " + (job.payload.body || ""))) return null;
    return job.payload;
  }
  // daily：前日（eve）・当日（day）・予約受付中（rsv）
  const want = new Set(rec.want || []);
  const s = job.starts.filter(it => want.has(it.id)), e = job.ends.filter(it => want.has(it.id));
  const r = rec.rsv === false ? [] : job.rsv.filter(it => want.has(it.id) || charOk(rec, it.t));
  if (!s.length && !e.length && !r.length) return null;
  const w = job.mode === "eve" ? "明日" : "今日";
  const lines = [
    ...r.map(it => job.mode === "rsv" ? `予約受付中：${it.t}${it.re ? `（締切 ${md(it.re)} ${hm(it.re)}）` : ""}` : `${w}${hm(it.rs)}から予約開始：${it.t}`),
    ...s.map(it => `${w}${isEv(it) ? "から" : "発売"}：${it.t}`),
    ...e.map(it => `${w}${job.mode === "eve" ? "で終了" : "まで"}：${it.t}`)];
  const first = r[0] || s[0] || e[0];
  return {
    title: lines.length > 1 ? `${lines[0]} ほか${lines.length - 1}件` : lines[0],
    body: lines.length > 1 ? lines.slice(1, 4).join("\n") : (first.place || "くわしくはちい活ノートで"),
    url: lines.length > 1 ? "/?v=mine" : `/items/${encodeURIComponent(first.id)}/`,
    tag: `${job.mode}-${job.day}`,
  };
}

// ジョブを budget 件まで進める。戻り値 { job, done, used, sent, gone }
export async function runJob(env, job, budget) {
  let used = 0, sent = 0, gone = 0, cursor = job.cursor || undefined, done = false;
  while (used < budget) {
    const page = await env.REPORTS.list({ prefix: "p:", cursor, limit: Math.max(1, Math.min(100, budget - used)) });
    for (const k of page.keys) {
      const rec = JSON.parse((await env.REPORTS.get(k.name)) || "null"); if (!rec) continue;
      const pl = payloadFor(job, rec); if (!pl) continue;
      used++;
      try {
        const st = await sendPush(rec.sub, pl, { privateD: env.VAPID_PRIVATE, subject: SUBJECT });
        if (st === 404 || st === 410) { await env.REPORTS.delete(k.name); gone++; } else if (st < 300) sent++;
      } catch (err) {}
    }
    if (page.list_complete) { done = true; break; }
    cursor = page.cursor;
  }
  return { job: { ...job, cursor }, done, used, sent, gone };
}

export async function loadJobs(env) { return JSON.parse((await env.REPORTS.get("jobs")) || "[]"); }
export async function saveJobs(env, jobs) { if (jobs.length) await env.REPORTS.put("jobs", JSON.stringify(jobs.slice(0, 50))); else await env.REPORTS.delete("jobs"); }
export async function addJob(env, job) { const jobs = await loadJobs(env); jobs.push(job); await saveJobs(env, jobs); }

// すぐ送れる分だけ送り、残りはジョブとして置いておく
export async function startJob(env, job) {
  const r = await runJob(env, job, PER_RUN);
  if (!r.done) await addJob(env, r.job);
  return { sent: r.sent, gone: r.gone, queued: !r.done };
}
