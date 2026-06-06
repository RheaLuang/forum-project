require('dotenv').config();

const { spawn } = require('child_process');
const crypto = require('crypto');
const db = require('../db/db').promise();

const port = 3103;
const baseUrl = `http://127.0.0.1:${port}`;
const suffix = crypto.randomBytes(6).toString('hex');
const username = `admin_test_${suffix}`;
const adminSession = `admin-${suffix}`;
const userSession = `user-${suffix}`;

function waitForServer(server) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server startup timed out')), 15000);
    server.stdout.on('data', data => {
      if (data.toString().includes('Server is running')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    server.stderr.on('data', data => process.stderr.write(data));
    server.on('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Server exited before testing with code ${code}`));
    });
  });
}

async function request(path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const data = await response.json();
  if (!response.ok) throw new Error(`${path}: ${data.message || response.status}`);
  return data;
}

async function run() {
  let server;
  let testUserId;

  try {
    const [admins] = await db.query(
      "SELECT id FROM users WHERE LOWER(username) = 'rhea' AND role = 'admin' LIMIT 1"
    );
    if (admins.length === 0) throw new Error('Rhea is not an administrator');

    const [userResult] = await db.query(
      'INSERT INTO users (username, password) VALUES (?, ?)',
      [username, 'temporary-password']
    );
    testUserId = userResult.insertId;
    await db.query(
      'INSERT INTO sessions (session_id, user_id) VALUES (?, ?), (?, ?)',
      [adminSession, admins[0].id, userSession, testUserId]
    );
    const [postResult] = await db.query(
      'INSERT INTO posts (user_id, title, content) VALUES (?, ?, ?)',
      [testUserId, 'Admin test post', 'Temporary content']
    );
    const [commentResult] = await db.query(
      'INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)',
      [postResult.insertId, testUserId, 'Temporary comment']
    );

    server = spawn(process.execPath, ['src/server.js'], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    await waitForServer(server);

    const jsonHeaders = { 'Content-Type': 'application/json' };
    const users = await request('/admin/users', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ sessionId: adminSession })
    });
    if (!users.some(user => Number(user.id) === Number(testUserId))) {
      throw new Error('Admin user list did not include the test user');
    }

    await request(`/admin/users/${testUserId}/ban`, {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ sessionId: adminSession })
    });
    const [[bannedUser]] = await db.query(
      'SELECT is_banned FROM users WHERE id = ?',
      [testUserId]
    );
    const [[sessionCount]] = await db.query(
      'SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?',
      [testUserId]
    );
    if (!bannedUser.is_banned || Number(sessionCount.count) !== 0) {
      throw new Error('Ban did not disable the account and clear its sessions');
    }

    await request(`/admin/users/${testUserId}/unban`, {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ sessionId: adminSession })
    });
    await request(`/comments/${commentResult.insertId}`, {
      method: 'DELETE',
      headers: jsonHeaders,
      body: JSON.stringify({ sessionId: adminSession })
    });
    await request(`/posts/${postResult.insertId}`, {
      method: 'DELETE',
      headers: jsonHeaders,
      body: JSON.stringify({ sessionId: adminSession })
    });

    console.log('Admin user list, ban, unban, post delete, and comment delete passed');
  } finally {
    if (server) server.kill();
    if (testUserId) await db.query('DELETE FROM users WHERE id = ?', [testUserId]);
    await db.query('DELETE FROM sessions WHERE session_id = ?', [adminSession]);
    await db.end();
  }
}

run().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
