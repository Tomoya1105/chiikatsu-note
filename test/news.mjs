// ニュース見張りの安定化テスト：node test/news.mjs   （比較用に OLD=旧worker.js のパスを渡すと、書き込み回数の前後比較も出す）
import assert from "node:assert/strict";
import { canonKey, cleanUrl, fromLegacy, seenAdd } from "../src/news-seen.js";
import { listTips, addManualTip, doneTip, addAutoCandidates } from "../src/tips.js";
import * as NEW from "../worker/index.js";

let ok = 0; const t = (name, fn) => Promise.resolve(fn()).then(() => { ok++; }, e => { console.error("NG:", name, "\n", e.message); process.exitCode = 1; });

function kv(init = {}) {
  const m = new Map(Object.entries(init)), w = {};
  return { m, w, get: async k => m.has(k) ? m.get(k) : null, put: async (k, v) => { m.set(k, v); w[k] = (w[k] || 0) + 1; }, delete: async k => { m.delete(k); } };
}
const env = (init) => ({ REPORTS: kv(init) });
const rss = items => `<?xml version="1.0"?><rss><channel>${items.map(i => `<item><title>${i.title}</title><link>${i.link}</link><pubDate>${new Date(i.at).toUTCString()}</pubDate></item>`).join("")}</channel></rss>`;
const bingLink = (u, tid) => `http://www.bing.com/news/apiclick.aspx?ref=FexRss&aid=&tid=${tid}&url=${encodeURIComponent(u)}&c=1&mkt=ja-jp`;
const NOW = Date.UTC(2026, 9, 13, 18, 7);
// 5分前から始まる、毎回 tid が変わる Bing と、固定の PR TIMES
function fetcherAt(run, prItems = [], bingArticles = 26) {
  return async url => {
    if (url.includes("bing.com")) return { ok: true, status: 200, text: async () => rss(Array.from({ length: bingArticles }, (_, i) => ({ title: `ちいかわ 記事${i}`, link: bingLink(`https://example.com/a/${i}`, `T${run}_${i}`), at: NOW - 3600e3 }))) };
    if (url.includes("prtimes")) return { ok: true, status: 200, text: async () => rss(prItems) };
    return { ok: true, status: 200, text: async () => rss([]) };
  };
}

await t("canonKey: tid だけ違う Bing リンクは同じ", () => {
  const a = canonKey(bingLink("https://example.com/a/1", "AAA")), b = canonKey(bingLink("https://example.com/a/1", "BBB"));
  assert.equal(a, b); assert.equal(a, "example.com/a/1");
});
await t("canonKey: http/https・www・末尾スラッシュ・utm・# は同じ。ほかの query は区別", () => {
  assert.equal(canonKey("https://www.Example.com/x/?utm_source=a#top"), canonKey("http://example.com/x"));
  assert.notEqual(canonKey("https://example.com/p?id=1"), canonKey("https://example.com/p?id=2"));
  assert.equal(canonKey("https://example.com/p?b=2&a=1"), canonKey("https://example.com/p?a=1&b=2"));
});
await t("canonKey: 壊れたURLでも落ちない", () => { assert.equal(typeof canonKey("not a url"), "string"); assert.equal(canonKey(""), ""); });
await t("cleanUrl: Bing の中継ではなく記事のURL", () => assert.equal(cleanUrl(bingLink("https://example.com/a/1?x=1", "Z")), "https://example.com/a/1?x=1"));
await t("fromLegacy: 旧方式の重複がまとまり、w:fresh のURLも引き継ぐ", () => {
  const feeds = [{ key: "prtimes", name: "PR TIMES" }, { key: "bing", name: "Bingニュース" }];
  const legacy = ["bing:" + bingLink("https://example.com/a/1", "1"), "bing:" + bingLink("https://example.com/a/1", "2"), "prtimes:https://prtimes.jp/x"];
  const s = fromLegacy(legacy, [{ src: "PR TIMES", url: "https://prtimes.jp/y" }], feeds);
  assert.deepEqual(s.bing, ["example.com/a/1"]); assert.deepEqual(s.prtimes, ["prtimes.jp/x", "prtimes.jp/y"]);
});
await t("seenAdd: 情報源ごとに上限。ほかの情報源は押し出されない", () => {
  const s = {}; seenAdd(s, "prtimes", "p1");
  for (let i = 0; i < 500; i++) seenAdd(s, "bing", "b" + i);
  assert.equal(s.bing.length, 200); assert.deepEqual(s.prtimes, ["p1"]);
});

