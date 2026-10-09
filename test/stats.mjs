// 段階0の計測（functions/api/hit.js）を、手元の SQLite を D1 の代わりにして確かめる。
// 実行：node test/stats.mjs（Node 22 以降。node:sqlite を使う）
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import assert from "node:assert/strict";
import { record, pick, REDUCE, STOP, onRequestPost } from "../functions/api/hit.js";

// D1 のうち、hit.js が使う形（prepare/bind/all/run/batch と meta.rows_written）だけを真似る
function d1(){
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync(new URL("../migrations/0002_stats.sql", import.meta.url), "utf8"));
  const q = { n: 0 };
  const wrap = (sql, args = []) => ({
    bind: (...a) => wrap(sql, a),
    async all(){ q.n++; return { results: db.prepare(sql).all(...args), meta: {} }; },
    async first(){ q.n++; return db.prepare(sql).get(...args) || null; },
    runSync(){ q.n++; const r = db.prepare(sql).run(...args); return { meta: { rows_written: Number(r.changes) } }; },
    async run(){ return this.runSync(); },
  });
  return { raw: db, q, prepare: sql => wrap(sql), async batch(list){ db.exec("BEGIN"); try { const out = list.map(s => s.runSync()); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; } } };
}
const get = (db, day, seg, k) => (db.raw.prepare("SELECT n FROM daily WHERE day=? AND seg=? AND k=?").get(day, seg, k) || {}).n || 0;
const meta = (db, k) => db.raw.prepare("SELECT v, t FROM meta WHERE k=?").get(k);
const HOST = "chiikatsunote.com", DAYMS = 864e5;
let base = Date.parse("2026-11-01T03:00:00Z"), dn = 0;
const nextDay = () => base + (dn++) * DAYMS;   // テストごとに日を変える（その日の「停止」の覚え書きを持ち越さない）
const dayOf = ms => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
const items = JSON.parse(fs.readFileSync(new URL("../data/items.json", import.meta.url), "utf8"));
const ID = (Array.isArray(items) ? items : items.items)[0].id;
let ok = 0; const t = async (name, fn) => { await fn(); ok++; console.log("OK", name); };

