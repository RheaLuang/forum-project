require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const tables = [
  ['users', ['id', 'username', 'password', 'avatar', 'role', 'is_banned', 'created_at'], 'id'],
  ['posts', ['id', 'user_id', 'title', 'content', 'images', 'created_at'], 'id'],
  ['comments', ['id', 'post_id', 'user_id', 'content', 'created_at'], 'id'],
  ['likes', ['post_id', 'user_id', 'created_at'], 'post_id, user_id'],
  ['kitchen', ['id', 'user_id', 'title', 'link', 'images', 'created_at'], 'id'],
  ['sessions', ['session_id', 'user_id', 'created_at'], 'created_at']
];

function mysqlSslConfig() {
  if (process.env.DB_SSL !== 'true') return undefined;
  if (process.env.DB_CA_PATH) return { ca: fs.readFileSync(path.resolve(process.cwd(), process.env.DB_CA_PATH)) };
  if (process.env.DB_CA) return { ca: process.env.DB_CA.replace(/\\n/g, '\n') };
  return {};
}

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (value instanceof Date) value = value.toISOString().slice(0, 19).replace('T', ' ');
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_SOURCE_HOST || process.env.DB_HOST || 'localhost',
    port: Number(process.env.MYSQL_SOURCE_PORT || process.env.DB_PORT || 3306),
    user: process.env.MYSQL_SOURCE_USER || process.env.DB_USER || 'root',
    password: process.env.MYSQL_SOURCE_PASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.MYSQL_SOURCE_DATABASE || process.env.DB_NAME || 'forum_db',
    ssl: mysqlSslConfig()
  });

  const outputPath = process.argv[2] || path.join(__dirname, '..', '..', '..', 'outputs', 'forum-d1-import.sql');
  const statements = [
    fs.readFileSync(path.join(__dirname, '..', 'db', 'd1-schema.sql'), 'utf8').trim(),
    'PRAGMA defer_foreign_keys = true;'
  ];

  try {
    for (const [table, columns, orderBy] of tables) {
      const [rows] = await connection.query(`SELECT ${columns.join(', ')} FROM ${table} ORDER BY ${orderBy}`);
      for (const row of rows) {
        const values = columns.map(column => sqlValue(row[column])).join(', ');
        statements.push(`INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${values});`);
      }
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${statements.join('\n')}\n`, 'utf8');
    console.log(outputPath);
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
