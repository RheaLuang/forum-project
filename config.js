window.FORUM_CONFIG = {
  API_URL: window.location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:3000'
    : 'https://forum-project-q7xt.onrender.com'
};
