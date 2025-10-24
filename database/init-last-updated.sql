-- 既存の申込者データのlast_updated_byとlast_updated_atを初期化
-- 各申込者の最新のタイムライン投稿から情報を取得して設定

UPDATE applicants
SET
  last_updated_by = (
    SELECT author
    FROM timeline_posts
    WHERE timeline_posts.applicant_id = applicants.id
    ORDER BY created_at DESC
    LIMIT 1
  ),
  last_updated_at = (
    SELECT created_at
    FROM timeline_posts
    WHERE timeline_posts.applicant_id = applicants.id
    ORDER BY created_at DESC
    LIMIT 1
  )
WHERE last_updated_by IS NULL
  AND EXISTS (
    SELECT 1
    FROM timeline_posts
    WHERE timeline_posts.applicant_id = applicants.id
  );
