-- 既存のnotificationsテーブルにカラムを追加するマイグレーションSQL
-- Supabaseで実行してください

-- 1. 既存の通知データを削除（viewer_user_idが設定されていないため）
TRUNCATE TABLE notifications;

-- 2. 新しいカラムを追加
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS viewer_user_id INTEGER;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_user_id INTEGER;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_user_name VARCHAR(255);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;

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

CREATE INDEX IF NOT EXISTS idx_notifications_is_read
ON notifications(is_read);

-- 6. 重複防止用のユニーク制約を追加
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_unique
ON notifications(type, actor_user_id, COALESCE(target_post_id, 0), viewer_user_id);

-- 7. ユーザー別申込者閲覧履歴テーブルを作成
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
