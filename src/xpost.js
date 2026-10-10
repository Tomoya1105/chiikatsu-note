// 公式アカウントの一覧は data/official-x.json（ビルド時にここへ差し込む）
const XOFF_ACCT = /*OFFICIAL_X*/{};
const XPOST_RE = /^https:\/\/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})/;
// 公式のXの投稿（画像つき）を探す：xpost（自動更新が入れる）→ src・srcs のうち ちいかわ公式アカウントのもの
function xpostOf(it) {
  if (!it) return null;
  const m0 = XPOST_RE.exec(it.xpost || it.x || "");
  if (m0 && XOFF_ACCT[m0[1].toLowerCase()]) return { id: m0[2], name: XOFF_ACCT[m0[1].toLowerCase()] };
  // 一覧にないアカウントは、一覧にある公式アカウントがリポストしたもの（xpostVia）だけ表示する（運営者の方針：公式がリポストしたものは公式の情報として扱う）
  if (m0 && it.xpostVia && XOFF_ACCT[String(it.xpostVia).toLowerCase()]) return { id: m0[2], name: "@" + m0[1] + "（" + XOFF_ACCT[String(it.xpostVia).toLowerCase()] + "がリポスト）" };
  for (const u of [it.src, ...(Array.isArray(it.srcs) ? it.srcs : [])]) {
    const m = XPOST_RE.exec(u || "");
    if (m && XOFF_ACCT[m[1].toLowerCase()]) return { id: m[2], name: XOFF_ACCT[m[1].toLowerCase()] };
  }
  return null;
}
const XICO = '<svg viewBox="0 0 24 24" aria-hidden="true" width="22" height="22"><rect x="3" y="4" width="18" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="10" r="1.8" fill="currentColor"/><path d="M5 18l5-5 3 3 2.5-2.5L20 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
function xbox(x) {
  return x ? `<div class="xbox"><button type="button" class="xbtn" data-xembed="${x.id}" aria-expanded="false">${XICO}<span class="xt"><b class="xl">公式の画像を見る</b><small>${x.name}のXの投稿を表示</small></span><span class="xchev" aria-hidden="true">▾</span></button><div class="xframe"></div></div>` : "";
}

// 公式の画像がまだない件：公式アカウントの検索へのリンク（Xの検索を開くだけ。投稿を取り違える心配がない）
function xsearchUrl(it) {
  const raw = String((it && it.t) || ""), at = /[＠@]\s*(.+)$/.exec(raw);
  const t = (at ? at[1] : raw.replace(/^(映画)?ちいかわ[×x ]?/, "")).replace(/[「」『』【】（）()［］\[\]“”"!！?？〜～・、。]/g, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 2).join(" ");
  if (!t) return "";
  const who = /POP ?UP|ポップアップ/i.test(it.t) ? "(from:chiikawa_popup OR from:chiikawa_kouhou)" : /ベーカリー/.test(it.t) ? "(from:chiikawabakery OR from:chiikawa_kouhou)" : "(from:chiikawa_kouhou OR from:chiikawa_market OR from:chiikawa_popup OR from:chiikawabakery)";
  return "https://x.com/search?q=" + encodeURIComponent(who + " " + t) + "&f=live";
}
function xsearch(it, cls) {
  const u = xpostOf(it) ? "" : xsearchUrl(it);
  return u ? `<a class="${cls || "lnk"} xsearch" href="${u}" target="_blank" rel="noopener">公式Xで探す</a>` : "";
}
