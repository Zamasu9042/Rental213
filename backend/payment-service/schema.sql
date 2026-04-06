CREATE TABLE IF NOT EXISTS payment (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rental_id INT NOT NULL,
  renter_id INT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  type VARCHAR(32) NOT NULL COMMENT 'rental | late',
  status VARCHAR(32) NOT NULL COMMENT 'paying | unpaid | paid | failed',
  item_name VARCHAR(512) NULL,
  stripe_session_id VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_payment_rental (rental_id),
  INDEX idx_payment_renter (renter_id),
  INDEX idx_payment_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
