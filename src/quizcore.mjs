// ちいかわ検定：採点・称号・シャッフル・統計の計算。ブラウザ（/quiz/quiz.js）とサーバー（/api/quiz/submit）とテストで同じものを使う。
import { QUESTIONS, TITLES, CATS, QUIZ_VER } from "./quiz-data.mjs";

export const STATS_MIN = 100;      // 初回の挑戦がこの回数に届くまで、平均点と上位％は出さない
export const MIN_SEC = 40;         // これより速い受験は集計に使わない
export const MAX_SEC = 7200;       // 2時間を超えた受験も集計に使わない

function rnd(n) {   // 0〜n-1 の乱数（できるだけ暗号用の乱数を使う）
  const c = globalThis.crypto;
  if (c && c.getRandomValues) { const a = new Uint32Array(1); c.getRandomValues(a); return a[0] % n; }
  return Math.floor(Math.random() * n);
}
function shuffle(arr, rand = rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// 受験ごとの選択肢の並び。正解の位置は A〜D がちょうど5問ずつ（20問のとき）。誤答の並びもランダム。
// 戻り値：問題ごとに、表示順の選択肢IDの配列
export function makeLayout(qs = QUESTIONS, rand = rnd) {
  const base = qs.map((_, i) => i % 4);
  const pos = shuffle(base, rand);
  return qs.map((q, i) => {
    const wrong = shuffle(q.choices.filter(c => c.id !== q.ans).map(c => c.id), rand);
    const out = [];
    for (let p = 0; p < 4; p++) out.push(p === pos[i] ? q.ans : wrong.shift());
    return out;
  });
}

export function titleOf(score) {
  return TITLES.find(t => score >= t.min) || TITLES[TITLES.length - 1];
}

// picks：問題の順に「選んだ選択肢ID」（未回答は null）。表示位置は使わず、IDだけで判定する
export function grade(picks, qs = QUESTIONS) {
  const cats = Object.fromEntries(CATS.map(c => [c.k, { ok: 0, n: 0 }]));
  let ok = 0, ans = "";
  qs.forEach((q, i) => {
    const hit = picks[i] === q.ans;
    cats[q.cat].n++; if (hit) { cats[q.cat].ok++; ok++; }
    ans += hit ? "1" : "0";
  });
  const score = Math.round(ok * 100 / qs.length);
  return { ok, score, cats, ans };
}

export function catRates(cats) {
  return CATS.map(c => ({ k: c.k, name: c.name, ok: cats[c.k].ok, n: cats[c.k].n, pct: cats[c.k].n ? Math.round(cats[c.k].ok * 100 / cats[c.k].n) : 0 }));
}

// 送られてきた回答の形を確かめる（存在しない選択肢IDや、数の不足は受け付けない）
export function validPicks(picks, qs = QUESTIONS) {
  if (!Array.isArray(picks) || picks.length !== qs.length) return false;
  return qs.every((q, i) => typeof picks[i] === "string" && q.choices.some(c => c.id === picks[i]));
}

// 点数の分布（初回の挑戦）から、平均点と「上位○％」を計算する。
// 上位％ ＝ 自分の点数以上の人数 ÷ 全体 × 100（切り上げ、1〜100）。同じ点数の人は同じ値になる。
export function statsOf(hist, score, total) {
  const first = Object.values(hist).reduce((s, n) => s + n, 0);
  const out = { first, total: total || first, show: first >= STATS_MIN };
  if (!first) return out;
  const sum = Object.entries(hist).reduce((s, [k, n]) => s + Number(k) * n, 0);
  out.avg = Math.round(sum / first * 10) / 10;
  if (typeof score === "number") {
    const ge = Object.entries(hist).reduce((s, [k, n]) => s + (Number(k) >= score ? n : 0), 0);
    out.top = Math.min(100, Math.max(1, Math.ceil(ge * 100 / first)));
  }
  return out;
}

export { QUESTIONS, TITLES, CATS, QUIZ_VER };
