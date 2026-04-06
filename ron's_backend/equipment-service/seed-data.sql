-- User Scenario 1 — browse available equipment, then create rental (owner listed via account 1002).
-- Matches account-service seed: 1001 = renter, 1002 = owner listing items.
-- Stable ids 1–3 so the React catalog and rental form can reference equipment by number.

USE equipment_db;

INSERT IGNORE INTO equipment
  (id, owner_id, item_name, category, status, hourly_rate, pickup_location)
VALUES
  (1, 1002, 'DJI Drone Mini', 'Drone', 'available', 12.50, 'SMU / Bras Basah'),
  (2, 1002, 'Bosch Power Drill', 'Tools', 'available', 6.00, 'Singapore Central'),
  (3, 1002, 'Sony Mirrorless Camera', 'Camera', 'under_repair', 18.00, 'Singapore East');
