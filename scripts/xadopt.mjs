// 公式Xの自動採用 Phase0：ドライラン（読むだけ。items.json・official-x.json・dist には一切書かない）
//
//   node scripts/xadopt.mjs [--out .xadopt] [--cands cands.json] [--max-adopt 10] [--max-verify 10] [--today YYYY-MM-DD] [--summary]
//
//   adopt  … 画像がまだない掲載中の項目について、候補の公式ポストを判定して「採用できる／できない／判定不能」を一覧にする
//   verify … すでに xpost が入っている項目を少しずつ取得し直し、おかしくなっていないかを報告する（外さない。404が2日以上・3回続いたら「外してよい候補」と書くだけ）
//   候補のURLは、項目の src / srcs にある x.com の投稿と、--cands（{ "項目ID": ["https://x.com/…/status/…"] }。自動更新の検索で見つけたもの）。
//   取得に失敗しても例外で止まらず、終了コードは常に0（通常のニュース・グッズ更新を止めない）。
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fetchTweet, judge, pickBest, parseXUrl, updateStrikes, nextTry, jstDay, addDays, dayMs } from "./xadopt-lib.mjs";

const BAD_OUT = ["data", "dist", "src", "functions", "test", "scripts"];
export function checkOutDir(out, root = process.cwd()) {
  const rel = path.relative(root, path.resolve(out));
  if (!rel.startsWith("..") && BAD_OUT.includes(rel.split(path.sep)[0])) throw new Error(`出力先 ${out} は商品データ・サイトのフォルダの中です。.xadopt など別の場所にしてください`);
  return path.resolve(out);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const isActive = (it, today) => (it.e || it.s) >= today;

// abortAfter：取得の失敗（接続できない・429・5xx・タイムアウト）が続けて何回になったら、残りの取得をやめるか（接続できない環境で時間を使わない）
export async function run({ items, accounts, state = {}, cands = {}, today = jstDay(), fetchImpl, maxAdopt = 10, maxVerify = 10, gapMs = 500, budgetMs = 90000, abortAfter = 3 }) {
  const t0 = Date.now(), st = JSON.parse(JSON.stringify(state));
  st.pins ||= {}; st.tries ||= {}; st.verify ||= {};
  const cont = { previous: (st.runs || 0) > 0, runs: (st.runs || 0) + 1, prevRunAt: st.lastRunAt || "" };   // 前回の記録が残っていたか（自動更新の環境で履歴が保たれるかの確認用）
  st.runs = cont.runs; st.firstRunAt ||= today; st.lastRunAt = today;
  const cache = new Map(), decisions = [], counts = { fetched: 0, failed: 0, ok: 0, gone: 0, aborted: 0 };
  let consecFail = 0, aborted = false;
  const getPost = async id => {
    if (cache.has(id)) return cache.get(id);
    if (aborted) { counts.aborted++; return { state: "failed", aborted: true, why: `取得の失敗が${abortAfter}回続いたため、残りは今回取得しない` }; }
    if (Date.now() - t0 > budgetMs) { const r = { state: "failed", aborted: true, why: "時間切れ（次回に回す）" }; cache.set(id, r); return r; }
    if (counts.fetched) await sleep(gapMs);
    counts.fetched++;
    const r = await fetchTweet(id, { fetchImpl });
    if (r.state === "failed") { counts.failed++; if (++consecFail >= abortAfter) aborted = true; } else { consecFail = 0; if (r.state === "ok") counts.ok++; else counts.gone++; }
    cache.set(id, r); return r;
  };
  const ctxOf = mode => ({ accounts, pins: st.pins, mode });
  const pin = (j, p) => { const h = p.screen.toLowerCase(); if (j.verdict === "adopt" && accounts[h] && p.uid && !st.pins[h]) st.pins[h] = p.uid; };

  // ===== adopt：まだ xpost がない項目 =====
  const targets = items.filter(it => !it.xpost && !it.xpostVia && isActive(it, today) && it.s <= addDays(today, 120));
  const queue = [];
  let shownBySrcs = 0, noCand = 0;
  for (const it of targets) {
    const urls = [...new Set([it.src, ...(it.srcs || []), ...(cands[it.id] || [])].map(parseXUrl).filter(Boolean).map(x => JSON.stringify(x)))].map(x => JSON.parse(x));
    if ([it.src, ...(it.srcs || [])].map(parseXUrl).some(u => u && accounts[u.handle.toLowerCase()])) { shownBySrcs++; continue; }       // すでに src から公式ポストとして表示されている
    if (!urls.length) { noCand++; decisions.push({ kind: "adopt", itemId: it.id, title: it.t, start: it.s, verdict: "no_candidate", reasons: [{ code: "no_candidate", msg: "候補の投稿URLがない" }] }); continue; }
    for (const u of urls) {
      const tr = st.tries[`${it.id}|${u.id}`];
      const skip = tr && tr.nextAt > today && !(it.updatedAt && tr.at && it.updatedAt > tr.at);
      queue.push({ it, u, tr, skip });
    }
  }
  queue.sort((a, b) => (a.tr ? 1 : 0) - (b.tr ? 1 : 0) || String(a.tr?.nextAt || "").localeCompare(String(b.tr?.nextAt || "")));
  const perItem = new Map(); let adoptFetches = 0;
  for (const q of queue) {
    const { it, u, tr } = q, key = `${it.id}|${u.id}`;
    if (q.skip) { decisions.push({ kind: "adopt", itemId: it.id, title: it.t, start: it.s, postUrl: `https://x.com/${u.handle}/status/${u.id}`, verdict: "skipped", reasons: [{ code: "skipped", msg: `前回の判定（${tr.verdict}）から日が浅いため${tr.nextAt}まで見送り` }] }); continue; }
    if (!cache.has(u.id)) { if (adoptFetches >= maxAdopt) { decisions.push({ kind: "adopt", itemId: it.id, title: it.t, start: it.s, postUrl: `https://x.com/${u.handle}/status/${u.id}`, verdict: "deferred", reasons: [{ code: "deferred", msg: "1回の確認件数の上限のため次回に回す" }] }); continue; } adoptFetches++; }
    const r = await getPost(u.id);
    if (r.aborted) { decisions.push({ kind: "adopt", itemId: it.id, title: it.t, start: it.s, postUrl: `https://x.com/${u.handle}/status/${u.id}`, verdict: "deferred", reasons: [{ code: "deferred", msg: r.why, soft: true }] }); continue; }
    let d;
    if (r.state === "ok") { const j = judge(it, r.tweet, ctxOf("adopt")); pin(j, r.tweet); d = { verdict: j.verdict, confidence: j.confidence, reasons: j.reasons, facts: j.facts, account: r.tweet.screen, postedAt: j.facts.postedAt, _p: r.tweet, _j: j }; }
    else if (r.state === "gone") d = { verdict: "reject", reasons: [{ code: "gone", msg: "投稿が削除・非公開（404）" }] };
    else d = { verdict: "undecided", reasons: [{ code: "fetch_failed", msg: `取得できない（${r.why || "不明"}）。採用せず、あとで再試行`, soft: true }], fetchFailed: true };
    const ent = { at: today, verdict: d.fetchFailed ? "failed" : d.verdict, fails: d.fetchFailed ? (tr?.fails || 0) + 1 : 0, adoptDays: d.verdict === "adopt" ? [...new Set([...(tr?.adoptDays || []), today])].slice(-30) : (tr?.adoptDays || []) };
    ent.nextAt = nextTry(ent, today); st.tries[key] = ent;
    const row = { kind: "adopt", itemId: it.id, title: it.t, start: it.s, postUrl: `https://x.com/${u.handle}/status/${u.id}`, account: d.account, postedAt: d.postedAt, verdict: d.verdict, confidence: d.confidence || "", reasons: d.reasons, adoptDays: ent.adoptDays.length };
    decisions.push(row);
    (perItem.get(it.id) || perItem.set(it.id, []).get(it.id)).push({ post: d._p, j: d._j, row });
  }
  // 項目ごとの最終判断（複数の候補がある場合）
  for (const [id, rs] of perItem) {
    const valid = rs.filter(r => r.post);
    if (valid.length < 2) continue;
    const pb = pickBest(valid);
    if (pb && pb.ambiguous) for (const r of valid) if (r.row.verdict === "adopt") { r.row.verdict = "undecided"; r.row.confidence = ""; r.row.reasons = [...r.row.reasons, { code: "ambiguous", msg: `別々の投稿が複数当てはまる（${pb.among.join(", ")}）。同点は採用しない`, soft: true }]; }
  }

  // ===== verify：採用済み xpost の整合性チェック（外さない・書き換えない） =====
  const have = items.filter(it => it.xpost && isActive(it, today)).map(it => ({ it, u: parseXUrl(it.xpost) })).filter(x => x.u);
  have.sort((a, b) => String(st.verify[a.it.id]?.tried || "").localeCompare(String(st.verify[b.it.id]?.tried || "")));
  let vFetches = 0; const goneRows = [];
  for (const { it, u } of have) {
    const row = { kind: "verify", itemId: it.id, title: it.t, start: it.s, postUrl: it.xpost };
    if (!cache.has(u.id)) { if (vFetches >= maxVerify) continue; vFetches++; }
    const r = await getPost(u.id);
    const prev = st.verify[it.id];
    if (r.aborted) { Object.assign(row, { verdict: "check_failed", reasons: [{ code: "fetch_failed", msg: `${r.why}。何も変えない`, soft: true }] }); }
    else if (r.state === "ok") {
      const j = judge(it, r.tweet, ctxOf("verify"));
      st.verify[it.id] = { ...updateStrikes(prev, "ok", today), tried: today };
      Object.assign(row, { account: r.tweet.screen, postedAt: j.facts.postedAt, verdict: j.verdict === "adopt" ? "ok" : j.verdict === "reject" ? "suspect" : "unclear", confidence: j.confidence, reasons: j.reasons });
    } else if (r.state === "gone") { goneRows.push({ row, it, prev }); }   // 404 の記録は、全体の様子を見てから（下）
    else {
      st.verify[it.id] = { ...updateStrikes(prev, "failed", today), tried: today };
      Object.assign(row, { verdict: "check_failed", reasons: [{ code: "fetch_failed", msg: `取得できない（${r.why || "不明"}）。何も変えない`, soft: true }] });
    }
    decisions.push(row);
  }
  // 404 が3件以上あるのに1件も読めていないときは、投稿の削除ではなくX側の異常とみなし、回数に数えない
  const xBroken = goneRows.length >= 3 && counts.ok === 0;
  for (const { row, it, prev } of goneRows) {
    if (xBroken) { Object.assign(row, { verdict: "check_failed", reasons: [{ code: "x_broken", msg: "読めた投稿が1件もなく404ばかりのため、X側の異常とみなして何も変えない", soft: true }] }); continue; }
    const s2 = updateStrikes(prev, "gone", today); st.verify[it.id] = { ...s2, tried: today };
    Object.assign(row, { verdict: s2.removalCandidate ? "removal_candidate" : "gone_once", reasons: [{ code: "gone", msg: `404（${s2.strikes}回目／${s2.days.length}日）。3回・2日以上続いたら外してよい候補` }] });
  }

  const by = f => decisions.filter(f).length;
  const summary = {
    today, targets: targets.length, shownBySrcs, noCandidate: noCand,
    adoptHigh: by(d => d.kind === "adopt" && d.verdict === "adopt" && d.confidence === "high"),
    adoptMedium: by(d => d.kind === "adopt" && d.verdict === "adopt" && d.confidence === "medium"),
    reject: by(d => d.kind === "adopt" && d.verdict === "reject"), undecided: by(d => d.kind === "adopt" && d.verdict === "undecided"),
    skipped: by(d => d.verdict === "skipped" || d.verdict === "deferred"),
    verifyOk: by(d => d.verdict === "ok"), verifySuspect: by(d => d.verdict === "suspect" || d.verdict === "unclear"), verifyGone: by(d => d.verdict === "gone_once" || d.verdict === "removal_candidate"), verifyFailed: by(d => d.verdict === "check_failed"),
    fetched: counts.fetched, fetchFailed: counts.failed, fetchOk: counts.ok, aborted: counts.aborted, xBroken,
    // 接続の状態：ok＝読めた／failed＝1件も読めなかった／partial＝一部失敗／none＝取得する対象がなかった
    connection: !counts.fetched ? "none" : (counts.ok + counts.gone === 0 ? "failed" : counts.failed ? "partial" : "ok"),
    continuity: cont,
  };
  return { decisions, state: st, summary };
}

// ---------- 出力 ----------
const VJ = { adopt: "採用できる", reject: "採用しない", undecided: "判定不能", no_candidate: "候補なし", skipped: "見送り（日が浅い）", deferred: "次回に回す", ok: "問題なし", suspect: "要確認（内容が合わない）", unclear: "要確認（判定不能）", gone_once: "404（まだ外さない）", removal_candidate: "外してよい候補", check_failed: "取得失敗（何も変えない）" };
export const tsv = rows => ["区分\t項目ID\t名前\t開始日\t投稿URL\tアカウント\t投稿日\t判定\t確度\t理由\t採用可能の連続日数"].concat(rows.map(r =>
  [r.kind === "adopt" ? "新規採用" : "整合性", r.itemId, r.title, r.start, r.postUrl || "", r.account || "", r.postedAt || "", VJ[r.verdict] || r.verdict, r.confidence || "", (r.reasons || []).map(x => x.msg).join(" / "), r.adoptDays ?? ""].map(x => String(x).replace(/[\t\n]/g, " ")).join("\t"))).join("\n") + "\n";

const CONN = { ok: "届く", failed: "届かない（1件も読めなかった）", partial: "一部だけ届いた", none: "今回は取得する対象なし" };
// 自動更新の報告に貼る1行（結果の確認用）
export function reportLine(s) {
  const c = s.continuity || {};
  return `ドライラン：Xへの接続=${CONN[s.connection] || s.connection}（取得${s.fetched}回・失敗${s.fetchFailed}回${s.aborted ? `・打ち切り${s.aborted}件` : ""}）／新規採用の見込み ${s.adoptHigh + s.adoptMedium}件（日付あり${s.adoptHigh}・なし${s.adoptMedium}）、不採用${s.reject}、判定不能${s.undecided}／採用済みの点検 問題なし${s.verifyOk}・要確認${s.verifySuspect}・404 ${s.verifyGone}・取得失敗${s.verifyFailed}／前回の記録=${c.previous ? `あり（通算${c.runs}回目・前回${c.prevRunAt}）` : "なし（通算1回目）"}`;
}

export function summaryMd(s, rows) {
  const reasonCount = {};
  for (const r of rows) if (r.verdict === "reject" || r.verdict === "undecided") for (const x of r.reasons || []) reasonCount[x.code] = (reasonCount[x.code] || 0) + 1;
  return `# 公式X自動採用 Phase0 ドライラン（${s.today}）\n\n- 画像がまだない掲載中の項目：${s.targets}件（うち、すでに src の公式ポストで表示中：${s.shownBySrcs}件／候補の投稿URLなし：${s.noCandidate}件）\n- 新規採用の判定：**採用できる ${s.adoptHigh + s.adoptMedium}件**（日付の裏づけあり ${s.adoptHigh}／日付の裏づけなし ${s.adoptMedium}）、採用しない ${s.reject}、判定不能 ${s.undecided}、見送り・次回 ${s.skipped}\n- 採用済み xpost の整合性：問題なし ${s.verifyOk}、要確認 ${s.verifySuspect}、404 ${s.verifyGone}、取得失敗 ${s.verifyFailed}\n- Xへの接続：${CONN[s.connection]}／取得 ${s.fetched}回（成功 ${s.fetchOk}・失敗 ${s.fetchFailed}・打ち切り ${s.aborted}）${s.xBroken ? "／404ばかりのためX側の異常とみなした" : ""}\n- 前回の記録：${s.continuity.previous ? `あり（通算${s.continuity.runs}回目、前回 ${s.continuity.prevRunAt}）` : "なし（今回が通算1回目）"}\n\n## 採用しない・判定不能の理由（件数）\n${Object.entries(reasonCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`).join("\n") || "- なし"}\n`;
}

// 履歴（history.jsonl）から、2週間などの期間で「実際に何件が安全に採用できたか」を集計する
export function summarizeHistory(lines) {
  const runs = lines.filter(Boolean).map(l => JSON.parse(l));
  const items = new Map();
  for (const r of runs) for (const d of r.decisions || []) if (d.kind === "adopt" && d.verdict === "adopt") {
    const e = items.get(d.itemId) || { title: d.title, days: new Set(), high: false, posts: new Set() };
    e.days.add(r.at.slice(0, 10)); if (d.confidence === "high") e.high = true; e.posts.add(d.postUrl); items.set(d.itemId, e);
  }
  const rows = [...items].map(([id, e]) => ({ id, title: e.title, days: e.days.size, high: e.high, posts: [...e.posts] }));
  return { runs: runs.length, from: runs[0]?.at, to: runs.at(-1)?.at, adoptableItems: rows.length, adoptableHigh: rows.filter(r => r.high).length, stable: rows.filter(r => r.days >= 2).length, rows };
}

async function main() {
  const a = process.argv.slice(2), arg = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  const out = checkOutDir(arg("--out", ".xadopt"));
  fs.mkdirSync(out, { recursive: true });
  const hist = path.join(out, "history.jsonl");
  if (a.includes("--summary")) {
    const s = summarizeHistory(fs.existsSync(hist) ? fs.readFileSync(hist, "utf8").split("\n") : []);
    console.log(`ドライラン ${s.runs}回（${s.from || "-"} 〜 ${s.to || "-"}）\n安全に採用できた項目：${s.adoptableItems}件（日付の裏づけあり ${s.adoptableHigh}件、2日以上続けて採用可能 ${s.stable}件）`);
    for (const r of s.rows) console.log(`  ${r.high ? "◎" : "○"} ${r.id} ${r.title}（${r.days}日）`);
    return;
  }
  const items = JSON.parse(fs.readFileSync("data/items.json", "utf8"));
  const accounts = JSON.parse(fs.readFileSync("data/official-x.json", "utf8")).accounts;
  const stF = path.join(out, "state.json"), state = fs.existsSync(stF) ? JSON.parse(fs.readFileSync(stF, "utf8")) : {};
  const cands = arg("--cands") ? JSON.parse(fs.readFileSync(arg("--cands"), "utf8")) : {};
  const res = await run({ items, accounts, state, cands, today: arg("--today", jstDay()), maxAdopt: +arg("--max-adopt", 10), maxVerify: +arg("--max-verify", 10) });
  const shown = res.decisions.filter(d => d.verdict !== "no_candidate");
  fs.writeFileSync(stF, JSON.stringify(res.state, null, 1));
  fs.writeFileSync(path.join(out, "latest.json"), JSON.stringify({ at: new Date().toISOString(), summary: res.summary, decisions: res.decisions.map(({ _p, _j, ...r }) => r) }, null, 1));
  fs.writeFileSync(path.join(out, "latest.tsv"), "﻿" + tsv(res.decisions));
  fs.writeFileSync(path.join(out, "summary.md"), summaryMd(res.summary, res.decisions));
  fs.appendFileSync(hist, JSON.stringify({ at: new Date().toISOString(), summary: res.summary, decisions: shown.filter(d => d.verdict === "adopt").map(({ _p, _j, ...r }) => r) }) + "\n");
  const line = reportLine(res.summary);
  fs.writeFileSync(path.join(out, "report.txt"), line + "\n");
  console.log(summaryMd(res.summary, res.decisions));
  console.log(`一覧：${path.join(out, "latest.tsv")}`);
  console.log("XADOPT_REPORT: " + line);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.log("xadopt: 今回はスキップしました（" + String(e && e.message || e).slice(0, 120) + "）。更新には影響しません"); console.log("XADOPT_REPORT: ドライラン：スキップ（" + String(e && e.message || e).slice(0, 80) + "）"); }).finally(() => { process.exitCode = 0; });
