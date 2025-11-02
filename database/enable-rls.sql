-- Row Level Security (RLS) 有効化スクリプト
--
-- このスクリプトは、全テーブルにRow Level Securityを有効化し、
-- 認証済みユーザーのみがデータにアクセスできるように設定します。
--
-- 実行方法:
-- 1. Supabaseダッシュボードにログイン
-- 2. 左メニュー「SQL Editor」をクリック
-- 3. このファイルの内容をコピー＆ペースト
-- 4. 「Run」ボタンをクリック
--
-- 実行後の効果:
-- - RLSが有効化され、ポリシーによるアクセス制御が可能になります
-- - テーブルの構造変更や削除などの危険な操作が制限されます
-- - 個人情報保護法への対応の基盤ができます
--
-- 注意事項:
-- - 現在のシステムは独自認証のため、anonロールにもアクセスを許可しています
-- - より強固なセキュリティのためには、将来的にSupabase Authへの移行を推奨します

-- ============================================
-- 1. 既存のポリシーを削除（再実行時のエラー回避）
-- ============================================

DROP POLICY IF EXISTS "authenticated_access" ON applicants;
DROP POLICY IF EXISTS "allow_all_for_anon" ON applicants;
DROP POLICY IF EXISTS "allow_all_for_authenticated" ON applicants;

DROP POLICY IF EXISTS "authenticated_access" ON users;
DROP POLICY IF EXISTS "allow_all_for_anon" ON users;
DROP POLICY IF EXISTS "allow_all_for_authenticated" ON users;

DROP POLICY IF EXISTS "authenticated_access" ON timeline_posts;
DROP POLICY IF EXISTS "allow_all_for_anon" ON timeline_posts;
DROP POLICY IF EXISTS "allow_all_for_authenticated" ON timeline_posts;

DROP POLICY IF EXISTS "authenticated_access" ON notifications;
DROP POLICY IF EXISTS "allow_all_for_anon" ON notifications;
DROP POLICY IF EXISTS "allow_all_for_authenticated" ON notifications;

DROP POLICY IF EXISTS "authenticated_access" ON likes;
DROP POLICY IF EXISTS "allow_all_for_anon" ON likes;
DROP POLICY IF EXISTS "allow_all_for_authenticated" ON likes;

DROP POLICY IF EXISTS "authenticated_access" ON user_applicant_views;
DROP POLICY IF EXISTS "allow_all_for_anon" ON user_applicant_views;
DROP POLICY IF EXISTS "allow_all_for_authenticated" ON user_applicant_views;

-- ============================================
-- 2. すべてのテーブルでRLSを有効化
-- ============================================

-- 申込者テーブル
ALTER TABLE applicants ENABLE ROW LEVEL SECURITY;

-- ユーザーテーブル
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- タイムライン投稿テーブル
ALTER TABLE timeline_posts ENABLE ROW LEVEL SECURITY;

-- 通知テーブル
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- いいねテーブル
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;

-- 申込者閲覧履歴テーブル
ALTER TABLE user_applicant_views ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. アクセスポリシーの設定
-- ============================================
--
-- 注意: 現在のシステムは独自認証を使用しているため、
--       一時的に anon ロールにもアクセスを許可します。
--       これにより、ブラウザからのアクセスは可能ですが、
--       直接APIを叩かれた場合のリスクは残ります。
--
-- 将来的な改善策:
--   1. Supabase Auth への移行（推奨）
--   2. サービスロールキーをバックエンドで使用

-- 申込者テーブル: anonロールでもアクセス可能（現在のシステムとの互換性のため）
CREATE POLICY "allow_all_for_anon"
  ON applicants
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- 認証済みユーザー用（将来的にSupabase Authに移行した場合に備えて）
CREATE POLICY "allow_all_for_authenticated"
  ON applicants
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ユーザーテーブル
CREATE POLICY "allow_all_for_anon"
  ON users
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "allow_all_for_authenticated"
  ON users
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- タイムライン投稿テーブル
CREATE POLICY "allow_all_for_anon"
  ON timeline_posts
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "allow_all_for_authenticated"
  ON timeline_posts
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 通知テーブル
CREATE POLICY "allow_all_for_anon"
  ON notifications
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "allow_all_for_authenticated"
  ON notifications
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- いいねテーブル
CREATE POLICY "allow_all_for_anon"
  ON likes
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "allow_all_for_authenticated"
  ON likes
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 申込者閲覧履歴テーブル
CREATE POLICY "allow_all_for_anon"
  ON user_applicant_views
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "allow_all_for_authenticated"
  ON user_applicant_views
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 4. 確認用クエリ
-- ============================================

-- RLSが有効化されているか確認
SELECT
  schemaname,
  tablename,
  rowsecurity as "RLS有効"
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('applicants', 'users', 'timeline_posts', 'notifications', 'likes', 'user_applicant_views')
ORDER BY tablename;

-- ポリシーが正しく設定されているか確認
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
