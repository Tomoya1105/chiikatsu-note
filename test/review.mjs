// 見直しの対象：まだ終わっていない予定のうち、最後に情報源で確かめた日（verifiedAt）が古い順に並べる。
// 自動更新が毎回 `node test/review.mjs 8` を実行し、出てきたものを情報源で確かめ直す。
import fs from "node:fs";
const n = Math.max(1, +process.argv[2] || 8);
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const items = JSON.parse(fs.readFileSync("data/items.json", "utf8"));
const list = items
  .filter(x => !x.hidden && (x.e || x.s) >= today && x.verifiedAt !== today)
  .sort((a, b) => (a.verifiedAt || "").localeCompare(b.verifiedAt || "") || a.s.localeCompare(b.s))
  .slice(0, n);
for (const x of list) console.log(`${x.id}\t確かめた日 ${x.verifiedAt}\t${x.s}${x.e ? "〜" + x.e : ""}\t${x.t}\t${x.src}${x.srcs?.length ? " ＋" + x.srcs.join(" ") : ""}`);
if (!list.length) console.log("見直しが必要なものはありません");
