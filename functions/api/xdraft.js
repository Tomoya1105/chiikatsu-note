// Xの投稿案。自動更新が1日3回（朝・昼・夜）下書きを置き、運営者のスマホに通知する。
// 運営者は通知から下書きページを開き、「Xで投稿する」を押して、自分の言葉を足してから投稿する（自動では投稿しない）。
//
// ?key=REPORT_KEY&op=add&slot=朝|昼|夜&t1=本文&n1=メモ（&t2,n2,&t3,n3）… 下書きを置いて通知（自動更新が使う）
// ?key=REPORT_KEY&op=claim … 直前（10分以内）に「テスト通知を送る」を押した端末を、運営者の端末として登録
// ?key=REPORT_KEY&op=page  … 下書きページへ移動
// ?t=TOKEN                 … 下書きページ（通知から開く。鍵の代わりに見るだけの合言葉を使う）
import { sendPush } from "../../src/webpush.js";

const SUBJECT = "https://chiikatsu-note.pages.dev";
const SLOTS = ["朝", "昼", "夜"];
const jstNow = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const html = (body, status = 200) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });

async function token(env) {
  let t = await env.REPORTS.get("x:tok");
  if (!t) {
    const b = crypto.getRandomValues(new Uint8Array(18));
    t = btoa(String.fromCharCode(...b)).replace(/[+/=]/g, c => ({ "+": "-", "/": "_", "=": "" }[c]));
    await env.REPORTS.put("x:tok", t);
  }
  return t;
}

async function notifyOwners(env, payload) {
  const owners = JSON.parse((await env.REPORTS.get("x:owners")) || "[]");
  let sent = 0;
  for (const id of owners) {
    const rec = JSON.parse((await env.REPORTS.get(`p:${id}`)) || "null");
    if (!rec) continue;
    try { if ((await sendPush(rec.sub, payload, { privateD: env.VAPID_PRIVATE, subject: SUBJECT })) < 300) sent++; } catch (e) {}
  }
  return { owners: owners.length, sent };
}

export async function onRequestGet({ request, env }) {
  if (!env.REPORTS) return new Response("not configured", { status: 503 });
  const u = new URL(request.url), q = k => u.searchParams.get(k) || "";
  const op = q("op");
  if (q("dbg")) return new Response(JSON.stringify({ op, t: q("t"), url: request.url, tok: !!(await env.REPORTS.get("x:tok")) }), { headers: { "cache-control": "no-store" } });

  // 見るだけのページ（合言葉つき）
  if (!op && q("t")) {
    const tok = await env.REPORTS.get("x:tok");
    if (!tok || q("t") !== tok) return html(msg("ページが見つかりません", "通知から開き直してください。"));
    return html(page(JSON.parse((await env.REPORTS.get("x:drafts")) || "[]")));
  }

  if (!env.REPORT_KEY || q("key") !== env.REPORT_KEY) return new Response("forbidden", { status: 403 });

  if (op === "page") return Response.redirect(new URL(`/api/xdraft?t=${await token(env)}`, u.origin).href, 302);

  if (op === "claim") {
    const id = await env.REPORTS.get("x:lasttest");
    if (!id) return html(msg("登録できませんでした", "先にアプリの「マイリスト」→ 通知の「テスト通知を送る」を押してから、10分以内にもう一度このページを開いてください。"));
    const owners = JSON.parse((await env.REPORTS.get("x:owners")) || "[]");
    if (!owners.includes(id)) owners.unshift(id);
    await env.REPORTS.put("x:owners", JSON.stringify(owners.slice(0, 5)));
    await env.REPORTS.delete("x:lasttest");
    const t = await token(env);
    const r = env.VAPID_PRIVATE ? await notifyOwners(env, { title: "Xの投稿案の通知を登録しました", body: "これから朝・昼・夜に、投稿案ができたらここに届きます。", url: `/api/xdraft?t=${t}`, tag: "x-claim" }) : { sent: 0 };
    return html(msg("登録しました", `この端末に、Xの投稿案のお知らせが届くようになりました（確認の通知を${r.sent ? "送りました" : "送れませんでした。通知がオンになっているか確かめてください"}）。`, `/api/xdraft?t=${t}`));
  }

  if (op === "add") {
    const slot = SLOTS.includes(q("slot")) ? q("slot") : "朝";
    const posts = [];
    for (let i = 1; i <= 3; i++) {
      const t = q(`t${i}`).trim().slice(0, 600);
      if (t) posts.push({ t, n: q(`n${i}`).trim().slice(0, 400) });
    }
    if (!posts.length) return Response.json({ ok: false, reason: "t1 が必要" });
    const drafts = JSON.parse((await env.REPORTS.get("x:drafts")) || "[]");
    drafts.unshift({ slot, at: jstNow(), posts });
    await env.REPORTS.put("x:drafts", JSON.stringify(drafts.slice(0, 15)));
    const tk = await token(env);
    const first = posts[0].t.replace(/\s+/g, " ");
    const r = env.VAPID_PRIVATE
      ? await notifyOwners(env, { title: `Xの投稿案（${slot}）ができました`, body: first.length > 60 ? first.slice(0, 60) + "…" : first, url: `/api/xdraft?t=${tk}`, tag: `x-${slot}` })
      : { owners: 0, sent: 0 };
    return Response.json({ ok: true, slot, posts: posts.length, ...r });
  }

  return Response.json({ ok: false, reason: "op が必要（add / claim / page）" });
}

