// 公式X自動採用 Phase0 の判定ロジックのテスト（ネットワーク不要。投稿データは実物と同じ形の手作りデータ）
//   node test/xadopt.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { squash, judge, pickBest, parseTweet, fetchTweet, titleKeys, seriesNums, datesOf, updateStrikes, nextTry, snowflakeMs, tokenOf } from "../scripts/xadopt-lib.mjs";
import { run, checkOutDir, summarizeHistory, tsv, reportLine } from "../scripts/xadopt.mjs";

let ok = 0, ng = 0;
const t = (name, cond, extra) => { if (cond) ok++; else { ng++; console.log("NG:", name, extra ?? ""); } };

const ACC = { chiikawa_movie: { name: "映画公式" }, furyu_prize: { name: "フリュープライズ公式" }, chiikawa_kouhou: { name: "ちいかわグッズ公式" }, chiikawa_popup: { name: "POP UP公式" } };
const TODAY = "2026-11-10";
// tweet-result と同じ形の手作りデータ
const mk = (o = {}) => ({ __typename: "Tweet", id_str: o.id || "2119656228808991045", created_at: o.at || "2026-11-09T05:00:00.000Z", text: o.text ?? "", lang: "ja",
  user: { id_str: o.uid || "1991422465646686209", screen_name: o.sn || "chiikawa_movie", name: o.name || (/chiikawa/i.test(o.sn || "chiikawa_movie") ? "ちいかわ公式" : "公式") },
  photos: o.noMedia ? [] : [{ url: "x" }], mediaDetails: o.noMedia ? [] : [{ type: "photo" }], possibly_sensitive: !!o.sens, isEdited: !!o.edited,
  ...(o.long ? { note_tweet: { id: "x" } } : {}), ...(o.reply ? { in_reply_to_status_id_str: "1" } : {}), ...(o.quote ? { quoted_tweet: { id_str: "2" } } : {}), ...(o.video ? { video: {} } : {}) });
const P = o => parseTweet(mk(o));
const J = (item, o, extra = {}) => judge(item, P(o), { accounts: ACC, pins: {}, mode: "adopt", ...extra });
const codes = j => j.reasons.map(r => r.code).join(",");

const TK9 = { id: "20261128-tokuten9", cat: "event", t: "映画ちいかわ 入場者特典 第9弾「チャームミニフィギュア」（第4弾のリバイバル）", s: "2026-11-28", e: "2026-12-04", sp: "day" };
const TK10 = { id: "20261205-tokuten10", cat: "event", t: "映画ちいかわ 入場者特典 第10弾「ごきげんセイレーン♪」（第3弾のリバイバル）", s: "2026-12-05", e: "2026-12-11", sp: "day" };
const TK11 = { id: "20261212-tokuten11", cat: "event", t: "映画ちいかわ 入場者特典 第11弾「チャームミニフィギュア」（第6弾のリバイバル）", s: "2026-12-12", e: "2026-12-18", sp: "day" };
const NOODLE = { id: "20261101-noodle", cat: "goods", t: "ちいかわ ぬーどるストッパーフィギュア－合格ラーメン－（プライズ）", s: "2026-11-25", e: null, sp: "late" };
const MOVIE_TEXT = "年内の入場者特典\n第8弾から12弾を一挙解禁！\n\n『#映画ちいかわ 人魚の島のひみつ』\n入場者特典第8弾は\n11月14日(土)より配布開始✨\n「エアーびんよよ」\n\n第9弾～第11弾は\n「チャームミニフィギュア」\n「ごきげんセイレーン♪」の\nリバイバル配布！\n\nそして第12弾は";
const NOODLE_TEXT = "ちいかわ\nぬーどるストッパーフィギュア\nー合格ラーメンー\n\nアイテムのディテールをご紹介✨️\n\n11月より展開予定！";
const BOOK = { id: "20261120-36", cat: "book", t: "コミック『ちいかわ』9巻（通常版・特装版）", s: "2026-11-20", e: null, sp: "day" };
const CHOCO = { id: "choco2", cat: "goods", t: "ちいかわ チョコサンプ2", s: "2026-11-23", e: null, sp: "day" };
const MAYER = { id: "20261125-parade-mayer-blanket", cat: "goods", t: "ちいかわ 超BIGマイヤーブランケット（パレードのプライズ・再登場）", s: "2026-11-25", e: null, sp: "late" };
const POPUP = { id: "popup-okazaki", cat: "event", t: "ちいかわPOP UP STORE イオンモール岡崎", s: "2026-12-01", e: "2026-12-20", sp: "day" };

