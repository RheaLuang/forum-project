const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const db = require('../db/db');

const app = express();

app.use(cors());
app.use(express.json());

function getUserBySession(sessionId, callback) {
  db.query(
    'SELECT user_id FROM sessions WHERE session_id = ?',
    [sessionId],
    (err, results) => {
      if (err) return callback(err);

      if (results.length === 0) {
        return callback(null, null);
      }

      callback(null, results[0].user_id);
    }
  );
}

app.get('/', (req, res) => {
  res.send('Forum backend is running');
});

app.get('/users', (req, res) => {
  db.query('SELECT id, username, created_at FROM users', (err, results) => {
    if (err) return res.status(500).json(err);
    res.json(results);
  });
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
      if (err) return res.status(500).json(err);

      if (results.length > 0) {
        return res.status(400).json({
          message: 'Username already exists'
        });
      }

      db.query(
        'INSERT INTO users (username, password) VALUES (?, ?)',
        [username, password],
        (err, results) => {
          if (err) return res.status(500).json(err);

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

  if (!username || !password) {
    return res.status(400).json({
      message: 'Username and password are required'
    });
  }

  db.query(
    'SELECT * FROM users WHERE username = ? AND password = ?',
    [username, password],
    (err, results) => {
      if (err) return res.status(500).json(err);

      if (results.length === 0) {
        return res.status(401).json({
          message: 'Invalid username or password'
        });
      }

      const user = results[0];
      const sessionId = crypto.randomUUID();

      db.query(
        'INSERT INTO sessions (user_id, session_id) VALUES (?, ?)',
        [user.id, sessionId],
        (err) => {
          if (err) return res.status(500).json(err);

          res.json({
            message: 'Login successful',
            userId: user.id,
            username: user.username,
            sessionId
          });
        }
      );
    }
  );
});

app.post('/me', (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({
      message: 'sessionId is required'
    });
  }

  db.query(
    `SELECT users.id, users.username, users.created_at
     FROM sessions
     JOIN users ON sessions.user_id = users.id
     WHERE sessions.session_id = ?`,
    [sessionId],
    (err, results) => {
      if (err) return res.status(500).json(err);

      if (results.length === 0) {
        return res.status(401).json({
          message: 'Invalid session'
        });
      }

      res.json(results[0]);
    }
  );
});

app.get('/posts', (req, res) => {
  db.query(
    `SELECT posts.id, posts.user_id, users.username, posts.title, posts.content, posts.created_at
     FROM posts
     JOIN users ON posts.user_id = users.id
     ORDER BY posts.created_at DESC`,
    (err, results) => {
      if (err) return res.status(500).json(err);
      res.json(results);
    }
  );
});

app.get('/posts/:id', (req, res) => {
  const postId = req.params.id;

  db.query(
    `SELECT posts.id, posts.user_id, users.username, posts.title, posts.content, posts.created_at
     FROM posts
     JOIN users ON posts.user_id = users.id
     WHERE posts.id = ?`,
    [postId],
    (err, results) => {
      if (err) return res.status(500).json(err);

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
  const { sessionId, title, content } = req.body;

  if (!sessionId || !title || !content) {
    return res.status(400).json({
      message: 'sessionId, title and content are required'
    });
  }

  getUserBySession(sessionId, (err, userId) => {
    if (err) return res.status(500).json(err);

    if (!userId) {
      return res.status(401).json({
        message: 'Invalid session'
      });
    }

    db.query(
      'INSERT INTO posts (user_id, title, content) VALUES (?, ?, ?)',
      [userId, title, content],
      (err, results) => {
        if (err) return res.status(500).json(err);

        res.status(201).json({
          message: 'Post created successfully',
          postId: results.insertId
        });
      }
    );
  });
});

app.put('/posts/:id', (req, res) => {
  const postId = req.params.id;
  const { sessionId, title, content } = req.body;

  if (!sessionId || !title || !content) {
    return res.status(400).json({
      message: 'sessionId, title and content are required'
    });
  }

  getUserBySession(sessionId, (err, userId) => {
    if (err) return res.status(500).json(err);

    if (!userId) {
      return res.status(401).json({
        message: 'Invalid session'
      });
    }

    db.query(
      'SELECT * FROM posts WHERE id = ?',
      [postId],
      (err, results) => {
        if (err) return res.status(500).json(err);

        if (results.length === 0) {
          return res.status(404).json({
            message: 'Post not found'
          });
        }

        if (results[0].user_id !== userId) {
          return res.status(403).json({
            message: 'You can only edit your own posts'
          });
        }

        db.query(
          'UPDATE posts SET title = ?, content = ? WHERE id = ?',
          [title, content, postId],
          (err) => {
            if (err) return res.status(500).json(err);

            res.json({
              message: 'Post updated successfully'
            });
          }
        );
      }
    );
  });
});

app.delete('/posts/:id', (req, res) => {
  const postId = req.params.id;
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({
      message: 'sessionId is required'
    });
  }

  getUserBySession(sessionId, (err, userId) => {
    if (err) return res.status(500).json(err);

    if (!userId) {
      return res.status(401).json({
        message: 'Invalid session'
      });
    }

    db.query(
      'SELECT * FROM posts WHERE id = ?',
      [postId],
      (err, results) => {
        if (err) return res.status(500).json(err);

        if (results.length === 0) {
          return res.status(404).json({
            message: 'Post not found'
          });
        }

        if (results[0].user_id !== userId) {
          return res.status(403).json({
            message: 'You can only delete your own posts'
          });
        }

        db.query(
          'DELETE FROM posts WHERE id = ?',
          [postId],
          (err) => {
            if (err) return res.status(500).json(err);

            res.json({
              message: 'Post deleted successfully'
            });
          }
        );
      }
    );
  });
});

app.get('/comments', (req, res) => {
  db.query(
    `SELECT comments.id, comments.post_id, comments.user_id, users.username,
            comments.content, comments.created_at
     FROM comments
     JOIN users ON comments.user_id = users.id
     ORDER BY comments.created_at DESC`,
    (err, results) => {
      if (err) return res.status(500).json(err);
      res.json(results);
    }
  );
});

app.get('/posts/:id/comments', (req, res) => {
  const postId = req.params.id;

  db.query(
    `SELECT comments.id, comments.post_id, comments.user_id, users.username,
            comments.content, comments.created_at
     FROM comments
     JOIN users ON comments.user_id = users.id
     WHERE comments.post_id = ?
     ORDER BY comments.created_at ASC`,
    [postId],
    (err, results) => {
      if (err) return res.status(500).json(err);
      res.json(results);
    }
  );
});

app.post('/comments', (req, res) => {
  const { sessionId, postId, content } = req.body;

  if (!sessionId || !postId || !content) {
    return res.status(400).json({
      message: 'sessionId, postId and content are required'
    });
  }

  getUserBySession(sessionId, (err, userId) => {
    if (err) return res.status(500).json(err);

    if (!userId) {
      return res.status(401).json({
        message: 'Invalid session'
      });
    }

    db.query(
      'INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)',
      [postId, userId, content],
      (err, results) => {
        if (err) return res.status(500).json(err);

        res.status(201).json({
          message: 'Comment created successfully',
          commentId: results.insertId
        });
      }
    );
  });
});

app.delete('/comments/:id', (req, res) => {
  const commentId = req.params.id;
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({
      message: 'sessionId is required'
    });
  }

  getUserBySession(sessionId, (err, userId) => {
    if (err) return res.status(500).json(err);

    if (!userId) {
      return res.status(401).json({
        message: 'Invalid session'
      });
    }

    db.query(
      'SELECT * FROM comments WHERE id = ?',
      [commentId],
      (err, results) => {
        if (err) return res.status(500).json(err);

        if (results.length === 0) {
          return res.status(404).json({
            message: 'Comment not found'
          });
        }

        if (results[0].user_id !== userId) {
          return res.status(403).json({
            message: 'You can only delete your own comments'
          });
        }

        db.query(
          'DELETE FROM comments WHERE id = ?',
          [commentId],
          (err) => {
            if (err) return res.status(500).json(err);

            res.json({
              message: 'Comment deleted successfully'
            });
          }
        );
      }
    );
  });
}); 

app.post('/posts/:id/like', (req, res) => {
  const { sessionId } = req.body;
  const postId = req.params.id;

  getUserBySession(sessionId, (err, userId) => {
    if (err) return res.status(500).json(err);

    if (!userId) {
      return res.status(401).json({
        message: 'Invalid session'
      });
    }

    db.query(
      'INSERT INTO likes (user_id, post_id) VALUES (?, ?)',
      [userId, postId],
      (err) => {
        if (err) {
          return res.status(400).json({
            message: 'Already liked'
          });
        }

        res.json({
          message: 'Liked'
        });
      }
    );
  });
});

app.get('/posts/:id/likes', (req, res) => {
  const postId = req.params.id;

  db.query(
    'SELECT COUNT(*) AS likes FROM likes WHERE post_id = ?',
    [postId],
    (err, results) => {
      if (err) return res.status(500).json(err);

      res.json(results[0]);
    }
  );
});

app.delete('/posts/:id/like', (req, res) => {
  const { sessionId } = req.body;
  const postId = req.params.id;

  getUserBySession(sessionId, (err, userId) => {
    if (err) return res.status(500).json(err);

    if (!userId) {
      return res.status(401).json({
        message: 'Invalid session'
      });
    }

    db.query(
      'DELETE FROM likes WHERE user_id = ? AND post_id = ?',
      [userId, postId],
      (err) => {
        if (err) {
          return res.status(500).json(err);
        }

        res.json({
          message: 'Unliked'
        });
      }
    );
  });
});

app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});