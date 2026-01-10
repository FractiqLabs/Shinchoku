# Shinchoku デプロイメントガイド

## クラウドデータベース同期機能について

このプロジェクトは、異なるパソコンや異なるブラウザでデータが同期される仕様に更新されました。

### 主な変更点

1. **PostgreSQL対応**: クラウドデータベースとしてPostgreSQLを使用
2. **リアルタイム同期**: WebSocketを使用してリアルタイムでデータ同期
3. **環境設定**: 開発・本番環境の設定分離

## ローカル開発環境

### SQLiteでの開発（従来通り）
```bash
npm install
npm run dev
```

### PostgreSQLでの開発
```bash
# Docker ComposeでPostgreSQLを起動
docker-compose up postgres -d

# 環境変数を設定
cp .env.example .env
# .envファイルを編集してDB_TYPE=postgresに設定

# データベースセットアップ
npm run db:setup

# 開発サーバー起動
npm run dev
```

## 本番デプロイメント

### 1. Heroku
```bash
# Heroku CLI設定
heroku create your-app-name
heroku addons:create heroku-postgresql:hobby-dev

# 環境変数設定
# まず強力な秘密鍵を生成
openssl rand -base64 32

# 環境変数を設定（生成した秘密鍵を使用）
heroku config:set DB_TYPE=postgres
heroku config:set JWT_SECRET="生成した秘密鍵をここに貼り付け"
heroku config:set NODE_ENV=production
heroku config:set ALLOWED_ORIGINS="https://your-app.herokuapp.com"

# デプロイ
git push heroku main
```

### 2. Railway
```bash
# Railway CLI設定
railway login
railway init
railway add postgresql

# 環境変数設定（Railway Dashboard）
# 1. Railway Dashboardでプロジェクトを開く
# 2. 「Variables」タブで以下を設定：
#    - DB_TYPE=postgres
#    - JWT_SECRET=（openssl rand -base64 32 で生成した秘密鍵）
#    - NODE_ENV=production
#    - ALLOWED_ORIGINS=https://your-app.up.railway.app
#    - DATABASE_URL=自動設定される

# デプロイ
railway up
```

### 3. Docker Compose（自前サーバー）
```bash
# 本番用設定
cp .env.example .env

# .envファイルを編集して以下を設定：
# JWT_SECRET=（openssl rand -base64 32 で生成した秘密鍵）
# NODE_ENV=production
# ALLOWED_ORIGINS=https://your-domain.com
# DB_TYPE=postgres
# （その他のデータベース設定）

# 起動
docker-compose up -d
```

詳細な設定方法は `SECURITY-SETUP.md` を参照してください。

## 環境変数

### 必須設定
- `DB_TYPE`: "postgres" または "sqlite"
- `JWT_SECRET`: JWT暗号化キー（本番環境では必須、未設定時は起動失敗）
- `NODE_ENV`: "production" または "development"

### セキュリティ設定（本番環境推奨）
- `ALLOWED_ORIGINS`: CORSで許可するオリジン（カンマ区切り）
  - 例: `ALLOWED_ORIGINS=https://example.com,https://app.example.com`
  - 未設定の場合、開発環境では全許可、本番環境では全拒否

### PostgreSQL使用時
- `DB_HOST`: データベースホスト
- `DB_PORT`: データベースポート（通常5432）
- `DB_NAME`: データベース名
- `DB_USER`: ユーザー名
- `DB_PASSWORD`: パスワード

または

- `DATABASE_URL`: PostgreSQL接続URL

## リアルタイム同期機能

### 同期されるイベント
1. 新規申込者の追加
2. 申込者情報の更新
3. タイムライン投稿の追加
4. ステータスの変更

### 使用方法
- ログイン後、自動的にWebSocket接続が確立
- 他のユーザーの操作がリアルタイムで反映される
- ネットワーク切断時は自動再接続

## トラブルシューティング

### データベース接続エラー
```bash
# PostgreSQL接続確認
npm run db:setup
```

### WebSocket接続エラー
- ファイアウォール設定の確認
- プロキシ設定の確認
- ブラウザのWebSocket対応確認

## セキュリティ注意事項

### 必須設定

1. **JWT_SECRET**: 必ず本番環境用の強力なキーを設定
   - 本番環境では環境変数未設定の場合、サーバーは起動しません
   - 強力なキーの生成方法: `openssl rand -base64 32`
   - 開発環境では警告が表示されますが、デフォルト値が使用されます

2. **CORS設定**: 本番環境では許可するオリジンを指定
   - 環境変数 `ALLOWED_ORIGINS` にカンマ区切りで指定
   - 例: `ALLOWED_ORIGINS=https://example.com,https://app.example.com`
   - 未設定の場合、本番環境ではすべてのオリジンが拒否されます

3. **データベース認証**: 強力なパスワードを使用

4. **HTTPS**: 本番環境では必ずHTTPS使用

5. **ファイアウォール**: 不要なポートは閉じる

### セキュリティ機能

- **レート制限**: ログイン試行は15分間に5回まで、API呼び出しは1分間に100回まで
- **セキュリティヘッダー**: Helmetミドルウェアで自動設定
- **WebSocket認証**: 認証済み接続のみ許可
- **SQLインジェクション対策**: パラメータ化クエリを使用

## パフォーマンス最適化

1. **データベース接続プール**: PostgreSQLで自動設定済み
2. **WebSocket接続管理**: 適切な切断・再接続処理実装済み
3. **キャッシュ戦略**: 必要に応じて実装可能
