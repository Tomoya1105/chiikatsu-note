// 運営者のコラム（/note/）の読み込みと表示。
// 公開済みの記事は data/articles/*.md に置き、data/articles.lock.json のハッシュと合わなければビルドを止める
// （自動更新が誤って書き換えても、そのまま公開されないようにするため）。下書き・提案は data/drafts/・data/proposals/ に置き、公開しない。
import fs from "node:fs";
import crypto from "node:crypto";

export const KINDS = { experience: "運営者の実体験", opinion: "運営者の意見", research: "調べたこと", analysis: "AIの分析" };
const sha = s => crypto.createHash("sha256").update(s).digest("hex");
export const hashOf = file => sha(fs.readFileSync(file, "utf8"));

export function parseArticle(text, file) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: 先頭に --- で囲んだ front matter が必要です`);
  const meta = {};
  for (const line of m[1].split("\n")) { const k = line.match(/^([a-z]+):\s*(.*)$/); if (k) meta[k[1]] = k[2].trim(); }
  for (const k of ["title", "date", "kind", "status", "summary"]) if (!meta[k]) throw new Error(`${file}: front matter に ${k} がありません`);
  if (!KINDS[meta.kind]) throw new Error(`${file}: kind は ${Object.keys(KINDS).join(" / ")} のどれか: ${meta.kind}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) throw new Error(`${file}: date は YYYY-MM-DD: ${meta.date}`);
  return { meta, md: m[2].trim() };
}

export function loadArticles({ dir = "data/articles", lock = "data/articles.lock.json" } = {}) {
  const locks = fs.existsSync(lock) ? JSON.parse(fs.readFileSync(lock, "utf8")) : {};
  const out = [];
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter(x => x.endsWith(".md")).sort() : []) {
    const slug = f.replace(/\.md$/, ""), path = `${dir}/${f}`, text = fs.readFileSync(path, "utf8");
    if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`${path}: ファイル名は半角英数字とハイフンだけ`);
    const { meta, md } = parseArticle(text, path);
    if (meta.status !== "published") continue;               // 下書き（draft）は、置いてあっても公開しない
    if (locks[slug] !== sha(text)) throw new Error(`${path}: 承認済みの内容と変わっています（data/articles.lock.json と合いません）。意図した修正なら、運営者の承認のあとに node scripts/lock-articles.mjs を実行してください`);
    out.push({ slug, ...meta, md });
  }
  for (const s of Object.keys(locks)) if (!out.some(a => a.slug === s)) throw new Error(`承認済みの記事 ${s} が data/articles/ にありません（消えたか、status が published ではありません）`);
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g, (_, t, u) => `<a href="${u}"${u.startsWith("http") ? ' target="_blank" rel="noopener"' : ""}>${t}</a>`);
}
// 使える書き方：## 見出し／段落／> 引用／- 箇条書き／**太字**／[文字](URL)／「※」で始まる行は注記
export function renderMd(md) {
  const blocks = md.split(/\n{2,}/), out = [];
  for (const b of blocks) {
    const lines = b.split("\n");
    if (/^## /.test(b)) out.push(`<h2>${inline(b.slice(3))}</h2>`);
    else if (lines.every(l => /^> ?/.test(l))) out.push(`<blockquote>${lines.map(l => inline(l.replace(/^> ?/, ""))).join("<br>")}</blockquote>`);
    else if (lines.every(l => /^- /.test(l))) out.push(`<ul>${lines.map(l => `<li>${inline(l.slice(2))}</li>`).join("")}</ul>`);
    else if (lines.every(l => /^※/.test(l))) out.push(`<p class="note-fn">${lines.map(inline).join("<br>")}</p>`);
    else out.push(`<p>${lines.map(inline).join("<br>")}</p>`);
  }
  return out.join("\n");
}
