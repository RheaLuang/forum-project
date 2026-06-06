const db = require('./db');

db.query(
  'SELECT DATABASE() AS database_name, VERSION() AS mysql_version',
  (err, rows) => {
    if (err) {
      console.error('Database connection failed:', err.message);
      process.exitCode = 1;
    } else {
      console.log('Database connection successful');
      console.table(rows);
    }

    db.end();
  }
);
