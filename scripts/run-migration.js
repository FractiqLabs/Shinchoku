const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../database/shinchoku.db');
const MIGRATION_PATH = path.join(__dirname, '../database/migration-add-registry-fields.sql');

// マイグレーションを実行
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('データベース接続エラー:', err);
    process.exit(1);
  }
});

// マイグレーションSQLを読み込み
const migrationSQL = fs.readFileSync(MIGRATION_PATH, 'utf8');

// セミコロンで分割して各ステートメントを実行
const statements = migrationSQL
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

console.log('マイグレーションを開始します...');

// 各ステートメントを順番に実行
const executeStatements = async () => {
  for (const statement of statements) {
    try {
      await new Promise((resolve, reject) => {
        db.run(statement, (err) => {
          if (err) {
            // カラムがすでに存在する場合は無視
            if (err.message.includes('duplicate column name')) {
              console.log(`⚠️  カラムは既に存在します: ${statement.substring(0, 50)}...`);
              resolve();
            } else {
              reject(err);
            }
          } else {
            console.log(`✅ 実行成功: ${statement.substring(0, 50)}...`);
            resolve();
          }
        });
      });
    } catch (error) {
      console.error(`❌ エラー: ${error.message}`);
      console.error(`   SQL: ${statement}`);
      process.exit(1);
    }
  }
};

executeStatements()
  .then(() => {
    console.log('\n✨ マイグレーション完了！');
    db.close();
  })
  .catch((error) => {
    console.error('マイグレーションエラー:', error);
    db.close();
    process.exit(1);
  });
