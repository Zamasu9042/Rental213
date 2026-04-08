-- Damage Claim microservice — database: damage_claims_db
-- Docker Compose: damage-db on host port 3311, user damage / damage_pass

USE damage_claims_db;

CREATE TABLE IF NOT EXISTS damage_claims (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT 'claimID',
  rental_id INT NOT NULL COMMENT 'rentalID',
  equipment_id INT NULL COMMENT 'equipmentID (cached from rental)',
  renter_id INT NULL COMMENT 'renterID (cached from rental)',
  photo_url VARCHAR(1024) NULL COMMENT 'photoURL',
  damage_type VARCHAR(255) NULL COMMENT 'damageType',
  confidence DECIMAL(10, 6) NULL COMMENT 'confidence (e.g. 0–1)',
  severity VARCHAR(64) NULL COMMENT 'severity',
  status VARCHAR(64) NOT NULL COMMENT 'DRAFT|PENDING_STAFF_REVIEW|PENDING_OWNER_AMOUNT|PENDING_STAFF_APPROVAL|AMOUNT_REJECTED|APPROVED|REJECTED',
  damage_amount DECIMAL(10, 2) NULL COMMENT 'damage amount claimed by owner (SGD)',
  analysis_json JSON NULL COMMENT 'raw vision / analysis payload',
  created_at DATETIME(6) NOT NULL,
  analyzed_at DATETIME(6) NULL,
  KEY ix_damage_claims_rental_id (rental_id),
  KEY ix_damage_claims_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
