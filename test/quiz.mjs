// ちいかわ検定（非公式）の自動テスト。`node build.mjs && node test/quiz.mjs` で実行する。
import fs from "node:fs";
import assert from "node:assert/strict";
import { QUESTIONS, TITLES, CATS, QUIZ_VER, makeLayout, titleOf, grade, catRates, validPicks, statsOf, STATS_MIN } from "../src/quizcore.mjs";
import { makeD1 } from "./d1shim.mjs";
import * as submit from "../functions/api/quiz/submit.js";

let n = 0;
const t = (name, fn) => Promise.resolve().then(fn).then(() => { n++; }, e => { console.error("✗ " + name + "\n  " + e.message); process.exitCode = 1; });

// ---- 問題データ（確定仕様書 第3版との照合）
await t("20問・難易度5問ずつ・カテゴリ5/5/4/6", () => {
  assert.equal(QUESTIONS.length, 20);
  for (let lv = 1; lv <= 4; lv++) assert.deepEqual(QUESTIONS.filter(q => q.lv === lv).map(q => q.n), [1, 2, 3, 4, 5].map(i => (lv - 1) * 5 + i));
  const cnt = k => QUESTIONS.filter(q => q.cat === k).length;
  assert.deepEqual([cnt("s"), cnt("c"), cnt("w"), cnt("f")], [5, 5, 4, 6]);
});
await t("どの問題も選択肢4つ・IDが重複しない・正解がちょうど1つ", () => {
  const all = new Set();
  for (const q of QUESTIONS) {
    assert.equal(q.choices.length, 4, q.id);
    assert.equal(new Set(q.choices.map(c => c.text)).size, 4, q.id + " 同じ文の選択肢");
    for (const c of q.choices) { assert.ok(!all.has(c.id), "ID重複 " + c.id); all.add(c.id); }
    assert.equal(q.choices.filter(c => c.id === q.ans).length, 1, q.id);
    assert.ok(q.ex && q.ex.length >= 10, q.id + " 解説");
  }
});
await t("確定仕様の正解と一致（主要な問題）", () => {
  const A = Object.fromEntries(QUESTIONS.map(q => [q.n, q.choices.find(c => c.id === q.ans).text]));
  assert.equal(A[1], "なんか小さくてかわいいやつ");
  assert.equal(A[3], "ホットケーキ");
  assert.equal(A[13], "耳がレインコートを突き破って飛び出した");
  assert.deepEqual(QUESTIONS[12].choices.slice(1).map(c => c.text), ["耳がフードの中にすっぽり収まった", "耳の形に合わせてフードが伸びた", "耳がきつくて、着るのをあきらめた"], "Q13の誤答（2026-10-08修正）");
  assert.equal(QUESTIONS[12].q, "ポシェットの鎧さんの新作レインコート。うさぎが着ると、耳の部分はどうなった？");
  assert.ok(QUESTIONS[12].ex.startsWith("鎧さんに耳のきつさを聞かれ"));
  assert.equal(A[14], "ヴェポラッブ（VapoRub）");
  assert.equal(A[18], "ケチャップとからし");
  assert.equal(A[19], "紫");
  assert.equal(A[20], "むちゃうまヨーグルト おうちに住もうキャンペーン");
  assert.deepEqual(QUESTIONS[19].choices.slice(1).map(c => c.text).sort(), ["むちゃうまプリン おうちに住もうキャンペーン", "むちゃうまプリン おうちを当てようキャンペーン", "むちゃうまヨーグルト おうちを当てようキャンペーン"].sort());
  assert.equal(QUESTIONS[17].q.includes("たこウィンナー"), true);
  assert.equal(QUESTIONS[1].choices.some(c => c.text === "ギター"), false);
});

