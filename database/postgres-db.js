const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

class PostgresDatabase {
  constructor() {
    this.pool = null;
  }

  async init() {
    // DATABASE_URL が設定されている場合（Render.com など）はそれを優先
    const config = process.env.DATABASE_URL
      ? {
          connectionString: process.env.DATABASE_URL,
          ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 2000,
        }
      : {
          user: process.env.DB_USER || 'postgres',
          host: process.env.DB_HOST || 'localhost',
          database: process.env.DB_NAME || 'shinchoku',
          password: process.env.DB_PASSWORD || '',
          port: process.env.DB_PORT || 5432,
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 2000,
        };

    this.pool = new Pool(config);

    try {
      const client = await this.pool.connect();
      console.log('PostgreSQLデータベースに接続しました');
      client.release();
      await this.setupDatabase();
      return Promise.resolve();
    } catch (err) {
      console.error('データベース接続エラー:', err.message);
      return Promise.reject(err);
    }
  }

  async setupDatabase() {
    try {
      const schemaPath = path.join(__dirname, 'postgres-schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf8');
      
      await this.pool.query(schema);
      console.log('データベーススキーマが作成されました');
    } catch (err) {
      console.error('データベーススキーマ作成エラー:', err.message);
      throw err;
    }
  }

  async run(query, params = []) {
    try {
      const result = await this.pool.query(query, params);
      return { 
        id: result.rows[0]?.id, 
        changes: result.rowCount 
      };
    } catch (err) {
      throw err;
    }
  }

  async get(query, params = []) {
    try {
      const result = await this.pool.query(query, params);
      return result.rows[0] || null;
    } catch (err) {
      throw err;
    }
  }

  async all(query, params = []) {
    try {
      const result = await this.pool.query(query, params);
      return result.rows;
    } catch (err) {
      throw err;
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      console.log('データベース接続を閉じました');
    }
  }
}

module.exports = new PostgresDatabase();