-- ========================================
-- 全マイグレーション統合版
-- これ1つを実行すればOKです
-- ========================================

-- 【注意】このSQLは既存の通知データを削除します
-- 新しい構造に対応していないためです

BEGIN;

-- ==========================================
-- 1. notifications テーブルの拡張
-- ==========================================

-- 既存の通知データを削除
TRUNCATE TABLE notifications CASCADE;

-- 新しいカラムを追加
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS viewer_user_id INTEGER;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_user_id INTEGER;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_user_name VARCHAR(255);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;

-- NOT NULL制約を追加
DO $$
BEGIN
  BEGIN
    ALTER TABLE notifications ALTER COLUMN viewer_user_id SET NOT NULL;
  EXCEPTION
    WHEN others THEN NULL;
  END;
END $$;

-- 既存の外部キー制約を削除してから再度追加
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS fk_viewer_user;
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS fk_target_user;

ALTER TABLE notifications ADD CONSTRAINT fk_viewer_user
FOREIGN KEY (viewer_user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE notifications ADD CONSTRAINT fk_target_user
FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE;

-- インデックスを追加
CREATE INDEX IF NOT EXISTS idx_notifications_viewer
ON notifications(viewer_user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_is_read
ON notifications(is_read);

-- 重複防止用のユニーク制約を追加
DROP INDEX IF EXISTS idx_notifications_unique;
CREATE UNIQUE INDEX idx_notifications_unique
ON notifications(type, actor_user_id, COALESCE(target_post_id, 0), viewer_user_id);

-- ==========================================
-- 2. user_applicant_views テーブルの作成
-- ==========================================

CREATE TABLE IF NOT EXISTS user_applicant_views (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    applicant_id INTEGER NOT NULL,
    last_viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (applicant_id) REFERENCES applicants(id) ON DELETE CASCADE,
    UNIQUE(user_id, applicant_id)
);

CREATE INDEX IF NOT EXISTS idx_user_applicant_views_user
ON user_applicant_views(user_id);

CREATE INDEX IF NOT EXISTS idx_user_applicant_views_applicant
ON user_applicant_views(applicant_id);

-- ==========================================
-- 3. applicants テーブルの拡張
-- ==========================================

ALTER TABLE applicants ADD COLUMN IF NOT EXISTS last_updated_by VARCHAR(255);
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_applicants_last_updated_by
ON applicants(last_updated_by);

CREATE INDEX IF NOT EXISTS idx_applicants_last_updated_at
ON applicants(last_updated_at);

COMMIT;

-- ==========================================
-- マイグレーション完了
-- ==========================================
-- 以下が追加・変更されました：
--
-- notifications テーブル:
--   - viewer_user_id (INTEGER, NOT NULL) - 通知の受信者
--   - target_user_id (INTEGER) - 対象ユーザー
--   - target_user_name (VARCHAR) - 対象ユーザー名
--   - is_read (BOOLEAN) - 既読フラグ
--
-- user_applicant_views テーブル (新規):
--   - ユーザーごとの申込者閲覧履歴
--
-- applicants テーブル:
--   - last_updated_by (VARCHAR) - 最後に更新したユーザー名
--   - last_updated_at (TIMESTAMP) - 最後に更新した日時
-- ==========================================
