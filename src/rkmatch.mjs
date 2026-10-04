// 楽天の検索結果から「掲載中の情報と同じ商品」を選ぶ判定（一覧・詳細ページ・サーバーの点検で共通）。
// いちばん大事なのは「ちがう商品の画像を出さない」こと。少しでも怪しければ選ばない（画像なしでよい）。
export var RKM = (function(){
  var KINDS = ["かるた","ぬいぐるみ","キーホルダー","キーリング","Tシャツ","トレーナー","パーカー","ステッカー","缶バッジ","ポーチ","巾着","タオル","ハンカチ","ソックス","靴下","グミ","ガム","チョコ","クッキー","フィギュア","アクリルスタンド","アクスタ","下敷き","クリアファイル","ノート","付箋","ボールペン","マグ","コップ","お弁当箱","ランチボックス","パジャマ","スリッパ","ブランケット","クッション","バッグ","トート","リュック","財布","スマホケース","カレンダー","手帳","絵本","コミック","カード","シール","マスコット","入浴剤","ガチャ","くじ"];
  var NG = ["中古","USED","ユーズド","美品","未使用品","開封済","プレミア","入手困難","完売品","転売","並行輸入","非公式","互換","ノーブランド","ハンドメイド","レンタル","まとめ買い","ケース販売","業務用","大量"];
  var OTHER_IP = /ディズニー|ミッキー|ミニー|プリンセス|アナと雪|アナ雪|トイ・?ストーリー|サンリオ|キティ|マイメロ|クロミ|シナモ|ポムポム|すみっコ|リラックマ|ポケモン|ピカチュウ|カービィ|マリオ|アンパンマン|ドラえもん|しんちゃん|クレヨンしんちゃん|鬼滅|呪術|スヌーピー|ムーミン|ミッフィー|トミカ|プラレール|戦隊|仮面ライダー|プリキュア|スパイダーマン|マーベル|ちいかわ以外/g;
  var BULK = /×\s?\d{2,}\s?(個|本|袋|枚)|\d{2,}\s?(個|袋)セット/;
  var CH = /ちいかわ|chiikawa|ハチワレ|ナガノ/i;
  function norm(s){ return String(s || "").normalize("NFKC").toLowerCase().replace(/\s+/g, " "); }
  function refPrice(p){ var m = String(p || "").replace(/,/g, "").match(/(\d{2,6})\s*円/); return m ? +m[1] : 0; }
  // 探してよいか（検索語に、種類名ではない2文字以上の言葉があるか）。だめなら null
  function plan(it){
    if (!it || !it.q || it.cat === "event" || it.cat === "cafe") return null;
    var tokens = norm(it.q).split(" ").filter(function(t){ return t && !/^(ちいかわ|アニメ|映画)$/.test(t); });
    var distinct = tokens.filter(function(t){ return t.length >= 2 && !KINDS.some(function(k){ return norm(k) === t; }); });
    if (!distinct.length) return null;
    // 楽天の検索は1文字だけの言葉（「9」など）があるとエラーになるので、検索語からは外す（同じ商品かの判定には使う）
    var q = String(it.q).split(/\s+/).filter(function(w){ return w.length >= 2; }).join(" ");
    return { query: /ちいかわ|chiikawa/i.test(q) ? q : "ちいかわ " + q, tokens: tokens, ref: refPrice(it.price), mine: norm((it.t || "") + " " + it.q) };
  }
  // results：{name, price} の配列。同じ商品と言えるものだけを返す（なければ null）
  function pick(it, results){
    var p = plan(it); if (!p) return null;
    for (var i = 0; i < (results || []).length; i++) {
      var x = results[i], n = x.name || "", nm = norm(n), price = +x.price || 0;
      if (!CH.test(n) || BULK.test(n) || NG.some(function(w){ return n.indexOf(w) >= 0; })) continue;
      if (new Set(n.match(OTHER_IP) || []).size >= 2) continue;
      if (p.ref && (price > p.ref * 1.6 || price < p.ref * 0.6)) continue;   // 値段が離れすぎていたら別の商品（セット売り・部品など）
      if (!p.tokens.every(function(t){ return nm.indexOf(t) >= 0; })) continue;
      if (KINDS.some(function(k){ return nm.indexOf(norm(k)) >= 0 && p.mine.indexOf(norm(k)) < 0; })) continue;
      return x;
    }
    return null;
  }
  return { plan: plan, pick: pick, norm: norm };
})();