// ----- 部品 -----
t("snowflake: 実物のID→2026-11-09", new Date(snowflakeMs("2119656228808991045")).toISOString().startsWith("2026-11-09"));
t("token: 数字と英字だけ", /^[0-9a-z]+$/.test(tokenOf("2119656228808991045")));
{ const s = seriesNums("第8弾から12弾を一挙解禁 第9弾～第11弾は"); t("番号の範囲展開", [8, 9, 10, 11, 12].every(n => s.dan.has(n)) && !s.dan.has(13), [...s.dan]); }
{ const s = seriesNums("第９〜１１弾"); t("全角・〜の範囲", s.dan.has(10), [...s.dan]); }
{ const k = titleKeys(TK9.t); t("特典9の識別語は「チャームミニフィギュア」だけ", k.keys.join() === squash("チャームミニフィギュア") && k.nums.dan.has(9) && !k.nums.dan.has(4), JSON.stringify(k)); }
{ const k = titleKeys(NOODLE.t); t("ラーメンの識別語", k.keys.length === 2, k.keys); }
{ const d = datesOf("11月14日(土)より 11/28 開始 2027年1月5日", Date.parse("2026-11-09T05:00:00Z")); t("日付の読み取り", d.days.has("2026-11-14") && d.days.has("2026-11-28") && d.days.has("2027-01-05")); }

// ----- 正例 -----
{ const j = J(TK9, { text: MOVIE_TEXT, long: true }); t("正例: 第9弾（長文・共有ポスト）→採用(medium)", j.verdict === "adopt" && j.confidence === "medium", codes(j) + JSON.stringify(j.facts)); }
{ const j = J(TK10, { text: MOVIE_TEXT, long: true }); t("正例: 第10弾→採用", j.verdict === "adopt", codes(j)); }
{ const j = J(TK11, { text: MOVIE_TEXT, long: true }); t("正例: 第11弾→採用", j.verdict === "adopt", codes(j)); }
{ const j = J(NOODLE, { id: "2115262274910748884", at: "2026-10-28T02:00:00.000Z", sn: "FURYU_prize", uid: "175226484", text: NOODLE_TEXT, video: true, noMedia: true }); t("正例: ぬーどるストッパー→採用(high)", j.verdict === "adopt" && j.confidence === "high", codes(j)); }
{ const j = J(BOOK, { sn: "chiikawa_kouhou", at: "2026-10-01T03:00:00Z", text: "コミック『ちいかわ』9巻\n11月20日発売！" }); t("正例: 9巻（日付つき）→採用(high)", j.verdict === "adopt" && j.confidence === "high", codes(j)); }
{ const j = J(CHOCO, { sn: "chiikawa_kouhou", at: "2026-11-02T03:00:00Z", text: "ちいかわ チョコサンプ2\n11月23日発売" }); t("正例: チョコサンプ2→採用", j.verdict === "adopt", codes(j)); }
{ const j = J(POPUP, { sn: "chiikawa_popup", at: "2026-11-20T03:00:00Z", text: "ちいかわPOP UP STORE\nイオンモール岡崎\n12月1日(火)〜12月20日(日)" }); t("正例: イベント（会場・期間）→採用(high)", j.verdict === "adopt" && j.confidence === "high", codes(j)); }

