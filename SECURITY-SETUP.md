# 本番環境セキュリティ設定ガイド

本番環境でアプリケーションをデプロイする際に必要な環境変数の設定方法を説明します。

## 📋 必須環境変数

本番環境では以下の3つの環境変数が**必須**です：

1. **JWT_SECRET**: 強力な秘密鍵（認証トークンの暗号化に使用）
2. **NODE_ENV**: `production` に設定
3. **ALLOWED_ORIGINS**: 許可するオリジンのリスト（CORS設定）

---

## 🔑 1. JWT_SECRET の設定

### 強力な秘密鍵の生成方法

ターミナルで以下のコマンドを実行して、ランダムな秘密鍵を生成します：

```bash
openssl rand -base64 32
```

出力例：
```
Xk9pL2mN4qR7sT0uV3wX6yZ9aB2cD5eF8gH1jK4mN7pQ0sT3uV6wX9yZ2aB5cD8eF
```

この値をコピーして、環境変数として設定します。

### なぜ必要？
- JWTトークンの署名に使用されます
- この値が漏洩すると、攻撃者が偽のトークンを作成できる可能性があります
- 本番環境では未設定の場合、サーバーが起動しません

---

## 🌐 2. NODE_ENV の設定

本番環境では必ず `production` に設定してください。

### 設定値
```
NODE_ENV=production
```

### なぜ必要？
- 本番環境用の最適化が有効になります
- セキュリティ機能（HTTPS強制、エラーログの制限など）が有効になります
- 開発環境用の機能が無効になります

---

## 🛡️ 3. ALLOWED_ORIGINS の設定

本番環境では、APIにアクセスを許可するオリジン（ドメイン）を指定する必要があります。

### 設定例

#### 単一のドメインの場合
```
ALLOWED_ORIGINS=https://your-domain.com
```

#### 複数のドメインの場合（カンマ区切り）
```
ALLOWED_ORIGINS=https://your-domain.com,https://app.your-domain.com,https://www.your-domain.com
```

#### 開発環境と本番環境の両方を使う場合
```
ALLOWED_ORIGINS=https://your-domain.com,http://localhost:3000
```

### なぜ必要？
- CORS（Cross-Origin Resource Sharing）攻撃を防ぎます
- 指定したドメインからのみAPIへのアクセスを許可します
- 未設定の場合、本番環境では**すべてのオリジンが拒否**されます（アプリが動作しません）

### 注意点
- `http://` ではなく `https://` を使用してください（本番環境では必須）
- 末尾のスラッシュ（`/`）は不要です
- カンマの前後にスペースを入れても問題ありません

---

## 📝 デプロイ環境別の設定方法

### 1. Heroku の場合

#### 方法A: Heroku CLI を使用
```bash
# 秘密鍵を生成
openssl rand -base64 32

# 環境変数を設定
heroku config:set JWT_SECRET="生成した秘密鍵"
heroku config:set NODE_ENV=production
heroku config:set ALLOWED_ORIGINS="https://your-app.herokuapp.com"

# 設定を確認
heroku config
```

