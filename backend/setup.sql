-- setup.sql
-- Run this to create all tables needed by the microservices
-- mysql -u root -p rental_db < setup.sql

CREATE DATABASE IF NOT EXISTS rental_db;
USE rental_db;

-- Users / Account Info
CREATE TABLE IF NOT EXISTS users (
    id              VARCHAR(36)  PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    email           VARCHAR(100) NOT NULL UNIQUE,
    phone           VARCHAR(20),
    payment_method  VARCHAR(50)  DEFAULT 'card',
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP
);

-- Equipment
CREATE TABLE IF NOT EXISTS equipment (
    id           VARCHAR(36)  PRIMARY KEY,
    name         VARCHAR(100) NOT NULL,
    description  TEXT,
    category     VARCHAR(50),
    hourly_rate  DECIMAL(10,2) NOT NULL,
    location     VARCHAR(200),
    status       VARCHAR(20)  DEFAULT 'Available',
    owner_id     VARCHAR(36),
    created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP
);

-- Rentals
CREATE TABLE IF NOT EXISTS rentals (
    id                  VARCHAR(36)  PRIMARY KEY,
    renter_id           VARCHAR(36)  NOT NULL,
    equipment_id        VARCHAR(36)  NOT NULL,
    start_time          DATETIME     NOT NULL,
    end_time            DATETIME     NOT NULL,
    hourly_rate         DECIMAL(10,2) NOT NULL,
    pickup_location     VARCHAR(200),
    status              VARCHAR(20)  DEFAULT 'pending',
    stripe_redirect_url TEXT,
    process_instance_key VARCHAR(50),
    created_at          DATETIME     DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (equipment_id) REFERENCES equipment(id)
);

-- Seed data for testing
INSERT IGNORE INTO users (id, name, email, phone, payment_method) VALUES
('user-1', 'John Doe',    'john@example.com',  '+6591234567', 'card'),
('user-2', 'Jane Smith',  'jane@example.com',  '+6598765432', 'card');

INSERT IGNORE INTO equipment (id, name, description, category, hourly_rate, location, status, owner_id) VALUES
('eq-1001', 'DJI Drone Mini',       'Lightweight drone',          'Drone',  12.00, 'Kuala Lumpur', 'Available', 'user-2'),
('eq-1002', 'Bosch Power Drill',    'Cordless drill',             'Tools',   6.00, 'Subang Jaya',  'Available', 'user-2'),
('eq-1003', 'Sony Mirrorless Camera','Camera body only',          'Camera', 18.00, 'Petaling Jaya','Available', 'user-2');
