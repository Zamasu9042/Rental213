-- Seed rentals for demo scenarios.
-- Renters: 1001 (renter@test.com), 1004 (renter2check@gmail.com)
-- Owner: 1002 — Equipment 1–3
--
-- Equipment: 1=DJI Drone Mini, 2=Bosch Power Drill, 3=Sony Mirrorless Camera (all owned by 1002)

USE rental_db;

INSERT IGNORE INTO rental
  (id, renter_id, equipment_id, start_time, end_time, status, return_timestamp, hourly_rate, pickup_location)
VALUES
  -- RETURNED: Drone rented and returned (scenario 3: owner can file damage claim)
  (1, 1001, 1, '2026-03-20 09:00:00', '2026-03-20 17:00:00', 'RETURNED', '2026-03-20 18:45:00', 12.50, 'SMU / Bras Basah'),
  -- COMPLETED: Drill rental fully closed
  (2, 1001, 2, '2026-03-25 10:00:00', '2026-03-25 18:00:00', 'COMPLETED', '2026-03-25 17:30:00', 6.00, 'Singapore Central'),
  -- ACTIVE: Camera currently being rented (scenario 1: active rental)
  (3, 1001, 3, '2026-04-05 08:00:00', '2026-04-08 18:00:00', 'ACTIVE', NULL, 18.00, 'Singapore East'),
  -- LATE: Drone second rental, overdue (scenario 1: blocks renter browsing)
  (4, 1001, 1, '2026-04-03 09:00:00', '2026-04-05 17:00:00', 'LATE', '2026-04-06 10:00:00', 12.50, 'SMU / Bras Basah'),
  -- PENDING: Drill second rental, awaiting payment (blocks renter from browsing)
  (5, 1001, 2, '2026-04-06 09:00:00', '2026-04-07 18:00:00', 'PENDING', NULL, 6.00, 'Singapore Central'),
  -- ACTIVE: second renter + same owner (equipment 1 — no other ACTIVE on this item in seed)
  (6, 1004, 1, '2026-04-06 08:00:00', '2026-04-15 18:00:00', 'ACTIVE', NULL, 12.50, 'SMU / Bras Basah');
