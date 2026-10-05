// お問い合わせフォーム（/contact/）の受け取り。KV の c:<時刻> に180日間だけ保存し、運営者の端末に通知する。運営者のGmail（contact@chiikatsunote.com の転送先）にも送る。
// 運営者は投稿案のページ（/api/xdraft?tok=…）の「お問い合わせ」で読む。自動更新（AI）は読まない。
import { token } from "./xdraft.js";
import { sendPush } from "../../src/webpush.js";
const KINDS = { site: "サイトへのご意見・不具合", info: "情報の提供・掲載のお願い", biz: "企業・メディアの方", other: "その他" };
const jstNow = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ");
async function sha(s) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].slice(0, 8).map(x => x.toString(16).padStart(2, "0")).join(""); }

export async function onRequestPost({ request, env }) {
  if (!env.REPORTS) return new Response("not configured", { status: 503 });
  let b; try { b = await request.json(); } catch (e) { return Response.json({ ok: false, reason: "送れませんでした" }, { status: 400 }); }
  if (b && b.hp) return Response.json({ ok: true });   // ロボット対策の見えない欄に入力があれば、受け取ったふりだけする
  const text = String(b && b.text || "").trim().slice(0, 2000);
  const name = String(b && b.name || "").trim().slice(0, 50);
  const email = String(b && b.email || "").trim().slice(0, 120);
  const kind = KINDS[b && b.kind] ? b.kind : "other";
  if (text.length < 2) return Response.json({ ok: false, reason: "お問い合わせ内容を書いてください" }, { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ ok: false, reason: "メールアドレスの形を確かめてください" }, { status: 400 });
  // 同じ人からの送りすぎを防ぐ（1日5件まで。IPアドレスそのものは保存しない）
  const day = jstNow().slice(0, 10);
  const who = await sha((request.headers.get("cf-connecting-ip") || "") + day);
  const rk = `cr:${day}:${who}`;
  const n = +(await env.REPORTS.get(rk)) || 0;
  if (n >= 5) return Response.json({ ok: false, reason: "今日はこれ以上送れません。明日もう一度お試しください" }, { status: 429 });
  await env.REPORTS.put(rk, String(n + 1), { expirationTtl: 60 * 60 * 26 });
  const id = `c:${Date.now()}:${crypto.randomUUID().slice(0, 6)}`;
  await env.REPORTS.put(id, JSON.stringify({ at: jstNow(), kind: KINDS[kind], name, email, text }), { expirationTtl: 60 * 60 * 24 * 180 });
  // 運営者のGmailにも送る（実際の送信は見張り役（worker）が1分以内に行う）
  const q = JSON.parse((await env.REPORTS.get("mailq")) || "[]"); q.push(id);
  await env.REPORTS.put("mailq", JSON.stringify(q.slice(-50)));
  // 運営者の端末に知らせる
  if (env.VAPID_PRIVATE) {
    const owners = JSON.parse((await env.REPORTS.get("x:owners")) || "[]");
    const url = `/api/xdraft?tok=${await token(env)}#contact`;
    for (const o of owners) {
      const rec = JSON.parse((await env.REPORTS.get(`p:${o}`)) || "null");
      if (rec) { try { await sendPush(rec.sub, { title: "お問い合わせが届きました", body: `${KINDS[kind]}：${text.slice(0, 50)}`, url, tag: "contact" }, { privateD: env.VAPID_PRIVATE, subject: "https://chiikatsunote.com" }); } catch (e) {} }
    }
  }
  return Response.json({ ok: true });
}
