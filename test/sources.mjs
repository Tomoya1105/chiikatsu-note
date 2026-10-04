// 情報源（src）のURLから、根拠の種類を決める。check.mjs と自動更新が使う。
// official：ちいかわ公式（公式サイト・公式通販・公式SNS）
// partner ：メーカー・コラボ企業・施設・出版社などの公式発表
// press   ：プレスリリース配信
// news    ：報道・ニュースサイト（公式の発表が読めないときの根拠）
// aggregator：まとめサイト・個人ブログ（手がかりにはしてよいが、根拠にはしない）
export const AGGREGATOR = /(^|\.)(chiikawapark\.com|hateblo\.jp|hatenablog\.com|prizenavi\.com|kaho-memo\.com|ameblo\.jp|livedoor\.(jp|blog)|fc2\.com|note\.com|matome\.naver\.jp|seesaa\.net|goo\.ne\.jp|wordpress\.com|blogspot\.com)$/;
const OFFICIAL = /(^|\.)(chiikawa-info\.jp|chiikawamarket\.jp|chiikawabakery\.jp|chiikawapark-tokyo\.jp|chiikawa\.toho-movie\.jp|chiikawa-pocket\.com|anime-chiikawa\.jp|chiikawa-official\.com)$/;
const OFFICIAL_X = /^(chiikawa_kouhou|chiikawa_market|chiikawa_land|chiikawa_info|ngnchiikawa|anime_chiikawa|chiikawa_bakery|chiikawapark)/i;
const PRESS = /(^|\.)(prtimes\.jp|atpress\.ne\.jp|value-press\.com|dreamnews\.jp|newscast\.jp)$/;
const NEWS = /(^|\.)(news\.yahoo\.co\.jp|inside-games\.jp|natalie\.mu|animeanime\.jp|itmedia\.co\.jp|timeout\.com|news\.qq\.com|econovill\.com|ggilbo\.com|marketing-interactive\.com|weekendhk\.com|pashplus\.jp|kstyle\.com|oricon\.co\.jp|mantan-web\.jp|animatetimes\.com|famitsu\.com|cnet\.com|nikkei\.com|asahi\.com|mainichi\.jp|yomiuri\.co\.jp|ettoday\.net|udn\.com|setn\.com|yna\.co\.kr|hk01\.com|mingpao\.com|sina\.com\.cn|163\.com|thepaper\.cn|popga\.co\.kr|popply\.co\.kr|popspot\.co\.kr|oneone\.com\.tw)$/;
export function srcTypeOf(url) {
  let u; try { u = new URL(url); } catch (e) { return "unknown"; }
  const h = u.hostname.replace(/^www\./, "");
  if (AGGREGATOR.test(h)) return "aggregator";
  if (OFFICIAL.test(h) || h.endsWith(".chiikawamarket.jp")) return "official";
  if (h === "x.com" || h === "twitter.com") return OFFICIAL_X.test(u.pathname.split("/")[1] || "") ? "official" : "partner";
  if (PRESS.test(h)) return "press";
  if (NEWS.test(h)) return "news";
  return "partner"; // それ以外はメーカー・企業・施設の公式サイトとみなす（自動更新が種類を直してよい）
}
export const SRC_TYPES = ["official", "partner", "press", "news"];
