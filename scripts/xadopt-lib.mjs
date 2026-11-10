// 公式Xの投稿を「画像つきの公式ポスト」として採用してよいかを、決まったルールで判定する（Phase0：判定とドライランだけ）。
//   ・ここは判定の部品。items.json や official-x.json は書き換えない（読むだけ）。
//   ・採用の可否は AI の読み取りではなく、ここのルールだけで決める。条件を満たさなければ採用しない（画像なしのまま）。
//   ・Xのtweet-result（埋め込み用の公開データ）は非公式・非保証。取得できなくても例外を外に出さず「判定不能」にする。
//   ・「新しい採用の判定（adopt）」と「採用済みの整合性チェック（verify）」は別の処理。後者は削除をしない（候補として報告するだけ）。

const DAY = 864e5;
const HYPHENS = "\\-‐‑‒–—―−ー";

// ---------- 小さな道具 ----------
export const nfkc = s => String(s ?? "").normalize("NFKC");
// 比較用：空白・長音・ハイフン・記号をそろえて取り除き、小文字にする
export const squash = s => nfkc(s).toLowerCase().replace(new RegExp(`[\\s\\u200b-\\u200f${HYPHENS}・･.,、。!?！？♪♡☆★✨"'’“”「」『』()（）\\[\\]【】:：/／~〜*＊]`, "g"), "");
export const jstDay = (ms = Date.now()) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
export const dayMs = d => Date.parse(d + "T00:00:00+09:00");
export const addDays = (d, n) => jstDay(dayMs(d) + n * DAY);

export function snowflakeMs(id) { try { return Number((BigInt(id) >> 22n) + 1288834974657n); } catch (e) { return NaN; } }
export function tokenOf(id) { return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, ""); }
export const XURL = /^https:\/\/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})/;
export function parseXUrl(u) { const m = XURL.exec(u || ""); return m ? { handle: m[1], id: m[2] } : null; }

// ---------- 投稿データ（tweet-result）の読み取り ----------
// 戻り値 kind: "tweet"（読めた）/ "gone"（削除・非公開）/ "empty"（中身がない＝判定不能）
export function parseTweet(j) {
  if (!j || typeof j !== "object") return { kind: "empty" };
  if (j.__typename === "TweetTombstone") return { kind: "gone" };
  if (!j.id_str || !j.user || !j.user.screen_name) return { kind: "empty" };
  const md = Array.isArray(j.mediaDetails) ? j.mediaDetails : [];
  const photos = Array.isArray(j.photos) ? j.photos.length : 0;
  const video = !!j.video || md.some(m => m && (m.type === "video" || m.type === "animated_gif"));
  const created = j.created_at && !isNaN(Date.parse(j.created_at)) ? Date.parse(j.created_at) : snowflakeMs(j.id_str);
  return {
    kind: "tweet", id: String(j.id_str), uid: String(j.user.id_str || ""), screen: String(j.user.screen_name), name: String(j.user.name || ""),
    created, text: String(j.text || ""),
    // 長い投稿（note_tweet）は本文が途中までしか入っていない
    truncated: !!j.note_tweet,
    reply: !!(j.in_reply_to_status_id_str || j.in_reply_to_screen_name || j.in_reply_to_user_id_str),
    quoted: !!(j.quoted_tweet || j.is_quote_status),
    retweet: !!(j.retweeted_tweet || j.retweeted_status),
    media: photos + md.filter(m => m && m.type === "photo").length > 0 || video, photos, video,
    sensitive: !!j.possibly_sensitive, edited: !!j.isEdited,
  };
}

