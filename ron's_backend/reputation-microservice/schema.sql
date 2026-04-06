-- Reputation microservice — database: reputation_db
-- Docker Compose: reputation-db on host port 3309, user reputation / reputation_pass

USE reputation_db;

CREATE TABLE IF NOT EXISTS reputation (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  target_id INT NOT NULL,
  target_type VARCHAR(32) NOT NULL,
  score DECIMAL(6, 2) NOT NULL,
  review_text VARCHAR(1024) NULL,
  rater_id INT NULL,
  rental_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_reputation_user_id (user_id),
  KEY ix_reputation_rater_id (rater_id),
  KEY ix_reputation_rental_id (rental_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