await t("運営者の情報は自動候補に押し出されない（枠が別）", async () => {
  const e = env();
  await addManualTip(e, { id: "m1", at: "x", text: "運営者の情報 https://x.com/a/status/1" });
  for (let i = 0; i < 100; i++) await addAutoCandidates(e, [{ key: "k" + i, text: "候補" + i }], "x", 1e12 + i * 1000);
  const l = await listTips(e);
  assert.equal(l[0].id, "m1"); assert.ok(!l[0].auto);
  assert.equal(l.filter(x => x.auto).length, 30);
  assert.equal(JSON.parse(e.REPORTS.m.get("x:tips")).length, 1);
});
await t("自動候補：同じ key は1回だけ。運営者がすでに送った記事は入れない。重複なら書かない", async () => {
  const e = env();
  await addManualTip(e, { id: "m1", at: "x", text: "これ https://example.com/a/9" });
  assert.equal(await addAutoCandidates(e, [{ key: "example.com/a/9", text: "A" }, { key: "k1", text: "B" }], "x", 1e12), 1);
  assert.equal(await addAutoCandidates(e, [{ key: "k1", text: "B" }], "x", 1e12 + 1), 0);
  assert.equal(e.REPORTS.w["x:cands"], 1);
});
await t("旧形式（x:tips に自動候補が混在）：一覧では運営者が先。doneTip は両方の枠を扱い、変わった枠だけ書く", async () => {
  const e = env({ "x:tips": JSON.stringify([{ id: "a1", auto: true, text: "旧自動" }, { id: "m1", text: "運営者" }]) });
  const l = await listTips(e); assert.deepEqual(l.map(x => x.id), ["m1", "a1"]);
  const r = await doneTip(e, "a1"); assert.equal(r.removed, 1); assert.equal(e.REPORTS.w["x:cands"], undefined);
  assert.equal((await doneTip(e, "nothing")).removed, 0); assert.equal(e.REPORTS.w["x:tips"], 1);
});
await t("運営者の情報を追加すると、旧形式の自動候補は取り除かれる", async () => {
  const e = env({ "x:tips": JSON.stringify([{ id: "a1", auto: true, text: "旧自動" }]) });
  await addManualTip(e, { id: "m1", text: "運営者" });
  assert.deepEqual(JSON.parse(e.REPORTS.m.get("x:tips")).map(x => x.id), ["m1"]);
});

// ---- 見張り本体：24時間（10分ごと144回）
async function day(W, e, prAt = {}) {
  let cands = 0;
  for (let r = 0; r < 144; r++) {
    const now = NOW + r * 600e3;
    const pr = prAt[r] ? [{ title: "ちいかわ 新商品の発表", link: "https://prtimes.jp/main/html/rd/p/000000001.000000002.html", at: now - 60e3 }] : [];
    const res = await W.watchNews(e, fetcherAt(r, pr), now);
    cands += res.cands || 0;
  }
  return cands;
}
const OLD = process.env.OLD ? await import(process.env.OLD) : null;