#### 方法B: Heroku Dashboard を使用
1. [Heroku Dashboard](https://dashboard.heroku.com/) にログイン
2. アプリを選択
3. 「Settings」タブをクリック
4. 「Config Vars」セクションで「Reveal Config Vars」をクリック
5. 以下のキーと値を追加：
   - `JWT_SECRET`: （生成した秘密鍵）
   - `NODE_ENV`: `production`
   - `ALLOWED_ORIGINS`: `https://your-app.herokuapp.com`

---

### 2. Railway の場合

1. [Railway Dashboard](https://railway.app/) にログイン
2. プロジェクトを選択
3. サービスを選択
4. 「Variables」タブをクリック
5. 「New Variable」をクリックして以下を追加：
   - `JWT_SECRET`: （生成した秘密鍵）
   - `NODE_ENV`: `production`
   - `ALLOWED_ORIGINS`: `https://your-app.up.railway.app`

---

### 3. Render の場合

1. [Render Dashboard](https://dashboard.render.com/) にログイン
2. サービスを選択
3. 「Environment」タブをクリック
4. 「Environment Variables」セクションで以下を追加：
   - `JWT_SECRET`: （生成した秘密鍵）
   - `NODE_ENV`: `production`
   - `ALLOWED_ORIGINS`: `https://your-app.onrender.com`

**注意**: `render.yaml` を使用している場合、以下のように設定できます：

```yaml
envVars:
  - key: NODE_ENV
    value: production
  - key: JWT_SECRET
    generateValue: true  # Renderが自動生成（推奨）
  - key: ALLOWED_ORIGINS
    value: https://your-app.onrender.com
```

---

### 4. Docker Compose の場合

`docker-compose.yml` ファイルを編集：

```yaml
services:
  app:
    environment:
      - DB_TYPE=postgres
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=shinchoku
      - DB_USER=postgres
      - DB_PASSWORD=your-db-password
      - JWT_SECRET=your-generated-secret-key  # ← ここに生成した秘密鍵を設定
      - NODE_ENV=production
      - ALLOWED_ORIGINS=https://your-domain.com  # ← あなたのドメインを設定
```

または、`.env` ファイルを作成：

```bash
# .env ファイル
JWT_SECRET=your-generated-secret-key
NODE_ENV=production
ALLOWED_ORIGINS=https://your-domain.com
DB_TYPE=postgres
DB_HOST=postgres
DB_PORT=5432
DB_NAME=shinchoku
DB_USER=postgres
DB_PASSWORD=your-db-password
```

`docker-compose.yml` で `.env` を読み込む：

```yaml
services:
  app:
    env_file:
      - .env
```

---

### 5. 自前サーバー（VPS等）の場合

#### 方法A: `.env` ファイルを使用（推奨）

プロジェクトルートに `.env` ファイルを作成：

```bash
# .env ファイル
JWT_SECRET=your-generated-secret-key
NODE_ENV=production
ALLOWED_ORIGINS=https://your-domain.com
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=shinchoku
DB_USER=your-db-user
DB_PASSWORD=your-db-password
```

**重要**: `.env` ファイルは `.gitignore` に含まれていることを確認してください（既に設定済みです）。

#### 方法B: systemd サービスファイルで設定

`/etc/systemd/system/shinchoku.service` を作成：

```ini
[Unit]
Description=Shinchoku Application
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/shinchoku
Environment="JWT_SECRET=your-generated-secret-key"
Environment="NODE_ENV=production"
Environment="ALLOWED_ORIGINS=https://your-domain.com"
Environment="DB_TYPE=postgres"
Environment="DB_HOST=localhost"
Environment="DB_PORT=5432"
Environment="DB_NAME=shinchoku"
Environment="DB_USER=your-db-user"
Environment="DB_PASSWORD=your-db-password"
ExecStart=/usr/bin/node server.js
Restart=always

[Install]
WantedBy=multi-user.target
```

---

## ✅ 設定確認方法

環境変数が正しく設定されているか確認する方法：

### 1. サーバーログを確認

サーバー起動時に以下のようなメッセージが表示されればOK：

```
サーバーがポート 3001 で起動しました
```

もし以下のようなエラーが表示された場合は、環境変数が設定されていません：

```
❌ エラー: JWT_SECRET環境変数が設定されていません
本番環境では必ず強力なJWT_SECRETを設定してください
```

### 2. 環境変数を直接確認（サーバー上で）

```bash
# Node.js で確認
node -e "console.log(process.env.JWT_SECRET ? '設定済み' : '未設定')"
node -e "console.log(process.env.NODE_ENV)"
node -e "console.log(process.env.ALLOWED_ORIGINS)"
```

---

## 🔒 セキュリティチェックリスト

本番環境デプロイ前に確認：

- [ ] `JWT_SECRET` が設定されている（強力なランダム文字列）
- [ ] `NODE_ENV=production` が設定されている
- [ ] `ALLOWED_ORIGINS` が設定されている（本番ドメインのみ）
- [ ] `.env` ファイルが `.gitignore` に含まれている
- [ ] データベースパスワードが強力である
- [ ] HTTPSが有効になっている
- [ ] 不要なポートが閉じられている

---

## 🆘 トラブルシューティング

### 問題: CORS エラーが発生する

**原因**: `ALLOWED_ORIGINS` が正しく設定されていない

**解決方法**:
1. ブラウザのコンソールでエラーメッセージを確認
2. アクセスしているURLが `ALLOWED_ORIGINS` に含まれているか確認
3. `https://` と `http://` を区別して設定（本番環境では `https://` を使用）

### 問題: サーバーが起動しない

**原因**: `JWT_SECRET` が設定されていない（本番環境の場合）

**解決方法**:
1. 環境変数が正しく設定されているか確認
2. サーバーログでエラーメッセージを確認
3. 環境変数の設定方法を再確認

### 問題: ログインできない

**原因**: レート制限に引っかかっている可能性

**解決方法**:
- 15分待ってから再度試す
- または、サーバー側でレート制限の設定を調整（開発者のみ）

---

## 📚 参考情報

- [JWT公式ドキュメント](https://jwt.io/)
- [CORS MDN](https://developer.mozilla.org/ja/docs/Web/HTTP/CORS)
- [Node.js環境変数](https://nodejs.org/api/process.html#process_process_env)