// ----- 負例（採用してはいけないもの） -----
{ const j = J(MAYER, { sn: "chiikawa_popup", at: "2025-10-28T03:00:00Z", text: "ちいかわ 超BIGマイヤーブランケット\n11月発売" }); t("負例: 去年のマイヤーブランケット→採用しない(too_old)", j.verdict === "reject" && /too_old/.test(codes(j)), codes(j)); }
{ const j = J(MAYER, { sn: "parade_prize", uid: "9", at: "2026-11-04T03:00:00Z", text: "ちいかわ 超BIGマイヤーブランケット 11月25日登場" }); t("負例: 未登録アカウント parade_prize→採用しない", j.verdict === "reject" && /not_official/.test(codes(j)), codes(j)); }
{ const j = J(CHOCO, { sn: "chiikawa_info", at: "2026-11-02T03:00:00Z", text: "ちいかわ チョコサンプ2 11月23日" }); t("負例: ファンアカウント chiikawa_info→採用しない", j.verdict === "reject" && /not_official/.test(codes(j))); }
{ const j = J(CHOCO, { sn: "chiikawa_kouhou", at: "2026-11-02T03:00:00Z", text: "ちいかわ チョコサンプ2 11月23日", reply: true }); t("負例: 返信", /reply/.test(codes(j)) && j.verdict === "reject"); }
{ const j = J(CHOCO, { sn: "chiikawa_kouhou", at: "2026-11-02T03:00:00Z", text: "ちいかわ チョコサンプ2 11月23日", quote: true }); t("負例: 引用", /quote/.test(codes(j)) && j.verdict === "reject"); }
{ const j = J(CHOCO, { sn: "chiikawa_kouhou", at: "2026-11-02T03:00:00Z", text: "ちいかわ チョコサンプ2 11月23日", noMedia: true }); t("負例: 画像・動画なし", /no_media/.test(codes(j)) && j.verdict === "reject"); }
{ const j = J(CHOCO, { sn: "chiikawa_kouhou", at: "2026-11-02T03:00:00Z", text: "ちいかわ チョコサンプ2 11月23日", sens: true }); t("負例: センシティブ", /sensitive/.test(codes(j))); }
{ const j = J(TK9, { text: "『映画ちいかわ』入場者特典第8弾は11月14日より配布\n「エアーびんよよ」" }); t("負例: 別の弾（第8弾の投稿を第9弾に）→採用しない", j.verdict === "reject" && /name_missing/.test(codes(j)), codes(j)); }
{ const j = J(TK9, { text: "第10弾「チャームミニフィギュア」配布開始 12月5日" }); t("負例: 番号が違う（第10弾の投稿を第9弾に）", /num_conflict/.test(codes(j)) && j.verdict === "reject", codes(j)); }
{ const j = J(TK9, { text: "「チャームミニフィギュア」配布開始 11月28日" }); t("負例: 弾の番号が本文にない（完全な本文）", /num_missing/.test(codes(j)) && j.verdict === "reject", codes(j)); }
{ const j = J(BOOK, { sn: "chiikawa_kouhou", at: "2026-10-01T03:00:00Z", text: "コミック『ちいかわ』8巻 好評発売中" }); t("負例: 別の巻", /num_conflict/.test(codes(j)) && j.verdict === "reject"); }
{ const j = J(POPUP, { sn: "chiikawa_popup", at: "2026-11-20T03:00:00Z", text: "ちいかわPOP UP STORE\nイオンモール岡崎\n1月5日(火)〜1月20日(日)" }); t("負例: 別の期間", /date_conflict/.test(codes(j)) && j.verdict === "reject", codes(j)); }
{ const j = J(POPUP, { sn: "chiikawa_popup", at: "2026-11-20T03:00:00Z", text: "ちいかわPOP UP STORE イオンモール名古屋 12月1日〜12月20日" }); t("負例: 別会場", /name_missing/.test(codes(j)) && j.verdict === "reject"); }
{ const j = J(NOODLE, { id: "2115262274910748884", sn: "FURYU_prize", uid: "1", at: "2026-10-28T02:00:00Z", text: NOODLE_TEXT.replace("11月", "3月") }); t("負例: 別の月の発売", /date_conflict/.test(codes(j))); }
{ const j = J(CHOCO, { sn: "chiikawa_kouhou", at: "2026-02-02T03:00:00Z", text: "ちいかわ チョコサンプ2 11月23日" }); t("負例: 発売の7か月前の投稿は範囲外", /too_old/.test(codes(j))); }
{ const j = J(CHOCO, { sn: "chiikawa_kouhou", at: "2026-12-10T03:00:00Z", text: "ちいかわ チョコサンプ2 11月23日" }); t("負例: 発売後に出た投稿は範囲外", /too_new/.test(codes(j))); }
{ const j = J(CHOCO, { sn: "chiikawa_kouhou", uid: "999", at: "2026-11-02T03:00:00Z", text: "ちいかわ チョコサンプ2 11月23日" }, { pins: { chiikawa_kouhou: "111" } }); t("負例: 数値IDが前回と違う", /uid_changed/.test(codes(j)) && j.verdict === "reject"); }
{ const j = J({ ...CHOCO, t: "ちいかわ グッズ" }, { sn: "chiikawa_kouhou", at: "2026-11-02T03:00:00Z", text: "ちいかわ グッズ 11月23日" }); t("負例: 識別語がないタイトルは採用しない", j.verdict !== "adopt"); }
{ const j = J(TK9, { text: "第8弾から12弾を一挙解禁！ 11月14日", long: true }); t("判定不能: 長文で名称が見えない→採用しない(undecided)", j.verdict === "undecided", codes(j)); }
{ const a = J(CHOCO, { sn: "chiikawa_kouhou", at: "2026-11-02T03:00:00Z", text: "ちいかわ チョコサンプ2 11月23日" }), b = J(CHOCO, { id: "2119656228808991046", sn: "chiikawa_kouhou", at: "2026-11-03T03:00:00Z", text: "ちいかわ チョコサンプ2 11月23日 予約" });
  const r = pickBest([{ post: P({}), j: a }, { post: P({ id: "2119656228808991046" }), j: b }]); t("別々の投稿が2つ当てはまる→採用しない(ambiguous)", r && r.ambiguous);
  const same = pickBest([{ post: P({}), j: a }, { post: P({}), j: a }]); t("同じ投稿の重複は1つとして扱う", same && !same.ambiguous); }

