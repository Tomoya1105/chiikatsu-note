// 共有用の画像（OGP画像 1200×630）を作る。キャラクターは使わず、文字とサイトのアイコンだけ。
// @resvg/resvg-js が入っていない環境では null を返し、サイトは共通の画像を使う。
import fs from "node:fs";

let Resvg = null;
try { ({ Resvg } = await import("@resvg/resvg-js")); } catch (e) { Resvg = null; }
const FONT = "src/fonts/og-font.otf";
const ICON = fs.existsSync("src/icons/icon-192.png") ? "data:image/png;base64," + fs.readFileSync("src/icons/icon-192.png").toString("base64") : "";

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const cw = ch => (/[\x20-\x7e]/.test(ch) ? 0.56 : 1); // 半角はおよそ半分の幅

// 指定の幅（文字数換算）で折り返す。行数を超えたら「…」
function wrap(text, maxEm, maxLines) {
  const lines = []; let cur = "", w = 0;
  for (const ch of String(text)) {
    const c = cw(ch);
    if (w + c > maxEm) { lines.push(cur); cur = ""; w = 0; if (ch === " ") continue; }
    cur += ch; w += c;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + "…"; }
  return lines;
}

export const ogAvailable = () => !!Resvg && fs.existsSync(FONT);

export function makeOg({ label = "", title = "", when = "", sub = "", accent = "#E27496" }) {
  if (!ogAvailable()) return null;
  const tSize = String(title).length > 30 ? 56 : 64;
  const tLines = wrap(title, Math.floor(960 / tSize), 3);
  const subLine = wrap(sub, 30, 1)[0] || "";
  const top = 170;
  const tY = tLines.map((l, i) => `<text x="120" y="${top + 40 + i * (tSize * 1.3)}" font-size="${tSize}" fill="#3A3346">${esc(l)}</text>`).join("");
  const afterTitle = top + 40 + (tLines.length - 1) * tSize * 1.3;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FCE8EF"/><stop offset="1" stop-color="#F3D2DF"/></linearGradient></defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <circle cx="1120" cy="70" r="120" fill="#FFFFFF" opacity=".35"/><circle cx="70" cy="600" r="90" fill="#FFFFFF" opacity=".35"/>
  <rect x="60" y="60" width="1080" height="510" rx="44" fill="#FFFFFF"/>
  <g font-family="Noto Sans CJK JP" font-weight="700">
    ${label ? `<rect x="120" y="102" width="${label.length * 30 + 44}" height="50" rx="25" fill="${accent}"/><text x="${120 + 22}" y="137" font-size="28" fill="#FFFFFF">${esc(label)}</text>` : ""}
    ${tY}
    ${when ? `<text x="120" y="${afterTitle + 96}" font-size="46" fill="${accent}">${esc(when)}</text>` : ""}
    ${subLine ? `<text x="120" y="${afterTitle + (when ? 156 : 96)}" font-size="30" fill="#6D6479">${esc(subLine)}</text>` : ""}
    ${ICON ? `<image href="${ICON}" x="120" y="478" width="60" height="60"/>` : ""}
    <text x="196" y="520" font-size="32" fill="#3A3346">ちい活ノート</text>
    <text x="1080" y="520" font-size="24" fill="#9A91A6" text-anchor="end">ちいかわグッズとイベントのスケジュール帳（非公式）</text>
  </g>
</svg>`;
  const r = new Resvg(svg, { fitTo: { mode: "width", value: 1200 }, font: { fontFiles: [FONT], loadSystemFonts: false, defaultFontFamily: "Noto Sans CJK JP" } });
  return r.render().asPng();
}
