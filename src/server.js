require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v2: cloudinary } = require('cloudinary');
const db = require('../db/db');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, '..');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// =======================
// Basic Middleware
// =======================

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
  : null;

app.use(cors({
  origin: allowedOrigins || true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir, {
  index: false,
  dotfiles: 'ignore'
}));

// 让前端可以访问 uploads 里的图片
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 如果 uploads 文件夹不存在，自动创建
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// =======================
// Multer Upload Config
// =======================

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'));
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

// =======================
// Helper Functions
// =======================

function generateSessionId() {
  return 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2);
}

function getUserBySession(sessionId, callback) {
  if (!sessionId) {
    return callback(null, null);
  }
  db.query(
    `SELECT users.id, users.username, users.avatar, users.role, users.is_banned
     FROM sessions
     JOIN users ON sessions.user_id = users.id
     WHERE sessions.session_id = ?`,
    [sessionId],
    (err, results) => {
      if (err) return callback(err);
      if (results.length === 0) return callback(null, null);
      if (results[0].is_banned) return callback(null, null);
      callback(null, results[0]);
    }
  );
}

function uploadImage(file, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `forum-project/${folder}`, resource_type: 'image' },
      (err, result) => {
        if (err) return reject(err);
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );

    stream.end(file.buffer);
  });
}

function requireAdmin(req, res, callback) {
  getUserBySession(req.body.sessionId, (err, user) => {
    if (err) return res.status(500).json({ message: 'Failed to verify administrator' });
    if (!user) return res.status(401).json({ message: 'Invalid session' });
    if (user.role !== 'admin') return res.status(403).json({ message: 'Administrator access required' });
    callback(user);
  });
}

async function uploadImages(files, folder) {
  const uploaded = [];
  try {
    for (const file of files || []) {
      uploaded.push(await uploadImage(file, folder));
    }
    return uploaded;
  } catch (err) {
    await deleteCloudinaryImages(uploaded.map(image => image.url));
    throw err;
  }
}

function getCloudinaryPublicId(url) {
  if (!url || !url.includes('res.cloudinary.com')) return null;
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z0-9]+(?:\?.*)?$/i);
  return match ? decodeURIComponent(match[1]) : null;
}

async function deleteCloudinaryImages(urls) {
  const publicIds = (urls || []).map(getCloudinaryPublicId).filter(Boolean);
  await Promise.all(publicIds.map(publicId =>
    cloudinary.uploader.destroy(publicId).catch(err => {
      console.warn('Failed to delete Cloudinary image:', publicId, err.message);
    })
  ));
}

function parseImages(value) {
  try {
    return value ? JSON.parse(value) : [];
  } catch (err) {
    return [];
  }
}

// =======================
// Routes
// =======================

app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/health', (req, res) => {
  db.query('SELECT 1 AS healthy', (err) => {
    if (err) {
      console.error('Health check failed:', err);
      return res.status(503).json({ status: 'unhealthy' });
    }
    res.json({ status: 'ok' });
  });
});

// --- Auth ---

app.post('/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ message: 'Username and password required' });

  db.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, password], (err, result) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Username already exists' });
      console.error(err);
      return res.status(500).json({ message: 'Register failed' });
    }
    res.json({ message: 'Registered successfully' });
  });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ message: 'Username and password required' });

  db.query('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Login failed' });
    }
    if (results.length === 0) return res.status(401).json({ message: 'Invalid username or password' });

    const user = results[0];
    if (user.is_banned) return res.status(403).json({ message: 'This account has been banned' });
    const sessionId = generateSessionId();

    db.query('INSERT INTO sessions (session_id, user_id) VALUES (?, ?)', [sessionId, user.id], (err2) => {
      if (err2) {
        console.error(err2);
        return res.status(500).json({ message: 'Failed to create session' });
      }
      res.json({
        message: 'Login successful',
        sessionId,
        userId: user.id,
        username: user.username,
        avatar: user.avatar,
        role: user.role
      });
    });
  });
});

app.post('/me', (req, res) => {
  const { sessionId } = req.body;
  getUserBySession(sessionId, (err, user) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Failed to get user' });
    }
    if (!user) return res.status(401).json({ message: 'Invalid session' });
    res.json({ userId: user.id, username: user.username, avatar: user.avatar, role: user.role });
  });
});

app.post('/admin/users', (req, res) => {
  requireAdmin(req, res, () => {
    db.query(
      `SELECT users.id, users.username, users.avatar, users.role, users.is_banned, users.created_at,
              (SELECT COUNT(*) FROM posts WHERE posts.user_id = users.id) AS post_count,
              (SELECT COUNT(*) FROM comments WHERE comments.user_id = users.id) AS comment_count
       FROM users
       ORDER BY users.created_at DESC`,
      (err, results) => {
        if (err) return res.status(500).json({ message: 'Failed to load users' });
        res.json(results);
      }
    );
  });
});

