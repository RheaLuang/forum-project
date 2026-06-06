require('dotenv').config();

const { spawn } = require('child_process');
const { v2: cloudinary } = require('cloudinary');
const db = require('../db/db');

const port = 3101;
const baseUrl = `http://127.0.0.1:${port}`;
const username = `cloudinary_test_${Date.now()}`;
const password = `test_${Math.random().toString(36).slice(2)}`;
const createdUrls = [];

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

function request(path, options) {
  return fetch(`${baseUrl}${path}`, options).then(async response => {
    const body = await response.json();
    if (!response.ok) {
      throw new Error(`${options?.method || 'GET'} ${path}: ${response.status} ${JSON.stringify(body)}`);
    }
    return body;
  });
}

function imageFile(name) {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=',
    'base64'
  );
  return new Blob([png], { type: 'image/png' });
}

function assertCloudinaryUrl(url, label) {
  if (!url || !url.startsWith('https://res.cloudinary.com/')) {
    throw new Error(`${label} did not return a Cloudinary URL`);
  }
  createdUrls.push(url);
}

function getPublicId(url) {
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z0-9]+(?:\?.*)?$/i);
  return match ? decodeURIComponent(match[1]) : null;
}

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

async function cleanup() {
  const publicIds = createdUrls.map(getPublicId).filter(Boolean);
  await Promise.all(publicIds.map(publicId =>
    cloudinary.uploader.destroy(publicId).catch(() => {})
  ));

  await db.promise().query('DELETE FROM users WHERE username = ?', [username]);
  await db.promise().end();
}

async function run() {
  const server = spawn(process.execPath, ['src/server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    await waitForServer(server);

    await request('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const login = await request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const avatarForm = new FormData();
    avatarForm.append('sessionId', login.sessionId);
    avatarForm.append('avatar', imageFile(), 'avatar.png');
    const avatar = await request('/me/avatar', { method: 'POST', body: avatarForm });
    assertCloudinaryUrl(avatar.avatar, 'Avatar upload');

    const postForm = new FormData();
    postForm.append('sessionId', login.sessionId);
    postForm.append('title', 'Cloudinary smoke test');
    postForm.append('content', 'Temporary test post');
    postForm.append('images', imageFile(), 'post.png');
    const post = await request('/posts', { method: 'POST', body: postForm });
    assertCloudinaryUrl(post.images[0], 'Post upload');

    const kitchenForm = new FormData();
    kitchenForm.append('sessionId', login.sessionId);
    kitchenForm.append('title', 'Cloudinary smoke test');
    kitchenForm.append('images', imageFile(), 'kitchen.png');
    const kitchen = await request('/kitchen', { method: 'POST', body: kitchenForm });
    assertCloudinaryUrl(kitchen.images[0], 'Kitchen upload');

    await request(`/posts/${post.postId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: login.sessionId })
    });
    await request(`/kitchen/${kitchen.itemId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: login.sessionId })
    });

    console.log('Avatar, post, and kitchen Cloudinary uploads passed');
  } finally {
    server.kill();
    await cleanup();
  }
}

run().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
