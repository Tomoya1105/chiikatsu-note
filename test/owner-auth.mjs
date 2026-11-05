// 運営者ページの認証：`node test/owner-auth.mjs`
// OWNER_HASH（シークレット）の優先、昔のハッシュへのフォールバック、失敗が続いたときの停止、KV書き込みが失敗のときだけであること。
import { onRequestPost, FAIL_MAX } from "../functions/api/owner.js";
let fails = 0; const ok = (n, c, i = "") => { console.log((c ? "ok  " : "NG  ") + n + (c ? "" : "  " + i)); if (!c) fails++; };
const sha = async s => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map(x => x.toString(16).padStart(2, "0")).join("");
const kv = () => { const m = new Map([["x:tok", "tok"]]);   // 運営者ページ用のトークンは作成済みとして、認証側のKV書き込みだけを数える
   return { m, w: 0, d: 0, async get(k) { return m.get(k) ?? null; }, async put(k, v) { this.w++; m.set(k, v); }, async delete(k) { this.d++; m.delete(k); } }; };
const call = (env, t, ip = "1.2.3.4") => onRequestPost({ env, request: new Request("https://x/api/owner", { method: "POST", headers: { "CF-Connecting-IP": ip }, body: JSON.stringify({ op: "page", t }) }) }).then(r => r.status);
const NEWPW = "ぜんぜん-ちがう-ながい-あいことば-2026";
{ // OWNER_HASH があれば、それだけが通る
  const env = { REPORTS: kv(), OWNER_HASH: (await sha(NEWPW)).toUpperCase() };
  ok("新しい合言葉が通る（大文字のハッシュでも）", await call(env, NEWPW) === 200);
  ok("OWNER_HASH 設定後は、新しい合言葉でないと通らない", await call(env, "ちがう合言葉") === 403);
  ok("成功してもKVに書かない", env.REPORTS.w === 1 && env.REPORTS.d === 0, `w=${env.REPORTS.w}（失敗1回分のはず）`);
}
{ // 未設定・形式がちがう → 昔のハッシュ（昔の合言葉はここには書かない）。ここでは「設定がおかしくても、勝手に誰でも通ることはない」だけ確かめる
  for (const bad of [undefined, "", "abc", "zz".repeat(32)]) { const env = { REPORTS: kv(), OWNER_HASH: bad }; ok(`OWNER_HASH=${JSON.stringify(bad)} でも、空・でたらめな合言葉は通らない`, await call(env, "") === 403 && await call(env, "でたらめ") === 403); }
}
{ // 失敗が続くと止まる。止まっている間は、正しい合言葉でも通らない
  const env = { REPORTS: kv(), OWNER_HASH: await sha(NEWPW) };
  for (let i = 0; i < FAIL_MAX; i++) ok(`失敗 ${i + 1} 回目は 403`, await call(env, "x" + i) === 403);
  ok(`${FAIL_MAX} 回失敗したあとは 429（正しい合言葉でも）`, await call(env, NEWPW) === 429);
  ok("別の端末（IP）は影響を受けない", await call(env, NEWPW, "9.9.9.9") === 200);
  ok("KVの書き込みは、失敗のときだけ（失敗5回＝5回）", env.REPORTS.w === FAIL_MAX, `w=${env.REPORTS.w}`);
  for (const k of [...env.REPORTS.m.keys()]) if (k.startsWith("rl:")) env.REPORTS.m.delete(k);   // 15分たって期限が切れた状態
  ok("期限が切れると、また通る", await call(env, NEWPW) === 200);
}
{ // 数回の失敗のあと、成功したらカウントが消える
  const env = { REPORTS: kv(), OWNER_HASH: await sha(NEWPW) };
  await call(env, "a"); await call(env, "b"); ok("成功でカウントを消す", await call(env, NEWPW) === 200 && env.REPORTS.d === 1 && ![...env.REPORTS.m.keys()].some(k => k.startsWith("rl:")));
}
ok("KVがない確認用では、試行制限なしで動く（statsだけ）", await onRequestPost({ env: {}, request: new Request("https://x/", { method: "POST", body: JSON.stringify({ op: "page", t: "x" }) }) }).then(r => r.status) === 403);
console.log(fails ? `NG ${fails}` : "owner-auth OK"); process.exit(fails ? 1 : 0);
