require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const pool = require('./db');
const seed = require('./seed');

async function setup() {
  console.log('Connecting to MySQL database...');

  try {
    await pool.query('SELECT 1');
  } catch (err) {
    const host = process.env.MYSQLHOST || process.env.MYSQL_HOST || '127.0.0.1';
    if (host === '127.0.0.1' || host === 'localhost') {
      console.log('Connecting as root to ensure user and database exist...');
      const database = process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || 'forge_gym';
      const user = process.env.MYSQLUSER || process.env.MYSQL_USER || 'gym_app';
      const password = process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD || 'gym_local_dev';
      const port = Number(process.env.MYSQLPORT || process.env.MYSQL_PORT || 3306);

      const rootConnection = await mysql.createConnection({ host, port, user: 'root', password: '' });
      await rootConnection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\`;`);
      await rootConnection.query(
        `CREATE USER IF NOT EXISTS '${user}'@'%' IDENTIFIED WITH mysql_native_password BY '${password}';`
      );
      await rootConnection.query(`GRANT ALL PRIVILEGES ON \`${database}\`.* TO '${user}'@'%';`);
      await rootConnection.query('FLUSH PRIVILEGES;');
      await rootConnection.end();
    } else {
      throw err;
    }
  }

  console.log('Applying schema from database/schema.sql...');
  const schemaPath = path.resolve(__dirname, '../../database/schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  // Split and execute statements
  const statements = sql
    .split(/;\s*$/m)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await pool.query(statement);
  }

  console.log('Database schema successfully initialized.');
  console.log('Running initial seed data...');
  await seed(pool);
  console.log('Database setup and seed completed successfully!');
  await pool.end();
}

setup().catch((err) => {
  console.error('Database setup failed:', err.message);
  process.exit(1);
});
