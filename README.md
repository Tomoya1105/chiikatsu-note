# ちい活ノート

ちいかわグッズの発売日・イベント日程をまとめた非公式スケジュール帳のサイトです。

- `data/items.json` … 掲載情報（毎朝の自動更新でここが書き換わります）
- `src/` … ページの見た目（style.css）と動き（app.js）、トップページの本文
- `build.mjs` … 公開用ファイルを `dist/` に組み立てるスクリプト
- `functions/api/` … 読者からの「まちがい報告」を受け取る仕組み（Cloudflare Pages Functions）

## Cloudflare Pages の設定
- ビルドコマンド：`node build.mjs`
- 出力ディレクトリ：`dist`
