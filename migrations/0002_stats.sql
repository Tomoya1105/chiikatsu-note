-- ちい活ノート本体の計測（日ごとの合計だけ）。Cloudflare D1 のコンソールに貼って1回だけ実行する。
-- 個人を特定する情報・端末を見分ける番号・一人ひとりの操作の履歴は保存しない。
CREATE TABLE IF NOT EXISTS daily (
  day TEXT NOT NULL,              -- 日本時間の日付（2026-10-12）
  seg TEXT NOT NULL,              -- g＝一般、t＝テストモードの端末
  k   TEXT NOT NULL,              -- 項目（functions/api/hit.js で決めた名前だけ）
  n   INTEGER NOT NULL DEFAULT 0, -- 合計
  PRIMARY KEY (day, seg, k)
) WITHOUT ROWID;
-- w:日付＝その日の計測の書き込み量（Cloudflare が数えた行数）と最後に記録した時刻
-- m:日付＝その日の上限の状態（1＝縮小、2＝停止）と始まった時刻
-- env＝このデータベースが本番用か確認用か（下の1行で入れる）
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL DEFAULT 0, t TEXT);
-- ▼確認用（プレビュー）のデータベースでは、この1行を実行する
-- INSERT OR REPLACE INTO meta (k, v, t) VALUES ('env', 0, 'preview');
-- ▼本番のデータベースでは、代わりにこの1行を実行する
-- INSERT OR REPLACE INTO meta (k, v, t) VALUES ('env', 0, 'production');