await t("同時に200回送っても合計が合う", async () => {
  const db = d1(); db.raw.exec("INSERT INTO meta VALUES ('env',0,'production')");
  const now = nextDay();
  await Promise.all(Array.from({ length: 200 }, () => record(db, { ev: { "v:new": 1, "pv:home": 2 } }, HOST, now)));
  assert.equal(get(db, dayOf(now), "g", "v:new"), 200);
  assert.equal(get(db, dayOf(now), "g", "pv:home"), 400);
  // 書き込み量は Cloudflare が返す行数（ここでは SQLite の変更行数）の合計＋1回あたり2
  assert.equal(meta(db, "w:" + dayOf(now)).v, 200 * (2 + 2));
});
await t("決めた項目だけ・商品IDは掲載中のものだけ・1回3件まで・値は50まで", async () => {
  const r = pick({ "evil": 3, "pv:home": 999, ["bi:" + ID]: 1, "bi:nope": 1, "b:list:rk": 1, "b:list:zz": 1, "u:saved": 70 }, 0);
  const o = Object.fromEntries(r);
  assert.equal(o["pv:home"], 50); assert.equal(o["bi:" + ID], 1); assert.equal(o["b:list:rk"], 1); assert.equal(o["u:saved"], 50);
  assert.ok(!("evil" in o) && !("bi:nope" in o) && !("b:list:zz" in o));
  const ids = (Array.isArray(items) ? items : items.items).slice(0, 5).map(i => "bi:" + i.id);
  assert.equal(pick(Object.fromEntries(ids.map(k => [k, 1])), 0).length, 3);
});
await t("テストモードの送信は「テスト」の区分に入る", async () => {
  const db = d1(); db.raw.exec("INSERT INTO meta VALUES ('env',0,'production')");
  const now = nextDay();
  await record(db, { ev: { "v:new": 1 }, t: 1 }, HOST, now);
  await record(db, { ev: { "v:new": 1 }, t: 0 }, HOST, now);
  assert.equal(get(db, dayOf(now), "t", "v:new"), 1); assert.equal(get(db, dayOf(now), "g", "v:new"), 1);
});
await t("本番の画面から確認用のデータベースには書かない（逆も）・未設定なら書かない", async () => {
  const now = nextDay();
  const a = d1(); a.raw.exec("INSERT INTO meta VALUES ('env',0,'preview')");
  assert.equal((await record(a, { ev: { "v:new": 1 } }, HOST, now)).skip, "env");
  assert.equal((await record(a, { ev: { "v:new": 1 } }, "stats.chiikatsu-note.pages.dev", now)).wrote > 0, true);
  const b = d1();
  assert.equal((await record(b, { ev: { "v:new": 1 } }, HOST, now)).skip, "env");
});
await t(`書き込みが${REDUCE}行を超えたら大事な項目だけ（推定はしない）`, async () => {
  const db = d1(); db.raw.exec("INSERT INTO meta VALUES ('env',0,'production')");
  const now = nextDay(), day = dayOf(now);
  db.raw.prepare("INSERT INTO meta VALUES (?, ?, ?)").run("w:" + day, REDUCE, "x");
  await record(db, { ev: { "v:new": 1, "pv:home": 1, "b:item:rk": 1, "tab:cal": 1 } }, HOST, now);
  assert.equal(get(db, day, "g", "v:new"), 1); assert.equal(get(db, day, "g", "b:item:rk"), 1);
  assert.equal(get(db, day, "g", "pv:home"), 0); assert.equal(get(db, day, "g", "tab:cal"), 0);
  assert.equal(meta(db, "m:" + day).v, 1);
});
await t(`書き込みが${STOP}行を超えたらその日は記録しない・それ以降はD1も読まない`, async () => {
  const db = d1(); db.raw.exec("INSERT INTO meta VALUES ('env',0,'production')");
  const now = nextDay(), day = dayOf(now);
  db.raw.prepare("INSERT INTO meta VALUES (?, ?, ?)").run("w:" + day, STOP, "x");
  assert.equal((await record(db, { ev: { "v:new": 1 } }, HOST, now)).skip, "stop");
  assert.equal(get(db, day, "g", "v:new"), 0); assert.equal(meta(db, "m:" + day).v, 2);
  const before = db.q.n;
  for (let i = 0; i < 50; i++) await record(db, { ev: { "v:new": 1 } }, HOST, now);
  assert.equal(db.q.n, before);   // 止まった日は、この実行単位では読み書きゼロ
});
await t("その日の最初の記録で、400日より古い合計を片付ける", async () => {
  const db = d1(); db.raw.exec("INSERT INTO meta VALUES ('env',0,'production')");
  const now = nextDay(), old = dayOf(now - 401 * DAYMS), keep = dayOf(now - 300 * DAYMS);
  db.raw.prepare("INSERT INTO daily VALUES (?, 'g', 'v:new', 5)").run(old);
  db.raw.prepare("INSERT INTO daily VALUES (?, 'g', 'v:new', 5)").run(keep);
  db.raw.prepare("INSERT INTO meta VALUES (?, 9, 'x')").run("w:" + old);
  await record(db, { ev: { "v:new": 1 } }, HOST, now);
  assert.equal(get(db, old, "g", "v:new"), 0); assert.equal(get(db, keep, "g", "v:new"), 5);
  assert.equal(meta(db, "w:" + old), undefined);
});
await t("D1がない・壊れているときも 204 を返し、エラーは KV に30分に1回だけ残す", async () => {
  const req = () => new Request("https://chiikatsunote.com/api/hit", { method: "POST", body: JSON.stringify({ ev: { "v:new": 1 } }) });
  assert.equal((await onRequestPost({ request: req(), env: {} })).status, 204);
  const kv = { m: new Map(), puts: 0, async get(k){ return this.m.get(k) || null; }, async put(k, v){ this.puts++; this.m.set(k, v); } };
  const bad = { prepare(){ throw new Error("D1_ERROR: boom"); } };
  for (let i = 0; i < 5; i++) assert.equal((await onRequestPost({ request: req(), env: { STATSDB: bad, REPORTS: kv } })).status, 204);
  assert.equal(kv.puts, 1); assert.match(JSON.parse(kv.m.get("stats:err")).msg, /boom/);
  assert.equal((await onRequestPost({ request: new Request("https://chiikatsunote.com/api/hit", { method: "POST", body: "not json" }), env: { STATSDB: bad, REPORTS: kv } })).status, 204);
});
await t("計測はKVに書き込まない（エラーのとき以外）", async () => {
  const db = d1(); db.raw.exec("INSERT INTO meta VALUES ('env',0,'production')");
  const kv = { puts: 0, async get(){ return null; }, async put(){ this.puts++; } };
  for (let i = 0; i < 20; i++) await onRequestPost({ request: new Request("https://chiikatsunote.com/api/hit", { method: "POST", body: JSON.stringify({ ev: { "v:new": 1 } }) }), env: { STATSDB: db, REPORTS: kv } });
  assert.equal(kv.puts, 0);
});
console.log(`\n${ok} 件すべてOK`);
