require('dotenv').config();

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.D1_ACCOUNT_ID;
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID || process.env.D1_DATABASE_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN || process.env.D1_API_TOKEN;

function getD1Config() {
  if (!accountId || !databaseId || !apiToken) {
    throw new Error(
      'D1 is enabled, but CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, and CLOUDFLARE_API_TOKEN are required'
    );
  }

  return { accountId, databaseId, apiToken };
}

function isReadQuery(sql) {
  return /^\s*(SELECT|WITH|PRAGMA)\b/i.test(sql);
}

function normalizeError(error) {
  if (error && /UNIQUE constraint failed/i.test(error.message || '')) {
    error.code = 'ER_DUP_ENTRY';
  }
  return error;
}

async function runD1Query(sql, params = []) {
  const config = getD1Config();
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sql, params })
  });

  const data = await response.json();
  const queryResult = Array.isArray(data.result) ? data.result[0] : data.result;

  if (!response.ok || !data.success || !queryResult?.success) {
    const apiMessage = data.errors?.map(error => error.message).join('; ');
    const queryMessage = queryResult?.error || queryResult?.results?.error;
    throw normalizeError(new Error(apiMessage || queryMessage || 'D1 query failed'));
  }

  if (isReadQuery(sql)) {
    return queryResult.results || [];
  }

  return {
    insertId: queryResult.meta?.last_row_id || 0,
    affectedRows: queryResult.meta?.changes || 0
  };
}

function query(sql, params, callback) {
  let values = params;
  let done = callback;

  if (typeof values === 'function') {
    done = values;
    values = [];
  }

  runD1Query(sql, values || [])
    .then(result => done(null, result))
    .catch(error => done(normalizeError(error)));
}

function end() {}

function getConnection(callback) {
  query('SELECT 1 AS healthy', (err) => {
    if (err) return callback(err);
    callback(null, { release() {} });
  });
}

function promise() {
  return {
    async query(sql, params = []) {
      const result = await runD1Query(sql, params);
      return [result, []];
    },
    async end() {}
  };
}

module.exports = { query, promise, end, getConnection };