app.put('/admin/users/:id/ban', (req, res) => {
  requireAdmin(req, res, (admin) => {
    const userId = Number(req.params.id);
    if (userId === Number(admin.id)) return res.status(400).json({ message: 'You cannot ban your own account' });

    db.query('SELECT id, role FROM users WHERE id = ?', [userId], (err, results) => {
      if (err) return res.status(500).json({ message: 'Failed to find user' });
      if (results.length === 0) return res.status(404).json({ message: 'User not found' });
      if (results[0].role === 'admin') return res.status(403).json({ message: 'Administrator accounts cannot be banned' });

      db.query('UPDATE users SET is_banned = 1 WHERE id = ?', [userId], (err2) => {
        if (err2) return res.status(500).json({ message: 'Failed to ban user' });
        db.query('DELETE FROM sessions WHERE user_id = ?', [userId], (err3) => {
          if (err3) return res.status(500).json({ message: 'User was banned, but sessions could not be cleared' });
          res.json({ message: 'User banned' });
        });
      });
    });
  });
});

app.put('/admin/users/:id/unban', (req, res) => {
  requireAdmin(req, res, () => {
    const userId = Number(req.params.id);
    db.query('UPDATE users SET is_banned = 0 WHERE id = ?', [userId], (err, result) => {
      if (err) return res.status(500).json({ message: 'Failed to unban user' });
      if (result.affectedRows === 0) return res.status(404).json({ message: 'User not found' });
      res.json({ message: 'User unbanned' });
    });
  });
});

app.post('/me/avatar', upload.single('avatar'), (req, res) => {
  const { sessionId } = req.body;
  getUserBySession(sessionId, async (err, user) => {
    if (err) {
      return res.status(500).json({ message: 'Failed to upload avatar' });
    }
    if (!user) {
      return res.status(401).json({ message: 'Invalid session' });
    }
    if (!req.file) return res.status(400).json({ message: 'Avatar image required' });

    let uploaded;
    try {
      [uploaded] = await uploadImages([req.file], 'avatars');
    } catch (uploadErr) {
      console.error('Cloudinary avatar upload failed:', uploadErr);
      return res.status(502).json({ message: 'Failed to upload avatar image' });
    }

    db.query('UPDATE users SET avatar = ? WHERE id = ?', [uploaded.url, user.id], async (err2) => {
      if (err2) {
        await deleteCloudinaryImages([uploaded.url]);
        return res.status(500).json({ message: 'Failed to save avatar' });
      }
      await deleteCloudinaryImages([user.avatar]);
      res.json({ message: 'Avatar updated', avatar: uploaded.url });
    });
  });
});

// --- Posts ---

app.get('/posts', (req, res) => {
  // 【修改点】增加了 users.avatar 的查询
  db.query(
    `SELECT posts.id, posts.user_id, posts.title, posts.content, posts.images, posts.created_at, users.username, users.avatar 
     FROM posts 
     JOIN users ON posts.user_id = users.id 
     ORDER BY posts.created_at DESC`,
    (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Failed to load posts' });
      }
      res.json(results);
    }
  );
});

app.post('/posts', upload.array('images', 3), (req, res) => {
  const { sessionId, title, content } = req.body;
  if (!sessionId || !title || !content) {
    return res.status(400).json({ message: 'Missing fields' });
  }

  getUserBySession(sessionId, async (err, user) => {
    if (err) {
      return res.status(500).json({ message: 'Failed to create post' });
    }
    if (!user) {
      return res.status(401).json({ message: 'Invalid session' });
    }

    let uploadedImages;
    try {
      uploadedImages = await uploadImages(req.files, 'posts');
    } catch (uploadErr) {
      console.error('Cloudinary post upload failed:', uploadErr);
      return res.status(502).json({ message: 'Failed to upload post images' });
    }

    const imagePaths = uploadedImages.map(image => image.url);
    db.query(
      'INSERT INTO posts (user_id, title, content, images) VALUES (?, ?, ?, ?)',
      [user.id, title, content, JSON.stringify(imagePaths)],
      async (err2, result) => {
        if (err2) {
          await deleteCloudinaryImages(imagePaths);
          return res.status(500).json({ message: 'Failed to create post' });
        }
        res.json({ message: 'Post created', postId: result.insertId, images: imagePaths });
      }
    );
  });
});

