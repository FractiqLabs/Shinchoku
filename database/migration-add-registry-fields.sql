-- 入居申込目録機能のための追加フィールド
-- 性別、部屋番号、入居日、市区町村を追加

ALTER TABLE applicants ADD COLUMN gender TEXT;
ALTER TABLE applicants ADD COLUMN room_number TEXT;
ALTER TABLE applicants ADD COLUMN move_in_date DATE;
ALTER TABLE applicants ADD COLUMN municipality TEXT;