{ const j = J({ id: "gu", cat: "goods", t: "ちいかわ×GU コラボ（おでかけ着・ルームウェア）", s: "2026-11-20", e: null, sp: "day" }, { sn: "gu_global", name: "GU（ジーユー）", at: "2026-09-17T02:00:00Z", long: true, text: "人気キャラクター「ちいかわ」とのコラボレーション\n第1弾はニットなどのおでかけ着、第2弾はルームウェアが登場\n✅第1弾は11/20(金)\n✅第2弾は11/27(金)" }, { accounts: { ...ACC, gu_global: { kind: "ブランド公式" } } });
  t("正例: GU（投稿者名がブランド名・登録済みと仮定）→採用", j.verdict === "adopt" && j.confidence === "high", codes(j)); 
  const k = J({ id: "gu2", cat: "goods", t: "ちいかわ×GU コラボ", s: "2026-11-20", e: null, sp: "day" }, { sn: "chiikawa_kouhou", name: "ちいかわグッズ公式", at: "2026-09-17T02:00:00Z", text: "guideline updated 11/20" }); t("負例: 英字2文字が別の単語の一部に入っているだけ（guide）は一致にしない", /brand_missing/.test(codes(k)) && k.verdict === "reject", codes(k)); }
{ const j = J(BOOK, { sn: "chiikawa_kouhou", at: "2026-09-04T13:00:00Z", text: "『#ちいかわ』9巻、11月20日(金)発売決定！ 8巻と併せて" }); t("正例: 番号だけのタイトル（9巻）は日付が合えば採用", j.verdict === "adopt", codes(j));
  const k = J(BOOK, { sn: "chiikawa_kouhou", at: "2026-09-04T13:00:00Z", text: "『#ちいかわ』9巻 発売決定！" }); t("番号だけのタイトルは日付がないと採用しない", k.verdict === "undecided", codes(k)); }

