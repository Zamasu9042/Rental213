-- Payment seed data
-- Creates the unpaid late fee row for rental 4 (renter 1001)
-- so that renter1 sees an outstanding payment immediately on login
-- without needing to manually trigger the flow first.
--
-- This matches rental 4 in rental-service seed-data.sql:
--   rental_id=4, renter_id=1001, 2hrs late @ $12.50/hr = $25.00
--
-- When renter1 clicks "Pay late fee" → LateFeePage calls POST /payment/outstanding
-- which checks for an existing UNPAID row (finds this one) and returns it directly,
-- then redirects to the Stripe checkout for this payment_id.

USE payment_db;

INSERT IGNORE INTO payment
  (id, rental_id, renter_id, amount, type, status, item_name, stripe_session_id, created_at, updated_at)
VALUES
  (1, 4, 1001, 25.00, 'late', 'unpaid', 'Late fee — rental #4', NULL, '2026-04-06 10:00:00', '2026-04-06 10:00:00');