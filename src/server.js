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

app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});