// ----- 識別語の分離（ブランド語・商品語・IP語）：投稿者名だけでは商品一致にならない -----
{ const GU = { id: "gu", cat: "goods", t: "ちいかわ×GU コラボ（おでかけ着・ルームウェア）", s: "2026-11-20", e: null, sp: "day" }, ACCG = { ...ACC, gu_global: { kind: "ブランド公式" } };
  const g = (text, o = {}) => J(GU, { sn: "gu_global", name: "GU（ジーユー）", at: "2026-09-17T02:00:00Z", text, ...o }, { accounts: ACCG });
  t("分離: 正しいGUの本文→採用(high)", (x => x.verdict === "adopt" && x.confidence === "high")(g("「ちいかわ」とのコラボ 第1弾はニットなどのおでかけ着 11/20(金)")), codes(g("「ちいかわ」とのコラボ 第1弾はニットなどのおでかけ着 11/20(金)")));
  t("分離: 別IPのコラボを同じ日に告知→採用しない(no_ip)", /no_ip/.test(codes(g("人気キャラクター「ミッフィー」とのコラボ 第1弾はニットなどのおでかけ着 11/20(金)"))));
  t("分離: GUの別商品（説明語なし）→採用しない", (x => x.verdict === "reject" && /name_missing/.test(codes(x)))(g("ちいかわ 新作ぬいぐるみ 11/20(金)発売")));
  t("分離: 投稿者名がGUでも、本文にブランド語も説明語もなければ採用しない", g("ちいかわ 新作 11/20").verdict === "reject");
  t("分離: 説明語があっても日付が合わなければ採用しない", g("「ちいかわ」とのコラボ おでかけ着 12/25(金)").verdict !== "adopt");
  t("分離: 説明語が長文で見えないとき→判定不能（採用しない）", (x => x.verdict === "undecided")(g("「ちいかわ」とのコラボ 11/20(金)", { long: true })));
  // 投稿者名に商品語が入っていても、本文になければ一致にしない
  const c = J(CHOCO, { sn: "chiikawa_kouhou", name: "ちいかわ チョコサンプ2 公式", at: "2026-11-02T03:00:00Z", text: "ちいかわ 新商品 11月23日発売" });
  t("分離: 投稿者名に商品語があっても本文になければ不採用", c.verdict === "reject" && /name_missing/.test(codes(c)), codes(c));
  // IP語：ちいかわ専用の公式でないアカウントは、本文に「ちいかわ」が必須
  const f = J(NOODLE, { id: "2115262274910748884", sn: "FURYU_prize", uid: "1", name: "フリュープライズ公式", at: "2026-10-28T02:00:00Z", text: NOODLE_TEXT.replace("ちいかわ\n", "") });
  t("IP語: 企業アカウントの本文に「ちいかわ」がなければ採用しない", /no_ip/.test(codes(f)) && f.verdict === "reject", codes(f));
  const k2 = J(CHOCO, { sn: "chiikawa_kouhou", name: "ちいかわグッズ公式", at: "2026-11-02T03:00:00Z", text: "チョコサンプ2 11月23日発売" }, { accounts: { ...ACC, chiikawa_kouhou: { kind: "ちいかわ公式" } } });
  t("IP語: ちいかわ専用の公式は本文に「ちいかわ」がなくてよい", k2.verdict === "adopt", codes(k2));
  const b = titleKeys("ちいかわ×GU コラボ（おでかけ着・ルームウェア）"); t("分離: ブランド語・説明語を取り出す", b.brand.join() === "gu" && b.keys.length === 0 && b.desc.length === 2, JSON.stringify(b));
  const b2 = titleKeys("ちいかわ チョコサンプ2"); t("分離: ブランド語がなければ商品語だけ", b2.brand.length === 0 && b2.keys.join() === squash("チョコサンプ2"), JSON.stringify(b2));
}

// ----- 取得失敗（落ちない・採用しない） -----
const resp = (status, body) => async () => ({ status, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });
for (const [name, impl, want] of [["429", resp(429, ""), "failed"], ["500", resp(500, ""), "failed"], ["404", resp(404, ""), "gone"], ["壊れたJSON", resp(200, "<html>"), "failed"], ["空{}", resp(200, {}), "failed"],
  ["例外", async () => { throw new Error("net"); }, "failed"], ["tombstone", resp(200, { __typename: "TweetTombstone" }), "gone"], ["別ID", resp(200, mk({ id: "5555555" })), "failed"],
  ["タイムアウト", (u, o) => new Promise((_, rej) => o.signal.addEventListener("abort", () => rej(Object.assign(new Error("a"), { name: "AbortError" })))), "failed"]]) {
  const r = await fetchTweet("2119656228808991045", { fetchImpl: impl, timeoutMs: 50 });
  t(`取得 ${name} → ${want}`, r.state === want, JSON.stringify(r));
}
{ const r = await fetchTweet("2119656228808991045", { fetchImpl: resp(200, mk({ text: "x" })) }); t("取得 200 → ok", r.state === "ok" && r.tweet.screen === "chiikawa_movie"); }

// ----- 誤削除を防ぐ -----
{ let s = updateStrikes(null, "gone", "2026-11-10"); t("404が1回→まだ外さない", !s.removalCandidate && s.strikes === 1);
  s = updateStrikes(s, "failed", "2026-11-11"); t("取得失敗は回数に数えない", s.strikes === 1);
  s = updateStrikes(s, "gone", "2026-11-10"); s = updateStrikes(s, "gone", "2026-11-10"); t("同じ日に3回404でも外さない（2日以上が必要）", !s.removalCandidate && s.strikes === 3, JSON.stringify(s));
  s = updateStrikes(s, "gone", "2026-11-12"); t("3回以上かつ2日以上→外してよい候補", s.removalCandidate);
  s = updateStrikes(s, "ok", "2026-11-13"); t("一度でも見えたらリセット", s.strikes === 0 && !s.removalCandidate); }
t("再試行の間隔: 失敗1→1日、2→3日、3→7日", nextTry({ verdict: "failed", fails: 1 }, "2026-11-10") === "2026-11-11" && nextTry({ verdict: "failed", fails: 2 }, "2026-11-10") === "2026-11-13" && nextTry({ verdict: "failed", fails: 9 }, "2026-11-10") === "2026-11-17");

