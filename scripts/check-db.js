const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../database/shinchoku.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('データベース接続エラー:', err);
    process.exit(1);
  }
});

// applicantsテーブルの構造を確認
db.all("PRAGMA table_info(applicants)", (err, rows) => {
  if (err) {
    console.error('エラー:', err);
    db.close();
    process.exit(1);
  }

  console.log('\n📋 applicantsテーブルの構造:\n');
  rows.forEach(row => {
    console.log(`  ${row.name.padEnd(20)} ${row.type.padEnd(10)} ${row.notnull ? 'NOT NULL' : ''} ${row.dflt_value ? `DEFAULT ${row.dflt_value}` : ''}`);
  });

  db.close();
});
