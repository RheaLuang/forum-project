ALTER TABLE users
  ADD COLUMN role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  ADD COLUMN is_banned TINYINT(1) NOT NULL DEFAULT 0;

UPDATE users
SET role = 'admin', is_banned = 0
WHERE LOWER(username) = 'rhea';
