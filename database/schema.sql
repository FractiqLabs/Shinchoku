-- ユーザーテーブル
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 申込者テーブル
CREATE TABLE IF NOT EXISTS applicants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    surname TEXT NOT NULL,
    given_name TEXT NOT NULL,
    age INTEGER NOT NULL,
    care_level TEXT NOT NULL,
    address TEXT,
    kp TEXT,
    kp_relationship TEXT,
    kp_contact TEXT,
    kp_address TEXT,
    care_manager TEXT,
    care_manager_name TEXT,
    cm_contact TEXT,
    assignee TEXT,
    notes TEXT,
    status TEXT DEFAULT '申込書受領',
    application_date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- タイムライン投稿テーブル
CREATE TABLE IF NOT EXISTS timeline_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    applicant_id INTEGER NOT NULL,
    author TEXT NOT NULL,
    content TEXT NOT NULL,
    action TEXT,
    parent_post_id INTEGER NULL, -- 返信の場合の親投稿ID
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (applicant_id) REFERENCES applicants(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_post_id) REFERENCES timeline_posts(id) ON DELETE CASCADE
);

-- いいねテーブル
CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES timeline_posts(id) ON DELETE CASCADE,
    UNIQUE(user_id, post_id)
);

-- 初期ユーザーデータ挿入
INSERT OR IGNORE INTO users (username, password_hash, name) VALUES 
('a', '$2a$10$rQQqGqjMZJvPm5f5yP.rSe8QmN3LYx4wGF5M8wHrJ3FrKvE2qzNmy', '藤堂　友未枝'),
('b', '$2a$10$rQQqGqjMZJvPm5f5yP.rSe8QmN3LYx4wGF5M8wHrJ3FrKvE2qzNmy', '吉野　隼人'),
('c', '$2a$10$rQQqGqjMZJvPm5f5yP.rSe8QmN3LYx4wGF5M8wHrJ3FrKvE2qzNmy', '田中　慎治');

-- サンプル申込者データ
INSERT OR IGNORE INTO applicants (
    id, surname, given_name, age, care_level, address, kp, kp_relationship, 
    kp_contact, care_manager, cm_contact, assignee, notes, status, application_date
) VALUES 
(1, '田中', '太郎', 85, '要介護3', '', '田中花子', '長女', '090-1234-5678', '山田ケアマネ', '048-123-4567', '佐藤花子', '夜間のトイレ介助が必要。家族の協力体制は良好。', '実調完了', '2024-12-15'),
(2, '山田', '花子', 78, '要介護4', '', '山田太郎', '長男', '080-9876-5432', '佐藤ケアマネ', '048-987-6543', '鈴木一郎', '', '申込書受領', '2024-12-20'),
(3, '佐藤', '三郎', 92, '要介護5', '', '佐藤京子', '長女', '070-1111-2222', '田中ケアマネ', '048-111-2222', '高橋美代子', '重度認知症。医療的ケア多数。夜間見守り体制要検討。', '健康診断書待ち', '2024-12-10');

-- サンプルタイムラインデータ
INSERT OR IGNORE INTO timeline_posts (applicant_id, author, content, action, created_at) VALUES 
(1, '藤堂　友未枝', '実調完了\nADL良好、認知症なし。家族の協力体制◎\n特記事項：夜間のトイレ介助が必要', '実調完了', '2024-12-18 10:00:00'),
(1, '藤堂　友未枝', '申込書受領・台帳入力完了\n紹介元：○○居宅 山田ケアマネ', '申込書受領', '2024-12-15 09:00:00'),
(3, '田中　慎治', '健康診断書を家族に依頼\n主治医：○○病院 山田先生', '健康診断書依頼', '2024-12-14 14:00:00'),
(3, '田中　慎治', '実調完了\n重度の認知症あり。医療的ケア多数\n要検討事項：夜間の見守り体制', '実調完了', '2024-12-12 11:00:00'),
(3, '吉野　隼人', '申込書受領・台帳入力完了\n紹介元：○○病院 SW佐藤', '申込書受領', '2024-12-10 16:00:00');