// ----- run（ドライラン全体）：失敗しても止まらず、データを書かない -----
const ITEMS = [
  { ...TK9, updatedAt: "2026-11-09" }, { ...TK10 }, { ...CHOCO },
  { ...MAYER, srcs: ["https://x.com/parade_prize/status/2090000000000000001"] },
  { ...BOOK },                                                                              // 候補なし
  { ...NOODLE, xpost: "https://x.com/FURYU_prize/status/2115262274910748884", xpostNote: "x" },   // 採用済み（verify）
  { ...POPUP, xpost: "https://x.com/chiikawa_popup/status/2118000000000000001", xpostNote: "x" },
];
const CANDS = { "20261128-tokuten9": ["https://x.com/chiikawa_movie/status/2119656228808991045"], "20261205-tokuten10": ["https://x.com/chiikawa_movie/status/2119656228808991045"], choco2: ["https://x.com/chiikawa_kouhou/status/2110000000000000001"] };
const DB = {
  "2119656228808991045": mk({ text: MOVIE_TEXT, long: true }),
  "2110000000000000001": mk({ id: "2110000000000000001", sn: "chiikawa_kouhou", at: "2026-11-02T03:00:00Z", text: "ちいかわ チョコサンプ2 11月23日" }),
  "2090000000000000001": mk({ id: "2090000000000000001", sn: "parade_prize", uid: "9", at: "2025-10-28T03:00:00Z", text: "ちいかわ 超BIGマイヤーブランケット" }),
  "2115262274910748884": mk({ id: "2115262274910748884", sn: "FURYU_prize", uid: "175226484", at: "2026-10-28T02:00:00Z", text: NOODLE_TEXT, video: true }),
};
const mockFetch = mode => async u => { const id = new URL(u).searchParams.get("id"); if (mode === "down") return { status: 503, text: async () => "" }; if (mode === "throw") throw new Error("boom");
  if (id === "2118000000000000001") return { status: 404, text: async () => "" };
  return DB[id] ? { status: 200, text: async () => JSON.stringify(DB[id]) } : { status: 404, text: async () => "" }; };
const itemsHash = crypto.createHash("sha1").update(fs.readFileSync("data/items.json")).digest("hex"), offHash = crypto.createHash("sha1").update(fs.readFileSync("data/official-x.json")).digest("hex");
{
  const r = await run({ items: ITEMS, accounts: ACC, today: TODAY, cands: CANDS, fetchImpl: mockFetch("ok"), gapMs: 0 });
  const by = id => r.decisions.filter(d => d.kind === "adopt" && d.itemId === id);
  t("run: 特典9は採用できる", by("20261128-tokuten9")[0]?.verdict === "adopt", JSON.stringify(by("20261128-tokuten9")));
  t("run: 特典10も同じ投稿で採用できる", by("20261205-tokuten10")[0]?.verdict === "adopt");
  t("run: チョコサンプ2は採用できる", by("choco2")[0]?.verdict === "adopt");
  t("run: パレードは採用しない（未登録＋去年）", by("20261125-parade-mayer-blanket")[0]?.verdict === "reject" && /not_official/.test(by("20261125-parade-mayer-blanket")[0].reasons.map(x => x.code).join()));
  t("run: 候補のない項目は「候補なし」", by("20261120-36")[0]?.verdict === "no_candidate");
  t("run: 採用済み（ラーメン）は整合性チェックで問題なし", r.decisions.find(d => d.kind === "verify" && d.itemId === "20261101-noodle")?.verdict === "ok");
  t("run: 404の採用済みは1回目では外さない", r.decisions.find(d => d.kind === "verify" && d.itemId === "popup-okazaki")?.verdict === "gone_once");
  t("run: 数値IDを控える（TOFU）", r.state.pins.chiikawa_movie === "1991422465646686209");
  t("run: 同じ投稿は1回だけ取得（共有ポスト）", r.summary.fetched === 5, r.summary.fetched);
  // 2回目：判定済みは日が浅いので見送り（無駄に取得しない）
  const r2 = await run({ items: ITEMS, accounts: ACC, state: r.state, today: TODAY, cands: CANDS, fetchImpl: mockFetch("ok"), gapMs: 0 });
  t("run: 2回目は採用済み候補を見送って取得を減らす", r2.decisions.filter(d => d.verdict === "skipped").length >= 3 && r2.summary.fetched < r.summary.fetched, JSON.stringify(r2.summary));
  // 404が2日以上・3回続くまで「外してよい候補」にならない
  let s = r2.state;
  for (const d of ["2026-11-11", "2026-11-12"]) s = (await run({ items: ITEMS, accounts: ACC, state: s, today: d, cands: CANDS, fetchImpl: mockFetch("ok"), gapMs: 0 })).state;
  const r5 = await run({ items: ITEMS, accounts: ACC, state: s, today: "2026-11-13", cands: CANDS, fetchImpl: mockFetch("ok"), gapMs: 0 });
  t("run: 3回・2日以上404が続くと外してよい候補", r5.decisions.find(d => d.itemId === "popup-okazaki" && d.kind === "verify")?.verdict === "removal_candidate", JSON.stringify(r5.state.verify["popup-okazaki"]));
}
for (const mode of ["down", "throw"]) {
  const r = await run({ items: ITEMS, accounts: ACC, today: TODAY, cands: CANDS, fetchImpl: mockFetch(mode), gapMs: 0 });
  t(`run: Xが落ちて（${mode}）も例外にならず、採用は0件`, r.summary.adoptHigh + r.summary.adoptMedium === 0 && r.summary.fetchFailed > 0);
  t(`run: Xが落ちて（${mode}）も採用済みは外さない`, !r.decisions.some(d => d.verdict === "removal_candidate" || d.verdict === "gone_once") && r.decisions.filter(d => d.kind === "verify").every(d => d.verdict === "check_failed"));
  const r2 = await run({ items: ITEMS, accounts: ACC, state: r.state, today: TODAY, cands: CANDS, fetchImpl: mockFetch(mode), gapMs: 0 });
  t(`run: 失敗した候補は翌日まで再取得しない（${mode}）`, r2.summary.fetched === 0 || r2.decisions.some(d => d.verdict === "skipped"));
}
{ const r = await run({ items: ITEMS, accounts: ACC, today: TODAY, cands: CANDS, fetchImpl: mockFetch("ok"), gapMs: 0, maxAdopt: 1, maxVerify: 0 });
  t("run: 確認の上限を守る（adopt1・verify0）", r.summary.fetched === 1 && r.decisions.some(d => d.verdict === "deferred")); }