app.put('/posts/:id', upload.array('images', 3), (req, res) => {
  const postId = req.params.id;
  const { sessionId, title, content } = req.body;
  if (!sessionId || !title || !content) {
    return res.status(400).json({ message: 'Missing fields' });
  }

  getUserBySession(sessionId, (err, user) => {
    if (err) {
      return res.status(500).json({ message: 'Failed to edit post' });
    }
    if (!user) {
      return res.status(401).json({ message: 'Invalid session' });
    }

    db.query('SELECT * FROM posts WHERE id = ?', [postId], async (err2, results) => {
      if (err2) {
        return res.status(500).json({ message: 'Failed to find post' });
      }
      if (results.length === 0) {
        return res.status(404).json({ message: 'Post not found' });
      }
      const post = results[0];
      if (Number(post.user_id) !== Number(user.id)) {
        return res.status(403).json({ message: 'You can only edit your own post' });
      }

      let newImages = post.images || '[]';
      let newImageUrls = [];
      const oldImageUrls = parseImages(post.images);
      if (req.files && req.files.length > 0) {
        try {
          const uploadedImages = await uploadImages(req.files, 'posts');
          newImageUrls = uploadedImages.map(image => image.url);
          newImages = JSON.stringify(newImageUrls);
        } catch (uploadErr) {
          console.error('Cloudinary post upload failed:', uploadErr);
          return res.status(502).json({ message: 'Failed to upload post images' });
        }
      }

      db.query('UPDATE posts SET title = ?, content = ?, images = ? WHERE id = ?', [title, content, newImages, postId], async (err3) => {
        if (err3) {
          await deleteCloudinaryImages(newImageUrls);
          return res.status(500).json({ message: 'Failed to update post' });
        }
        if (newImageUrls.length > 0) await deleteCloudinaryImages(oldImageUrls);
        res.json({ message: 'Post updated' });
      });
    });
  });
});

app.delete('/posts/:id', (req, res) => {
  const postId = req.params.id;
  const { sessionId } = req.body;
  getUserBySession(sessionId, (err, user) => {
    if (err) return res.status(500).json({ message: 'Failed to delete post' });
    if (!user) return res.status(401).json({ message: 'Invalid session' });

    db.query('SELECT * FROM posts WHERE id = ?', [postId], (err2, results) => {
      if (err2) return res.status(500).json({ message: 'Failed to find post' });
      if (results.length === 0) return res.status(404).json({ message: 'Post not found' });
      
      const post = results[0];
      if (Number(post.user_id) !== Number(user.id) && user.role !== 'admin') {
        return res.status(403).json({ message: 'You can only delete your own post' });
      }

      db.query('DELETE FROM posts WHERE id = ?', [postId], async (err3) => {
        if (err3) return res.status(500).json({ message: 'Failed to delete post' });
        await deleteCloudinaryImages(parseImages(post.images));
        res.json({ message: 'Post deleted' });
      });
    });
  });
});

// --- Likes ---

app.get('/posts/:id/likes', (req, res) => {
  const postId = req.params.id;
  db.query('SELECT COUNT(*) AS count FROM likes WHERE post_id = ?', [postId], (err, results) => {
    if (err) return res.status(500).json({ message: 'Failed to get likes' });
    res.json({ count: results[0].count });
  });
});

