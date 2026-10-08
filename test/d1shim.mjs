// テスト用：Cloudflare D1 の最低限の動き（prepare/bind/first/all/run/batch）を Node の sqlite で再現する
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
export function makeD1(envName = "preview", file = ":memory:") {
  const db = new DatabaseSync(file);
  db.exec(fs.readFileSync(new URL("../migrations/0001_quiz.sql", import.meta.url), "utf8"));
  if (envName) db.prepare("INSERT INTO meta (k, v) VALUES ('env', ?)").run(envName);
  const prep = sql => {
    let args = [];
    const st = {
      bind(...a) { args = a; return st; },
      async first() { return db.prepare(sql).get(...args) ?? null; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async run() { const p = db.prepare(sql); if (p.columns().length) return { results: p.all(...args), meta: {} }; const r = p.run(...args); return { results: [], meta: { changes: Number(r.changes) } }; },
    };
    return st;
  };
  return { prepare: prep, async batch(list) { db.exec("BEGIN"); try { const out = []; for (const s of list) out.push(await s.run()); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; } }, raw: db };
}
