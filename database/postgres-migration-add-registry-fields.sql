-- 入居申込目録機能のための追加フィールド (PostgreSQL版)
-- 性別、部屋番号、入居日、市区町村を追加

ALTER TABLE applicants ADD COLUMN IF NOT EXISTS gender VARCHAR(10);
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS room_number VARCHAR(50);
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS move_in_date DATE;
ALTER TABLE applicants ADD COLUMN IF NOT EXISTS municipality VARCHAR(100);
