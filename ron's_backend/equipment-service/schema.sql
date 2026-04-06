-- Equipment microservice — database: equipment_db
-- Docker Compose: equipment-db on host port 3307, user equipment / equipment_pass
-- User Scenario 1: UI lists available rows; seed-data.sql adds demo listings (owner_id 1002).

USE equipment_db;

CREATE TABLE IF NOT EXISTS equipment (
  id INT AUTO_INCREMENT PRIMARY KEY,
  owner_id INT NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  category VARCHAR(128) NOT NULL,
  status VARCHAR(64) NOT NULL DEFAULT 'available',
  hourly_rate DECIMAL(10, 2) NOT NULL,
  pickup_location VARCHAR(512) NOT NULL,
  KEY ix_equipment_owner_id (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
