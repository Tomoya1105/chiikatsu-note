// 国内航空券（グッド・エアーズ）の広告リンク。もしもアフィリエイトの素材（広告ID 96316）の、広告コードのとおりに出す。
// ・広告文は素材のまま（変えない）。「✈️」は CSS の飾りで、リンクの文言には含めない。
// ・rel の nofollow、referrerpolicy、attributionsrc、計測用の impression 画像は素材のまま残す（計測を損なわないため）。
//   足したのは、PR表記・sponsored・noopener・target=_blank・画像の alt だけ。
// ・出す条件は airOk（国内／イベント・カフェ／開催地が候補の1都道府県に決まる／終了していない）。
import fs from "fs";
export const AIR = JSON.parse(fs.readFileSync(new URL("./air.json", import.meta.url), "utf8"));
const PREFS = new Set(AIR.prefs);
export const AIR_Q = "a_id=5849049&p_id=7702&pc_id=22300&pl_id=96316";
export const AIR_TEXT = "国内格安航空券かんたん検索・予約 グッド・エアーズ／PC・スマホから24時間予約受付中！";
// areaNames: areasOf(it) の名前の配列。開催地が複数の都道府県にまたがる・判定できないものは出さない。
export const airOk = (it, areaNames, today, isEvent) =>
  !it.hidden && isEvent(it) && (it.region || "jp") === "jp" && !!it.area && !!it.s &&
  areaNames.length === 1 && PREFS.has(areaNames[0]) && !((it.e || it.s) < today);
export const airLink = () =>
  `<div class="airwrap"><a class="trip air" href="https://af.moshimo.com/af/c/click?${AIR_Q.replace(/&/g, "&amp;")}" target="_blank" rel="noopener sponsored nofollow" referrerpolicy="no-referrer-when-downgrade" attributionsrc data-air><span class="trip-t">${AIR_TEXT}</span><span class="tag">PR</span></a><img src="https://i.moshimo.com/af/i/impression?${AIR_Q.replace(/&/g, "&amp;")}" width="1" height="1" style="border:none;" loading="lazy" alt=""></div>`;
