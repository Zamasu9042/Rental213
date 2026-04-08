-- Rental DB schema (used by MySQL docker-entrypoint-initdb.d)
USE rental_db;

CREATE TABLE IF NOT EXISTS rental (
  id INT AUTO_INCREMENT PRIMARY KEY,
  renter_id INT NOT NULL,
  equipment_id INT NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  status VARCHAR(64) NOT NULL,
  return_timestamp DATETIME NULL,
  hourly_rate DECIMAL(10, 2) NOT NULL,
  pickup_location VARCHAR(512) NOT NULL,
  renter_collected TINYINT(1) NOT NULL DEFAULT 0,
  owner_collected TINYINT(1) NOT NULL DEFAULT 0,
  renter_returned TINYINT(1) NOT NULL DEFAULT 0,
  owner_returned TINYINT(1) NOT NULL DEFAULT 0,
  renter_reviewed TINYINT(1) NOT NULL DEFAULT 0,
  owner_reviewed TINYINT(1) NOT NULL DEFAULT 0,
  INDEX idx_renter (renter_id),
  INDEX idx_equipment (equipment_id)
);
