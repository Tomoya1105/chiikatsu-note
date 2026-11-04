// 運営者が承認した記事の内容を記録する：`node scripts/lock-articles.mjs`
// 承認した記事（status: published）の SHA-256 を data/articles.lock.json に書く。自動更新はこのファイルと data/articles/ を触らない（ROUTINE.md）。
import fs from "node:fs";
import { parseArticle, hashOf } from "../src/notes.mjs";
const dir = "data/articles", lock = {};
for (const f of fs.readdirSync(dir).filter(x => x.endsWith(".md")).sort()) {
  const { meta } = parseArticle(fs.readFileSync(`${dir}/${f}`, "utf8"), `${dir}/${f}`);
  if (meta.status === "published") lock[f.replace(/\.md$/, "")] = hashOf(`${dir}/${f}`);
}
fs.writeFileSync("data/articles.lock.json", JSON.stringify(lock, null, 2) + "\n");
console.log("承認済みの記事:", Object.keys(lock).join(", ") || "（なし）");