// ---- 正解判定（80通り）
await t("20問×4択の正解判定", () => {
  QUESTIONS.forEach((q, i) => {
    for (const c of q.choices) {
      const picks = QUESTIONS.map(x => x.choices.find(y => y.id !== x.ans).id);
      picks[i] = c.id;
      const g = grade(picks);
      assert.equal(g.ok, c.id === q.ans ? 1 : 0, q.id + " " + c.text);
    }
  });
  assert.equal(grade(QUESTIONS.map(q => q.ans)).score, 100);
  assert.equal(grade(QUESTIONS.map(q => q.choices.find(c => c.id !== q.ans).id)).score, 0);
});
await t("回答の形の確認", () => {
  assert.equal(validPicks(QUESTIONS.map(q => q.ans)), true);
  assert.equal(validPicks(QUESTIONS.map(q => q.ans).slice(1)), false);
  assert.equal(validPicks(QUESTIONS.map((q, i) => i === 3 ? "zzz" : q.ans)), false);
  assert.equal(validPicks(QUESTIONS.map((q, i) => i === 3 ? QUESTIONS[4].ans : q.ans)), false, "別の問題の選択肢");
});

// ---- シャッフル
await t("1万回シャッフル：正解位置はA〜D 5問ずつ・正解はちょうど1つ・位置はおおむね均等", () => {
  const per = QUESTIONS.map(() => [0, 0, 0, 0]);
  for (let k = 0; k < 10000; k++) {
    const L = makeLayout();
    const pos = L.map((ids, i) => ids.indexOf(QUESTIONS[i].ans));
    assert.deepEqual([0, 1, 2, 3].map(p => pos.filter(x => x === p).length), [5, 5, 5, 5]);
    L.forEach((ids, i) => { assert.deepEqual(ids.slice().sort(), QUESTIONS[i].choices.map(c => c.id).sort()); per[i][pos[i]]++; });
  }
  for (const row of per) for (const c of row) assert.ok(c > 2200 && c < 2800, "偏り " + row);
});
await t("表示順を変えても判定は同じ／再挑戦で並びが変わる", () => {
  const picks = QUESTIONS.map((q, i) => i % 2 ? q.ans : q.choices[2].id);
  const a = grade(picks).score;
  for (let k = 0; k < 50; k++) { makeLayout(); assert.equal(grade(picks).score, a); }
  const s = new Set(); for (let k = 0; k < 20; k++) s.add(JSON.stringify(makeLayout()));
  assert.ok(s.size > 15);
});

// ---- 称号・カテゴリ
await t("称号の境目（0〜20問正解の21通り）", () => {
  const want = s => s === 100 ? "伝説のちいかわマスター" : s === 95 ? "ちいかわマスター" : s >= 80 ? "ちいかわ博士" : s >= 65 ? "ちいかわ通" : s >= 45 ? "ちいかわ好き" : "ちいかわビギナー";
  for (let ok = 0; ok <= 20; ok++) {
    const picks = QUESTIONS.map((q, i) => i < ok ? q.ans : q.choices.find(c => c.id !== q.ans).id);
    const g = grade(picks);
    assert.equal(g.score, ok * 5);
    assert.equal(titleOf(g.score).name, want(g.score), "点数 " + g.score);
  }
  assert.equal(titleOf(40).sub, "伸びしろしかない人");
  assert.equal(titleOf(85).sub, "記憶にちいかわ住んでる人");
  assert.equal(TITLES[0].secret, true);
});
await t("カテゴリ別の正答率", () => {
  const picks = QUESTIONS.map(q => q.cat === "w" && q.n !== 20 ? q.ans : q.cat === "f" && q.n % 2 ? q.ans : q.choices.find(c => c.id !== q.ans).id);
  const r = Object.fromEntries(catRates(grade(picks).cats).map(x => [x.k, x]));
  assert.deepEqual([r.w.ok, r.w.n, r.w.pct], [3, 4, 75]);
  assert.deepEqual([r.s.pct, r.c.pct], [0, 0]);
  assert.equal(r.f.n, 6); assert.equal(r.f.pct, Math.round(r.f.ok * 100 / 6));
});

// ---- 平均・上位％
await t("平均と上位％（同点・100件のしきい値）", () => {
  const h = { 100: 2, 80: 18, 60: 50, 40: 30 };   // 100人
  const s = statsOf(h, 80, 150);
  assert.equal(s.first, 100); assert.equal(s.show, true); assert.equal(s.total, 150);
  assert.equal(s.avg, (200 + 1440 + 3000 + 1200) / 100);
  assert.equal(s.top, 20, "80点以上は20人 → 上位20%");
  assert.equal(statsOf(h, 100).top, 2);
  assert.equal(statsOf(h, 40).top, 100);
  assert.equal(statsOf(h, 95).top, 2, "95点以上は100点の2人");
  assert.equal(statsOf({ 100: 1, 0: 999 }, 100).top, 1, "最低1%");
  assert.equal(statsOf({ 50: STATS_MIN - 1 }, 50).show, false);
  assert.equal(statsOf({}, 50).first, 0);
});

