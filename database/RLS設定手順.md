# Row Level Security (RLS) 設定手順

## 概要
この手順では、Supabaseデータベースに Row Level Security を設定します。
所要時間: **約10分**

---

## 手順1: Supabaseダッシュボードにアクセス

1. ブラウザで Supabase にログイン
   https://supabase.com/dashboard

2. プロジェクトを選択
   - プロジェクト名: `ekjinurnieytaeqeexsg`（または該当のプロジェクト）

---

## 手順2: SQL Editorを開く

1. 左側のメニューから **「SQL Editor」** をクリック

2. 「New query」ボタンをクリック
   - 新しいSQLエディタが開きます

---

## 手順3: RLS設定スクリプトを実行

1. `database/enable-rls.sql` ファイルを開く

2. **ファイルの全内容をコピー**

3. Supabase SQL Editor に**ペースト**

4. 右下の **「Run」** ボタンをクリック

5. 実行結果を確認
   ```
   Success. No rows returned
   ```
   または
   ```
   6 rows returned  ← RLS有効化の確認クエリ結果
   ```

---

## 手順4: 動作確認

### 確認1: RLSが有効化されているか

SQL Editorで以下のクエリを実行：

```sql
SELECT
  tablename,
  rowsecurity as "RLS有効"
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('applicants', 'users', 'timeline_posts', 'notifications', 'likes', 'user_applicant_views')
ORDER BY tablename;
```

**期待される結果:**
```
tablename              | RLS有効
-----------------------|--------
applicants             | true
likes                  | true
notifications          | true
timeline_posts         | true
user_applicant_views   | true
users                  | true
```

すべて `true` になっていれば成功です！

---

### 確認2: ポリシーが設定されているか

```sql
SELECT
  tablename,
  policyname
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

**期待される結果:**
各テーブルに2つのポリシーが設定されているはずです：
- `allow_all_for_anon`
- `allow_all_for_authenticated`

---

### 確認3: アプリケーションが正常に動作するか

1. ブラウザでアプリケーションにアクセス

2. ログインできることを確認

3. 申込者一覧が表示されることを確認

4. 新規投稿ができることを確認

**すべて正常に動作すれば完了です！** ✅

---

## トラブルシューティング

### ❌ エラー1: 「permission denied for table applicants」

**原因:** RLSポリシーが正しく設定されていない

**対策:**
```sql
-- ポリシーを再作成
DROP POLICY IF EXISTS "allow_all_for_anon" ON applicants;
CREATE POLICY "allow_all_for_anon"
  ON applicants FOR ALL TO anon
  USING (true) WITH CHECK (true);
```

---

### ❌ エラー2: 「RUN」ボタンを押してもエラーが出る

**原因:** SQLの構文エラー

**対策:**
1. エラーメッセージを確認
2. `enable-rls.sql` の内容が正しくコピーできているか確認
3. 余分な文字が入っていないか確認

---

### ❌ アプリケーションでデータが表示されない

**原因1:** ポリシーが厳しすぎる
- 現在の設定では anonロールにもアクセスを許可しているため、この問題は起きにくいです

**原因2:** リアルタイム機能が無効
- Supabaseダッシュボード → Database → Replication でテーブルのReplicationを有効化

**対策:**
```sql
-- anonロールでアクセスできるか確認
SELECT count(*) FROM applicants;
```
- 件数が返ってくればOK
- エラーが出る場合はポリシーを確認

---

## ロールバック方法（元に戻す）

万が一、問題が発生した場合は以下で元に戻せます：

```sql
-- RLSを無効化
ALTER TABLE applicants DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE timeline_posts DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE likes DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_applicant_views DISABLE ROW LEVEL SECURITY;

-- ポリシーを削除
DROP POLICY IF EXISTS "allow_all_for_anon" ON applicants;
DROP POLICY IF EXISTS "allow_all_for_authenticated" ON applicants;
-- （以下、他のテーブルも同様）
```

---

## 完了チェックリスト

- [ ] SQL Editor で `enable-rls.sql` を実行した
- [ ] RLS有効化の確認クエリで全テーブルが `true` になっている
- [ ] ポリシー確認クエリで各テーブルに2つのポリシーがある
- [ ] アプリケーションにログインできる
- [ ] 申込者一覧が表示される
- [ ] 新規投稿ができる

**すべてチェックできたら完了です！** 🎉

---

## 次のステップ

✅ RLS設定完了後:
1. GitHubリポジトリを非公開にする
2. HTTPS確認（`HTTPS確認手順.md` 参照）

💡 将来的な改善:
- Supabase Auth への移行（より強固な認証）
- ユーザーごとのアクセス制御（現在は全ユーザーが全データにアクセス可能）
