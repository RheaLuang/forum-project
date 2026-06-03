const express = require('express');
const cors = require('cors');
const db = require('../db/db');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Forum backend is running');
});

app.get('/users', (req, res) => {
  db.query(
    'SELECT * FROM users',
    (err, results) => {
      if (err) {
        return res.status(500).json(err);
      }

      res.json(results);
    }
  );
});

app.get('/posts', (req, res) => {
  db.query(
    'SELECT * FROM posts',
    (err, results) => {
      if (err) {
        return res.status(500).json(err);
      }

      res.json(results);
    }
  );
});

app.get('/posts/:id', (req, res) => {
  const postId = req.params.id;

  db.query(
    'SELECT * FROM posts WHERE id = ?',
    [postId],
    (err, results) => {
      if (err) {
        return res.status(500).json(err);
      }

      if (results.length === 0) {
        return res.status(404).json({
          message: 'Post not found'
        });
      }

      res.json(results[0]);
    }
  );
});

app.post('/posts', (req, res) => {
  const { userId, title, content } = req.body;

  db.query(
    'INSERT INTO posts (user_id, title, content) VALUES (?, ?, ?)',
    [userId, title, content],
    (err, results) => {
      if (err) {
        return res.status(500).json(err);
      }

      res.status(201).json({
        message: 'Post created successfully',
        postId: results.insertId
      });
    }
  );
});    

app.delete('/posts/:id', (req, res) => {
  const postId = req.params.id;

  db.query(
    'DELETE FROM posts WHERE id = ?',
    [postId],
    (err, results) => {
      if (err) {
        return res.status(500).json(err);
      }

      if (results.affectedRows === 0) {
        return res.status(404).json({
          message: 'Post not found'
        });
      }

      res.json({
        message: 'Post deleted successfully'
      });
    }
  );
});

app.put('/posts/:id', (req, res) => {
  const postId = req.params.id;
  const { title, content } = req.body;

  db.query(
    'UPDATE posts SET title = ?, content = ? WHERE id = ?',
    [title, content, postId],
    (err, results) => {
      if (err) {
        return res.status(500).json(err);
      }

      if (results.affectedRows === 0) {
        return res.status(404).json({
          message: 'Post not found'
        });
      }

      res.json({
        message: 'Post updated successfully'
      });
    }
  );
});

app.put('/posts/:id', (req, res) => {
  const postId = req.params.id;
  const { title, content } = req.body;

  db.query(
    'UPDATE posts SET title = ?, content = ? WHERE id = ?',
    [title, content, postId],
    (err, results) => {
      if (err) {
        return res.status(500).json(err);
      }

      if (results.affectedRows === 0) {
        return res.status(404).json({
          message: 'Post not found'
        });
      }

      res.json({
        message: 'Post updated successfully'
      });
    }
  );
});

app.post('/register', (req, res) => {
  const { username, password } = req.body;

  if (!username || username.length > 10) {
    return res.status(400).json({
      message: 'Username must be 1-10 characters'
    });
  }

  if (!password || password.length < 6) {
    return res.status(400).json({
      message: 'Password must be at least 6 characters'
    });
  }

  db.query(
    'SELECT * FROM users WHERE username = ?',
    [username],
    (err, results) => {
      if (err) {
        return res.status(500).json(err);
      }

      if (results.length > 0) {
        return res.status(400).json({
          message: 'Username already exists'
        });
      }

      db.query(
        'INSERT INTO users (username, password) VALUES (?, ?)',
        [username, password],
        (err, results) => {
          if (err) {
            return res.status(500).json(err);
          }

          res.status(201).json({
            message: 'User registered successfully',
            userId: results.insertId
          });
        }
      );
    }
  );
});

app.post('/comments', (req, res) => {
  const { postId, userId, content } = req.body;

  db.query(
    'INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)',
    [postId, userId, content],
    (err, results) => {
      if (err) {
        return res.status(500).json(err);
      }

      res.status(201).json({
        message: 'Comment created successfully',
        commentId: results.insertId
      });
    }
  );
});

app.get('/comments', (req, res) => {
  db.query(
    'SELECT * FROM comments',
    (err, results) => {
      if (err) {
        return res.status(500).json(err);
      }

      res.json(results);
    }
  );
});

app.get('/posts/:id/comments', (req, res) => {
  const postId = req.params.id;

  db.query(
    'SELECT * FROM comments WHERE post_id = ?',
    [postId],
    (err, results) => {
      if (err) {
        return res.status(500).json(err);
      }

      res.json(results);
    }
  );
});

app.delete('/comments/:id', (req, res) => {
  const commentId = req.params.id;

  db.query(
    'DELETE FROM comments WHERE id = ?',
    [commentId],
    (err, results) => {
      if (err) {
        return res.status(500).json(err);
      }

      if (results.affectedRows === 0) {
        return res.status(404).json({
          message: 'Comment not found'
        });
      }

      res.json({
        message: 'Comment deleted successfully'
      });
    }
  );
});

app.post('/register', (req, res) => {
  const { username, password } = req.body;

  // 用户名长度检查
  if (!username || username.length > 10) {
    return res.status(400).json({
      message: 'Username must be 1-10 characters'
    });
  }

  // 密码长度检查
  if (!password || password.length < 6) {
    return res.status(400).json({
      message: 'Password must be at least 6 characters'
    });
  }

  // 检查用户名是否存在
  db.query(
    'SELECT * FROM users WHERE username = ?',
    [username],
    (err, results) => {
      if (err) {
        return res.status(500).json(err);
      }

      if (results.length > 0) {
        return res.status(400).json({
          message: 'Username already exists'
        });
      }

      // 创建用户
      db.query(
        'INSERT INTO users (username, password) VALUES (?, ?)',
        [username, password],
        (err, results) => {
          if (err) {
            return res.status(500).json(err);
          }

          res.status(201).json({
            message: 'User registered successfully',
            userId: results.insertId
          });
        }
      );
    }
  );
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;

  // 1. Validate input
  if (!username || !password) {
    return res.status(400).json({
      message: 'Username and password are required'
    });
  }

  // 2. Query the database for the user
  // Note: In a production environment, you should use hashed passwords (e.g., bcrypt)
  // and only select necessary fields instead of *.
  db.query(
    'SELECT * FROM users WHERE username = ? AND password = ?',
    [username, password],
    (err, results) => {
      if (err) {
        return res.status(500).json(err);
      }

      // 3. Check if user exists
      if (results.length === 0) {
        return res.status(401).json({
          message: 'Invalid username or password'
        });
      }

      const user = results[0];

      // 4. Return user information (excluding sensitive data like password if possible)
      res.json({
        message: 'Login successful',
        userId: user.id,
        username: user.username
      });
    }
  );
});

app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});