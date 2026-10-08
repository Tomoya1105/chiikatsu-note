-- ちいかわ検定（非公式）の受験記録。Cloudflare D1 のコンソールに貼って1回だけ実行する。
-- 個人を特定する情報（IPアドレス・名前・メールなど）は保存しない。dev は端末の中で作ったランダムな番号。
CREATE TABLE IF NOT EXISTS attempts (
  id      TEXT PRIMARY KEY,   -- 受験ごとのランダムな番号（同じ受験を2回保存しない）
  created INTEGER NOT NULL,   -- 保存した時刻（UNIX秒）
  ver     INTEGER NOT NULL,   -- 問題セットの版
  dev     TEXT NOT NULL,      -- 端末ごとのランダムな番号
  first   INTEGER NOT NULL,   -- 1＝その端末の初回の挑戦
  score   INTEGER NOT NULL,   -- 0〜100（サーバーで採点し直した値）
  cats    TEXT NOT NULL,      -- カテゴリ別の正解数 s,c,w,f
  ans     TEXT NOT NULL,      -- 20問の正誤（1＝正解）
  dur     INTEGER NOT NULL,   -- かかった秒数
  valid   INTEGER NOT NULL    -- 1＝集計に使う
);
CREATE INDEX IF NOT EXISTS idx_attempts_dev ON attempts(dev, created);
-- 点数の分布。kind：f＝初回の挑戦、a＝すべての挑戦（どちらも集計に使う受験だけ）。ver=0・kind=d は日ごとの保存数（score に日付 YYYYMMDD）
CREATE TABLE IF NOT EXISTS hist (
  ver   INTEGER NOT NULL,
  kind  TEXT NOT NULL,
  score INTEGER NOT NULL,
  n     INTEGER NOT NULL,
  PRIMARY KEY (ver, kind, score)
);
-- このデータベースが本番用か確認用か（作ったあとに、どちらか1行だけを入れる。入れないと記録は保存されない）
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
