require('dotenv').config();

if (process.env.DB_DRIVER === 'd1') {
  module.exports = require('./d1');
  return;
}

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2');

function getSslConfig() {
  if (process.env.DB_SSL !== 'true') {
    return undefined;
  }

  const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';

  if (process.env.DB_CA) {
    return {
      ca: process.env.DB_CA.replace(/\\n/g, '\n'),
      rejectUnauthorized
    };
  }

  if (process.env.DB_CA_PATH) {
    const caPath = path.resolve(process.cwd(), process.env.DB_CA_PATH);
    return {
      ca: fs.readFileSync(caPath),
      rejectUnauthorized
    };
  }

  return { rejectUnauthorized };
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'forum_db',
  ssl: getSslConfig(),
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  charset: 'utf8mb4'
});

module.exports = pool;
