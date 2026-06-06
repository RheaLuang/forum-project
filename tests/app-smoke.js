require('dotenv').config();

const { spawn } = require('child_process');

const port = 3102;
const baseUrl = `http://127.0.0.1:${port}`;

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

async function run() {
  const server = spawn(process.execPath, ['src/server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    await waitForServer(server);

    const page = await fetch(`${baseUrl}/`);
    const html = await page.text();
    if (!page.ok || !html.includes('<title>')) {
      throw new Error('Frontend was not served from the backend');
    }

    const config = await fetch(`${baseUrl}/config.js`);
    if (!config.ok) throw new Error('Frontend config.js was not served');

    const health = await fetch(`${baseUrl}/health`).then(response => response.json());
    if (health.status !== 'ok') throw new Error('Backend health check failed');

    const posts = await fetch(`${baseUrl}/posts`).then(response => response.json());
    if (!Array.isArray(posts)) throw new Error('Posts API did not return an array');

    console.log(`Frontend and backend integration passed (${posts.length} post(s))`);
  } finally {
    server.kill();
  }
}

run().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
