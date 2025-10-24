-- applicantsテーブルにlast_updated_byとlast_updated_atカラムを追加するマイグレーションSQL
-- Supabaseで実行してください

-- 1. 新しいカラムを追加
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS last_updated_by VARCHAR(255);
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMP;

-- 2. インデックスを追加（検索を高速化）
CREATE INDEX IF NOT EXISTS idx_applicants_last_updated_by
ON applicants(last_updated_by);

CREATE INDEX IF NOT EXISTS idx_applicants_last_updated_at
ON applicants(last_updated_at);