await t("Bing の重複：24時間で候補は26件だけ（10分ごとに増えない）、書き込みも激減", async () => {
  const e = env({ "w:seen:src": JSON.stringify(["prtimes", "inside", "animeanime", "netlab", "mogumogu", "bing"]) });
  await day(NEW, e);
  assert.equal(JSON.parse(e.REPORTS.m.get("x:cands")).length, 26);
  const w = Object.values(e.REPORTS.w).reduce((a, b) => a + b, 0);
  console.log("  新：24時間の書き込み", JSON.stringify(e.REPORTS.w), "合計", w);
  assert.ok(w <= 10);
  if (OLD) { const o = env({ "w:seen:src": JSON.stringify(["prtimes", "inside", "animeanime", "netlab", "mogumogu", "bing"]) }); await day(OLD, o); console.log("  旧：24時間の書き込み", JSON.stringify(o.REPORTS.w), "合計", Object.values(o.REPORTS.w).reduce((a, b) => a + b, 0)); }
});
await t("PR TIMES は Bing に押し出されず、同じ発表の速報は1回だけ", async () => {
  const e = env({ "w:seen:src": JSON.stringify(["prtimes", "inside", "animeanime", "netlab", "mogumogu", "bing"]) });
  await day(NEW, e, { 3: 1, 4: 1, 50: 1, 100: 1 });   // 同じ発表が何度フィードに出ても
  const jobs = JSON.parse(e.REPORTS.m.get("jobs") || "[]");
  assert.equal(jobs.filter(j => j.type === "news").length, 1);
  assert.equal(JSON.parse(e.REPORTS.m.get("w:fresh")).length, 1);
  assert.ok(JSON.parse(e.REPORTS.m.get("w:seen:2")).prtimes.length === 1);
});
await t("旧データからの引き継ぎ：旧 w:seen:news は書き換えず、同じ記事を再登録しない", async () => {
  const legacy = Array.from({ length: 26 }, (_, i) => "bing:" + bingLink(`https://example.com/a/${i}`, "OLD" + i));
  const e = env({ "w:seen:news": JSON.stringify(legacy), "w:seen:src": JSON.stringify(["prtimes", "inside", "animeanime", "netlab", "mogumogu", "bing"]) });
  const res = await NEW.watchNews(e, fetcherAt(0), NOW);
  assert.equal(res.cands, 0);
  assert.equal(e.REPORTS.w["w:seen:news"], undefined); assert.equal(e.REPORTS.m.get("w:seen:news"), JSON.stringify(legacy));
  assert.equal(e.REPORTS.w["w:seen:2"], 1); assert.equal(e.REPORTS.w["x:cands"], undefined);
});
await t("公式の判定は変わらない：初めて読めた情報源は覚えるだけ／48時間より古い記事は出さない", async () => {
  const e = env();
  const r1 = await NEW.watchNews(e, fetcherAt(0, [{ title: "ちいかわ A", link: "https://prtimes.jp/a", at: NOW }]), NOW);
  assert.equal(r1.fresh, 0);
  const r2 = await NEW.watchNews(e, fetcherAt(1, [{ title: "ちいかわ A", link: "https://prtimes.jp/a", at: NOW }, { title: "ちいかわ B", link: "https://prtimes.jp/b", at: NOW }, { title: "ちいかわ 古い", link: "https://prtimes.jp/old", at: NOW - 72 * 3600e3 }]), NOW + 600e3);
  assert.equal(r2.fresh, 1);
});
await t("PR TIMES で見た記事を Bing が運んできても候補に出ない", async () => {
  const e = env({ "w:seen:src": JSON.stringify(["prtimes", "inside", "animeanime", "netlab", "mogumogu", "bing"]) });
  await NEW.watchNews(e, async u => u.includes("prtimes") ? { ok: true, status: 200, text: async () => rss([{ title: "ちいかわ X", link: "https://prtimes.jp/x", at: NOW }]) } : u.includes("bing.com") ? { ok: true, status: 200, text: async () => rss([{ title: "ちいかわ X", link: bingLink("https://prtimes.jp/x", "q"), at: NOW }]) } : { ok: true, status: 200, text: async () => rss([]) }, NOW);
  assert.equal(JSON.parse(e.REPORTS.m.get("x:cands") || "[]").length, 1);   // PR TIMES 自身の1件だけ（Bing の分は増えない）
});

