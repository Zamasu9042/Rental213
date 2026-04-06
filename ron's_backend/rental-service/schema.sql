-- Rental microservice — database: rental_db
-- Docker Compose: rental-db on host port 3308, user rental / rental_pass

USE rental_db;

CREATE TABLE IF NOT EXISTS rental (
  id INT AUTO_INCREMENT PRIMARY KEY,
  renter_id INT NOT NULL,
  equipment_id INT NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  status VARCHAR(64) NOT NULL COMMENT 'PENDING | ACTIVE | LATE | RETURNED | COMPLETED',
  return_timestamp DATETIME NULL,
  hourly_rate DECIMAL(10, 2) NOT NULL,
  pickup_location VARCHAR(512) NOT NULL,
  KEY ix_rental_renter_id (renter_id),
  KEY ix_rental_equipment_id (equipment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
