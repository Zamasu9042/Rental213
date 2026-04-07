-- Damage Claim microservice — database: damage_claims_db

USE damage_claims_db;

CREATE TABLE IF NOT EXISTS damage_claims (
  id              INT AUTO_INCREMENT PRIMARY KEY COMMENT 'claimID',
  rental_id       INT NOT NULL               COMMENT 'rentalID',
  equipment_id    INT NULL                   COMMENT 'cached from rental for Camunda',
  renter_id       INT NULL                   COMMENT 'cached from rental for Camunda',
  photo_url       VARCHAR(1024) NULL         COMMENT 'photoURL',
  damage_type     VARCHAR(255) NULL          COMMENT 'damageType from Vision API',
  confidence      DECIMAL(10, 6) NULL        COMMENT 'confidence 0–1',
  severity        VARCHAR(64) NULL           COMMENT 'low | medium | high',
  status          VARCHAR(64) NOT NULL       COMMENT 'DRAFT | PENDING_STAFF_REVIEW | PENDING_OWNER_AMOUNT | PENDING_STAFF_APPROVAL | AMOUNT_REJECTED | APPROVED | REJECTED',
  damage_amount   DECIMAL(10, 2) NULL        COMMENT 'amount entered by owner',
  analysis_json   JSON NULL                  COMMENT 'raw Vision API payload',
  created_at      DATETIME(6) NOT NULL,
  analyzed_at     DATETIME(6) NULL,
  KEY ix_damage_claims_rental_id (rental_id),
  KEY ix_damage_claims_status    (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;