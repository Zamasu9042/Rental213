-- Seed rentals for demo scenarios.
-- Renters: 1001 (renter@test.com), 1004 (renter2check@gmail.com), 1005 (renter3@test.com)
-- Owner:   1002 (owner@test.com)
--
-- Equipment:
--   1 = DJI Drone Mini         ($12.50/hr, available)
--   2 = Bosch Power Drill      ($6.00/hr,  available)
--   3 = Sony Mirrorless Camera ($18.00/hr, under_repair)
--
-- Scenario coverage:
--   Scenario 1 — Rental 3:  renter1, ACTIVE camera rental
--   Scenario 2 — Rental 4:  renter1, LATE drone rental → pay late fee to unblock
--   Scenario 3 — Rental 7:  renter3, COMPLETED drone rental
--                            Owner (1002) files damage claim against renter3
--                            Damage fee (Stripe) charged to renter3 (1005)
--   History    — Rental 2:  renter1, COMPLETED drill
--   Renter 2   — Rental 6:  renter2, COMPLETED drone

USE rental_db;

INSERT IGNORE INTO rental
  (id, renter_id, equipment_id, start_time, end_time, status, return_timestamp, hourly_rate, pickup_location)
VALUES

  -- ── Renter 1 (1001) ───────────────────────────────────────────────────────

  -- Rental 2: COMPLETED — clean history
  (2, 1001, 2, '2026-03-25 10:00:00', '2026-03-25 18:00:00', 'COMPLETED', '2026-03-25 17:30:00', 6.00, 'Singapore Central'),

  -- Rental 3: ACTIVE — camera currently being rented (Scenario 1)
  (3, 1001, 3, '2026-04-05 08:00:00', '2026-04-10 18:00:00', 'ACTIVE', NULL, 18.00, 'Singapore East'),

  -- Rental 4: LATE — Scenario 2 demo
  --           Due 17:00, returned 19:00 = 2hrs late @ $12.50/hr = $25.00 fee
  --           Blocks renter1 from browsing until fee is paid
  (4, 1001, 1, '2026-04-03 09:00:00', '2026-04-05 17:00:00', 'LATE', '2026-04-05 19:00:00', 12.50, 'SMU / Bras Basah'),

  -- ── Renter 2 (1004) ───────────────────────────────────────────────────────

  -- Rental 6: COMPLETED — clean slate for renter2
  (6, 1004, 1, '2026-03-10 08:00:00', '2026-03-12 18:00:00', 'COMPLETED', '2026-03-12 17:00:00', 12.50, 'SMU / Bras Basah'),

  -- ── Renter 3 (1005) — Scenario 3 damage claim demo ───────────────────────

  -- Rental 7: COMPLETED — renter3 rented and returned the DJI Drone Mini
  --           Owner (1002) notices broken propellers after return
  --           Owner logs in → My Rentals → Rented Out → File Claim on rental 7
  --           After claim approval, damage fee Stripe session is charged to renter3
  (7, 1005, 1, '2026-04-01 09:00:00', '2026-04-02 17:00:00', 'COMPLETED', '2026-04-02 16:45:00', 12.50, 'SMU / Bras Basah');
