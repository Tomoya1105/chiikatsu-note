// ちいかわ検定（非公式）のページを組み立てる：/quiz/（検定本体）、/quiz/r/0〜100/（共有された結果）、共有画像22枚。
// build.mjs から呼ぶ。既存のページには手を入れない。
import fs from "node:fs";
import { QUESTIONS, TITLES, QUIZ_RANGE } from "./quiz-data.mjs";
import { makeQuizOg } from "./og.mjs";

export function buildQuiz({ page, write, esc, SITE, BRAND, BUILD, OUT, ogOk }) {
  // ブラウザ用：問題データ → 採点ロジック → 画面の動き の順に1つのファイルにまとめる（import/export を外す）
  const strip = s => s.replace(/^import .*$/gm, "").replace(/^export \{[^}]*\};?\s*$/gm, "").replace(/^export /gm, "");
  const js = "/* ちいかわ検定（非公式）build " + BUILD + " */\n(function(){\n" + strip(fs.readFileSync("src/quiz-data.mjs", "utf8")) + "\n" +
    strip(fs.readFileSync("src/quizcore.mjs", "utf8")) + "\n" + fs.readFileSync("src/quiz.js", "utf8") + "\n})();\n";
  write("quiz/quiz.js", js);
  write("quiz/quiz.css", fs.readFileSync("src/quiz.css", "utf8"));

  // 共有画像
  let og = false;
  if (ogOk) {
    fs.mkdirSync(`${OUT}/og/quiz`, { recursive: true });
    const top = makeQuizOg({ score: null });
    if (top) { fs.writeFileSync(`${OUT}/og/quiz/top.png`, top); og = true; }
    for (let s = 0; s <= 100; s += 5) {
      const t = TITLES.find(x => s >= x.min);
      const png = makeQuizOg({ score: s, title: t.name, sub: t.sub });
      if (png) fs.writeFileSync(`${OUT}/og/quiz/${s}.png`, png);
    }
  }

  // ホーム画面のアイコンから開いたときは、検定ではなくトップを出す（iPhone は追加したときのページを開くことがあるため）。
  // サイト内を移動して来たとき（この起動中に一度でもページを開いていれば install.js が印を付ける）は、そのまま検定を出す
  const LAUNCH = `<script>try{var sa=(window.matchMedia&&matchMedia("(display-mode: standalone)").matches)||navigator.standalone===true;if(sa&&!sessionStorage.getItem("chiikatsu-launched"))location.replace("/?from=homescreen")}catch(e){}</script>`;
  const head = LAUNCH + `<link rel="stylesheet" href="/quiz/quiz.css?v=${BUILD}">`;
  const foot = `<footer class="qz-foot"><p><a href="/">ちい活ノート</a>・<a href="/about/">運営者について</a>・<a href="/privacy/">プライバシーポリシー</a></p><p>ちい活ノートの非公式クイズです。公式の検定・認定ではありません。<br>©nagano / chiikawa committee　本サイトは権利者とは関係のない個人運営のサイトです。</p></footer>`;
  const titleRows = TITLES.slice().reverse().map(t => {
    const pt = t.min === 100 ? "100点" : t.min === 95 ? "95点" : `${t.min}〜${TITLES[TITLES.indexOf(t) - 1].min - 5}点`;
    return t.secret
      ? `<li><span class="pt">${pt}</span><div data-secret><b>？？？</b><span>100点を取った人だけが見られます</span></div></li>`
      : `<li><span class="pt">${pt}</span><div><b>${esc(t.name)}</b><span>${esc(t.sub)}</span></div></li>`;
  }).join("");

  const topHtml = `<div class="wrap">${BRAND}<main class="qz" id="qz">
  <section id="qzTop">
    <div class="qz-hero">
      <p class="qz-kick">ちい活ノートの非公式クイズ</p>
      <h1>ちいかわ検定<small>（非公式）</small></h1>
      <p class="qz-lead">あの回、ちゃんと覚えてる？<br><span class="nb">アニメの「あの場面」から</span><span class="nb">出題する全${QUESTIONS.length}問。</span><br><span class="nb">最後まで解くと、</span><span class="nb">あなたの称号が決まります。</span></p>
      <ul class="qz-chips"><li>全${QUESTIONS.length}問</li><li>4択</li><li>約4分</li><li>${esc(QUIZ_RANGE)}から出題</li></ul>
      <ol class="qz-ladder"><li class="lv1"><b>初級</b>Q1〜5</li><li class="lv2"><b>中級</b>Q6〜10</li><li class="lv3"><b>上級</b>Q11〜15</li><li class="lv4"><b>激ムズ</b>Q16〜20</li></ol>
      <button type="button" class="qz-btn big" data-start>はじめる</button>
      <div class="qz-mine" id="qzMine" hidden></div>
    </div>
    <section class="qz-titles"><h2>称号いちらん（1問5点・100点満点）</h2><ol>${titleRows}</ol></section>
    <p class="qz-about">ちいかわが大好きなファンが作った、非公式のクイズです。公式の検定・認定ではありません。問題と解説は、アニメの放送内容と、公式・報道の情報をもとにオリジナルで作っています。原作のみの話や映画の内容は出題していません。</p>
  </section>
  <section id="qzStage" hidden aria-live="polite"></section>
  <noscript><p class="qz-about">ちいかわ検定は、JavaScriptをオンにすると遊べます。</p></noscript>
</main>${foot}</div>`;
  write("quiz/index.html", page({
    title: "ちいかわ検定（非公式）｜全20問・あなたは何点？｜ちい活ノート",
    desc: `アニメ『ちいかわ』（${QUIZ_RANGE}）の「あの場面」から出題する、非公式の4択クイズ。初級から激ムズまで全20問。点数に応じて称号が決まります。`,
    url: "/quiz/", head, ogImage: og ? "/og/quiz/top.png" : "/og/home.png",
    body: topHtml,
    scripts: `<script src="/quiz/quiz.js?v=${BUILD}" defer></script>`,
  }));

  // 共有された結果のページ（点数ごとに1枚。個人の情報は入れない）
  for (let s = 0; s <= 100; s += 5) {
    const t = TITLES.find(x => s >= x.min), gold = s === 100;
    const body = `<div class="wrap">${BRAND}<main class="qz qz-shared">
  <div class="qz-card${gold ? " gold" : ""}">
    <p class="qz-cl">ちいかわ検定<small>（非公式）</small></p>
    <p class="qz-score num">${s}<small>点</small></p>${gold ? `<p class="qz-star" aria-hidden="true">★ 全問正解 ★</p>` : ""}
    <p class="qz-title">${esc(t.name)}</p><p class="qz-tsub">― ${esc(t.sub)} ―</p>
    <p class="qz-brand"><img src="/icons/icon-192.png" alt="" width="22" height="22">ちい活ノート</p>
  </div>
  <p class="qz-lead">シェアされた結果です。<br>あなたは何点とれる？ アニメの「あの場面」から出題する全${QUESTIONS.length}問の4択クイズ。</p>
  <a class="qz-btn big" href="/quiz/?ref=share">ちいかわ検定に挑戦する</a>
  <p class="qz-muted c">約4分・無料・登録なし</p>
  <section class="qz-promo"><p class="pk">この検定をつくったサイト</p><div class="ph"><img src="/icons/icon-192.png" alt="" width="52" height="52"><div><p class="pn">ちい活ノート</p><p class="pd">ちいかわグッズとイベントの予定帳（非公式）</p></div></div>
  <p class="pf">新作グッズの発売日や、POP UP STOREの開催期間をまとめてチェックできます。</p><a class="qz-btn sub" href="/?from=quiz">ちい活ノートを見てみる</a></section>
</main>${foot}</div>`;
    write(`quiz/r/${s}/index.html`, page({
      title: `ちいかわ検定（非公式）で${s}点「${t.name}」｜ちい活ノート`,
      desc: `ちいかわ検定（非公式）の結果：${s}点・${t.name}（${t.sub}）。アニメの「あの場面」から出題する全20問の4択クイズに、あなたも挑戦してみませんか。`,
      url: "/quiz/", head: head, ogImage: og ? `/og/quiz/${s}.png` : "/og/home.png", body,
    }).replace('<meta property="og:url" content="' + SITE + '/quiz/">', '<meta property="og:url" content="' + SITE + `/quiz/r/${s}/">`)
      .replace("<head>", '<head>\n<meta name="robots" content="noindex">'));
  }
  return ["/quiz/"];
}
