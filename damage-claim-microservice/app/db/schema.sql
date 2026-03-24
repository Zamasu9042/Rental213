-- damage_claims database schema
-- Run once to set up tables from scratch

CREATE TABLE IF NOT EXISTS items (
    id          INTEGER PRIMARY KEY,
    name        VARCHAR NOT NULL,
    category    VARCHAR NOT NULL,
    cost        FLOAT   NOT NULL,
    description VARCHAR
);

CREATE TABLE IF NOT EXISTS claims (
    id                 TEXT    PRIMARY KEY,
    item_id            INTEGER NOT NULL,
    rental_id          INTEGER,
    photoURL           VARCHAR,        
    damage_type        VARCHAR,
    confidence         FLOAT,
    severity           VARCHAR NOT NULL,
    estimated_cost     FLOAT,
    status             VARCHAR DEFAULT 'PENDING',
    summary            VARCHAR,
    total_issues_found INTEGER DEFAULT 0,
    FOREIGN KEY (item_id) REFERENCES items(id)
);

-- Seed some sample items for testing
INSERT OR IGNORE INTO items (id, name, category, cost, description) VALUES
    (1, 'Mountain Bike',   'Sports',      850.00, '21-speed aluminium frame'),
    (2, 'DSLR Camera',     'Electronics', 1200.00,'Full-frame mirrorless kit'),
    (3, 'Camping Tent',    'Outdoors',    320.00, '4-person waterproof tent'),
    (4, 'Electric Scooter','Transport',   600.00, '25km/h max speed');