const CSS = `:root{--bg:#FBF6F8;--surface:#fff;--ink:#3A3346;--ink-2:#6D6479;--acc:#E27496;--on:#fff;--soft:#FBE3EB;--line:#EEDDE5;--warn:#C9821D}
@media (prefers-color-scheme:dark){:root{--bg:#1F1A21;--surface:#2B2430;--ink:#F1ECF6;--ink-2:#C2B9CE;--acc:#F095B0;--on:#2A1720;--soft:#3E2C36;--line:#443A46;--warn:#F0B860}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:"Hiragino Sans","Noto Sans JP",system-ui,sans-serif;line-height:1.7}
.w{max-width:620px;margin:0 auto;padding:18px 16px 50px}h1{font-size:20px;margin:0 0 4px}.lead{color:var(--ink-2);font-size:13px;margin:0 0 14px}
.grp{margin:18px 0 6px;font-weight:700;font-size:14px;color:var(--ink-2)}
.card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:14px;margin-bottom:10px}
.txt{white-space:pre-wrap;word-break:break-word;font-size:15px}
.note{font-size:12.5px;color:var(--ink-2);background:var(--soft);border-radius:10px;padding:8px 10px;margin-top:8px;white-space:pre-wrap;word-break:break-word}
.row{display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap}
.btn{font:inherit;font-weight:700;font-size:14px;border-radius:12px;padding:9px 14px;border:none;cursor:pointer;text-decoration:none;display:inline-block}
.go{background:var(--acc);color:var(--on)}.cp{background:var(--soft);color:var(--ink)}
.cnt{font-size:12px;color:var(--ink-2);margin-left:auto}.cnt.over{color:var(--warn);font-weight:700}
.tip{font-size:12.5px;color:var(--ink-2);border-top:1px dashed var(--line);margin-top:22px;padding-top:12px}`;

function msg(title, text, link) {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>${CSS}</style></head><body><div class="w"><h1>${esc(title)}</h1><p>${esc(text)}</p>${link ? `<a class="btn go" href="${esc(link)}">投稿案のページを開く</a>` : ""}</div></body></html>`;
}

// X の文字数（日本語は2、英数字は1、URLは23で数える。上限280＝日本語140字）
function weight(s) {
  let n = 0;
  const t = s.replace(/https?:\/\/\S+/g, () => { n += 23; return ""; });
  for (const ch of t) { const c = ch.codePointAt(0); n += (c <= 0x10FF || (c >= 0x2000 && c <= 0x200D) || (c >= 0x2010 && c <= 0x201F) || (c >= 0x2032 && c <= 0x2037)) ? 1 : 2; }
  return n;
}

function page(drafts) {
  const groups = drafts.map(d => `<div class="grp">${esc(d.at)}　${esc(d.slot)}の投稿案</div>` + d.posts.map(p => {
    const w = weight(p.t);
    return `<div class="card"><div class="txt">${esc(p.t)}</div>${p.n ? `<div class="note">${esc(p.n)}</div>` : ""}
<div class="row"><a class="btn go" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(p.t)}" target="_blank" rel="noopener">Xで投稿する</a><button class="btn cp" type="button" data-copy="${esc(p.t)}">コピー</button><span class="cnt${w > 280 ? " over" : ""}">${Math.ceil(w / 2)}/140字${w > 280 ? "（長すぎます）" : ""}</span></div></div>`;
  }).join("")).join("");
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Xの投稿案</title><style>${CSS}</style></head><body><div class="w">
<h1>Xの投稿案</h1><p class="lead">「Xで投稿する」を押すと、この文章が入った状態でXが開きます。そのまま送らず、あなたの気持ちをひとこと足してから投稿してください。新しい順です。</p>
${groups || '<div class="card">まだ投稿案はありません。次の自動更新をお待ちください。</div>'}
<p class="tip">ナガノさんの最新話は、読んだ気持ちをそのまま引用リポストで。自動更新は漫画を読めないので、感想は書きません。</p>
</div><script>document.addEventListener("click",function(e){var b=e.target.closest("[data-copy]");if(!b)return;navigator.clipboard.writeText(b.getAttribute("data-copy")).then(function(){b.textContent="コピーしました";setTimeout(function(){b.textContent="コピー"},1600)})});</script></body></html>`;
}
