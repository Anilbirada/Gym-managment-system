const mysql = require('mysql2/promise');
require('dotenv').config();

function getPoolConfig() {
  const uri = process.env.MYSQL_URL || process.env.DATABASE_URL;
  if (uri) {
    try {
      const u = new URL(uri);
      const isCloud = u.hostname !== '127.0.0.1' && u.hostname !== 'localhost';
      return {
        host: u.hostname,
        port: Number(u.port || 3306),
        user: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
        database: u.pathname.replace(/^\//, '') || 'railway',
        waitForConnections: true,
        connectionLimit: 10,
        decimalNumbers: true,
        dateStrings: true,
        ssl: (isCloud || process.env.MYSQL_SSL === 'true') ? { rejectUnauthorized: false } : undefined,
      };
    } catch (e) {
      console.warn('Could not parse connection URL, using direct string:', e.message);
      return uri;
    }
  }

  const host = process.env.MYSQLHOST || process.env.MYSQL_HOST || '127.0.0.1';
  const isCloud = host !== '127.0.0.1' && host !== 'localhost';
  return {
    host,
    port: Number(process.env.MYSQLPORT || process.env.MYSQL_PORT || 3306),
    database: process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || 'forge_gym',
    user: process.env.MYSQLUSER || process.env.MYSQL_USER || 'gym_app',
    password: process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD || 'gym_local_dev',
    waitForConnections: true,
    connectionLimit: 10,
    decimalNumbers: true,
    dateStrings: true,
    ssl: (isCloud || process.env.MYSQL_SSL === 'true') ? { rejectUnauthorized: false } : undefined,
  };
}

const pool = mysql.createPool(getPoolConfig());

module.exports = pool;