t("run後も items.json / official-x.json は変わらない", crypto.createHash("sha1").update(fs.readFileSync("data/items.json")).digest("hex") === itemsHash && crypto.createHash("sha1").update(fs.readFileSync("data/official-x.json")).digest("hex") === offHash);

// ----- 早期打ち切り・X側の異常・前回の記録・結果の1行 -----
{ let calls = 0; const down = async () => { calls++; return { status: 503, text: async () => "" }; };
  const r = await run({ items: ITEMS, accounts: ACC, today: TODAY, cands: CANDS, fetchImpl: down, gapMs: 0, abortAfter: 2 });
  t("打ち切り: 指定回数続けて失敗したら残りは取得しない", calls === 2 && r.summary.aborted > 0 && r.summary.connection === "failed", `calls=${calls} ${JSON.stringify(r.summary)}`);
  t("打ち切り: 取得しなかった候補は記録せず、次回に回す", r.decisions.some(d => d.verdict === "deferred") && Object.keys(r.state.tries).length === 3, JSON.stringify(Object.keys(r.state.tries)));
  calls = 0; const r0 = await run({ items: ITEMS, accounts: ACC, today: TODAY, cands: CANDS, fetchImpl: down, gapMs: 0 });
  t("打ち切り: 既定は3回続けて失敗したらやめる", calls === 3 && r0.summary.fetchFailed === 3, `calls=${calls}`);
  t("打ち切り: 採用済みは何も変えない", r.decisions.filter(d => d.kind === "verify").every(d => d.verdict === "check_failed") && Object.keys(r.state.verify).every(k => (r.state.verify[k].strikes || 0) === 0));
  const r2 = await run({ items: ITEMS, accounts: ACC, today: TODAY, cands: CANDS, fetchImpl: mockFetch("ok"), gapMs: 0, abortAfter: 3 });
  t("打ち切り: 1件でも読めれば連続失敗はリセットされる（正常時は打ち切らない）", r2.summary.aborted === 0 && r2.summary.connection !== "failed"); }
{ let n = 0; const flaky = async u => { n++; const id = new URL(u).searchParams.get("id"); if (n % 3 === 0) return { status: 429, text: async () => "" }; return mockFetch("ok")(u); };
  const r = await run({ items: ITEMS, accounts: ACC, today: TODAY, cands: CANDS, fetchImpl: flaky, gapMs: 0 });
  t("打ち切り: 失敗が飛び飛びなら続ける（連続でないため）", r.summary.aborted === 0 && r.summary.connection === "partial", JSON.stringify(r.summary)); }
{ const all404 = async () => ({ status: 404, text: async () => "" });
  const items = [1, 2, 3, 4].map(i => ({ id: `x${i}`, cat: "goods", t: `ちいかわ 商品${i}`, s: "2026-11-25", e: null, sp: "day", xpost: `https://x.com/chiikawa_kouhou/status/21000000000000000${i}1`, xpostNote: "x" }));
  const r = await run({ items, accounts: ACC, today: TODAY, fetchImpl: all404, gapMs: 0 });
  t("X側の異常: 読めた投稿が0で404ばかり→削除の回数に数えない", r.summary.xBroken && Object.keys(r.state.verify).length === 0 && r.decisions.every(d => d.verdict === "check_failed"), JSON.stringify(r.summary)); }
{ const r1 = await run({ items: ITEMS, accounts: ACC, today: TODAY, cands: CANDS, fetchImpl: mockFetch("ok"), gapMs: 0 });
  t("前回の記録: 初回は「なし（通算1回目）」", !r1.summary.continuity.previous && r1.summary.continuity.runs === 1 && /前回の記録=なし（通算1回目）/.test(reportLine(r1.summary)));
  const r2 = await run({ items: ITEMS, accounts: ACC, state: r1.state, today: "2026-11-11", cands: CANDS, fetchImpl: mockFetch("ok"), gapMs: 0 });
  t("前回の記録: 2回目は「あり（通算2回目・前回2026-11-10）」", r2.summary.continuity.previous && /前回の記録=あり（通算2回目・前回2026-11-10）/.test(reportLine(r2.summary)), reportLine(r2.summary));
  t("結果の1行: 接続・取得回数・採用見込み・点検結果が入る", /Xへの接続=届く/.test(reportLine(r1.summary)) && /新規採用の見込み 3件/.test(reportLine(r1.summary)) && /問題なし1/.test(reportLine(r1.summary)), reportLine(r1.summary)); }

