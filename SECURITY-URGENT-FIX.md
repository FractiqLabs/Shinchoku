# 🚨 緊急セキュリティ対応ガイド

## 現在の状況
GitHubにコードを公開している状態で、以下の情報が暴露されています：
- パスワード（admin1, admin2, admin3）
- SupabaseのURLとanonKey
- RLSポリシーが「全員アクセス可能」の状態

## ⚠️ 緊急対応（優先順位順）

### 1. GitHubリポジトリをプライベートに変更（最優先・5分）

1. GitHubのリポジトリページを開く
2. 右上の「Settings」をクリック
3. 一番下の「Danger Zone」セクションまでスクロール
4. 「Change visibility」→「Change to private」をクリック
5. 確認ダイアログでリポジトリ名を入力して「I understand, change repository visibility」をクリック

**これで、コードが公開されなくなります。**

### 2. パスワードを変更（10分）

既に公開されているパスワードは無効化されているものとして扱います。

#### 方法A: 新しいパスワードを設定（推奨）

1. `supabase-client.js` のパスワードマッピングを変更：
```javascript
const passwordMapping = {
  '藤堂　友未枝': '新しい強力なパスワード1',
  '吉野　隼人': '新しい強力なパスワード2',
  '田中　慎治': '新しい強力なパスワード3',
  '岡　和宏': '新しい強力なパスワード4'
};
```

2. README.mdからパスワード情報を削除

#### 方法B: Supabase Authに移行（長期的な解決策）

将来的にSupabase Authを使用することを推奨します。

### 3. RLSポリシーを厳格化（15分）

現在、`anon`ロールで全データにアクセス可能です。これを制限します。

1. Supabaseダッシュボードにログイン
2. SQL Editorを開く
3. 以下のSQLを実行：

```sql
-- 既存のanonポリシーを削除
DROP POLICY IF EXISTS "allow_all_for_anon" ON applicants;
DROP POLICY IF EXISTS "allow_all_for_anon" ON users;
DROP POLICY IF EXISTS "allow_all_for_anon" ON timeline_posts;
DROP POLICY IF EXISTS "allow_all_for_anon" ON notifications;
DROP POLICY IF EXISTS "allow_all_for_anon" ON likes;
DROP POLICY IF EXISTS "allow_all_for_anon" ON user_applicant_views;

-- 注意: これでanonロールからのアクセスができなくなります
-- 現在のシステムが動作しなくなる可能性があります
-- バックエンドサーバー経由でのアクセスに切り替える必要があります
```

**注意**: この変更を行うと、現在のフロントエンドからの直接アクセスができなくなる可能性があります。
バックエンドサーバー（server.js）を経由する必要があります。

### 4. SupabaseのanonKeyを変更（オプション・推奨）

既に公開されているanonKeyを無効化します。

1. Supabaseダッシュボード → Settings → API
2. 「Reset anon key」をクリック
3. 新しいキーを `supabase-config.js` に反映

## 🔒 長期的な改善策

### A. パスワードを環境変数に移行

現在のコード内ハードコーディングをやめ、環境変数から読み込むようにします。

### B. Supabase Authへの移行

Supabaseの標準認証システムを使用します。

### C. バックエンドAPIの使用

フロントエンドから直接Supabaseにアクセスせず、バックエンドサーバーを経由します。

## 📝 チェックリスト

- [ ] GitHubリポジトリをプライベートに変更
- [ ] パスワードを変更
- [ ] README.mdからパスワード情報を削除
- [ ] RLSポリシーを確認・更新
- [ ] SupabaseのanonKeyを変更（推奨）
- [ ] チームメンバーに新しいパスワードを通知

## ⚠️ 重要な注意

- **プライベートリポジトリにしても、既にクローンされたコードは残ります**
- **Git履歴にもパスワード情報が残っています**
- 完全に削除するには、リポジトリを削除して新規作成する必要があります（推奨）