app.post('/posts/:id/like', (req, res) => {
  const postId = req.params.id;
  const { sessionId } = req.body;
  getUserBySession(sessionId, (err, user) => {
    if (err) return res.status(500).json({ message: 'Failed to like post' });
    if (!user) return res.status(401).json({ message: 'Invalid session' });

    db.query('INSERT INTO likes (post_id, user_id) VALUES (?, ?)', [postId, user.id], (err2) => {
      if (err2) {
        if (err2.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Already liked' });
        return res.status(500).json({ message: 'Failed to like post' });
      }
      res.json({ message: 'Liked' });
    });
  });
});

app.delete('/posts/:id/like', (req, res) => {
  const postId = req.params.id;
  const { sessionId } = req.body;
  getUserBySession(sessionId, (err, user) => {
    if (err) return res.status(500).json({ message: 'Failed to unlike post' });
    if (!user) return res.status(401).json({ message: 'Invalid session' });

    db.query('DELETE FROM likes WHERE post_id = ? AND user_id = ?', [postId, user.id], (err2) => {
      if (err2) return res.status(500).json({ message: 'Failed to unlike post' });
      res.json({ message: 'Unliked' });
    });
  });
});

// --- Comments ---

app.get('/posts/:id/comments', (req, res) => {
  const postId = req.params.id;
  db.query(
    `SELECT comments.*, users.username FROM comments JOIN users ON comments.user_id = users.id WHERE comments.post_id = ? ORDER BY comments.created_at ASC`,
    [postId],
    (err, results) => {
      if (err) return res.status(500).json({ message: 'Failed to load comments' });
      res.json(results);
    }
  );
});

app.post('/comments', (req, res) => {
  const { sessionId, postId, content } = req.body;
  if (!sessionId || !postId || !content) return res.status(400).json({ message: 'Missing fields' });

  getUserBySession(sessionId, (err, user) => {
    if (err) return res.status(500).json({ message: 'Failed to comment' });
    if (!user) return res.status(401).json({ message: 'Invalid session' });

    db.query('INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)', [postId, user.id, content], (err2, result) => {
      if (err2) return res.status(500).json({ message: 'Failed to add comment' });
      res.json({ message: 'Comment added', commentId: result.insertId });
    });
  });
});

app.delete('/comments/:id', (req, res) => {
  const commentId = req.params.id;
  const { sessionId } = req.body;
  getUserBySession(sessionId, (err, user) => {
    if (err) return res.status(500).json({ message: 'Failed to delete comment' });
    if (!user) return res.status(401).json({ message: 'Invalid session' });

    db.query('SELECT * FROM comments WHERE id = ?', [commentId], (err2, results) => {
      if (err2) return res.status(500).json({ message: 'Failed to find comment' });
      if (results.length === 0) return res.status(404).json({ message: 'Comment not found' });
      
      const comment = results[0];
      if (Number(comment.user_id) !== Number(user.id) && user.role !== 'admin') {
        return res.status(403).json({ message: 'You can only delete your own comment' });
      }

      db.query('DELETE FROM comments WHERE id = ?', [commentId], (err3) => {
        if (err3) return res.status(500).json({ message: 'Failed to delete comment' });
        res.json({ message: 'Comment deleted' });
      });
    });
  });
});

// --- Kitchen ---

app.get('/kitchen', (req, res) => {
  db.query(
    `SELECT kitchen.*, users.username FROM kitchen JOIN users ON kitchen.user_id = users.id ORDER BY kitchen.created_at DESC`,
    (err, results) => {
      if (err) return res.status(500).json({ message: 'Failed to load kitchen' });
      const formatted = results.map(item => {
        let images = [];
        try { images = item.images ? JSON.parse(item.images) : []; } catch (e) { images = []; }
        return { ...item, images };
      });
      res.json(formatted);
    }
  );
});

app.post('/kitchen', upload.array('images', 10), (req, res) => {
  const { sessionId, title, link } = req.body;
  if (!sessionId || !title) {
    return res.status(400).json({ message: 'Title required' });
  }

  getUserBySession(sessionId, async (err, user) => {
    if (err) {
      return res.status(500).json({ message: 'Failed to create kitchen item' });
    }
    if (!user) {
      return res.status(401).json({ message: 'Invalid session' });
    }

    let uploadedImages;
    try {
      uploadedImages = await uploadImages(req.files, 'kitchen');
    } catch (uploadErr) {
      console.error('Cloudinary kitchen upload failed:', uploadErr);
      return res.status(502).json({ message: 'Failed to upload kitchen images' });
    }

    const imagePaths = uploadedImages.map(image => image.url);
    db.query(
      'INSERT INTO kitchen (user_id, title, link, images) VALUES (?, ?, ?, ?)',
      [user.id, title, link || '', JSON.stringify(imagePaths)],
      async (err2, result) => {
        if (err2) {
          await deleteCloudinaryImages(imagePaths);
          return res.status(500).json({ message: 'Failed to create kitchen item' });
        }
        res.json({ message: 'Kitchen item created', itemId: result.insertId, images: imagePaths });
      }
    );
  });
});

app.delete('/kitchen/:id', (req, res) => {
  const itemId = req.params.id;
  const { sessionId } = req.body;
  getUserBySession(sessionId, (err, user) => {
    if (err) return res.status(500).json({ message: 'Failed to delete kitchen item' });
    if (!user) return res.status(401).json({ message: 'Invalid session' });

    db.query('SELECT * FROM kitchen WHERE id = ?', [itemId], (err2, results) => {
      if (err2) return res.status(500).json({ message: 'Failed to find kitchen item' });
      if (results.length === 0) return res.status(404).json({ message: 'Kitchen item not found' });
      
      const item = results[0];
      if (Number(item.user_id) !== Number(user.id)) return res.status(403).json({ message: 'You can only delete your own kitchen item' });

      db.query('DELETE FROM kitchen WHERE id = ?', [itemId], async (err3) => {
        if (err3) return res.status(500).json({ message: 'Failed to delete kitchen item' });
        await deleteCloudinaryImages(parseImages(item.images));
        res.json({ message: 'Kitchen item deleted' });
      });
    });
  });
});

// --- Error Handler ---
app.use((err, req, res, next) => {
  console.error(err);
  if (err.message === 'Only image files are allowed') return res.status(400).json({ message: 'Only image files are allowed' });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'File too large. Max 5MB' });
  res.status(500).json({ message: 'Server error' });
});

db.getConnection((err, connection) => {
  if (err) {
    console.error('MySQL connection failed:', err);
    process.exit(1);
  }

  connection.release();
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
});
