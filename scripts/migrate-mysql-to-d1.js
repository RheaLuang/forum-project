require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const tables = [
  {
    name: 'users',
    orderBy: 'id',
    columns: ['id', 'username', 'password', 'avatar', 'role', 'is_banned', 'created_at']
  },
  {
    name: 'posts',
    orderBy: 'id',
    columns: ['id', 'user_id', 'title', 'content', 'images', 'created_at']
  },
  {
    name: 'comments',
    orderBy: 'id',
    columns: ['id', 'post_id', 'user_id', 'content', 'created_at']
  },
  {
    name: 'likes',
    orderBy: 'post_id, user_id',
    columns: ['post_id', 'user_id', 'created_at']
  },
  {
    name: 'kitchen',
    orderBy: 'id',
    columns: ['id', 'user_id', 'title', 'link', 'images', 'created_at']
  },
  {
    name: 'sessions',
    orderBy: 'created_at',
    columns: ['session_id', 'user_id', 'created_at']
  }
];

function requireEnv(name, aliases = []) {
  const names = [name, ...aliases];
  for (const key of names) {
    if (process.env[key]) return process.env[key];
  }
  throw new Error(`${names.join(' or ')} is required`);
}

function mysqlSslConfig() {
  if (process.env.DB_SSL !== 'true') return undefined;
  if (process.env.DB_CA_PATH) {
    return { ca: fs.readFileSync(path.resolve(process.cwd(), process.env.DB_CA_PATH)) };
  }
  if (process.env.DB_CA) {
    return { ca: process.env.DB_CA.replace(/\\n/g, '\n') };
  }
  return {};
}

function d1Config() {
  return {
    accountId: requireEnv('CLOUDFLARE_ACCOUNT_ID', ['D1_ACCOUNT_ID']),
    databaseId: requireEnv('CLOUDFLARE_D1_DATABASE_ID', ['D1_DATABASE_ID']),
    apiToken: requireEnv('CLOUDFLARE_API_TOKEN', ['D1_API_TOKEN'])
  };
}

function normalizeValue(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 19).replace('T', ' ');
  }
  return value;
}

function splitSql(sql) {
  return sql
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean);
}

async function d1Query(config, sql, params = []) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sql, params })
    }
  );
  const data = await response.json();
  const result = Array.isArray(data.result) ? data.result[0] : data.result;
  if (!response.ok || !data.success || !result?.success) {
    const apiMessage = data.errors?.map(error => error.message).join('; ');
    throw new Error(apiMessage || result?.error || `D1 query failed: ${sql}`);
  }
  return result;
}

async function main() {
  const target = d1Config();
  const source = await mysql.createConnection({
    host: process.env.MYSQL_SOURCE_HOST || process.env.DB_HOST || 'localhost',
    port: Number(process.env.MYSQL_SOURCE_PORT || process.env.DB_PORT || 3306),
    user: process.env.MYSQL_SOURCE_USER || process.env.DB_USER || 'root',
    password: process.env.MYSQL_SOURCE_PASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.MYSQL_SOURCE_DATABASE || process.env.DB_NAME || 'forum_db',
    ssl: mysqlSslConfig()
  });

  try {
    const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'd1-schema.sql'), 'utf8');
    for (const statement of splitSql(schema)) {
      await d1Query(target, statement);
    }

    await d1Query(target, 'PRAGMA defer_foreign_keys = true');

    for (const table of tables) {
      const [rows] = await source.query(
        `SELECT ${table.columns.join(', ')} FROM ${table.name} ORDER BY ${table.orderBy}`
      );
      const placeholders = table.columns.map(() => '?').join(', ');
      const sql = `INSERT OR REPLACE INTO ${table.name} (${table.columns.join(', ')}) VALUES (${placeholders})`;

      for (const row of rows) {
        const params = table.columns.map(column => normalizeValue(row[column]));
        await d1Query(target, sql, params);
      }

      console.log(`Migrated ${rows.length} row(s) into ${table.name}`);
    }

    console.log('MySQL to Cloudflare D1 migration completed');
  } finally {
    await source.end();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
