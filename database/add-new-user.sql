-- 新規ユーザー「岡　和宏」を追加
--
-- 実行方法:
-- 1. Supabaseダッシュボードにログイン
-- 2. 左メニュー「SQL Editor」をクリック
-- 3. このファイルの内容をコピー＆ペースト
-- 4. 「Run」ボタンをクリック

INSERT INTO users (username, password_hash, name) VALUES
('d', '$2a$10$rQQqGqjMZJvPm5f5yP.rSe8QmN3LYx4wGF5M8wHrJ3FrKvE2qzNmy', '岡　和宏')
ON CONFLICT (username) DO NOTHING;

-- 確認用クエリ
SELECT id, username, name, created_at
FROM users
WHERE name = '岡　和宏';
