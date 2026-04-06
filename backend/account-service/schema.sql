-- Account microservice — database: account_db
-- Docker Compose: account-db on host port 3310, user account / account_pass
-- Mounted into MySQL init on first volume create (see compose.yaml).

USE account_db;

CREATE TABLE IF NOT EXISTS account (
  id INT AUTO_INCREMENT PRIMARY KEY,
  account_id INT NOT NULL UNIQUE,
  account_name VARCHAR(255) NOT NULL,
  phone_no VARCHAR(64) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  KEY ix_account_account_id (account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Passwords are bcrypt hashes of 'password123'
INSERT IGNORE INTO account (account_id, account_name, phone_no, email, password_hash) VALUES
(1001, 'Demo Renter', '+65-9000-1001', 'renter@test.com', '$2b$12$9ZKY1VHQ/hJbhGUyRx7eMufCLFiioUJSAd2QQd3qGO9HgU4isW0jm'),
(1002, 'Demo Owner', '+65-9000-1002', 'owner@test.com',  '$2b$12$9ZKY1VHQ/hJbhGUyRx7eMufCLFiioUJSAd2QQd3qGO9HgU4isW0jm');