// ---- 受験記録API（D1は sqlite で代用）
const post = async (env, body, { url = "https://quiz.chiikatsu-note.pages.dev/api/quiz/submit", origin } = {}) => {
  const o = origin === undefined ? new URL(url).origin : origin;
  const r = await submit.onRequestPost({ request: new Request(url, { method: "POST", body: JSON.stringify(body), headers: o ? { origin: o } : {} }), env });
  return { status: r.status, j: await r.json() };
};
const id = () => "t" + Math.random().toString(16).slice(2, 12) + "-" + Math.random().toString(16).slice(2, 12);
await t("保存・サーバーで採点し直す・重複は保存しない・初回と再挑戦", async () => {
  const env = { QUIZDB: makeD1() }, dev = id(), aid = id();
  const picks = QUESTIONS.map((q, i) => i < 17 ? q.ans : q.choices[1].id);
  let r = await post(env, { ver: QUIZ_VER, id: aid, dev, picks, dur: 200, score: 100 });
  assert.equal(r.j.ok, true); assert.equal(r.j.score, 85, "ブラウザの点数は使わない"); assert.equal(r.j.saved, true); assert.equal(r.j.first, true);
  r = await post(env, { ver: QUIZ_VER, id: aid, dev, picks, dur: 200 });
  assert.equal(r.j.saved, false, "同じ受験は2回保存しない");
  r = await post(env, { ver: QUIZ_VER, id: id(), dev, picks, dur: 200 });
  assert.equal(r.j.saved, true); assert.equal(r.j.first, false, "同じ端末の2回目は再挑戦");
  const db = env.QUIZDB.raw;
  assert.equal(db.prepare("SELECT COUNT(*) c FROM attempts").get().c, 2);
  assert.equal(db.prepare("SELECT n FROM hist WHERE kind='f' AND score=85").get().n, 1);
  assert.equal(db.prepare("SELECT n FROM hist WHERE kind='a' AND score=85").get().n, 2);
  assert.equal(r.j.stats.first, 1); assert.equal(r.j.stats.total, 2); assert.equal(r.j.stats.show, false);
});
await t("速すぎる受験は保存するが集計に入れない／形の崩れた送信は拒否", async () => {
  const env = { QUIZDB: makeD1() };
  const picks = QUESTIONS.map(q => q.ans);
  let r = await post(env, { ver: QUIZ_VER, id: id(), dev: id(), picks, dur: 12 });
  assert.equal(r.j.saved, true); assert.equal(r.j.stats.first, 0);
  assert.equal(env.QUIZDB.raw.prepare("SELECT valid FROM attempts").get().valid, 0);
  assert.equal((await post(env, { ver: QUIZ_VER + 1, id: id(), dev: id(), picks, dur: 99 })).status, 409);
  assert.equal((await post(env, { ver: QUIZ_VER, id: "x", dev: id(), picks, dur: 99 })).status, 400);
  assert.equal((await post(env, { ver: QUIZ_VER, id: id(), dev: id(), picks: picks.slice(2), dur: 99 })).status, 400);
});
await t("大量送信への備え：送信元・本番と確認用の分離・端末ごと／1日の上限", async () => {
  const picks = QUESTIONS.map(q => q.ans), body = () => ({ ver: QUIZ_VER, id: id(), dev: id(), picks, dur: 90 });
  // 送信元
  assert.equal((await post({ QUIZDB: makeD1() }, body(), { origin: "https://evil.example" })).status, 403);
  assert.equal((await post({ QUIZDB: makeD1() }, body(), { origin: "" })).status, 403);
  assert.equal(submit.originOk("https://chiikatsunote.com"), true);
  assert.equal(submit.originOk("https://quiz.chiikatsu-note.pages.dev"), true);
  assert.equal(submit.originOk("https://chiikatsu-note.pages.dev.evil.com"), false);
  // 本番用DBには本番ドメインからだけ、確認用DBにはプレビューからだけ保存する
  let r = await post({ QUIZDB: makeD1("production") }, body());
  assert.equal(r.j.saved, false); assert.equal(r.j.skip, "env"); assert.equal(r.j.score, 100);
  r = await post({ QUIZDB: makeD1("production") }, body(), { url: "https://chiikatsunote.com/api/quiz/submit" });
  assert.equal(r.j.saved, true);
  r = await post({ QUIZDB: makeD1("preview") }, body(), { url: "https://chiikatsunote.com/api/quiz/submit" });
  assert.equal(r.j.saved, false, "確認用DBに本番の受験を入れない");
  r = await post({ QUIZDB: makeD1(null) }, body());
  assert.equal(r.j.saved, false, "印のないDBには書かない");
  // 同じ端末は1日 DEV_DAY_MAX 回まで
  const env = { QUIZDB: makeD1() }, dev = id();
  for (let k = 0; k < submit.DEV_DAY_MAX; k++) assert.equal((await post(env, { ...body(), dev })).j.saved, true);
  r = await post(env, { ...body(), dev });
  assert.equal(r.j.saved, false); assert.equal(r.j.skip, "dev_max"); assert.equal(r.j.score, 100);
  // 1日の上限に達したら保存しない（点数とみんなの成績は返す）
  const day = Number(new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, ""));
  env.QUIZDB.raw.prepare("UPDATE hist SET n = ? WHERE ver = 0 AND kind = 'd' AND score = ?").run(submit.DAY_MAX, day);
  r = await post(env, body());
  assert.equal(r.j.saved, false); assert.equal(r.j.skip, "day_max"); assert.ok(r.j.stats);
  assert.ok(submit.DAY_MAX * 5 <= 50000, "1日の書き込みはD1無料枠（10万行）の半分以下");
});
await t("100件たまると平均と上位％を返す", async () => {
  const env = { QUIZDB: makeD1() };
  let last;
  for (let k = 0; k < 100; k++) {
    const ok = k % 21;
    last = await post(env, { ver: QUIZ_VER, id: id(), dev: id(), picks: QUESTIONS.map((q, i) => i < ok ? q.ans : q.choices[1].id), dur: 120 });
  }
  assert.equal(last.j.stats.show, true); assert.equal(last.j.stats.first, 100);
  assert.ok(typeof last.j.stats.avg === "number" && typeof last.j.stats.top === "number");
});
await t("データベースがない・壊れているときも、エラーにせず点数を返す", async () => {
  let r = await post({}, { ver: QUIZ_VER, id: id(), dev: id(), picks: QUESTIONS.map(q => q.ans), dur: 99 });
  assert.equal(r.status, 200); assert.equal(r.j.score, 100); assert.equal(r.j.saved, false);
  const broken = { prepare() { throw new Error("D1_ERROR: daily limit"); } };
  r = await post({ QUIZDB: broken }, { ver: QUIZ_VER, id: id(), dev: id(), picks: QUESTIONS.map(q => q.ans), dur: 99 });
  assert.equal(r.status, 200); assert.equal(r.j.score, 100); assert.equal(r.j.error, "db");
});

