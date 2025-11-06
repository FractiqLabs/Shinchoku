const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../database/shinchoku.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('データベース接続エラー:', err);
    process.exit(1);
  }
});

console.log('genderカラムを追加します...');

db.run("ALTER TABLE applicants ADD COLUMN gender TEXT", (err) => {
  if (err) {
    if (err.message.includes('duplicate column name')) {
      console.log('✅ genderカラムは既に存在します');
    } else {
      console.error('❌ エラー:', err);
    }
  } else {
    console.log('✅ genderカラムを追加しました');
  }

  db.close();
});