// ----- 出力先の安全・一覧・履歴 -----
for (const bad of ["data", "dist/x", "src", "functions/api"]) { let threw = false; try { checkOutDir(bad); } catch (e) { threw = true; } t(`出力先 ${bad} は拒否`, threw); }
t("出力先 .xadopt は許可", !!checkOutDir(".xadopt"));
{ const r = await run({ items: ITEMS, accounts: ACC, today: TODAY, cands: CANDS, fetchImpl: mockFetch("ok"), gapMs: 0 }); const x = tsv(r.decisions);
  t("一覧（TSV）に判定と理由が出る", /採用できる/.test(x) && /採用しない/.test(x) && /公式アカウントの一覧にない/.test(x) && /候補なし/.test(x));
  const h = summarizeHistory([JSON.stringify({ at: "2026-11-10T00:00:00Z", decisions: r.decisions.filter(d => d.verdict === "adopt") }), JSON.stringify({ at: "2026-11-11T00:00:00Z", decisions: r.decisions.filter(d => d.verdict === "adopt") })]);
  t("履歴の集計：安全に採用できた項目数と連続日数", h.adoptableItems === 3 && h.stable === 3 && h.runs === 2, JSON.stringify(h)); }

// ----- CLI：失敗しても終了コード0、データ非更新 -----
{ const { spawnSync } = await import("node:child_process"); const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "xadopt-"));
  const r = spawnSync("node", ["scripts/xadopt.mjs", "--out", path.join(tmp, "o"), "--max-adopt", "0", "--max-verify", "0"], { encoding: "utf8" });
  t("CLI: 取得0件でも正常終了し、一覧・履歴・報告の1行を書く", r.status === 0 && fs.existsSync(path.join(tmp, "o", "latest.tsv")) && fs.existsSync(path.join(tmp, "o", "history.jsonl")) && fs.existsSync(path.join(tmp, "o", "report.txt")) && /XADOPT_REPORT: ドライラン：Xへの接続=/.test(r.stdout), r.stdout + r.stderr);
  const bad = spawnSync("node", ["scripts/xadopt.mjs", "--out", "data"], { encoding: "utf8" });
  t("CLI: 出力先が不正でも終了コード0・報告の1行はスキップと出る", bad.status === 0 && /XADOPT_REPORT: ドライラン：スキップ/.test(bad.stdout), bad.stdout + bad.stderr);
  fs.rmSync(tmp, { recursive: true, force: true }); }

console.log(ng ? `NG ${ng}件 / OK ${ok}件` : `OK ${ok}件`);
process.exit(ng ? 1 : 0);
