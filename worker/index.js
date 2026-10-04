// ちい活ノートの見張り役（Cloudflare Worker・1分ごとに動く）
// ・5分ごとに、ちいかわマーケットの新着の予約と再入荷を確かめ、見つけたらすぐ通知する
// ・通知の送り残し（KV の "jobs"）を少しずつ送る
import { addJob, loadJobs, saveJobs, runJob, PER_RUN } from "../src/push-jobs.js";
import { sendPush } from "../src/webpush.js";

const MARKET = "https://chiikawamarket.jp";
const RSV_RE = /予約|受注|抽選/;
const COOL = 6 * 3600e3; // 同じ商品の通知は6時間あける

// 「【予約】【送料無料】ちいかわ ○○【2026年12月…】」→「ちいかわ ○○」
const clean = t => String(t || "").replace(/【[^】]*】/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);

export async function watchMarket(env, fetcher = fetch, now = Date.now()) {
  const r = await fetcher(`${MARKET}/products.json?limit=150`, { headers: { "user-agent": "chiikatsu-note-watch/1.0 (+https://chiikatsunote.com/)" } });
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
      else if (!old && !rv && a) events.push({ h, kind: "new", t: ent.t });
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
  // 予約以外の新商品（発売開始）は、通知はせずサイトの「速報」にまとめて1件で出す
  const nw = events.filter(e => e.kind === "new");
  if (nw.length) await addFresh(env, [{ at: now, src: "ちいかわマーケット", official: true, title: nw.length === 1 ? `公式通販に新商品：${nw[0].t}` : `公式通販に新商品${nw.length}件：${nw[0].t} ほか`, url: nw.length === 1 ? `${MARKET}/products/${encodeURIComponent(nw[0].h)}` : `${MARKET}/collections/all?sort_by=created-descending` }], now);
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

// サイトに載っている予約（自動更新が予告から登録したもの）の、受付開始30分前にお知らせする
export async function preStart(env, fetcher = fetch, now = Date.now()) {
  const r = await fetcher("https://chiikatsunote.com/push-items.json", { cf: { cacheTtl: 120 } });
  if (!r.ok) return { ok: false };
  const items = await r.json();
  const out = [];
  for (const it of items) {
    if (!it.rsv || !it.rs || it.rs.length <= 10) continue;
    const start = new Date(it.rs + ":00+09:00").getTime();
    const left = start - now;
    if (left <= 20 * 60e3 || left > 35 * 60e3) continue;   // 20〜35分前のときだけ
    const mk = `w:pre:${it.id}`;
    if (await env.REPORTS.get(mk)) continue;
    await env.REPORTS.put(mk, "1", { expirationTtl: 3 * 86400 });
    const hhmm = it.rs.slice(11, 16);
    await addJob(env, { type: "broadcast", at: now, payload: { title: `⏰ ${hhmm}から予約開始：${it.t.replace(/（予約）$/, "")}`, body: "まもなく受付が始まります。タップしてくわしく見る", url: `/items/${encodeURIComponent(it.id)}/`, tag: `pre-${it.id}` } });
    out.push(it.id);
  }
  return { ok: true, pre: out };
}

// ちいかわインフォの代わり読み：自動更新の作業環境からは読めない（403）ことがあるので、
// 見張り役が10分ごとに読んで、文字だけを KV に置いておく（/api/info で自動更新が読む）
const INFO = { top: "https://chiikawa-info.jp/", pus: "https://chiikawa-info.jp/pus.html" };
const toText = html => String(html)
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<a\s[^>]*href="([^"]+)"[^>]*>/gi, " [$1] ")
  .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d|dt|dd)>/gi, "\n")
  .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
