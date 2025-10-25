-- timeline_postsテーブルにstatusカラムを追加
-- これにより、各投稿にステータスを保存できるようになります

BEGIN;

-- statusカラムを追加
ALTER TABLE timeline_posts ADD COLUMN IF NOT EXISTS status VARCHAR(100);

-- インデックスを追加（パフォーマンス向上のため）
CREATE INDEX IF NOT EXISTS idx_timeline_posts_status
ON timeline_posts(status);

CREATE INDEX IF NOT EXISTS idx_timeline_posts_applicant_created
ON timeline_posts(applicant_id, created_at DESC);

-- 既存データのstatusを初期化（actionからstatusをマッピング）
UPDATE timeline_posts
SET status = CASE action
  WHEN '申込書受領' THEN '申込書受領'
  WHEN '実調日程調整中' THEN '実調日程調整中'
  WHEN '実調完了' THEN '実調完了'
  WHEN '健康診断書依頼' THEN '健康診断書待ち'
  WHEN '健康診断書受領' THEN '健康診断書受領'
  WHEN '判定会議中' THEN '判定会議中'
  WHEN '入居決定' THEN '入居決定'
  WHEN '入居不可' THEN '入居不可'
  WHEN '入居日調整中' THEN '入居日調整中'
  WHEN '書類送付済' THEN '書類送付済'
  WHEN '入居準備完了' THEN '入居準備完了'
  WHEN '入居完了' THEN '入居完了'
  WHEN 'キャンセル' THEN 'キャンセル'
  ELSE NULL
END
WHERE action IS NOT NULL;

COMMIT;
