// 楽天の商品の絞り込み（商品名の前半にちいかわ関連の言葉／値段の中央値の2.5倍）の確認
import fs from "node:fs";
const src = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const pick = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error("not found: " + a); return src.slice(i, j); };
const fn = new Function(
  pick("const CHARS =", "function normItem") +
  "return {okItem, tidyPrices, frontName};"
);
const { okItem, tidyPrices, frontName } = fn();
let ng = 0;
const t = (name, ok, label) => { const r = okItem({ name, price: 1000 }); if (r !== ok) { ng++; console.log("NG", label, "→", r, name); } else console.log("ok ", label); };
t("ちいかわ ぬいぐるみ マスコット 公式", true, "先頭に ちいかわ");
t("P3倍【月間MVP受賞】 ちいかわ スタンペンG 印鑑付きボールペン", true, "宣伝文句の後に ちいかわ");
t("【ポイント5倍】【公式】ちいかわ ハチワレ マグカップ", true, "宣伝の【】を飛ばす");
t("累計1,200万枚突破 公式【3枚セット】 VIAGE ビューティー アップ ブラ&ショーツ ちいかわ 韓国 ナイトブラ", false, "下着（ちいかわは後ろ）");
t("ラブブ ケース フィギュアケース キーホルダー 収納 コレクションケース ちいかわ ハチワレ", false, "ラブブ（ちいかわは後ろ）");
t("エントリーでポイント5倍 3%OFFクーポン発行中 ツインGTキャップ ちいかわ", false, "水筒（ちいかわは後ろ）");
t("ちいかわ × ラブブ コラボ ぬいぐるみ", true, "コラボは先頭にあればOK");
const mk = (...ps) => ps.map((p, i) => ({ name: "ちいかわ " + i, price: p }));
const kept = tidyPrices(mk(1000, 1200, 1500, 1800, 2000, 2500, 9000, 16400)).map(x => x.price);
if (kept.includes(9000) || kept.includes(16400) || !kept.includes(2500)) { ng++; console.log("NG 値段の絞り込み", kept); } else console.log("ok  値段が中央値の2.5倍を超えるものを外す", kept.join(","));
const few = tidyPrices(mk(1000, 20000, 30000));
if (few.length !== 3) { ng++; console.log("NG 件数が少ないときは外さない"); } else console.log("ok  件数が少ないときは外さない");
if (ng) { console.log(ng + " 件NG"); process.exit(1); }
console.log("shop-filter OK");