export async function relayInfo(env, fetcher = fetch, now = Date.now()) {
  const out = {};
  for (const [k, url] of Object.entries(INFO)) {
    try {
      const r = await fetcher(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; chiikatsu-note-watch/1.0; +https://chiikatsunote.com/)", "accept-language": "ja" } });
      if (!r.ok) { out[k] = r.status; continue; }
      const text = toText(await r.text()).slice(0, 120000);
      const prev = await env.REPORTS.get(`w:info:${k}`);
      const body = JSON.stringify({ at: now, url, text });
      if (!prev || JSON.parse(prev).text !== text) await env.REPORTS.put(`w:info:${k}`, body);
      out[k] = "ok";
    } catch (e) { out[k] = "error"; }
  }
  return out;
}


// ---- ニュースの見張り（10分ごと）----
// ・PR TIMES（企業の公式発表）に「ちいかわ」の新しいリリースが出たら → サイトの「速報」に公式の見出しのまま出し、希望者に通知
// ・ちいかわマーケットに予約以外の新商品がまとめて出たら → 「速報」に出す
// ・Googleニュース・Bingニュース・ちいかわインフォの新しい案内 → 運営者に知らせ、自動更新が次の回で最優先に確かめる（サイトにはまだ出さない）
const CHII = /ちいかわ|チイカワ|chiikawa|ハチワレ|ナガノ/i;
const FEEDS = [
  { key: "prtimes", name: "PR TIMES", url: "https://prtimes.jp/index.rdf", official: true },
  { key: "bing", name: "Bingニュース", url: "https://www.bing.com/news/search?format=rss&setlang=ja&cc=JP&q=" + encodeURIComponent("ちいかわ"), official: false },
  { key: "gnews", name: "Googleニュース", url: "https://news.google.com/rss/search?q=" + encodeURIComponent("ちいかわ") + "&hl=ja&gl=JP&ceid=JP:ja", official: false },
];
const unx = s => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<[^>]+>/g, "").trim();
const tag = (block, name) => { const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(block); return m ? unx(m[1]) : ""; };
export function parseFeed(xml) {
  const out = [];
  for (const m of String(xml).matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const b = m[0];
    const title = tag(b, "title"), link = tag(b, "link") || (/rdf:about="([^"]+)"/.exec(b) || [])[1] || "";
    const date = tag(b, "pubDate") || tag(b, "dc:date"), source = tag(b, "source");
    if (title && /^https?:\/\//.test(link)) out.push({ title, link, date, source });
  }
  return out;
}
async function seenSet(env) { return new Set(JSON.parse((await env.REPORTS.get("w:seen:news")) || "[]")); }
async function pushOwners(env, payload) {
  if (!env.VAPID_PRIVATE) return 0;
  let n = 0;
  for (const id of JSON.parse((await env.REPORTS.get("x:owners")) || "[]")) {
    const rec = JSON.parse((await env.REPORTS.get(`p:${id}`)) || "null"); if (!rec) continue;
    try { if ((await sendPush(rec.sub, payload, { privateD: env.VAPID_PRIVATE, subject: "https://chiikatsunote.com" })) < 300) n++; } catch (e) {}
  }
  return n;
}
export async function addFresh(env, entries, now) {
  if (!entries.length) return;
  const cut = now - 72 * 3600e3;
  const list = JSON.parse((await env.REPORTS.get("w:fresh")) || "[]").filter(x => x.at > cut);
  for (const e of entries) if (!list.some(x => x.url === e.url)) list.unshift(e);
  await env.REPORTS.put("w:fresh", JSON.stringify(list.slice(0, 20)));
}
async function addCandidates(env, lines, now) {
  if (!lines.length) return;
  const at = new Date(now + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ");
  const tips = JSON.parse((await env.REPORTS.get("x:tips")) || "[]");
  for (const t of lines) tips.push({ id: (now + tips.length).toString(36), at, auto: true, text: "【自動で見つけた候補・未確認】" + t });
  await env.REPORTS.put("x:tips", JSON.stringify(tips.slice(-50)));
}
export async function watchNews(env, fetcher = fetch, now = Date.now()) {
  const status = {};
  const seen = await seenSet(env);
  const seeded = new Set(JSON.parse((await env.REPORTS.get("w:seen:src")) || "[]"));   // 一度でも読めた情報源（初回は覚えるだけ）
  const seenBefore = seen.size, seededBefore = seeded.size;
  const first = false;
  const fresh = [], cands = [];
  for (const f of FEEDS) {
    try {
      const r = await fetcher(f.url, { headers: { "user-agent": "Mozilla/5.0 (compatible; chiikatsu-note-watch/1.0; +https://chiikatsunote.com/)", "accept-language": "ja" } });
      if (!r.ok) { status[f.key] = r.status; continue; }
      const items = parseFeed(await r.text()).filter(x => CHII.test(x.title));
      status[f.key] = items.length;
      const firstSrc = !seeded.has(f.key); seeded.add(f.key);
      for (const it of items) {
        const id = f.key + ":" + it.link.slice(0, 200);
        if (seen.has(id)) continue;
        seen.add(id);
        if (firstSrc) continue;   // その情報源を初めて読めたときは、今あるものを覚えるだけ（昔の記事を速報にしない）
        const age = it.date ? now - Date.parse(it.date) : 0;
        if (age > 48 * 3600e3) continue;
        if (f.official) fresh.push({ at: now, src: f.name, title: it.title.slice(0, 120), url: it.link, official: true });
        cands.push(`${f.name}：${it.title.slice(0, 100)}${it.source ? "（" + it.source + "）" : ""} ${it.link}`);
      }
    } catch (e) { status[f.key] = "error"; }
  }
  // ちいかわインフォ：見張り役が読んだ文字（w:info:top）に、新しいリンクが増えたら候補にする
  try {
    const info = JSON.parse((await env.REPORTS.get("w:info:top")) || "null");
    if (info) {
      const links = [...new Set([...info.text.matchAll(/\[(https?:\/\/[^\]\s]+|\/[^\]\s]*)\]/g)].map(m => m[1]))];
      const prev = JSON.parse((await env.REPORTS.get("w:info:links")) || "null");
      if (prev) for (const l of links) if (!prev.includes(l)) cands.push(`ちいかわインフォに新しい案内：${l.startsWith("/") ? "https://chiikawa-info.jp" + l : l}`);
      if (!prev || links.join() !== prev.join()) await env.REPORTS.put("w:info:links", JSON.stringify(links));
      status.info = links.length;
    }
  } catch (e) { status.info = "error"; }
  // 保存の回数を節約（無料枠）：変わったときだけ書く
  if (seen.size !== seenBefore) await env.REPORTS.put("w:seen:news", JSON.stringify([...seen].slice(-600)));
  if (seeded.size !== seededBefore) await env.REPORTS.put("w:seen:src", JSON.stringify([...seeded]));
  await addFresh(env, fresh, now);
  await addCandidates(env, cands, now);
  if (cands.length) await pushOwners(env, { title: `📰 ニュース候補 ${cands.length}件`, body: cands.slice(0, 3).map(c => c.replace(/ https?:\S+$/, "")).join("\n"), url: "/owner/", tag: `news-${now}` });
  if (fresh.length) {
    const one = fresh.length === 1;
    await addJob(env, { type: "news", at: now, payload: { title: one ? `📣 速報：${fresh[0].title.slice(0, 60)}` : `📣 速報 ${fresh.length}件：${fresh[0].title.slice(0, 40)} ほか`, body: one ? `${fresh[0].src}（公式の発表）・タップでくわしく` : fresh.slice(1, 4).map(x => x.title.slice(0, 40)).join("\n"), url: one ? fresh[0].url : "/?v=news", tag: `news-${now}` } });
  }
  const stKey = JSON.stringify(status), prevSt = JSON.parse((await env.REPORTS.get("w:news:status")) || "null");
  if (!prevSt || prevSt.s !== stKey || now - prevSt.at > 6 * 3600e3) await env.REPORTS.put("w:news:status", JSON.stringify({ at: now, s: stKey }));
  return { status, fresh: fresh.length, cands: cands.length };
}

export async function tick(env, t = Date.now()) {
  const out = {};
  if (new Date(t).getUTCMinutes() % 5 === 0) {
    try { out.watch = await watchMarket(env, fetch, t); }
    catch (e) { out.watch = { ok: false, error: String(e) }; try { await env.REPORTS.put("w:err", "error: " + String(e).slice(0, 200), { expirationTtl: 86400 }); } catch (e2) {} }
  }
  if (new Date(t).getUTCMinutes() % 5 === 0) { try { out.pre = await preStart(env, fetch, t); } catch (e) { out.pre = { ok: false, error: String(e) }; } }
  if (new Date(t).getUTCMinutes() % 10 === 7) { try { out.news = await watchNews(env, fetch, t); } catch (e) { out.news = { error: String(e) }; } }
  if (new Date(t).getUTCMinutes() % 10 === 2) { try { out.info = await relayInfo(env, fetch, t); } catch (e) { out.info = { error: String(e) }; } }
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