// ---- 作られたページ・共有画像・ルーティング
await t("検定ページ・結果ページ21枚・共有画像22枚", () => {
  const top = fs.readFileSync("dist/quiz/index.html", "utf8");
  assert.ok(top.includes('og:image" content="https://chiikatsunote.com/og/quiz/top.png'));
  assert.ok(top.includes("（非公式）"));
  assert.ok(!top.includes("伝説のちいかわマスター"), "100点の称号は受験前は非公開");
  for (let s = 0; s <= 100; s += 5) {
    const h = fs.readFileSync(`dist/quiz/r/${s}/index.html`, "utf8");
    assert.ok(h.includes(`og:image" content="https://chiikatsunote.com/og/quiz/${s}.png`), s);
    assert.ok(h.includes(`og:url" content="https://chiikatsunote.com/quiz/r/${s}/`), s);
    assert.ok(h.includes('name="robots" content="noindex"'), s);
    assert.ok(h.includes("非公式") && h.includes("ちい活ノート"));
    assert.ok(fs.statSync(`dist/og/quiz/${s}.png`).size > 10000);
  }
  assert.ok(fs.readFileSync("dist/sitemap.xml", "utf8").includes("/quiz/</loc>"));
  for (const f of ["dist/quiz/index.html", "dist/quiz/r/85/index.html"]) {
    const h = fs.readFileSync(f, "utf8");
    assert.ok(h.indexOf('location.replace("/?from=homescreen")') > 0 && h.indexOf('location.replace("/?from=homescreen")') < h.indexOf("</head>"), "ホーム画面から開いたらトップへ：" + f);
  }
  assert.ok(fs.readFileSync("dist/install.js", "utf8").includes('sessionStorage.setItem("chiikatsu-launched"'));
  const js = fs.readFileSync("dist/quiz/quiz.js", "utf8");
  assert.ok(js.includes('location.hostname === "chiikatsunote.com" ? "https://chiikatsunote.com" : location.origin'), "プレビューの共有URLは本番に飛ばない");
  const mf = JSON.parse(fs.readFileSync("dist/manifest.webmanifest", "utf8"));
  assert.equal(mf.start_url, "/?from=homescreen"); assert.equal(mf.scope, "/");
  assert.ok(!fs.readFileSync("dist/sitemap.xml", "utf8").includes("/quiz/r/"));
});
await t("検定のスクリプトが文法どおり・問題データを含む", () => {
  const js = fs.readFileSync("dist/quiz/quiz.js", "utf8");
  new Function(js);   // 文法エラーならここで止まる
  assert.ok(!/^\s*(import|export)\b/m.test(js));
  assert.ok(js.includes("むちゃうまヨーグルト おうちに住もうキャンペーン"));
});
await t("_routes.json：上限内・API と通常ページは Functions を通す・静的ファイルは通さない", () => {
  const r = JSON.parse(fs.readFileSync("dist/_routes.json", "utf8"));
  assert.equal(r.version, 1);
  assert.ok(r.include.length >= 1 && r.include.length + r.exclude.length <= 100);
  for (const x of [...r.include, ...r.exclude]) assert.ok(x.length <= 100 && x.startsWith("/"));
  const excluded = p => r.exclude.some(x => x.endsWith("/*") ? p.startsWith(x.slice(0, -1)) : p === x);
  for (const p of ["/api/hit", "/api/quiz/submit", "/api/report", "/api/owner", "/", "/items/x/", "/month/", "/area/", "/about/", "/owner/", "/contact/", "/quiz/", "/quiz/r/85/"]) assert.ok(!excluded(p), "Functions が必要：" + p);
  for (const p of ["/style.css", "/app.js", "/install.js", "/og/home.png", "/icons/icon-192.png", "/quiz/quiz.js"]) assert.ok(excluded(p), p);
  for (const x of r.exclude) { const f = "dist" + (x.endsWith("/*") ? x.slice(0, -2) : x); assert.ok(fs.existsSync(f), "存在しない除外先 " + x); }
});
await t("トップ：検定への入口と、検定から来た人へのご案内", () => {
  const h = fs.readFileSync("dist/index.html", "utf8");
  assert.ok(h.includes('href="/quiz/"'));
  assert.ok(h.includes("data-qwel hidden"));
  assert.ok(h.includes('sessionStorage.setItem("chiikatsu-qarr"'));
  assert.ok(h.indexOf("chiikatsu-qarr") < h.indexOf("/app.js?v="), "URLが整理される前に覚える");
  assert.ok(fs.readFileSync("dist/about/index.html", "utf8").includes('<a href="/quiz/">ちいかわ検定</a>'), "フッター");
  assert.ok(fs.readFileSync("dist/privacy/index.html", "utf8").includes("ちいかわ検定（非公式）について"));
});
await t("計測：検定のイベントを受け付ける", async () => {
  const src = fs.readFileSync("functions/api/hit.js", "utf8");
  const re = new Function("return " + src.match(/const OK = (\/.*\/);/)[1])();
  for (const k of ["quiz:view", "quiz:start", "quiz:done", "quiz:sx", "quiz:toapp", "quiz:addtap", "quiz:promo", "qa:land", "qa:sheet", "qa:go", "install", "pv:home"]) assert.ok(re.test(k), k);
  assert.ok(!re.test("quiz:hack"));
});

console.log(process.exitCode ? "検定のテストに失敗があります" : `検定のテスト ${n}件 OK`);
