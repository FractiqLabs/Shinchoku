-- 既存のnotificationsテーブルにカラムを追加するマイグレーションSQL
-- Supabaseで実行してください

-- 1. 既存の通知データを削除（viewer_user_idが設定されていないため）
TRUNCATE TABLE notifications;

-- 2. 新しいカラムを追加
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS viewer_user_id INTEGER;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_user_id INTEGER;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_user_name VARCHAR(255);

-- 3. NOT NULL制約を追加
ALTER TABLE notifications ALTER COLUMN viewer_user_id SET NOT NULL;

-- 4. 外部キー制約を追加
ALTER TABLE notifications ADD CONSTRAINT fk_viewer_user
FOREIGN KEY (viewer_user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE notifications ADD CONSTRAINT fk_target_user
FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE;

-- 5. インデックスを追加
CREATE INDEX IF NOT EXISTS idx_notifications_viewer
ON notifications(viewer_user_id);

-- 6. 重複防止用のユニーク制約を追加
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_unique
ON notifications(type, actor_user_id, COALESCE(target_post_id, 0), viewer_user_id);
