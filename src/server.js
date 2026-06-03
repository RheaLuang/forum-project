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

app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});