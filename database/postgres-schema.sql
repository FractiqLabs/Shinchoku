-- ユーザーテーブル
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 申込者テーブル
CREATE TABLE IF NOT EXISTS applicants (
    id SERIAL PRIMARY KEY,
    surname VARCHAR(255) NOT NULL,
    given_name VARCHAR(255) NOT NULL,
    age INTEGER NOT NULL,
    care_level VARCHAR(50) NOT NULL,
    address TEXT,
    kp VARCHAR(255),
    kp_relationship VARCHAR(100),
    kp_contact VARCHAR(20),
    kp_address TEXT,
    care_manager VARCHAR(255),
    care_manager_name VARCHAR(255),
    cm_contact VARCHAR(20),
    assignee VARCHAR(255),
    notes TEXT,
    status VARCHAR(50) DEFAULT '申込書受領',
    application_date DATE NOT NULL,
    last_updated_by VARCHAR(255),
    last_updated_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- タイムライン投稿テーブル
CREATE TABLE IF NOT EXISTS timeline_posts (
    id SERIAL PRIMARY KEY,
    applicant_id INTEGER NOT NULL,
    author VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    action VARCHAR(100),
    status VARCHAR(100),
    parent_post_id INTEGER NULL,
    post_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (applicant_id) REFERENCES applicants(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_post_id) REFERENCES timeline_posts(id) ON DELETE CASCADE
);

-- 既存データ保護のため、カラムが存在しない場合のみ追加
ALTER TABLE timeline_posts ADD COLUMN IF NOT EXISTS post_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE timeline_posts ADD COLUMN IF NOT EXISTS status VARCHAR(100);

-- いいねテーブル
CREATE TABLE IF NOT EXISTS likes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES timeline_posts(id) ON DELETE CASCADE,
    UNIQUE(user_id, post_id)
);

-- 通知テーブル
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    actor_user_id INTEGER NOT NULL,
    actor_user_name VARCHAR(255) NOT NULL,
    viewer_user_id INTEGER NOT NULL,
    target_user_id INTEGER,
    target_user_name VARCHAR(255),
    target_applicant_id INTEGER NOT NULL,
    target_post_id INTEGER,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (viewer_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (target_applicant_id) REFERENCES applicants(id) ON DELETE CASCADE,
    FOREIGN KEY (target_post_id) REFERENCES timeline_posts(id) ON DELETE CASCADE
);

-- インデックス追加
CREATE INDEX IF NOT EXISTS idx_notifications_target_applicant
ON notifications(target_applicant_id);

CREATE INDEX IF NOT EXISTS idx_notifications_actor
ON notifications(actor_user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_viewer
ON notifications(viewer_user_id);

-- 重複防止用のユニーク制約（同じアクションに対して同じユーザーへの通知は1件のみ）
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_unique
ON notifications(type, actor_user_id, COALESCE(target_post_id, 0), viewer_user_id);

-- ユーザー別申込者閲覧履歴テーブル
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

-- 初期ユーザーデータ挿入
INSERT INTO users (username, password_hash, name) VALUES
('a', '$2a$10$rQQqGqjMZJvPm5f5yP.rSe8QmN3LYx4wGF5M8wHrJ3FrKvE2qzNmy', '藤堂　友未枝'),
('b', '$2a$10$rQQqGqjMZJvPm5f5yP.rSe8QmN3LYx4wGF5M8wHrJ3FrKvE2qzNmy', '吉野　隼人'),
('c', '$2a$10$rQQqGqjMZJvPm5f5yP.rSe8QmN3LYx4wGF5M8wHrJ3FrKvE2qzNmy', '田中　慎治'),
('d', '$2a$10$rQQqGqjMZJvPm5f5yP.rSe8QmN3LYx4wGF5M8wHrJ3FrKvE2qzNmy', '岡　和宏')
ON CONFLICT (username) DO NOTHING;

-- サンプル申込者データ
INSERT INTO applicants (
    id, surname, given_name, age, care_level, address, kp, kp_relationship, 
    kp_contact, care_manager, cm_contact, assignee, notes, status, application_date
) VALUES 
(1, '田中', '太郎', 85, '要介護3', '', '田中花子', '長女', '090-1234-5678', '山田ケアマネ', '048-123-4567', '佐藤花子', '夜間のトイレ介助が必要。家族の協力体制は良好。', '実調完了', '2024-12-15'),
(2, '山田', '花子', 78, '要介護4', '', '山田太郎', '長男', '080-9876-5432', '佐藤ケアマネ', '048-987-6543', '鈴木一郎', '', '申込書受領', '2024-12-20'),
(3, '佐藤', '三郎', 92, '要介護5', '', '佐藤京子', '長女', '070-1111-2222', '田中ケアマネ', '048-111-2222', '高橋美代子', '重度認知症。医療的ケア多数。夜間見守り体制要検討。', '健康診断書待ち', '2024-12-10')
ON CONFLICT (id) DO NOTHING;

-- サンプルタイムラインデータ
INSERT INTO timeline_posts (applicant_id, author, content, action, created_at) VALUES 
(1, '藤堂　友未枝', '実調完了\nADL良好、認知症なし。家族の協力体制◎\n特記事項：夜間のトイレ介助が必要', '実調完了', '2024-12-18 10:00:00'),
(1, '藤堂　友未枝', '申込書受領・台帳入力完了\n紹介元：○○居宅 山田ケアマネ', '申込書受領', '2024-12-15 09:00:00'),
(3, '田中　慎治', '健康診断書を家族に依頼\n主治医：○○病院 山田先生', '健康診断書依頼', '2024-12-14 14:00:00'),
(3, '田中　慎治', '実調完了\n重度の認知症あり。医療的ケア多数\n要検討事項：夜間の見守り体制', '実調完了', '2024-12-12 11:00:00'),
(3, '吉野　隼人', '申込書受領・台帳入力完了\n紹介元：○○病院 SW佐藤', '申込書受領', '2024-12-10 16:00:00')
ON CONFLICT DO NOTHING;