// ---- 保存順序・途中失敗（候補 → 速報 → 見た記事の記録）
const SEEDED = JSON.stringify(["prtimes", "inside", "animeanime", "netlab", "mogumogu", "bing"]);
function kvFail(init, failKey) {   // failKey の書き込みを fail.on=true の間だけ失敗させる
  const k = kv(init); const fail = { on: true }; const put = k.put;
  k.put = async (key, v) => { if (fail.on && key === failKey) throw new Error("put fail " + key); return put(key, v); };
  return { REPORTS: k, fail };
}
await t("候補の保存に失敗 → 既読にしない → 次回取得で再試行できる", async () => {
  const e = kvFail({ "w:seen:src": SEEDED }, "x:cands");
  await assert.rejects(NEW.watchNews(e, fetcherAt(0, [], 5), NOW));
  assert.equal(e.REPORTS.m.has("w:seen:2"), false);   // 既読は進めていない
  e.fail.on = false;
  const r = await NEW.watchNews(e, fetcherAt(1, [], 5), NOW + 600e3);
  assert.equal(r.cands, 5); assert.equal(JSON.parse(e.REPORTS.m.get("x:cands")).length, 5);
});
await t("候補の保存に失敗しても、速報（ジョブ）は出ず、次回に1回だけ出る", async () => {
  const pr = [{ title: "ちいかわ 新発表", link: "https://prtimes.jp/n1", at: NOW }];
  const e = kvFail({ "w:seen:src": SEEDED, "w:seen:2": JSON.stringify({ prtimes: [] }) }, "x:cands");
  await assert.rejects(NEW.watchNews(e, fetcherAt(0, pr, 0), NOW));
  assert.equal(e.REPORTS.m.get("jobs") ?? null, null);
  e.fail.on = false;
  await NEW.watchNews(e, fetcherAt(1, pr, 0), NOW + 600e3);
  await NEW.watchNews(e, fetcherAt(2, pr, 0), NOW + 1200e3);
  assert.equal(JSON.parse(e.REPORTS.m.get("jobs")).filter(j => j.type === "news").length, 1);
});
await t("候補は保存できたが既読の保存に失敗 → 次回、同じ候補は重複登録されない", async () => {
  const e = kvFail({ "w:seen:src": SEEDED }, "w:seen:2");
  await assert.rejects(NEW.watchNews(e, fetcherAt(0, [], 5), NOW));
  assert.equal(JSON.parse(e.REPORTS.m.get("x:cands")).length, 5);
  e.fail.on = false;
  const r = await NEW.watchNews(e, fetcherAt(1, [], 5), NOW + 600e3);   // tid が変わっても同じ記事
  assert.equal(r.cands, 0); assert.equal(JSON.parse(e.REPORTS.m.get("x:cands")).length, 5);
  assert.ok(e.REPORTS.m.has("w:seen:2"));
});
await t("速報を出した後に既読の保存に失敗 → 次回、同じ速報は二重に出ない", async () => {
  const pr = [{ title: "ちいかわ 新発表", link: "https://prtimes.jp/n2", at: NOW }];
  const e = kvFail({ "w:seen:src": SEEDED, "w:seen:2": JSON.stringify({ prtimes: [] }) }, "w:seen:2");
  await assert.rejects(NEW.watchNews(e, fetcherAt(0, pr, 0), NOW));
  e.fail.on = false;
  await NEW.watchNews(e, fetcherAt(1, pr, 0), NOW + 600e3);
  assert.equal(JSON.parse(e.REPORTS.m.get("jobs")).filter(j => j.type === "news").length, 1);
});
await t("正常時の書き込みは増えない（新しい記事がある回は seen+cands、ない回は0）", async () => {
  const e = env({ "w:seen:src": SEEDED, "w:seen:2": JSON.stringify({}) });
  await NEW.watchNews(e, fetcherAt(0, [], 5), NOW);
  assert.deepEqual({ ...e.REPORTS.w, "w:news:status": 0 }, { "w:seen:2": 1, "x:cands": 1, "w:news:status": 0 });
  const before = { ...e.REPORTS.w };
  await NEW.watchNews(e, fetcherAt(1, [], 5), NOW + 600e3);
  assert.deepEqual(e.REPORTS.w, before);
});
await t("失敗後の再実行でも、運営者の情報は残る", async () => {
  const e = kvFail({ "w:seen:src": SEEDED, "x:tips": JSON.stringify([{ id: "m1", at: "a", text: "運営者" }]) }, "w:seen:2");
  await assert.rejects(NEW.watchNews(e, fetcherAt(0, [], 5), NOW)); e.fail.on = false;
  await NEW.watchNews(e, fetcherAt(1, [], 5), NOW + 600e3);
  assert.equal((await listTips(e))[0].id, "m1");
});
console.log(`news OK ${ok}${process.exitCode ? "（失敗あり）" : ""}`);
