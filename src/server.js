const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// =======================
// Basic Middleware
// =======================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 让前端可以访问 uploads 里的图片
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 如果 uploads 文件夹不存在，自动创建
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// =======================
// MySQL Connection
// =======================

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '123456', // 请确认你的密码
  database: 'forum_db'
});

db.connect((err) => {
  if (err) {
    console.error('MySQL connection failed:', err);
    return;
  }
  console.log('Connected to MySQL forum_db');
});

// =======================
// Multer Upload Config
// =======================

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + ext;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'));
  }
};

const upload = multer({
  storage,
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
    `SELECT users.id, users.username, users.avatar FROM sessions JOIN users ON sessions.user_id = users.id WHERE sessions.session_id = ?`,
    [sessionId],
    (err, results) => {
      if (err) return callback(err);
      if (results.length === 0) return callback(null, null);
      callback(null, results[0]);
    }
  );
}

function deleteUploadedFiles(files) {
  if (!files || files.length === 0) return;
  files.forEach(file => {
    fs.unlink(file.path, (err) => {
      if (err) console.warn('Failed to delete file:', file.path);
    });
  });
}

// =======================
// Routes
// =======================

app.get('/', (req, res) => {
  res.send('Forum backend is running');
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
        avatar: user.avatar
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
    res.json({ userId: user.id, username: user.username, avatar: user.avatar });
  });
});

app.post('/me/avatar', upload.single('avatar'), (req, res) => {
  const { sessionId } = req.body;
  getUserBySession(sessionId, (err, user) => {
    if (err) {
      if (req.file) deleteUploadedFiles([req.file]);
      return res.status(500).json({ message: 'Failed to upload avatar' });
    }
    if (!user) {
      if (req.file) deleteUploadedFiles([req.file]);
      return res.status(401).json({ message: 'Invalid session' });
    }
    if (!req.file) return res.status(400).json({ message: 'Avatar image required' });

    const avatarPath = `/uploads/${req.file.filename}`;
    if (user.avatar) {
      const oldAvatarPath = path.join(__dirname, user.avatar);
      fs.unlink(oldAvatarPath, () => {});
    }

    db.query('UPDATE users SET avatar = ? WHERE id = ?', [avatarPath, user.id], (err2) => {
      if (err2) {
        deleteUploadedFiles([req.file]);
        return res.status(500).json({ message: 'Failed to save avatar' });
      }
      res.json({ message: 'Avatar updated', avatar: avatarPath });
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
    deleteUploadedFiles(req.files);
    return res.status(400).json({ message: 'Missing fields' });
  }

  getUserBySession(sessionId, (err, user) => {
    if (err) {
      deleteUploadedFiles(req.files);
      return res.status(500).json({ message: 'Failed to create post' });
    }
    if (!user) {
      deleteUploadedFiles(req.files);
      return res.status(401).json({ message: 'Invalid session' });
    }

    const imagePaths = req.files.map(file => `/uploads/${file.filename}`);
    db.query(
      'INSERT INTO posts (user_id, title, content, images) VALUES (?, ?, ?, ?)',
      [user.id, title, content, JSON.stringify(imagePaths)],
      (err2, result) => {
        if (err2) {
          deleteUploadedFiles(req.files);
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
    deleteUploadedFiles(req.files);
    return res.status(400).json({ message: 'Missing fields' });
  }

  getUserBySession(sessionId, (err, user) => {
    if (err) {
      deleteUploadedFiles(req.files);
      return res.status(500).json({ message: 'Failed to edit post' });
    }
    if (!user) {
      deleteUploadedFiles(req.files);
      return res.status(401).json({ message: 'Invalid session' });
    }

    db.query('SELECT * FROM posts WHERE id = ?', [postId], (err2, results) => {
      if (err2) {
        deleteUploadedFiles(req.files);
        return res.status(500).json({ message: 'Failed to find post' });
      }
      if (results.length === 0) {
        deleteUploadedFiles(req.files);
        return res.status(404).json({ message: 'Post not found' });
      }
      const post = results[0];
      if (Number(post.user_id) !== Number(user.id)) {
        deleteUploadedFiles(req.files);
        return res.status(403).json({ message: 'You can only edit your own post' });
      }

      let newImages = post.images || '[]';
      if (req.files && req.files.length > 0) {
        const imagePaths = req.files.map(file => `/uploads/${file.filename}`);
        newImages = JSON.stringify(imagePaths);
      }

      db.query('UPDATE posts SET title = ?, content = ?, images = ? WHERE id = ?', [title, content, newImages, postId], (err3) => {
        if (err3) return res.status(500).json({ message: 'Failed to update post' });
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
      if (Number(post.user_id) !== Number(user.id)) return res.status(403).json({ message: 'You can only delete your own post' });

      db.query('DELETE FROM posts WHERE id = ?', [postId], (err3) => {
        if (err3) return res.status(500).json({ message: 'Failed to delete post' });
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
      if (Number(comment.user_id) !== Number(user.id)) return res.status(403).json({ message: 'You can only delete your own comment' });

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
    deleteUploadedFiles(req.files);
    return res.status(400).json({ message: 'Title required' });
  }

  getUserBySession(sessionId, (err, user) => {
    if (err) {
      deleteUploadedFiles(req.files);
      return res.status(500).json({ message: 'Failed to create kitchen item' });
    }
    if (!user) {
      deleteUploadedFiles(req.files);
      return res.status(401).json({ message: 'Invalid session' });
    }

    const imagePaths = req.files.map(file => `/uploads/${file.filename}`);
    db.query(
      'INSERT INTO kitchen (user_id, title, link, images) VALUES (?, ?, ?, ?)',
      [user.id, title, link || '', JSON.stringify(imagePaths)],
      (err2, result) => {
        if (err2) {
          deleteUploadedFiles(req.files);
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

      db.query('DELETE FROM kitchen WHERE id = ?', [itemId], (err3) => {
        if (err3) return res.status(500).json({ message: 'Failed to delete kitchen item' });
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

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});