// ---------- 取得（失敗しても例外を投げない） ----------
// 戻り値 { state: "ok"|"gone"|"failed", http, tweet?, why? }
export async function fetchTweet(id, { fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  try {
    const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), timeoutMs);
    let r; try { r = await fetchImpl(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${tokenOf(id)}`, { signal: ac.signal, headers: { accept: "application/json" } }); } finally { clearTimeout(tm); }
    if (r.status === 404) return { state: "gone", http: 404 };
    if (r.status !== 200) return { state: "failed", http: r.status, why: `HTTP ${r.status}` };
    let j; try { j = JSON.parse(await r.text()); } catch (e) { return { state: "failed", http: 200, why: "JSONが読めない" }; }
    const t = parseTweet(j);
    if (t.kind === "gone") return { state: "gone", http: 200, why: "削除・非公開（tombstone）" };
    if (t.kind !== "tweet") return { state: "failed", http: 200, why: "中身が空" };
    if (t.id !== String(id)) return { state: "failed", http: 200, why: "別のIDが返った" };
    return { state: "ok", http: 200, tweet: t };
  } catch (e) { return { state: "failed", why: e && e.name === "AbortError" ? "タイムアウト" : String(e && e.message || e).slice(0, 80) }; }
}

// ---------- 項目側：識別語・番号・日付 ----------
// どの商品・イベントでも出てくる語（これだけでは識別にならない）
const GENERIC = ["ちいかわ", "映画", "入場者特典", "特典", "プライズ", "グッズ", "新商品", "新作", "発売", "登場", "期間限定", "コラボ", "ポップアップストア", "popupstore", "popup", "store", "ストア", "人魚の島のひみつ", "コミック", "コミックス", "単行本"];
const GENERIC_SQ = GENERIC.map(squash).sort((a, b) => b.length - a.length);
const stripGeneric = s => { let x = s; for (const g of GENERIC_SQ) x = x.split(g).join(" "); return x; };

export function titleKeys(title) {
  let n = nfkc(title);
  const brand = []; n = n.replace(/([^\s×]+)\s*×\s*([^\s×（(]+)/g, (_, a, b) => { brand.push(squash(a).includes("ちいかわ") ? squash(b) : squash(a)); return " "; });
  const desc = []; for (const m of n.matchAll(/[（(]([^）)]{2,40})[）)]/g)) desc.push(...m[1].split(/[・、,\s]+/).map(squash).filter(x => x.length >= 2));
  const strong = [];
  n = n.replace(/[「『“]([^」』”]{1,60})[」』”]/g, (_, q) => { strong.push(q); return " "; });
  n = n.replace(/【[^】]*】|\([^)]*\)|\[[^\]]*\]/g, " ");     // 括弧の中は識別に使わない（（プライズ）、（第4弾のリバイバル）など）
  const nums = seriesNums(n);
  n = n.replace(/第\s*\d+\s*弾|\d+\s*巻|vol\.?\s*\d+/gi, " ");
  const toks = [];
  for (const part of n.split(/[\s@＠×\-‐‑‒–—―−\/・,、]+/)) { const sq = squash(part); if (sq) toks.push(sq); }
  const out = [];
  for (const raw of [...strong.map(squash), ...toks]) { const t = stripGeneric(raw).split(" ").map(x => x.trim()).filter(x => x.length >= 2); out.push(...t); }
  return { keys: [...new Set(out)], nums, brand, desc };
}

// 「第N弾」「N巻」「VolN」の番号を、範囲（第9〜11弾）も展開して集める
export function seriesNums(text) {
  const s = nfkc(text);
  const res = { dan: new Set(), kan: new Set(), vol: new Set() };
  const range = (set, a, b) => { a = +a; b = +b; if (b >= a && b - a <= 30) for (let i = a; i <= b; i++) set.add(i); else { set.add(a); set.add(b); } };
  for (const m of s.matchAll(/第\s*(\d+)\s*弾?\s*(?:~|〜|から|まで|-)\s*第?\s*(\d+)\s*弾/g)) range(res.dan, m[1], m[2]);
  for (const m of s.matchAll(/第\s*(\d+)\s*弾/g)) res.dan.add(+m[1]);
  for (const m of s.matchAll(/(\d+)\s*巻\s*(?:~|〜|から|-)\s*(\d+)\s*巻/g)) range(res.kan, m[1], m[2]);
  for (const m of s.matchAll(/(\d+)\s*巻/g)) res.kan.add(+m[1]);
  for (const m of s.matchAll(/vol\.?\s*(\d+)/gi)) res.vol.add(+m[1]);
  return res;
}

// 本文の日付：{ days:Set("YYYY-MM-DD"), months:Set(n) }。年がないものは投稿日の年として、投稿日より大きく前なら翌年
export function datesOf(text, baseMs) {
  const s = nfkc(text), days = new Set(), months = new Set();
  const by = Number(jstDay(baseMs).slice(0, 4));
  const put = (y, m, d) => {
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return;
    let yy = y || by; const pad = n => String(n).padStart(2, "0");
    if (!y && dayMs(`${yy}-${pad(m)}-${pad(d)}`) < baseMs - 60 * DAY) yy++;
    days.add(`${yy}-${pad(m)}-${pad(d)}`); months.add(m);
  };
  for (const m of s.matchAll(/(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日/g)) put(m[1] && +m[1], +m[2], +m[3]);
  for (const m of s.matchAll(/(?<![\d/])(?:(\d{4})\/)?(\d{1,2})\/(\d{1,2})(?![\d/])/g)) put(m[1] && +m[1], +m[2], +m[3]);
  for (const m of s.matchAll(/(\d{1,2})\s*月(?!\s*\d{1,2}\s*日)/g)) if (+m[1] >= 1 && +m[1] <= 12) months.add(+m[1]);
  return { days, months };
}

// 識別語が本文（と投稿者の表示名）にあるか。短い英数字（GUなど）は単語として単独で出てくるときだけ
export function hasKey(post, key, withName = false) {
  const extra = withName ? " " + post.name + " " + post.screen : "";
  if (/^[a-z0-9]{1,4}$/.test(key)) { const raw = nfkc(post.text + extra).toLowerCase(); return new RegExp(`(?<![a-z0-9])${key}(?![a-z0-9])`).test(raw); }
  return squash(post.text + extra).includes(key);
}

// ---------- 判定 ----------
// item: items.json の1件 / post: parseTweet の結果 / ctx: { accounts:{handle:{...}}, pins:{handle:uid}, mode:"adopt"|"verify" }
// 戻り値 { verdict:"adopt"|"reject"|"undecided", confidence:"high"|"medium"|"", reasons:[{code,msg}], facts }
export function judge(item, post, ctx) {
  const reasons = [], R = (code, msg) => reasons.push({ code, msg });
  const U = (code, msg) => reasons.push({ code, msg, soft: true });
  const accounts = ctx.accounts || {}, verify = ctx.mode === "verify";
  const handle = post.screen.toLowerCase();
  const via = item.xpostVia && accounts[String(item.xpostVia).toLowerCase()];
  const facts = { account: post.screen, uid: post.uid, postedAt: new Date(post.created).toISOString().slice(0, 10), truncated: post.truncated };

  // 1) 公式アカウントか（表示名・URLの@名ではなく、データが返した現在のアカウント名で見る）。数値IDは最初に見たものを控え、変わったら採用しない
  const official = !!accounts[handle];
  if (!official && !(verify && via)) R("not_official", `@${post.screen} は公式アカウントの一覧にない`);
  if (official && ctx.pins && ctx.pins[handle] && post.uid && ctx.pins[handle] !== post.uid) R("uid_changed", `@${post.screen} の数値IDが前回と違う（乗っ取り・別アカウントの可能性）`);
  // 2) 通常の投稿か
  if (post.reply) R("reply", "返信");
  if (post.quoted) R("quote", "引用ポスト");
  if (post.retweet) R("retweet", "リポスト");
  if (post.sensitive) R("sensitive", "センシティブ指定あり");
  if (!post.media) R("no_media", "画像・動画がない");

  // 3) 投稿日が範囲内か
  const s = item.s, e = item.e || item.s, isEvent = item.cat === "event";
  const lo = dayMs(s) - (isEvent ? 90 : 120) * DAY, hi = isEvent ? dayMs(e) + DAY : dayMs(s) + 8 * DAY;
  if (post.created < lo) R("too_old", `投稿日${facts.postedAt}が古い（${isEvent ? "開始の90日前" : "開始の120日前"}より前）`);
  if (post.created > hi) R("too_new", `投稿日${facts.postedAt}が${isEvent ? "終了日" : "開始日の7日後"}より後`);

  // 4) 名称：識別語がすべて本文にある
  const { keys, nums, brand, desc } = titleKeys(item.t);
  const kind = String((accounts[handle] || {}).kind || "");
  const ipDedicated = kind.startsWith("ちいかわ") || kind.startsWith("アニメ") || /ちいかわ/.test(post.name);
  if (!ipDedicated && !/ちいかわ|chiikawa|ハチワレ|うさぎ/i.test(nfkc(post.text))) R("no_ip", "本文に「ちいかわ」がない（投稿者がちいかわ専用の公式でないため必須）");
  if (brand.length && !brand.every(b => hasKey(post, b, true))) R("brand_missing", `ブランド名「${brand.join("」「")}」が本文にも投稿者名にもない`);
  const numOnly = !keys.length && (nums.dan.size || nums.kan.size || nums.vol.size);
  let descNeeded = false;
  if (keys.length) {
    const miss = keys.filter(k => !hasKey(post, k));
    if (miss.length) { if (post.truncated) U("name_unseen", `本文が途中まで。見えている範囲に「${miss.join("」「")}」がない`); else R("name_missing", `本文に「${miss.join("」「")}」がない`); }
  } else if (!numOnly) {
    if (desc.length && brand.length) { descNeeded = true; if (!desc.some(k => hasKey(post, k))) { if (post.truncated) U("name_unseen", "本文が途中まで。商品の説明語が見えない"); else R("name_missing", `本文に商品の説明語（${desc.join("・")}）がない`); } }
    else U("no_keys", "タイトルから商品の識別語を取り出せない");
  }
  // 5) 番号の矛盾（第N弾・N巻・VolN）
  const pn = seriesNums(post.text);
  for (const [kind, label] of [["dan", "第N弾"], ["kan", "N巻"], ["vol", "VolN"]]) {
    if (!nums[kind].size) continue;
    const want = [...nums[kind]];
    if (!pn[kind].size) { if (post.truncated) U("num_unseen", `${label}の番号が見えている範囲にない`); else R("num_missing", `${label}（${want.join(",")}）が本文にない`); }
    else if (!want.every(n => pn[kind].has(n))) R("num_conflict", `${label}が違う（項目:${want.join(",")} / 本文:${[...pn[kind]].join(",")}）`);
  }
  // 6) 日付：本文の日付と項目の日付
  const d = datesOf(post.text, post.created);
  const approx = item.sp && item.sp !== "day";
  const sMonth = +s.slice(5, 7);
  let dateSignal = "none";
  if (d.days.size || d.months.size) {
    let hit = false;
    if (approx) hit = d.months.has(sMonth);
    else { const sm = dayMs(s), em = dayMs(e); hit = [...d.days].some(x => dayMs(x) >= sm && dayMs(x) <= (isEvent ? em : sm)) || (!d.days.size && d.months.has(sMonth)); }
    if (hit) dateSignal = "match";
    else if (post.truncated) dateSignal = "unseen";
    else { dateSignal = "conflict"; R("date_conflict", `本文の日付（${[...d.days, ...[...d.months].map(m => m + "月")].slice(0, 4).join("・")}）に項目の日付（${s}${item.e ? "〜" + item.e : ""}）がない`); }
  } else dateSignal = post.truncated ? "unseen" : "none";
  facts.dateSignal = dateSignal; facts.keys = keys;
  if ((numOnly || descNeeded) && dateSignal !== "match") U("no_keys", "識別語がなく番号だけのタイトルは、本文の日付が一致するときだけ採用できる");

  const hard = reasons.filter(x => !x.soft);
  if (hard.length) return { verdict: "reject", confidence: "", reasons, facts };
  if (reasons.length) return { verdict: "undecided", confidence: "", reasons, facts };
  // 日付の裏づけがある＝high。日付が本文になく名称・番号・投稿日だけで通ったものは medium（件数は別に数える）
  return { verdict: "adopt", confidence: dateSignal === "match" ? "high" : "medium", reasons: post.edited ? [{ code: "edited", msg: "編集済み（現在の本文で判定）", soft: true }] : [], facts };
}

// 候補が複数あるとき：採用できるものが1つだけ、または同じ投稿のときだけ採用。別々の投稿が並んだら判定不能
export function pickBest(results) {
  const ok = results.filter(r => r.j.verdict === "adopt");
  if (!ok.length) return null;
  const ids = new Set(ok.map(r => r.post.id));
  if (ids.size > 1) return { ambiguous: true, among: [...ids] };
  const best = ok.find(r => r.j.confidence === "high") || ok[0];
  return { ambiguous: false, best };
}

// ---------- 採用済みの整合性チェック：誤削除を防ぐ ----------
// 404・削除は「3回、2日以上にまたがって」続いたときだけ「外してよい候補」にする。取得失敗（429・5xx・タイムアウト）は数えない。
export function updateStrikes(prev, result, today) {
  const st = { strikes: 0, days: [], ...(prev || {}) };
  if (result === "gone") { st.strikes++; if (!st.days.includes(today)) st.days.push(today); st.days = st.days.slice(-5); }
  else if (result === "ok") { st.strikes = 0; st.days = []; }
  // failed は何も変えない
  st.last = result; st.lastAt = today;
  st.removalCandidate = st.strikes >= 3 && st.days.length >= 2;
  return st;
}

// 再試行の間隔：取得失敗は 1日→3日→7日。判定が出たものは少し空ける
export function nextTry(entry, today) {
  const fails = entry.fails || 0;
  const gap = entry.verdict === "failed" ? [1, 3, 7][Math.min(fails - 1, 2)] || 1 : entry.verdict === "reject" ? 14 : 2;
  return addDays(today, gap);
}
